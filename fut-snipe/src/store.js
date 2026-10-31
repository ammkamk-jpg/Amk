  // ---------- settings & storage ----------
  var LS_KEY = 'futSnipe.settings.v3', LIFE_KEY = 'futSnipe.lifetime.v1';
  var FILT_KEY = 'futSnipe.filters.v1', SESS_KEY = 'futSnipe.sessions.v1', PRICE_KEY = 'futSnipe.prices.v1';
  var DEFAULTS = {
    minProfit: 500, listDur: 3600, afterBuy: 0, keepMax: 0, keepMin: 0, tooManyStop: 1, rangeStop: 1, varyMinBid: 1, keepSpecials: 1, clearSold: 2, relistExpired: 1, repriceExpired: 1, packMin: 1000, badges: 1, sound: 1, vibrate: 1, speed: 1, runMinutes: 0,
    gapMinMs: 3500, gapMaxMs: 5500, buyGapMinMs: 500, buyGapMaxMs: 1100, sellPrice: 0,
    breakEvery: 30, breakSec: 90, sessionBuyCap: 15, dailyBuyCap: 150, reprobeEvery: 50
  };
  var LIST_DURS = [['1h', 3600], ['3h', 10800], ['6h', 21600], ['12h', 43200], ['1d', 86400], ['3d', 259200]];
  var HARD_FLOOR_MS = 300;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();
  if (!(cfg.reprobeEvery >= 30 && cfg.reprobeEvery <= 120)) cfg.reprobeEvery = 50; // old saves had 20
  if (cfg.autoClearSold === 0 && cfg.clearSold === 2) { cfg.clearSold = 0; delete cfg.autoClearSold; } // old on/off switch
  // Speed sets only the search/buy cadence (breaks are configured separately).
  // Random gap between searches: Turbo 0.6-1.2s, Normal 3.5-5.5s, Night 6.5-9.5s (overnight runs).
  function applySpeed() {
    var s = cfg.speed | 0;
    if (s === 2) { cfg.gapMinMs = 600; cfg.gapMaxMs = 1200; cfg.buyGapMinMs = 300; cfg.buyGapMaxMs = 700; }
    else if (s === 0) { cfg.gapMinMs = 6500; cfg.gapMaxMs = 9500; cfg.buyGapMinMs = 900; cfg.buyGapMaxMs = 1800; }
    else { cfg.gapMinMs = 3500; cfg.gapMaxMs = 5500; cfg.buyGapMinMs = 500; cfg.buyGapMaxMs = 1100; }
    delete cfg.searchMinMs; delete cfg.searchJitterMs; // old settings
  }
  function speedHint() { return 'a random ' + (cfg.gapMinMs / 1000) + '-' + (cfg.gapMaxMs / 1000) + 's between searches' + ((cfg.speed | 0) === 0 ? ' · overnight' : ''); }
  applySpeed();

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }
  function loadLife() { return lsGet(LIFE_KEY, { bought: 0, spent: 0, est: 0 }); }
  function saveLife() { lsSet(LIFE_KEY, life); }
  var life = loadLife();

  // Live Filters (saved search sets) + Stats (session history).
  var filters = lsGet(FILT_KEY, []);     // [{name, crit}]
  var sessions = lsGet(SESS_KEY, []);     // [{t, buys, spent, est, net}]
  try { localStorage.removeItem(PRICE_KEY); } catch (e) {} // old per-card price cache, no longer used

  // Ledger for REAL profit: what each card cost (bot buys, pack pulls = 0) and every sale booked.
  var LEDGER_KEY = 'futSnipe.ledger.v1';
  var ledger = lsGet(LEDGER_KEY, { buys: {}, sales: [], booked: {} }); // buys: {itemId: {buy, t, name, pack}}
  function saveLedger() {
    var ids = Object.keys(ledger.buys);
    if (ids.length > 400) ids.sort(function (a, b) { return ledger.buys[a].t - ledger.buys[b].t; }).slice(0, ids.length - 400).forEach(function (k) { delete ledger.buys[k]; });
    var bk = Object.keys(ledger.booked); if (bk.length > 600) bk.slice(0, bk.length - 600).forEach(function (k) { delete ledger.booked[k]; });
    ledger.sales = ledger.sales.slice(0, 300); lsSet(LEDGER_KEY, ledger);
  }
  function noteBuy(id, buy, name, pack, rating, list) { if (id == null) return; ledger.buys[String(id)] = { buy: buy, t: Date.now(), name: name, pack: !!pack, rating: rating || null, list: list || null }; saveLedger(); }
  // Every price check, for the Market view (last ~2 days, max 400 entries).
  var PRICES_KEY = 'futSnipe.priceHist.v1', priceHist = lsGet(PRICES_KEY, []);
  function notePrice(id, name, p) {
    if (id == null || !(p > 0)) return;
    var cut = Date.now() - 2 * 86400000;
    priceHist.push({ id: String(id), name: name, p: p, t: Date.now() });
    priceHist = priceHist.filter(function (h) { return h.t >= cut; }).slice(-400); lsSet(PRICES_KEY, priceHist);
  }
  function noteList(id, price) { var b = id != null && ledger.buys[String(id)]; if (b) { b.list = price; saveLedger(); } }

  // Searches per day (for the safety assistant) and when EA last stopped us (captcha / 429).
  function searchesToday() { var d = lsGet('futSnipe.dailyS', {}); return d.date === today() ? (d.n | 0) : 0; }
  var searchesUnsaved = 0;
  function countSearch() {
    life.searches = (life.searches || 0) + 1;
    var d = lsGet('futSnipe.dailyS', {}); lsSet('futSnipe.dailyS', { date: today(), n: (d.date === today() ? (d.n | 0) : 0) + 1 });
    if (++searchesUnsaved >= 10) { searchesUnsaved = 0; saveLife(); }
  }
