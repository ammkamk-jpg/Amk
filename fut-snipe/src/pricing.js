  // ---------- pricing (pure math; test/fut-snipe.test.js loads this file on its own) ----------
  var EA_TAX = 0.05, MIN_PRICE = 150, FEW = 4;
  var FRESH_MIN_S = 3240, FRESH_MAX_S = 3600; // ~54-60 min left on a 1h listing = a fresh drop

  function stepFor(p) { return p < 1000 ? 50 : p < 10000 ? 100 : p < 50000 ? 250 : p < 100000 ? 500 : 1000; }
  function roundStep(p) { var s = stepFor(p); return Math.max(MIN_PRICE, Math.round(p / s) * s); }
  function floorStep(p) { var s = stepFor(p); return Math.max(MIN_PRICE, Math.floor(p / s) * s); }
  function afterTax(p) { return Math.floor(p * (1 - EA_TAX)); }
  function profitAt(sell, buy) { return afterTax(sell) - buy; }

  // Snipe point = what you get after EA's 5% tax, minus the target profit, rounded down to a
  // valid price. 15,000 with profit 500 -> 14,250 - 500 = 13,750. 0 = the profit is too high.
  function snipePoint(price, profit) {
    var raw = afterTax(price) - (profit || 0);
    return raw < MIN_PRICE ? 0 : floorStep(raw);
  }

  function isFreshSecs(s) { return s == null || (s >= FRESH_MIN_S && s <= FRESH_MAX_S); }

  // Market price from the few cheapest listings: the 2nd-cheapest FRESH one, so a single
  // outlier can't skew it. No fresh listings -> the 2nd-cheapest of all. listings: [{price, secs}]
  function pickMarketPrice(listings) {
    var all = [], fresh = [];
    for (var i = 0; i < listings.length; i++) {
      var l = listings[i]; if (!(l && l.price > 0)) continue;
      all.push(l.price); if (isFreshSecs(l.secs)) fresh.push(l.price);
    }
    var byPrice = function (a, b) { return a - b; };
    all.sort(byPrice); fresh.sort(byPrice);
    var pool = fresh.length ? fresh : all;
    if (!pool.length) return null;
    return { price: pool[Math.min(1, pool.length - 1)], fresh: fresh.length > 0, n: pool.length };
  }

  // Binary search on max-buy. lo = a price with no listings, hi = a price with too many.
  // Returns the next max-buy to try, or 0 once lo and hi are neighbouring prices.
  function probeMid(lo, hi) {
    var m = floorStep((lo + hi) / 2);
    if (m <= lo) m = floorStep(lo + stepFor(lo));
    return m > lo && m < hi ? m : 0;
  }
  // What one probe result means: 'many' (go down), 'few' (found it) or 'none' (go up).
  // A few listings that are all old (no fresh drop) are stale outliers, so they count as none.
  function probeVerdict(listings) {
    if (listings.length > FEW) return 'many';
    for (var i = 0; i < listings.length; i++) if (isFreshSecs(listings[i].secs)) return 'few';
    return 'none';
  }

  // ---------- human-like randomness ----------
  // Gap between searches: base x 0.8-1.4 (bell-shaped, never the same twice), and now and then
  // (8%) a longer pause of 1.5-5s, like someone glancing away.
  function humanGapMs(base, rnd) {
    rnd = rnd || Math.random;
    var ms = base * (0.8 + 0.6 * (rnd() + rnd()) / 2);
    if (rnd() < 0.08) ms += 1500 + rnd() * 3500;
    return Math.round(ms);
  }
  // "Every n" made fuzzy: n +/- spread (e.g. 50 +/- 20% -> 40-60), at least 1.
  function fuzzyCount(n, spread, rnd) {
    rnd = rnd || Math.random;
    return Math.max(1, Math.round(n * (1 - spread + 2 * spread * rnd())));
  }
  // Special cards' ids are the base player id + k * 2^24; the market search wants the base id.
  function baseIdOf(id) { id = Number(id); return id > 0 ? id % 16777216 : 0; }

  if (typeof module === 'object' && module.exports) {
    module.exports = { EA_TAX: EA_TAX, MIN_PRICE: MIN_PRICE, FEW: FEW, stepFor: stepFor, roundStep: roundStep, floorStep: floorStep, afterTax: afterTax, profitAt: profitAt, snipePoint: snipePoint, isFreshSecs: isFreshSecs, pickMarketPrice: pickMarketPrice, probeMid: probeMid, probeVerdict: probeVerdict, humanGapMs: humanGapMs, fuzzyCount: fuzzyCount, baseIdOf: baseIdOf };
  }
