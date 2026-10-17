// damirtrade: Panel in der EA FC Web App. Liest Antworten der Web App mit
// (Suche, Kauf, Transferliste) und zeigt Treffer, Statistik und Trades.
// Schickt selbst keine Anfragen an EA und kauft oder verkauft nie selbst.
(function () {
  "use strict";

  const DT = window.DT_CORE;
  const FUT = window.FUT;
  const STORAGE_KEY = "damirtrade.v1";
  const MARKET_MAX_AGE = 30 * 60000;
  const fmt = new Intl.NumberFormat("de-DE");

  // ---------- Zustand ----------

  const DEFAULT_SETTINGS = {
    minProfitValue: 500,
    minProfitUnit: "coins",
    useMarketPrice: true,
    listProfile: { mode: "margin", value: 500 },
    budget: 0,
    buyLimit: 0,
    stopAfterMinutes: 0,
    breakEvery: 0,
    sound: true,
  };

  function newSession() {
    return { startedAt: Date.now(), searches: 0, hits: 0, buys: 0, spent: 0, profit: 0 };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
        targets: Array.isArray(data.targets) ? data.targets : [],
        trades: Array.isArray(data.trades) ? data.trades : [],
        market: data.market || {},
        session: data.session || newSession(),
        coins: data.coins || null,
      };
    } catch (e) {
      return { settings: { ...DEFAULT_SETTINGS }, targets: [], trades: [], market: {}, session: newSession(), coins: null };
    }
  }

  const state = load();
  const live = { results: [], notices: [], unseenHits: 0, tab: "live", open: false };

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings: state.settings,
        targets: state.targets,
        trades: state.trades,
        market: state.market,
        session: state.session,
        coins: state.coins,
      }));
    } catch (e) {
      // Ohne localStorage gilt der Stand nur bis zum Neuladen.
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Mitlesen ----------

  // Spielername über die Web App selbst, sonst "Spieler <id> (<Wertung>)".
  function nameOf(item) {
    try {
      const entity = window.factories && window.factories.Item && window.factories.Item.createItem(item);
      const name = entity && entity._staticData && entity._staticData.name;
      if (name) return item.rating ? `${name} (${item.rating})` : name;
    } catch (e) {
      // Fällt auf die Kennung zurück.
    }
    return `Spieler ${item.assetId}${item.rating ? " (" + item.rating + ")" : ""}`;
  }

  function marketPriceFor(auction) {
    const entry = state.market[`${auction.assetId}:${auction.rating || 0}`];
    return entry && Date.now() - entry.t < MARKET_MAX_AGE ? entry.price : null;
  }

  function handleResponse(kind, status, requestBody, json) {
    const error = DT.classifyError(status);
    if (error) return handleError(error);
    if (status < 200 || status >= 300 || !json) return;

    const coins = DT.coinsOf(json);
    if (coins != null) state.coins = coins;

    if (kind === "search") handleSearch(json);
    else if (kind === "bid") handleBid(requestBody, json);
    else if (kind === "tradepile") handleTradepile(json);
    save();
    render();
  }

  function handleSearch(json) {
    const auctions = DT.parseAuctions(json, nameOf);
    state.session.searches += 1;

    // Bewertet wird gegen Preise aus früheren Suchen, erst danach kommt diese Suche dazu.
    live.results = auctions
      .map((a) => ({ ...a, ...DT.evaluate(a, state.targets, marketPriceFor(a), state.settings) }))
      .sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));

    const now = Date.now();
    for (const [key, price] of Object.entries(DT.lowestPrices(auctions))) {
      state.market[key] = { price, t: now };
    }

    const hits = live.results.filter((r) => r.hit);
    if (hits.length) {
      state.session.hits += 1;
      live.unseenHits += hits.length;
      const best = hits[0];
      notify("hit", `Treffer: ${best.name} für ${fmt.format(best.buyNow)}, Gewinn ${fmt.format(best.profit)}`);
      beep();
    }

    const every = state.settings.breakEvery;
    if (every && state.session.searches % every === 0) {
      notify("warn", `${state.session.searches} Suchen in dieser Session. Gönn dir eine kurze Pause.`);
    }
  }

  function handleBid(requestBody, json) {
    const bid = DT.parseBid(requestBody, json, nameOf);
    if (!bid.won) return;
    const buy = bid.amount || bid.auction.currentBid;
    state.trades.unshift({
      id: newId(),
      itemId: bid.auction.itemId,
      name: bid.auction.name,
      buy,
      sell: null,
      boughtAt: Date.now(),
      soldAt: null,
    });
    state.session.buys += 1;
    state.session.spent += buy;

    const list = DT.suggestListPrice(buy, state.settings.listProfile, { marketPrice: marketPriceFor(bid.auction) });
    notify("good", `Gekauft: ${bid.auction.name} für ${fmt.format(buy)}. Empfohlener Verkaufspreis: ${fmt.format(list)}`);

    const { budget, buyLimit } = state.settings;
    if (buyLimit && state.session.buys >= buyLimit) notify("warn", `Kauf-Limit erreicht (${buyLimit} Käufe).`);
    if (budget && state.session.spent >= budget) notify("warn", `Budget erreicht: ${fmt.format(state.session.spent)} von ${fmt.format(budget)} ausgegeben.`);
  }

  function handleTradepile(json) {
    for (const sold of DT.soldItems(json, nameOf)) {
      const trade = state.trades.find((t) => t.itemId === sold.itemId && t.sell == null);
      if (!trade) continue;
      trade.sell = sold.currentBid;
      trade.soldAt = Date.now();
      const profit = FUT.profit(trade.buy, trade.sell);
      state.session.profit += profit;
      notify("good", `Verkauft: ${trade.name} für ${fmt.format(trade.sell)} (${profit >= 0 ? "+" : ""}${fmt.format(profit)})`);
    }
  }

  function handleError(error) {
    const text = {
      softban: "EA meldet zu viele Anfragen (Soft-Ban). Mach eine längere Pause.",
      captcha: "EA verlangt ein Captcha. Löse es in der Web App.",
      session: "Deine Web-App-Sitzung ist abgelaufen. Melde dich neu an.",
    }[error];
    notify("bad", text);
    render();
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  // XMLHttpRequest: nur die Antwort wird gelesen, die Anfrage bleibt unverändert.
  const xhr = XMLHttpRequest.prototype;
  const originalOpen = xhr.open;
  const originalSend = xhr.send;

  xhr.open = function (method, url) {
    this.__damirtrade = { method, url: String(url) };
    return originalOpen.apply(this, arguments);
  };

  xhr.send = function (body) {
    const info = this.__damirtrade;
    const kind = info && DT.classifyRequest(info.method, info.url);
    if (kind && kind !== "other") {
      this.addEventListener("load", () => {
        try {
          const json = this.responseType === "json" ? this.response : parseJson(this.responseText);
          handleResponse(kind, this.status, body, json);
        } catch (e) {
          // Fehler im Panel dürfen die Web App nie stören.
        }
      });
    }
    return originalSend.apply(this, arguments);
  };

  // fetch: gleiche Idee, gelesen wird eine Kopie der Antwort.
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const method = (init && init.method) || (input && input.method) || "GET";
    const kind = DT.classifyRequest(method, url);
    const promise = originalFetch.apply(this, arguments);
    if (kind && kind !== "other") {
      promise.then((response) => {
        response.clone().text()
          .then((text) => handleResponse(kind, response.status, init && init.body, parseJson(text)))
          .catch(() => {});
      }).catch(() => {});
    }
    return promise;
  };

  // ---------- Hinweise und Ton ----------

  function notify(type, text) {
    live.notices.unshift({ id: newId(), type, text, t: Date.now() });
    live.notices = live.notices.slice(0, 6);
    showToast(type, text);
  }

  let audio = null;
  function beep() {
    if (!state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.35);
    } catch (e) {
      // Ton ist optional.
    }
  }

  // Laufzeit-Limit: einmal pro Session melden.
  let stopNoticeFor = null;
  setInterval(() => {
    const limit = state.settings.stopAfterMinutes;
    if (!limit || stopNoticeFor === state.session.startedAt) return;
    if (Date.now() - state.session.startedAt >= limit * 60000) {
      stopNoticeFor = state.session.startedAt;
      notify("warn", `Laufzeit-Limit erreicht: ${limit} Minuten. Zeit für eine Pause.`);
      render();
    }
  }, 30000);

  // ---------- Oberfläche ----------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      --ink: #0e131d; --panel: #161c29; --raise: #1f2737; --line: #2a3346;
      --fg: #e9edf5; --muted: #8e98ac; --accent: #ff7a59; --on-accent: #1d0d07;
      --good: #3ccf8e; --bad: #ff5d6c; --warn: #ffc857;
      color-scheme: dark;
      font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--fg);
    }
    .fab {
      position: fixed; z-index: 2147483000;
      right: calc(14px + env(safe-area-inset-right, 0px));
      bottom: calc(14px + env(safe-area-inset-bottom, 0px));
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--accent); color: var(--on-accent); border: none;
      font: 800 17px/1 system-ui, sans-serif; letter-spacing: -0.02em;
      box-shadow: 0 6px 20px rgba(0,0,0,.45); cursor: pointer;
    }
    .fab .count {
      position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px;
      border-radius: 11px; background: var(--good); color: var(--ink); font: 700 12px/22px system-ui;
    }
    .sheet {
      position: fixed; z-index: 2147483001; left: 0; right: 0; bottom: 0;
      max-height: 82vh; display: flex; flex-direction: column;
      background: var(--panel); border-top: 1px solid var(--line);
      border-radius: 14px 14px 0 0; box-shadow: 0 -10px 30px rgba(0,0,0,.5);
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    @media (min-width: 720px) { .sheet { left: auto; right: 16px; bottom: 16px; width: 420px; border-radius: 14px; border: 1px solid var(--line); } }
    .top {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px));
    }
    .logo { font: 800 20px/1 system-ui, sans-serif; letter-spacing: -0.03em; }
    .logo b { color: var(--accent); }
    .coins { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
    .close { background: none; border: none; color: var(--muted); font-size: 26px; line-height: 1; cursor: pointer; padding: 4px 8px; }
    .tabs { display: flex; gap: 4px; padding: 10px 12px 0; border-bottom: 1px solid var(--line); }
    .tab {
      flex: 1; padding: 10px 4px; background: none; border: none; border-bottom: 2px solid transparent;
      color: var(--muted); font: 600 13px system-ui; text-transform: uppercase; letter-spacing: .06em; cursor: pointer;
    }
    .tab.on { color: var(--fg); border-bottom-color: var(--accent); }
    .body { overflow-y: auto; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 20px max(16px, env(safe-area-inset-left, 0px)); display: flex; flex-direction: column; gap: 10px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .stat { background: var(--raise); border-radius: 8px; padding: 10px; }
    .stat > span { display: block; color: var(--muted); font-size: 12px; }
    .stat strong { font-size: 19px; font-variant-numeric: tabular-nums; }
    .box { background: var(--raise); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    h3 { margin: 4px 0 0; font: 700 12px system-ui; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .row > * { flex: 1 1 120px; min-width: 0; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
    label.check { flex-direction: row; align-items: center; gap: 8px; color: var(--fg); }
    input, select {
      width: 100%; padding: 9px 10px; font: 15px system-ui; color: var(--fg);
      background: var(--ink); border: 1px solid var(--line); border-radius: 6px;
    }
    label.check input { width: auto; }
    button.btn { padding: 9px 12px; font: 600 14px system-ui; border-radius: 6px; cursor: pointer; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); }
    button.ghost { background: none; color: var(--fg); border-color: var(--line); }
    button.danger { background: none; color: var(--bad); border-color: var(--line); }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .item { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 9px 10px; background: var(--raise); border-radius: 8px; border: 1px solid transparent; }
    .item.hit { border-color: var(--good); }
    .item .main { min-width: 0; }
    .item .name { font-weight: 600; overflow-wrap: anywhere; }
    .item .sub { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .side { display: flex; gap: 8px; align-items: center; flex: none; }
    .num { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .good { color: var(--good); } .bad { color: var(--bad); } .warn { color: var(--warn); }
    .notice { padding: 8px 10px; border-radius: 6px; background: var(--raise); font-size: 13px; border-left: 3px solid var(--muted); }
    .notice.hit, .notice.good { border-left-color: var(--good); }
    .notice.warn { border-left-color: var(--warn); }
    .notice.bad { border-left-color: var(--bad); }
    .hint { color: var(--muted); font-size: 12px; margin: 0; }
    .empty { color: var(--muted); text-align: center; padding: 16px 8px; font-size: 14px; }
    .toast {
      position: fixed; z-index: 2147483002; left: 50%; transform: translateX(-50%);
      top: calc(12px + env(safe-area-inset-top, 0px)); max-width: calc(100% - 32px);
      padding: 10px 14px; border-radius: 8px; background: var(--raise); color: var(--fg);
      border: 1px solid var(--line); font-size: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.45);
    }
    .toast.hit, .toast.good { border-color: var(--good); }
    .toast.warn { border-color: var(--warn); }
    .toast.bad { border-color: var(--bad); }
    [hidden] { display: none !important; }
  `;

  let shadow = null;

  function mount() {
    if (shadow) return;
    const host = document.createElement("damirtrade-root");
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style><div class="root"><div id="ui"></div><div id="toast" class="toast" hidden></div></div>`;
    shadow.addEventListener("click", onClick);
    shadow.addEventListener("change", onChange);
    shadow.addEventListener("submit", onSubmit);
    render();
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function coins(v) {
    return v == null ? "–" : fmt.format(v);
  }

  function signed(v) {
    if (v == null) return "–";
    return `<span class="${v > 0 ? "good" : v < 0 ? "bad" : ""}">${v > 0 ? "+" : ""}${fmt.format(v)}</span>`;
  }

  let toastTimer = null;
  function showToast(type, text) {
    if (!shadow) return;
    const toast = shadow.getElementById("toast");
    toast.className = `toast ${type}`;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }

  function render() {
    if (!shadow) return;
    const ui = shadow.getElementById("ui");
    // Eingaben im offenen Formular nicht durch Neuzeichnen verlieren.
    const active = shadow.activeElement;
    if (live.open && active && active.closest("form")) return;

    if (!live.open) {
      ui.innerHTML = `<button class="fab" data-action="open" aria-label="damirtrade öffnen">DT${live.unseenHits ? `<span class="count">${live.unseenHits}</span>` : ""}</button>`;
      return;
    }

    const tabs = [["live", "Live"], ["targets", "Ziele"], ["trades", "Trades"], ["options", "Optionen"]];
    ui.innerHTML = `
      <section class="sheet" role="dialog" aria-label="damirtrade">
        <div class="top">
          <div class="logo">damir<b>trade</b></div>
          <div class="coins">${state.coins != null ? coins(state.coins) + " Coins" : ""}</div>
          <button class="close" data-action="close" aria-label="Schließen">×</button>
        </div>
        <nav class="tabs">${tabs.map(([id, label]) => `<button class="tab ${live.tab === id ? "on" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav>
        <div class="body">${{ live: renderLive, targets: renderTargets, trades: renderTrades, options: renderOptions }[live.tab]()}</div>
      </section>`;
  }

  function renderLive() {
    const s = DT.sessionStats(state.session, Date.now());
    const notices = live.notices.slice(0, 3).map((n) => `<div class="notice ${n.type}">${esc(n.text)}</div>`).join("");
    const results = live.results.length
      ? live.results.slice(0, 20).map((r) => `
          <div class="item ${r.hit ? "hit" : ""}">
            <div class="main">
              <div class="name">${esc(r.name)}</div>
              <div class="sub">Sofort kaufen ${coins(r.buyNow)}${r.sell ? ` · Verkauf ${coins(r.sell)} (${esc(r.source)})` : ""}</div>
            </div>
            <div class="num">${signed(r.profit)}</div>
          </div>`).join("")
      : `<div class="empty">Such in der Web App auf dem Transfermarkt. Die Ergebnisse erscheinen hier mit erwartetem Gewinn.</div>`;

    return `
      ${notices}
      <div class="grid">
        <div class="stat"><span>Suchen</span><strong>${fmt.format(s.searches)}</strong></div>
        <div class="stat"><span>Treffer-Quote</span><strong>${s.hitRate.toFixed(1).replace(".", ",")} %</strong></div>
        <div class="stat"><span>Käufe</span><strong>${fmt.format(s.buys)}</strong></div>
        <div class="stat"><span>Ausgegeben</span><strong>${coins(s.spent)}</strong></div>
        <div class="stat"><span>Gewinn</span><strong>${signed(s.profit)}</strong></div>
        <div class="stat"><span>Gewinn pro Stunde</span><strong>${signed(s.profitPerHour)}</strong></div>
      </div>
      <div class="row">
        <p class="hint">Session läuft seit ${s.minutes} Min.</p>
        <button class="btn ghost" data-action="new-session">Neue Session</button>
      </div>
      <h3>Letzte Suche</h3>
      ${results}`;
  }

  function renderTargets() {
    const list = state.targets.length
      ? state.targets.map((t) => `
          <div class="item" data-id="${t.id}">
            <div class="main">
              <div class="name">${esc(t.name || "Alle Spieler")}</div>
              <div class="sub">${t.minRating || t.maxRating ? `Wertung ${t.minRating || "–"} bis ${t.maxRating || "–"} · ` : ""}Kauf bis ${coins(t.maxBuy)} · Verkauf ${t.sellPrice ? coins(t.sellPrice) : "Marktpreis"}</div>
            </div>
            <div class="side">
              <label class="check"><input type="checkbox" data-action="toggle-target" ${t.enabled ? "checked" : ""}> An</label>
              <button class="btn danger" data-action="remove-target">Löschen</button>
            </div>
          </div>`).join("")
      : `<div class="empty">Noch keine Ziele. Ein Ziel sagt damirtrade, welche Spieler bis zu welchem Preis interessant sind.</div>`;

    return `
      <form class="box" id="target-form">
        <h3>Neues Ziel</h3>
        <label>Spielername (Teil reicht, leer = alle) <input name="name" id="dt-target-name"></label>
        <div class="row">
          <label>Wertung ab <input name="minRating" id="dt-target-min" type="number" inputmode="numeric"></label>
          <label>Wertung bis <input name="maxRating" id="dt-target-max" type="number" inputmode="numeric"></label>
        </div>
        <div class="row">
          <label>Kaufen bis <input name="maxBuy" id="dt-target-buy" type="number" inputmode="numeric" step="50"></label>
          <label>Verkaufen für (leer = Marktpreis) <input name="sellPrice" id="dt-target-sell" type="number" inputmode="numeric" step="50"></label>
        </div>
        <button class="btn" type="submit">Ziel speichern</button>
      </form>
      ${list}`;
  }

  function renderTrades() {
    const open = state.trades.filter((t) => t.sell == null);
    const closed = state.trades.filter((t) => t.sell != null);
    const total = closed.reduce((sum, t) => sum + FUT.profit(t.buy, t.sell), 0);
    const items = state.trades.length
      ? state.trades.slice(0, 50).map((t) => `
          <div class="item" data-id="${t.id}">
            <div class="main">
              <div class="name">${esc(t.name)}</div>
              <div class="sub">${t.sell == null
                ? `Gekauft ${coins(t.buy)} · Verkaufen ab ${coins(DT.suggestListPrice(t.buy, state.settings.listProfile, {}))}`
                : `${coins(t.buy)} → ${coins(t.sell)}`}</div>
            </div>
            <div class="side">
              ${t.sell == null ? `<span class="num warn">offen</span>` : `<span class="num">${signed(FUT.profit(t.buy, t.sell))}</span>`}
              <button class="btn danger" data-action="remove-trade" aria-label="Trade löschen">×</button>
            </div>
          </div>`).join("")
      : `<div class="empty">Noch keine Trades. Wenn du in der Web App kaufst, trägt damirtrade den Kauf hier ein. Verkäufe erkennt es, sobald du die Transferliste öffnest.</div>`;

    return `
      <div class="grid">
        <div class="stat"><span>Gesamtgewinn</span><strong>${signed(total)}</strong></div>
        <div class="stat"><span>Offen / verkauft</span><strong>${open.length} / ${closed.length}</strong></div>
      </div>
      <div class="row">
        <button class="btn ghost" data-action="export">Für FUT Trader kopieren</button>
      </div>
      <p class="hint">Kopiert deine Trades als Backup. In FUT Trader unter Trades → Backup als Datei importieren.</p>
      ${items}`;
  }

  function renderOptions() {
    const s = state.settings;
    const sel = (value, current) => (value === current ? "selected" : "");
    return `
      <form class="box" id="options-form">
        <h3>Mindestgewinn</h3>
        <div class="row">
          <label>Wert <input name="minProfitValue" id="dt-min-profit" type="number" inputmode="numeric" value="${s.minProfitValue}"></label>
          <label>Einheit
            <select name="minProfitUnit" id="dt-min-unit">
              <option value="coins" ${sel("coins", s.minProfitUnit)}>Coins</option>
              <option value="percent" ${sel("percent", s.minProfitUnit)}>Prozent</option>
            </select>
          </label>
        </div>
        <label class="check"><input type="checkbox" name="useMarketPrice" id="dt-market" ${s.useMarketPrice ? "checked" : ""}> Ohne Ziel mit Marktpreis aus deinen Suchen vergleichen</label>

        <h3>Verkaufsprofil</h3>
        <div class="row">
          <label>Art
            <select name="listMode" id="dt-list-mode">
              <option value="margin" ${sel("margin", s.listProfile.mode)}>Kaufpreis + Marge</option>
              <option value="market" ${sel("market", s.listProfile.mode)}>Marktpreis minus Stufen</option>
              <option value="fixed" ${sel("fixed", s.listProfile.mode)}>Fester Preis</option>
            </select>
          </label>
          <label>Wert (Coins / Stufen / Preis) <input name="listValue" id="dt-list-value" type="number" inputmode="numeric" value="${s.listProfile.value}"></label>
        </div>

        <h3>Limits und Pausen</h3>
        <div class="row">
          <label>Budget pro Session (0 = aus) <input name="budget" id="dt-budget" type="number" inputmode="numeric" value="${s.budget}"></label>
          <label>Kauf-Limit (0 = aus) <input name="buyLimit" id="dt-buy-limit" type="number" inputmode="numeric" value="${s.buyLimit}"></label>
        </div>
        <div class="row">
          <label>Laufzeit-Limit in Min. (0 = aus) <input name="stopAfterMinutes" id="dt-stop-after" type="number" inputmode="numeric" value="${s.stopAfterMinutes}"></label>
          <label>Pausen-Hinweis alle X Suchen (0 = aus) <input name="breakEvery" id="dt-break-every" type="number" inputmode="numeric" value="${s.breakEvery}"></label>
        </div>
        <label class="check"><input type="checkbox" name="sound" id="dt-sound" ${s.sound ? "checked" : ""}> Ton bei Treffern</label>
        <button class="btn" type="submit">Speichern</button>
      </form>
      <p class="hint">damirtrade liest nur mit. Suchen, kaufen und verkaufen machst du selbst in der Web App.</p>`;
  }

  // ---------- Bedienung ----------

  function num(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function onClick(event) {
    // Auf dem iPhone behalten Eingabefelder beim Tippen auf Knöpfe den Fokus.
    if (event.target.closest("[data-tab], [data-action]:not([type=checkbox])") && shadow.activeElement) {
      shadow.activeElement.blur();
    }
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      live.tab = tab.dataset.tab;
      return render();
    }
    const button = event.target.closest("[data-action]");
    if (!button || button.type === "checkbox") return;
    const id = button.closest("[data-id]") && button.closest("[data-id]").dataset.id;

    switch (button.dataset.action) {
      case "open":
        live.open = true;
        live.unseenHits = 0;
        break;
      case "close":
        live.open = false;
        break;
      case "new-session":
        state.session = newSession();
        live.results = [];
        live.notices = [];
        break;
      case "remove-target":
        state.targets = state.targets.filter((t) => t.id !== id);
        break;
      case "remove-trade":
        state.trades = state.trades.filter((t) => t.id !== id);
        break;
      case "export":
        exportTrades();
        return;
      default:
        return;
    }
    save();
    render();
  }

  function onChange(event) {
    if (event.target.dataset.action !== "toggle-target") return;
    const id = event.target.closest("[data-id]").dataset.id;
    const target = state.targets.find((t) => t.id === id);
    if (target) target.enabled = event.target.checked;
    save();
  }

  function onSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);

    if (form.id === "target-form") {
      state.targets.push({
        id: newId(),
        enabled: true,
        name: String(data.get("name") || "").trim(),
        minRating: num(data.get("minRating")),
        maxRating: num(data.get("maxRating")),
        maxBuy: num(data.get("maxBuy")),
        sellPrice: num(data.get("sellPrice")),
      });
      showToast("good", "Ziel gespeichert.");
    } else if (form.id === "options-form") {
      state.settings = {
        minProfitValue: num(data.get("minProfitValue")),
        minProfitUnit: data.get("minProfitUnit") === "percent" ? "percent" : "coins",
        useMarketPrice: data.get("useMarketPrice") === "on",
        listProfile: { mode: String(data.get("listMode")), value: num(data.get("listValue")) },
        budget: num(data.get("budget")),
        buyLimit: num(data.get("buyLimit")),
        stopAfterMinutes: num(data.get("stopAfterMinutes")),
        breakEvery: num(data.get("breakEvery")),
        sound: data.get("sound") === "on",
      };
      showToast("good", "Optionen gespeichert.");
    }
    save();
    if (shadow.activeElement) shadow.activeElement.blur();
    render();
  }

  // Exportiert im Format von FUT Trader (watchlist + trades).
  async function exportTrades() {
    const trades = state.trades.map(({ id, name, buy, sell, boughtAt, soldAt }) => ({ id, name, buy, sell, boughtAt, soldAt }));
    const json = JSON.stringify({ watchlist: [], trades }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      showToast("good", "Trades kopiert. Speichere sie als .json-Datei und importiere sie in FUT Trader.");
    } catch (e) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      link.download = `damirtrade-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
