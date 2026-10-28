  // ---------- settings & storage ----------
  var LS_KEY = 'futSnipe.settings.v3', LIFE_KEY = 'futSnipe.lifetime.v1';
  var FILT_KEY = 'futSnipe.filters.v1', SESS_KEY = 'futSnipe.sessions.v1', PRICE_KEY = 'futSnipe.prices.v1';
  var DEFAULTS = {
    minProfit: 500, listDur: 3600, autoList: 1, relistExpired: 1, badges: 1, sound: 1, vibrate: 1, speed: 1, runMinutes: 0,
    searchMinMs: 2500, searchJitterMs: 400, buyGapMinMs: 500, buyGapMaxMs: 1100,
    breakEvery: 30, breakSec: 90, sessionBuyCap: 15, dailyBuyCap: 150, reprobeEvery: 50
  };
  var LIST_DURS = [['1h', 3600], ['3h', 10800], ['6h', 21600], ['12h', 43200], ['1d', 86400], ['3d', 259200]];
  var HARD_FLOOR_MS = 300;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();
  if (!(cfg.reprobeEvery >= 30 && cfg.reprobeEvery <= 120)) cfg.reprobeEvery = 50; // old saves had 20
  // Speed sets only the search/buy cadence (breaks are configured separately).
  // Turbo ~2 searches/sec, Normal 1 per 2.5s, Night 1 per 6.5s (for overnight runs).
  function applySpeed() {
    var s = cfg.speed | 0;
    if (s === 2) { cfg.searchMinMs = 500; cfg.searchJitterMs = 150; cfg.buyGapMinMs = 300; cfg.buyGapMaxMs = 700; }
    else if (s === 0) { cfg.searchMinMs = 6500; cfg.searchJitterMs = 800; cfg.buyGapMinMs = 900; cfg.buyGapMaxMs = 1800; }
    else { cfg.searchMinMs = 2500; cfg.searchJitterMs = 400; cfg.buyGapMinMs = 500; cfg.buyGapMaxMs = 1100; }
  }
  function speedHint() { var s = cfg.speed | 0; return s === 2 ? '~2 searches / sec' : s === 0 ? '1 search / 6.5s · overnight' : '1 search / 2.5s'; }
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
