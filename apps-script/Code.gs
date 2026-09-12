/*
  LA ROUE DU CSE - GOOGLE APPS SCRIPT
  ===================================

  Ce script doit être créé DIRECTEMENT depuis le Google Sheet :
  Extensions > Apps Script

  Puis :
  1. Modifier ADMIN_EMAIL ci-dessous.
  2. Exécuter setup() UNE FOIS.
  3. Déployer > Nouveau déploiement > Application Web.
  4. Exécuter en tant que : Moi.
  5. Qui a accès : Toute personne.
  6. Copier l'URL qui se termine par /exec.
  7. La coller dans js/config.js sur le site.
*/

const CONFIG = {
  DOMAIN: "lmhabitat.fr",

  // À MODIFIER :
  ADMIN_EMAIL: "REMPLACER_PAR_ADRESSE_GMAIL@gmail.com",

  /*
    Nombre approximatif de personnes susceptibles de participer.
    Le mode DISTRIBUTE ajuste automatiquement la probabilité pour
    essayer de répartir les lots sur les 720 participants.
  */
  TOTAL_ELIGIBLE: 720,

  /*
    DISTRIBUTE = probabilité dynamique selon lots/personnes restantes.
    FIXED      = utilise FIXED_WIN_RATE.
  */
  WIN_MODE: "DISTRIBUTE",
  FIXED_WIN_RATE: 0.05,

  SEND_LOGIN_EMAIL: true,
  SEND_WIN_EMAIL: true
};

const SHEETS = {
  PARTICIPANTS: "Participants",
  CONNECTIONS: "Connexions",
  PRIZES: "Lots"
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let participants = ss.getSheetByName(SHEETS.PARTICIPANTS);
  if (!participants) participants = ss.insertSheet(SHEETS.PARTICIPANTS);

  participants.clear();
  participants.getRange(1, 1, 1, 10).setValues([[
    "Email",
    "Première connexion",
    "Mail connexion envoyé",
    "A joué",
    "Date tirage",
    "Résultat",
    "Lot",
    "Quantité",
    "Validité",
    "Ticket"
  ]]);
  participants.setFrozenRows(1);

  let connections = ss.getSheetByName(SHEETS.CONNECTIONS);
  if (!connections) connections = ss.insertSheet(SHEETS.CONNECTIONS);

  connections.clear();
  connections.getRange(1, 1, 1, 4).setValues([[
    "Date",
    "Email",
    "Type",
    "Statut mail"
  ]]);
  connections.setFrozenRows(1);

  let prizes = ss.getSheetByName(SHEETS.PRIZES);
  if (!prizes) prizes = ss.insertSheet(SHEETS.PRIZES);

  prizes.clear();
  prizes.getRange(1, 1, 1, 9).setValues([[
    "ID",
    "Nom",
    "Validité",
    "Stock initial",
    "Stock restant",
    "Min par lot",
    "Max par lot",
    "Secteur",
    "Actif"
  ]]);

  prizes.getRange(2, 1, 7, 9).setValues([
    ["exalto", "Exalto", "Validité à préciser", 3, 3, 1, 1, "exalto", true],
    ["cgr26", "CGR", "Valable jusqu'au 26/12/2026", 6, 6, 2, 3, "cgr", true],
    ["cgr27", "CGR", "Valable jusqu'au 14/05/2027", 8, 8, 2, 3, "cgr", true],
    ["pathe26", "Pathé", "Valable jusqu'au 30/11/2026", 5, 5, 2, 3, "pathe", true],
    ["pathe27", "Pathé", "Valable jusqu'au 31/05/2027", 20, 20, 2, 3, "pathe", true],
    ["ugc", "UGC", "Valable jusqu'au 31/07/2027", 30, 30, 2, 3, "ugc", true],
    ["caliceo", "Caliceo", "Validité à préciser", 2, 2, 2, 2, "caliceo", true]
  ]);
  prizes.setFrozenRows(1);

  [participants, connections, prizes].forEach(sheet => {
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });

  SpreadsheetApp.flush();
}

