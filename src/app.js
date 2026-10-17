// Oberfläche: Rechner, Watchlist und Trade-Log.
// Gespeichert wird im Claude-Konto (db-Capability), wenn die Seite als Artifact
// läuft, sonst im localStorage des Browsers.
(function () {
  "use strict";

  const LOCAL_KEY = "futTrader.v1";
  const MAX_PRICES = 50;
  const fmt = new Intl.NumberFormat("de-DE");

  // ---------- Speicher ----------

  function readLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
      return {
        watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
        trades: Array.isArray(data.trades) ? data.trades : [],
      };
    } catch (e) {
      return { watchlist: [], trades: [] };
    }
  }

  function writeLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    } catch (e) {
      // Ohne localStorage bleibt der Stand nur bis zum Neuladen erhalten.
    }
  }

  let state = readLocal();
  const cloud = { refs: null, writing: {}, dirty: {} };

  // Speichert einen Teil des Zustands ("watchlist" oder "trades").
  // Pro Dokument läuft immer nur ein Schreibvorgang; Änderungen dazwischen
  // werden im nächsten Durchlauf zusammen geschrieben.
  function persist(key) {
    writeLocal();
    if (!cloud.refs) return;
    cloud.dirty[key] = true;
    if (!cloud.writing[key]) flush(key);
  }

  async function flush(key) {
    cloud.writing[key] = true;
    while (cloud.dirty[key]) {
      cloud.dirty[key] = false;
      try {
        await writeWithRetry(cloud.refs[key], { items: state[key] });
      } catch (e) {
        showToast(saveErrorText(e));
        break;
      }
    }
    cloud.writing[key] = false;
  }

  async function writeWithRetry(ref, data) {
    try {
      await ref.set(data);
    } catch (e) {
      if (!e || e.code !== "unavailable") throw e;
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
      await ref.set(data);
    }
  }

  function saveErrorText(error) {
    if (error && error.code === "quota_exceeded") {
      return "Speicher voll. Lösche alte Trades oder Spieler und versuche es erneut.";
    }
    if (error && error.code === "invalid_argument") {
      return "Du hast keine Schreibrechte für diese Seite. Änderungen bleiben nur in diesem Browser.";
    }
    return "Speichern im Konto fehlgeschlagen. Die Änderung ist nur in diesem Browser gesichert.";
  }

  async function connectCloud() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    try {
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const base = db.collection("data/users/" + id);
      const refs = { watchlist: base.doc("watchlist"), trades: base.doc("trades") };
      const [watchDoc, tradeDoc] = await Promise.all([refs.watchlist.get(), refs.trades.get()]);
      cloud.refs = refs;
      if (watchDoc.exists || tradeDoc.exists) {
        state = {
          watchlist: (watchDoc.exists && watchDoc.data().items) || [],
          trades: (tradeDoc.exists && tradeDoc.data().items) || [],
        };
        writeLocal();
      } else if (state.watchlist.length || state.trades.length) {
        // Erster Start im Konto: bisherige Browser-Daten übernehmen.
        persist("watchlist");
        persist("trades");
      }
      $("#storage-status").textContent = "In deinem Claude-Konto gespeichert";
      renderAll();
    } catch (e) {
      cloud.refs = null;
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Helfer ----------

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function coins(value) {
    return value == null ? "–" : fmt.format(value);
  }

  function signed(value) {
    const cls = value > 0 ? "good" : value < 0 ? "bad" : "";
    const sign = value > 0 ? "+" : "";
    return `<span class="${cls}">${sign}${fmt.format(value)}</span>`;
  }

  function readNumber(input) {
    const value = parseInt(input.value, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function rows(pairs) {
    return pairs.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  }

  let toastTimer = null;
  function showToast(text) {
    const toast = $("#toast");
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  // Zerstörende Aktionen brauchen einen zweiten Tipp innerhalb von 3 Sekunden.
  function confirmTap(button) {
    if (button.classList.contains("armed")) return true;
    const label = button.textContent;
    button.classList.add("armed");
    button.textContent = "Sicher?";
    setTimeout(() => {
      button.classList.remove("armed");
      button.textContent = label;
    }, 3000);
    return false;
  }

  // ---------- Tabs ----------

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("main > .panel").forEach((p) => p.classList.toggle("active", p.id === tab.dataset.tab));
    });
  });

  // ---------- Rechner ----------

  function renderCalculator() {
    const buy = readNumber($("#calc-buy"));
    const sell = readNumber($("#calc-sell"));
    const margin = parseInt($("#calc-margin").value, 10) || 0;

    $("#calc-headline").innerHTML = buy && sell
      ? `<span class="hint">Gewinn</span><span class="value">${signed(FUT.profit(buy, sell))}</span>`
      : `<span class="hint">Kauf- und Verkaufspreis eingeben</span>`;

    const result = [];
    if (sell) {
      result.push(["EA-Steuer (5 %)", coins(FUT.tax(sell))]);
      result.push(["Erlös nach Steuer", coins(FUT.netAfterTax(sell))]);
    }
    if (buy && sell) result.push(["Rendite", `${FUT.roi(buy, sell).toFixed(1).replace(".", ",")} %`]);
    if (sell && !FUT.isValidPrice(sell)) {
      result.push(["Kein gültiger Preis", `${coins(FUT.roundDown(sell))} oder ${coins(FUT.roundUp(sell))}`]);
    }
    $("#calc-result").innerHTML = rows(result);

    const targets = [];
    if (buy) targets.push([`Verkaufen ab (+${coins(margin)})`, coins(FUT.minSellPrice(buy, margin))]);
    if (sell) targets.push([`Kaufen bis (+${coins(margin)})`, coins(FUT.maxBuyPrice(sell, margin))]);
    $("#calc-targets").innerHTML = rows(targets);
  }

  ["#calc-buy", "#calc-sell", "#calc-margin"].forEach((id) => $(id).addEventListener("input", renderCalculator));

  // ---------- Watchlist ----------

  function sparkline(item) {
    if (item.prices.length < 2) return "";
    const values = item.prices.map((p) => p.price);
    const min = Math.min(...values, item.targetBuy);
    const max = Math.max(...values);
    const span = max - min || 1;
    const y = (v) => (40 - ((v - min) / span) * 36).toFixed(1);
    const x = (i) => ((i / (values.length - 1)) * 96 + 2).toFixed(1);
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const last = values.length - 1;
    return `<svg class="spark" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
      <line class="buy-line" x1="0" x2="100" y1="${y(item.targetBuy)}" y2="${y(item.targetBuy)}" vector-effect="non-scaling-stroke"/>
      <polygon class="area" points="${x(0)},44 ${points} ${x(last)},44"/>
      <polyline class="line" points="${points}" vector-effect="non-scaling-stroke"/>
      <circle class="end" cx="${x(last)}" cy="${y(values[last])}" r="2"/>
    </svg>`;
  }

  function watchStatus(item, current) {
    if (current == null) return `<span class="pill">Kein Preis</span>`;
    if (current <= item.targetBuy) return `<span class="pill buy">Kaufen</span>`;
    if (current >= item.targetSell) return `<span class="pill sell">Verkaufen</span>`;
    return `<span class="pill">Warten</span>`;
  }

  function renderWatchlist() {
    const list = $("#watch-list");
    if (state.watchlist.length === 0) {
      list.innerHTML = `<div class="card empty">Noch keine Spieler. Trag oben Name und Zielpreise ein, dann kannst du hier Preise sammeln.</div>`;
      return;
    }
    list.innerHTML = state.watchlist.map((item) => {
      const last = item.prices[item.prices.length - 1];
      const current = last ? last.price : null;
      return `
        <div class="card" data-id="${item.id}">
          <div class="item-head">
            <strong>${escapeHtml(item.name)} <small>${escapeHtml(item.version || "")}</small></strong>
            ${watchStatus(item, current)}
          </div>
          <dl class="result">${rows([
            ["Aktueller Preis", coins(current)],
            ["Ziel-Kauf / Ziel-Verkauf", `${coins(item.targetBuy)} / ${coins(item.targetSell)}`],
            ["Gewinn bei Zielpreisen", signed(FUT.profit(item.targetBuy, item.targetSell))],
          ])}</dl>
          ${sparkline(item)}
          <div class="actions">
            <input type="number" inputmode="numeric" min="0" step="50" placeholder="Preis jetzt" aria-label="Aktueller Preis" data-role="price">
            <button type="button" data-action="add-price">Speichern</button>
          </div>
          <div class="actions">
            <button type="button" class="secondary" data-action="bought">Gekauft</button>
            <button type="button" class="danger" data-action="remove-watch">Entfernen</button>
          </div>
        </div>`;
    }).join("");
  }

  $("#watch-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const targetBuy = readNumber(form.targetBuy);
    const targetSell = readNumber(form.targetSell);
    if (!targetBuy || !targetSell) return;
    state.watchlist.push({
      id: newId(),
      name: form.name.value.trim(),
      version: form.version.value.trim(),
      targetBuy,
      targetSell,
      prices: [],
    });
    persist("watchlist");
    form.reset();
    renderWatchlist();
  });

  $("#watch-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest("[data-id]");
    const item = state.watchlist.find((w) => w.id === card.dataset.id);
    if (!item) return;
    const priceInput = card.querySelector("[data-role=price]");

    if (button.dataset.action === "add-price") {
      const price = readNumber(priceInput);
      if (!price) return showToast("Gib zuerst einen Preis ein.");
      item.prices.push({ t: Date.now(), price });
      item.prices = item.prices.slice(-MAX_PRICES);
      persist("watchlist");
    } else if (button.dataset.action === "bought") {
      const last = item.prices[item.prices.length - 1];
      const buy = readNumber(priceInput) || (last ? last.price : item.targetBuy);
      addTrade(`${item.name}${item.version ? " (" + item.version + ")" : ""}`, buy);
      showToast(`Trade eingetragen: ${item.name} für ${coins(buy)}`);
    } else if (button.dataset.action === "remove-watch") {
      if (!confirmTap(button)) return;
      state.watchlist = state.watchlist.filter((w) => w !== item);
      persist("watchlist");
    }
    renderWatchlist();
  });

  // ---------- Trades ----------

  function addTrade(name, buy) {
    state.trades.unshift({ id: newId(), name, buy, sell: null, boughtAt: Date.now(), soldAt: null });
    persist("trades");
    renderTrades();
  }

  function renderTrades() {
    const open = state.trades.filter((t) => t.sell == null);
    const closed = state.trades.filter((t) => t.sell != null);
    const total = closed.reduce((sum, t) => sum + FUT.profit(t.buy, t.sell), 0);
    const invested = open.reduce((sum, t) => sum + t.buy, 0);

    $("#trade-summary").innerHTML = `
      <h2>Bilanz</h2>
      <div class="headline"><span class="hint">Gesamtgewinn</span><span class="value">${signed(total)}</span></div>
      <dl class="result">${rows([
        ["Abgeschlossene Trades", fmt.format(closed.length)],
        ["Offene Trades", fmt.format(open.length)],
        ["Gebunden in offenen Trades", coins(invested)],
      ])}</dl>`;

    if (state.trades.length === 0) {
      $("#trade-list").innerHTML = `<div class="card empty">Noch keine Trades. Trag einen Kauf ein oder tippe in der Watchlist auf „Gekauft“.</div>`;
      return;
    }

    $("#trade-list").innerHTML = state.trades.map((t) => {
      const date = new Date(t.boughtAt).toLocaleDateString("de-DE");
      const head = `<div class="item-head"><strong>${escapeHtml(t.name)}</strong><small>${date}</small></div>`;
      if (t.sell == null) {
        return `
          <div class="card" data-id="${t.id}">
            ${head}
            <dl class="result">${rows([
              ["Kaufpreis", coins(t.buy)],
              ["Ohne Verlust verkaufen ab", coins(FUT.minSellPrice(t.buy))],
            ])}</dl>
            <div class="actions">
              <input type="number" inputmode="numeric" min="0" step="50" placeholder="Verkaufspreis" aria-label="Verkaufspreis" data-role="sell">
              <button type="button" data-action="sell">Verkauft</button>
              <button type="button" class="danger" data-action="remove-trade">Löschen</button>
            </div>
          </div>`;
      }
      return `
        <div class="card" data-id="${t.id}">
          ${head}
          <dl class="result">${rows([
            ["Kauf / Verkauf", `${coins(t.buy)} / ${coins(t.sell)}`],
            ["Gewinn nach Steuer", signed(FUT.profit(t.buy, t.sell))],
          ])}</dl>
          <div class="actions">
            <button type="button" class="danger" data-action="remove-trade">Löschen</button>
          </div>
        </div>`;
    }).join("");
  }

  $("#trade-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const buy = readNumber(form.buy);
    if (!buy) return;
    addTrade(form.name.value.trim(), buy);
    form.reset();
  });

  $("#trade-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest("[data-id]");
    const trade = state.trades.find((t) => t.id === card.dataset.id);
    if (!trade) return;

    if (button.dataset.action === "sell") {
      const sell = readNumber(card.querySelector("[data-role=sell]"));
      if (!sell) return showToast("Gib zuerst den Verkaufspreis ein.");
      trade.sell = sell;
      trade.soldAt = Date.now();
    } else if (button.dataset.action === "remove-trade") {
      if (!confirmTap(button)) return;
      state.trades = state.trades.filter((t) => t !== trade);
    }
    persist("trades");
    renderTrades();
  });

  // ---------- Backup ----------

  $("#export-btn").addEventListener("click", async () => {
    const json = JSON.stringify(state, null, 2);
    const filename = `fut-trader-${new Date().toISOString().slice(0, 10)}.json`;

    if (window.claude && typeof window.claude.use === "function") {
      const downloads = await window.claude.use("downloads");
      if (downloads) {
        try {
          await downloads.save({ filename, data: json });
          showToast("Backup gespeichert.");
        } catch (e) {
          if (e && e.code !== "declined") showToast("Backup konnte nicht gespeichert werden.");
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(json);
        showToast("Backup in die Zwischenablage kopiert.");
      } catch (e) {
        showToast("Export ist hier nicht möglich.");
      }
      return;
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  let pendingImport = null;

  $("#import-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.watchlist) || !Array.isArray(data.trades)) throw new Error("Format");
      pendingImport = { watchlist: data.watchlist, trades: data.trades };
      $("#import-text").textContent =
        `${data.watchlist.length} Spieler und ${data.trades.length} Trades importieren? Deine aktuellen Daten werden ersetzt.`;
      $("#import-bar").hidden = false;
    } catch (e) {
      showToast("Die Datei ist kein FUT-Trader-Backup.");
    }
  });

  $("#import-confirm").addEventListener("click", () => {
    if (!pendingImport) return;
    state = pendingImport;
    pendingImport = null;
    $("#import-bar").hidden = true;
    persist("watchlist");
    persist("trades");
    renderAll();
    showToast("Backup importiert.");
  });

  $("#import-cancel").addEventListener("click", () => {
    pendingImport = null;
    $("#import-bar").hidden = true;
  });

  function renderAll() {
    renderCalculator();
    renderWatchlist();
    renderTrades();
  }

  renderAll();
  connectCloud();
})();
