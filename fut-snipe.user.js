// ==UserScript==
// @name         TangaTolga Sniper
// @namespace    local.tangatolga.sniper
// @version      5.0.0
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
  var VERSION = '5.0.0';

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
    module.exports = { EA_TAX: EA_TAX, MIN_PRICE: MIN_PRICE, FEW: FEW, stepFor: stepFor, roundStep: roundStep, floorStep: floorStep, afterTax: afterTax, profitAt: profitAt, snipePoint: snipePoint, isFreshSecs: isFreshSecs, pickMarketPrice: pickMarketPrice, probeMid: probeMid, probeVerdict: probeVerdict, nextProbe: nextProbe, humanGapMs: humanGapMs, nextMood: nextMood, fuzzyCount: fuzzyCount, parseCoins: parseCoins, sellAndSnipe: sellAndSnipe, baseIdOf: baseIdOf, safetyStatus: safetyStatus, profitCurve: profitCurve, TOO_MANY: TOO_MANY, tooManyResults: tooManyResults, outsideRange: outsideRange, isSpecialBuy: isSpecialBuy, hasRarityFilter: hasRarityFilter, nextMinBid: nextMinBid, breakEven: breakEven, repriceFloor: repriceFloor, cardTrends: cardTrends, marketIndex: marketIndex, scanExport: scanExport, bulkGroups: bulkGroups, bulkPrices: bulkPrices };
  }

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
  var oldLook = ['theme', 'wallDim', 'wallBlur', 'wallRun', 'petals', 'mascot', 'mascotSize', 'mascotVoice'].filter(function (k) { return k in cfg; });
  if (oldLook.length) { oldLook.forEach(function (k) { delete cfg[k]; }); save(); } // old look settings
  try { localStorage.removeItem('futSnipe.wall.v1'); } catch (e) {} // old wallpaper (could be large)
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
  function buildCriteria(maxBuy, minBuy, minBid) {
    var out;
    if (capturedCriteria && !searchBase) out = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria);
    else { var C = ctor(); var src = searchBase || capturedFromUrl || capturedPlain || { type: 'player', category: 'any', count: 50 }; out = C ? applyFields(new C(), src) : Object.assign({}, src); }
    try { out.minBuy = minBuy > 0 ? minBuy : 0; out.minBid = minBid > 0 ? minBid : 0; out.maxBid = 0; out.maxBuy = maxBuy > 0 ? maxBuy : 0; out.offset = 0; } catch (e) {}
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
  function doSearch(maxBuy, minBuy, minBid) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
      try { try { svc().Item.clearTransferMarketCache(); } catch (e) {}
        svc().Item.searchTransferMarket(buildCriteria(maxBuy, minBuy, minBid), 1).observe(OBS, function (sender, resp) {
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
  // sometimes a longer pause). Price-check searches go ~35% slower: a person reads the results.
  var tempo = { bias: 0, left: 0 };
  function pace(slow) {
    if (--tempo.left <= 0) tempo = nextMood();
    return wait(Math.max(HARD_FLOOR_MS, humanGapMs(cfg.gapMinMs, cfg.gapMaxMs, tempo.bias) * (slow ? 1.35 : 1)));
  }
  // A counted, paced search. null = the run stopped (captcha / 429 / Stop).
  async function search(maxBuy, slow, minBuy, minBid) {
    if (!(await pace(slow))) return null;
    var r = await doSearch(maxBuy, minBuy, minBid); if (!running) return null;
    stats.searches++; stats.sinceBreak++; countSearch();
    if (!r.ok && (r.err || {}).stop) { requestStop(r.err.msg); return null; }
    if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0].it).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
    return r;
  }
  // Long breaks every ~breakEvery searches (the exact number changes every time).
  async function maybeBreak() {
    if (!running || stats.sinceBreak < nextBreakAt) return;
    stats.sinceBreak = 0; nextBreakAt = fuzzyCount(cfg.breakEvery, 0.25);
    var base = Math.max(5, cfg.breakSec) * 1000, br = rand(Math.round(base * 0.8), Math.round(base * 1.2));
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
    var ss = sellAndSnipe(pick.price, cfg.sellPrice, cfg.minProfit), sp = ss.snipe;
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
    var ss = sellAndSnipe(market.price, cfg.sellPrice, cfg.minProfit);
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
      var bal = coins(); if (bal != null && price > bal) { feed('Not enough coins for ' + fmt(price), 'miss'); continue; }
      var b = await doBuy(r.items[j].it, price); if (!running) return;
      if (b.ok) {
        var it = r.items[j].it, special = !keep && cfg.keepSpecials && isSpecialBuy(defIdOf(it), capturedPlain || capturedFromUrl);
        var e = keep || special ? 0 : profitAt(listPrice(), price);
        stats.buys++; bought++; addDaily(1); lastBuy = 'ok ' + price; noteBuy(r.items[j].it.id, price, cardLabel(r.items[j].it), false, ratingOf(r.items[j].it));
        stats.spent += price; stats.est += e; life.bought++; life.spent += price; life.est += e; saveLife();
        feed(cardLabel(it) + ' sniped for ' + fmt(price) + (keep || special ? '' : ' · +' + fmt(e)), 'hit'); celebrate(cardLabel(it), price, keep || special ? null : e); render();
        if (special) await keepSpecial(it, price); else await afterBuy(it);
      } else { lastBuy = (b.err && b.err.msg) || 'failed'; feed(searchLabel() + ' ' + fmt(price) + ' · ' + lastBuy, 'miss'); if ((b.err || {}).stop) return requestStop(b.err.msg); }
      if (stats.buys >= cfg.sessionBuyCap) return;
      await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
    }
    if (!bought) { feed(searchLabel() + ' not found', 'miss'); setActivity('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe)); }
  }

  async function runLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      if (!keepMode() && (!market.snipe || stats.sinceCheck >= nextCheckAt)) { if (market.snipe) feed('Re-checking the price…', 'check'); await checkPrice(); }
      else { await snipeOnce(); stats.sinceCheck++; if (running) await hubPass(false); }
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
  function start() {
    if (!canStart()) return;
    if (!haveSearch()) { blockMsg = 'Search a player in the transfer market (or load a filter), then Start.'; render(); return; }
    var flagged = life.lastBlock ? Date.now() - life.lastBlock : null;
    if (flagged != null && flagged < 6 * 3600000 && !window.confirm('EA flagged this account ' + Math.max(1, Math.round(flagged / 60000)) + ' min ago (captcha / 429). Sniping again this soon raises the ban risk.\n\nStart anyway?')) { blockMsg = 'Not started: EA flagged you recently. Wait a few hours.'; render(); return; }
    resolveName();
    if (keepMode()) {
      var kmax = keepMaxNow(), kmin = keepMinNow();
      if (!(kmax > 0)) { blockMsg = 'Transfer list / Unassigned mode: type a Max. Buy Now into the web app search, search once, then Start.'; render(); return; }
      if (kmin > kmax) { blockMsg = 'The Min. Buy Now is higher than the Max. Buy Now.'; render(); return; }
      market.snipe = floorStep(kmax); running = true; phase = 'running';
      feed('Start ' + searchLabel() + ' · buy ≤ ' + fmt(market.snipe) + (webMaxBuy() ? ' (your web app search)' : ' (fallback from Settings)') + (kmin > 0 ? ' and ≥ ' + fmt(kmin) : '') + ' · ' + (cfg.afterBuy === 2 ? 'leave in Unassigned' : 'to transfer list'), 'price');
      say('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe));
      render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
      return;
    }
    running = true; phase = 'checking';
    feed('Start ' + searchLabel() + ' · target +' + fmt(cfg.minProfit) + '/card', 'price');
    render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }

  function stopAll() { requestStop('stopped by you'); }
  // Keeps lastBlock: the safety assistant still needs to know when EA last flagged you.
  function resetLife() { life = { bought: 0, spent: 0, est: 0, searches: 0, lastBlock: life.lastBlock || null }; saveLife(); sessions = []; lsSet(SESS_KEY, sessions); }

  // ---------- Hub: transfer list overview, real profit, re-priced relisting, pack pulls ----------
  var hub = { at: 0, total: 0, sold: 0, soldValue: 0, active: 0, expired: 0, unlisted: 0, packs: null, packsTradable: 0, busy: '' };
  var TRADEPILE_MAX = 100;

  function summarize(items) {
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
      ledger.sales.unshift({ t: Date.now(), name: name, rating: ratingOf(it) || (b && b.rating) || null, buy: buy, sold: sold, profit: profit, pack: !!(b && b.pack) });
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
  var bulk = { loading: false, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '' };
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
    tab = 'bulk'; bulk = { loading: true, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '' }; rebuildView();
    var items = await refreshHub(false);
    bulk.loading = false;
    if (!items) bulk.err = 'Could not read the transfer list. Open the Transfers tab in the web app once, then try again.';
    else bulk.groups = bulkGroups(bulkRows(items));
    rebuildView();
  }
  function pickBulk(i) {
    var g = bulk.groups && bulk.groups[i]; if (!g) return;
    bulk.sel = g; bulk.n = g.count; bulk.price = lastPriceOf(g.def); bulk.start = ''; bulk.err = ''; rebuildView();
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
    var n = Math.max(1, Math.min(g.count, Math.round(Number(bulk.n) || g.count))), dur = bulk.dur || cfg.listDur || 3600;
    if (!window.confirm('List ' + n + ' × ' + g.name + '\nBuy Now ' + fmt(p.buy) + ' · start ' + fmt(p.start) + ' · ' + durLabel(dur) + (p.adjusted ? '\n(price snapped to EA\u2019s price steps)' : '') + '\n\nGo?')) return;
    if (!canStart()) return;
    tab = 'hub'; bulk = { loading: false, groups: null, sel: null, price: 0, start: '', n: 0, dur: 0, err: '' };
    running = true; mode = 'job'; phase = 'job';
    feed('Listing ' + n + ' × ' + g.name + ' at ' + fmt(p.buy) + ' (start ' + fmt(p.start) + ', ' + durLabel(dur) + ')', 'check'); rebuildView();
    runBulk(g, p, n, dur).then(function (msg) { if (running) requestStop('Done: ' + msg); refreshHub(true); }).catch(function (e) { requestStop('bulk list error: ' + e); });
  }

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

  function diag() {
    try { var row = document.querySelector('li.listFUTItem, .listFUTItem'); if (row) lastCardHTML = row.outerHTML.slice(0, 2500); } catch (e) {}
    var s = svc(), I = s && s.Item;
    var fnNames = function (o) { var out = {}; try { for (var p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach(function (k) { try { if (k !== 'constructor' && typeof o[k] === 'function') out[k] = 1; } catch (e) {} }); } catch (e) {} return Object.keys(out).sort(); };
    var rows = document.querySelectorAll(ROW_SEL), withAvg = 0;
    for (var i = 0; i < rows.length; i++) if (parseCoins(avgLabelOf(rows[i])) > 0) withAvg++;
    var d = { version: VERSION, servicesFound: !!s, services: s ? Object.keys(s).sort() : [], itemMethods: I ? fnNames(I) : [], criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedPlain: capturedPlain, phase: phase, market: market, minProfit: cfg.minProfit, listDur: cfg.listDur, speed: cfg.speed, reprobeEvery: cfg.reprobeEvery, cheapest: stats.cheapest, curName: curName, curDefId: stats.curDefId, eaMin: stats.eaMin, eaMax: stats.eaMax, sessionNet: sessionNet(), lifetime: life, filtersSaved: filters.length, sessionsLogged: sessions.length, cardRows: rows.length, cardRowsWithAvg: withAvg, firstAvg: rows.length ? avgLabelOf(rows[0]) : null, badgesPainted: document.querySelectorAll('.fs-badge').length, lastBuy: lastBuy, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, marketCardHTML: lastCardHTML, recentMarketUrls: tmUrls, stopReason: stopReason, priceLimitsResponse: limitsDebug, priceLimitsCached: Object.keys(limitsCache).length, hub: { at: hub.at, total: hub.total, sold: hub.sold, expired: hub.expired }, settings: { afterBuy: cfg.afterBuy, repriceExpired: cfg.repriceExpired, relistExpired: cfg.relistExpired, clearSold: cfg.clearSold, varyMinBid: cfg.varyMinBid, tooManyStop: cfg.tooManyStop, rangeStop: cfg.rangeStop, keepSpecials: cfg.keepSpecials } };
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
      var rows = document.querySelectorAll(ROW_SEL);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i], host = row.querySelector('.rowContent') || row;
        var card = row.querySelector('.entityContainer canvas') || row.querySelector('.entityContainer') || row;
        var label = avgLabelOf(row), b = host.querySelector('.fs-badge');
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
  // iOS dark look: black background, grouped grey cards, system blue for actions, green/red for
  // money only. No gradients, no glow, one font (the system font).
  var C_BG = '#000', C_CARD = '#1c1c1e', C_CARD2 = '#2c2c2e', C_CARD3 = '#3a3a3c', C_LINE = 'rgba(84,84,88,.55)';
  var C_TXT = '#fff', C_MUT = 'rgba(235,235,245,.6)', C_MUT2 = 'rgba(235,235,245,.3)';
  var C_BLUE = '#0a84ff', C_OK = '#30d158', C_RED = '#ff453a', C_ORANGE = '#ff9f0a', C_YELLOW = '#ffd60a';
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,"Helvetica Neue",sans-serif';
  var NUM = 'font-variant-numeric:tabular-nums;';
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *,#fs-lock *,#fs-toast *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
    '#fs-panel button,#fs-lock button{font-family:' + FONT + ';cursor:pointer}' +
    // panel
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:15px/1.4 ' + FONT + ';color:' + C_TXT + ';background:' + C_BG + ';-webkit-font-smoothing:antialiased}' +
    '#fs-panel.open{display:flex;animation:fsfade .2s ease-out}@keyframes fsfade{from{opacity:0}to{opacity:1}}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px 8px;padding-top:max(12px,env(safe-area-inset-top))}' +
    '#fs-head .t{font-weight:700;font-size:28px;letter-spacing:-.4px}#fs-head .v{font-size:12px;color:' + C_MUT2 + ';margin-left:8px;font-weight:500}' +
    '#fs-head .coins{font-size:15px;font-weight:600;color:' + C_TXT + ';' + NUM + 'background:' + C_CARD + ';border-radius:999px;padding:6px 12px}' +
    '#fs-min{background:' + C_CARD2 + ';color:' + C_MUT + ';border:0;border-radius:50%;width:30px;height:30px;font-size:13px;font-weight:700;margin-left:8px}' +
    '#fs-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 16px;padding-bottom:max(28px,env(safe-area-inset-bottom));width:100%;max-width:560px;margin:0 auto;overflow-x:hidden}' +
    // tabs: one segmented control
    '#fs-tiles{display:flex;gap:2px;margin:2px 16px 4px;padding:2px;background:' + C_CARD + ';border-radius:9px;max-width:528px;align-self:center;width:calc(100% - 32px)}' +
    '.fs-tile{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border-radius:7px;color:' + C_TXT + ';font-size:13px;font-weight:500;transition:background .15s}' +
    '.fs-tile.on{background:' + C_CARD3 + ';font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
    '.fs-tile .ti{width:7px;height:7px;border-radius:50%;display:none}.fs-tile .ti.live{display:block;background:' + C_OK + '}' +
    // grouped cards
    '.fs-card,.fs-target,.fs-sect,.fs-safe,.fs-dc{background:' + C_CARD + ';border-radius:12px;margin-bottom:12px}' +
    '.fs-card{overflow:hidden}.fs-ch{font-size:13px;color:' + C_MUT + ';padding:12px 16px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}' +
    '.fs-cols .c{padding:6px 16px 12px;border-right:.5px solid ' + C_LINE + '}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{font-size:12px;color:' + C_MUT + '}' +
    '.fs-cols .v{font-size:20px;font-weight:600;margin-top:2px;' + NUM + '}.fs-cols .v.c{color:' + C_BLUE + '}.fs-cols .v.g{color:' + C_OK + '}.fs-cols .v.r{color:' + C_ORANGE + '}' +
    '.fs-cols.c4{grid-template-columns:repeat(4,1fr)}.fs-cols.c4 .c{padding:6px 12px 12px}' +
    // controls
    '.fs-sw{width:51px;height:31px;flex:none;border-radius:999px;background:' + C_CARD3 + ';position:relative;transition:background .2s}.fs-sw.on{background:' + C_OK + '}' +
    '.fs-sw:after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}.fs-sw.on:after{transform:translateX(20px)}' +
    '.fs-segw{display:flex;gap:2px;padding:2px;background:' + C_CARD2 + ';border-radius:9px}' +
    '.fs-sg{flex:1;background:transparent;color:' + C_TXT + ';border:0;border-radius:7px;padding:6px 8px;font-size:13px;font-weight:500;white-space:nowrap}.fs-sg.on{background:' + C_CARD3 + ';font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:999px;background:' + C_CARD3 + ';outline:none;margin:10px 0 2px}' +
    '.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}' +
    '.fs-num{width:116px;flex:none;background:' + C_CARD2 + ';border:0;color:' + C_TXT + ';border-radius:8px;padding:8px 10px;font:500 16px ' + FONT + ';text-align:right;' + NUM + 'outline:none}.fs-num:focus{box-shadow:0 0 0 2px ' + C_BLUE + '}' +
    // buttons
    '.fs-btn{position:relative;width:100%;border:0;border-radius:12px;padding:14px 16px;font-size:17px;font-weight:600;transition:opacity .15s}.fs-btn:active{opacity:.7}' +
    '.fs-go{background:' + C_BLUE + ';color:#fff}.fs-stop{background:' + C_RED + ';color:#fff}' +
    '.fs-btn .sub{display:block;font-size:12px;font-weight:400;opacity:.8;margin-top:2px}' +
    '.fs-more{width:100%;background:' + C_CARD + ';border:0;color:' + C_BLUE + ';border-radius:12px;padding:13px;font-size:15px;font-weight:500;margin-top:10px}.fs-more:active{opacity:.6}' +
    '.fs-mini{display:flex;gap:8px;margin-top:6px}.fs-mini button{flex:1;background:' + C_CARD2 + ';color:' + C_BLUE + ';border:0;border-radius:10px;padding:10px;font-size:13px;font-weight:500}' +
    '#fs-block{color:' + C_ORANGE + ';font-size:13px;margin:0 2px 10px}#fs-block:empty{display:none}' +
    '#fs-status{font-size:13px;color:' + C_MUT + ';margin:12px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:90px;overflow:auto;white-space:pre-wrap;color:' + C_MUT2 + ';font-size:11px;line-height:1.5}#fs-log:empty{display:none}' +
    '#fs-act{font-size:13px;color:' + C_MUT + ';text-align:center;margin:10px 2px 0;min-height:18px}' +
    // list rows (saved searches, trades, market, sessions, bulk groups)
    '.fs-item,.fs-trade,.fs-mrow,.fs-sale,.fs-bkg{display:flex;align-items:center;gap:12px;background:' + C_CARD + ';border:0;border-radius:0;padding:11px 16px;margin:0;position:relative}' +
    '.fs-item:after,.fs-trade:after,.fs-mrow:after,.fs-sale:after,.fs-bkg:after{content:"";position:absolute;left:16px;right:0;bottom:0;border-bottom:.5px solid ' + C_LINE + '}' +
    '.fs-item:first-child,.fs-trade:first-child,.fs-mrow:first-child,.fs-sale:first-child,.fs-bkg:first-of-type{border-top-left-radius:12px;border-top-right-radius:12px}' +
    '.fs-item:last-child,.fs-trade:last-of-type,.fs-mrow:last-child,.fs-sale:last-child,.fs-bkg:last-of-type{border-bottom-left-radius:12px;border-bottom-right-radius:12px;margin-bottom:12px}' +
    '.fs-item:last-child:after,.fs-trade:last-of-type:after,.fs-mrow:last-child:after,.fs-sale:last-child:after,.fs-bkg:last-of-type:after{display:none}' +
    '.fs-item{justify-content:space-between}.fs-item .nm,.fs-sale .nm{font-weight:500;font-size:15px}.fs-item .de,.fs-sale .de{font-size:12px;color:' + C_MUT + ';margin-top:1px}' +
    '.fs-item .act{display:flex;gap:8px}.fs-item .act button{border:0;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600}' +
    '.fs-load{background:' + C_BLUE + ';color:#fff}.fs-del{background:' + C_CARD2 + ';color:' + C_MUT + '}' +
    '.fs-empty{text-align:center;color:' + C_MUT + ';font-size:14px;padding:28px 12px;background:' + C_CARD + ';border-radius:12px;margin-bottom:12px}' +
    '.fs-bar{height:4px;border-radius:999px;background:' + C_CARD3 + ';overflow:hidden;margin-top:6px}.fs-bar i{display:block;height:100%;border-radius:999px}' +
    '.fs-sale{justify-content:space-between}' +
    // section headers + settings rows (iOS grouped list)
    '.fs-sect{padding:0 16px}.fs-sect-h{font-size:13px;color:' + C_MUT + ';text-transform:uppercase;letter-spacing:.2px;padding:18px 16px 7px;font-weight:400}' +
    '.fs-sect>.fs-sect-h{padding:12px 0 6px;margin:0}' +
    '.fs-set{padding:11px 0;border-top:.5px solid ' + C_LINE + '}.fs-sect>.fs-sect-h+.fs-set,.fs-sect>.fs-sect-h+div>.fs-set:first-child{border-top:0}' +
    '.fs-set .top{display:flex;align-items:center;justify-content:space-between;gap:12px}.fs-set .nm{font-size:15px;font-weight:400;color:' + C_TXT + '}' +
    '.fs-set>.fs-segw{margin-top:8px}.fs-set .sv{color:' + C_MUT + ';white-space:nowrap;' + NUM + '}' +
    '.ds{font-size:12.5px;line-height:1.4;color:' + C_MUT + ';margin-top:4px}' +
    '#fs-keep .fs-set:first-child{border-top:.5px solid ' + C_LINE + '}' +
    '.fs-det{margin-bottom:12px;border-radius:12px;background:' + C_CARD + '}' +
    '.fs-det>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:13px 16px;font-size:15px;color:' + C_TXT + '}' +
    '.fs-det>summary::-webkit-details-marker{display:none}.fs-det>summary>span{flex:1}.fs-det>summary small{font-size:15px;color:' + C_MUT + '}' +
    '.fs-det>summary::after{content:"";width:8px;height:8px;border-right:2px solid ' + C_MUT2 + ';border-bottom:2px solid ' + C_MUT2 + ';transform:rotate(-45deg);margin:0 2px 0 4px;transition:transform .2s}' +
    '.fs-det[open]>summary::after{transform:rotate(45deg)}' +
    '.fs-det>.in{padding:0 16px 6px;border-top:.5px solid ' + C_LINE + '}.fs-det>.in>.fs-set:first-child{border-top:0}' +
    '.fs-det>.in>.fs-item,.fs-det>.in>.fs-sale{margin-left:-16px;margin-right:-16px}.fs-det>.in>.fs-empty{background:transparent;padding:16px 0}' +
    // sniper view
    '.fs-target{padding:14px 16px 12px}' +
    '.fs-target .tt-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px}' +
    '.fs-target .k{font-size:12px;color:' + C_MUT + '}.fs-target .nm{font-size:22px;font-weight:700;letter-spacing:-.3px}' +
    '.fs-target .mode{flex:none;font-size:12px;font-weight:500;color:' + C_MUT + ';background:' + C_CARD2 + ';border-radius:999px;padding:4px 10px}' +
    '.fs-target .fs-cols .c{padding:4px 10px 2px}.fs-target .fs-cols .c:first-child{padding-left:0}.fs-target .sub{font-size:12.5px;color:' + C_MUT + ';margin-top:8px}' +
    '.fs-sell{display:flex;align-items:center;gap:8px;width:100%;margin-top:10px;background:' + C_CARD2 + ';border:0;border-radius:10px;padding:10px 12px;color:' + C_TXT + ';font:400 14px ' + FONT + ';text-align:left}' +
    '.fs-sell b{font-weight:600;' + NUM + '}.fs-sell i{font-style:normal;font-size:12px;color:' + C_MUT + '}.fs-sell span{margin-left:auto;color:' + C_BLUE + ';font-size:14px}' +
    '.fs-run{display:grid;grid-template-columns:repeat(4,1fr);margin-top:12px;background:' + C_CARD + ';border-radius:12px}' +
    '.fs-run div{padding:10px 4px;text-align:center;border-right:.5px solid ' + C_LINE + '}.fs-run div:last-child{border-right:0}' +
    '.fs-run span{display:block;font-size:11px;color:' + C_MUT + '}.fs-run b{font-size:17px;font-weight:600;' + NUM + '}.fs-run b.g{color:' + C_OK + '}.fs-run b.r{color:' + C_RED + '}' +
    // market view
    '.fs-mkt{position:relative;width:220px;max-width:76%;margin:4px auto 4px}.fs-mkt svg{width:100%;display:block}' +
    '.fs-mkt .mv{position:absolute;left:0;right:0;bottom:2px;text-align:center}.fs-mkt .mv b{display:block;font-size:40px;font-weight:700;line-height:1;letter-spacing:-1px;' + NUM + '}.fs-mkt .mv span{font-size:13px;color:' + C_MUT + '}' +
    '.fs-mrow .nm{flex:1;min-width:0;font-weight:500;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-mrow .de{font-size:12px;color:' + C_MUT + ';font-weight:400}' +
    '.fs-mrow .msp{width:60px;height:20px;flex:none}.fs-mrow .pr{text-align:right;flex:none}.fs-mrow .pr b{display:block;font-size:15px;font-weight:600;' + NUM + '}.fs-mrow .pr span{font-size:12px;color:' + C_MUT + '}' +
    '.fs-mrow .pr .up{color:' + C_OK + '}.fs-mrow .pr .down{color:' + C_RED + '}' +
    // hub
    '.fs-dash{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-bottom:0}' +
    '.fs-dc{position:relative;overflow:hidden;padding:14px 16px 12px;min-height:140px}' +
    '.fs-dc .dh{font-size:13px;color:' + C_MUT + '}.fs-dc .di{display:none}' +
    '.fs-dc .dv{font-size:30px;font-weight:700;letter-spacing:-.6px;margin:6px 0 2px;' + NUM + '}' +
    '.fs-dc .dsub{font-size:12.5px;color:' + C_MUT + ';margin-top:2px;position:relative;z-index:1}.fs-dc .dsub b{color:' + C_TXT + ';font-weight:600}.fs-dc .dsub.up{color:' + C_OK + '}.fs-dc .dsub.down{color:' + C_RED + '}' +
    '.fs-dc .spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:40px}' +
    '.fs-dc .dpair{display:flex;gap:12px;margin:8px 0 6px}.fs-dc .dpair div{flex:1}.fs-dc .dpair b{display:block;font-size:24px;font-weight:700;' + NUM + '}.fs-dc .dpair span{font-size:12px;color:' + C_MUT + '}' +
    '.fs-safe{display:flex;align-items:center;gap:12px;padding:12px 16px}' +
    '.fs-safe .ico{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;background:' + C_OK + '}' +
    '.fs-safe.warn .ico{background:' + C_ORANGE + '}.fs-safe.stop .ico{background:' + C_RED + '}' +
    '.fs-safe .tx{flex:1;min-width:0}.fs-safe .k{font-size:12px;color:' + C_MUT + '}.fs-safe .t{font-size:15px;font-weight:600}.fs-safe .h{font-size:12px;color:' + C_MUT + '}' +
    '.fs-safe .chip{flex:none;font-size:13px;color:' + C_MUT + ';' + NUM + '}' +
    '.fs-tradebar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0 10px}.fs-tradebar .fs-segw{flex:1;max-width:260px}' +
    '.fs-upd{background:transparent;border:0;color:' + C_MUT + ';padding:6px 2px;font-size:13px}.fs-upd b{color:' + C_BLUE + ';font-weight:500}' +
    '.fs-trade .av{flex:none;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:' + C_TXT + ';background:' + C_CARD3 + '}' +
    '.fs-trade .nm{flex:1;min-width:0;font-weight:500;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-trade .nm span{color:' + C_MUT + ';font-weight:400}' +
    '.fs-trade .nm i{font-style:normal;font-size:11px;color:' + C_MUT + ';border:.5px solid ' + C_LINE + ';border-radius:4px;padding:0 4px;margin-left:4px}.fs-trade .de{font-size:12px;color:' + C_MUT + '}' +
    '.fs-trade .pf{font-weight:600;font-size:15px;' + NUM + 'color:' + C_MUT + '}.fs-trade .pf.open{color:' + C_TXT + '}.fs-trade .pf.pos{color:' + C_OK + '}.fs-trade .pf.neg{color:' + C_RED + '}' +
    '.fs-trade .stt{flex:none;font-size:12px;color:' + C_MUT + ';width:46px;text-align:right}' +
    '#fs-h-trades>.fs-more{margin:-4px 0 12px}' +
    '.fs-hubbtns{display:flex;flex-direction:column;margin:0 0 12px;background:' + C_CARD + ';border-radius:12px;overflow:hidden}' +
    '.fs-hb{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;background:transparent;border:0;border-top:.5px solid ' + C_LINE + ';padding:11px 16px;color:' + C_BLUE + '}.fs-hb:first-child{border-top:0}.fs-hb:active{background:' + C_CARD2 + '}' +
    '.fs-hb b{font-size:15px;font-weight:400}.fs-hb span{font-size:12.5px;color:' + C_MUT + '}' +
    // bulk list
    '.fs-bk-head{display:flex;align-items:center;gap:6px;margin:0 0 12px}.fs-bk-head b{font-size:17px;font-weight:600;flex:1;text-align:center;margin-right:58px}' +
    '.fs-bk-back{border:0;background:transparent;color:' + C_BLUE + ';padding:6px 0;font-size:17px;width:58px;text-align:left}' +
    '.fs-bk-card{padding:6px 16px 6px}' +
    '.fs-bkg{width:100%;text-align:left;color:' + C_TXT + ';justify-content:space-between}' +
    '.fs-bkg .nm{font-weight:500;font-size:15px}.fs-bkg i,.fs-bk-sel i{font-style:normal;color:' + C_MUT + ';font-weight:400}.fs-bkg .ct{font-size:13px;color:' + C_MUT + '}.fs-bkg .ct b{font-size:15px;color:' + C_TXT + ';font-weight:600}' +
    '.fs-bk-sel{font-weight:700;font-size:20px;display:flex;align-items:baseline;gap:8px;padding:8px 0 8px}.fs-bk-sel span{margin-left:auto;font-size:13px;color:' + C_MUT + ';font-weight:400}' +
    '.fs-bk-err{color:' + C_RED + ';font-size:13px;padding:8px 0 4px}' +
    // floating button
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:54px;height:54px;border-radius:50%;background:' + C_CARD2 + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.45);border:.5px solid rgba(255,255,255,.12);touch-action:none;user-select:none;-webkit-user-select:none}' +
    '#fs-fab svg{width:22px;height:22px}#fs-fab.glide{transition:left .45s cubic-bezier(.22,1,.36,1),top .45s cubic-bezier(.22,1,.36,1)}#fs-fab.drag{transform:scale(1.08)}' +
    '#fs-fab .dot{position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;background:' + C_OK + ';border:2px solid ' + C_CARD2 + ';display:none}#fs-fab.run .dot{display:block}' +
    // price tag on cards
    '.fs-badge{position:absolute;left:0;top:0;z-index:6;padding:1px 8px;border-radius:999px;background:rgba(28,28,30,.92);color:#fff;font:600 11px/1.5 ' + FONT + ';' + NUM + 'white-space:nowrap;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
    // running screen
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));background:rgba(0,0,0,.94);color:' + C_TXT + ';font:15px/1.4 ' + FONT + ';text-align:center;-webkit-font-smoothing:antialiased}' +
    '#fs-lock.show{display:flex}' +
    '#fs-lock .lspin{width:34px;height:34px;border-radius:50%;border:3px solid ' + C_CARD3 + ';border-top-color:' + C_TXT + ';animation:fsspin .9s linear infinite}@keyframes fsspin{to{transform:rotate(360deg)}}' +
    '#fs-lock .lbig{font-size:28px;font-weight:700;letter-spacing:-.4px}' +
    '#fs-lock .lstat{font-size:15px;color:' + C_MUT + ';min-height:20px;max-width:360px}' +
    '#fs-lock .lrow{display:grid;grid-template-columns:repeat(4,1fr);width:100%;max-width:400px;background:' + C_CARD + ';border-radius:12px}' +
    '#fs-lock .lrow div{padding:10px 4px;font-size:11px;color:' + C_MUT + ';border-right:.5px solid ' + C_LINE + '}#fs-lock .lrow div:last-child{border-right:0}' +
    '#fs-lock .lrow b{display:block;font-size:18px;font-weight:600;color:' + C_TXT + ';' + NUM + 'margin-top:2px}#fs-lock .lrow .pf b{color:' + C_OK + '}' +
    '#fs-lock .lsub{font-size:12.5px;color:' + C_MUT + ';max-width:360px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;width:100%;max-width:400px;margin-top:4px}#fs-lock .lbtns button{flex:1;border:0;border-radius:12px;padding:14px;font-size:17px;font-weight:600}' +
    '#fs-lstop{background:' + C_RED + ';color:#fff}#fs-lhide{background:' + C_CARD2 + ';color:' + C_TXT + '}' +
    // live feed
    '.fs-feed{width:100%;max-width:400px;display:flex;flex-direction:column;max-height:34vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;text-align:left;background:' + C_CARD + ';border-radius:12px}' +
    '.fs-feed:empty{display:none}#fs-body .fs-feed{max-width:none;max-height:260px;margin:12px 0 0}' +
    '.fs-fl{flex:none;display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:.5px solid ' + C_LINE + ';color:' + C_TXT + ';font-size:13px;line-height:1.3}.fs-fl:first-child{border-top:0}' +
    '.fs-fl .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-fl .tm{color:' + C_MUT2 + ';font-size:12px;' + NUM + '}' +
    '.fs-fl:before{content:"";width:6px;height:6px;border-radius:50%;background:' + C_CARD3 + ';flex:none}' +
    '.fs-fl.check:before{background:' + C_ORANGE + '}.fs-fl.price:before,.fs-fl.list:before{background:' + C_BLUE + '}.fs-fl.stop:before{background:' + C_RED + '}' +
    '.fs-fl.hit{font-weight:600}.fs-fl.hit:before{background:' + C_OK + '}.fs-fl.hit .tx{color:' + C_OK + '}' +
    // purchase banner (like an iOS notification)
    '#fs-toast{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));z-index:2147483647;width:min(92vw,400px);transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,.9,.25,1);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(44,44,46,.96);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#fff;font:15px/1.3 ' + FONT + ';pointer-events:none}' +
    '#fs-toast.in{transform:translate(-50%,0)}#fs-toast .ic{flex:none;width:34px;height:34px;border-radius:9px;background:' + C_OK + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}' +
    '#fs-toast .tx{min-width:0}#fs-toast b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fs-toast span{font-size:13px;color:' + C_MUT + ';' + NUM + '}';

  // ---------- UI ----------
  var logLines = [], activity = '';
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); }
  // What the bot is doing right now (status line only; events go to the feed, see feed()).
  function say(m) { setActivity(m); }
  function setActivity(m) { activity = m; ['fs-act', 'fs-l-act'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = m; }); }
  // Live feed: one line per search ("Player not found  14:03:22"), newest on top. Keeps the
  // last FEED_MAX lines (older ones drop off quietly) and can be scrolled.
  var feedLines = [], FEED_MAX = 200;
  function clock() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function feedHTML(l) { return '<div class="fs-fl ' + l.kind + '"><span class="tx">' + esc(l.text) + '</span><span class="tm">' + l.time + '</span></div>'; }
  // Every event, once: a line in the feed and the same line in the console.
  function feed(text, kind) {
    var l = { text: text, kind: kind || 'miss', time: clock() };
    feedLines.unshift(l); if (feedLines.length > FEED_MAX) feedLines.length = FEED_MAX;
    try { console.log('[TangaTolga] ' + text + '  ' + l.time); } catch (e) {}
    var boxes = document.querySelectorAll('.fs-feed');
    for (var i = 0; i < boxes.length; i++) {
      var bx = boxes[i], keep = bx.scrollTop > 4 ? bx.scrollHeight - bx.scrollTop : null; // reading older lines: don't jump
      bx.insertAdjacentHTML('afterbegin', feedHTML(l));
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
  function section(title, body) { return '<div class="fs-sect"><div class="fs-sect-h">' + title + '</div>' + body + '</div>'; }
  // A fold-away group: closed by default, so the screen shows only what you use every day.
  function fold(title, body, sub) { return '<details class="fs-det"><summary><span>' + title + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</summary><div class="in">' + body + '</div></details>'; }
  function rebuildView() { var b = document.getElementById('fs-body'); if (b) b.setAttribute('data-tab', ''); render(); }

  // ---------- Sniper: what it's trading, Start, live feed, saved searches ----------
  function sniperView() {
    return '<div id="fs-block"></div>' +
      '<div class="fs-target"><div class="tt-top"><div><div class="k">Target</div><div class="nm" id="fs-t-name">—</div></div><div class="mode" id="fs-t-mode"></div></div>' +
        '<div class="fs-cols"><div class="c"><div class="l">Market price</div><div class="v" id="fs-t-price">—</div></div>' +
        '<div class="c"><div class="l">Snipe at ≤</div><div class="v c" id="fs-t-snipe">—</div></div>' +
        '<div class="c"><div class="l">Min profit</div><div class="v g" id="fs-t-prof">—</div></div></div>' +
        '<button class="fs-sell" id="fs-sell"></button>' +
        '<div class="sub" id="fs-t-sub"></div></div>' +
      '<button class="fs-btn fs-go" id="fs-start"></button>' +
      '<div id="fs-act"></div>' +
      '<div class="fs-run"><div><span>Bought</span><b id="fs-s-buys">0</b></div><div><span>Searches</span><b id="fs-s-sr">0</b></div><div><span>Est. profit</span><b id="fs-s-est">—</b></div><div><span>Coins net</span><b id="fs-s-net">—</b></div></div>' +
      '<div class="fs-feed"></div>' +
      fold('Saved searches', '<div id="fs-filters"></div><button class="fs-more" id="fs-savefilter">Save the current market search</button>', filters.length ? filters.length + ' saved' : '') +
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
        segSetting('After buy', 'afterBuy', [['List', 0], ['Transfer list', 1], ['Unassigned', 2]], 'List = price check + relist. Transfer list / Unassigned = buys up to the Max. Buy Now of your web app search.') +
        segSetting('List for', 'listDur', LIST_DURS, '') +
        segSetting('Speed', 'speed', [['Night', 0], ['Normal', 1], ['Turbo', 2]], '<span id="fs-speedhint">' + speedHint() + '</span>')) +
      fold('Safety stops',
        setting('Too many results stop (10+)', ctlSw('tooManyStop'), 'Manual price: 10+ cards at your price = probably a typo in the price. Stops before buying.') +
        setting('Price range stop', ctlSw('rangeStop'), 'Never lists outside EA\u2019s allowed price range.') +
        setting('Keep special versions', ctlSw('keepSpecials'), 'A TOTW/special caught by a player search is kept, not sold at the normal price.') +
        setting('Session buy cap', ctlNum('sessionBuyCap'), '') +
        setting('Daily buy cap', ctlNum('dailyBuyCap'), '') +
        setting('Run minutes', ctlNum('runMinutes'), '0 = no limit.'), 'on') +
      fold('Transfer list',
        setting('Relist expired cards', ctlSw('relistExpired'), 'While sniping.') +
        setting('Re-price expired first', ctlSw('repriceExpired'), 'Today\u2019s price, never below break-even. Off = same price.') +
        segSetting('Clear sold items', 'clearSold', [['Off', 0], ['When full', 1], ['Always', 2]], '') +
        setting('Pack pulls: list if worth at least', ctlNum('packMin'), '')) +
      fold('Fine-tuning',
        rangeSetting('Re-check price every ~', 'reprobeEvery', 30, 120, 10, ' searches', '') +
        setting('Vary min bid', ctlSw('varyMinBid'), 'Fresh results on every search.') +
        rangeSetting('Break every ~', 'breakEvery', 20, 120, 5, ' searches', '') +
        rangeSetting('Break length', 'breakSec', 15, 300, 5, 's', '') +
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
      '<div class="fs-dash">' +
        '<div class="fs-dc pr"><div class="dh">Profit</div><div class="dv" id="fs-h-total">—</div>' +
          '<div class="dsub">of which unrealized <b id="fs-h-unreal">—</b></div><div class="dsub" id="fs-h-vs"></div><svg class="spark" id="fs-h-spark" viewBox="0 0 100 32" preserveAspectRatio="none"></svg></div>' +
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
      '</div></div>' +
      '<div class="fs-hubbtns">' +
        '<button class="fs-hb" id="fs-h-bulk"><b>List many at one price</b><span>pick a player on your transfer list · one price for all</span></button>' +
        '<button class="fs-hb" id="fs-h-clear"><b>Book &amp; clear sold</b><span id="fs-h-clear-s">refresh first</span></button>' +
        '<button class="fs-hb" id="fs-h-exp"><b>Re-price &amp; relist expired</b><span id="fs-h-exp-s">refresh first</span></button>' +
        '<button class="fs-hb" id="fs-h-packs"><b>List pack pulls</b><span id="fs-h-packs-s">refresh first</span></button>' +
      '</div>' +
      fold('Sessions', '<div id="fs-h-sessions"></div>');
  }
  function bulkView() {
    var h = '<div class="fs-bk-head"><button class="fs-bk-back" id="fs-bk-back">‹ Hub</button><b>List many at one price</b></div>';
    if (bulk.loading) return h + '<div class="fs-empty">Reading your transfer list…</div>';
    if (!bulk.sel) {
      if (!bulk.groups) return h + '<div class="fs-empty">' + esc(bulk.err || '…') + '</div>';
      return h + '<div class="ds" style="margin:2px 4px 10px">Cards on your transfer list that are not listed (or expired), grouped by player. Pick one.</div>' +
        (bulk.groups.length ? bulk.groups.map(function (g, i) {
          return '<button class="fs-bkg" data-bk="' + i + '"><span class="nm">' + esc(g.name) + (g.rating ? ' <i>' + g.rating + '</i>' : '') + '</span><span class="ct"><b>' + g.count + '</b> waiting' + (g.expired ? ' · ' + g.expired + ' expired' : '') + '</span></button>';
        }).join('') : '<div class="fs-empty">Nothing waiting: every card on your transfer list is listed or sold.</div>');
    }
    var g = bulk.sel, dur = bulk.dur || cfg.listDur || 3600;
    var inp = function (id, val, ph) { return '<input class="fs-num" id="' + id + '" type="text" inputmode="numeric" value="' + esc(val == null ? '' : String(val)) + '" placeholder="' + ph + '">'; };
    return h + '<div class="fs-card fs-bk-card"><div class="fs-bk-sel">' + esc(g.name) + (g.rating ? ' <i>' + g.rating + '</i>' : '') + '<span>' + g.count + ' waiting</span></div>' +
        setting('Buy Now price', inp('fs-bk-price', bulk.price || '', 'e.g. 25000'), bulk.price && Number(bulk.price) === lastPriceOf(g.def) ? 'Your last price check for this card.' : 'Every card gets this price.') +
        setting('Start price', inp('fs-bk-start', bulk.start, 'auto'), 'Empty = one price step below Buy Now.') +
        setting('How many', inp('fs-bk-n', bulk.n, String(g.count)), 'Up to ' + g.count + '.') +
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
    var all = realProfit(0), today = realProfit(startOfToday()), yest = realProfit(startOfToday() - 86400000);
    var yOnly = yest.sum - today.sum, unreal = 0;
    Object.keys(ledger.buys).forEach(function (id) { var b = ledger.buys[id]; if (b.list) unreal += profitAt(b.list, b.buy); });
    set('fs-h-total', all.n || unreal ? fmt(all.sum + unreal) : '—');
    set('fs-h-unreal', unreal ? signed(unreal) : '—');
    var vs = $('fs-h-vs');
    if (vs) {
      var pct = yOnly ? Math.round((today.sum - yOnly) / Math.abs(yOnly) * 100) : null;
      var t = pct == null ? 'today ' + (today.n ? signed(today.sum) : '—') : (pct >= 0 ? '▲ +' : '▼ ') + pct + '% vs. yesterday';
      if (vs.textContent !== t) { vs.textContent = t; vs.className = 'dsub ' + (pct == null ? '' : pct >= 0 ? 'up' : 'down'); }
    }
    var sp = $('fs-h-spark'), sh = sparkSVG(profitCurve(ledger.sales, 30)); if (sp && sp.__h !== sh) { sp.__h = sh; sp.innerHTML = sh; }
    set('fs-h-sess', String(sessions.length)); set('fs-h-srch', fmtk(life.searches || 0)); set('fs-h-avg', all.n ? fmt(Math.round(all.sum / all.n)) : '—');
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
      '<div id="fs-head"><div><span class="t">Sniper</span><span class="v">v' + VERSION + '</span></div><div style="display:flex;align-items:center"><span class="coins" id="fs-coins">—</span><button id="fs-min" title="Close">✕</button></div></div>' +
      '<div id="fs-tiles">' +
        '<div class="fs-tile" data-tab="snipe"><span class="tl">Sniper</span><span class="ti" id="fs-ti-run"></span></div>' +
        '<div class="fs-tile" data-tab="hub"><span class="tl">Hub</span></div>' +
        '<div class="fs-tile" data-tab="market"><span class="tl">Market</span></div>' +
        '<div class="fs-tile" data-tab="settings"><span class="tl">Settings</span></div>' +
      '</div><div id="fs-body"></div>';
    document.body.appendChild(el);
    var fab = document.createElement('div'); fab.id = 'fs-fab'; fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 2 4.5 13.6h6.3L9.6 22l9-11.6h-6.3z"/></svg><span class="dot"></span>';
    fab.onclick = function () { if (Date.now() - fabDraggedAt < 400) return; el.classList.add('open'); fab.style.display = 'none'; render(); };
    document.body.appendChild(fab);
    makeFabDraggable(fab);

    var lock = document.createElement('div'); lock.id = 'fs-lock';
    lock.innerHTML = '<div class="lspin"></div><div class="lbig">Running</div>' +
      '<div class="lstat" id="fs-l-act">Checking price…</div>' +
      '<div class="lrow"><div>Bought<b id="fs-l-buys">0</b></div><div>Searches<b id="fs-l-sr">0</b></div><div class="pf">Profit/card<b id="fs-l-pf">—</b></div><div>Coins net<b id="fs-l-net">—</b></div></div>' +
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
      var seg = g('data-seg'); if (seg) { cfg[seg] = Number(g('data-val')) || 0; if (seg === 'speed') applySpeed(); if (seg === 'sound') { unlockAudio(); playSound(cfg.sound); } save(); render(); return; }
      var hf = g('data-hf'); if (hf) { hubFilter = hf; hubShowAll = false; render(); return; }
      var bk = g('data-bk'); if (bk != null) { pickBulk(Number(bk)); return; }
      var bd = g('data-bkdur'); if (bd != null) { saveBulkInputs(); bulk.dur = Number(bd); rebuildView(); return; }
      var ld = g('data-load'); if (ld != null) { loadFilter(Number(ld)); return; }
      var dl = g('data-del'); if (dl != null) { deleteFilter(Number(dl)); return; }
      switch (tg.id) {
        case 'fs-start': if (running) stopAll(); else { unlockAudio(); start(); } break;
        case 'fs-sell': askSellPrice(); break;
        case 'fs-to-scan': toKartenscan(); break;
        case 'fs-test': unlockAudio(); celebrate('Test snipe', 13750, 662); break;
        case 'fs-min': el.classList.remove('open'); fab.style.display = ''; break;
        case 'fs-diag': diag(); break;
        case 'fs-savefilter': saveCurrentFilter(); break;
        case 'fs-clearsess': if (window.confirm('Clear the session history?')) { sessions = []; lsSet(SESS_KEY, sessions); redrawTab(); } break;
        case 'fs-reset2': if (window.confirm('Reset all-time stats and session history? This can’t be undone.')) { resetLife(); redrawTab(); } break;
        case 'fs-h-refresh': hubRefreshButton(); break;
        case 'fs-h-bulk': openBulk(); break;
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
        if ($('fs-l-sub')) $('fs-l-sub').textContent = mode === 'job' ? 'Hub job running — tap Stop any time, finished cards stay listed.' : keepMode() ? 'Buy ≤ ' + fmt(market.snipe) + (keepMinNow() > 0 ? ' · min ' + fmt(keepMinNow()) : '') + ' · ' + (cfg.afterBuy === 2 ? 'leave in Unassigned' : 'to transfer list') + ' · no price check' : market.snipe ? ('Price ' + fmt(market.price) + (cfg.sellPrice > 0 ? ' · sell ' + fmt(listPrice()) : '') + ' · snipe ≤ ' + fmt(market.snipe) + ' · step ' + fmt(stepFor(market.price)) + ' · list ' + durLabel(cfg.listDur)) : 'Screen locked so you don’t swipe the web app while it runs. Hide to reach the controls.';
        if ($('fs-l-pf')) $('fs-l-pf').textContent = mode === 'snipe' && !keepMode() && market.snipe ? '+' + fmtk(profitAt(listPrice(), market.snipe)) : '—';
        if ($('fs-l-buys')) $('fs-l-buys').textContent = stats.buys;
        if ($('fs-l-sr')) $('fs-l-sr').textContent = stats.searches;
        var lnet = sessionNet(); if ($('fs-l-net')) $('fs-l-net').textContent = lnet == null ? '—' : signed(lnet);
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
    if (tab === 'settings') { if ($('fs-keep')) $('fs-keep').style.display = keepMode() ? '' : 'none'; if ($('fs-speedhint')) $('fs-speedhint').textContent = speedHint(); return; }

    // Sniper view
    var keep = keepMode(), pr = market.snipe && !keep ? profitAt(listPrice(), market.snipe) : null;
    var sb = $('fs-sell');
    if (sb) {
      sb.style.display = keep ? 'none' : '';
      var sh = 'Sell at <b>' + (cfg.sellPrice > 0 ? fmt(roundStep(cfg.sellPrice)) + '</b> <i>yours</i>' : (market.price ? fmt(market.price) : 'market price') + '</b> <i>auto</i>') + '<span>✎ change</span>';
      if (sb.__html !== sh) { sb.__html = sh; sb.innerHTML = sh; }
    }
    if ($('fs-t-name')) $('fs-t-name').textContent = haveSearch() ? searchLabel() : 'Search a player in the market';
    if ($('fs-t-mode')) $('fs-t-mode').textContent = keep ? (cfg.afterBuy === 2 ? 'Keep · Unassigned' : 'Keep · Transfer list') : 'List · ' + durLabel(cfg.listDur);
    if ($('fs-t-price')) $('fs-t-price').textContent = keep ? 'no check' : market.price ? fmt(market.price) : (phase === 'checking' ? '…' : '—');
    if ($('fs-t-snipe')) $('fs-t-snipe').textContent = keep ? (keepMaxNow() > 0 ? fmt(floorStep(keepMaxNow())) : 'set price') : market.snipe ? fmt(market.snipe) : '—';
    if ($('fs-t-prof')) $('fs-t-prof').textContent = keep ? '—' : pr != null ? signed(pr) : '+' + fmt(cfg.minProfit);
    if ($('fs-t-sub')) $('fs-t-sub').textContent = keep ? (webMaxBuy() ? 'Max. Buy Now of your web app search' : keepMaxNow() ? 'fallback price from Settings · type a Max. Buy Now in the web app search to use that' : 'type a Max. Buy Now into the web app search') + (keepMinNow() > 0 ? ' · min ' + fmt(keepMinNow()) : '') : market.snipe ? ('step ' + fmt(stepFor(market.price)) + (market.fresh ? '' : ' · no fresh listings') + ' · checked ' + ago(market.checkedAt) + (stats.eaMax ? ' · EA range ' + fmtk(stats.eaMin) + '–' + fmtk(stats.eaMax) : '')) : 'Start checks the market price first, then snipes below it.';
    if ($('fs-s-buys')) $('fs-s-buys').textContent = stats.buys;
    if ($('fs-s-sr')) $('fs-s-sr').textContent = stats.searches;
    if ($('fs-s-est')) { $('fs-s-est').textContent = stats.buys ? signed(stats.est) : '—'; $('fs-s-est').className = stats.est < 0 ? 'r' : stats.buys ? 'g' : ''; }
    var net = sessionNet(); if ($('fs-s-net')) { $('fs-s-net').textContent = net == null ? '—' : signed(net); $('fs-s-net').className = net != null && net < 0 ? 'r' : net ? 'g' : ''; }
    var fl = $('fs-filters'), fh = filtersHTML(); if (fl && fl.__html !== fh) { fl.__html = fh; fl.innerHTML = fh; }
    if ($('fs-block')) $('fs-block').textContent = blockMsg || '';
    if ($('fs-act')) $('fs-act').textContent = activity;
    var go = $('fs-start');
    if (go) {
      // Only touch the DOM when it changes, so a tap is never lost to a re-render.
      var cls = 'fs-btn ' + (running ? 'fs-stop' : 'fs-go'); if (go.className !== cls) go.className = cls;
      var html = running
        ? 'Stop<span class="sub">bought ' + stats.buys + ' · ' + stats.searches + ' searches</span>'
        : keep ? 'Start<span class="sub">buys at ≤ ' + (keepMaxNow() > 0 ? fmt(floorStep(keepMaxNow())) : '?') + ' · ' + (cfg.afterBuy === 2 ? 'leaves them in Unassigned' : 'moves them to your transfer list') + '</span>'
        : 'Start<span class="sub">checks the price, then snipes for +' + fmt(cfg.minProfit) + '/card and relists (' + durLabel(cfg.listDur) + ')</span>';
      if (go.__html !== html) { go.__html = html; go.innerHTML = html; }
    }
    if ($('fs-status')) {
      $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'checking' ? 'Checking price…' : phase === 'break' ? 'Taking a short break…' : running ? ('● Sniping ≤ ' + fmt(market.snipe)) : haveServices() ? (haveSearch() ? 'Ready — tap Start' : 'Search a player, or load a saved search') : 'Open the FUT Web App & sign in');
      $('fs-status').style.color = running ? '#30d158' : stopReason ? '#ff9f0a' : 'rgba(235,235,245,.6)';
    }
  }

  setInterval(function () { if ((tab === 'hub' || tab === 'market') && document.getElementById('fs-panel') && document.getElementById('fs-panel').classList.contains('open')) render(); }, 5000);
  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) { buildUI(); startBadgeObserver(); paintBadges(); }
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