function doGet(e) {
  const callback = safeCallback_(e && e.parameter ? e.parameter.callback : "");
  let result;

  try {
    const action = String(e.parameter.action || "").toLowerCase();

    if (action === "login") {
      result = login_(e.parameter.email);
    } else if (action === "spin") {
      result = spin_(e.parameter.email);
    } else if (action === "ping") {
      result = { ok: true, service: "CSE_ROUE", date: new Date().toISOString() };
    } else {
      result = { ok: false, code: "UNKNOWN_ACTION", message: "Action inconnue." };
    }
  } catch (error) {
    console.error(error);
    result = {
      ok: false,
      code: "SERVER_ERROR",
      message: "Erreur interne du service."
    };
  }

  const payload = callback + "(" + JSON.stringify(result) + ");";

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function login_(rawEmail) {
  const email = normalizeEmail_(rawEmail);

  if (!isAllowedEmail_(email)) {
    return {
      ok: false,
      code: "INVALID_EMAIL",
      message: "Veuillez utiliser une adresse @lmhabitat.fr."
    };
  }

  const sheet = sheet_(SHEETS.PARTICIPANTS);
  let row = findParticipantRow_(sheet, email);
  let played = false;
  let firstConnection = false;

  if (!row) {
    row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 10).setValues([[
      email,
      new Date(),
      false,
      false,
      "",
      "",
      "",
      "",
      "",
      ""
    ]]);
    firstConnection = true;
  } else {
    played = toBool_(sheet.getRange(row, 4).getValue());
  }

  let mailStatus = "NON_ENVOYÉ";

  /*
    Pour éviter qu'un simple rafraîchissement génère plusieurs e-mails,
    l'administratrice reçoit UN mail lors de la première connexion connue
    de cette adresse. Toutes les connexions sont néanmoins journalisées.
  */
  if (firstConnection && CONFIG.SEND_LOGIN_EMAIL) {
    mailStatus = sendLoginEmail_(email) ? "ENVOYÉ" : "ERREUR/QUOTA";
    sheet.getRange(row, 3).setValue(mailStatus === "ENVOYÉ");
  }

  sheet_(SHEETS.CONNECTIONS).appendRow([
    new Date(),
    email,
    firstConnection ? "PREMIÈRE CONNEXION" : "RECONNEXION",
    mailStatus
  ]);

  return {
    ok: true,
    played: played
  };
}

function spin_(rawEmail) {
  const email = normalizeEmail_(rawEmail);

  if (!isAllowedEmail_(email)) {
    return {
      ok: false,
      code: "INVALID_EMAIL",
      message: "Adresse e-mail non autorisée."
    };
  }

  /*
    Le verrou est essentiel :
    deux appels simultanés avec la même adresse ne peuvent pas obtenir
    deux résultats, et deux gagnants ne peuvent pas consommer le même stock.
  */
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  let response;

  try {
    const participants = sheet_(SHEETS.PARTICIPANTS);
    let row = findParticipantRow_(participants, email);

    if (!row) {
      // Tolérance : crée l'utilisateur si quelqu'un appelle spin directement.
      row = participants.getLastRow() + 1;
      participants.getRange(row, 1, 1, 10).setValues([[
        email,
        new Date(),
        false,
        false,
        "",
        "",
        "",
        "",
        "",
        ""
      ]]);
    }

    if (toBool_(participants.getRange(row, 4).getValue())) {
      return {
        ok: false,
        code: "ALREADY_PLAYED",
        message: "Cette adresse e-mail a déjà participé."
      };
    }

    const prizeSheet = sheet_(SHEETS.PRIZES);
    const prizes = readAvailablePrizes_(prizeSheet);

    const playedCount = countPlayed_(participants);
    const winProbability = computeWinProbability_(prizes, playedCount);
    const shouldWin = prizes.length > 0 && Math.random() < winProbability;

    if (!shouldWin) {
      const lossSectors = ["perdu1", "perdu2", "perdu3"];
      const sectorId = lossSectors[Math.floor(Math.random() * lossSectors.length)];

      participants.getRange(row, 4, 1, 7).setValues([[
        true,
        new Date(),
        "PERDU",
        "",
        "",
        "",
        ""
      ]]);

      response = {
        ok: true,
        result: "LOSE",
        sectorId: sectorId
      };

    } else {
      const chosen = weightedPrize_(prizes);
      const quantity = chooseQuantity_(chosen);

      /*
        Décrémentation du stock AVANT la réponse.
        Le verrou empêche les collisions.
      */
      const newStock = chosen.stock - quantity;
      prizeSheet.getRange(chosen.row, 5).setValue(newStock);

      const ticket = createTicket_();

      participants.getRange(row, 4, 1, 7).setValues([[
        true,
        new Date(),
        "GAGNÉ",
        chosen.name,
        quantity,
        chosen.validity,
        ticket
      ]]);

      response = {
        ok: true,
        result: "WIN",
        sectorId: chosen.sectorId,
        prize: chosen.name,
        quantity: quantity,
        validity: chosen.validity,
        ticket: ticket
      };
    }

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }

  /*
    L'envoi du mail est fait après l'écriture du résultat.
    Si Gmail rencontre un problème ou un quota, le tirage reste enregistré.
  */
  if (response && response.result === "WIN" && CONFIG.SEND_WIN_EMAIL) {
    sendWinEmail_(email, response);
  }

  return response;
}

