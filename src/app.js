// Oberfläche: Rechner, Watchlist und Trade-Log. Daten liegen im localStorage.
(function () {
  "use strict";

  const STORAGE_KEY = "futTrader.v1";
  const fmt = new Intl.NumberFormat("de-DE");

  // ---------- Speicher ----------

  function emptyState() {
    return { watchlist: [], trades: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      return {
        watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
        trades: Array.isArray(data.trades) ? data.trades : [],
      };
    } catch (e) {
      return emptyState();
    }
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert("Speichern fehlgeschlagen. Bitte exportiere deine Daten als Backup.");
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

  // ---------- Tabs ----------

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === tab.dataset.tab));
    });
  });

  // ---------- Rechner ----------

  function renderCalculator() {
    const buy = readNumber($("#calc-buy"));
    const sell = readNumber($("#calc-sell"));
    const margin = parseInt($("#calc-margin").value, 10) || 0;

    const result = [];
    if (sell) {
      result.push(["EA-Steuer", coins(FUT.tax(sell))]);
      result.push(["Erlös nach Steuer", coins(FUT.netAfterTax(sell))]);
    }
    if (buy && sell) {
      result.push(["Gewinn", signed(FUT.profit(buy, sell))]);
      result.push(["Rendite", `${FUT.roi(buy, sell).toFixed(1).replace(".", ",")} %`]);
    }
    if (sell && !FUT.isValidPrice(sell)) {
      result.push(["Hinweis", `Kein gültiger Preis, nächster: ${coins(FUT.roundDown(sell))} / ${coins(FUT.roundUp(sell))}`]);
    }
    $("#calc-result").innerHTML = rows(result);

    const targets = [];
    if (buy) targets.push([`Mind. verkaufen für (+${coins(margin)})`, coins(FUT.minSellPrice(buy, margin))]);
    if (sell) targets.push([`Max. kaufen für (+${coins(margin)})`, coins(FUT.maxBuyPrice(sell, margin))]);
    $("#calc-targets").innerHTML = targets.length
      ? rows(targets)
      : `<dt class="hint">Kauf- oder Verkaufspreis eingeben</dt><dd></dd>`;
  }

  ["#calc-buy", "#calc-sell", "#calc-margin"].forEach((id) => $(id).addEventListener("input", renderCalculator));

  // ---------- Watchlist ----------

  function sparkline(prices) {
    if (prices.length < 2) return "";
    const values = prices.map((p) => p.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values
      .map((v, i) => `${(i / (values.length - 1)) * 100},${38 - ((v - min) / span) * 36}`)
      .join(" ");
    return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="${points}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function watchStatus(item, current) {
    if (current == null) return `<span class="badge">kein Preis</span>`;
    if (current <= item.targetBuy) return `<span class="badge good">Kaufen</span>`;
    if (current >= item.targetSell) return `<span class="badge bad">Verkaufen</span>`;
    return `<span class="badge">Warten</span>`;
  }

  function renderWatchlist() {
    const list = $("#watch-list");
    if (state.watchlist.length === 0) {
      list.innerHTML = `<p class="hint">Noch keine Spieler auf der Watchlist.</p>`;
      return;
    }
    list.innerHTML = state.watchlist.map((item) => {
      const last = item.prices[item.prices.length - 1];
      const current = last ? last.price : null;
      const expected = FUT.profit(item.targetBuy, item.targetSell);
      return `
        <div class="card" data-id="${item.id}">
          <div class="item-head">
            <strong>${escapeHtml(item.name)} <small>${escapeHtml(item.version || "")}</small></strong>
            ${watchStatus(item, current)}
          </div>
          <dl class="result">${rows([
            ["Aktueller Preis", coins(current)],
            ["Ziel-Kauf / -Verkauf", `${coins(item.targetBuy)} / ${coins(item.targetSell)}`],
            ["Gewinn bei Zielpreisen", signed(expected)],
          ])}</dl>
          ${sparkline(item.prices)}
          <div class="actions">
            <input type="number" inputmode="numeric" min="0" step="50" placeholder="Neuer Preis" data-role="price">
            <button type="button" data-action="add-price">Preis speichern</button>
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
    save();
    form.reset();
    renderWatchlist();
  });

  $("#watch-list").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    const card = event.target.closest("[data-id]");
    const item = state.watchlist.find((w) => w.id === card.dataset.id);
    if (!item) return;

    if (action === "add-price") {
      const price = readNumber(card.querySelector("[data-role=price]"));
      if (!price) return;
      item.prices.push({ t: Date.now(), price });
    } else if (action === "bought") {
      const last = item.prices[item.prices.length - 1];
      const input = prompt(`Kaufpreis für ${item.name}?`, last ? last.price : item.targetBuy);
      const buy = parseInt(input, 10);
      if (!Number.isFinite(buy) || buy <= 0) return;
      addTrade(`${item.name}${item.version ? " (" + item.version + ")" : ""}`, buy);
    } else if (action === "remove-watch") {
      if (!confirm(`${item.name} von der Watchlist entfernen?`)) return;
      state.watchlist = state.watchlist.filter((w) => w !== item);
    }
    save();
    renderWatchlist();
  });

  // ---------- Trades ----------

  function addTrade(name, buy) {
    state.trades.unshift({ id: newId(), name, buy, sell: null, boughtAt: Date.now(), soldAt: null });
    save();
    renderTrades();
  }

  function renderTrades() {
    const open = state.trades.filter((t) => t.sell == null);
    const closed = state.trades.filter((t) => t.sell != null);
    const total = closed.reduce((sum, t) => sum + FUT.profit(t.buy, t.sell), 0);
    const invested = open.reduce((sum, t) => sum + t.buy, 0);

    $("#trade-summary").innerHTML = `
      <h2>Übersicht</h2>
      <dl class="result">${rows([
        ["Gesamtgewinn", signed(total)],
        ["Abgeschlossene Trades", fmt.format(closed.length)],
        ["Offene Trades", fmt.format(open.length)],
        ["Gebunden in offenen Trades", coins(invested)],
      ])}</dl>`;

    if (state.trades.length === 0) {
      $("#trade-list").innerHTML = `<p class="hint">Noch keine Trades eingetragen.</p>`;
      return;
    }

    $("#trade-list").innerHTML = state.trades.map((t) => {
      const date = new Date(t.boughtAt).toLocaleDateString("de-DE");
      if (t.sell == null) {
        return `
          <div class="card" data-id="${t.id}">
            <div class="item-head"><strong>${escapeHtml(t.name)}</strong><small>${date}</small></div>
            <dl class="result">${rows([
              ["Kaufpreis", coins(t.buy)],
              ["Break-even", coins(FUT.minSellPrice(t.buy))],
            ])}</dl>
            <div class="actions">
              <input type="number" inputmode="numeric" min="0" step="50" placeholder="Verkaufspreis" data-role="sell">
              <button type="button" data-action="sell">Verkauft</button>
              <button type="button" class="danger" data-action="remove-trade">Löschen</button>
            </div>
          </div>`;
      }
      return `
        <div class="card" data-id="${t.id}">
          <div class="item-head"><strong>${escapeHtml(t.name)}</strong><small>${date}</small></div>
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
    const action = event.target.dataset.action;
    if (!action) return;
    const card = event.target.closest("[data-id]");
    const trade = state.trades.find((t) => t.id === card.dataset.id);
    if (!trade) return;

    if (action === "sell") {
      const sell = readNumber(card.querySelector("[data-role=sell]"));
      if (!sell) return;
      trade.sell = sell;
      trade.soldAt = Date.now();
    } else if (action === "remove-trade") {
      if (!confirm(`Trade ${trade.name} löschen?`)) return;
      state.trades = state.trades.filter((t) => t !== trade);
    }
    save();
    renderTrades();
  });

  // ---------- Export / Import ----------

  $("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `fut-trader-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $("#import-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.watchlist) || !Array.isArray(data.trades)) throw new Error("Format");
      if (!confirm("Aktuelle Daten durch den Import ersetzen?")) return;
      state = { watchlist: data.watchlist, trades: data.trades };
      save();
      renderWatchlist();
      renderTrades();
    } catch (e) {
      alert("Die Datei konnte nicht importiert werden.");
    } finally {
      event.target.value = "";
    }
  });

  renderCalculator();
  renderWatchlist();
  renderTrades();
})();
