// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      2.5.0
// @description  Self-run FUT transfer-market sniper for the EA SPORTS FC Web App. One Start button: checks the market price on EA's own market, snipes cards at or below price minus tax minus your target profit, auto-relists, re-checks the price as the market moves. Price tags on cards. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
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
  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;
  var VERSION = '2.5.0';

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

  if (typeof module === 'object' && module.exports) {
    module.exports = { EA_TAX: EA_TAX, MIN_PRICE: MIN_PRICE, FEW: FEW, stepFor: stepFor, roundStep: roundStep, floorStep: floorStep, afterTax: afterTax, profitAt: profitAt, snipePoint: snipePoint, isFreshSecs: isFreshSecs, pickMarketPrice: pickMarketPrice, probeMid: probeMid, probeVerdict: probeVerdict };
  }

  // ---------- settings & storage ----------
  var LS_KEY = 'futSnipe.settings.v3', LIFE_KEY = 'futSnipe.lifetime.v1';
  var FILT_KEY = 'futSnipe.filters.v1', SESS_KEY = 'futSnipe.sessions.v1', PRICE_KEY = 'futSnipe.prices.v1';
  var DEFAULTS = {
    minProfit: 500, listDur: 3600, autoList: 1, badges: 1, speed: 1, runMinutes: 0,
    searchMinMs: 2500, searchJitterMs: 400, buyGapMinMs: 500, buyGapMaxMs: 1100,
    breakEvery: 30, breakSec: 90, sessionBuyCap: 15, dailyBuyCap: 150, reprobeEvery: 20
  };
  var LIST_DURS = [['1h', 3600], ['3h', 10800], ['6h', 21600], ['12h', 43200], ['1d', 86400], ['3d', 259200]];
  var HARD_FLOOR_MS = 300;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();
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

  // Live Filters (saved search sets) + Stats (session history) + price cache (per card id).
  var filters = lsGet(FILT_KEY, []);     // [{name, crit}]
  var sessions = lsGet(SESS_KEY, []);     // [{t, buys, spent, est, net}]
  var priceCache = lsGet(PRICE_KEY, {}); // { id: {price, t, checked} }
  var CHECKED_WINS_MS = 15 * 60000, PRICE_TTL_MS = 6 * 3600000, PRICE_CACHE_MAX = 800;
  // checked = from the bot's price check. A recent checked price beats a plain "cheapest seen".
  function cachePrice(id, p, checked) {
    if (id == null || !(p > 0)) return;
    var k = String(id), old = priceCache[k], now = Date.now();
    if (!checked && old && old.checked && now - old.t < CHECKED_WINS_MS) return;
    priceCache[k] = { price: p, t: now, checked: !!checked };
  }
  var cacheSaveTimer = null;
  function saveCacheSoon() {
    if (cacheSaveTimer) return;
    cacheSaveTimer = setTimeout(function () {
      cacheSaveTimer = null;
      var keys = Object.keys(priceCache), now = Date.now();
      keys.forEach(function (k) { if (now - priceCache[k].t > PRICE_TTL_MS) delete priceCache[k]; });
      keys = Object.keys(priceCache);
      if (keys.length > PRICE_CACHE_MAX) keys.sort(function (a, b) { return priceCache[a].t - priceCache[b].t; }).slice(0, keys.length - PRICE_CACHE_MAX).forEach(function (k) { delete priceCache[k]; });
      lsSet(PRICE_KEY, priceCache);
    }, 1000);
  }
  function cachedPrice(id) { var r = id != null && priceCache[String(id)]; return r && Date.now() - r.t < PRICE_TTL_MS ? r.price : null; }

  // ---------- run state (resetRun() clears it on every Start) ----------
  var running = false, stopReason = '', blockMsg = '', phase = 'idle', startTs = 0, startCoins = null;
  var tab = 'snipe', lockHidden = false, curName = null, gotRange = false;
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
      s.Item[name] = function (criteria) { try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; capturedPlain = plainCriteria(criteria); render(); } } catch (e) {} return orig.apply(null, arguments); };
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
  function buildCriteria(maxBuy) {
    var out;
    if (capturedCriteria) out = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria);
    else { var C = ctor(); var src = capturedFromUrl || capturedPlain || { type: 'player', category: 'any', count: 50 }; out = C ? applyFields(new C(), src) : Object.assign({}, src); }
    try { out.minBuy = 0; out.minBid = 0; out.maxBid = 0; out.maxBuy = maxBuy > 0 ? maxBuy : 0; out.offset = 0; } catch (e) {}
    out.__fromUs = true; return out;
  }
  function haveSearch() { return !!(capturedCriteria || capturedFromUrl || capturedPlain); }
  function priceOf(it) { return it && ((it._auction && it._auction.buyNowPrice) != null ? it._auction.buyNowPrice : (it.buyNowPrice != null ? it.buyNowPrice : (it.buyNow != null ? it.buyNow : null))); }
  function defIdOf(it) { try { return (it.definitionId != null ? it.definitionId : (it._staticData && it._staticData.id) || (it.resourceId) || (it.id)) || null; } catch (e) { return null; } }
  function expiresOf(it) { try { var a = it._auction || {}; if (a.expires != null) return a.expires; if (a.timeRemaining != null) return a.timeRemaining; var et = it.endTime || a.endTime; if (et) { var now = Date.now(); if (et > 1e12) return Math.round((et - now) / 1000); if (et > 1e9) return Math.round((et * 1000 - now) / 1000); } return null; } catch (e) { return null; } }
  function nameOf(it) { try { return (it._staticData && it._staticData.name) || it.name || (it.getStaticData && it.getStaticData().name) || null; } catch (e) { return null; } }
  function searchLabel() { if (curName) return curName; var id = (capturedPlain && (capturedPlain.maskedDefId || capturedPlain.defId)) || stats.curDefId; return id ? ('player #' + id) : 'player'; }
  function sessionNet() { return (startCoins != null && coins() != null) ? coins() - startCoins : null; }

  function priceLimits(item) {
    return new Promise(function (res) {
      try {
        if (item.hasPriceLimits && item.hasPriceLimits()) { var r0 = item.getPriceLimits && item.getPriceLimits(); return res(r0 && r0.maximum > 0 ? { min: r0.minimum, max: r0.maximum } : null); }
        if (!svc().Item.requestMarketData) return res(null);
        svc().Item.requestMarketData(item).observe(OBS, function () { try { var r = item.getPriceLimits(); res(r && r.maximum > 0 ? { min: r.minimum, max: r.maximum } : null); } catch (e) { res(null); } });
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
  function doSearch(maxBuy) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
      try { try { svc().Item.clearTransferMarketCache(); } catch (e) {}
        svc().Item.searchTransferMarket(buildCriteria(maxBuy), 1).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          var raw = (resp && ((resp.data && resp.data.items) || (resp.response && resp.response.items))) || [];
          var ok = !!(resp && (resp.success === true || (resp.success == null && resp.status != null && resp.status < 400) || raw.length));
          if (!ok) return finish({ ok: false, items: [], err: classify(resp) });
          if (raw.length && !sampleKeys.length) { try { sampleKeys = Object.keys(raw[0]); samplePrice = priceOf(raw[0]); } catch (e) {} }
          var items = [];
          for (var i = 0; i < raw.length; i++) { var p = priceOf(raw[i]); if (p > 0) items.push({ it: raw[i], p: p, secs: expiresOf(raw[i]) }); }
          items.sort(function (a, b) { return a.p - b.p; });
          if (items.length) { curName = nameOf(items[0].it) || curName; stats.curDefId = defIdOf(items[0].it) || stats.curDefId; }
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

  // Every transfer-market response the web app gets (yours or the bot's) feeds the price tags:
  // cheapest Buy Now seen per card. Also stops the bot on a 429.
  function recordMarketPrices(body) {
    var data; try { data = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return; }
    var list = data && data.auctionInfo; if (!list || !list.length) return;
    var min = {};
    list.forEach(function (a) {
      var d = a && a.itemData, p = a && a.buyNowPrice; if (!d || !(p > 0)) return;
      [d.resourceId, d.assetId].forEach(function (id) { if (id != null && (!(id in min) || p < min[id])) min[id] = p; });
    });
    for (var id in min) cachePrice(id, min[id], false);
    saveCacheSoon(); paintBadges();
  }
  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { var u = String(self.__u || ''), get = (self.__m || 'GET').toUpperCase() === 'GET';
          if (/transfermarket\?/i.test(u) && get) {
            tmUrls.unshift(u); tmUrls = tmUrls.slice(0, 5);
            if (!running) { var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; render(); } } // the bot's own searches don't count
            if (self.status === 200) recordMarketPrices(self.responseType === 'json' ? self.response : self.responseText);
          }
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
  function requestStop(reason) { if (!running) return; running = false; phase = 'idle'; stopReason = reason; recordSession(); say('STOP: ' + reason); render(); }

  // Human-like gap between searches; returns false if stopped while waiting.
  async function pace() {
    var w = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs));
    for (var x = 0; x < w && running; x += 250) await sleep(250);
    return running;
  }
  // A counted, paced search. null = the run stopped (captcha / 429 / Stop).
  async function search(maxBuy) {
    if (!(await pace())) return null;
    var r = await doSearch(maxBuy); if (!running) return null;
    stats.searches++; stats.sinceBreak++;
    if (!r.ok) { if ((r.err || {}).stop) { requestStop(r.err.msg); return null; } log('search: ' + ((r.err || {}).msg || '—')); }
    if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0].it).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
    return r;
  }

  // Price check: search with NO max-buy; its dearest listing is the ceiling. Then binary-search max-buy down until only
  // a few listings are left (the cheapest ones), and take the 2nd-cheapest fresh one as the price.
  async function checkPrice() {
    phase = 'checking'; market.probeMax = 0; market.probeCount = null;
    say('Checking price for ' + searchLabel() + '…'); render();
    var r = await search(0); if (!r) return false;
    if (!r.ok || !r.items.length) { say('Checking price: ' + searchLabel() + ' - none listed yet'); return false; }
    var lo = stats.eaMin > 0 ? Math.max(0, stats.eaMin - stepFor(stats.eaMin)) : 0, hi = r.items[r.items.length - 1].p, hiItems = null, few = null;
    var asListings = function (items) { return items.map(function (x) { return { price: x.p, secs: x.secs }; }); };
    if (probeVerdict(asListings(r.items)) === 'few') few = r.items; // tiny market: the unfiltered search already is "a few"
    for (var tries = 0; !few && tries < 14 && running; tries++) {
      var mid = probeMid(lo, hi); if (!mid) break;
      var pr = await search(mid); if (!pr) return false;
      if (!pr.ok) continue;
      market.probeMax = mid; market.probeCount = pr.items.length;
      var v = probeVerdict(asListings(pr.items));
      log('price check: max ' + fmt(mid) + ' -> ' + (pr.items.length > FEW ? FEW + '+' : pr.items.length) + ' listings'); render();
      if (v === 'none') lo = mid; else if (v === 'many') { hi = mid; hiItems = pr.items; } else few = pr.items;
    }
    if (!running) return false;
    if (!few) { // lo and hi are neighbouring prices: the listings at hi are the cheapest there are
      if (!hiItems) { var hr = await search(hi); if (!hr) return false; hiItems = hr.ok ? hr.items : []; }
      few = hiItems;
    }
    var pick = pickMarketPrice(asListings(few));
    if (!pick) { say('Checking price: ' + searchLabel() + ' - none found'); return false; }
    var sp = snipePoint(pick.price, cfg.minProfit);
    if (!sp) { requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(pick.price) + ' card'); return false; }
    market.price = pick.price; market.fresh = pick.fresh; market.snipe = sp; market.checkedAt = Date.now();
    stats.sinceCheck = 0; cachePrice(stats.curDefId, pick.price, true); saveCacheSoon(); paintBadges();
    say('Price ' + searchLabel() + ': ' + fmt(pick.price) + (pick.fresh ? '' : ' (no fresh listings)') + ' -> snipe <= ' + fmt(sp) + ', list ' + fmt(pick.price) + ', +' + fmt(profitAt(pick.price, sp)) + '/card');
    phase = 'running'; render();
    return true;
  }

  async function relist(item, buy) {
    if (!cfg.autoList) return;
    var sell = market.price; if (!(sell > 0)) return;
    await sleep(rand(1500, 4000)); // still lists if you tap Stop meanwhile: a bought card shouldn't sit unlisted
    var moved = await moveToTransfer(item);
    await sleep(rand(600, 1200));
    var ok = await listItem(item, Math.max(MIN_PRICE, sell - stepFor(sell)), sell, cfg.listDur || 3600);
    say(ok ? (searchLabel() + ' listed for ' + fmt(sell) + ' (' + durLabel(cfg.listDur) + ')') : ('relist failed' + (moved ? '' : ' (move failed)') + ' - list it by hand'));
  }

  // Buy everything at or below the snipe point (any freshness), then relist each one.
  async function snipeOnce() {
    var r = await search(market.snipe); if (!r) return;
    if (!r.ok) return;
    stats.cheapest = r.items.length ? r.items[0].p : stats.cheapest;
    var bought = 0;
    for (var j = 0; j < r.items.length && running; j++) {
      var price = r.items[j].p; if (price > market.snipe) break;
      var bal = coins(); if (bal != null && price > bal) { log('not enough coins for ' + fmt(price)); continue; }
      var b = await doBuy(r.items[j].it, price); if (!running) return;
      if (b.ok) {
        var e = profitAt(market.price, price);
        stats.buys++; bought++; addDaily(1); lastBuy = 'ok ' + price;
        stats.spent += price; stats.est += e; life.bought++; life.spent += price; life.est += e; saveLife();
        say(searchLabel() + ' sniped for ' + fmt(price) + ' (est +' + fmt(e) + ')'); render();
        await relist(r.items[j].it, price);
      } else { lastBuy = (b.err && b.err.msg) || 'failed'; log('buy ' + fmt(price) + ': ' + lastBuy); if ((b.err || {}).stop) return requestStop(b.err.msg); }
      if (stats.buys >= cfg.sessionBuyCap) return;
      await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
    }
    if (!bought) { var m = 'searching ' + searchLabel() + ' <= ' + fmt(market.snipe) + ' - none found'; console.log('[FUT Snipe] ' + m); setActivity(m); }
  }

  async function runLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      if (!market.snipe || stats.sinceCheck >= (cfg.reprobeEvery || 20)) { if (market.snipe) log('re-checking the price (the market moves)…'); await checkPrice(); }
      else { await snipeOnce(); stats.sinceCheck++; }
      render();
      if (running && stats.sinceBreak >= cfg.breakEvery) {
        stats.sinceBreak = 0; var base = Math.max(5, cfg.breakSec) * 1000, br = rand(Math.round(base * 0.8), Math.round(base * 1.2));
        phase = 'break'; say('break ' + Math.round(br / 1000) + 's (after ' + cfg.breakEvery + ' searches)'); render();
        for (var t = 0; t < br && running; t += 500) await sleep(500);
        if (running) phase = 'running'; render();
      }
    }
  }

  function start() {
    if (running) return;
    resetRun();
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return; }
    if (!haveSearch()) { blockMsg = 'Search a player in the transfer market (or load a filter), then Start.'; render(); return; }
    running = true; phase = 'checking';
    say('Start: ' + searchLabel() + ', target +' + fmt(cfg.minProfit) + '/card');
    render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stopAll() { requestStop('stopped by you'); }
  function resetLife() { life = { bought: 0, spent: 0, est: 0 }; saveLife(); render(); }

  // ---------- Live Filters + diagnostics ----------
  function saveCurrentFilter() {
    var crit = capturedPlain || capturedFromUrl; if (!crit) { blockMsg = 'Search a player once first, then save it as a filter.'; render(); return; }
    var name = (window.prompt && window.prompt('Name this filter', 'Filter ' + (filters.length + 1))) || ('Filter ' + (filters.length + 1));
    filters.unshift({ name: name, crit: Object.assign({}, crit) }); filters = filters.slice(0, 40); lsSet(FILT_KEY, filters); render();
  }
  function loadFilter(i) { var f = filters[i]; if (!f || running) return; capturedFromUrl = Object.assign({ __fromUs: true }, f.crit); capturedCriteria = null; capturedPlain = Object.assign({}, f.crit); tab = 'snipe'; blockMsg = ''; log('loaded filter: ' + f.name); render(); }
  function deleteFilter(i) { filters.splice(i, 1); lsSet(FILT_KEY, filters); render(); }

  function diag() {
    try { var row = document.querySelector('li.listFUTItem, .listFUTItem'); if (row) lastCardHTML = row.outerHTML.slice(0, 1200); } catch (e) {}
    var s = svc(), I = s && s.Item;
    var d = { version: VERSION, servicesFound: !!s, itemMethods: I ? ['searchTransferMarket', 'search', 'bid', 'list', 'move', 'requestMarketData', 'clearTransferMarketCache'].filter(function (m) { return typeof I[m] === 'function'; }) : [], criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedPlain: capturedPlain, phase: phase, market: market, minProfit: cfg.minProfit, listDur: cfg.listDur, speed: cfg.speed, cheapest: stats.cheapest, curName: curName, curDefId: stats.curDefId, eaMin: stats.eaMin, eaMax: stats.eaMax, sessionNet: sessionNet(), lifetime: life, filtersSaved: filters.length, sessionsLogged: sessions.length, pricesCached: Object.keys(priceCache).length, badgesPainted: document.querySelectorAll('.fs-badge').length, lastBuy: lastBuy, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, marketCardHTML: lastCardHTML, recentMarketUrls: tmUrls };
    var text = 'FUT Snipe diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }

  // ---------- price tags on cards ----------
  // Prices come from EA's own market: the bot's price check, plus the cheapest Buy Now seen in
  // any transfer-market search (see recordMarketPrices). No extra EA calls just for tags.
  var badgeTimer = null, badgeObs = null;
  var ROW_SEL = 'li.listFUTItem, .listFUTItem, ul.paginated > li, .ut-club-search-results-view li, .itemList > li';
  var RESULTS_SEL = '.SearchResults, .ut-search-results, [class*="SearchResults"], [class*="search-results"]';
  function startBadgeObserver() {
    if (badgeObs || !window.MutationObserver || !document.body) return;
    badgeObs = new MutationObserver(function () { paintBadges(); });
    try { badgeObs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  function paintBadges() { if (!cfg.badges || badgeTimer) return; badgeTimer = setTimeout(function () { badgeTimer = null; doPaintBadges(); }, 300); }
  function removeBadges() { try { var b = document.querySelectorAll('.fs-badge'); for (var i = 0; i < b.length; i++) b[i].parentNode && b[i].parentNode.removeChild(b[i]); } catch (e) {} }
  // Best-effort read of the card ids from a rendered card (varies across web-app versions).
  function cardIds(el) {
    var out = [];
    try {
      if (!el || !el.getAttribute) return out;
      ['data-definition-id', 'data-def-id', 'data-resource-id', 'data-asset-id'].forEach(function (a) { var v = el.getAttribute(a); if (v) out.push(v); });
      var imgs = el.querySelectorAll ? el.querySelectorAll('img') : [];
      for (var i = 0; i < imgs.length; i++) { var m = (imgs[i].getAttribute('src') || '').match(/\/(?:p)?(\d{3,10})\.(?:png|webp|avif)/); if (m) out.push(m[1]); }
    } catch (e) {}
    return out;
  }
  function priceForRow(row, art) {
    var ids = cardIds(row).concat(cardIds(art));
    for (var i = 0; i < ids.length; i++) { var p = cachedPrice(ids[i]); if (p) return p; }
    // Market results for the searched player: every row is that player.
    if (!ids.length && stats.curDefId && row.closest && row.closest(RESULTS_SEL)) return cachedPrice(stats.curDefId);
    return null;
  }
  function doPaintBadges() {
    if (badgeObs) badgeObs.disconnect();
    try {
      var rows = document.querySelectorAll(ROW_SEL);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var art = row.querySelector('.ut-item-view, .cardView, .playerCard, .entityContainer, .player') || row;
        var price = priceForRow(row, art), old = art.querySelector && art.querySelector('.fs-badge');
        if (!(price > 0)) { if (old) old.parentNode.removeChild(old); continue; }
        var text = '≈ ' + fmt(price);
        if (old) { if (old.textContent !== text) old.textContent = text; continue; }
        try { var cs = window.getComputedStyle(art); if (cs && cs.position === 'static') art.style.position = 'relative'; } catch (e) {}
        var b = document.createElement('div'); b.className = 'fs-badge'; b.textContent = text;
        art.appendChild(b);
      }
    } catch (e) {}
    if (badgeObs) { try { badgeObs.observe(document.body, { childList: true, subtree: true }); } catch (e) {} }
  }

  // ---------- styles ----------
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *{box-sizing:border-box}#fs-body{overflow-x:hidden}' +
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(7,11,18,.975);color:#eaf0f6;font:14px/1.45 -apple-system,system-ui,sans-serif;text-align:center;padding:24px;touch-action:none;-webkit-user-select:none;user-select:none}' +
    '#fs-lock.show{display:flex}' +
    '#fs-lock .spin{width:56px;height:56px;border-radius:50%;border:4px solid #1b2838;border-top-color:#00CAF6;animation:fsspin 1s linear infinite}' +
    '@keyframes fsspin{to{transform:rotate(360deg)}}' +
    '#fs-lock .lbig{font-size:21px;font-weight:800}#fs-lock .lstat{font-size:14px;color:#00CAF6;font-weight:700;min-height:18px}' +
    '#fs-lock .lrow{display:flex;gap:26px;margin-top:2px}#fs-lock .lrow div{font-size:11px;color:#8ea0b5;text-transform:uppercase;letter-spacing:.4px}#fs-lock .lrow b{display:block;font-size:22px;color:#fff;font-weight:800;margin-top:2px}' +
    '#fs-lock .lsub{font-size:12px;color:#7f93a8;max-width:300px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;margin-top:8px}#fs-lock .lbtns button{border:0;border-radius:12px;padding:14px 24px;font-size:15px;font-weight:800}' +
    '#fs-lstop{background:#FF5D0B;color:#fff}#fs-lhide{background:#1b2838;color:#cdd8e4}' +
    '.fs-r.rcol{flex-direction:column;align-items:stretch;gap:8px}.fs-r.rcol .lab{justify-content:flex-start;width:100%}.fs-r.rcol .sv{margin-left:auto;color:#00CAF6;font-weight:800}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:4px;background:#2a3a4c;outline:none;margin:2px 0}.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#00CAF6;border:3px solid #0b1017;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
    '.fs-hint{font-size:11px;color:#8ea0b5;padding:0 12px 10px;margin-top:-4px}' +
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:58px;height:58px;border-radius:30px;background:#00CAF6;color:#05222c;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.5);cursor:pointer;font-family:-apple-system,system-ui,sans-serif}' +
    '#fs-fab .dot{position:absolute;top:8px;right:8px;width:12px;height:12px;border-radius:6px;background:#19e67d;border:2px solid #05222c;display:none}' +
    '#fs-fab.run .dot{display:block}' +
    '.fs-badge{position:absolute;left:50%;bottom:5px;transform:translateX(-50%);z-index:6;padding:1px 9px;border-radius:9px;background:#0b1620;border:1.5px solid #00CAF6;color:#eaf6ff;font:800 12px/1.35 -apple-system,system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.45);pointer-events:none}' +
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:14px/1.45 -apple-system,system-ui,"SF Pro Text",Roboto,sans-serif;color:#eaf0f6;background:#0b1017}' +
    '#fs-panel.open{display:flex}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;padding-top:max(13px,env(safe-area-inset-top));background:linear-gradient(180deg,#152030,#101722);border-bottom:1px solid #223041}' +
    '#fs-head .t{font-weight:800;letter-spacing:.3px;font-size:17px}#fs-head .v{opacity:.5;font-size:11px;margin-left:6px}' +
    '#fs-head .coins{font-size:14px;font-weight:700;color:#f3c969;background:#1b2838;border-radius:10px;padding:7px 12px}' +
    '#fs-min{background:#1b2838;color:#cdd8e4;border:0;border-radius:10px;width:38px;height:38px;font-size:19px;margin-left:10px}' +
    '#fs-tabs{display:flex;gap:6px;padding:10px 14px 0;background:#101722}' +
    '.fs-tab{flex:1;text-align:center;padding:10px;border-radius:10px 10px 0 0;background:#0e1620;color:#8ea0b5;font-weight:700;font-size:13px}' +
    '.fs-tab.on{background:#0b1017;color:#00CAF6;box-shadow:inset 0 -2px 0 #00CAF6}' +
    '#fs-body{flex:1;overflow:auto;padding:14px;padding-bottom:max(24px,env(safe-area-inset-bottom));width:100%;max-width:520px;margin:0 auto}' +
    '.fs-hero{background:linear-gradient(135deg,#0f2630,#121c28);border:1px solid #1d4350;border-radius:16px;padding:16px;margin-bottom:12px;text-align:center}' +
    '.fs-hero .big{font-size:34px;font-weight:900;color:#00CAF6;letter-spacing:.5px}' +
    '.fs-hero .sub{font-size:12px;color:#8ea0b5;margin-top:2px}' +
    '.fs-hero .prof{font-size:15px;font-weight:800;margin-top:8px}' +
    '.fs-card{background:#121c28;border:1px solid #223041;border-radius:14px;overflow:hidden;margin-bottom:11px}' +
    '.fs-ch{font-size:9.5px;letter-spacing:.6px;color:#6f8498;text-transform:uppercase;padding:9px 12px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}' +
    '.fs-cols .c{padding:7px 10px 11px;border-right:1px solid #1b2836}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{font-size:9px;letter-spacing:.4px;color:#6f8498;text-transform:uppercase}' +
    '.fs-cols .v{font-size:16px;font-weight:800;margin-top:3px}.fs-cols .v.c{color:#00CAF6}.fs-cols .v.g{color:#19e67d}.fs-cols .v.r{color:#ff8a5c}' +
    '.fs-life{font-size:11px;color:#7f93a8;text-align:center;padding:0 0 9px;margin-top:-2px}' +
    '.fs-rows{background:#141f2c;border:1px solid #223041;border-radius:14px;margin-bottom:11px;overflow:hidden}' +
    '.fs-r{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #1b2836}.fs-r:last-child{border-bottom:0}' +
    '.fs-r .lab{display:flex;align-items:center;gap:9px;color:#cdd8e4}.fs-r .ic{width:17px;text-align:center;opacity:.85}' +
    '.fs-r input[type=number]{width:92px;background:#0c131b;border:1px solid #223041;color:#eaf0f6;border-radius:8px;padding:7px 8px;font-size:13px;text-align:right}' +
    '.fs-sw{width:44px;height:26px;border-radius:14px;background:#2a3a4c;position:relative;transition:.15s}.fs-sw.on{background:#00CAF6}.fs-sw:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.15s}.fs-sw.on:after{left:21px}' +
    '.fs-segw{display:flex;gap:4px}.fs-sg{background:#0c131b;color:#9fb0c3;border:1px solid #223041;border-radius:8px;padding:6px 9px;font-size:12px;font-weight:600}.fs-sg.on{background:#00CAF6;color:#05222c;border-color:#00CAF6}' +
    '.fs-btn{width:100%;border:0;border-radius:13px;padding:15px;font-size:16px;font-weight:800;letter-spacing:.2px}' +
    '.fs-go{background:#00CAF6;color:#05222c}.fs-stop{background:#FF5D0B;color:#fff}' +
    '.fs-btn .sub{display:block;font-size:11px;font-weight:600;opacity:.8;margin-top:2px}' +
    '.fs-mini{display:flex;gap:8px;margin-top:9px}.fs-mini button{flex:1;background:#1b2838;color:#9fb0c3;border:0;border-radius:10px;padding:9px;font-size:12px;font-weight:600}' +
    '#fs-block{color:#ff9a6b;font-size:11.5px;margin:0 0 10px}' +
    '#fs-status{font-size:12px;color:#8ea0b5;margin:10px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:104px;overflow:auto;white-space:pre-wrap;color:#7f93a8;font-size:11px;line-height:1.5}' +
    '.fs-sec summary{cursor:pointer;color:#8ea0b5;font-size:12px;padding:4px 2px;list-style:none}.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"⚙︎ ";opacity:.7}' +
    '.fs-item{display:flex;align-items:center;justify-content:space-between;background:#121c28;border:1px solid #223041;border-radius:12px;padding:12px;margin-bottom:9px}' +
    '.fs-item .nm{font-weight:700;font-size:14px}.fs-item .de{font-size:11px;color:#7f93a8;margin-top:2px}' +
    '.fs-item .act{display:flex;gap:7px}.fs-item .act button{border:0;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:700}' +
    '.fs-load{background:#00CAF6;color:#05222c}.fs-del{background:#2a3a4c;color:#cdd8e4}' +
    '.fs-empty{text-align:center;color:#6f8498;font-size:13px;padding:30px 10px}' +
    '.fs-bar{height:7px;border-radius:4px;background:#1b2836;overflow:hidden;margin-top:6px}.fs-bar i{display:block;height:100%;background:#19e67d}' +
    '.fs-srow{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;border-bottom:1px solid #1b2836}.fs-srow:last-child{border:0}' +
    '.fs-segw{flex-wrap:wrap;justify-content:flex-end;max-width:62%}' +
    '.fs-go .sub,.fs-stop .sub{display:block}#fs-act{font-size:12.5px;color:#00CAF6;font-weight:700;text-align:center;margin:10px 2px 0;min-height:17px}';

  // ---------- UI ----------
  var logLines = [], activity = '';
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); }
  // A step worth seeing: on screen (activity line + log) and in the console.
  function say(m) { log(m); setActivity(m); try { console.log('[FUT Snipe] ' + m); } catch (e) {} }
  function setActivity(m) { activity = m; ['fs-act', 'fs-l-act'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = m; }); }
  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
  function fmtk(n) { return n == null ? '—' : (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'k' : fmt(n)); }
  function signed(n) { return n == null ? '—' : (n > 0 ? '+' + fmtk(n) : fmtk(n)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(t) { var d = (Date.now() - t) / 1000; if (d < 60) return 'just now'; if (d < 3600) return Math.round(d / 60) + 'm ago'; if (d < 86400) return Math.round(d / 3600) + 'h ago'; return Math.round(d / 86400) + 'd ago'; }
  function durLabel(s) { for (var i = 0; i < LIST_DURS.length; i++) if (LIST_DURS[i][1] === s) return LIST_DURS[i][0]; return Math.round((s || 3600) / 3600) + 'h'; }

  function row(ic, label, key) { return '<label class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><input data-k="' + key + '" type="number" value="' + cfg[key] + '"></label>'; }
  function swRow(ic, label, key) { return '<div class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><div class="fs-sw' + (cfg[key] ? ' on' : '') + '" data-sw="' + key + '"></div></div>'; }
  function segRow(ic, label, key, opts) { var b = opts.map(function (o) { return '<button class="fs-sg' + (cfg[key] === o[1] ? ' on' : '') + '" data-seg="' + key + '" data-val="' + o[1] + '">' + o[0] + '</button>'; }).join(''); return '<div class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><div class="fs-segw">' + b + '</div></div>'; }
  function sliderRow(ic, label, key, min, max, step, unit) { return '<div class="fs-r rcol"><div class="lab"><span class="ic">' + ic + '</span>' + label + ' <b class="sv" data-sv="' + key + '">' + cfg[key] + unit + '</b></div><input class="fs-range" data-k="' + key + '" data-unit="' + unit + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + cfg[key] + '"></div>'; }

  function snipeView() {
    return '' +
      '<div id="fs-block"></div>' +
      '<div class="fs-hero"><div class="l" style="font-size:9px;letter-spacing:.5px;color:#6f8498;text-transform:uppercase">Snipe point</div>' +
        '<div class="big" id="fs-hero-max">—</div>' +
        '<div class="sub" id="fs-hero-sub"></div>' +
        '<div class="prof" id="fs-hero-prof"></div></div>' +
      '<div class="fs-card"><div class="fs-ch">This run</div><div class="fs-cols">' +
        '<div class="c"><div class="l">Bought</div><div class="v" id="fs-s-buys">0</div></div>' +
        '<div class="c"><div class="l">Est. profit</div><div class="v g" id="fs-s-est">—</div></div>' +
        '<div class="c"><div class="l">Coins net</div><div class="v" id="fs-s-net">—</div></div>' +
      '</div><div class="fs-life" id="fs-life"></div></div>' +
      '<button class="fs-btn fs-go" id="fs-start"></button>' +
      '<div id="fs-act"></div>' +
      '<div class="fs-rows" style="margin-top:11px">' +
        row('🎯', 'Target profit / card', 'minProfit') +
        segRow('⏳', 'List for', 'listDur', LIST_DURS) +
        swRow('🧾', 'Auto-relist after buy', 'autoList') +
        swRow('🏷️', 'Price tags on cards', 'badges') +
        segRow('🏎️', 'Speed', 'speed', [['Night', 0], ['Normal', 1], ['Turbo', 2]]) +
        '<div class="fs-hint" id="fs-speedhint">' + speedHint() + '</div>' +
        sliderRow('⏸️', 'Break every', 'breakEvery', 20, 120, 5, ' searches') +
        sliderRow('😴', 'Break length', 'breakSec', 15, 300, 5, 's') +
      '</div>' +
      '<div class="fs-mini"><button id="fs-savefilter">★ Save as filter</button><button id="fs-diag">Copy diag</button></div>' +
      '<details class="fs-sec"><summary>Prices</summary><div class="fs-card" style="margin-top:8px"><div class="fs-cols">' +
        '<div class="c"><div class="l">EA min</div><div class="v" id="fs-emin">—</div></div>' +
        '<div class="c"><div class="l">EA max</div><div class="v" id="fs-emax">—</div></div>' +
        '<div class="c"><div class="l">Cheapest now</div><div class="v c" id="fs-cheap">—</div></div>' +
      '</div></div></details>' +
      '<details class="fs-sec"><summary>Limits</summary><div class="fs-rows" style="margin-top:8px">' +
        row('🔁', 'Re-check price every (searches)', 'reprobeEvery') + row('🛑', 'Session buy cap', 'sessionBuyCap') +
        row('📅', 'Daily buy cap', 'dailyBuyCap') + row('⏱️', 'Run minutes (0=∞)', 'runMinutes') +
      '</div></details>' +
      '<div id="fs-status"></div><pre id="fs-log"></pre>';
  }
  function filtersView() {
    var list = filters.length ? filters.map(function (f, i) {
      var c = f.crit || {}, bits = [];
      if (c.level) bits.push(String(c.level)); if (c.maskedDefId || c.defId) bits.push('player'); if (c.league) bits.push('league ' + c.league); if (c.nationality) bits.push('nat ' + c.nationality);
      return '<div class="fs-item"><div><div class="nm">' + esc(f.name) + '</div><div class="de">' + (bits.join(' · ') || 'saved search') + '</div></div>' +
        '<div class="act"><button class="fs-load" data-load="' + i + '">Load</button><button class="fs-del" data-del="' + i + '">✕</button></div></div>';
    }).join('') : '<div class="fs-empty">No saved filters yet.<br>Search a player in the market, then tap <b>★ Save as filter</b> on the Snipe tab.</div>';
    return '<div class="fs-ch" style="padding:0 2px 8px">Live Filters — tap-to-load saved searches</div>' +
      '<button class="fs-btn fs-go" id="fs-savefilter2" style="margin-bottom:12px">★ Save current search as a filter</button>' + list;
  }
  function statsView() {
    var totBuys = sessions.reduce(function (a, b) { return a + (b.buys || 0); }, 0);
    var totEst = sessions.reduce(function (a, b) { return a + (b.est || 0); }, 0);
    var totNet = sessions.reduce(function (a, b) { return a + (b.net || 0); }, 0);
    var maxAbs = Math.max(1, Math.max.apply(null, sessions.map(function (s) { return Math.abs(s.net || s.est || 0); }).concat([1])));
    var rows = sessions.length ? sessions.map(function (s) {
      var val = s.net != null ? s.net : s.est; var w = Math.round(Math.abs(val || 0) / maxAbs * 100);
      return '<div class="fs-srow"><div><div style="font-weight:700">' + signed(val) + ' coins</div><div class="de" style="font-size:11px;color:#7f93a8">' + ago(s.t) + ' · ' + (s.buys || 0) + ' bought</div><div class="fs-bar" style="width:140px"><i style="width:' + w + '%;background:' + ((val || 0) < 0 ? '#ff8a5c' : '#19e67d') + '"></i></div></div>' +
        '<div style="text-align:right;font-size:12px;color:#8ea0b5">est ' + signed(s.est) + '</div></div>';
    }).join('') : '<div class="fs-empty">No sessions yet.<br>Run the sniper and your results will show here.</div>';
    return '<div class="fs-hero"><div class="l" style="font-size:9px;letter-spacing:.5px;color:#6f8498;text-transform:uppercase">All-time coins net</div>' +
      '<div class="big" style="color:' + (totNet < 0 ? '#ff8a5c' : '#19e67d') + '">' + signed(totNet) + '</div>' +
      '<div class="sub">' + fmtk(life.bought) + ' bought all-time · est profit ' + signed(life.est) + '</div></div>' +
      '<div class="fs-card"><div class="fs-ch">Totals (last ' + sessions.length + ' sessions)</div><div class="fs-cols">' +
        '<div class="c"><div class="l">Sessions</div><div class="v">' + sessions.length + '</div></div>' +
        '<div class="c"><div class="l">Bought</div><div class="v">' + fmtk(totBuys) + '</div></div>' +
        '<div class="c"><div class="l">Est. profit</div><div class="v g">' + signed(totEst) + '</div></div>' +
      '</div></div>' +
      '<div class="fs-ch" style="padding:2px 2px 8px">Session history</div>' + rows +
      '<div class="fs-mini"><button id="fs-clearsess">Clear history</button><button id="fs-reset2">Reset all-time</button></div>';
  }

  function buildUI() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'fs-panel';
    el.innerHTML =
      '<div id="fs-head"><div><span class="t">⚡ FUT Snipe</span><span class="v">v' + VERSION + '</span></div><div style="display:flex;align-items:center"><span class="coins" id="fs-coins">—</span><button id="fs-min" title="Close">✕</button></div></div>' +
      '<div id="fs-tabs">' +
        '<div class="fs-tab" data-tab="snipe">Snipe</div>' +
        '<div class="fs-tab" data-tab="filters">Filters</div>' +
        '<div class="fs-tab" data-tab="stats">Stats</div>' +
      '</div><div id="fs-body"></div>';
    document.body.appendChild(el);
    var fab = document.createElement('div'); fab.id = 'fs-fab'; fab.innerHTML = '⚡<span class="dot"></span>';
    fab.onclick = function () { el.classList.add('open'); fab.style.display = 'none'; render(); };
    document.body.appendChild(fab);

    var lock = document.createElement('div'); lock.id = 'fs-lock';
    lock.innerHTML = '<div class="spin"></div><div class="lbig">⚡ FUT Snipe running</div>' +
      '<div class="lstat" id="fs-l-act">Checking price…</div>' +
      '<div class="lrow"><div>Bought<b id="fs-l-buys">0</b></div><div>Searches<b id="fs-l-sr">0</b></div><div>Coins net<b id="fs-l-net">—</b></div></div>' +
      '<div class="lsub" id="fs-l-sub"></div>' +
      '<div class="lbtns"><button id="fs-lstop">Stop</button><button id="fs-lhide">Hide</button></div>';
    document.body.appendChild(lock);
    lock.addEventListener('touchmove', function (ev) { ev.preventDefault(); }, { passive: false });
    lock.querySelector('#fs-lstop').onclick = function () { stopAll(); };
    lock.querySelector('#fs-lhide').onclick = function () { lockHidden = true; render(); };

    // live label while dragging a slider
    el.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k || e.target.type !== 'range') return; cfg[k] = Number(e.target.value) || 0; var lab = el.querySelector('[data-sv="' + k + '"]'); if (lab) lab.textContent = cfg[k] + (e.target.getAttribute('data-unit') || ''); });
    el.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return; cfg[k] = Number(e.target.value) || 0; save(); render(); });
    el.addEventListener('click', function (e) {
      // closest(): a tap on the subtitle <span> inside a button still counts as that button.
      var tg = e.target && e.target.closest ? e.target.closest('button,[data-tab],[data-sw]') : e.target;
      if (!tg || !el.contains(tg)) return;
      var g = function (a) { return tg.getAttribute && tg.getAttribute(a); };
      var tb = g('data-tab'); if (tb) { tab = tb; render(); return; }
      var sw = g('data-sw'); if (sw) { cfg[sw] = cfg[sw] ? 0 : 1; if (sw === 'badges') { if (cfg.badges) paintBadges(); else removeBadges(); } save(); render(); return; }
      var seg = g('data-seg'); if (seg) { cfg[seg] = Number(g('data-val')) || 0; if (seg === 'speed') applySpeed(); save(); render(); return; }
      var ld = g('data-load'); if (ld != null) { loadFilter(Number(ld)); return; }
      var dl = g('data-del'); if (dl != null) { deleteFilter(Number(dl)); return; }
      switch (tg.id) {
        case 'fs-start': if (running) stopAll(); else start(); break;
        case 'fs-min': el.classList.remove('open'); fab.style.display = ''; break;
        case 'fs-diag': diag(); break;
        case 'fs-savefilter': case 'fs-savefilter2': saveCurrentFilter(); break;
        case 'fs-clearsess': sessions = []; lsSet(SESS_KEY, sessions); render(); break;
        case 'fs-reset2': resetLife(); break;
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
        if ($('fs-l-sub')) $('fs-l-sub').textContent = market.snipe ? ('Price ' + fmt(market.price) + ' · snipe ≤ ' + fmt(market.snipe) + ' · list ' + durLabel(cfg.listDur)) : 'Screen locked so you don’t swipe the web app while it runs. Hide to reach the controls.';
        if ($('fs-l-buys')) $('fs-l-buys').textContent = stats.buys;
        if ($('fs-l-sr')) $('fs-l-sr').textContent = stats.searches;
        var lnet = sessionNet(); if ($('fs-l-net')) $('fs-l-net').textContent = lnet == null ? '—' : signed(lnet);
      } else {
        lock.classList.remove('show');
        if (fb && !panel.classList.contains('open')) fb.style.display = '';
      }
    }
    // tabs
    var tabs = panel.querySelectorAll('.fs-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].className = 'fs-tab' + (tabs[i].getAttribute('data-tab') === tab ? ' on' : '');
    // body (only rebuild on tab change to keep inputs usable)
    var body = $('fs-body');
    if (body.getAttribute('data-tab') !== tab) { body.setAttribute('data-tab', tab); body.innerHTML = tab === 'filters' ? filtersView() : tab === 'stats' ? statsView() : snipeView(); }
    $('fs-coins').textContent = coins() != null ? fmtk(coins()) : '—';
    if (tab !== 'snipe') return;

    // keep toggles / segments reflecting cfg (body isn't rebuilt on value changes)
    var i2, sws = panel.querySelectorAll('[data-sw]'); for (i2 = 0; i2 < sws.length; i2++) sws[i2].className = 'fs-sw' + (cfg[sws[i2].getAttribute('data-sw')] ? ' on' : '');
    var segs = panel.querySelectorAll('[data-seg]'); for (i2 = 0; i2 < segs.length; i2++) { var sb = segs[i2]; sb.className = 'fs-sg' + (Number(sb.getAttribute('data-val')) === cfg[sb.getAttribute('data-seg')] ? ' on' : ''); }
    if ($('fs-speedhint')) $('fs-speedhint').textContent = speedHint();

    var pr = market.snipe ? profitAt(market.price, market.snipe) : null;
    if ($('fs-hero-max')) $('fs-hero-max').textContent = market.snipe ? fmt(market.snipe) : (phase === 'checking' ? '…' : (haveSearch() ? 'Ready' : 'Search'));
    if ($('fs-hero-sub')) $('fs-hero-sub').textContent = market.snipe ? ('market price ' + fmt(market.price) + (market.fresh ? '' : ' (no fresh listings)') + ' · checked ' + ago(market.checkedAt)) : 'Start checks the market price first';
    if ($('fs-hero-prof')) { $('fs-hero-prof').textContent = pr == null ? '' : (signed(pr) + ' / card after tax'); $('fs-hero-prof').style.color = pr != null && pr < 0 ? '#ff8a5c' : '#19e67d'; }
    if ($('fs-emin')) $('fs-emin').textContent = stats.eaMin != null ? fmt(stats.eaMin) : '—';
    if ($('fs-emax')) $('fs-emax').textContent = stats.eaMax != null ? fmt(stats.eaMax) : '—';
    if ($('fs-cheap')) $('fs-cheap').textContent = stats.cheapest != null ? fmt(stats.cheapest) : '—';
    if ($('fs-s-buys')) $('fs-s-buys').textContent = stats.buys;
    if ($('fs-s-est')) $('fs-s-est').textContent = stats.buys ? signed(stats.est) : '—';
    var net = sessionNet(); if ($('fs-s-net')) { $('fs-s-net').textContent = net == null ? '—' : signed(net); $('fs-s-net').className = 'v' + (net != null && net < 0 ? ' r' : net ? ' g' : ''); }
    if ($('fs-life')) $('fs-life').textContent = 'All-time: ' + fmtk(life.bought) + ' bought · est profit ' + signed(life.est);
    if ($('fs-block')) $('fs-block').textContent = blockMsg || '';
    if ($('fs-act')) $('fs-act').textContent = activity;
    var go = $('fs-start');
    if (go) {
      // Only touch the DOM when it changes, so a tap is never lost to a re-render.
      var cls = 'fs-btn ' + (running ? 'fs-stop' : 'fs-go'); if (go.className !== cls) go.className = cls;
      var html = running
        ? '■ Stop<span class="sub">bought ' + stats.buys + ' · ' + stats.searches + ' searches</span>'
        : '▶ Start<span class="sub">checks the price, then snipes for +' + fmt(cfg.minProfit) + '/card and relists (' + durLabel(cfg.listDur) + ')</span>';
      if (go.__html !== html) { go.__html = html; go.innerHTML = html; }
    }
    if ($('fs-status')) {
      $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'checking' ? 'Checking price…' : phase === 'break' ? 'Taking a short break…' : running ? ('● Sniping ≤ ' + fmt(market.snipe)) : haveServices() ? (haveSearch() ? 'Ready — tap Start' : 'Search a player, or load a filter') : 'Open the FUT Web App & sign in');
      $('fs-status').style.color = running ? '#19e67d' : stopReason ? '#ff9a6b' : '#8ea0b5';
    }
  }

  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) { buildUI(); startBadgeObserver(); paintBadges(); }
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