function readAvailablePrizes_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const result = [];

  values.forEach((r, index) => {
    const stock = Number(r[4]) || 0;
    const min = Number(r[5]) || 1;
    const enabled = toBool_(r[8]);

    if (enabled && stock >= min) {
      result.push({
        row: index + 2,
        id: String(r[0]),
        name: String(r[1]),
        validity: String(r[2]),
        initialStock: Number(r[3]) || 0,
        stock: stock,
        min: min,
        max: Number(r[6]) || min,
        sectorId: String(r[7])
      });
    }
  });

  return result;
}

function weightedPrize_(prizes) {
  const pool = [];

  prizes.forEach(prize => {
    /*
      Le stock restant sert de poids.
      UGC (30 places) sera donc naturellement plus fréquent
      qu'un lot qui n'a plus que 2 places disponibles.
    */
    const weight = Math.max(1, prize.stock);
    for (let i = 0; i < weight; i++) {
      pool.push(prize);
    }
  });

  return pool[Math.floor(Math.random() * pool.length)];
}

function chooseQuantity_(prize) {
  if (prize.max <= prize.min || prize.stock < prize.max) {
    return prize.min;
  }

  // Favorise 2 places plutôt que 3 pour mieux répartir les lots.
  return Math.random() < 0.72 ? prize.min : prize.max;
}

function computeWinProbability_(prizes, playedCount) {
  if (CONFIG.WIN_MODE === "FIXED") {
    return clamp_(Number(CONFIG.FIXED_WIN_RATE) || 0, 0, 1);
  }

  /*
    Nombre maximum approximatif de gagnants encore possibles
    en utilisant la quantité minimale de chaque lot.
  */
  let bundlesRemaining = 0;

  prizes.forEach(prize => {
    bundlesRemaining += Math.floor(prize.stock / prize.min);
  });

  const peopleRemaining = Math.max(
    1,
    Number(CONFIG.TOTAL_ELIGIBLE || 720) - playedCount
  );

  /*
    Exemple au début :
    ~38 lots possibles / 720 personnes ≈ 5,3 %.

    La probabilité se recalcule après chaque participation.
    Si les lots prennent du retard, elle augmente progressivement.
  */
  return clamp_(bundlesRemaining / peopleRemaining, 0, 1);
}

function countPlayed_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  return values.reduce((count, r) => count + (toBool_(r[0]) ? 1 : 0), 0);
}

function findParticipantRow_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const finder = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(email)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();

  return finder ? finder.getRow() : 0;
}

function sendLoginEmail_(email) {
  if (!validAdminEmail_()) return false;

  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: "Connexion — La Roue du CSE",
      htmlBody:
        "<p>Un participant vient d'accéder à la Roue du CSE.</p>" +
        "<p><b>Adresse :</b> " + html_(email) + "</p>" +
        "<p><b>Date :</b> " + html_(formatDate_(new Date())) + "</p>"
    });
    return true;
  } catch (error) {
    console.error("Mail connexion:", error);
    return false;
  }
}

function sendWinEmail_(email, result) {
  if (!validAdminEmail_()) return false;

  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: "🎉 Ticket gagnant — " + result.ticket,
      htmlBody:
        "<h2>Nouveau gagnant — Roue du CSE</h2>" +
        "<p><b>Participant :</b> " + html_(email) + "</p>" +
        "<p><b>Lot :</b> " + html_(result.quantity + " place(s) " + result.prize) + "</p>" +
        "<p><b>Validité :</b> " + html_(result.validity) + "</p>" +
        "<p><b>Ticket :</b> " + html_(result.ticket) + "</p>" +
        "<p><b>Date :</b> " + html_(formatDate_(new Date())) + "</p>"
    });
    return true;
  } catch (error) {
    console.error("Mail gagnant:", error);
    return false;
  }
}

function validAdminEmail_() {
  return CONFIG.ADMIN_EMAIL &&
    CONFIG.ADMIN_EMAIL.indexOf("REMPLACER_PAR") === -1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CONFIG.ADMIN_EMAIL);
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function isAllowedEmail_(email) {
  const escaped = CONFIG.DOMAIN.replace(".", "\\.");
  return new RegExp("^[^\\s@]+@" + escaped + "$", "i").test(email);
}

function safeCallback_(value) {
  const callback = String(value || "");
  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)
    ? callback
    : "cseCallback";
}

function createTicket_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";

  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return "CSE-2026-" + random;
}

function formatDate_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm:ss"
  );
}

function toBool_(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function clamp_(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error(
      "La feuille '" + name + "' est absente. Lancez setup() une fois."
    );
  }
  return sheet;
}

function html_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
