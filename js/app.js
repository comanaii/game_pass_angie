const CSEApp = (() => {
  const MAX_DRAWS = 3;

  const STOCK_KEY = "cse_v5_stock";
  const SESSION_KEY = "cse_v5_session";
  const FORCE_WIN_KEY = "cse_v5_force_win";

  const INITIAL_PRIZES = [
    { id:"exalto", name:"Exalto", validity:"Validité à préciser", initialStock:3, quantities:[1] },
    { id:"cgr26", name:"CGR", validity:"Valable jusqu'au 26/12/2026", initialStock:6, quantities:[2,3] },
    { id:"cgr27", name:"CGR", validity:"Valable jusqu'au 14/05/2027", initialStock:8, quantities:[2,3] },
    { id:"pathe26", name:"Pathé", validity:"Valable jusqu'au 30/11/2026", initialStock:5, quantities:[2,3] },
    { id:"pathe27", name:"Pathé", validity:"Valable jusqu'au 31/05/2027", initialStock:20, quantities:[2,3] },
    { id:"ugc", name:"UGC", validity:"Valable jusqu'au 31/07/2027", initialStock:30, quantities:[2,3] },
    { id:"caliceo", name:"Caliceo", validity:"Validité à préciser", initialStock:2, quantities:[2] }
  ];

  let stockState = null;
  let session = null;
  let pendingEmail = "";
  let rotation = 0;
  let spinning = false;
  let lastTicket = null;

  function freshStock() {
    return {
      sequence: 0,
      closed: false,
      prizes: INITIAL_PRIZES.map(p => ({
        ...p,
        stock: p.initialStock
      }))
    };
  }

  function loadStock() {
    try {
      stockState = JSON.parse(localStorage.getItem(STOCK_KEY));
      if (!stockState || !Array.isArray(stockState.prizes)) throw new Error();
    } catch {
      stockState = freshStock();
      saveStock();
    }
  }

  function saveStock() {
    localStorage.setItem(STOCK_KEY, JSON.stringify(stockState));
  }

  function loadSession() {
    try {
      session = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!session || !session.email) session = null;
    } catch {
      session = null;
    }
  }

  function saveSession() {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  function totalStock() {
    return stockState.prizes.reduce((sum, p) => sum + p.stock, 0);
  }

  function drawsUsed() {
    return session ? session.drawsUsed || 0 : 0;
  }

  function drawsRemaining() {
    return Math.max(0, MAX_DRAWS - drawsUsed());
  }

  function gameClosedForUser() {
    return !session ||
      drawsUsed() >= MAX_DRAWS ||
      stockState.closed ||
      totalStock() <= 0;
  }

  function renderScreens() {
    const auth = document.getElementById("authScreen");
    const game = document.getElementById("gameScreen");

    if (session) {
      auth.classList.add("hidden");
      game.classList.remove("hidden");
      document.getElementById("userEmail").textContent = session.email;
      renderGame();
    } else {
      auth.classList.remove("hidden");
      game.classList.add("hidden");
    }
  }

  function renderGame() {
    const used = drawsUsed();
    const remaining = drawsRemaining();
    const stock = totalStock();

    document.getElementById("drawCount").textContent = `${used} / ${MAX_DRAWS}`;
    document.getElementById("drawRemaining").textContent = remaining;
    document.getElementById("stockRemaining").textContent = stock;

    const dots = [...document.querySelectorAll("#drawDots i")];
    dots.forEach((dot, index) => {
      dot.classList.toggle("used", index < used);
    });

    const closed = gameClosedForUser();
    const status = document.getElementById("gameStatus");
    const button = document.getElementById("spinButton");
    const message = document.getElementById("spinMessage");

    if (used >= MAX_DRAWS) {
      status.textContent = "TERMINÉ";
      message.textContent = "Vous avez utilisé vos 3 tirages. Merci pour votre participation.";
    } else if (stock <= 0) {
      status.textContent = "ÉPUISÉ";
      message.textContent = "Tous les lots ont été remportés.";
    } else if (stockState.closed) {
      status.textContent = "FERMÉ";
      message.textContent = "Le jeu est actuellement fermé.";
    } else {
      status.textContent = "OUVERT";

      if (session && session.hasWon) {
        message.textContent =
          `Vous avez déjà remporté votre lot. Il vous reste ${remaining} tirage${remaining > 1 ? "s" : ""}, sans nouveau gain possible.`;
      } else {
        message.textContent =
          `Il vous reste ${remaining} tirage${remaining > 1 ? "s" : ""}. 1 lot maximum par participant.`;
      }
    }

    button.disabled = closed || spinning;

    document.getElementById("prizeGrid").innerHTML =
      stockState.prizes.map(p => `
        <div class="prize-row">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <small>${escapeHtml(p.validity)}</small>
          </div>
          <div class="stock">
            <b>${p.stock}</b>
            <small>/ ${p.initialStock}</small>
          </div>
        </div>
      `).join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function requestOtp(event) {
    event.preventDefault();

    const input = document.getElementById("emailInput");
    const email = input.value.trim().toLowerCase();
    const message = document.getElementById("authMessage");

    if (!email || !email.includes("@")) {
      message.textContent = "Veuillez saisir une adresse e-mail valide.";
      return;
    }

    pendingEmail = email;

    // MAQUETTE :
    // la version serveur répondra toujours avec un message générique
    // afin d'éviter l'énumération des utilisateurs autorisés.
    document.getElementById("otpBlock").classList.remove("hidden");
    message.textContent = "Si cette adresse est autorisée, un code vient d'être envoyé.";
  }

  function verifyOtp(event) {
    event.preventDefault();

    const code = document.getElementById("otpInput").value.trim();
    const message = document.getElementById("authMessage");

    if (code !== "123456") {
      message.textContent = "Code incorrect pour cette démonstration.";
      return;
    }

    if (!pendingEmail) {
      message.textContent = "Veuillez d'abord saisir votre adresse e-mail.";
      return;
    }

    // Chaque e-mail possède sa propre progression locale dans la maquette.
    const userKey = userStorageKey(pendingEmail);
    let storedUser = null;

    try {
      storedUser = JSON.parse(localStorage.getItem(userKey));
    } catch {}

    session = storedUser || {
      email: pendingEmail,
      drawsUsed: 0,
      hasWon: false
    };

    // Compatibilité avec les utilisateurs déjà créés dans la V5.
    if (typeof session.hasWon !== "boolean") {
      session.hasWon = false;
    }

    localStorage.setItem(userKey, JSON.stringify(session));
    saveSession();

    pendingEmail = "";
    document.getElementById("otpInput").value = "";
    message.textContent = "";

    renderScreens();
  }

  function userStorageKey(email) {
    return "cse_v5_user_" + btoa(unescape(encodeURIComponent(email))).replaceAll("=","");
  }

  function persistCurrentUser() {
    if (!session) return;
    localStorage.setItem(userStorageKey(session.email), JSON.stringify(session));
    saveSession();
  }

  function logout() {
    session = null;
    saveSession();
    renderScreens();
  }

  function availableOptions() {
    return stockState.prizes
      .map((prize, index) => ({
        prize,
        index,
        quantities: prize.quantities.filter(q => q <= prize.stock)
      }))
      .filter(item => item.quantities.length > 0);
  }

  function decideOutcome() {
    const options = availableOptions();

    if (!options.length) return { type:"closed" };

    const forced = localStorage.getItem(FORCE_WIN_KEY) === "1";
    if (forced) localStorage.removeItem(FORCE_WIN_KEY);

    // RÈGLE CSE :
    // un participant peut effectuer jusqu'à 3 tirages,
    // mais ne peut remporter qu'un seul lot au total.
    if (session && session.hasWon) {
      return { type:"lose", reason:"already_won" };
    }

    // Démo uniquement.
    const win = forced || Math.random() < 0.32;
    if (!win) return { type:"lose" };

    const weighted = [];
    options.forEach(item => {
      for (let i = 0; i < item.prize.stock; i++) weighted.push(item);
    });

    const selected = weighted[Math.floor(Math.random() * weighted.length)];

    let quantity;
    if (selected.quantities.length === 1) {
      quantity = selected.quantities[0];
    } else {
      quantity = Math.random() < 0.72
        ? selected.quantities[0]
        : selected.quantities[selected.quantities.length - 1];
    }

    return {
      type:"win",
      prizeIndex:selected.index,
      quantity
    };
  }

  function targetAngle(outcome) {
    if (outcome.type === "lose") {
      return Math.random() < .5 ? 67.5 : 202.5;
    }

    const prize = stockState.prizes[outcome.prizeIndex];

    const map = {
      ugc:22.5,
      cgr26:112.5,
      cgr27:112.5,
      pathe26:157.5,
      pathe27:157.5,
      caliceo:247.5,
      exalto:292.5
    };

    return map[prize.id] ?? 337.5;
  }

  function spin() {
    if (spinning || gameClosedForUser()) return;

    spinning = true;
    renderGame();

    const outcome = decideOutcome();
    const target = targetAngle(outcome);

    rotation += 2160 + (360 - target);
    document.getElementById("wheel").style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
      // Un clic valide toujours un tirage, gagné ou perdu.
      session.drawsUsed += 1;
      persistCurrentUser();

      if (outcome.type === "win") {
        const ticket = consumePrize(outcome);
        if (ticket) {
          showWin(ticket);
        } else {
          showLose();
        }
      } else if (outcome.type === "closed") {
        showClosed();
      } else {
        showLose();
      }

      spinning = false;
      renderGame();
    }, 5100);
  }

  function consumePrize(outcome) {
    const prize = stockState.prizes[outcome.prizeIndex];
    if (!prize || prize.stock < outcome.quantity) return null;

    prize.stock -= outcome.quantity;
    stockState.sequence += 1;

    if (totalStock() === 0) {
      stockState.closed = true;
    }

    saveStock();

    session.hasWon = true;
    persistCurrentUser();

    lastTicket = {
      id:`CSE-2026-${String(stockState.sequence).padStart(4,"0")}`,
      quantity:outcome.quantity,
      name:prize.name,
      validity:prize.validity,
      email:session.email
    };

    return lastTicket;
  }

  function showWin(ticket) {
    document.getElementById("resultBadge").textContent = "TICKET GAGNANT";
    document.getElementById("resultIcon").textContent = "🎉";
    document.getElementById("resultTitle").textContent = "FÉLICITATIONS !";
    document.getElementById("resultLead").textContent =
      "La roue du CSE vient de vous attribuer un lot.";

    document.getElementById("ticketPrize").textContent =
      `${ticket.quantity} ${ticket.quantity > 1 ? "PLACES" : "PLACE"} ${ticket.name.toUpperCase()}`;

    document.getElementById("ticketValidity").textContent = ticket.validity;
    document.getElementById("ticketId").textContent = ticket.id;

    document.getElementById("ticketPanel").classList.remove("hidden");
    document.getElementById("emailTicketButton").classList.remove("hidden");

    document.getElementById("resultText").textContent =
      `Tirages restants : ${drawsRemaining()}.`;

    openOverlay();
    createConfetti();
  }

  function showLose() {
    document.getElementById("resultBadge").textContent = "RÉSULTAT";
    document.getElementById("resultIcon").textContent = "🎬";
    document.getElementById("resultTitle").textContent = "PAS CETTE FOIS";
    document.getElementById("resultLead").textContent =
      "La roue ne s'est pas arrêtée sur un lot gagnant.";

    document.getElementById("ticketPanel").classList.add("hidden");
    document.getElementById("emailTicketButton").classList.add("hidden");

    document.getElementById("resultText").textContent =
      drawsRemaining() > 0
        ? `Il vous reste ${drawsRemaining()} tirage${drawsRemaining() > 1 ? "s" : ""}.`
        : "Vous avez utilisé vos 3 tirages.";

    openOverlay();
  }

  function showClosed() {
    document.getElementById("resultBadge").textContent = "JEU TERMINÉ";
    document.getElementById("resultIcon").textContent = "🏁";
    document.getElementById("resultTitle").textContent = "PLUS AUCUN LOT";
    document.getElementById("resultLead").textContent =
      "Tous les lots ont déjà été remportés.";

    document.getElementById("ticketPanel").classList.add("hidden");
    document.getElementById("emailTicketButton").classList.add("hidden");
    document.getElementById("resultText").textContent = "Merci pour votre participation.";

    openOverlay();
  }

  function openOverlay() {
    const overlay = document.getElementById("resultOverlay");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden","false");
  }

  function closeOverlay() {
    const overlay = document.getElementById("resultOverlay");
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden","true");
    document.getElementById("confetti").innerHTML = "";
  }

  function createConfetti() {
    const holder = document.getElementById("confetti");
    holder.innerHTML = "";

    const colors = ["#e71920","#ffffff","#ffb4b7","#ffd45b"];

    for (let i = 0; i < 70; i++) {
      const el = document.createElement("i");
      el.className = "confetti-piece";
      el.style.left = `${Math.random()*100}%`;
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = `${2.2 + Math.random()*2}s`;
      el.style.animationDelay = `${Math.random()*.6}s`;
      holder.appendChild(el);
    }
  }

  function demoEmailTicket() {
    if (!lastTicket) return;

    alert(
      "MODE DÉMO\n\n" +
      "Dans la version finale, le serveur enverra automatiquement ce ticket :\n\n" +
      lastTicket.id + "\n" +
      lastTicket.quantity + " place(s) " + lastTicket.name + "\n" +
      lastTicket.validity + "\n\n" +
      "Participant : " + lastTicket.email
    );
  }

  function resetCurrentUser() {
    if (!session) return;

    session.drawsUsed = 0;
    session.hasWon = false;
    persistCurrentUser();
    renderGame();

    const btn = document.getElementById("resetUserButton");
    btn.textContent = "✓ TIRAGES RÉINITIALISÉS";

    setTimeout(() => {
      btn.textContent = "RESET MES 3 TIRAGES";
    }, 1400);
  }

  function resetStock() {
    stockState = freshStock();
    saveStock();
    renderGame();

    const btn = document.getElementById("resetStockButton");
    btn.textContent = "✓ STOCK RÉINITIALISÉ";

    setTimeout(() => {
      btn.textContent = "RESET STOCK";
    }, 1400);
  }

  function forceWin() {
    const btn = document.getElementById("forceWinButton");

    if (session && session.hasWon) {
      btn.textContent = "DÉJÀ 1 LOT GAGNÉ";
      setTimeout(() => {
        btn.textContent = "FORCER UN GAIN";
      }, 1400);
      return;
    }

    localStorage.setItem(FORCE_WIN_KEY,"1");
    btn.textContent = "✓ PROCHAIN TOUR GAGNANT";

    setTimeout(() => {
      btn.textContent = "FORCER UN GAIN";
    }, 1400);
  }

  function init() {
    loadStock();
    loadSession();
    renderScreens();

    document.getElementById("emailForm").addEventListener("submit", requestOtp);
    document.getElementById("otpForm").addEventListener("submit", verifyOtp);
    document.getElementById("logoutButton").addEventListener("click", logout);
    document.getElementById("spinButton").addEventListener("click", spin);
    document.getElementById("closeResultButton").addEventListener("click", closeOverlay);
    document.getElementById("emailTicketButton").addEventListener("click", demoEmailTicket);
    document.getElementById("forceWinButton").addEventListener("click", forceWin);
    document.getElementById("resetUserButton").addEventListener("click", resetCurrentUser);
    document.getElementById("resetStockButton").addEventListener("click", resetStock);
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", CSEApp.init);
