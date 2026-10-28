  // ---------- run state (resetRun() clears it on every Start) ----------
  var running = false, stopReason = '', blockMsg = '', phase = 'idle', startTs = 0, startCoins = null;
  var tab = 'snipe', lockHidden = false, curName = null, gotRange = false;
  var nextBreakAt = 30, nextCheckAt = 50;  // fuzzy thresholds, re-rolled each time
  var mode = 'snipe';                      // 'snipe' = Start, 'job' = a Hub job (re-price expired, list pack pulls)
  var searchBase = null, matchId = null;   // set while pricing one exact card (see withCard)
  var market = { price: null, fresh: false, snipe: 0, checkedAt: 0, probeMax: 0, probeCount: null };
  var stats = { searches: 0, buys: 0, sinceBreak: 0, sinceCheck: 0, spent: 0, est: 0, cheapest: null, eaMin: null, eaMax: null, curDefId: null };
  var OBS = {};
  var capturedCriteria = null, capturedFromUrl = null, capturedPlain = null, lastCardHTML = '';
  var sampleKeys = [], samplePrice = null, tmUrls = [], lastBuy = '';
  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function resetRun() {
    stopReason = ''; blockMsg = ''; phase = 'idle'; lockHidden = false; gotRange = false; curName = null; lastBuy = '';
    market = { price: null, fresh: false, snipe: 0, checkedAt: 0, probeMax: 0, probeCount: null };
    stats = { searches: 0, buys: 0, sinceBreak: 0, sinceCheck: 0, spent: 0, est: 0, cheapest: null, eaMin: null, eaMax: null, curDefId: null };
    mode = 'snipe'; searchBase = null; matchId = null;
    nextBreakAt = fuzzyCount(cfg.breakEvery, 0.25); nextCheckAt = fuzzyCount(cfg.reprobeEvery, 0.2);
    startCoins = coins(); startTs = Date.now();
  }
