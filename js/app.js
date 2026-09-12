(() => {
  "use strict";

  const CONFIG = window.CSE_CONFIG || {};
  const DOMAIN = "lmhabitat.fr";

  /*
    IMPORTANT :
    - Les secteurs sont dessinés à partir de CE tableau.
    - Le serveur renvoie un sectorId provenant de CE même référentiel.
    - L'animation cible le centre mathématique du secteur.
    Il n'existe donc plus de calcul séparé "visuel" / "résultat".
  */
  const SECTORS = [
    { id:"ugc",     label:"UGC",     red:false },
    { id:"perdu1",  label:"PERDU",   red:true  },
    { id:"cgr",     label:"CGR",     red:false },
    { id:"perdu2",  label:"PERDU",   red:true  },
    { id:"pathe",   label:"PATHÉ",   red:false },
    { id:"caliceo", label:"CALICEO", red:true  },
    { id:"perdu3",  label:"PERDU",   red:false },
    { id:"exalto",  label:"EXALTO",  red:true  }
  ];

  const DEMO_PLAYED_KEY = "cse_v6_demo_played";
  const DEMO_STOCK_KEY = "cse_v6_demo_stock";

  const DEMO_PRIZES = [
    { id:"exalto", name:"Exalto", validity:"Validité à préciser", stock:3, min:1, max:1, sectorId:"exalto" },
    { id:"cgr26", name:"CGR", validity:"Valable jusqu'au 26/12/2026", stock:6, min:2, max:3, sectorId:"cgr" },
    { id:"cgr27", name:"CGR", validity:"Valable jusqu'au 14/05/2027", stock:8, min:2, max:3, sectorId:"cgr" },
    { id:"pathe26", name:"Pathé", validity:"Valable jusqu'au 30/11/2026", stock:5, min:2, max:3, sectorId:"pathe" },
    { id:"pathe27", name:"Pathé", validity:"Valable jusqu'au 31/05/2027", stock:20, min:2, max:3, sectorId:"pathe" },
    { id:"ugc", name:"UGC", validity:"Valable jusqu'au 31/07/2027", stock:30, min:2, max:3, sectorId:"ugc" },
    { id:"caliceo", name:"Caliceo", validity:"Validité à préciser", stock:2, min:2, max:2, sectorId:"caliceo" }
  ];

  let currentEmail = "";
  let played = false;
  let spinning = false;
  let wheelRotation = 0;

  const $ = id => document.getElementById(id);

  function init() {
    drawWheel();

    if (CONFIG.DEMO_MODE || !CONFIG.APPS_SCRIPT_URL) {
      $("demoNotice").classList.remove("hidden");
    }

    $("loginForm").addEventListener("submit", onLogin);
    $("spinButton").addEventListener("click", onSpin);
    $("closeResult").addEventListener("click", closeResult);

    window.addEventListener("resize", drawWheel);
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isAllowedEmail(email) {
    return /^[^\s@]+@lmhabitat\.fr$/i.test(email);
  }

  async function onLogin(event) {
    event.preventDefault();

    const email = normalizeEmail($("email").value);
    const button = $("loginButton");
    const message = $("loginMessage");

    message.textContent = "";

    if (!isAllowedEmail(email)) {
      message.textContent = "Veuillez utiliser une adresse se terminant par @lmhabitat.fr.";
      return;
    }

    button.disabled = true;
    button.textContent = "CONNEXION...";

    try {
      const response = await api("login", { email });

      if (!response.ok) {
        throw new Error(response.message || "Connexion impossible.");
      }

      currentEmail = email;
      played = Boolean(response.played);

      $("participantEmail").textContent = email;
      $("loginScreen").classList.add("hidden");
      $("gameScreen").classList.remove("hidden");

      updateParticipationState();

    } catch (error) {
      message.textContent = error.message || "Une erreur est survenue.";
    } finally {
      button.disabled = false;
      button.textContent = "ACCÉDER À LA ROUE";
    }
  }

  function updateParticipationState() {
    const badge = $("participationBadge");
    const button = $("spinButton");
    const message = $("gameMessage");

    if (played) {
      badge.textContent = "DÉJÀ JOUÉ";
      badge.classList.add("done");
      button.disabled = true;
      message.textContent = "Cette adresse e-mail a déjà utilisé son unique participation.";
    } else {
      badge.textContent = "1 CHANCE";
      badge.classList.remove("done");
      button.disabled = spinning;
      message.textContent = "Vous disposez d'un seul tirage.";
    }
  }

  async function onSpin() {
    if (spinning || played || !currentEmail) return;

    spinning = true;
    $("spinButton").disabled = true;
    $("gameMessage").textContent = "Tirage en cours...";

    try {
      /*
        Le résultat est demandé AVANT l'animation.
        En production, Google Apps Script :
        - vérifie que l'adresse n'a jamais joué ;
        - choisit le résultat ;
        - réserve le lot ;
        - marque la participation comme utilisée ;
        - renvoie le sectorId exact.
      */
      const result = await api("spin", { email: currentEmail });

      if (!result.ok) {
        if (result.code === "ALREADY_PLAYED") {
          played = true;
          updateParticipationState();
        }
        throw new Error(result.message || "Tirage impossible.");
      }

      const sector = SECTORS.find(s => s.id === result.sectorId);

      if (!sector) {
        throw new Error("Le serveur a renvoyé un secteur inconnu.");
      }

      played = true;

      await animateToSector(result.sectorId);
      showResult(result);
      updateParticipationState();

    } catch (error) {
      $("gameMessage").textContent = error.message || "Une erreur est survenue.";
    } finally {
      spinning = false;
      updateParticipationState();
    }
  }

  /*
    GÉOMÉTRIE DE LA ROUE
    --------------------
    Le centre du secteur 0 est exactement sous la flèche au démarrage.

    Les secteurs sont espacés de 45°.
    Pour placer le secteur i sous la flèche :
        rotation finale modulo 360 = -(i * 45°)

    On ajoute plusieurs tours complets uniquement pour l'animation.
  */
  function animateToSector(sectorId) {
    return new Promise(resolve => {
      const index = SECTORS.findIndex(s => s.id === sectorId);

      if (index < 0) {
        resolve();
        return;
      }

      const step = 360 / SECTORS.length;
      const desiredModulo = ((-index * step) % 360 + 360) % 360;
      const currentModulo = ((wheelRotation % 360) + 360) % 360;
      const correction = (desiredModulo - currentModulo + 360) % 360;

      wheelRotation += (360 * 6) + correction;

      const wheel = $("wheel");
      wheel.style.transform = `rotate(${wheelRotation}deg)`;

      const done = () => {
        wheel.removeEventListener("transitionend", done);
        resolve();
      };

      wheel.addEventListener("transitionend", done);
      setTimeout(done, 5600);
    });
  }

  function drawWheel() {
    const canvas = $("wheelCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    const count = SECTORS.length;
    const step = (Math.PI * 2) / count;

    ctx.clearRect(0, 0, size, size);

    SECTORS.forEach((sector, i) => {
      /*
        Le centre du secteur 0 est à -90° (haut).
        Chaque arc va de centre-22,5° à centre+22,5°.
      */
      const center = -Math.PI / 2 + i * step;
      const start = center - step / 2;
      const end = center + step / 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();

      ctx.fillStyle = sector.red ? "#e71920" : (i % 4 === 2 ? "#f0f0f0" : "#ffffff");
      ctx.fill();

      ctx.lineWidth = 5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Texte horizontal, gros et très contrasté.
      const textRadius = radius * 0.72;
      const tx = cx + Math.cos(center) * textRadius;
      const ty = cy + Math.sin(center) * textRadius;

      ctx.save();
      ctx.translate(tx, ty);

      const fontSize =
        sector.label === "CALICEO" ? 42 :
        sector.label === "EXALTO" ? 46 :
        sector.label === "PERDU" ? 50 : 58;

      ctx.font = `900 ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";

      // Contour pour conserver la lisibilité sur tous les fonds.
      ctx.lineWidth = 10;
      ctx.strokeStyle = sector.red ? "rgba(130,0,5,.28)" : "rgba(255,255,255,.95)";
      ctx.strokeText(sector.label, 0, 0);

      ctx.fillStyle = sector.red ? "#ffffff" : "#d9151c";
      ctx.fillText(sector.label, 0, 0);
      ctx.restore();
    });
  }

  function showResult(result) {
    const win = result.result === "WIN";

    $("resultBadge").textContent = win ? "TICKET GAGNANT" : "RÉSULTAT";
    $("resultIcon").textContent = win ? "🎉" : "😅";
    $("resultTitle").textContent = win ? "FÉLICITATIONS !" : "PERDU";
    $("resultLead").textContent = win
      ? "La roue s'est arrêtée sur un lot gagnant."
      : "La roue s'est arrêtée sur PERDU.";

    if (win) {
      $("ticket").classList.remove("hidden");
      $("ticketPrize").textContent =
        `${result.quantity} ${result.quantity > 1 ? "PLACES" : "PLACE"} ${result.prize.toUpperCase()}`;
      $("ticketValidity").textContent = result.validity || "";
      $("ticketCode").textContent = result.ticket || "";
      $("resultInfo").textContent =
        "Le ticket gagnant a été enregistré et transmis à l'administratrice.";
      createConfetti();
    } else {
      $("ticket").classList.add("hidden");
      $("resultInfo").textContent =
        "Votre participation est maintenant terminée. Merci d'avoir joué !";
    }

    $("resultOverlay").classList.add("open");
    $("resultOverlay").setAttribute("aria-hidden", "false");
  }

  function closeResult() {
    $("resultOverlay").classList.remove("open");
    $("resultOverlay").setAttribute("aria-hidden", "true");
    $("confetti").innerHTML = "";
  }

  function createConfetti() {
    const holder = $("confetti");
    holder.innerHTML = "";
    const colors = ["#e71920","#ffffff","#ffb4b7","#ffd35c"];

    for (let i = 0; i < 70; i++) {
      const el = document.createElement("i");
      el.className = "confetti-piece";
      el.style.left = `${Math.random()*100}%`;
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = `${2.2 + Math.random()*2}s`;
      el.style.animationDelay = `${Math.random()*.55}s`;
      holder.appendChild(el);
    }
  }

  async function api(action, params) {
    if (CONFIG.DEMO_MODE || !CONFIG.APPS_SCRIPT_URL) {
      return demoApi(action, params);
    }

    return jsonpRequest(CONFIG.APPS_SCRIPT_URL, {
      action,
      ...params
    });
  }

  /*
    Apps Script est appelé en JSONP.
    Cela évite les problèmes CORS de GitHub Pages -> script.google.com
    tout en permettant de lire la réponse du script.
  */
  function jsonpRequest(url, params) {
    return new Promise((resolve, reject) => {
      const callbackName =
        "__cseCallback_" + Date.now() + "_" + Math.floor(Math.random()*100000);

      const query = new URLSearchParams({
        ...params,
        callback: callbackName,
        _: Date.now().toString()
      });

      const script = document.createElement("script");
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Le service Google ne répond pas."));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = data => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible de joindre Google Apps Script."));
      };

      script.src = `${url}?${query.toString()}`;
      document.body.appendChild(script);
    });
  }

  // -------------------------------
  // MODE DÉMO LOCAL
  // -------------------------------

  function demoPlayedMap() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_PLAYED_KEY)) || {};
    } catch {
      return {};
    }
  }

  function getDemoStock() {
    try {
      const stored = JSON.parse(localStorage.getItem(DEMO_STOCK_KEY));
      if (Array.isArray(stored)) return stored;
    } catch {}

    const fresh = DEMO_PRIZES.map(p => ({...p}));
    localStorage.setItem(DEMO_STOCK_KEY, JSON.stringify(fresh));
    return fresh;
  }

  function saveDemoStock(stock) {
    localStorage.setItem(DEMO_STOCK_KEY, JSON.stringify(stock));
  }

  async function demoApi(action, params) {
    await new Promise(r => setTimeout(r, 300));

    const email = normalizeEmail(params.email);
    if (!isAllowedEmail(email)) {
      return { ok:false, message:"Adresse e-mail non autorisée." };
    }

    const playedMap = demoPlayedMap();

    if (action === "login") {
      return {
        ok:true,
        played:Boolean(playedMap[email]),
        demo:true
      };
    }

    if (action === "spin") {
      if (playedMap[email]) {
        return {
          ok:false,
          code:"ALREADY_PLAYED",
          message:"Cette adresse e-mail a déjà participé."
        };
      }

      playedMap[email] = true;
      localStorage.setItem(DEMO_PLAYED_KEY, JSON.stringify(playedMap));

      const stock = getDemoStock();
      const available = stock.filter(p => p.stock >= p.min);

      // Démo : 20 % de chances pour faciliter les tests.
      const win = available.length && Math.random() < .20;

      if (!win) {
        const losses = ["perdu1","perdu2","perdu3"];
        return {
          ok:true,
          result:"LOSE",
          sectorId:losses[Math.floor(Math.random()*losses.length)]
        };
      }

      const prize = available[Math.floor(Math.random()*available.length)];
      let quantity = prize.min;

      if (prize.max > prize.min && prize.stock >= prize.max) {
        quantity = Math.random() < .72 ? prize.min : prize.max;
      }

      prize.stock -= quantity;
      saveDemoStock(stock);

      return {
        ok:true,
        result:"WIN",
        sectorId:prize.sectorId,
        prize:prize.name,
        quantity,
        validity:prize.validity,
        ticket:"CSE-DEMO-" + Math.random().toString(36).slice(2,8).toUpperCase()
      };
    }

    return { ok:false, message:"Action inconnue." };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
