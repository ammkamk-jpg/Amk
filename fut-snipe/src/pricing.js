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
  // Next max-buy for the price check, the way a person would do it: from a starting guess, step
  // down ~12% while there are too many listings (up ~12% while there are none), and once the
  // price is boxed in (a "none" below, a "many" above) halve the gap. lo/hi 0 = not known yet.
  // Returns {lo, hi, next}; next 0 = boxed in to neighbouring prices.
  function nextProbe(lo, hi, probe, verdict) {
    var next;
    if (verdict === 'many') { hi = probe; next = lo ? probeMid(lo, hi) : floorStep(probe * 0.88); if (next >= probe) next = 0; }
    else { lo = probe; next = hi ? probeMid(lo, hi) : roundStep(Math.max(probe * 1.12, probe + stepFor(probe))); }
    return { lo: lo, hi: hi, next: next };
  }
  // What one probe result means: 'many' (go down), 'few' (found it) or 'none' (go up).
  // 'few' needs 2+ fresh listings, so the price can be the 2nd-cheapest fresh one; a few old
  // (stale) listings, or a single fresh one, mean: look a bit higher.
  function probeVerdict(listings) {
    if (listings.length > FEW) return 'many';
    var fresh = 0;
    for (var i = 0; i < listings.length; i++) if (isFreshSecs(listings[i].secs)) fresh++;
    return fresh >= 2 ? 'few' : 'none';
  }

  // ---------- human-like randomness ----------
  // Gap between searches: always inside [min, max] (Normal 3.5-5.5s), spread over the whole range
  // (bell-shaped, never the same twice). bias (-0.2..0.2, from the tempo mood) leans it towards
  // the quick or the slow end for a while.
  function humanGapMs(min, max, bias, rnd) {
    rnd = rnd || Math.random;
    var u = Math.max(0, Math.min(1, (rnd() + rnd()) / 2 + (bias || 0)));
    return Math.round(min + (max - min) * u);
  }
  // Tempo "mood": a person isn't equally fast all session. A lean of -0.2..0.2 within the range,
  // re-rolled every 8-25 searches.
  function nextMood(rnd) { rnd = rnd || Math.random; return { bias: (rnd() - 0.5) * 0.4, left: 8 + Math.floor(rnd() * 18) }; }

  // Manual sell price (0 = use the checked market price). The snipe point comes from the LOWER of
  // the two, so the target profit holds either way: selling above the market buys at the normal
  // snipe point (more profit), selling below it buys cheaper.
  function sellAndSnipe(checked, manual, profit) {
    var sell = manual > 0 ? roundStep(manual) : checked;
    return { sell: sell, snipe: snipePoint(Math.min(checked || sell, sell), profit) };
  }
  // "Every n" made fuzzy: n +/- spread (e.g. 50 +/- 20% -> 40-60), at least 1.
  function fuzzyCount(n, spread, rnd) {
    rnd = rnd || Math.random;
    return Math.max(1, Math.round(n * (1 - spread + 2 * spread * rnd())));
  }
  // Special cards' ids are the base player id + k * 2^24; the market search wants the base id.
  function baseIdOf(id) { id = Number(id); return id > 0 ? id % 16777216 : 0; }
  // "61.3K" -> 61300, "1.2M" -> 1200000, "7,750" -> 7750. null if it isn't a coin value.
  function parseCoins(t) {
    var m = String(t == null ? '' : t).replace(/[\s,]/g, '').match(/^(\d+(?:\.\d+)?)([kKmM]?)$/);
    if (!m) return null;
    var n = parseFloat(m[1]) * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1);
    return Math.round(n);
  }

  // Lowest valid price that gets back what you paid after EA's 5% tax.
  function breakEven(buy) { var p = Math.ceil(buy / (1 - EA_TAX)), s = stepFor(p); p = Math.ceil(p / s) * s; return afterTax(p) >= buy ? p : p + stepFor(p); }
  // Re-pricing an expired card: today's price, but never below break-even when the cost is known,
  // and never more than 10% under the old price when it isn't. Returns {price, floored}.
  function repriceFloor(found, old, buy) {
    var floor = buy > 0 ? breakEven(buy) : (old > 0 ? floorStep(old * 0.9) : 0);
    return found >= floor ? { price: found, floored: false } : { price: floor, floored: true };
  }

  // ---------- market overview (from the bot's own price checks) ----------
  // history: [{id, name, p, t}] newest last. Per card checked 2+ times in the window: change from
  // its first to its last price. Index 50 = flat; each 1% average change moves it 5 points
  // (+/-10% or more = 100 / 0). null = not enough checks yet.
  function cardTrends(history, now, windowMs) {
    var since = now - (windowMs || 86400000), by = {};
    history.forEach(function (h) { if (h.t >= since && h.p > 0) (by[h.id] = by[h.id] || []).push(h); });
    return Object.keys(by).map(function (id) {
      var l = by[id].sort(function (a, b) { return a.t - b.t; }), first = l[0], last = l[l.length - 1];
      return { id: id, name: last.name, price: last.p, t: last.t, n: l.length, pct: l.length > 1 ? (last.p - first.p) / first.p * 100 : null, pts: l.map(function (x) { return x.p; }) };
    }).sort(function (a, b) { return b.t - a.t; });
  }
  function marketIndex(history, now, windowMs) {
    var tr = cardTrends(history, now, windowMs).filter(function (c) { return c.pct != null; });
    if (!tr.length) return null;
    var avg = tr.reduce(function (s, c) { return s + c.pct; }, 0) / tr.length;
    return { index: Math.round(50 + Math.max(-10, Math.min(10, avg)) * 5), pct: avg, cards: tr.length };
  }

  // ---------- fresh results ----------
  // A different min bid on every snipe search (0 or 150-1,000, below half the snipe point, never the
  // same twice in a row) makes every request unique, so EA can't answer with a cached result.
  // Min bid also hides a listing whose current/starting bid is lower, for that one search only.
  function nextMinBid(prev, snipe, rnd) {
    rnd = rnd || Math.random;
    var top = Math.min(1000, Math.floor((snipe || 0) / 2 / 50) * 50), opts = [0];
    for (var v = 150; v <= top; v += 50) opts.push(v);
    if (opts.length < 2) return 0;
    var pick = prev;
    for (var i = 0; i < 6 && pick === prev; i++) pick = opts[Math.floor(rnd() * opts.length)];
    return pick === prev ? opts[(opts.indexOf(prev) + 1) % opts.length] : pick;
  }

  // ---------- safety stops ----------
  // Too many results: a sane buy price finds 0-2 cards; 10+ means the price is probably mistyped.
  var TOO_MANY = 10;
  function tooManyResults(n) { return n >= TOO_MANY; }
  // Price range stop: EA only allows list prices inside a card's range.
  function outsideRange(price, lim) { return !!(lim && lim.max > 0 && (price > lim.max || price < (lim.min || 0))); }
  // A player search without a rarity filter can buy a special version (TOTW, ...): its card id is
  // the base id + k * 2^24. The price check was for the base card, so it mustn't be listed at it.
  function hasRarityFilter(crit) { var r = crit && crit.rarities; return Array.isArray(r) ? r.length > 0 : !!(r && String(r) !== '-1'); }
  function isSpecialBuy(defId, crit) { var d = Number(defId); return d > 0 && baseIdOf(d) !== d && !hasRarityFilter(crit); }

  // ---------- safety assistant ----------
  // A rough guide, not EA's real limits (EA doesn't publish them): searches today, and how long
  // ago EA last showed a captcha / 429. Returns {level: 'ok'|'warn'|'stop', title, hint, minutes}.
  var SAFE_SEARCHES_DAY = 1800;
  function safetyStatus(searchesToday, blockAgoMs) {
    var h = 3600000;
    if (blockAgoMs != null && blockAgoMs < 6 * h) {
      var left = Math.ceil((6 * h - blockAgoMs) / h);
      return { level: 'stop', title: 'Pause sniping', hint: 'EA flagged you ' + Math.max(1, Math.round(blockAgoMs / 60000)) + ' min ago · wait ~' + left + 'h', minutes: 0 };
    }
    var left2 = SAFE_SEARCHES_DAY - searchesToday;
    if (left2 <= 0) return { level: 'stop', title: 'Enough for today', hint: searchesToday + ' searches today', minutes: 0 };
    var minutes = Math.min(60, Math.floor(left2 / 18 / 15) * 15); // ~18 searches a minute at Normal speed
    if (searchesToday > SAFE_SEARCHES_DAY * 0.66 || minutes < 15) return { level: 'warn', title: 'Take a longer break', hint: searchesToday + ' searches today', minutes: Math.max(minutes, 0) };
    return { level: 'ok', title: 'You can snipe', hint: searchesToday + ' searches today', minutes: minutes };
  }
  // Cumulative profit points for the little chart (oldest first).
  function profitCurve(sales, max) {
    var pts = [], sum = 0, list = sales.filter(function (s) { return s.profit != null; }).slice(0, max || 30).reverse();
    list.forEach(function (s) { sum += s.profit; pts.push(sum); });
    return pts;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { EA_TAX: EA_TAX, MIN_PRICE: MIN_PRICE, FEW: FEW, stepFor: stepFor, roundStep: roundStep, floorStep: floorStep, afterTax: afterTax, profitAt: profitAt, snipePoint: snipePoint, isFreshSecs: isFreshSecs, pickMarketPrice: pickMarketPrice, probeMid: probeMid, probeVerdict: probeVerdict, nextProbe: nextProbe, humanGapMs: humanGapMs, nextMood: nextMood, fuzzyCount: fuzzyCount, parseCoins: parseCoins, sellAndSnipe: sellAndSnipe, baseIdOf: baseIdOf, safetyStatus: safetyStatus, profitCurve: profitCurve, TOO_MANY: TOO_MANY, tooManyResults: tooManyResults, outsideRange: outsideRange, isSpecialBuy: isSpecialBuy, hasRarityFilter: hasRarityFilter, nextMinBid: nextMinBid, breakEven: breakEven, repriceFloor: repriceFloor, cardTrends: cardTrends, marketIndex: marketIndex };
  }
