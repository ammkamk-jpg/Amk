// ==UserScript==
// @name         TangaTolga Sniper
// @namespace    local.tangatolga.sniper
// @version      5.6.0
// @description  Self-run FUT transfer-market sniper for the EA SPORTS FC Web App. One Start button: checks the market price on EA's own market, snipes cards at or below price minus tax minus your target profit, auto-relists, re-checks the price as the market moves. Price tags on cards. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// @downloadURL  https://raw.githubusercontent.com/ammkamk-jpg/Amk/fut-snipe-one-button/fut-snipe.user.js
// @updateURL    https://raw.githubusercontent.com/ammkamk-jpg/Amk/fut-snipe-one-button/fut-snipe.user.js
// ==/UserScript==

/*
 * Not affiliated with EA or FUT Simple Trader. Its own tool, no third-party server; all
 * prices come from EA's own web app (live market + EA price range). Automating the FUT
 * market breaks EA's rules; accounts get banned / coin-wiped. Your account, your risk.
 * Paces itself and STOPS (never bypasses) on captcha / soft-ban. Nothing leaves your device.
 *
 * GENERATED FILE: edit fut-snipe/src/*.js and run `npm run build:fut-snipe`.
 */

(function () {
  'use strict';
  if (window.__tangaTolgaLoaded) return;
  window.__tangaTolgaLoaded = true;
  // An old "FUT Snipe" install got here first: say so instead of fighting it for the screen.
  if (window.__futSnipeLoaded) {
    var warn = function () {
      var w = document.createElement('div');
      w.style.cssText = 'position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483647;padding:14px 16px;border-radius:16px;background:#1f1020;border:1px solid #fb7185;color:#fff;font:700 14px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)';
      w.textContent = 'TangaTolga Sniper: an old "FUT Snipe" is also installed and is running instead. Open the Userscripts app, delete "FUT Snipe", then reload this page.';
      w.onclick = function () { w.remove(); };
      document.body.appendChild(w);
    };
    if (document.body) warn(); else document.addEventListener('DOMContentLoaded', warn);
    return;
  }
  window.__futSnipeLoaded = true; // an old FUT Snipe loading after this one stops itself
  var VERSION = '5.6.0';

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
  // tol (0-1): above 100k EA's price steps are 1,000, so "profit 850" can only be 550 or 1,550.
  // With a tolerance the next step up is taken when its profit is still >= profit*(1-tol) and
  // closer to the target (850 at 10% -> 765+ is fine).
  function snipePoint(price, profit, tol) {
    profit = profit || 0;
    var net = afterTax(price), raw = net - profit;
    if (raw < MIN_PRICE) return 0;
    var f = floorStep(raw);
    if (tol > 0 && profit > 0) {
      var up = f + stepFor(f), pu = net - up, pf = net - f;
      if (pu >= profit * (1 - tol) && Math.abs(pu - profit) < Math.abs(pf - profit)) return up;
    }
    return f;
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
  // opts.fromSell: the profit counts from YOUR sell price even above the market (the run then
  // buys up to sell - tax - profit; whether the card sells at that price is up to you).
  // opts.tol: profit tolerance, see snipePoint.
  function sellAndSnipe(checked, manual, profit, opts) {
    opts = opts || {};
    var sell = manual > 0 ? roundStep(manual) : checked;
    var base = opts.fromSell ? sell : Math.min(checked || sell, sell);
    return { sell: sell, snipe: snipePoint(base, profit, opts.tol || 0) };
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

  // Search speed +/-: shift the random gap window by delta ms (minus = faster), keeping a floor
  // (never under 0.4 s) and a window of at least 0.3 s so the gaps keep varying.
  function stepGap(min, max, delta) {
    var w = Math.max(300, (max | 0) - (min | 0)), lo = Math.min(20000, Math.max(400, (min | 0) + delta));
    return { min: lo, max: Math.min(25000, lo + w) };
  }
  // Scheduled start "HH:MM" (24 h): ms from now until the next time the clock shows it (today or
  // tomorrow). Returns null for anything that isn't a valid time.
  function startDelayMs(hhmm, now) {
    var m = String(hhmm || '').trim().match(/^(\d{1,2})[:.](\d{2})$/); if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]); if (h > 23 || mi > 59) return null;
    var t = new Date(now.getTime()); t.setHours(h, mi, 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return t.getTime() - now.getTime();
  }

  // Auto bidder: the bid EA accepts next (starting bid if nobody bid yet, else one step up), and
  // which auctions to bid on: ending within maxSecs (but not in the last 3 s), not already ours,
  // next bid within maxBid; soonest first.
  function nextBid(cur, start) { return cur > 0 ? cur + stepFor(cur) : Math.max(MIN_PRICE, start | 0); }
  function bidPick(rows, maxBid, maxSecs) {
    return (rows || []).filter(function (r) { return r && r.secs != null && r.secs > 3 && r.secs <= maxSecs && !r.mine; })
      .map(function (r) { return Object.assign({}, r, { bid: nextBid(r.cur, r.start) }); })
      .filter(function (r) { return r.bid <= maxBid; })
      .sort(function (a, b) { return a.secs - b.secs; });
  }

  // Dashboard range: 0 today, 1 last 7 days, 2 last 30 days, 3 all time -> start time in ms.
  var RANGES = ['Today', '7 days', '30 days', 'All'];
  function rangeStart(r, now) { if ((r | 0) >= 3) return 0; var d = new Date(now.getTime()); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - [0, 6, 29][r | 0]); return d.getTime(); }
  // Local calendar day 'YYYY-MM-DD' (per-day search counts).
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sumDays(map, sinceMs) {
    var sum = 0; Object.keys(map || {}).forEach(function (k) { var p = k.split('-'); if (new Date(+p[0], +p[1] - 1, +p[2]).getTime() >= sinceMs) sum += map[k] | 0; });
    return sum;
  }

  // Bulk list: cards waiting on the transfer list (not listed, or expired), grouped by exact card
  // version, most copies first. rows: [{def, name, rating, state, tradable, player, it}].
  function bulkGroups(rows) {
    var by = {}, out = [];
    (rows || []).forEach(function (r) {
      if (!r || r.def == null || !r.player || r.tradable === false) return;
      if (r.state !== 'unlisted' && r.state !== 'expired') return;
      var k = String(r.def), g = by[k];
      if (!g) { g = by[k] = { def: r.def, name: r.name || 'Card', rating: r.rating || null, count: 0, expired: 0, items: [] }; out.push(g); }
      g.count++; if (r.state === 'expired') g.expired++; g.items.push(r.it);
    });
    return out.sort(function (a, b) { return b.count - a.count || String(a.name).localeCompare(String(b.name)); });
  }
  // One Buy Now (and start) price for a bulk listing: snapped down to EA's price steps; start is one
  // step under Buy Now unless given. Returns {buy, start, adjusted} or {err}.
  function bulkPrices(buyNow, start) {
    var raw = Number(String(buyNow == null ? '' : buyNow).replace(/[^\d]/g, '')) || 0, b = floorStep(raw);
    if (!(b >= MIN_PRICE + stepFor(MIN_PRICE))) return { err: 'Set a Buy Now price of at least ' + (MIN_PRICE + stepFor(MIN_PRICE)) + '.' };
    var rs = Number(String(start == null ? '' : start).replace(/[^\d]/g, '')) || 0;
    var s = rs > 0 ? floorStep(rs) : floorStep(b - stepFor(b));
    if (s < MIN_PRICE) s = MIN_PRICE;
    if (s >= b) return { err: 'The start price must be below the Buy Now price.' };
    return { buy: b, start: s, adjusted: b !== raw || (rs > 0 && s !== rs) };
  }

  // Latest checked price per named card, newest first, for the Kartenscan app: [[name, price, time], ...].
  // Generic labels ("player #123", "any card") are left out: they name no player.
  function scanExport(history, max) {
    var seen = {}, out = [];
    (history || []).slice().sort(function (a, b) { return b.t - a.t; }).forEach(function (h) {
      var n = String(h.name || '').trim();
      if (!n || !(h.p > 0) || /^(player( #\d+)?|any card|card)$/i.test(n)) return;
      var k = n.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      out.push([n, h.p, h.t]);
    });
    return out.slice(0, max || 300);
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { EA_TAX: EA_TAX, MIN_PRICE: MIN_PRICE, FEW: FEW, stepFor: stepFor, roundStep: roundStep, floorStep: floorStep, afterTax: afterTax, profitAt: profitAt, snipePoint: snipePoint, isFreshSecs: isFreshSecs, pickMarketPrice: pickMarketPrice, probeMid: probeMid, probeVerdict: probeVerdict, nextProbe: nextProbe, humanGapMs: humanGapMs, nextMood: nextMood, fuzzyCount: fuzzyCount, parseCoins: parseCoins, sellAndSnipe: sellAndSnipe, baseIdOf: baseIdOf, safetyStatus: safetyStatus, profitCurve: profitCurve, TOO_MANY: TOO_MANY, tooManyResults: tooManyResults, outsideRange: outsideRange, isSpecialBuy: isSpecialBuy, hasRarityFilter: hasRarityFilter, nextMinBid: nextMinBid, breakEven: breakEven, repriceFloor: repriceFloor, cardTrends: cardTrends, marketIndex: marketIndex, scanExport: scanExport, bulkGroups: bulkGroups, bulkPrices: bulkPrices, stepGap: stepGap, startDelayMs: startDelayMs, rangeStart: rangeStart, dayKey: dayKey, sumDays: sumDays, nextBid: nextBid, bidPick: bidPick };
  }

  // ---------- settings & storage ----------
  var LS_KEY = 'futSnipe.settings.v3', LIFE_KEY = 'futSnipe.lifetime.v1';
  var FILT_KEY = 'futSnipe.filters.v1', SESS_KEY = 'futSnipe.sessions.v1', PRICE_KEY = 'futSnipe.prices.v1';
  var DEFAULTS = {
    minProfit: 500, listDur: 3600, afterBuy: 0, keepMax: 0, keepMin: 0, tooManyStop: 1, rangeStop: 1, varyMinBid: 1, keepSpecials: 1, clearSold: 2, relistExpired: 1, repriceExpired: 1, packMin: 1000, badges: 1, sound: 1, vibrate: 1, speed: 1, runMinutes: 0,
    gapMinMs: 3500, gapMaxMs: 5500, buyGapMinMs: 500, buyGapMaxMs: 1100, sellPrice: 0,
    breakEvery: 30, breakSec: 90, sessionBuyCap: 15, dailyBuyCap: 150, reprobeEvery: 50, hubRange: 3, bidMode: 0, bidCap: 5, bidSecs: 90, snipeFrom: 1, profitTol: 10
  };
  var LIST_DURS = [['1h', 3600], ['3h', 10800], ['6h', 21600], ['12h', 43200], ['1d', 86400], ['3d', 259200]];
  var HARD_FLOOR_MS = 300;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();
  // Auto/Custom switches (0 = Auto). Old saves with own values start on Custom.
  var rawCfg = {}; try { rawCfg = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) {}
  if (!('cRun' in rawCfg)) cfg.cRun = cfg.runMinutes > 0 ? 1 : 0;
  if (!('cCap' in rawCfg)) cfg.cCap = cfg.sessionBuyCap !== 15 ? 1 : 0;
  if (!('cCoins' in rawCfg)) cfg.cCoins = 0;
  if (!('cBreaks' in rawCfg)) cfg.cBreaks = cfg.breakEvery !== 30 || cfg.breakSec !== 90 ? 1 : 0;
  // What the run actually uses: Auto = no time limit, stop after 15 buys, stop when out of coins,
  // a ~90 s break every ~30 searches. Custom = your values (break every 0 = no breaks).
  function runLimitMin() { return cfg.cRun ? (cfg.runMinutes | 0) : 0; }
  function buyCapNow() { return cfg.cCap ? Math.max(1, cfg.sessionBuyCap | 0) : 15; }
  function breakEveryNow() { return cfg.cBreaks ? (cfg.breakEvery | 0) : 30; }
  function breakSecNow() { return cfg.cBreaks ? cfg.breakSec : 90; }
  if (!(cfg.reprobeEvery >= 30 && cfg.reprobeEvery <= 120)) cfg.reprobeEvery = 50; // old saves had 20
  var oldLook = ['theme', 'wallDim', 'wallBlur', 'wallRun', 'petals', 'mascot', 'mascotSize', 'mascotVoice'].filter(function (k) { return k in cfg; });
  if (oldLook.length) { oldLook.forEach(function (k) { delete cfg[k]; }); save(); } // old look settings
  try { localStorage.removeItem('futSnipe.wall.v1'); } catch (e) {} // old wallpaper (could be large)
  if (cfg.autoClearSold === 0 && cfg.clearSold === 2) { cfg.clearSold = 0; delete cfg.autoClearSold; } // old on/off switch
  // Speed sets only the search/buy cadence (breaks are configured separately).
  // Random gap between searches: Turbo 0.6-1.2s, Normal 3.5-5.5s, Night 6.5-9.5s (overnight runs),
  // Custom = your own gap from the -/+ buttons (0.2 s per tap, never under 0.4 s).
  function applySpeed() {
    var s = cfg.speed | 0;
    if (s === 3) { var cg = stepGap(cfg.gapMinMs, cfg.gapMaxMs, 0); cfg.gapMinMs = cg.min; cfg.gapMaxMs = cg.max; }
    else if (s === 2) { cfg.gapMinMs = 600; cfg.gapMaxMs = 1200; cfg.buyGapMinMs = 300; cfg.buyGapMaxMs = 700; }
    else if (s === 0) { cfg.gapMinMs = 6500; cfg.gapMaxMs = 9500; cfg.buyGapMinMs = 900; cfg.buyGapMaxMs = 1800; }
    else { cfg.gapMinMs = 3500; cfg.gapMaxMs = 5500; cfg.buyGapMinMs = 500; cfg.buyGapMaxMs = 1100; }
    delete cfg.searchMinMs; delete cfg.searchJitterMs; // old settings
  }
  var SPEEDS = ['Night', 'Normal', 'Turbo', 'Custom'];
  function secs(ms) { return String(Math.round(ms / 100) / 10); }
  function gapLabel() { return secs(cfg.gapMinMs) + '–' + secs(cfg.gapMaxMs) + 's'; }
  function speedHint() { return 'a random ' + gapLabel() + ' between searches' + ((cfg.speed | 0) === 0 ? ' · overnight' : '') + '. + = 0.2 s faster, − = 0.2 s slower.'; }
  // dir +1 = faster (0.2 s shorter gaps), -1 = slower. Turns the speed into Custom.
  function speedStep(dir) { var g = stepGap(cfg.gapMinMs, cfg.gapMaxMs, dir > 0 ? -200 : 200); cfg.speed = 3; cfg.gapMinMs = g.min; cfg.gapMaxMs = g.max; }
  applySpeed();

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }
  function loadLife() { return lsGet(LIFE_KEY, { bought: 0, spent: 0, est: 0 }); }
  function saveLife() { lsSet(LIFE_KEY, life); if (typeof saveSearchDays === 'function') saveSearchDays(); }
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
  // Searches per local day (last 40 days) for the dashboard range. Saved with the lifetime stats.
  var searchDays = lsGet('futSnipe.searchDays', {}), searchDaysDirty = false;
  function saveSearchDays() { if (!searchDaysDirty) return; searchDaysDirty = false; var ks = Object.keys(searchDays).sort(); ks.slice(0, Math.max(0, ks.length - 40)).forEach(function (k) { delete searchDays[k]; }); lsSet('futSnipe.searchDays', searchDays); }
  function searchesToday() { var d = lsGet('futSnipe.dailyS', {}); return d.date === today() ? (d.n | 0) : 0; }
  var searchesUnsaved = 0;
  function countSearch() {
    life.searches = (life.searches || 0) + 1;
    var d = lsGet('futSnipe.dailyS', {}); lsSet('futSnipe.dailyS', { date: today(), n: (d.date === today() ? (d.n | 0) : 0) + 1 });
    var k = dayKey(new Date()); searchDays[k] = (searchDays[k] | 0) + 1; searchDaysDirty = true;
    if (++searchesUnsaved >= 10) { searchesUnsaved = 0; saveLife(); saveSearchDays(); }
  }

  // ---------- run state (resetRun() clears it on every Start) ----------
  var startAt = ''; // session only: 'HH:MM' = Start waits until then
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
    nextBreakAt = fuzzyCount(breakEveryNow() || 30, 0.25); nextCheckAt = fuzzyCount(cfg.reprobeEvery, 0.2);
    startCoins = coins(); startTs = Date.now();
  }

  // ---------- EA services ----------
  function svc() { return window.services || (window.App && window.App.services) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }

  // Remember the user's own market search so Start knows which player to trade.
  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    ['searchTransferMarket', 'search'].forEach(function (name) {
      if (typeof s.Item[name] !== 'function') return;
      var orig = s.Item[name].bind(s.Item);
      s.Item[name] = function (criteria) { try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; capturedPlain = plainCriteria(criteria); capturedName = readSearchName(); render(); } } catch (e) {} return orig.apply(null, arguments); };
    });
    s.Item.__futWrapped = true;
  }

  var URLMAP = { num: 'count', start: 'start', type: 'type', maskedDefId: 'maskedDefId', cat: 'category', lev: 'level', maxb: 'maxBuy', minb: 'minBuy', micr: 'minBid', macr: 'maxBid', pos: 'preferredPosition', zone: 'zone', nat: 'nationality', leag: 'league', team: 'team', playStyle: 'playStyle', rarities: 'rarities' };
  var FIELDS = ['type', 'category', 'level', 'maskedDefId', 'defId', 'preferredPosition', 'zone', 'nationality', 'league', 'team', 'playStyle', 'rarities', 'minBid', 'maxBid', 'minBuy', 'maxBuy', 'count'];
  function plainCriteria(c) { var o = {}; try { FIELDS.forEach(function (k) { if (c[k] !== undefined && c[k] !== null && c[k] !== '') o[k] = c[k]; }); } catch (e) {} return o; }
  function criteriaFromUrl(u) {
    try { var q = u.split('?')[1]; if (!q) return null; var o = { __fromUs: true };
      q.split('&').forEach(function (kv) { var p = kv.split('='), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || ''), key = URLMAP[k]; if (!key) return; var n = Number(v); o[key] = (v !== '' && !isNaN(n)) ? n : v; });
      return Object.keys(o).length > 1 ? o : null;
    } catch (e) { return null; }
  }
  function ctor() { return window.UTSearchCriteriaDTO || (window.App && window.App.UTSearchCriteriaDTO) || null; }
  function applyFields(t, s) { for (var k in s) { if (k !== '__fromUs' && s[k] !== undefined && s[k] !== '') { try { t[k] = s[k]; } catch (e) {} } } return t; }
  // The user's search (player, rarity, ...) but with OUR prices: their own max-buy / min-buy /
  // bid filters are dropped so they can't skew the price check. maxBuy 0 = no limit.
  function buildCriteria(maxBuy, minBuy, minBid, maxBid) {
    var out;
    if (capturedCriteria && !searchBase) out = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria);
    else { var C = ctor(); var src = searchBase || capturedFromUrl || capturedPlain || { type: 'player', category: 'any', count: 50 }; out = C ? applyFields(new C(), src) : Object.assign({}, src); }
    try { out.minBuy = minBuy > 0 ? minBuy : 0; out.minBid = minBid > 0 ? minBid : 0; out.maxBid = maxBid > 0 ? maxBid : 0; out.maxBuy = maxBuy > 0 ? maxBuy : 0; out.offset = 0; } catch (e) {}
    out.__fromUs = true; return out;
  }
  function haveSearch() { return !!(capturedCriteria || capturedFromUrl || capturedPlain); }
  function priceOf(it) { return it && ((it._auction && it._auction.buyNowPrice) != null ? it._auction.buyNowPrice : (it.buyNowPrice != null ? it.buyNowPrice : (it.buyNow != null ? it.buyNow : null))); }
  function defIdOf(it) { try { return (it.definitionId != null ? it.definitionId : (it._staticData && it._staticData.id) || (it.resourceId) || (it.id)) || null; } catch (e) { return null; } }
  function expiresOf(it) { try { var a = it._auction || {}; if (a.expires != null) return a.expires; if (a.timeRemaining != null) return a.timeRemaining; var et = it.endTime || a.endTime; if (et) { var now = Date.now(); if (et > 1e12) return Math.round((et - now) / 1000); if (et > 1e9) return Math.round((et * 1000 - now) / 1000); } return null; } catch (e) { return null; } }
  function ratingOf(it) { try { var r = it.rating != null ? it.rating : (it._staticData && it._staticData.rating); return r > 0 ? r : null; } catch (e) { return null; } }
  function nameOf(it) { try { return (it._staticData && it._staticData.name) || it.name || (it.getStaticData && it.getStaticData().name) || null; } catch (e) { return null; } }
  // ---------- player name (instead of "player #231747") ----------
  // 1) the name in the market search box when you searched, 2) EA's own static player data,
  // 3) EA's item lookup by id (async), 4) the first search result (doSearch sets curName).
  var capturedName = null;
  function searchedDefId() { var c = capturedPlain || capturedFromUrl; return c ? (c.maskedDefId || null) : null; }
  function readSearchName() {
    try {
      var el = document.querySelector('.ut-player-search-control input, .ut-player-search-control--input-container input, input.ut-text-input-control');
      var v = el && el.value && el.value.trim(); return v && v.length > 1 && v.length < 40 ? v : null;
    } catch (e) { return null; }
  }
  function staticName(defId) {
    try {
      var R = window.repositories && window.repositories.Item, d = R && R.getStaticDataByDefId && R.getStaticDataByDefId(defId);
      if (d) return d.name || (d.lastName ? ((d.firstName ? d.firstName.charAt(0) + '. ' : '') + d.lastName) : null);
    } catch (e) {}
    return null;
  }
  function resolveName() {
    var id = searchedDefId(); if (!id) return;
    curName = curName || staticName(id) || capturedName;
    if (curName || !svc().Item.requestItemByDefId) return;
    try {
      svc().Item.requestItemByDefId(id).observe(OBS, function (s, r) {
        try { var d = r && (r.data || r.response) || {}, it = d.item || (d.items && d.items[0]) || d; var n = nameOf(it); if (n && !curName) { curName = n; render(); } } catch (e) {}
      });
    } catch (e) {}
  }
  function searchLabel() { if (curName) return curName; var id = searchedDefId() || stats.curDefId; return id ? ('player #' + id) : 'any card'; }
  function cardLabel(it) { return nameOf(it) || searchLabel(); } // a bought card's own name (matters when no player is searched)
  function sessionNet() { return (startCoins != null && coins() != null) ? coins() - startCoins : null; }

  // EA's allowed price range per card. Read from (a) the item itself, (b) the requestMarketData
  // response, or (c) any /pricelimits response the web app loads (see the XHR hook). Cached by
  // item id and by card id; the last raw response shape goes into the diagnostics.
  var limitsCache = {}, limitsDebug = null;
  function readLimitsObj(o) {
    if (!o) return null;
    var mn = o.minimum != null ? o.minimum : o.minPrice != null ? o.minPrice : o.min, mx = o.maximum != null ? o.maximum : o.maxPrice != null ? o.maxPrice : o.max;
    return mx > 0 ? { min: mn || 0, max: mx } : null;
  }
  function rememberLimits(list) {
    (list || []).forEach(function (x) { var l = readLimitsObj(x); if (!l) return; if (x.itemId != null) limitsCache['i' + x.itemId] = l; if (x.defId != null) limitsCache['d' + x.defId] = l; });
  }
  // EA's reply shape varies (seen: { marketData: ... }): collect every object in it that carries a
  // min/max price, up to a few levels deep, normalising the id fields.
  function findLimits(o, depth, out) {
    if (!o || typeof o !== 'object' || depth > 4) return out;
    if (Array.isArray(o)) { o.forEach(function (x) { findLimits(x, depth + 1, out); }); return out; }
    if (readLimitsObj(o)) out.push({ itemId: o.itemId != null ? o.itemId : o.id, defId: o.defId != null ? o.defId : (o.definitionId != null ? o.definitionId : o.resourceId), minPrice: readLimitsObj(o).min, maxPrice: readLimitsObj(o).max });
    for (var k in o) if (o[k] && typeof o[k] === 'object') findLimits(o[k], depth + 1, out);
    return out;
  }
  function cachedLimits(item) { return limitsCache['i' + item.id] || limitsCache['d' + defIdOf(item)] || null; }
  function priceLimits(item) {
    return new Promise(function (res) {
      var fromItem = function () { try { return (item.getPriceLimits && readLimitsObj(item.getPriceLimits())) || readLimitsObj(item._itemPriceLimits); } catch (e) { return null; } };
      var have = cachedLimits(item) || fromItem(); if (have) return res(have);
      try {
        if (!svc().Item.requestMarketData) return res(null);
        var to = setTimeout(function () { res(cachedLimits(item) || fromItem()); }, 8000);
        svc().Item.requestMarketData(item).observe(OBS, function (s, r) {
          clearTimeout(to);
          try {
            var d = r && (r.data || r.response), found = findLimits(d, 0, []);
            limitsDebug = { keys: d ? Object.keys(d).slice(0, 12) : null, sample: d ? JSON.stringify(d).slice(0, 400) : null, found: found.length };
            rememberLimits(found);
            // one price range in the reply and no ids on it: it's this card's
            if (found.length === 1 && found[0].itemId == null && found[0].defId == null) { var l1 = readLimitsObj(found[0]); if (l1) limitsCache['i' + item.id] = l1; }
          } catch (e) {}
          var l = cachedLimits(item) || fromItem(); if (l) { limitsCache['i' + item.id] = l; limitsCache['d' + defIdOf(item)] = l; }
          res(l);
        });
      } catch (e) { res(null); }
    });
  }

  function classify(resp, http) {
    var code = (resp && (resp.status || resp.error || (resp.data && resp.data.code))) || http || 0;
    if (code === 429) return { stop: true, msg: 'EA soft-ban (429) — wait, then restart' };
    if (code === 459 || code === 460 || /captcha/i.test(JSON.stringify(resp || ''))) return { stop: true, msg: 'Captcha — solve it, then restart' };
    if (code === 461 || code === 462 || code === 478) return { stop: false, msg: 'already gone' };
    if (code === 473) return { stop: false, msg: 'list full' };
    if (code === 494) return { stop: true, msg: 'account blocked' };
    return { stop: false, msg: 'request failed (' + code + ')' };
  }
  // One market search. Returns {ok, items: [{it, p, secs}] sorted cheapest first}.
  function doSearch(maxBuy, minBuy, minBid, maxBid) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
      try { try { svc().Item.clearTransferMarketCache(); } catch (e) {}
        svc().Item.searchTransferMarket(buildCriteria(maxBuy, minBuy, minBid, maxBid), 1).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          var raw = (resp && ((resp.data && resp.data.items) || (resp.response && resp.response.items))) || [];
          var ok = !!(resp && (resp.success === true || (resp.success == null && resp.status != null && resp.status < 400) || raw.length));
          if (!ok) return finish({ ok: false, items: [], err: classify(resp) });
          if (raw.length && !sampleKeys.length) { try { sampleKeys = Object.keys(raw[0]); samplePrice = priceOf(raw[0]); } catch (e) {} }
          var items = [];
          for (var i = 0; i < raw.length; i++) {
            var p = priceOf(raw[i]); if (!(p > 0)) continue;
            if (matchId != null && String(defIdOf(raw[i])) !== String(matchId)) continue; // pricing one exact card version
            items.push({ it: raw[i], p: p, secs: expiresOf(raw[i]) });
          }
          items.sort(function (a, b) { return a.p - b.p; });
          if (items.length && !searchBase && searchedDefId()) { // a specific player was searched (a rarity-only search stays "any card"): name/id from a result of the searched card itself, not a special version of it
            var base = searchedDefId(), own = items.filter(function (x) { return !base || String(defIdOf(x.it)) === String(base); })[0] || items[0];
            if (!curName) curName = nameOf(own.it); stats.curDefId = defIdOf(own.it) || stats.curDefId;
          }
          finish({ ok: true, items: items });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, items: [], err: { msg: 'search error: ' + e } }); }
    });
  }
  function doBuy(item, price) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, err: { msg: 'bid timeout' } }); }, 15000);
      try { svc().Item.bid(item, price).observe(OBS, function (sender, resp) { clearTimeout(to); if (resp && resp.success) finish({ ok: true }); else finish({ ok: false, err: classify(resp) }); });
      } catch (e) { clearTimeout(to); finish({ ok: false, err: { msg: 'bid error: ' + e } }); }
    });
  }
  function moveToTransfer(item) { return new Promise(function (res) { try { var P = window.ItemPile && window.ItemPile.TRANSFER; if (P == null || !svc().Item.move) return res(false); svc().Item.move(item, P).observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }
  function listItem(item, start, buyNow, dur) { return new Promise(function (res) { try { if (!svc().Item.list) return res(false); svc().Item.list(item, start, buyNow, dur).observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { return res(false); } }); }

  // Transfer list: expired (unsold) cards, and EA's own "Re-list all" (same price + duration as before).
  function isExpired(it) { try { var a = it._auction || {}; return a.tradeState === 'expired' || (it.getAuctionData && it.getAuctionData().isExpired && it.getAuctionData().isExpired()); } catch (e) { return false; } }
  function transferItems() { return new Promise(function (res) { try { if (!svc().Item.requestTransferItems) return res(null); svc().Item.requestTransferItems().observe(OBS, function (s, r) { res(r && r.success ? ((r.data && r.data.items) || (r.response && r.response.items) || []) : null); }); } catch (e) { res(null); } }); }
  function tradeStateOf(it) { try { return (it._auction && it._auction.tradeState) || (it.getAuctionData && it.getAuctionData().tradeState) || null; } catch (e) { return null; } }
  function isSold(it) { return tradeStateOf(it) === 'closed'; }
  function salePriceOf(it) { var a = (it && it._auction) || {}; return a.currentBid > 0 ? a.currentBid : (a.buyNowPrice > 0 ? a.buyNowPrice : 0); }
  function isTradable(it) { try { if (typeof it.isTradeable === 'function') return !!it.isTradeable(); } catch (e) {} return it.tradable !== false && !(it.untradeableCount > 0); }
  function isPlayer(it) { try { return it.type === 'player' || (typeof it.isPlayer === 'function' && it.isPlayer()); } catch (e) { return false; } }
  function unassignedItems() { return new Promise(function (res) { try { if (!svc().Item.requestUnassignedItems) return res(null); svc().Item.requestUnassignedItems().observe(OBS, function (s, r) { res(r && r.success ? ((r.data && r.data.items) || (r.response && r.response.items) || []) : null); }); } catch (e) { res(null); } }); }
  // My Club: one page of club players. EA's club search isn't documented; this tries
  // services.Club.search with a player search and gives up after 10 s (diagnostics list the
  // Club methods if it doesn't work).
  function clubPage(offset, count) {
    return new Promise(function (res) {
      var to = setTimeout(function () { res(null); }, 10000), done = function (v) { clearTimeout(to); res(v); };
      try {
        var C = svc().Club; if (!C || typeof C.search !== 'function') return done(null);
        var Ct = ctor(), c = Ct ? new Ct() : {}; c.type = 'player'; c.count = count; c.offset = offset;
        C.search(c).observe(OBS, function (s, r) { done(r && r.success ? ((r.data && r.data.items) || (r.response && r.response.items) || []) : null); });
      } catch (e) { done(null); }
    });
  }
  async function clubPlayers() {
    var all = [], PAGE = 90;
    for (var p = 0; p < 8; p++) {
      var items = await clubPage(p * PAGE, PAGE); if (!items) return p ? all : null;
      all = all.concat(items); if (items.length < PAGE) break;
      await sleep(rand(700, 1500));
    }
    return all;
  }
  // Auto bidder: auction data of a card, the watchlist (cards you bid on), and removing a lost one.
  function auctionOf(it) { var a = (it && it._auction) || {}; return { cur: a.currentBid | 0, start: a.startingBid | 0, bidState: a.bidState || null, tradeState: a.tradeState || null }; }
  function watchedItems() { return new Promise(function (res) { var to = setTimeout(function () { res(null); }, 12000); try { if (!svc().Item.requestWatchedItems) return res(null); svc().Item.requestWatchedItems().observe(OBS, function (s, r) { clearTimeout(to); res(r && r.success ? ((r.data && r.data.items) || (r.response && r.response.items) || []) : null); }); } catch (e) { res(null); } }); }
  function untargetItem(it) { return new Promise(function (res) { try { if (!svc().Item.untarget) return res(false); svc().Item.untarget([it]).observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }
  function clearSold() { return new Promise(function (res) { try { if (!svc().Item.clearSoldItems) return res(false); svc().Item.clearSoldItems().observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }
  function relistAllExpired() { return new Promise(function (res) { try { if (!svc().Item.relistExpiredAuctions) return res(false); svc().Item.relistExpiredAuctions().observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }

  // Remembers the user's market searches (URL) and stops the bot on a 429.
  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { var u = String(self.__u || ''), get = (self.__m || 'GET').toUpperCase() === 'GET';
          if (/transfermarket\?/i.test(u) && get) {
            tmUrls.unshift(u); tmUrls = tmUrls.slice(0, 5);
            if (!running) { var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; capturedName = readSearchName(); render(); } } // the bot's own searches don't count
          }
          if (/pricelimits/i.test(u) && self.status === 200) { try { var pl = self.responseType === 'json' ? self.response : JSON.parse(self.responseText); rememberLimits(Array.isArray(pl) ? pl : (pl && (pl.itemPriceLimits || pl.priceLimits)) || []); } catch (e) {} }
          if (/transfermarket|\/trade/i.test(u) && self.status === 429) { var r = self.getResponseHeader && self.getResponseHeader('Retry-After'); requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart'); }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();

  // ---------- the one-button run: check price -> snipe -> relist -> re-check ----------
  function recordSession() {
    var net = sessionNet();
    if (stats.buys > 0 || (net != null && net !== 0)) {
      sessions.unshift({ t: Date.now(), buys: stats.buys, spent: stats.spent, est: stats.est, net: net });
      sessions = sessions.slice(0, 60); lsSet(SESS_KEY, sessions);
    }
  }
  function requestStop(reason) { if (!running) return; running = false; phase = 'idle'; stopReason = reason; if (/429|captcha|blocked/i.test(reason)) life.lastBlock = Date.now(); saveLife(); recordSession(); var m = /^(stopped|done)/i.test(reason) ? reason.charAt(0).toUpperCase() + reason.slice(1) : 'Stopped: ' + reason; say(m); feed(m, 'stop'); render(); }

  async function wait(ms) { for (var x = 0; x < ms && running; x += 250) await sleep(Math.min(250, ms - x)); return running; }
  // Human-like gap between searches (never below the speed setting, never exactly the same,
  // sometimes a longer pause). Price-check searches go faster (~0.6x): they're quick look-ups of
  // a few prices, and the check is done in a handful of searches.
  var tempo = { bias: 0, left: 0 };
  function pace(slow) {
    if (--tempo.left <= 0) tempo = nextMood();
    return wait(Math.max(HARD_FLOOR_MS, humanGapMs(cfg.gapMinMs, cfg.gapMaxMs, tempo.bias) * (slow ? 0.6 : 1)));
  }
  // A counted, paced search. null = the run stopped (captcha / 429 / Stop).
  async function search(maxBuy, slow, minBuy, minBid, maxBid) {
    if (!(await pace(slow))) return null;
    var r = await doSearch(maxBuy, minBuy, minBid, maxBid); if (!running) return null;
    stats.searches++; stats.sinceBreak++; countSearch();
    if (!r.ok && (r.err || {}).stop) { requestStop(r.err.msg); return null; }
    if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0].it).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
    return r;
  }
  // Long breaks every ~breakEvery searches (the exact number changes every time).
  async function maybeBreak() {
    if (!running || !breakEveryNow() || stats.sinceBreak < nextBreakAt) return;
    stats.sinceBreak = 0; nextBreakAt = fuzzyCount(breakEveryNow(), 0.25);
    var base = Math.max(5, breakSecNow()) * 1000, br = rand(Math.round(base * 0.8), Math.round(base * 1.2));
    var back = phase; phase = 'break'; say('On a break (' + Math.round(br / 1000) + 's)…'); feed('Break ' + Math.round(br / 1000) + 's', 'break'); render();
    await wait(br);
    if (running) phase = back; render();
  }

  // Price of the current search: one search with NO max-buy, then lower/raise max-buy like a
  // person would (start at a known price, else the cheapest listing seen, step ~12%, then halve
  // the gap) until only a few listings are left, and take the 2nd-cheapest fresh one.
  // Returns {price, fresh} or null (none listed / stopped).
  async function findPrice(start) {
    var asListings = function (items) { return items.map(function (x) { return { price: x.p, secs: x.secs }; }); };
    var r = await search(0, true); if (!r) return null;
    feed('Checking ' + searchLabel() + ' · ' + (r.items.length ? r.items.length + ' listed' : 'none listed'), 'check');
    if (!r.ok || !r.items.length) return null;
    if (probeVerdict(asListings(r.items)) === 'few') return pickMarketPrice(asListings(r.items)); // tiny market: that's all there is
    var top = r.items[r.items.length - 1].p, lo = 0, hi = 0, hiItems = null, few = null;
    // start at a known price, else the cheapest FRESH listing seen (a stale cheap outlier would cost extra steps)
    var firstFresh = r.items.filter(function (x) { return isFreshSecs(x.secs); })[0] || r.items[0];
    var probe = Math.min(top, start > 0 ? floorStep(start) : roundStep(firstFresh.p));
    for (var tries = 0; probe && tries < 12 && running; tries++) {
      var pr = await search(probe, true); if (!pr) return null;
      if (!pr.ok) { feed('Search failed (' + ((pr.err || {}).msg || '?') + ')', 'miss'); continue; }
      market.probeMax = probe; market.probeCount = pr.items.length;
      var v = probeVerdict(asListings(pr.items));
      feed('Checking ' + searchLabel() + ' ≤ ' + fmt(probe) + ' · ' + (pr.items.length > FEW ? FEW + '+' : pr.items.length) + ' listed', 'check'); render();
      if (v === 'few') { few = pr.items; break; }
      if (v === 'many') hiItems = pr.items;
      var n = nextProbe(lo, hi, probe, v); lo = n.lo; hi = n.hi; probe = n.next;
    }
    if (!running) return null;
    if (!few) { // boxed in to neighbouring prices: the listings at hi are the cheapest there are
      if (!hiItems && hi) { var hr = await search(hi, true); if (!hr) return null; hiItems = hr.ok ? hr.items : []; }
      few = hiItems || r.items;
    }
    return pickMarketPrice(asListings(few));
  }

  async function checkPrice() {
    phase = 'checking'; market.probeMax = 0; market.probeCount = null;
    say('Checking price for ' + searchLabel() + '…'); render();
    // A player search without a rarity also returns special versions (TOTW, ...): price the normal card only.
    var keepMatch = matchId;
    if (searchedDefId() && !hasRarityFilter(capturedPlain || capturedFromUrl)) matchId = searchedDefId();
    var pick; try { pick = await findPrice(market.price); } finally { matchId = keepMatch; }
    if (!running) return false;
    if (!pick) { feed(searchLabel() + ' · none listed yet', 'miss'); return false; }
    var ss = sellAndSnipe(pick.price, cfg.sellPrice, cfg.minProfit, snipeOpts()), sp = ss.snipe;
    if (!sp) { requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(ss.sell) + ' sell price'); return false; }
    market.price = pick.price; market.fresh = pick.fresh; market.snipe = sp; market.checkedAt = Date.now();
    notePrice(searchedDefId() || stats.curDefId, searchLabel(), pick.price);
    stats.sinceCheck = 0; nextCheckAt = fuzzyCount(cfg.reprobeEvery, 0.2);
    feed('Price ' + searchLabel() + ' ' + fmt(pick.price) + (pick.fresh ? '' : ' (no fresh)') + (cfg.sellPrice > 0 ? ' · sell at ' + fmt(ss.sell) + ' (yours)' : '') + ' → snipe ≤ ' + fmt(sp) + ' · +' + fmt(profitAt(ss.sell, sp)), 'price');
    say('Sniping ' + searchLabel() + ' ≤ ' + fmt(sp));
    phase = 'running'; render();
    return true;
  }

  // After a buy: List (price check + auto-relist, as always), or keep it: move it to the transfer
  // list unlisted, or leave it in Unassigned. Keep modes skip the price check and buy at a price
  // you set (keepMax, optional keepMin).
  // Profit from your own sell price (default) or from the lower of sell / market; +/- tolerance.
  function snipeOpts() { return { fromSell: (cfg.snipeFrom | 0) === 1, tol: (cfg.profitTol | 0) / 100 }; }
  function keepMode() { return (cfg.afterBuy | 0) !== 0; }
  // Manual mode buys at the "Max. Buy Now" (and from the "Min. Buy Now") you typed into the web
  // app's own search. The bot's fields in Settings are only a fallback for a search without one.
  function webCrit() { return capturedPlain || capturedFromUrl || null; }
  function webMaxBuy() { var c = webCrit(); return c && c.maxBuy > 0 ? Number(c.maxBuy) : 0; }
  function keepMaxNow() { return webMaxBuy() || (cfg.keepMax | 0); }
  function keepMinNow() { var c = webCrit(); return c && c.minBuy > 0 ? Number(c.minBuy) : (cfg.keepMin | 0); }
  // Where bought cards get listed: your manual sell price, else the checked market price.
  function listPrice() { return cfg.sellPrice > 0 ? roundStep(cfg.sellPrice) : market.price; }
  // Sell price or target profit changed (also mid-run): move the snipe point with it.
  function applySell() {
    if (keepMode() || !(market.price > 0)) return;
    var ss = sellAndSnipe(market.price, cfg.sellPrice, cfg.minProfit, snipeOpts());
    if (!ss.snipe) return running && requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(ss.sell) + ' sell price');
    market.snipe = ss.snipe;
    if (running) { feed('Sell at ' + fmt(ss.sell) + (cfg.sellPrice > 0 ? ' (yours)' : ' (auto)') + ' → snipe ≤ ' + fmt(ss.snipe) + ' · +' + fmt(profitAt(ss.sell, ss.snipe)), 'price'); say('Sniping ' + searchLabel() + ' ≤ ' + fmt(ss.snipe)); }
  }
  async function afterBuy(item) {
    if (!keepMode()) return relist(item);
    if (cfg.afterBuy === 2) { feed(cardLabel(item) + ' left in Unassigned', 'list'); return; }
    await sleep(rand(1200, 3000)); // still moves if you tap Stop meanwhile
    var ok = await moveToTransfer(item);
    feed(ok ? cardLabel(item) + ' moved to transfer list (not listed)' : 'Move to transfer list failed (full?) - card is in Unassigned', ok ? 'list' : 'stop');
  }

  // A special version caught by a player search: keep it on the transfer list unlisted, price-check
  // that exact card and tell you what it's worth.
  async function keepSpecial(item, price) {
    await sleep(rand(1200, 3000));
    var moved = await moveToTransfer(item);
    feed('⚠ Special version bought for ' + fmt(price) + ' - kept ' + (moved ? 'on the transfer list' : 'in Unassigned') + ', not listed', 'stop');
    if (!running) return;
    var pick = await withCard(item, function () { return findPrice(price); });
    if (pick) feed('⚠ That special card is worth ≈ ' + fmt(pick.price) + ' (you paid ' + fmt(price) + ') - list it yourself', 'price');
  }
  // Price range stop: EA's allowed range for this card. Unknown range = not checked (said once).
  var rangeUnknownSaid = false;
  async function rangeOk(item, price) {
    if (!cfg.rangeStop) return true;
    var lim = await priceLimits(item);
    if (!lim) { if (!rangeUnknownSaid) { rangeUnknownSaid = true; feed('EA price range not available - range stop can\u2019t check', 'miss'); } return true; }
    if (!outsideRange(price, lim)) return true;
    feed('⛔ ' + fmt(price) + ' is outside EA\u2019s range ' + fmt(lim.min) + '–' + fmt(lim.max) + ' - not listed', 'stop');
    return false;
  }

  async function relist(item) {
    var sell = listPrice(); if (!(sell > 0)) return;
    await sleep(rand(1500, 4000)); // still lists if you tap Stop meanwhile: a bought card shouldn't sit unlisted
    var moved = await moveToTransfer(item);
    await sleep(rand(600, 1200));
    if (!(await rangeOk(item, sell))) return requestStop('price range stop: list price ' + fmt(sell) + ' is outside EA\u2019s range');
    var ok = await listItem(item, Math.max(MIN_PRICE, sell - stepFor(sell)), sell, cfg.listDur || 3600);
    if (ok) noteList(item.id, sell);
    feed(ok ? cardLabel(item) + ' listed for ' + fmt(sell) + ' · ' + durLabel(cfg.listDur) : 'Listing failed' + (moved ? '' : ' (move failed)') + ' - list it by hand', ok ? 'list' : 'stop');
    if (ok) await hubPass(true);
  }

  // Buy everything at or below the snipe point (any freshness), then relist each one.
  var lastMinBid = 0;
  async function snipeOnce() {
    var keep = keepMode(), minB = keep ? keepMinNow() : 0;
    if (cfg.varyMinBid) lastMinBid = nextMinBid(lastMinBid, market.snipe);
    var r = await search(market.snipe, false, minB, cfg.varyMinBid ? lastMinBid : 0); if (!r) return;
    if (!r.ok) { feed(searchLabel() + ' · search failed (' + ((r.err || {}).msg || '?') + ')', 'miss'); return; }
    stats.cheapest = r.items.length ? r.items[0].p : stats.cheapest;
    var hits = r.items.filter(function (x) { return x.p <= market.snipe && x.p >= minB; }).length;
    if (keep && cfg.tooManyStop && tooManyResults(hits)) return requestStop(hits + (hits >= 21 ? '+' : '') + ' cards at ≤ ' + fmt(market.snipe) + ' - is your price right? (too many results stop)');
    var bought = 0;
    for (var j = 0; j < r.items.length && running; j++) {
      var price = r.items[j].p; if (price > market.snipe) break; if (price < minB) continue;
      var bal = coins(); if (bal != null && price > bal) { if (!cfg.cCoins) return requestStop('out of coins (' + fmt(bal) + ' left, card costs ' + fmt(price) + ')'); feed('Not enough coins for ' + fmt(price), 'miss'); continue; }
      var b = await doBuy(r.items[j].it, price); if (!running) return;
      if (b.ok) {
        var it = r.items[j].it, special = !keep && cfg.keepSpecials && isSpecialBuy(defIdOf(it), capturedPlain || capturedFromUrl);
        var e = keep || special ? 0 : profitAt(listPrice(), price);
        stats.buys++; bought++; addDaily(1); lastBuy = 'ok ' + price; noteBuy(r.items[j].it.id, price, cardLabel(r.items[j].it), false, ratingOf(r.items[j].it));
        stats.spent += price; stats.est += e; life.bought++; life.spent += price; life.est += e; saveLife();
        feed(cardLabel(it) + ' sniped for ' + fmt(price) + (keep || special ? '' : ' · +' + fmt(e)), 'hit'); celebrate(cardLabel(it), price, keep || special ? null : e); render();
        if (special) await keepSpecial(it, price); else await afterBuy(it);
      } else { lastBuy = (b.err && b.err.msg) || 'failed'; feed(searchLabel() + ' ' + fmt(price) + ' · ' + lastBuy, 'miss'); if ((b.err || {}).stop) return requestStop(b.err.msg); }
      if (stats.buys >= buyCapNow()) return;
      await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
    }
    if (!bought) { feed(searchLabel() + ' not found · search ' + stats.searches, 'quiet'); setActivity('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe)); }
  }

  // ---------- Auto bidder: bid on auctions about to end, collect the won cards ----------
  // Max bid: your web app search's Max. Bid (else its Max. Buy Now) in Transfer list / Unassigned
  // mode, the checked snipe point in List mode. One bid per card, no bidding wars.
  function bidMode() { return (cfg.bidMode | 0) === 1; }
  function bidMaxNow() { if (!keepMode()) return market.snipe || 0; var c = webCrit(); return floorStep(c && c.maxBid > 0 ? Number(c.maxBid) : keepMaxNow()); }
  var bids = {}; // id -> {it, amt, end, name}
  function openBids() { return Object.keys(bids).length; }
  async function bidOnce() {
    var maxB = bidMaxNow(); if (!(maxB > 0)) return requestStop('no max bid: set a Max. Bid or Max. Buy Now in the web app search');
    var room = Math.max(1, cfg.bidCap | 0) - openBids();
    if (room > 0) {
      var r = await search(0, false, 0, 0, maxB); if (!r) return;
      if (!r.ok) { feed(searchLabel() + ' · search failed (' + ((r.err || {}).msg || '?') + ')', 'miss'); return; }
      var rows = r.items.map(function (x) { var a = auctionOf(x.it); return { it: x.it, id: x.it.id, secs: x.secs, cur: a.cur, start: a.start, mine: a.bidState === 'highest' || !!bids[x.it.id] }; });
      var picks = bidPick(rows, maxB, cfg.bidSecs || 90).slice(0, room), placed = 0;
      for (var i = 0; i < picks.length && running; i++) {
        var pk = picks[i], bal = coins();
        if (bal != null && pk.bid > bal) { if (!cfg.cCoins) return requestStop('out of coins for bids (' + fmt(bal) + ' left)'); break; }
        var b = await doBuy(pk.it, pk.bid); if (!running) return;
        if (b.ok) { placed++; bids[pk.id] = { it: pk.it, amt: pk.bid, end: Date.now() + pk.secs * 1000, name: cardLabel(pk.it) }; feed('Bid ' + fmt(pk.bid) + ' on ' + cardLabel(pk.it) + ' · ends in ' + pk.secs + 's', 'check'); }
        else { feed(cardLabel(pk.it) + ' bid ' + fmt(pk.bid) + ' · ' + ((b.err && b.err.msg) || 'failed'), 'miss'); if ((b.err || {}).stop) return requestStop(b.err.msg); }
        await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
      }
      if (!placed) setActivity('Bidding ' + searchLabel() + ' ≤ ' + fmt(maxB) + ' · ' + openBids() + ' open bid' + (openBids() === 1 ? '' : 's'));
    } else if (!(await pace(false))) return;
    await settleBids();
  }
  // Ended auctions (+8 s): read the watchlist once, keep the won cards (list / move them like a
  // bought card), remove the lost ones from the watchlist.
  async function settleBids() {
    var now = Date.now(), due = Object.keys(bids).filter(function (id) { return bids[id].end + 8000 < now; });
    if (!due.length || !running) return;
    var w = await watchedItems(); if (!w) { feed('Could not read the watchlist', 'miss'); return; }
    var byId = {}; w.forEach(function (it) { byId[String(it.id)] = it; });
    for (var i = 0; i < due.length && running; i++) {
      var b = bids[due[i]], it = byId[String(due[i])], a = auctionOf(it);
      if (it && a.tradeState === 'active') { b.end = Date.now() + 15000; continue; } // still running (EA extends near the end)
      delete bids[due[i]];
      if (it && a.bidState === 'highest') {
        var paid = a.cur || b.amt, keep = keepMode(), e = keep ? 0 : profitAt(listPrice(), paid);
        stats.buys++; addDaily(1); noteBuy(it.id, paid, b.name, false, ratingOf(it)); stats.spent += paid; stats.est += e; life.bought++; life.spent += paid; life.est += e; saveLife();
        feed(b.name + ' won for ' + fmt(paid) + (keep ? '' : ' · +' + fmt(e)), 'hit'); celebrate(b.name, paid, keep ? null : e); render();
        await afterBuy(it);
        if (stats.buys >= buyCapNow()) return;
      } else {
        feed(b.name + ' lost' + (a.cur ? ' (went for ' + fmt(a.cur) + ')' : ''), 'miss');
        if (it) { await sleep(rand(500, 1200)); await untargetItem(it); }
      }
    }
  }

  async function runLoop() {
    while (running) {
      if (stats.buys >= buyCapNow()) return requestStop('stop limit reached (' + buyCapNow() + ' bought)');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (runLimitMin() > 0 && Date.now() - startTs > runLimitMin() * 60000) return requestStop('time limit (' + runLimitMin() + ' min)');
      if (!keepMode() && (!market.snipe || stats.sinceCheck >= nextCheckAt)) { if (market.snipe) feed('Re-checking the price…', 'check'); await checkPrice(); }
      else { if (bidMode()) await bidOnce(); else await snipeOnce(); stats.sinceCheck++; if (running) await hubPass(false); }
      render();
      await maybeBreak();
    }
  }

  function canStart() {
    if (running) return false;
    resetRun(); clearFeed();
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return false; }
    return true;
  }
  // Start at a set time: the run waits (Stop cancels), then starts as if you tapped Start then.
  async function waitForStart() {
    var ms = startDelayMs(startAt, new Date()); if (ms == null) { startAt = ''; return true; }
    var end = Date.now() + ms; running = true; phase = 'waiting';
    feed('Waiting · starts at ' + startAt, 'break');
    while (running && Date.now() < end) {
      var left = end - Date.now(), mins = Math.ceil(left / 60000);
      setActivity('Starts at ' + startAt + ' · in ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min'));
      render(); await wait(Math.min(20000, left));
    }
    if (!running) { startAt = ''; setActivity(''); return false; }
    running = false; phase = 'idle'; startAt = ''; resetRun(); setActivity('');
    return true;
  }
  async function start() {
    if (!canStart()) return;
    if (!haveSearch()) { blockMsg = 'Search a player in the transfer market (or load a filter), then Start.'; render(); return; }
    var flagged = life.lastBlock ? Date.now() - life.lastBlock : null;
    if (flagged != null && flagged < 6 * 3600000 && !window.confirm('EA flagged this account ' + Math.max(1, Math.round(flagged / 60000)) + ' min ago (captcha / 429). Sniping again this soon raises the ban risk.\n\nStart anyway?')) { blockMsg = 'Not started: EA flagged you recently. Wait a few hours.'; render(); return; }
    if (startAt && !(await waitForStart())) return;
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return; }
    resolveName();
    if (keepMode()) {
      var wc = webCrit(), kmax = bidMode() && wc && wc.maxBid > 0 ? Number(wc.maxBid) : keepMaxNow(), kmin = keepMinNow();
      if (!(kmax > 0)) { blockMsg = 'Transfer list / Unassigned mode: type a Max. Buy Now into the web app search, search once, then Start.'; render(); return; }
      if (kmin > kmax) { blockMsg = 'The Min. Buy Now is higher than the Max. Buy Now.'; render(); return; }
      market.snipe = floorStep(kmax); bids = {}; running = true; phase = 'running';
      feed('Start ' + searchLabel() + (bidMode() ? ' · bids ≤ ' + fmt(bidMaxNow()) + ' on auctions ending within ' + (cfg.bidSecs || 90) + 's' : ' · buy ≤ ' + fmt(market.snipe)) + (webMaxBuy() || (wc && wc.maxBid > 0) ? ' (your web app search)' : ' (fallback from Settings)') + (kmin > 0 ? ' and ≥ ' + fmt(kmin) : '') + ' · ' + (cfg.afterBuy === 2 ? 'leave in Unassigned' : 'to transfer list'), 'price');
      say('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe));
      render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
      return;
    }
    bids = {}; running = true; phase = 'checking';
    feed('Start ' + searchLabel() + ' · target +' + fmt(cfg.minProfit) + '/card', 'price');
    render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }

  function stopAll() { var ob = typeof openBids === 'function' ? openBids() : 0; requestStop('stopped by you' + (ob ? ' · ' + ob + ' bid' + (ob > 1 ? 's' : '') + ' still running: won cards wait in your watchlist' : '')); }
  // Keeps lastBlock: the safety assistant still needs to know when EA last flagged you.
  function resetLife() { life = { bought: 0, spent: 0, est: 0, searches: 0, lastBlock: life.lastBlock || null }; saveLife(); sessions = []; lsSet(SESS_KEY, sessions); }

  // ---------- Hub: transfer list overview, real profit, re-priced relisting, pack pulls ----------
  var hub = { at: 0, total: 0, sold: 0, soldValue: 0, active: 0, expired: 0, unlisted: 0, packs: null, packsTradable: 0, busy: '' };
  var TRADEPILE_MAX = 100;

  function summarize(items) {
    hub.bal = listBalance(items);
    hub.at = Date.now(); hub.total = items.length; hub.sold = 0; hub.soldValue = 0; hub.active = 0; hub.expired = 0; hub.unlisted = 0;
    items.forEach(function (it) {
      var st = tradeStateOf(it);
      if (st === 'closed') { hub.sold++; hub.soldValue += afterTax(salePriceOf(it)); }
      else if (st === 'active') hub.active++;
      else if (isExpired(it)) hub.expired++;
      else hub.unlisted++;
    });
  }
  // Book every sold card once: sale price after EA tax minus what it cost (bot buy, pack = 0).
  // Cards the bot didn't buy have no known cost: the sale is booked, profit stays unknown.
  function bookSales(items) {
    var n = 0;
    items.filter(isSold).forEach(function (it) {
      var id = String(it.id); if (ledger.booked[id]) return;
      var sold = salePriceOf(it); if (!(sold > 0)) return;
      var b = ledger.buys[id], buy = b ? b.buy : null, profit = buy != null ? profitAt(sold, buy) : null, name = nameOf(it) || (b && b.name) || 'Card';
      ledger.sales.unshift({ id: id, t: Date.now(), name: name, rating: ratingOf(it) || (b && b.rating) || null, buy: buy, sold: sold, profit: profit, pack: !!(b && b.pack) });
      ledger.booked[id] = 1; delete ledger.buys[id]; n++;
      feed(name + ' sold for ' + fmt(sold) + (profit != null ? ' · ' + signed(profit) : ''), 'hit');
    });
    if (n) saveLedger();
    return n;
  }
  function realProfit(sinceMs) {
    var sum = 0, n = 0;
    ledger.sales.forEach(function (s) { if (s.t >= sinceMs && s.profit != null) { sum += s.profit; n++; } });
    return { sum: sum, n: n };
  }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

  // Read the transfer list (+ unassigned pile), book sales, optionally clear them. 1-2 requests.
  async function refreshHub(withPacks) {
    var items = await transferItems(); if (!items) { feed('Could not read the transfer list', 'miss'); return null; }
    summarize(items); bookSales(items);
    if (withPacks) { var un = await unassignedItems(); if (un) { hub.packs = un.length; hub.packsTradable = un.filter(function (it) { return isPlayer(it) && isTradable(it); }).length; } }
    render();
    return items;
  }
  async function clearSoldNow() {
    if (!hub.sold) return;
    await sleep(rand(700, 1600));
    var ok = await clearSold();
    feed(ok ? 'Cleared ' + hub.sold + ' sold card' + (hub.sold > 1 ? 's' : '') + ' · +' + fmt(hub.soldValue) + ' coins' : 'Clearing sold cards failed', ok ? 'list' : 'stop');
    if (ok) { hub.total -= hub.sold; hub.sold = 0; hub.soldValue = 0; }
  }

  // Run fn while searches target exactly this card (base player id + exact version).
  async function withCard(it, fn) {
    var keep = { searchBase: searchBase, matchId: matchId, curName: curName, gotRange: gotRange };
    var def = defIdOf(it);
    // defId = [exact version], so cheaper versions of the same player don't crowd the 21 results.
    searchBase = { type: 'player', maskedDefId: baseIdOf(def), defId: [Number(def)], count: 21 }; matchId = def; curName = nameOf(it) || curName; gotRange = true;
    try { var res = await fn(); if (res && res.price) notePrice(def, nameOf(it) || 'Card', res.price); return res; }
    finally { searchBase = keep.searchBase; matchId = keep.matchId; curName = keep.curName; gotRange = keep.gotRange; }
  }
  async function listAt(it, price, why) {
    if (!(await rangeOk(it, price))) return false;
    var ok = await listItem(it, Math.max(MIN_PRICE, price - stepFor(price)), price, cfg.listDur || 3600);
    if (ok) noteList(it.id, price);
    feed(ok ? (nameOf(it) || 'Card') + ' listed for ' + fmt(price) + (why ? ' · ' + why : '') : 'Listing ' + (nameOf(it) || 'card') + ' failed', ok ? 'list' : 'stop');
    return ok;
  }

  // Expired cards: price-check each one first and relist at today's price (or EA's "Re-list all"
  // at the old price when re-pricing is off). max = cards per pass, so sniping isn't held up long.
  async function relistExpired(items, max) {
    var expired = items.filter(isExpired); if (!expired.length) return 0;
    if (!cfg.repriceExpired) {
      await sleep(rand(800, 2000));
      var ok = await relistAllExpired();
      feed(ok ? 'Relisted ' + expired.length + ' expired card' + (expired.length > 1 ? 's' : '') + ' (same price + time)' : 'Re-list of expired cards failed - use Re-list all', ok ? 'list' : 'stop');
      return ok ? expired.length : 0;
    }
    var done = 0;
    for (var i = 0; i < expired.length && i < max && running; i++) {
      var it = expired[i], old = salePriceOf(it), name = nameOf(it) || 'Card';
      setActivity('Re-pricing expired ' + name + '…');
      feed('Expired ' + name + ' (was ' + fmt(old) + '): re-pricing', 'check');
      var pick = isPlayer(it) ? await withCard(it, function () { return findPrice(old); }) : null;
      if (!running) break;
      var b = ledger.buys[String(it.id)], cost = b && !b.pack ? b.buy : null;
      var fl = pick ? repriceFloor(pick.price, old, cost) : { price: old, floored: false }, price = fl.price;
      if (!(price > 0)) { feed(name + ' · no price found, left expired', 'miss'); continue; }
      var why = !pick ? 'old price' : fl.floored ? 'market ' + fmt(pick.price) + ', kept at ' + (cost ? 'break-even' : 'max -10%') : price < old ? 'was ' + fmt(old) : price > old ? 'up from ' + fmt(old) : 'same price';
      await sleep(rand(600, 1400));
      if (await listAt(it, price, why)) done++;
    }
    return done;
  }

  // During sniping: every few minutes (and after each listing) look at the transfer list.
  var lastHubPass = 0;
  async function hubPass(force) {
    if (!force && Date.now() - lastHubPass < 180000) return;
    lastHubPass = Date.now() - rand(0, 40000);
    var items = await refreshHub(false); if (!items || !running) return;
    if (cfg.clearSold === 2 || (cfg.clearSold === 1 && hub.total >= TRADEPILE_MAX - 5)) await clearSoldNow(); // always / only when (nearly) full
    if (cfg.relistExpired && running) await relistExpired(items, 2);
  }

  // Pack pulls: price-check every tradeable player in the unassigned pile and list the ones worth
  // at least packMin; the rest stay where they are for you to decide.
  async function listPackPulls() {
    var un = await unassignedItems(); if (!un) return 'could not read your unassigned items';
    var cands = un.filter(function (it) { return isPlayer(it) && isTradable(it); });
    if (!cands.length) return 'no tradeable players in your unassigned items';
    var tp = await transferItems(), room = TRADEPILE_MAX - (tp ? tp.length : 0);
    if (room <= 0) return 'transfer list is full (' + TRADEPILE_MAX + ')';
    var listed = 0, kept = 0;
    for (var i = 0; i < cands.length && i < 12 && running; i++) {
      var it = cands[i], name = nameOf(it) || 'Card';
      setActivity('Pricing pack pull ' + (i + 1) + ' of ' + Math.min(cands.length, 12) + ': ' + name);
      var pick = await withCard(it, function () { return findPrice(0); }); if (!running) break;
      if (!pick) { feed(name + ' · not on the market, kept', 'miss'); kept++; continue; }
      if (pick.price < cfg.packMin) { feed(name + ' ≈ ' + fmt(pick.price) + ' · under ' + fmt(cfg.packMin) + ', kept', 'miss'); kept++; continue; }
      if (listed >= room) { feed('Transfer list full - stopped listing', 'stop'); break; }
      await sleep(rand(800, 1800));
      if (!(await moveToTransfer(it))) { feed(name + ' · could not move to transfer list', 'stop'); continue; }
      await sleep(rand(600, 1300));
      if (await listAt(it, pick.price, 'pack pull')) { noteBuy(it.id, 0, name, true, ratingOf(it), pick.price); listed++; }
    }
    return 'pack pulls: ' + listed + ' listed, ' + kept + ' kept';
  }

  // ---------- Bulk list: many copies of one card at one price (e.g. 90 investment 88s) ----------
  var bulk = { loading: false, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '', src: 'tp', room: 0 };
  function bulkRows(items) {
    return items.map(function (it) {
      var st = tradeStateOf(it);
      return { it: it, def: defIdOf(it), name: nameOf(it) || 'Card', rating: ratingOf(it), tradable: isTradable(it), player: isPlayer(it),
        state: st === 'closed' ? 'closed' : st === 'active' ? 'active' : isExpired(it) ? 'expired' : 'unlisted' };
    });
  }
  function lastPriceOf(def) { for (var i = priceHist.length - 1; i >= 0; i--) if (String(priceHist[i].id) === String(def)) return priceHist[i].p; return 0; }
  async function openBulk() {
    if (running) return;
    tab = 'bulk'; bulk = { loading: true, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '', src: 'tp', room: 0 }; rebuildView();
    var items = await refreshHub(false);
    bulk.loading = false;
    if (!items) bulk.err = 'Could not read the transfer list. Open the Transfers tab in the web app once, then try again.';
    else bulk.groups = bulkGroups(bulkRows(items));
    rebuildView();
  }
  // My Club: tradeable club players grouped like the transfer list; listing moves each one to the
  // transfer list first, so only as many as there is room for.
  async function openClub() {
    if (running) return;
    tab = 'bulk'; bulk = { loading: true, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '', src: 'club', room: 0 }; rebuildView();
    var tp = await transferItems(), club = await clubPlayers();
    bulk.loading = false; bulk.room = Math.max(0, TRADEPILE_MAX - (tp ? tp.length : TRADEPILE_MAX));
    if (!club) bulk.err = 'Could not read your club. Open the Club tab in the web app once, then try again. If it still fails, copy the diagnostics (Settings › Help).';
    else bulk.groups = bulkGroups(bulkRows(club).map(function (r) { r.state = 'unlisted'; return r; }));
    rebuildView();
  }
  function bulkMax(g) { return bulk.src === 'club' ? Math.min(g.count, bulk.room) : g.count; }
  function pickBulk(i) {
    var g = bulk.groups && bulk.groups[i]; if (!g) return;
    bulk.sel = g; bulk.n = bulkMax(g); bulk.price = lastPriceOf(g.def); bulk.start = ''; bulk.err = ''; rebuildView();
  }
  function saveBulkInputs() {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (v('fs-bk-price') != null) bulk.price = v('fs-bk-price');
    if (v('fs-bk-start') != null) bulk.start = v('fs-bk-start');
    if (v('fs-bk-n') != null) bulk.n = v('fs-bk-n');
  }
  async function runBulk(g, p, n, dur) {
    var todo = g.items.slice(0, n), done = 0, fails = 0;
    for (var i = 0; i < todo.length && running; i++) {
      var it = todo[i];
      setActivity('Listing ' + (i + 1) + ' of ' + todo.length + ': ' + g.name + ' at ' + fmt(p.buy));
      if (i === 0 && !(await rangeOk(it, p.buy))) return 'price is outside EA\u2019s range for this card - nothing listed';
      await sleep(rand(1100, 2600)); if (!running) break;
      if (g.src === 'club') { if (!(await moveToTransfer(it))) { if (++fails >= 2) { feed('Moving to the transfer list failed twice - stopped (full?)', 'stop'); break; } continue; } await sleep(rand(600, 1300)); }
      if (await listItem(it, p.start, p.buy, dur)) { done++; fails = 0; noteList(it.id, p.buy); if (done % 10 === 0) feed(done + ' of ' + todo.length + ' listed', 'list'); }
      else if (++fails >= 2) { feed('Listing failed twice in a row - stopped. EA busy or a captcha? Check the web app.', 'stop'); break; }
      else feed('Listing one ' + g.name + ' failed - trying the next', 'miss');
    }
    return 'listed ' + done + ' of ' + todo.length + ' × ' + g.name + ' at ' + fmt(p.buy);
  }
  function startBulk() {
    var g = bulk.sel; if (!g) return;
    var p = bulkPrices(bulk.price, bulk.start);
    if (p.err) { bulk.err = p.err; rebuildView(); return; }
    if (!(bulkMax(g) > 0)) { bulk.err = 'Your transfer list is full (' + TRADEPILE_MAX + '). Clear sold cards first.'; rebuildView(); return; }
    var n = Math.max(1, Math.min(bulkMax(g), Math.round(Number(bulk.n) || bulkMax(g)))), dur = bulk.dur || cfg.listDur || 3600;
    g.src = bulk.src;
    if (!window.confirm('List ' + n + ' × ' + g.name + '\nBuy Now ' + fmt(p.buy) + ' · start ' + fmt(p.start) + ' · ' + durLabel(dur) + (p.adjusted ? '\n(price snapped to EA\u2019s price steps)' : '') + (bulk.src === 'club' ? '\nFrom your club: make sure none of them are in your squad.' : '') + '\n\nGo?')) return;
    if (!canStart()) return;
    tab = 'hub'; bulk = { loading: false, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '', src: 'tp', room: 0 };
    running = true; mode = 'job'; phase = 'job';
    feed('Listing ' + n + ' × ' + g.name + ' at ' + fmt(p.buy) + ' (start ' + fmt(p.start) + ', ' + durLabel(dur) + ')', 'check'); rebuildView();
    runBulk(g, p, n, dur).then(function (msg) { if (running) requestStop('Done: ' + msg); refreshHub(true); }).catch(function (e) { requestStop('bulk list error: ' + e); });
  }

  // Auto relister: while the bot is NOT running, look at the transfer list every 4-7 min, book and
  // (per Settings) clear sold cards and relist expired ones at their old price (EA's "Relist all").
  // While sniping, the run itself does this. Session only: off after a reload.
  var autoRel = { on: false, next: 0, count: 0, last: 0 };
  function toggleAutoRelist() {
    autoRel.on = !autoRel.on; autoRel.next = Date.now() + 2000;
    feed(autoRel.on ? 'Auto relister on · every 4-7 min while the bot is idle' : 'Auto relister off', 'check'); render();
  }
  async function autoRelistPass() {
    autoRel.next = Date.now() + rand(240000, 420000); hub.busy = 'auto';
    try {
      var items = await refreshHub(false); if (!items || running) return;
      if (cfg.clearSold === 2 || (cfg.clearSold === 1 && hub.total >= TRADEPILE_MAX - 5)) await clearSoldNow();
      if (hub.expired && !running) {
        var n = hub.expired; await sleep(rand(800, 1800)); if (running) return;
        if (await relistAllExpired()) { autoRel.count += n; hub.active += n; hub.expired = 0; feed('Auto relister: relisted ' + n + ' expired card' + (n > 1 ? 's' : ''), 'list'); }
        else feed('Auto relister: relisting failed - trying again next round', 'miss');
      }
      autoRel.last = Date.now();
    } finally { hub.busy = ''; render(); }
  }
  setInterval(function () { if (autoRel.on && !running && !hub.busy && haveServices() && Date.now() >= autoRel.next) autoRelistPass().catch(function () { hub.busy = ''; }); }, 10000);

  // Hub buttons that need searches run like a short sniping run (lock screen, Stop works).
  function startJob(kind) {
    if (!canStart()) return;
    running = true; mode = 'job'; phase = 'job';
    var job = kind === 'packs' ? listPackPulls() : refreshHub(false).then(function (items) {
      if (!items) return 'could not read the transfer list';
      return relistExpired(items, 30).then(function (n) { return 'relisted ' + n + ' expired card' + (n === 1 ? '' : 's'); });
    });
    feed(kind === 'packs' ? 'Listing pack pulls…' : 'Re-pricing expired cards…', 'check'); render();
    job.then(function (msg) { if (running) requestStop('Done: ' + msg); refreshHub(true); }).catch(function (e) { requestStop('hub error: ' + e); });
  }
  async function hubRefreshButton() {
    if (running || hub.busy) return;
    hub.busy = 'refresh'; render();
    try { await refreshHub(true); } finally { hub.busy = ''; render(); }
  }
  async function hubClearButton() {
    if (running || hub.busy) return;
    hub.busy = 'clear'; render();
    try { if (await refreshHub(false)) await clearSoldNow(); } finally { hub.busy = ''; render(); }
  }

  // ---------- Live Filters + diagnostics ----------
  function saveCurrentFilter() {
    var crit = capturedPlain || capturedFromUrl; if (!crit) { blockMsg = 'Search a player once first, then save it as a filter.'; render(); return; }
    var name = (window.prompt && window.prompt('Name this filter', 'Filter ' + (filters.length + 1))) || ('Filter ' + (filters.length + 1));
    filters.unshift({ name: name, crit: Object.assign({}, crit) }); filters = filters.slice(0, 40); lsSet(FILT_KEY, filters); render();
  }
  function loadFilter(i) { var f = filters[i]; if (!f || running) return; capturedFromUrl = Object.assign({ __fromUs: true }, f.crit); capturedCriteria = null; capturedPlain = Object.assign({}, f.crit); tab = 'snipe'; blockMsg = ''; log('loaded filter: ' + f.name); render(); }
  function deleteFilter(i) { filters.splice(i, 1); lsSet(FILT_KEY, filters); render(); }

  var auctionHTML = null;
  function diag() {
    try { var row = document.querySelector('li.listFUTItem, .listFUTItem'); if (row) { lastCardHTML = row.outerHTML.slice(0, 1500); var au = row.querySelector('.auction, [class*=auction]'); auctionHTML = au ? au.outerHTML.slice(0, 1500) : null; } } catch (e) {}
    var s = svc(), I = s && s.Item;
    var fnNames = function (o) { var out = {}; try { for (var p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach(function (k) { try { if (k !== 'constructor' && typeof o[k] === 'function') out[k] = 1; } catch (e) {} }); } catch (e) {} return Object.keys(out).sort(); };
    var rows = document.querySelectorAll(ROW_SEL), withAvg = 0;
    for (var i = 0; i < rows.length; i++) if (parseCoins(avgLabelOf(rows[i])) > 0) withAvg++;
    var d = { version: VERSION, servicesFound: !!s, services: s ? Object.keys(s).sort() : [], itemMethods: I ? fnNames(I) : [], clubMethods: s && s.Club ? fnNames(s.Club) : [], cellHook: cellHook, tpAlign: tpAlign, ledgerOpen: Object.keys(ledger.buys).length, ledgerSales: ledger.sales.length, cellViews: Object.keys(window).filter(function (k) { return /^UT\w*(TableCell|ListItem|Row|List)\w*$/.test(k); }).slice(0, 60), rowsWithItem: document.querySelectorAll('[data-fs-id]').length, rowsGuessed: [].filter.call(document.querySelectorAll(ROW_SEL), function (r) { return !!r.__fsGuess; }).length, criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedPlain: capturedPlain, phase: phase, market: market, minProfit: cfg.minProfit, listDur: cfg.listDur, speed: cfg.speed, reprobeEvery: cfg.reprobeEvery, cheapest: stats.cheapest, curName: curName, curDefId: stats.curDefId, eaMin: stats.eaMin, eaMax: stats.eaMax, sessionNet: sessionNet(), lifetime: life, filtersSaved: filters.length, sessionsLogged: sessions.length, cardRows: rows.length, cardRowsWithAvg: withAvg, firstAvg: rows.length ? avgLabelOf(rows[0]) : null, badgesPainted: document.querySelectorAll('.fs-badge').length, lastBuy: lastBuy, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, marketCardHTML: lastCardHTML, auctionHTML: auctionHTML, recentMarketUrls: tmUrls, stopReason: stopReason, priceLimitsResponse: limitsDebug, priceLimitsCached: Object.keys(limitsCache).length, hub: { at: hub.at, total: hub.total, sold: hub.sold, expired: hub.expired }, settings: { afterBuy: cfg.afterBuy, repriceExpired: cfg.repriceExpired, relistExpired: cfg.relistExpired, clearSold: cfg.clearSold, varyMinBid: cfg.varyMinBid, tooManyStop: cfg.tooManyStop, rangeStop: cfg.rangeStop, keepSpecials: cfg.keepSpecials } };
    var text = 'TangaTolga Sniper diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }

  // ---------- price tags on cards ----------
  // EA draws cards on a <canvas> (no player id in the page), but every card row already carries
  // its average coin value in a hidden stats view ("AVG 61.3K"). The tag shows that value on the
  // card itself: Club, transfer list, market, everywhere. No extra EA calls.
  var badgeTimer = null, badgeObs = null;
  var ROW_SEL = 'li.listFUTItem';
  function startBadgeObserver() {
    if (badgeObs || !window.MutationObserver || !document.body) return;
    badgeObs = new MutationObserver(function () { paintBadges(); });
    try { badgeObs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    window.addEventListener('resize', paintBadges);
  }
  function paintBadges() { if (!cfg.badges || badgeTimer) return; badgeTimer = setTimeout(function () { badgeTimer = null; doPaintBadges(); }, 300); }
  // Profit tags on the transfer list: the row's item comes from EA's list cell view (its render()
  // is wrapped to remember the item on the row). Cost = what the bot paid (ledger), price = the
  // listing's Buy Now (or the sale price once sold). Cards the bot didn't buy get no tag.
  var cellHook = { done: false, cls: null, calls: 0, withItem: 0 };
  function hookCells() {
    if (cellHook.done) return true;
    var names = ['UTItemTableCellView'].concat(Object.keys(window).filter(function (k) { return /^UT\w*(TableCell|ListItem)\w*View$/.test(k) && k !== 'UTItemTableCellView'; }));
    for (var i = 0; i < names.length; i++) {
      var C = window[names[i]]; if (!C || !C.prototype || typeof C.prototype.render !== 'function' || C.prototype.__fsHooked) continue;
      (function (P) {
        var orig = P.render;
        P.render = function (item) {
          var r = orig.apply(this, arguments); cellHook.calls++;
          try {
            // the item may be the argument or a field of the view; the row element likewise
            var self = this, it = item && item.id != null && (item.definitionId != null || item._auction) ? item : null, root = null;
            try { root = this.getRootElement && this.getRootElement(); } catch (e) {}
            Object.keys(self).forEach(function (k) { var v = self[k]; if (!v || typeof v !== 'object') return; if (!it && v.id != null && v.definitionId != null && v._auction) it = v; if (!root && v.nodeType === 1 && v.classList && v.classList.contains('listFUTItem')) root = v; });
            if (!root) root = this.__root || this._root;
            if (root && it) { root.__fsItem = it; root.setAttribute('data-fs-id', String(it.id)); cellHook.withItem++; }
            else if (cellHook.calls < 400 && !cellHook.keys) cellHook.keys = Object.keys(self).slice(0, 30).join(',') + ' | arg:' + (item && typeof item === 'object' ? Object.keys(item).slice(0, 8).join(',') : typeof item);
          } catch (e) {}
          paintBadges(); return r;
        };
        P.__fsHooked = true;
      })(C.prototype);
      cellHook.done = true; cellHook.cls = (cellHook.cls ? cellHook.cls + ',' : '') + names[i];
    }
    return cellHook.done;
  }
  // Fallback when the hook finds nothing: the transfer list page shows exactly the items of
  // requestTransferItems. Read them (at most every 45 s, only while such rows are on screen),
  // then line them up with the rows. A line-up is used only if every
  // row's rating (and Buy Now, where the row shows one) matches its item.
  var tpAlign = { at: 0, busy: false, n: 0, ok: false, tried: 0 };
  function rowSig(row) {
    var r = row.querySelector('.playerOverview .rating'), nums = [], vs = row.querySelectorAll('.auction .value, .auctionValue .value, .auction .currency-coins');
    for (var i = 0; i < vs.length; i++) { var v = Number(String(vs[i].textContent).replace(/\D/g, '')); if (v > 0) nums.push(v); } // '129.000' / '129,000'
    return { rating: r ? Number(r.textContent.trim()) || null : null, nums: nums };
  }
  function sigMatch(sig, it) {
    var rt = ratingOf(it); if (sig.rating && rt && sig.rating !== rt) return false;
    var bn = (it._auction || {}).buyNowPrice; if (sig.nums.length && !(bn > 0 && sig.nums.indexOf(bn) >= 0)) return false; // a row that shows a price fits only a card listed at it
    return true;
  }
  function tpOrders(items) {
    var by = { closed: [], expired: [], unlisted: [], active: [] };
    items.forEach(function (it) { var s = tradeStateOf(it); by[s === 'closed' ? 'closed' : s === 'active' ? 'active' : isExpired(it) ? 'expired' : 'unlisted'].push(it); });
    var act = by.active.slice().sort(function (a, b) { return (expiresOf(a) || 0) - (expiresOf(b) || 0); });
    var out = [items];
    [['closed', 'expired', 'unlisted', 'active'], ['closed', 'active', 'expired', 'unlisted'], ['closed', 'unlisted', 'expired', 'active'], ['active', 'expired', 'unlisted', 'closed']].forEach(function (o) {
      out.push([].concat.apply([], o.map(function (k) { return by[k]; }))); out.push([].concat.apply([], o.map(function (k) { return k === 'active' ? act : by[k]; })));
    });
    return out;
  }
  // Balance of the transfer list: if every card sells at the price it's offered at (Buy Now,
  // expired ones at their last price), the profit of all cards whose cost is known.
  function listBalance(items) {
    var b = { sum: 0, n: 0, value: 0, unknown: 0, unlisted: 0 };
    (items || []).forEach(function (it) {
      if (tradeStateOf(it) === 'closed') return;
      var rp = rowProfit(it);
      if (rp && !rp.sold) { b.sum += rp.profit; b.n++; b.value += afterTax(rp.price); }
      else if (!((it._auction || {}).buyNowPrice > 0)) b.unlisted++; else b.unknown++;
    });
    return b;
  }
  function paintBalance(rows) {
    var bar = document.getElementById('fs-tpbal'), bal = tpAlign.balance;
    var onList = rows.length && bal && tpAlign.items === rows.length;
    if (!onList) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    var list = rows[0].parentNode; if (!list || !list.parentNode) return;
    if (!bar) { bar = document.createElement('div'); bar.id = 'fs-tpbal'; }
    if (bar.nextSibling !== list) list.parentNode.insertBefore(bar, list);
    var html = '<span class="k">If everything sells at its price</span><b class="' + (bal.sum < 0 ? 'neg' : '') + '">' + (bal.n ? (bal.sum >= 0 ? '+' : '−') + fmt(Math.abs(bal.sum)) : '—') + '</b>' +
      '<span class="s">' + bal.n + ' card' + (bal.n === 1 ? '' : 's') + ' · ' + fmt(bal.value) + ' coins after tax' + (bal.unknown ? ' · ' + bal.unknown + ' without known cost' : '') + (bal.unlisted ? ' · ' + bal.unlisted + ' not listed' : '') + '</span>';
    if (bar.__h !== html) { bar.__h = html; bar.innerHTML = html; }
  }
  function alignRows(rows, hooked) {
    if (tpAlign.busy || (Date.now() - tpAlign.at < 45000 && tpAlign.n === rows.length)) return;
    tpAlign.busy = true; tpAlign.at = Date.now(); tpAlign.n = rows.length; tpAlign.tried++;
    transferItems().then(function (items) {
      tpAlign.busy = false; tpAlign.ok = false;
      if (items) tpAlign.sample = items.slice(0, 4).map(function (it) { return { rating: ratingOf(it), state: tradeStateOf(it), buyNow: (it._auction || {}).buyNowPrice, lastSalePrice: it.lastSalePrice }; });
      tpAlign.items = items ? items.length : null; tpAlign.rows = rows.length;
      if (items) { tpAlign.balance = listBalance(items); }
      if (!items || items.length !== rows.length || hooked) { paintBadges(); return; }
      var sigs = []; for (var i = 0; i < rows.length; i++) sigs.push(rowSig(rows[i]));
      var cands = tpOrders(items);
      for (var c = 0; c < cands.length; c++) {
        var ok = true; for (var j = 0; j < rows.length && ok; j++) ok = sigMatch(sigs[j], cands[c][j]);
        if (ok) { for (var k = 0; k < rows.length; k++) rows[k].__fsGuess = cands[c][k]; tpAlign.ok = 'order'; break; }
      }
      if (!tpAlign.ok) { // order unknown: a row gets a tag only if every card that fits it has the same profit
        var tagged = 0;
        for (var m = 0; m < rows.length; m++) {
          var fit = items.filter(function (it) { return sigMatch(sigs[m], it); }); if (!fit.length) continue;
          var key = function (it) { var p = rowProfit(it); return p ? String(p.profit) : 'none'; }, k0 = key(fit[0]);
          if (fit.every(function (it) { return key(it) === k0; })) { rows[m].__fsGuess = fit[0]; if (k0 !== 'none') tagged++; }
        }
        tpAlign.ok = 'per-row'; tpAlign.tagged = tagged;
      }
      paintBadges();
    }, function () { tpAlign.busy = false; });
  }
  function rowItem(row) {
    if (row.__fsItem) return row.__fsItem;
    if (row.__fsGuess) return row.__fsGuess;
    var el = row.querySelector('[data-fs-id]') || (row.closest && row.closest('[data-fs-id]'));
    return el ? el.__fsItem || null : null;
  }
  // {profit, sold} for a row's card, or null (unknown cost / no price).
  function rowProfit(it) {
    if (!it || it.id == null) return null;
    var id = String(it.id), b = ledger.buys[id];
    if (b) { var a = it._auction || {}, price = tradeStateOf(it) === 'closed' ? salePriceOf(it) : (a.buyNowPrice > 0 ? a.buyNowPrice : b.list); return price > 0 ? { profit: profitAt(price, b.buy), price: price } : null; }
    for (var i = 0; i < ledger.sales.length && i < 300; i++) if (ledger.sales[i].id === id && ledger.sales[i].profit != null) return { profit: ledger.sales[i].profit, price: ledger.sales[i].sold, sold: true };
    // Bought by hand: EA keeps the price the card last changed hands for (lastSalePrice) = what
    // you paid, as long as it hasn't sold again. Packed cards have 0 -> no tag.
    var paid = Number(it.lastSalePrice) || 0, a2 = it._auction || {};
    if (paid > 0 && tradeStateOf(it) !== 'closed' && a2.buyNowPrice > 0) return { profit: profitAt(a2.buyNowPrice, paid), price: a2.buyNowPrice, manual: true };
    return null;
  }
  function paintProfitTag(host, card, it) {
    var t = host.querySelector('.fs-badge.pf'), rp = rowProfit(it);
    if (!rp) { if (t) t.parentNode.removeChild(t); return; }
    if (!t) { t = document.createElement('div'); t.className = 'fs-badge pf'; host.appendChild(t); }
    var text = (rp.profit >= 0 ? '+' : '−') + fmt(Math.abs(rp.profit)), cls = 'fs-badge pf' + (rp.profit < 0 ? ' neg' : '');
    if (t.textContent !== text) t.textContent = text; if (t.className !== cls) t.className = cls;
    var hr = host.getBoundingClientRect(), cr = card.getBoundingClientRect(); if (!cr.width || !hr.width) return;
    var left = Math.round(Math.max(2, cr.left - hr.left + cr.width / 2 - t.offsetWidth / 2)) + 'px', top = Math.round(Math.max(0, cr.top - hr.top - t.offsetHeight * 0.4)) + 'px';
    if (t.style.left !== left) t.style.left = left; if (t.style.top !== top) t.style.top = top;
  }
  function removeBadges() { try { var b = document.querySelectorAll('.fs-badge'); for (var i = 0; i < b.length; i++) b[i].parentNode && b[i].parentNode.removeChild(b[i]); } catch (e) {} }
  // The "AVG" row of the card's stats view, e.g. "61.3K".
  function avgLabelOf(row) {
    var rows = row.querySelectorAll('.ut-item-view--stats .ut-item-row');
    for (var i = 0; i < rows.length; i++) {
      var l = rows[i].querySelector('.ut-item-row-label--left'), v = rows[i].querySelector('.ut-item-row-label.coin');
      if (v && (!l || /avg/i.test(l.textContent))) return v.textContent.trim();
    }
    return null;
  }
  // The tag lives on the row (EA shrinks the card itself and would clip anything inside it) and
  // is placed by measuring where the card really is: centred on the card's bottom edge.
  function placeBadge(b, host, card) {
    var hr = host.getBoundingClientRect(), cr = card.getBoundingClientRect();
    if (!cr.width || !hr.width) return;
    var left = Math.round(Math.max(2, cr.left - hr.left + cr.width / 2 - b.offsetWidth / 2)) + 'px';
    var top = Math.round(cr.bottom - hr.top - b.offsetHeight * 0.6) + 'px';
    if (b.style.left !== left) b.style.left = left;
    if (b.style.top !== top) b.style.top = top;
  }
  function doPaintBadges() {
    if (badgeObs) badgeObs.disconnect();
    try {
      var rows = document.querySelectorAll(ROW_SEL), hooked = 0;
      for (var h = 0; h < rows.length; h++) if (rows[h].__fsItem || rows[h].__fsGuess || rows[h].querySelector('[data-fs-id]')) hooked++;
      if (rows.length && rows.length <= 100) alignRows(rows, hooked);
      paintBalance(rows);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i], host = row.querySelector('.rowContent') || row;
        var card = row.querySelector('.entityContainer canvas') || row.querySelector('.entityContainer') || row;
        try { if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) {}
        paintProfitTag(host, card, rowItem(row));
        var label = avgLabelOf(row), b = host.querySelector('.fs-badge:not(.pf)');
        if (!(parseCoins(label) > 0)) { if (b) b.parentNode.removeChild(b); continue; }
        var text = '≈ ' + label;
        if (!b) {
          try { if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) {}
          b = document.createElement('div'); b.className = 'fs-badge'; host.appendChild(b);
        }
        if (b.textContent !== text) b.textContent = text;
        placeBadge(b, host, card);
      }
    } catch (e) {}
    if (badgeObs) { try { badgeObs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {} }
  }

  // ---------- snipe celebration: animation, vibration, sound ----------
  // Sounds are synthesised with WebAudio (no files). iOS only allows audio after a tap, so the
  // audio context is unlocked when you tap Start (or a sound button in settings).
  var SOUNDS = [['Off', 0], ['Chime', 1], ['Coins', 2], ['Pop', 3]];
  var audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; audioCtx = new AC(); }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var b = audioCtx.createBuffer(1, 1, 22050), s = audioCtx.createBufferSource(); s.buffer = b; s.connect(audioCtx.destination); s.start(0);
    } catch (e) {}
  }
  function tone(type, f0, f1, t0, dur, vol) {
    var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t0, dur, vol) {
    var n = Math.floor(audioCtx.sampleRate * dur), b = audioCtx.createBuffer(1, n, audioCtx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = audioCtx.createBufferSource(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol; s.buffer = b;
    s.connect(f); f.connect(g); g.connect(audioCtx.destination); s.start(audioCtx.currentTime + t0);
  }
  function playSound(kind) {
    if (!kind || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (kind === 1) { tone('sine', 1319, 1319, 0, 0.5, 0.18); tone('sine', 1976, 1976, 0.09, 0.6, 0.12); }
      else if (kind === 2) { tone('square', 988, 988, 0, 0.09, 0.08); tone('square', 1319, 1319, 0.08, 0.38, 0.08); }
      else if (kind === 3) { tone('sine', 660, 1320, 0, 0.12, 0.2); }
    } catch (e) {}
  }

  // Vibration: Android has navigator.vibrate. iPhone Safari doesn't, but tapping an iOS 18
  // "switch" checkbox gives a haptic tick, so we tap a hidden one a few times.
  var hapticEl = null;
  function vibrate() {
    try { if (navigator.vibrate && navigator.vibrate([70, 50, 140, 50, 220])) return; } catch (e) {}
    try {
      if (!hapticEl) {
        hapticEl = document.createElement('label'); hapticEl.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none';
        hapticEl.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(hapticEl);
      }
      [0, 120, 240].forEach(function (d) { setTimeout(function () { try { hapticEl.click(); } catch (e) {} }, d); });
    } catch (e) {}
  }

  // A purchase banner like an iOS notification: green tick, player, price and profit.
  function celebrate(name, price, profit) {
    if (cfg.vibrate) vibrate();
    playSound(cfg.sound | 0);
    try {
      var old = document.getElementById('fs-toast'); if (old && old.parentNode) old.parentNode.removeChild(old);
      var t = document.createElement('div'); t.id = 'fs-toast';
      t.innerHTML = '<div class="ic">✓</div><div class="tx"><b>Bought ' + esc(name) + '</b><span>' + fmt(price) + ' coins' + (profit != null ? ' · +' + fmt(profit) + ' profit' : '') + '</span></div>';
      document.body.appendChild(t);
      requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add('in'); }); });
      setTimeout(function () { t.classList.remove('in'); }, 2600);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
    } catch (e) {}
  }

  // ---------- styles ----------
  // Dark navy with a light-cyan accent: big soft cards, a tile bar at the top, a summary card with
  // three numbers, icon rows with a value and a chevron, one big cyan action button. Green = money.
  var C_BG = '#121722', C_CARD = '#1a2030', C_CARD2 = '#222a3b', C_CARD3 = '#2c3549', C_LINE = 'rgba(255,255,255,.07)';
  var C_TXT = '#eef2f8', C_MUT = '#8a94a8', C_MUT2 = '#5d677c';
  var C_CYAN = '#5ac8f5', C_CYAN_BG = 'rgba(90,200,245,.12)', C_OK = '#4ade80', C_RED = '#f87171', C_ORANGE = '#fb923c', C_GOLD = '#e8c766';
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,"Helvetica Neue",sans-serif';
  var NUM = 'font-variant-numeric:tabular-nums;';
  var CAPS = 'text-transform:uppercase;letter-spacing:1.4px;font-size:11.5px;font-weight:600;color:' + C_MUT + ';';
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *,#fs-lock *,#fs-toast *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
    '#fs-panel button,#fs-lock button{font-family:' + FONT + ';cursor:pointer}' +
    '#fs-panel svg.i,#fs-lock svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    // panel + header
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:15px/1.4 ' + FONT + ';color:' + C_TXT + ';background:' + C_BG + ';-webkit-font-smoothing:antialiased}' +
    '#fs-panel.open{display:flex;animation:fsfade .2s ease-out}@keyframes fsfade{from{opacity:0}to{opacity:1}}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px 10px;padding-top:max(12px,env(safe-area-inset-top))}' +
    '#fs-head .brand{display:flex;align-items:center;gap:10px}#fs-head .logo{width:34px;height:34px;border-radius:10px;background:' + C_CYAN_BG + ';color:' + C_CYAN + ';display:flex;align-items:center;justify-content:center}' +
    '#fs-head .t{font-weight:800;font-style:italic;font-size:22px;letter-spacing:-.3px}#fs-head .v{font-size:11px;color:' + C_MUT2 + ';margin-left:6px;font-style:normal;font-weight:500}' +
    '#fs-head .coins{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:' + C_TXT + ';' + NUM + 'background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:12px;padding:7px 11px}' +
    '#fs-head .coins:before{content:"";width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3c4,' + C_GOLD + ' 55%,#b8952f);box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.25)}' +
    '#fs-min{background:' + C_CARD + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + ';border-radius:50%;width:38px;height:38px;font-size:15px;margin-left:8px}' +
    '#fs-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 16px;padding-bottom:max(28px,env(safe-area-inset-bottom));width:100%;max-width:560px;margin:0 auto;overflow-x:hidden}' +
    // tile bar
    '#fs-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 16px;max-width:528px;align-self:center;width:calc(100% - 32px)}' +
    '.fs-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:74px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:8px 4px;color:' + C_MUT + ';transition:border-color .15s,background .15s}' +
    '.fs-tile.on{border-color:rgba(90,200,245,.55);background:#1c2638;color:' + C_TXT + '}' +
    '.fs-tile .ti{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + C_CARD3 + ';color:' + C_TXT + '}.fs-tile.on .ti{background:' + C_CYAN_BG + ';color:' + C_CYAN + '}' +
    '.fs-tile .ti.live{color:' + C_OK + ';background:rgba(74,222,128,.14)}' +
    '.fs-tile .tl{' + CAPS + 'font-size:10.5px;color:inherit}' +
    '.fs-tile .tg{position:relative;width:50px;height:32px}.fs-tile .tg svg{width:50px;height:29px}.fs-tile .tg b{position:absolute;left:0;right:0;bottom:-2px;text-align:center;font-size:14px;font-weight:800;color:' + C_TXT + ';' + NUM + '}' +
    // section titles
    '.ios-h,.fs-sect-h{' + CAPS + 'padding:20px 2px 9px}.ios-h:empty{padding:6px 0 0}#fs-block+.ios-h{padding-top:4px}' +
    // summary card (Sniper)
    '.sx-sum{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;padding:16px 16px 0;overflow:hidden}' +
    '.sx-k{' + CAPS + '}.sx-name{font-size:24px;font-weight:800;letter-spacing:-.4px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sx-name.muted{color:' + C_MUT + ';font-weight:600;font-size:20px}' +
    '.sx-sub{font-size:14px;color:' + C_MUT + ';margin-top:2px}' +
    '.sx-3{display:grid;grid-template-columns:repeat(3,1fr);margin:14px -16px 0;background:' + C_CARD2 + ';border-top:1px solid ' + C_LINE + '}' +
    '.sx-3>div{padding:12px 14px 13px;border-right:1px solid ' + C_LINE + ';min-width:0}.sx-3>div:last-child{border-right:0}' +
    '.sx-3 span{display:block;' + CAPS + 'font-size:10.5px;letter-spacing:1.2px}.sx-3 b{display:block;font-size:20px;font-weight:800;margin-top:4px;' + NUM + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sx-3 b.g{color:' + C_OK + '}' +
    '.sx-3 small{display:block;font-size:12px;color:' + C_MUT + ';margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sx-note{display:flex;gap:8px;font-size:13px;line-height:1.4;color:' + C_MUT + ';padding:10px 4px 2px}.sx-note:before{content:"i";flex:none;width:16px;height:16px;border-radius:50%;border:1px solid ' + C_MUT2 + ';color:' + C_MUT + ';font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}.sx-note:empty{display:none}' +
    // icon rows
    '.sx-rows{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;overflow:hidden;margin-top:14px}' +
    '.sx-row{display:flex;align-items:center;gap:14px;width:100%;min-height:56px;padding:12px 16px;background:transparent;border:0;border-top:1px solid ' + C_LINE + ';color:' + C_TXT + ';font:16px ' + FONT + ';text-align:left}.sx-row:first-child{border-top:0}.sx-row:active{background:' + C_CARD2 + '}' +
    '.sx-row .ic{flex:none;color:' + C_MUT + ';display:flex}.sx-row .k{flex:1;min-width:0}.sx-row .v{font-weight:700;' + NUM + 'white-space:nowrap}' +
    '.sx-spd{gap:8px;padding:6px 10px 6px 0}.sx-sk{flex:1;min-width:0;display:flex;align-items:center;gap:14px;padding:6px 0 6px 16px;background:transparent;border:0;color:inherit;font:inherit;text-align:left}.sx-sk small{color:' + C_MUT + ';font-size:13px;margin-left:4px}' +
    '.sx-pm{flex:none;display:flex;align-items:center;gap:4px}.sx-pm button{width:36px;height:36px;border-radius:10px;border:0;background:' + C_CARD2 + ';color:' + C_CYAN + ';font:600 22px/1 ' + FONT + '}.sx-pm button:active{opacity:.6}.sx-pm .gap{min-width:76px;text-align:center;font-weight:700;' + NUM + 'color:' + C_TXT + '}' +
    '.fs-cust{margin-top:4px}.fs-cust>.fs-set{border-top:0;padding:8px 0 0}' +
    '.sx-row .chev{flex:none;width:9px;height:9px;border-right:2px solid ' + C_MUT2 + ';border-bottom:2px solid ' + C_MUT2 + ';transform:rotate(-45deg);margin:0 3px 0 2px}' +
    // stats tiles
    '.sx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}' +
    '.sx-stats>div{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:12px 4px;text-align:center}' +
    '.sx-stats b{display:block;font-size:20px;font-weight:800;' + NUM + '}.sx-stats b.g{color:' + C_OK + '}.sx-stats b.r{color:' + C_RED + '}.sx-stats span{display:block;' + CAPS + 'font-size:9.5px;letter-spacing:1px;margin-top:2px}' +
    // generic cards
    '.fs-card,.fs-sect,.fs-safe,.fs-dc{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;margin-bottom:12px}' +
    '.fs-card{overflow:hidden}.fs-ch{' + CAPS + 'padding:14px 16px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}.fs-cols .c{padding:6px 16px 14px;border-right:1px solid ' + C_LINE + '}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{' + CAPS + 'font-size:10.5px}.fs-cols .v{font-size:22px;font-weight:800;margin-top:3px;' + NUM + '}.fs-cols .v.c{color:' + C_CYAN + '}.fs-cols .v.g{color:' + C_OK + '}.fs-cols .v.r{color:' + C_ORANGE + '}' +
    '.fs-cols.c4{grid-template-columns:repeat(4,1fr)}.fs-cols.c4 .c{padding:6px 12px 14px}' +
    // controls
    '.fs-sw{width:51px;height:31px;flex:none;border-radius:999px;background:' + C_CARD3 + ';position:relative;transition:background .2s}.fs-sw.on{background:' + C_CYAN + '}' +
    '.fs-sw:after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}.fs-sw.on:after{transform:translateX(20px)}' +
    '.fs-segw{display:flex;gap:2px;padding:3px;background:#10141e;border:1px solid ' + C_LINE + ';border-radius:12px}' +
    '.fs-sg{flex:1;background:transparent;color:' + C_MUT + ';border:0;border-radius:9px;padding:8px 8px;font-size:14px;font-weight:600;white-space:nowrap}.fs-sg.on{background:' + C_CARD3 + ';color:' + C_TXT + '}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:999px;background:' + C_CARD3 + ';outline:none;margin:10px 0 2px}' +
    '.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}' +
    '.fs-num{width:120px;flex:none;background:#10141e;border:1px solid ' + C_LINE + ';color:' + C_TXT + ';border-radius:10px;padding:9px 11px;font:700 16px ' + FONT + ';text-align:right;' + NUM + 'outline:none}.fs-num:focus{border-color:' + C_CYAN + '}' +
    // buttons
    '.fs-btn{position:relative;width:100%;border:0;border-radius:16px;padding:15px 16px;font-size:18px;font-weight:700;transition:opacity .15s;margin-top:16px}.fs-btn:active{opacity:.75}' +
    '.fs-go{background:' + C_CYAN + ';color:#fff;text-shadow:0 1px 1px rgba(0,60,90,.25)}.fs-stop{background:' + C_RED + ';color:#fff}' +
    '.fs-btn .sub{display:block;font-size:13px;font-weight:500;opacity:.9;margin-top:1px}' +
    '.fs-more{width:100%;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';color:' + C_CYAN + ';border-radius:14px;padding:13px;font-size:15px;font-weight:600;margin-top:10px}.fs-more:active{opacity:.7}' +
    '.fs-mini{display:flex;gap:8px;margin-top:6px}.fs-mini button{flex:1;background:' + C_CARD2 + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + ';border-radius:12px;padding:11px;font-size:13px;font-weight:600}' +
    '#fs-block{color:' + C_ORANGE + ';font-size:13px;margin:0 2px 10px}#fs-block:empty{display:none}' +
    '#fs-status{font-size:13px;color:' + C_MUT + ';margin:14px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:90px;overflow:auto;white-space:pre-wrap;color:' + C_MUT2 + ';font-size:11px;line-height:1.5}#fs-log:empty{display:none}' +
    '#fs-act{font-size:13px;color:' + C_MUT + ';text-align:center;margin:10px 2px 0}#fs-act:empty{display:none}' +
    // list rows (saved searches, trades, market, sessions, bulk groups)
    '.fs-item,.fs-trade,.fs-mrow,.fs-sale,.fs-bkg{display:flex;align-items:center;gap:12px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:13px 16px;margin:0 0 8px;color:' + C_TXT + '}' +
    '.fs-item{justify-content:space-between}.fs-item .nm,.fs-sale .nm{font-weight:600;font-size:15px}.fs-item .de,.fs-sale .de{font-size:12.5px;color:' + C_MUT + ';margin-top:1px}' +
    '.fs-item .act{display:flex;gap:8px}.fs-item .act button{border:0;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:700}' +
    '.fs-load{background:' + C_CYAN + ';color:#fff}.fs-del{background:' + C_CARD3 + ';color:' + C_MUT + '}' +
    '.fs-empty{text-align:center;color:' + C_MUT + ';font-size:14px;padding:28px 12px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:16px;margin-bottom:12px}' +
    '.fs-bar{height:4px;border-radius:999px;background:' + C_CARD3 + ';overflow:hidden;margin-top:7px}.fs-bar i{display:block;height:100%;border-radius:999px}' +
    '.fs-sale{justify-content:space-between}' +
    // settings rows
    '.fs-sect{padding:2px 16px}' +
    '.fs-set{padding:13px 0;border-top:1px solid ' + C_LINE + '}.fs-sect>.fs-set:first-child{border-top:0}' +
    '.fs-set .top{display:flex;align-items:center;justify-content:space-between;gap:12px}.fs-set .nm{font-size:16px;font-weight:600;color:' + C_TXT + '}' +
    '.fs-set>.fs-segw{margin-top:9px}.fs-set .sv{color:' + C_CYAN + ';font-weight:700;white-space:nowrap;' + NUM + '}' +
    '.ds{font-size:13px;line-height:1.4;color:' + C_MUT + ';margin-top:5px}' +
    '#fs-keep .fs-set:first-child{border-top:1px solid ' + C_LINE + '}' +
    '.fs-det{margin-bottom:10px;border-radius:16px;background:' + C_CARD + ';border:1px solid ' + C_LINE + '}' +
    '.fs-det>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:54px;padding:12px 16px;font-size:16px;color:' + C_TXT + '}' +
    '.fs-det>summary::-webkit-details-marker{display:none}.fs-det>summary>span{flex:1}.fs-det>summary small{font-size:14px;font-weight:700;color:' + C_TXT + '}' +
    '.fs-det>summary::after{content:"";width:9px;height:9px;border-right:2px solid ' + C_MUT2 + ';border-bottom:2px solid ' + C_MUT2 + ';transform:rotate(45deg);margin:-4px 3px 0 4px;transition:transform .2s}' +
    '.fs-det[open]>summary::after{transform:rotate(-135deg);margin-top:4px}' +
    '.fs-det>.in{padding:0 16px 8px;border-top:1px solid ' + C_LINE + '}.fs-det>.in>.fs-set:first-child{border-top:0}' +
    '.fs-det>.in>.fs-item{margin:8px 0 0;background:' + C_CARD2 + '}.fs-det>.in>.fs-empty{background:transparent;border:0;padding:16px 0}' +
    // market
    '.fs-mkt{position:relative;width:220px;max-width:76%;margin:4px auto 4px}.fs-mkt svg{width:100%;display:block}' +
    '.fs-mkt .mv{position:absolute;left:0;right:0;bottom:2px;text-align:center}.fs-mkt .mv b{display:block;font-size:42px;font-weight:800;line-height:1;letter-spacing:-1px;' + NUM + '}.fs-mkt .mv span{font-size:13px;color:' + C_MUT + '}' +
    '.fs-mrow .nm{flex:1;min-width:0;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-mrow .de{font-size:12px;color:' + C_MUT + ';font-weight:400}' +
    '.fs-mrow .msp{width:60px;height:20px;flex:none}.fs-mrow .pr{text-align:right;flex:none}.fs-mrow .pr b{display:block;font-size:15px;font-weight:700;' + NUM + '}.fs-mrow .pr span{font-size:12px;color:' + C_MUT + '}' +
    '.fs-mrow .pr .up{color:' + C_OK + '}.fs-mrow .pr .down{color:' + C_RED + '}' +
    // hub
    '.fs-range-seg{max-width:none;margin-bottom:12px}.fs-range-seg .fs-sg{flex:1}#fs-h-auto .fs-sw{flex:none;pointer-events:none}' +
    '.fs-dash{display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-bottom:0}' +
    '.fs-dc{position:relative;overflow:hidden;padding:15px 16px 12px;min-height:150px}' +
    '.fs-dc .dh{' + CAPS + '}.fs-dc .di{display:none}' +
    '.fs-dc .dv{font-size:32px;font-weight:800;letter-spacing:-.6px;margin:8px 0 4px;' + NUM + '}' +
    '.fs-dc .dsub{font-size:13px;color:' + C_MUT + ';margin-top:3px;position:relative;z-index:1}.fs-dc .dsub b{color:' + C_CYAN + ';font-weight:700}.fs-dc .dsub.up{color:' + C_OK + '}.fs-dc .dsub.down{color:' + C_RED + '}' +
    '.fs-dc .spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:44px}' +
    '.fs-dc .dpair{display:flex;gap:12px;margin:10px 0 8px}.fs-dc .dpair div{flex:1}.fs-dc .dpair b{display:block;font-size:26px;font-weight:800;' + NUM + '}.fs-dc .dpair span{' + CAPS + 'font-size:9.5px;letter-spacing:.5px}' +
    '.fs-dc.ac .dsub b{color:' + C_TXT + '}' +
    '.fs-safe{display:flex;align-items:center;gap:13px;padding:13px 16px}' +
    '.fs-safe .ico{flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;color:#fff;background:' + C_OK + '}' +
    '.fs-safe.warn .ico{background:' + C_ORANGE + '}.fs-safe.stop .ico{background:' + C_RED + '}' +
    '.fs-safe .tx{flex:1;min-width:0}.fs-safe .k{' + CAPS + 'font-size:10.5px}.fs-safe .t{font-size:17px;font-weight:700}.fs-safe .h{font-size:12px;color:' + C_MUT + '}' +
    '.fs-safe .chip{flex:none;font-size:13px;font-weight:700;color:' + C_OK + ';background:rgba(74,222,128,.12);border-radius:999px;padding:6px 11px}' +
    '.fs-safe.warn .chip{color:' + C_ORANGE + ';background:rgba(251,146,60,.13)}.fs-safe.stop .chip{color:' + C_RED + ';background:rgba(248,113,113,.13)}' +
    '.fs-tradebar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 10px}.fs-tradebar .fs-segw{flex:1;max-width:270px}' +
    '.fs-upd{background:transparent;border:1px solid ' + C_LINE + ';color:' + C_MUT + ';border-radius:12px;padding:8px 11px;font-size:13px}.fs-upd b{color:' + C_TXT + ';font-weight:600}' +
    '.fs-trade .av{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#3b2f0e;background:radial-gradient(circle at 35% 30%,#fff1b8,' + C_GOLD + ' 60%,#a8862a)}' +
    '.fs-trade .nm{flex:1;min-width:0;font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-trade .nm span{color:' + C_MUT + ';font-weight:500}' +
    '.fs-trade .nm i{font-style:normal;font-size:11px;color:' + C_MUT + ';border:1px solid ' + C_LINE + ';border-radius:6px;padding:0 5px;margin-left:4px}.fs-trade .de{font-size:12px;color:' + C_MUT + '}' +
    '.fs-trade .pf{font-weight:800;font-size:15px;' + NUM + 'color:' + C_MUT + '}.fs-trade .pf.open{color:' + C_CYAN + '}.fs-trade .pf.pos{color:' + C_OK + '}.fs-trade .pf.neg{color:' + C_RED + '}' +
    '.fs-trade .stt{flex:none;font-size:12.5px;font-weight:700;border-radius:999px;padding:5px 10px}.fs-trade .stt:before{content:"✓ "}' +
    '.fs-trade .stt.b{color:' + C_CYAN + ';background:' + C_CYAN_BG + '}.fs-trade .stt.s{color:' + C_OK + ';background:rgba(74,222,128,.13)}' +
    '#fs-h-trades>.fs-more{margin:0 0 12px}' +
    '.fs-hubbtns{display:flex;flex-direction:column;gap:8px;margin:4px 0 12px}' +
    '.fs-hb{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:14px 16px;color:' + C_TXT + '}.fs-hb:active{background:' + C_CARD2 + '}' +
    '.fs-hb .ic{flex:none;width:44px;height:44px;border-radius:12px;background:' + C_CYAN_BG + ';color:' + C_CYAN + ';display:flex;align-items:center;justify-content:center}' +
    '.fs-hb .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.fs-hb b{font-size:16px;font-weight:700}.fs-hb .tx span{font-size:13px;color:' + C_MUT + '}' +
    '.fs-hb .chev{flex:none;width:30px;height:30px;border-radius:50%;background:' + C_CARD3 + ';position:relative}.fs-hb .chev:after{content:"";position:absolute;left:9px;top:10px;width:8px;height:8px;border-right:2px solid ' + C_TXT + ';border-bottom:2px solid ' + C_TXT + ';transform:rotate(-45deg)}' +
    // bulk list
    '.fs-bk-head{display:flex;align-items:center;gap:6px;margin:0 0 12px}.fs-bk-head b{font-size:18px;font-weight:700;flex:1;text-align:center;margin-right:64px}' +
    '.fs-bk-back{border:0;background:transparent;color:' + C_CYAN + ';padding:6px 0;font-size:17px;width:64px;text-align:left}' +
    '.fs-bk-card{padding:8px 16px 8px;border-radius:18px;overflow:hidden}' +
    // label on top, full-width field below (EA\u2019s own input styles can\u2019t squeeze the label)
    '.fs-bk-card .fs-set .top{flex-direction:column;align-items:stretch;gap:8px}.fs-bk-card .fs-set .nm{white-space:nowrap}' +
    '.fs-bk-card .fs-num{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important;height:auto!important;-webkit-appearance:none;appearance:none;text-align:left}' +
    '.fs-bkg{width:100%;text-align:left;justify-content:space-between}' +
    '.fs-bkg .nm{font-weight:600;font-size:16px}.fs-bkg i,.fs-bk-sel i{font-style:normal;color:' + C_MUT + ';font-weight:500}.fs-bkg .ct{font-size:13px;color:' + C_MUT + '}.fs-bkg .ct b{font-size:16px;color:' + C_TXT + ';font-weight:800}' +
    '.fs-bk-sel{font-weight:800;font-size:22px;display:flex;align-items:baseline;gap:8px;padding:8px 0 8px}.fs-bk-sel span{margin-left:auto;font-size:13px;color:' + C_MUT + ';font-weight:500}' +
    '.fs-bk-err{color:' + C_RED + ';font-size:13px;padding:8px 0 4px}' +
    // floating button
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:56px;height:56px;border-radius:50%;background:' + C_CYAN + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(0,0,0,.4);touch-action:none;user-select:none;-webkit-user-select:none}' +
    '#fs-fab svg{width:24px;height:24px}#fs-fab.glide{transition:left .45s cubic-bezier(.22,1,.36,1),top .45s cubic-bezier(.22,1,.36,1)}#fs-fab.drag{transform:scale(1.08)}' +
    '#fs-fab .dot{position:absolute;top:3px;right:3px;width:13px;height:13px;border-radius:50%;background:' + C_OK + ';border:2px solid ' + C_BG + ';display:none}#fs-fab.run .dot{display:block}' +
    // price tag on cards
    '.sx-calc{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;padding:14px 16px;margin:12px 0}.sx-calc .row{display:flex;gap:10px;margin-top:8px}.sx-calc label{flex:1;min-width:0;font-size:12px;color:' + C_MUT + ';display:flex;flex-direction:column;gap:5px}' +
    '.sx-calc .fs-num{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important;text-align:left;-webkit-appearance:none}' +
    '.sx-calc .res{margin-top:10px;font-size:13px;color:' + C_MUT + ';line-height:1.4}.sx-calc .res b{display:block;font-size:24px;font-weight:800;margin:2px 0;' + NUM + '}.sx-calc .res span{display:block;font-size:12px}.sx-calc .res.g b{color:' + C_OK + '}.sx-calc .res.r b{color:' + C_RED + '}' +
    '#fs-tpbal{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:8px 10px;padding:12px 16px;border-radius:14px;background:rgba(18,23,34,.95);border:1px solid rgba(74,222,128,.45);font-family:' + FONT + ';color:#fff;position:relative;z-index:5}#fs-tpbal .k{font-size:13px;color:' + C_MUT + ';flex:1 1 auto}#fs-tpbal b{font-size:22px;font-weight:800;color:' + C_OK + ';' + NUM + '}#fs-tpbal b.neg{color:' + C_RED + '}#fs-tpbal .s{flex-basis:100%;font-size:12px;color:' + C_MUT + '}' +
    '.fs-bal{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:12px 16px 14px;border-top:1px solid ' + C_LINE + '}.fs-bal span{flex:1;font-size:13px;color:' + C_MUT + '}.fs-bal b{font-size:20px;font-weight:800;' + NUM + '}.fs-bal b.g{color:' + C_OK + '}.fs-bal b.r{color:' + C_RED + '}.fs-bal small{flex-basis:100%;font-size:12px;color:' + C_MUT + '}' +
    '.fs-badge.pf{border-color:rgba(74,222,128,.6);color:' + C_OK + '}.fs-badge.pf.neg{border-color:rgba(248,113,113,.6);color:' + C_RED + '}' +
    '.fs-badge{position:absolute;left:0;top:0;z-index:6;padding:1px 8px;border-radius:999px;background:rgba(18,23,34,.94);border:1px solid rgba(90,200,245,.5);color:#fff;font:700 11px/1.5 ' + FONT + ';' + NUM + 'white-space:nowrap;pointer-events:none}' +
    // running screen
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));background:rgba(18,23,34,.97);color:' + C_TXT + ';font:15px/1.4 ' + FONT + ';text-align:center;-webkit-font-smoothing:antialiased}' +
    '#fs-lock.show{display:flex}' +
    '#fs-lock .lspin{width:40px;height:40px;border-radius:50%;border:3px solid ' + C_CARD3 + ';border-top-color:' + C_CYAN + ';animation:fsspin .9s linear infinite}@keyframes fsspin{to{transform:rotate(360deg)}}' +
    '#fs-lock .lbig{font-size:28px;font-weight:800;font-style:italic;letter-spacing:-.4px}' +
    '#fs-lock .lstat{font-size:15px;color:' + C_CYAN + ';font-weight:600;min-height:20px;max-width:360px}' +
    '#fs-lock .lrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;max-width:420px}' +
    '#fs-lock .lrow div{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:10px 4px;' + CAPS + 'font-size:9.5px;letter-spacing:1px}' +
    '#fs-lock .lrow b{display:block;font-size:19px;font-weight:800;color:' + C_TXT + ';' + NUM + 'margin-top:3px;letter-spacing:0}#fs-lock .lrow .pf b{color:' + C_OK + '}' +
    '#fs-lock .lsub{font-size:13px;color:' + C_MUT + ';max-width:380px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;width:100%;max-width:420px;margin-top:4px}#fs-lock .lbtns button{flex:1;border:0;border-radius:16px;padding:15px;font-size:17px;font-weight:700}' +
    '#fs-lstop{background:' + C_RED + ';color:#fff}#fs-lhide{background:' + C_CARD2 + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + '!important}' +
    // live feed
    '.fs-feed{width:100%;max-width:420px;display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;text-align:left}' +
    '.fs-feed:empty{display:none}#fs-body .fs-feed{max-width:none;max-height:260px;margin:14px 0 0}' +
    '.fs-fl{flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:12px;color:' + C_TXT + ';font-size:13.5px;line-height:1.3}' +
    '.fs-fl .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-fl .tm{color:' + C_MUT2 + ';font-size:12px;' + NUM + '}' +
    '.fs-fl:before{content:"";width:7px;height:7px;border-radius:50%;background:' + C_CARD3 + ';flex:none}' +
    '.fs-fl.quiet{color:' + C_MUT + '}.fs-fl.check:before{background:' + C_ORANGE + '}.fs-fl.price:before,.fs-fl.list:before{background:' + C_CYAN + '}.fs-fl.stop:before{background:' + C_RED + '}' +
    '.fs-fl.hit{font-weight:700;border-color:rgba(74,222,128,.45);background:rgba(74,222,128,.08)}.fs-fl.hit:before{background:' + C_OK + '}.fs-fl.hit .tx{color:' + C_OK + '}' +
    // purchase banner
    '#fs-toast{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));z-index:2147483647;width:min(92vw,420px);transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,.9,.25,1);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(26,32,48,.97);border:1px solid rgba(74,222,128,.35);box-shadow:0 12px 30px rgba(0,0,0,.45);color:#fff;font:15px/1.3 ' + FONT + ';pointer-events:none}' +
    '#fs-toast.in{transform:translate(-50%,0)}#fs-toast .ic{flex:none;width:36px;height:36px;border-radius:50%;background:' + C_OK + ';color:#0b2a16;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}' +
    '#fs-toast .tx{min-width:0}#fs-toast b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fs-toast span{font-size:13px;color:' + C_MUT + ';' + NUM + '}';

  // ---------- UI ----------
  // Small line icons (24 px grid, stroke = currentColor).
  function icon(d) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  var ICON = {
    play: icon('<path d="M8 5v14l11-7z"/>'),
    grid: icon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    gear: icon('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
    bolt: icon('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>'),
    tag: icon('<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8.5" cy="8.5" r="1.4"/>'),
    target: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    box: icon('<path d="m4 7.5 8-4 8 4-8 4z"/><path d="M4 7.5v9l8 4 8-4v-9M12 11.5v9"/>'),
    clock: icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    list: icon('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    coins: icon('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'),
    refresh: icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    pack: icon('<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>')
  };
  var logLines = [], activity = '';
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); }
  // What the bot is doing right now (status line only; events go to the feed, see feed()).
  function say(m) { setActivity(m); }
  function setActivity(m) { activity = m; ['fs-act', 'fs-l-act'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = m; }); }
  // Live feed: one line per search ("Player not found  14:03:22"), newest on top. Keeps the
  // last FEED_MAX lines (older ones drop off quietly) and can be scrolled.
  var feedLines = [], FEED_MAX = 200, QUIET_MAX = 3; // 'quiet' = searches without a hit: only the last 3 stay
  function clock() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function feedHTML(l) { return '<div class="fs-fl ' + l.kind + '"><span class="tx">' + esc(l.text) + '</span><span class="tm">' + l.time + '</span></div>'; }
  // Every event, once: a line in the feed and the same line in the console.
  function feed(text, kind) {
    var l = { text: text, kind: kind || 'miss', time: clock() };
    feedLines.unshift(l);
    if (l.kind === 'quiet') { var q = 0; feedLines = feedLines.filter(function (x) { return x.kind !== 'quiet' || ++q <= QUIET_MAX; }); }
    if (feedLines.length > FEED_MAX) feedLines.length = FEED_MAX;
    try { console.log('[TangaTolga] ' + text + '  ' + l.time); } catch (e) {}
    var boxes = document.querySelectorAll('.fs-feed');
    for (var i = 0; i < boxes.length; i++) {
      var bx = boxes[i], keep = bx.scrollTop > 4 ? bx.scrollHeight - bx.scrollTop : null; // reading older lines: don't jump
      bx.insertAdjacentHTML('afterbegin', feedHTML(l));
      if (l.kind === 'quiet') { var qs = bx.querySelectorAll('.fs-fl.quiet'); for (var j = QUIET_MAX; j < qs.length; j++) bx.removeChild(qs[j]); }
      while (bx.children.length > FEED_MAX) bx.removeChild(bx.lastChild);
      if (keep != null) bx.scrollTop = bx.scrollHeight - keep;
    }
  }
  function clearFeed() { feedLines = []; var b = document.querySelectorAll('.fs-feed'); for (var i = 0; i < b.length; i++) b[i].innerHTML = ''; }
  function fillFeeds() { var html = feedLines.map(feedHTML).join(''), b = document.querySelectorAll('.fs-feed'); for (var i = 0; i < b.length; i++) if (!b[i].children.length && html) b[i].innerHTML = html; }

  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
  function fmtk(n) { return n == null ? '—' : (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'k' : fmt(n)); }
  function signed(n) { return n == null ? '—' : (n > 0 ? '+' + fmtk(n) : fmtk(n)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(t) { var d = (Date.now() - t) / 1000; if (d < 60) return 'just now'; if (d < 3600) return Math.round(d / 60) + 'm ago'; if (d < 86400) return Math.round(d / 3600) + 'h ago'; return Math.round(d / 86400) + 'd ago'; }
  function durLabel(s) { for (var i = 0; i < LIST_DURS.length; i++) if (LIST_DURS[i][1] === s) return LIST_DURS[i][0]; return Math.round((s || 3600) / 3600) + 'h'; }

  // ---------- settings controls: name + control, explanation underneath ----------
  function ctlNum(key) { return '<input class="fs-num" data-k="' + key + '" type="number" inputmode="numeric" value="' + cfg[key] + '">'; }
  function ctlSw(key) { return '<div class="fs-sw' + (cfg[key] ? ' on' : '') + '" data-sw="' + key + '"></div>'; }
  function ctlSeg(key, opts) { return '<div class="fs-segw">' + opts.map(function (o) { return '<button class="fs-sg' + (cfg[key] === o[1] ? ' on' : '') + '" data-seg="' + key + '" data-val="' + o[1] + '">' + o[0] + '</button>'; }).join('') + '</div>'; }
  function setting(name, ctl, desc, id) {
    return '<div class="fs-set"' + (id ? ' id="' + id + '"' : '') + '><div class="top"><div class="nm">' + name + '</div>' + ctl + '</div>' + (desc ? '<div class="ds">' + desc + '</div>' : '') + '</div>';
  }
  function segSetting(name, key, opts, desc) { return '<div class="fs-set"><div class="nm">' + name + '</div>' + ctlSeg(key, opts) + (desc ? '<div class="ds">' + desc + '</div>' : '') + '</div>'; }
  function rangeSetting(name, key, min, max, step, unit, desc) {
    return '<div class="fs-set"><div class="top"><div class="nm">' + name + '</div><b class="sv" data-sv="' + key + '">' + cfg[key] + unit + '</b></div>' +
      '<input class="fs-range" data-k="' + key + '" data-unit="' + unit + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + cfg[key] + '">' + (desc ? '<div class="ds">' + desc + '</div>' : '') + '</div>';
  }
  function section(title, body) { return '<div class="ios-h">' + title + '</div><div class="fs-sect">' + body + '</div>'; }
  // A fold-away group: closed by default, so the screen shows only what you use every day.
  function fold(title, body, sub) { return '<details class="fs-det"><summary><span>' + title + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</summary><div class="in">' + body + '</div></details>'; }
  function rebuildView() { var b = document.getElementById('fs-body'); if (b) b.setAttribute('data-tab', ''); render(); }

  // ---------- Sniper: what it's trading, Start, live feed, saved searches ----------
  // Speed row: tap the name to switch Night/Normal/Turbo, - / + = 0.2 s slower / faster (Custom).
  function stepper() { return '<span class="sx-pm"><button data-spd="-1" aria-label="slower">−</button><b class="gap" data-gap>' + gapLabel() + '</b><button data-spd="1" aria-label="faster">+</button></span>'; }
  function speedRow() { return '<div class="sx-row sx-spd"><button class="sx-sk" id="fs-r-speed"><span class="ic">' + ICON.bolt + '</span><span class="k">Speed <small id="fs-r-speed-v"></small></span></button>' + stepper() + '</div>'; }
  // Auto/Custom row: Auto explains what it does, Custom shows your own controls.
  function autoSetting(name, flag, autoText, custom) {
    return '<div class="fs-set"><div class="top"><div class="nm">' + name + '</div>' + ctlSeg(flag, [['Auto', 0], ['Custom', 1]]) + '</div>' +
      '<div class="ds" data-auto="' + flag + '">' + autoText + '</div><div class="fs-cust" data-cust="' + flag + '">' + custom + '</div></div>';
  }
  // Profit check: buy / sell price typed in -> profit after EA's 5% tax, live. Empty fields
  // show the current run's numbers (snipe price, sell price).
  function calcProfit() {
    var bi = document.getElementById('fs-pc-buy'), si = document.getElementById('fs-pc-sell'), out = document.getElementById('fs-pc-res'); if (!bi || !si || !out) return;
    var buy = parseCoins(bi.value) || 0, sell = parseCoins(si.value) || 0;
    bi.placeholder = market.snipe ? String(market.snipe) : '125000'; si.placeholder = listPrice() ? String(listPrice()) : '129000';
    if (!buy) buy = market.snipe || 0; if (!sell) sell = listPrice() || 0;
    if (!(buy > 0 && sell > 0)) { out.innerHTML = 'Type a price: the profit after EA\u2019s 5% shows right away.'; out.className = 'res'; return; }
    var p = profitAt(sell, buy), maxBuy = snipePoint(sell, cfg.minProfit);
    out.innerHTML = 'Buy ' + fmt(buy) + ' → sell ' + fmt(sell) + ' (you get ' + fmt(afterTax(sell)) + ')<b>' + (p >= 0 ? '+' : '−') + fmt(Math.abs(p)) + '</b>' +
      '<span>For +' + fmt(cfg.minProfit) + ' buy at most ' + (maxBuy ? fmt(maxBuy) : '—') + ' · break-even ' + fmt(afterTax(sell)) + '</span>';
    out.className = 'res ' + (p >= 0 ? 'g' : 'r');
  }
  function autoSummary() { var n = ['cRun', 'cCap', 'cCoins', 'cBreaks'].filter(function (k) { return cfg[k]; }).length; return n ? n + ' custom' : 'Auto'; }
  function sniperView() {
    var srow = function (id, ic, label) { return '<button class="sx-row" id="' + id + '"><span class="ic">' + ic + '</span><span class="k">' + label + '</span><span class="v" id="' + id + '-v"></span><span class="chev"></span></button>'; };
    var stat = function (id, label) { return '<div><b id="' + id + '">0</b><span>' + label + '</span></div>'; };
    return '<div id="fs-block"></div>' +
      '<div class="sx-sum">' +
        '<div class="sx-k" id="fs-t-kicker">Target</div><div class="sx-name" id="fs-t-name">—</div><div class="sx-sub" id="fs-t-mode"></div>' +
        '<div class="sx-3">' +
          '<div><span id="fs-l-snipe">Snipe under</span><b id="fs-t-snipe">—</b><small id="fs-t-price"></small></div>' +
          '<div><span id="fs-l-sell">Sell at</span><b id="fs-t-sell">—</b><small id="fs-t-sellsub"></small></div>' +
          '<div><span id="fs-l-prof">Profit</span><b id="fs-t-prof">—</b><small id="fs-t-profsub"></small></div>' +
        '</div></div>' +
      '<div class="sx-note" id="fs-t-sub"></div>' +
      '<div class="sx-calc"><div class="sx-k">Profit check</div><div class="row">' +
        '<label>Buy at<input class="fs-num" id="fs-pc-buy" type="text" inputmode="numeric" placeholder="125000"></label>' +
        '<label>Sell at<input class="fs-num" id="fs-pc-sell" type="text" inputmode="numeric" placeholder="129000"></label></div>' +
        '<div class="res" id="fs-pc-res">Type a price: the profit after EA\u2019s 5% shows right away.</div></div>' +
      '<div class="sx-rows">' + speedRow() + srow('fs-r-bid', ICON.coins, 'Buy with') + srow('fs-r-when', ICON.play, 'Start') + srow('fs-sell', ICON.tag, 'Sell price') + srow('fs-r-prof', ICON.target, 'Minimum profit') +
        srow('fs-r-after', ICON.box, 'After buying') + srow('fs-r-dur', ICON.clock, 'List for') + '</div>' +
      '<button class="fs-btn fs-go" id="fs-start"></button>' +
      '<div id="fs-act"></div>' +
      '<div class="sx-stats">' + stat('fs-s-buys', 'Bought') + stat('fs-s-sr', 'Searches') + stat('fs-s-est', 'Est. profit') + stat('fs-s-net', 'Per card') + '</div>' +
      '<div class="fs-feed"></div>' +
      '<div class="ios-h"></div>' +
      fold('Saved searches', '<div id="fs-filters"></div><button class="fs-more" id="fs-savefilter">Save the current market search</button>', filters.length ? String(filters.length) : '') +
      '<div id="fs-status"></div>';
  }
  function filtersHTML() {
    return filters.length ? filters.map(function (f, i) {
      var c = f.crit || {}, bits = [];
      if (c.level && c.level !== 'any') bits.push(String(c.level)); if (c.maskedDefId) bits.push('player'); if (c.rarities && c.rarities.length) bits.push('rarity'); if (c.league > 0) bits.push('league ' + c.league); if (c.nationality > 0) bits.push('nation ' + c.nationality);
      return '<div class="fs-item"><div><div class="nm">' + esc(f.name) + '</div><div class="de">' + (bits.join(' · ') || 'saved search') + '</div></div>' +
        '<div class="act"><button class="fs-load" data-load="' + i + '">Load</button><button class="fs-del" data-del="' + i + '">✕</button></div></div>';
    }).join('') : '<div class="fs-empty" style="padding:14px 10px">Search a player in the market, then save it here to load it again with one tap.</div>';
  }

  // ---------- Market: gauge + trend per card, from the bot's own price checks ----------
  function gaugeSVG(v) {
    var pt = function (val, r) { var a = Math.PI * (1 - val / 100); return (100 + r * Math.cos(a)).toFixed(1) + ' ' + (100 - r * Math.sin(a)).toFixed(1); };
    var arc = function (a, b, col) { return '<path d="M ' + pt(a, 80) + ' A 80 80 0 0 1 ' + pt(b, 80) + '" fill="none" stroke="' + col + '" stroke-width="15" stroke-linecap="round"/>'; };
    var segs = arc(1.5, 23, '#ff453a') + arc(27, 43, '#ff9f0a') + arc(47, 58, '#ffd60a') + arc(62, 98.5, '#30d158');
    if (v == null) return '<g opacity=".3">' + segs + '</g>';
    var p = pt(v, 80).split(' ');
    return segs + '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="11" fill="#fff" stroke="#000" stroke-width="4"/>';
  }
  function miniSpark(pts) {
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo || 1, up = pts[pts.length - 1] >= pts[0];
    return '<svg class="msp" viewBox="0 0 60 20" preserveAspectRatio="none"><polyline fill="none" stroke="' + (up ? '#30d158' : '#ff453a') + '" stroke-width="2" vector-effect="non-scaling-stroke" points="' +
      pts.map(function (v, i) { return (i * 60 / (pts.length - 1)).toFixed(1) + ',' + (18 - (v - lo) / span * 16).toFixed(1); }).join(' ') + '"/></svg>';
  }
  function marketWord(m) { return !m ? 'not enough checks yet' : m.index >= 60 ? 'prices rising' : m.index <= 40 ? 'prices falling' : 'prices steady'; }
  function marketView() {
    return '<div class="fs-mkt"><svg viewBox="0 0 200 118" id="fs-m-gauge"></svg><div class="mv"><b id="fs-m-idx">—</b><span id="fs-m-lbl"></span></div></div>' +
      '<div class="ds" style="text-align:center;margin:0 6px 14px">Built from the bot’s own price checks in the last 24 h (only cards checked twice or more count). 50 = flat · higher = your cards are getting dearer · lower = cheaper.</div>' +
      '<button class="fs-more" id="fs-to-scan">Send prices to Kartenscan</button>' +
      '<div class="fs-sect-h">Cards checked (24 h)</div><div id="fs-m-list"></div>';
  }
  // Hands the bot's latest checked price per player to the Kartenscan app (it lives on another site,
  // so it can't read this page's storage): the list rides in the link's #fragment, which never leaves the phone.
  var KARTENSCAN = 'https://raw.githack.com/ammkamk-jpg/Amk/card-scan/card-scan/index.html';
  function toKartenscan() {
    var list = scanExport(priceHist);
    if (!list.length) { feed('No price checks with a player name yet - nothing to send to Kartenscan', 'miss'); return; }
    window.open(KARTENSCAN + '#prices=' + encodeURIComponent(JSON.stringify(list)), '_blank');
  }
  function renderMarket($) {
    var m = marketIndex(priceHist, Date.now()), g = $('fs-m-gauge'), gh = gaugeSVG(m ? m.index : null);
    if (g && g.__h !== gh) { g.__h = gh; g.innerHTML = gh; }
    if ($('fs-m-idx')) $('fs-m-idx').textContent = m ? m.index : '—';
    if ($('fs-m-lbl')) $('fs-m-lbl').textContent = m ? marketWord(m) + ' · ' + (m.pct >= 0 ? '+' : '') + m.pct.toFixed(1) + '% avg over ' + m.cards + ' card' + (m.cards > 1 ? 's' : '') : marketWord(m);
    var l = $('fs-m-list');
    if (l) {
      var tr = cardTrends(priceHist, Date.now()), html = tr.length ? tr.map(function (c) {
        return '<div class="fs-mrow"><div class="nm">' + esc(c.name || 'Card') + '<div class="de">' + c.n + ' check' + (c.n > 1 ? 's' : '') + ' · ' + ago(c.t) + '</div></div>' + miniSpark(c.pts) +
          '<div class="pr"><b>' + fmt(c.price) + '</b><span class="' + (c.pct == null ? '' : c.pct >= 0 ? 'up' : 'down') + '">' + (c.pct == null ? '—' : (c.pct >= 0 ? '▲ +' : '▼ ') + c.pct.toFixed(1) + '%') + '</span></div></div>';
      }).join('') : '<div class="fs-empty">No price checks yet.<br>Every price check the sniper or the Hub makes shows up here.</div>';
      if (l.__html !== html) { l.__html = html; l.innerHTML = html; }
    }
  }

  // ---------- Settings: grouped, each one explained ----------
  function settingsView() {
    return section('Sniping',
        setting('Target profit per card', ctlNum('minProfit'), 'Coins per card after EA\u2019s 5% tax.') +
        setting('Sell price', ctlNum('sellPrice'), '0 = auto (checked market price).') +
        segSetting('Profit counts from', 'snipeFrom', [['Your sell price', 1], ['Lower of sell / market', 0]], 'Your sell price: the bot buys up to sell price − 5% − target profit, so the profit is about your target. Lower of both: safer when your sell price is above the market, but the profit then comes out higher.') +
        segSetting('Profit tolerance', 'profitTol', [['0%', 0], ['±10%', 10], ['±20%', 20], ['±30%', 30]], 'Above 100k EA prices go in 1,000 steps, so a target of 850 can only be 550 or 1,550. The tolerance lets the bot pick the step closest to your target.') +
        segSetting('After buy', 'afterBuy', [['List', 0], ['Transfer list', 1], ['Unassigned', 2]], 'List = price check + relist. Transfer list / Unassigned = buys up to the Max. Buy Now of your web app search.') +
        segSetting('List for', 'listDur', LIST_DURS, '') +
        segSetting('Buy with', 'bidMode', [['Buy Now', 0], ['Bids', 1]], 'Bids = bid on auctions about to end, one bid per card. Max bid: the web app search\u2019s Max. Bid (else Max. Buy Now), or the snipe price in List mode.') +
        '<div id="fs-bidset">' + setting('Max open bids', ctlNum('bidCap'), 'Bids waiting for their auction to end.') + rangeSetting('Auctions ending within', 'bidSecs', 30, 180, 10, 's', '') + '</div>' +
        segSetting('Speed', 'speed', [['Night', 0], ['Normal', 1], ['Turbo', 2], ['Custom', 3]], '') +
        setting('Search gap', stepper(), '<span id="fs-speedhint">' + speedHint() + '</span>')) +
      fold('Run &amp; breaks',
        autoSetting('Runtime', 'cRun', 'Runs until you tap Stop.', setting('Minutes', ctlNum('runMinutes'), '0 = no limit.')) +
        autoSetting('Stop limit', 'cCap', 'Stops after 15 cards bought.', setting('Stop after', ctlNum('sessionBuyCap'), 'cards bought in one run.')) +
        autoSetting('Out of coins', 'cCoins', 'Stops when a card costs more than your coins.', '<div class="ds">Keeps searching (coins from sales can come in).</div>') +
        autoSetting('Breaks', 'cBreaks', 'A ~90 s break every ~30 searches.', rangeSetting('Break every ~', 'breakEvery', 0, 120, 5, ' searches', '0 = no breaks (more risk).') + rangeSetting('Break length', 'breakSec', 15, 300, 5, 's', '')), '<span id="fs-asum">' + autoSummary() + '</span>') +
      fold('Safety stops',
        setting('Too many results stop (10+)', ctlSw('tooManyStop'), 'Manual price: 10+ cards at your price = probably a typo in the price. Stops before buying.') +
        setting('Price range stop', ctlSw('rangeStop'), 'Never lists outside EA\u2019s allowed price range.') +
        setting('Keep special versions', ctlSw('keepSpecials'), 'A TOTW/special caught by a player search is kept, not sold at the normal price.') +
        setting('Daily buy cap', ctlNum('dailyBuyCap'), 'Never more than this per day, whatever the run settings say.'), 'on') +
      fold('Transfer list',
        setting('Relist expired cards', ctlSw('relistExpired'), 'While sniping.') +
        setting('Re-price expired first', ctlSw('repriceExpired'), 'Today\u2019s price, never below break-even. Off = same price.') +
        segSetting('Clear sold items', 'clearSold', [['Off', 0], ['When full', 1], ['Always', 2]], '') +
        setting('Pack pulls: list if worth at least', ctlNum('packMin'), '')) +
      fold('Fine-tuning',
        rangeSetting('Re-check price every ~', 'reprobeEvery', 30, 120, 10, ' searches', '') +
        setting('Vary min bid', ctlSw('varyMinBid'), 'Fresh results on every search.') +
        '<div id="fs-keep">' + setting('Fallback buy price', ctlNum('keepMax'), 'Only used when your web app search has no Max. Buy Now.') +
          setting('Fallback min price', ctlNum('keepMin'), 'Only used when your web app search has no Min. Buy Now. 0 = off.') + '</div>') +
      fold('Alerts',
        segSetting('Snipe sound', 'sound', SOUNDS, 'Tap one to hear it.') +
        setting('Vibrate on snipe', ctlSw('vibrate'), '') +
        setting('Price tags on cards', ctlSw('badges'), 'EA\u2019s AVG value under every card.') +
        '<button class="fs-more" id="fs-test">Test the purchase banner</button>') +
      fold('Help &amp; data',
        '<div class="fs-mini"><button id="fs-diag">Copy diagnostics</button><button id="fs-clearsess">Clear sessions</button><button id="fs-reset2">Reset all-time</button></div>' +
        '<div class="ds" style="margin-top:8px">Diagnostics contain no password or login data.</div><pre id="fs-log"></pre>');
  }

  // Hub, top to bottom: profit + activity cards, safety assistant, trades (bought / sold), then
  // the transfer list tools.
  var hubFilter = 'all', hubShowAll = false;
  function hubView() {
    return '' +
      '<div class="fs-segw fs-range-seg">' + RANGES.map(function (r, i) { return '<button class="fs-sg" data-hr="' + i + '">' + r + '</button>'; }).join('') + '</div>' +
      '<div class="fs-dash">' +
        '<div class="fs-dc pr"><div class="dh" id="fs-h-ph">Profit</div><div class="dv" id="fs-h-total">—</div>' +
          '<div class="dsub" id="fs-h-unl">of which unrealized <b id="fs-h-unreal">—</b></div><div class="dsub" id="fs-h-vs"></div><svg class="spark" id="fs-h-spark" viewBox="0 0 100 32" preserveAspectRatio="none"></svg></div>' +
        '<div class="fs-dc ac"><div class="dh">Activity</div><div class="dpair"><div><b id="fs-h-sess">—</b><span>sessions</span></div><div><b id="fs-h-srch">—</b><span>searches</span></div></div>' +
          '<div class="dsub">avg <b id="fs-h-avg">—</b> / card</div></div>' +
      '</div>' +
      '<div class="fs-safe" id="fs-h-safe"><div class="ico" id="fs-h-safe-i">✓</div><div class="tx"><div class="k">Safety assistant</div><div class="t" id="fs-h-safe-t">—</div><div class="h" id="fs-h-safe-h"></div></div><div class="chip" id="fs-h-safe-c"></div></div>' +
      '<div class="fs-tradebar"><div class="fs-segw" style="max-width:none;justify-content:flex-start">' +
        '<button class="fs-sg" data-hf="all">All</button><button class="fs-sg" data-hf="open">Bought</button><button class="fs-sg" data-hf="sold">Sold</button></div>' +
        '<button class="fs-upd" id="fs-h-refresh">Updated <b id="fs-h-at">—</b></button></div>' +
      '<div id="fs-h-trades"></div>' +
      '<div class="fs-card" style="margin-top:12px"><div class="fs-ch">Transfer list <span id="fs-h-cnt" style="text-transform:none;letter-spacing:0;font-weight:600"></span></div><div class="fs-cols c4">' +
        '<div class="c"><div class="l">Sold</div><div class="v g" id="fs-h-nsold">—</div></div>' +
        '<div class="c"><div class="l">Active</div><div class="v c" id="fs-h-nact">—</div></div>' +
        '<div class="c"><div class="l">Expired</div><div class="v r" id="fs-h-nexp">—</div></div>' +
        '<div class="c"><div class="l">Unlisted</div><div class="v" id="fs-h-nun">—</div></div>' +
      '</div><div class="fs-bal"><span>If everything sells at its price</span><b id="fs-h-bal">—</b><small id="fs-h-bals"></small></div></div>' +
      '<div class="ios-h">Tools</div><div class="fs-hubbtns">' +
        '<button class="fs-hb" id="fs-h-auto"><span class="ic">' + ICON.refresh + '</span><span class="tx"><b>Auto relister</b><span id="fs-h-auto-s">Off</span></span><span class="fs-sw" id="fs-h-auto-sw"></span></button>' +
        hubTool('fs-h-bulk', ICON.list, 'List many at one price', 'Pick a player on your transfer list, one price for all', '') +
        hubTool('fs-h-club', ICON.grid, 'My Club', 'List club players at one price', '') +
        hubTool('fs-h-clear', ICON.coins, 'Book &amp; clear sold', 'refresh first', 'fs-h-clear-s') +
        hubTool('fs-h-exp', ICON.refresh, 'Re-price &amp; relist expired', 'refresh first', 'fs-h-exp-s') +
        hubTool('fs-h-packs', ICON.pack, 'List pack pulls', 'refresh first', 'fs-h-packs-s') +
      '</div>' +
      fold('Sessions', '<div id="fs-h-sessions"></div>');
  }
  function hubTool(id, ic, title, sub, subId) { return '<button class="fs-hb" id="' + id + '"><span class="ic">' + ic + '</span><span class="tx"><b>' + title + '</b><span' + (subId ? ' id="' + subId + '"' : '') + '>' + sub + '</span></span><span class="chev"></span></button>'; }
  function bulkView() {
    var club = bulk.src === 'club';
    var h = '<div class="fs-bk-head"><button class="fs-bk-back" id="fs-bk-back">‹ Hub</button><b>' + (club ? 'My Club' : 'List many at one price') + '</b></div>';
    if (bulk.loading) return h + '<div class="fs-empty">Reading your ' + (club ? 'club' : 'transfer list') + '…</div>';
    if (!bulk.sel) {
      if (!bulk.groups) return h + '<div class="fs-empty">' + esc(bulk.err || '…') + '</div>';
      return h + '<div class="ds" style="margin:2px 4px 10px">' + (club ? 'Tradeable players in your club, grouped. Listing moves them to the transfer list first: room for <b>' + bulk.room + '</b> more.' : 'Cards on your transfer list that are not listed (or expired), grouped by player.') + ' Pick one.</div>' +
        (bulk.groups.length ? bulk.groups.map(function (g, i) {
          return '<button class="fs-bkg" data-bk="' + i + '"><span class="nm">' + esc(g.name) + (g.rating ? ' <i>' + g.rating + '</i>' : '') + '</span><span class="ct"><b>' + g.count + '</b> ' + (club ? 'in club' : 'waiting') + (g.expired ? ' · ' + g.expired + ' expired' : '') + '</span></button>';
        }).join('') : '<div class="fs-empty">' + (club ? 'No tradeable players found in your club.' : 'Nothing waiting: every card on your transfer list is listed or sold.') + '</div>');
    }
    var g = bulk.sel, dur = bulk.dur || cfg.listDur || 3600;
    var inp = function (id, val, ph) { return '<input class="fs-num" id="' + id + '" type="text" inputmode="numeric" value="' + esc(val == null ? '' : String(val)) + '" placeholder="' + ph + '">'; };
    return h + '<div class="fs-card fs-bk-card"><div class="fs-bk-sel">' + esc(g.name) + (g.rating ? ' <i>' + g.rating + '</i>' : '') + '<span>' + g.count + ' waiting</span></div>' +
        setting('Buy Now price', inp('fs-bk-price', bulk.price || '', 'e.g. 25000'), bulk.price && Number(bulk.price) === lastPriceOf(g.def) ? 'Your last price check for this card.' : 'Every card gets this price.') +
        setting('Start price', inp('fs-bk-start', bulk.start, 'auto'), 'Empty = one price step below Buy Now.') +
        setting('How many', inp('fs-bk-n', bulk.n, String(bulkMax(g))), 'Up to ' + bulkMax(g) + (club && bulkMax(g) < g.count ? ' (room on your transfer list).' : '.')) +
        '<div class="fs-set"><div class="nm">List for</div><div class="fs-segw">' + LIST_DURS.map(function (o) { return '<button class="fs-sg' + (o[1] === dur ? ' on' : '') + '" data-bkdur="' + o[1] + '">' + o[0] + '</button>'; }).join('') + '</div></div>' +
        (bulk.err ? '<div class="fs-bk-err">' + esc(bulk.err) + '</div>' : '') +
      '</div><button class="fs-btn fs-go" id="fs-bk-go">List</button><button class="fs-more" id="fs-bk-other">Pick another player</button>';
  }
  function sessionsHTML() {
    if (!sessions.length) return '<div class="fs-empty" style="padding:14px 10px">No sessions yet.</div>';
    var maxAbs = Math.max.apply(null, sessions.map(function (s) { return Math.abs(s.net || s.est || 0); }).concat([1]));
    return sessions.slice(0, 15).map(function (s) {
      var val = s.net != null ? s.net : s.est, w = Math.round(Math.abs(val || 0) / maxAbs * 100);
      return '<div class="fs-sale"><div style="flex:1"><div class="nm">' + signed(val) + ' coins</div><div class="de">' + ago(s.t) + ' · ' + (s.buys || 0) + ' bought · est ' + signed(s.est) + '</div><div class="fs-bar"><i style="width:' + w + '%;background:' + ((val || 0) < 0 ? '#ff453a' : '#30d158') + '"></i></div></div></div>';
    }).join('');
  }
  function initials(name) { var p = String(name || '?').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function tradeRows() {
    var open = Object.keys(ledger.buys).map(function (id) { var b = ledger.buys[id]; return { t: b.t, name: b.name, rating: b.rating, open: true, pack: b.pack, profit: b.list ? profitAt(b.list, b.buy) : null }; });
    var sold = ledger.sales.map(function (x) { return { t: x.t, name: x.name, rating: x.rating, open: false, pack: x.pack, profit: x.profit }; });
    var rows = (hubFilter === 'open' ? open : hubFilter === 'sold' ? sold : open.concat(sold)).sort(function (a, b) { return b.t - a.t; });
    return rows;
  }
  function sparkSVG(pts) {
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts.concat([0])), hi = Math.max.apply(null, pts.concat([1])), span = hi - lo || 1;
    var xy = pts.map(function (v, i) { return (i * 100 / (pts.length - 1)).toFixed(1) + ',' + (30 - (v - lo) / span * 26).toFixed(1); });
    return '<polygon fill="rgba(10,132,255,.14)" points="0,32 ' + xy.join(' ') + ' 100,32"/><polyline fill="none" stroke="#0a84ff" stroke-width="1.6" vector-effect="non-scaling-stroke" points="' + xy.join(' ') + '"/>';
  }
  function renderHub($) {
    var set = function (id, v) { var el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    var rg = cfg.hubRange | 0, since = rangeStart(rg, new Date());
    var all = realProfit(since), today = realProfit(startOfToday()), yest = realProfit(startOfToday() - 86400000);
    var yOnly = yest.sum - today.sum, unreal = 0;
    Object.keys(ledger.buys).forEach(function (id) { var b = ledger.buys[id]; if (b.list) unreal += profitAt(b.list, b.buy); });
    if (rg < 3) unreal = 0; // unrealized = cards listed right now: only part of the all-time view
    set('fs-h-ph', 'Profit · ' + RANGES[rg]); var ul = $('fs-h-unl'); if (ul) ul.style.display = rg < 3 ? 'none' : '';
    set('fs-h-total', all.n || unreal ? fmt(all.sum + unreal) : '—');
    set('fs-h-unreal', unreal ? signed(unreal) : '—');
    var vs = $('fs-h-vs');
    if (vs) {
      var pct = yOnly ? Math.round((today.sum - yOnly) / Math.abs(yOnly) * 100) : null;
      var t = rg !== 0 ? all.n + ' card' + (all.n === 1 ? '' : 's') + ' sold' : pct == null ? 'today ' + (today.n ? signed(today.sum) : '—') : (pct >= 0 ? '▲ +' : '▼ ') + pct + '% vs. yesterday';
      if (rg !== 0) pct = null;
      if (vs.textContent !== t) { vs.textContent = t; vs.className = 'dsub ' + (pct == null ? '' : pct >= 0 ? 'up' : 'down'); }
    }
    var sp = $('fs-h-spark'), sh = sparkSVG(profitCurve(ledger.sales.filter(function (x) { return x.t >= since; }), 30)); if (sp && sp.__h !== sh) { sp.__h = sh; sp.innerHTML = sh; }
    set('fs-h-sess', String(sessions.filter(function (x) { return x.t >= since; }).length)); set('fs-h-srch', fmtk(rg >= 3 ? life.searches || 0 : sumDays(searchDays, since)));
    var hrs = document.querySelectorAll('[data-hr]'); for (var hi = 0; hi < hrs.length; hi++) { var hon = Number(hrs[hi].getAttribute('data-hr')) === rg; if (hrs[hi].classList.contains('on') !== hon) hrs[hi].classList.toggle('on', hon); }
    set('fs-h-auto-s', autoRel.on ? (hub.busy === 'auto' ? 'On · checking…' : 'On · next check in ' + Math.max(1, Math.round((autoRel.next - Date.now()) / 60000)) + ' min' + (autoRel.count ? ' · ' + autoRel.count + ' relisted' : '')) : 'Off · relists expired cards every 4-7 min while idle');
    var asw = $('fs-h-auto-sw'); if (asw) asw.className = 'fs-sw' + (autoRel.on ? ' on' : ''); set('fs-h-avg', all.n ? fmt(Math.round(all.sum / all.n)) : '—');
    var st = safetyStatus(searchesToday(), life.lastBlock ? Date.now() - life.lastBlock : null), sb = $('fs-h-safe');
    if (sb) {
      sb.className = 'fs-safe ' + st.level; set('fs-h-safe-i', st.level === 'ok' ? '✓' : st.level === 'warn' ? '!' : '■');
      set('fs-h-safe-t', st.title); set('fs-h-safe-h', st.hint + ' · estimate, not EA’s real limit');
      set('fs-h-safe-c', st.minutes ? '⏱ ' + (st.minutes >= 60 ? '1h' : st.minutes + 'm') + ' sniping' : st.level === 'stop' ? 'rest' : 'short break');
    }
    var segs = document.querySelectorAll('[data-hf]'); for (var i = 0; i < segs.length; i++) { var on = segs[i].getAttribute('data-hf') === hubFilter; if (segs[i].classList.contains('on') !== on) segs[i].classList.toggle('on', on); }
    set('fs-h-at', hub.busy === 'refresh' ? '…' : hub.at ? ago(hub.at).replace('just now', '0s ago') : 'tap to refresh');
    var tl = $('fs-h-trades');
    if (tl) {
      var rows = tradeRows(), shown = hubShowAll ? rows.slice(0, 100) : rows.slice(0, 8);
      var html = shown.length ? shown.map(function (x) {
        return '<div class="fs-trade"><div class="av">' + esc(initials(x.name)) + '</div><div class="nm">' + esc(x.name) + (x.rating ? ' <span>(' + x.rating + ')</span>' : '') + (x.pack ? ' <i>pack</i>' : '') + '<div class="de">' + ago(x.t) + '</div></div>' +
          '<div class="pf ' + (x.profit == null ? '' : x.open ? 'open' : x.profit < 0 ? 'neg' : 'pos') + '">' + (x.profit == null ? '?' : signed(x.profit)) + '</div>' +
          '<div class="stt ' + (x.open ? 'b' : 's') + '">' + (x.open ? 'Bought' : 'Sold') + '</div></div>';
      }).join('') + (rows.length > 8 ? '<button class="fs-more" id="fs-h-more">' + (hubShowAll ? 'Show less' : 'Show all ' + rows.length) + '</button>' : '')
        : '<div class="fs-empty">No trades yet.<br>Cards the bot buys and sells show up here.</div>';
      if (tl.__html !== html) { tl.__html = html; tl.innerHTML = html; }
    }
    set('fs-h-cnt', hub.at ? '· ' + hub.total + '/' + TRADEPILE_MAX : '');
    var hb = hub.bal, hbe = $('fs-h-bal');
    set('fs-h-bal', hb && hb.n ? (hb.sum >= 0 ? '+' : '−') + fmt(Math.abs(hb.sum)) : '—'); if (hbe) hbe.className = hb && hb.sum < 0 ? 'r' : hb && hb.n ? 'g' : '';
    set('fs-h-bals', hb ? hb.n + ' cards with known cost' + (hb.unknown ? ' · ' + hb.unknown + ' unknown' : '') + (hb.unlisted ? ' · ' + hb.unlisted + ' not listed' : '') : 'refresh to see');
    var n = function (v) { return hub.at ? String(v) : '—'; };
    set('fs-h-nsold', n(hub.sold)); set('fs-h-nact', n(hub.active)); set('fs-h-nexp', n(hub.expired)); set('fs-h-nun', n(hub.unlisted));
    set('fs-h-clear-s', hub.busy === 'clear' ? 'working…' : hub.at ? (hub.sold ? hub.sold + ' sold · +' + fmt(hub.soldValue) : 'nothing sold yet') : 'refresh first');
    set('fs-h-exp-s', hub.at ? (hub.expired ? hub.expired + ' expired · ' + (cfg.repriceExpired ? 'price check each (~3-6 searches)' : 'same price') : 'none expired') : 'refresh first');
    set('fs-h-packs-s', hub.packs == null ? 'refresh first' : hub.packsTradable ? hub.packsTradable + ' tradeable player' + (hub.packsTradable > 1 ? 's' : '') + ' · price check each' : 'no tradeable players in unassigned');
  }
  // The ⚡ button can be dragged anywhere (so it never covers e.g. the Club tile); the spot is remembered.
  var FAB_KEY = 'futSnipe.fab.v1', fabDraggedAt = 0;
  function placeFab(fab, x, y) {
    var w = window.innerWidth || 390, h = window.innerHeight || 700, size = 58;
    x = Math.min(Math.max(6, x), w - size - 6); y = Math.min(Math.max(6, y), h - size - 6);
    fab.style.left = x + 'px'; fab.style.top = y + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
  }
  function makeFabDraggable(fab) {
    var saved = lsGet(FAB_KEY, null), drag = null;
    if (saved && saved.x != null) placeFab(fab, saved.x, saved.y);
    window.addEventListener('resize', function () { var r = fab.getBoundingClientRect(); if (fab.style.left) placeFab(fab, r.left, r.top); });
    fab.addEventListener('pointerdown', function (e) {
      var r = fab.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, moved: false, trail: [] };
      fab.classList.remove('glide');
      try { fab.setPointerCapture(e.pointerId); } catch (x) {}
    });
    fab.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 8) return; // a tap, not a drag
      drag.moved = true; fab.classList.add('drag'); e.preventDefault();
      drag.trail.push({ x: e.clientX, y: e.clientY, t: Date.now() }); if (drag.trail.length > 6) drag.trail.shift();
      placeFab(fab, drag.l + dx, drag.t + dy);
    });
    // Let go: keep the swipe's momentum for a moment, then glide to the nearest side and settle.
    var end = function () {
      fab.classList.remove('drag');
      if (drag && drag.moved) {
        var tr = drag.trail, a = tr[0], z = tr[tr.length - 1], dt = a && z ? Math.max(16, z.t - a.t) : 16;
        var vx = a && z && Date.now() - z.t < 120 ? (z.x - a.x) / dt : 0, vy = a && z && Date.now() - z.t < 120 ? (z.y - a.y) / dt : 0;
        var x = parseInt(fab.style.left, 10) + vx * 220, y = parseInt(fab.style.top, 10) + vy * 220;
        var w = window.innerWidth || 390;
        x = x + 29 < w / 2 ? 10 : w - 68; // snap to the closer side
        fab.classList.add('glide'); placeFab(fab, x, y);
        lsSet(FAB_KEY, { x: parseInt(fab.style.left, 10), y: parseInt(fab.style.top, 10) }); fabDraggedAt = Date.now();
      }
      drag = null;
    };
    fab.addEventListener('pointerup', end); fab.addEventListener('pointercancel', end);
  }

  // Manual sell price from the Sniper card: "15500", "15.5k", empty / 0 = auto.
  function askSellPrice() {
    var cur = cfg.sellPrice > 0 ? String(cfg.sellPrice) : '';
    var v = window.prompt('Sell price for ' + searchLabel() + (market.price ? ' (market ' + fmt(market.price) + ')' : '') + '\nEmpty or 0 = auto (checked market price)', cur);
    if (v == null) return;
    var n = String(v).trim() === '' ? 0 : parseCoins(v);
    if (n == null || (n > 0 && n < MIN_PRICE)) { blockMsg = 'Sell price not understood: "' + v + '"'; render(); return; }
    cfg.sellPrice = n > 0 ? roundStep(n) : 0; save(); applySell(); blockMsg = ''; redrawTab();
  }

  // Tabs are only rebuilt when you switch tab; after changing what a tab shows, rebuild it now.
  function redrawTab() { var b = document.getElementById('fs-body'); if (b) b.removeAttribute('data-tab'); render(); }

  function buildUI() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'fs-panel';
    el.innerHTML =
      '<div id="fs-head"><div class="brand"><span class="logo">' + ICON.bolt + '</span><span class="t">TangaTolga<span class="v">v' + VERSION + '</span></span></div><div style="display:flex;align-items:center"><span class="coins" id="fs-coins">—</span><button id="fs-min" title="Close">✕</button></div></div>' +
      '<div id="fs-tiles">' +
        '<div class="fs-tile" data-tab="snipe"><div class="ti" id="fs-ti-run">' + ICON.play + '</div><div class="tl">Sniper</div></div>' +
        '<div class="fs-tile" data-tab="hub"><div class="ti">' + ICON.grid + '</div><div class="tl">My Hub</div></div>' +
        '<div class="fs-tile" data-tab="market"><div class="tg"><svg viewBox="0 0 200 118" id="fs-ti-gauge"></svg><b id="fs-ti-idx">—</b></div><div class="tl">Market</div></div>' +
        '<div class="fs-tile" data-tab="settings"><div class="ti">' + ICON.gear + '</div><div class="tl">Settings</div></div>' +
      '</div><div id="fs-body"></div>';
    document.body.appendChild(el);
    var fab = document.createElement('div'); fab.id = 'fs-fab'; fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 2 4.5 13.6h6.3L9.6 22l9-11.6h-6.3z"/></svg><span class="dot"></span>';
    fab.onclick = function () { if (Date.now() - fabDraggedAt < 400) return; el.classList.add('open'); fab.style.display = 'none'; render(); };
    document.body.appendChild(fab);
    makeFabDraggable(fab);

    var lock = document.createElement('div'); lock.id = 'fs-lock';
    lock.innerHTML = '<div class="lspin"></div><div class="lbig">Running</div>' +
      '<div class="lstat" id="fs-l-act">Checking price…</div>' +
      '<div class="lrow"><div>Bought<b id="fs-l-buys">0</b></div><div>Searches<b id="fs-l-sr">0</b></div><div class="pf">Profit/card<b id="fs-l-pf">—</b></div><div>Est. profit<b id="fs-l-net">—</b></div></div>' +
      '<div class="lsub" id="fs-l-sub"></div>' +
      '<div class="fs-feed"></div>' +
      '<div class="lbtns"><button id="fs-lstop">Stop</button><button id="fs-lhide">Hide</button></div>';
    document.body.appendChild(lock);
    // The lock screen blocks swipes so the web app underneath can't be scrolled by accident,
    // except inside the feed, which you can scroll to read older searches.
    lock.addEventListener('touchmove', function (ev) { if (!(ev.target.closest && ev.target.closest('.fs-feed'))) ev.preventDefault(); }, { passive: false });
    lock.querySelector('#fs-lstop').onclick = function () { stopAll(); };
    lock.querySelector('#fs-lhide').onclick = function () { lockHidden = true; render(); };

    // live label while dragging a slider
    el.addEventListener('input', function (e) { if (e.target && /^fs-pc-/.test(e.target.id || '')) { e.target.__typed = true; calcProfit(); } });
    el.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k || e.target.type !== 'range') return; cfg[k] = Number(e.target.value) || 0; var lab = el.querySelector('[data-sv="' + k + '"]'); if (lab) lab.textContent = cfg[k] + (e.target.getAttribute('data-unit') || ''); });
    el.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return; cfg[k] = Number(e.target.value) || 0; if (k === 'sellPrice' || k === 'minProfit') applySell(); save(); render(); });
    el.addEventListener('click', function (e) {
      // closest(): a tap on the subtitle <span> inside a button still counts as that button.
      var tg = e.target && e.target.closest ? e.target.closest('button,[data-tab],[data-sw]') : e.target;
      if (!tg || !el.contains(tg)) return;
      var g = function (a) { return tg.getAttribute && tg.getAttribute(a); };
      var tb = g('data-tab'); if (tb) { tab = tb; render(); return; }
      var sw = g('data-sw'); if (sw) { cfg[sw] = cfg[sw] ? 0 : 1; if (sw === 'vibrate' && cfg.vibrate) vibrate(); if (sw === 'badges') { if (cfg.badges) paintBadges(); else removeBadges(); } save(); render(); return; }
      var seg = g('data-seg'); if (seg) { cfg[seg] = Number(g('data-val')) || 0; if (seg === 'speed') applySpeed(); if (seg === 'snipeFrom' || seg === 'profitTol') applySell(); if (seg === 'sound') { unlockAudio(); playSound(cfg.sound); } save(); render(); return; }
      var sp = g('data-spd'); if (sp) { speedStep(Number(sp)); save(); render(); return; }
      var hr = g('data-hr'); if (hr != null) { cfg.hubRange = Number(hr); save(); render(); return; }
      var hf = g('data-hf'); if (hf) { hubFilter = hf; hubShowAll = false; render(); return; }
      var bk = g('data-bk'); if (bk != null) { pickBulk(Number(bk)); return; }
      var bd = g('data-bkdur'); if (bd != null) { saveBulkInputs(); bulk.dur = Number(bd); rebuildView(); return; }
      var ld = g('data-load'); if (ld != null) { loadFilter(Number(ld)); return; }
      var dl = g('data-del'); if (dl != null) { deleteFilter(Number(dl)); return; }
      switch (tg.id) {
        case 'fs-start': if (running) stopAll(); else { unlockAudio(); start(); } break;
        case 'fs-sell': askSellPrice(); break;
        case 'fs-r-speed': cfg.speed = ((cfg.speed | 0) + 1) % 3; applySpeed(); save(); render(); break;
        case 'fs-r-when': if (running) break; var wt = window.prompt('Start at what time? (24 h, e.g. 22:30)\nLeave empty to start right away.', startAt || ''); if (wt != null) { wt = wt.trim().replace('.', ':'); if (!wt || startDelayMs(wt, new Date()) != null) { startAt = wt ? (wt.length === 4 ? '0' + wt : wt) : ''; blockMsg = ''; } else blockMsg = 'Type a time like 22:30.'; render(); } break;
        case 'fs-r-bid': if (!running) { cfg.bidMode = cfg.bidMode ? 0 : 1; save(); render(); } break;
        case 'fs-r-after': cfg.afterBuy = ((cfg.afterBuy | 0) + 1) % 3; save(); render(); break;
        case 'fs-r-dur': var di = LIST_DURS.map(function (d) { return d[1]; }).indexOf(cfg.listDur); cfg.listDur = LIST_DURS[(di + 1) % LIST_DURS.length][1]; save(); render(); break;
        case 'fs-r-prof': var mp = window.prompt('Minimum profit per card (after EA’s 5% tax)', cfg.minProfit); if (mp != null) { var mv = parseCoins(mp); if (mv != null && mv >= 0) { cfg.minProfit = mv; save(); applySell(); } render(); } break;
        case 'fs-to-scan': toKartenscan(); break;
        case 'fs-test': unlockAudio(); celebrate('Test snipe', 13750, 662); break;
        case 'fs-min': el.classList.remove('open'); fab.style.display = ''; break;
        case 'fs-diag': diag(); break;
        case 'fs-savefilter': saveCurrentFilter(); break;
        case 'fs-clearsess': if (window.confirm('Clear the session history?')) { sessions = []; lsSet(SESS_KEY, sessions); redrawTab(); } break;
        case 'fs-reset2': if (window.confirm('Reset all-time stats and session history? This can’t be undone.')) { resetLife(); redrawTab(); } break;
        case 'fs-h-refresh': hubRefreshButton(); break;
        case 'fs-h-bulk': openBulk(); break;
        case 'fs-h-club': openClub(); break;
        case 'fs-h-auto': toggleAutoRelist(); break;
        case 'fs-bk-back': tab = 'hub'; rebuildView(); break;
        case 'fs-bk-other': saveBulkInputs(); bulk.sel = null; bulk.err = ''; rebuildView(); break;
        case 'fs-bk-go': saveBulkInputs(); startBulk(); break;
        case 'fs-h-more': hubShowAll = !hubShowAll; render(); break;
        case 'fs-h-clear': hubClearButton(); break;
        case 'fs-h-exp': if (running) stopAll(); else startJob('expired'); break;
        case 'fs-h-packs': if (running) stopAll(); else startJob('packs'); break;
      }
    });
    render();
  }

  function render() {
    var $ = function (id) { return document.getElementById(id); };
    var fb = $('fs-fab'); if (fb) fb.className = running ? 'run' : '';
    var panel = $('fs-panel'); if (!panel) return;
    // running lock overlay (blocks swiping the web app while the bot runs)
    var lock = $('fs-lock');
    if (lock) {
      if (running && !lockHidden) {
        lock.classList.add('show'); panel.classList.remove('open'); if (fb) fb.style.display = 'none';
        if ($('fs-l-act')) $('fs-l-act').textContent = phase === 'break' ? 'On a break…' : (activity || 'Checking price…');
        var lbig = lock.querySelector('.lbig'); if (lbig) lbig.textContent = phase === 'waiting' ? 'Waiting' : 'Running';
        if ($('fs-lstop')) $('fs-lstop').textContent = phase === 'waiting' ? 'Cancel' : 'Stop';
        if ($('fs-l-sub')) $('fs-l-sub').textContent = mode === 'job' ? 'Hub job running — tap Stop any time, finished cards stay listed.' : keepMode() ? 'Buy ≤ ' + fmt(market.snipe) + (keepMinNow() > 0 ? ' · min ' + fmt(keepMinNow()) : '') + ' · ' + (cfg.afterBuy === 2 ? 'leave in Unassigned' : 'to transfer list') + ' · no price check' : market.snipe ? ('Price ' + fmt(market.price) + (cfg.sellPrice > 0 ? ' · sell ' + fmt(listPrice()) : '') + ' · snipe ≤ ' + fmt(market.snipe) + ' · step ' + fmt(stepFor(market.price)) + ' · list ' + durLabel(cfg.listDur)) : 'Screen locked so you don’t swipe the web app while it runs. Hide to reach the controls.';
        if ($('fs-l-pf')) $('fs-l-pf').textContent = mode === 'snipe' && !keepMode() && market.snipe ? '+' + fmtk(profitAt(listPrice(), market.snipe)) : '—';
        if ($('fs-l-buys')) $('fs-l-buys').textContent = stats.buys;
        if ($('fs-l-sr')) $('fs-l-sr').textContent = stats.searches;
        if ($('fs-l-net')) { $('fs-l-net').textContent = stats.buys ? signed(stats.est) : '—'; $('fs-l-net').className = stats.est < 0 ? 'r' : stats.buys ? 'g' : ''; }
      } else {
        lock.classList.remove('show');
        if (fb && !panel.classList.contains('open')) fb.style.display = '';
      }
    }
    // tiles
    var tiles = panel.querySelectorAll('.fs-tile');
    for (var i = 0; i < tiles.length; i++) { var on = tiles[i].getAttribute('data-tab') === tab; if (tiles[i].classList.contains('on') !== on) tiles[i].classList.toggle('on', on); }
    var mi = marketIndex(priceHist, Date.now()), tg = $('fs-ti-gauge'), tgh = gaugeSVG(mi ? mi.index : null);
    if (tg && tg.__h !== tgh) { tg.__h = tgh; tg.innerHTML = tgh; }
    if ($('fs-ti-idx')) $('fs-ti-idx').textContent = mi ? mi.index : '—';
    if ($('fs-ti-run')) $('fs-ti-run').className = 'ti' + (running ? ' live' : '');
    // body (only rebuilt on view change, so inputs stay usable)
    var body = $('fs-body');
    if (body.getAttribute('data-tab') !== tab) {
      body.setAttribute('data-tab', tab);
      body.innerHTML = tab === 'bulk' ? bulkView() : tab === 'hub' ? hubView() : tab === 'market' ? marketView() : tab === 'settings' ? settingsView() : sniperView();
      fillFeeds(); if ($('fs-log')) $('fs-log').textContent = logLines.join('\n');
      if (tab === 'hub' && !hub.at && !running) hubRefreshButton();
    }
    $('fs-coins').textContent = coins() != null ? fmtk(coins()) : '—';
    // switches / segments reflect cfg in whichever view is open
    var sws = panel.querySelectorAll('[data-sw]'); for (i = 0; i < sws.length; i++) sws[i].className = 'fs-sw' + (cfg[sws[i].getAttribute('data-sw')] ? ' on' : '');
    var segs = panel.querySelectorAll('[data-seg]'); for (i = 0; i < segs.length; i++) segs[i].className = 'fs-sg' + (Number(segs[i].getAttribute('data-val')) === cfg[segs[i].getAttribute('data-seg')] ? ' on' : '');
    if (tab === 'bulk') return;
    if (tab === 'hub') { renderHub($); var sl = $('fs-h-sessions'), shh = sessionsHTML(); if (sl && sl.__html !== shh) { sl.__html = shh; sl.innerHTML = shh; } return; }
    if (tab === 'market') return renderMarket($);
    var gl = panel.querySelectorAll('[data-gap]'); for (i = 0; i < gl.length; i++) if (gl[i].textContent !== gapLabel()) gl[i].textContent = gapLabel();
    if (tab === 'settings') {
      if ($('fs-keep')) $('fs-keep').style.display = keepMode() ? '' : 'none'; if ($('fs-bidset')) $('fs-bidset').style.display = cfg.bidMode ? '' : 'none'; if ($('fs-speedhint')) $('fs-speedhint').textContent = speedHint();
      var cu = panel.querySelectorAll('[data-cust]'); for (i = 0; i < cu.length; i++) cu[i].style.display = cfg[cu[i].getAttribute('data-cust')] ? '' : 'none';
      var au = panel.querySelectorAll('[data-auto]'); for (i = 0; i < au.length; i++) au[i].style.display = cfg[au[i].getAttribute('data-auto')] ? 'none' : '';
      if ($('fs-asum')) $('fs-asum').textContent = autoSummary();
      return;
    }

    // Sniper view
    var keep = keepMode(), pr = market.snipe && !keep ? profitAt(listPrice(), market.snipe) : null;
    var T = function (id, v) { var e = $(id); if (e && e.textContent !== String(v)) e.textContent = v; };
    T('fs-t-kicker', keep ? 'Target · keep' : 'Target · list & flip');
    if ($('fs-t-name')) { T('fs-t-name', haveSearch() ? searchLabel() : 'No search yet'); $('fs-t-name').className = 'sx-name' + (haveSearch() ? '' : ' muted'); }
    T('fs-t-mode', !haveSearch() ? 'Search a player in the transfer market' : keep ? (cfg.afterBuy === 2 ? 'Bought cards stay in Unassigned' : 'Bought cards go to your transfer list') : 'Bought under the market, listed at the sell price');
    T('fs-l-snipe', bidMode() ? 'Bid up to' : keep ? 'Buy under' : 'Snipe under');
    T('fs-t-snipe', keep ? (bidMode() ? (bidMaxNow() > 0 ? fmt(bidMaxNow()) : '—') : keepMaxNow() > 0 ? fmt(floorStep(keepMaxNow())) : '—') : market.snipe ? fmt(market.snipe) : '—');
    var wcb = webCrit(), webBid = wcb && wcb.maxBid > 0;
    T('fs-t-price', keep && bidMode() ? (webBid ? 'Max. Bid · web app' : webMaxBuy() ? 'Max. Buy Now · web app' : keepMaxNow() ? 'fallback' : 'set in web app') : keep ? (webMaxBuy() ? 'from web app' : keepMaxNow() ? 'fallback' : 'set in web app') : market.price ? 'today ' + fmt(market.price) : phase === 'checking' ? 'checking…' : 'checked at start');
    T('fs-l-sell', keep ? 'Min price' : 'Sell at');
    T('fs-t-sell', keep ? (keepMinNow() > 0 ? fmt(keepMinNow()) : '—') : cfg.sellPrice > 0 ? fmt(roundStep(cfg.sellPrice)) : market.price ? fmt(market.price) : 'Auto');
    T('fs-t-sellsub', keep ? (keepMinNow() > 0 ? 'skips cheaper' : 'no minimum') : cfg.sellPrice > 0 ? 'your price' : 'Auto · market');
    T('fs-l-prof', keep ? 'Then' : 'Profit');
    T('fs-t-prof', keep ? 'Keep' : (pr != null ? fmt(pr) : fmt(cfg.minProfit)) + '+');
    if ($('fs-t-prof')) $('fs-t-prof').className = keep ? '' : 'g';
    T('fs-t-profsub', keep ? (cfg.afterBuy === 2 ? 'in Unassigned' : 'transfer list') : 'after EA’s 5% cut');
    T('fs-t-sub', bidMode() && haveSearch() ? 'Bids on auctions ending within ' + (cfg.bidSecs || 90) + 's, one bid per card' + (keep ? (bidMaxNow() > 0 ? '.' : ' - set a Max. Bid (or Max. Buy Now) in the web app search first.') : ', up to the checked snipe price.') + ' Won cards ' + (keep ? (cfg.afterBuy === 2 ? 'stay in Unassigned.' : 'go to your transfer list.') : 'get listed.') : keep ? (webMaxBuy() ? 'Buys up to the Max. Buy Now of your web app search.' : keepMaxNow() ? 'Fallback price from Settings. A Max. Buy Now in your web app search replaces it.' : 'Set a Max. Buy Now in the web app search, search once, then start.') : !haveSearch() ? '' : market.snipe ? ('Checked ' + ago(market.checkedAt) + (market.fresh ? '' : ' · no fresh listings') + (stats.eaMax ? ' · EA range ' + fmtk(stats.eaMin) + '–' + fmtk(stats.eaMax) : '') + '. The bot re-checks the price as it runs.') : 'Estimate from your settings; the price check sets the exact prices at the start.');
    calcProfit();
    T('fs-r-speed-v', SPEEDS[cfg.speed | 0] || 'Normal');
    T('fs-r-bid-v', cfg.bidMode ? 'Bids' + (running && bidMode() ? ' · ' + openBids() + ' open' : '') : 'Buy Now');
    T('fs-r-when-v', phase === 'waiting' ? 'waiting · ' + startAt : startAt ? 'at ' + startAt : 'Now');
    T('fs-sell-v', cfg.sellPrice > 0 ? fmt(roundStep(cfg.sellPrice)) : 'Auto');
    T('fs-r-prof-v', fmt(cfg.minProfit));
    T('fs-r-after-v', ['List', 'Transfer list', 'Unassigned'][cfg.afterBuy | 0] || 'List');
    T('fs-r-dur-v', durLabel(cfg.listDur));
    ['fs-sell', 'fs-r-prof', 'fs-r-dur'].forEach(function (id) { var e = $(id); if (e) e.style.display = keep ? 'none' : ''; });
    if ($('fs-s-buys')) $('fs-s-buys').textContent = stats.buys;
    if ($('fs-s-sr')) $('fs-s-sr').textContent = stats.searches;
    if ($('fs-s-est')) { $('fs-s-est').textContent = stats.buys ? signed(stats.est) : '—'; $('fs-s-est').className = stats.est < 0 ? 'r' : stats.buys ? 'g' : ''; }
    var pcard = stats.buys ? Math.round(stats.est / stats.buys) : null; if ($('fs-s-net')) { $('fs-s-net').textContent = pcard == null ? '—' : signed(pcard); $('fs-s-net').className = pcard != null && pcard < 0 ? 'r' : pcard ? 'g' : ''; }
    var fl = $('fs-filters'), fh = filtersHTML(); if (fl && fl.__html !== fh) { fl.__html = fh; fl.innerHTML = fh; }
    if ($('fs-block')) $('fs-block').textContent = blockMsg || '';
    if ($('fs-act')) $('fs-act').textContent = activity;
    var go = $('fs-start');
    if (go) {
      // Only touch the DOM when it changes, so a tap is never lost to a re-render.
      var cls = 'fs-btn ' + (running ? 'fs-stop' : 'fs-go'); if (go.className !== cls) go.className = cls;
      var html = phase === 'waiting' ? 'Cancel<span class="sub">starts at ' + startAt + '</span>' : running ? 'Stop<span class="sub">bought ' + stats.buys + ' · ' + stats.searches + ' searches</span>'
        : startAt ? 'Start at ' + startAt + '<span class="sub">waits, then ' + (keep ? 'snipes' : 'checks the price and snipes') + '</span>'
        : bidMode() ? (keep ? 'Start Bidding' : 'Check Price &amp; Start Bidding') + '<span class="sub">' + (keep ? 'bids up to ' + (bidMaxNow() > 0 ? fmt(bidMaxNow()) : '?') : 'bids up to the snipe price') + ' · auctions ending within ' + (cfg.bidSecs || 90) + 's</span>'
        : keep ? 'Start Sniping<span class="sub">buys under ' + (keepMaxNow() > 0 ? fmt(floorStep(keepMaxNow())) : '?') + '</span>'
        : 'Check Price &amp; Start Sniping<span class="sub">' + (market.snipe ? 'snipes under ' + fmt(market.snipe) + ' · profit ' + fmt(pr != null ? pr : cfg.minProfit) + '+' : 'target profit ' + fmt(cfg.minProfit) + '+ per card') + '</span>';
      if (go.__html !== html) { go.__html = html; go.innerHTML = html; }
    }
    if ($('fs-status')) {
      $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'waiting' ? 'Waiting to start at ' + startAt : phase === 'checking' ? 'Checking price…' : phase === 'break' ? 'Taking a short break…' : running ? ('● Sniping ≤ ' + fmt(market.snipe)) : haveServices() ? (haveSearch() ? 'Ready — tap Start' : 'Search a player, or load a saved search') : 'Open the FUT Web App & sign in');
      $('fs-status').style.color = running ? '#30d158' : stopReason ? '#ff9f0a' : 'rgba(235,235,245,.6)';
    }
  }

  setInterval(function () { if ((tab === 'hub' || tab === 'market') && document.getElementById('fs-panel') && document.getElementById('fs-panel').classList.contains('open')) render(); }, 5000);
  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) { buildUI(); startBadgeObserver(); paintBadges(); }
    hookCells();
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
