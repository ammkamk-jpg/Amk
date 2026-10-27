// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      1.1.0
// @description  Self-run FUT transfer-market sniper for the EA SPORTS FC Web App. Full-screen panel, auto price from the live market + EA price range, markup re-listing, profit tracking, paced like a human, stops (never bypasses) on captcha/soft-ban. No third-party servers.
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
 * USE: pick a player in the FUT market (set filter, tap Search once) → tap the floating
 * ⚡ button to open the full-screen panel → tap "Start sniping". Auto price reads the live
 * market itself; nothing to look up. Tap ✕ to close the panel back to the market.
 */

(function () {
  'use strict';
  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;
  var VERSION = '1.1.0';

  // ---------- settings ----------
  var LS_KEY = 'futSnipe.settings.v3', LIFE_KEY = 'futSnipe.lifetime.v1';
  var DEFAULTS = {
    autoPrice: 1, margin: 250, maxBuy: 0, sellAt: 0, markupPercent: 0, runMinutes: 0, speed: 1,
    searchMinMs: 4000, searchJitterMs: 3000, buyGapMinMs: 700, buyGapMaxMs: 1600,
    breakEvery: 25, breakMinMs: 60000, breakMaxMs: 180000, sessionBuyCap: 15, dailyBuyCap: 150
  };
  var HARD_FLOOR_MS = 2000, EA_TAX = 0.05;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();
  function applySpeed() {
    var s = cfg.speed | 0;
    if (s === 0) { cfg.searchMinMs = 7000; cfg.searchJitterMs = 4000; cfg.buyGapMinMs = 1200; cfg.buyGapMaxMs = 2500; cfg.breakEvery = 15; }
    else if (s === 2) { cfg.searchMinMs = 2200; cfg.searchJitterMs = 1200; cfg.buyGapMinMs = 450; cfg.buyGapMaxMs = 950; cfg.breakEvery = 35; }
    else { cfg.searchMinMs = 4000; cfg.searchJitterMs = 3000; cfg.buyGapMinMs = 700; cfg.buyGapMaxMs = 1600; cfg.breakEvery = 25; }
  }
  applySpeed();

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }
  function loadLife() { try { return Object.assign({ bought: 0, spent: 0, est: 0 }, JSON.parse(localStorage.getItem(LIFE_KEY) || '{}')); } catch (e) { return { bought: 0, spent: 0, est: 0 }; } }
  function saveLife() { try { localStorage.setItem(LIFE_KEY, JSON.stringify(life)); } catch (e) {} }
  var life = loadLife();

  function stepFor(p) { return p < 1000 ? 50 : p < 10000 ? 100 : p < 50000 ? 250 : p < 100000 ? 500 : 1000; }
  function roundStep(p) { var s = stepFor(p); return Math.max(150, Math.round(p / s) * s); }

  // ---------- state ----------
  var running = false, stopReason = '', blockMsg = '', phase = 'idle', startTs = 0, autoPriced = false, gotRange = false, startCoins = null;
  var stats = { searches: 0, buys: 0, sinceBreak: 0, spent: 0, est: 0, marketCheapest: null, marketMedian: null, eaMin: null, eaMax: null };
  var OBS = {};
  var capturedCriteria = null, capturedFromUrl = null;
  var sampleKeys = [], samplePrice = null, tmUrls = [], lastBuy = '';
  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------- EA services ----------
  function svc() { return window.services || (window.App && window.App.services) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }

  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    ['searchTransferMarket', 'search'].forEach(function (name) {
      if (typeof s.Item[name] !== 'function') return;
      var orig = s.Item[name].bind(s.Item);
      s.Item[name] = function (criteria) { try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; gotRange = false; render(); } } catch (e) {} return orig.apply(null, arguments); };
    });
    s.Item.__futWrapped = true;
  }

  var URLMAP = { num: 'count', start: 'start', type: 'type', maskedDefId: 'maskedDefId', cat: 'category', lev: 'level', maxb: 'maxBuy', minb: 'minBuy', micr: 'minBid', macr: 'maxBid', pos: 'preferredPosition', zone: 'zone', nat: 'nationality', leag: 'league', team: 'team', playStyle: 'playStyle', rarities: 'rarities' };
  function criteriaFromUrl(u) {
    try { var q = u.split('?')[1]; if (!q) return null; var o = { __fromUs: true };
      q.split('&').forEach(function (kv) { var p = kv.split('='), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || ''), key = URLMAP[k]; if (!key) return; var n = Number(v); o[key] = (v !== '' && !isNaN(n)) ? n : v; });
      return Object.keys(o).length > 1 ? o : null;
    } catch (e) { return null; }
  }
  function ctor() { return window.UTSearchCriteriaDTO || (window.App && window.App.UTSearchCriteriaDTO) || null; }
  function applyFields(t, s) { for (var k in s) { if (k !== '__fromUs' && s[k] !== undefined && s[k] !== '') { try { t[k] = s[k]; } catch (e) {} } } return t; }
  function buildCriteria() {
    var out;
    if (capturedCriteria) out = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria);
    else { var C = ctor(); var src = capturedFromUrl || { type: 'player', category: 'any', count: 50, minBuy: 0, maxBuy: 0, minBid: 0, maxBid: 0 }; out = C ? applyFields(new C(), src) : Object.assign({}, src); }
    if (cfg.maxBuy > 0) out.maxBuy = cfg.maxBuy;
    try { out.offset = 0; } catch (e) {}
    out.__fromUs = true; return out;
  }
  function haveSearch() { return !!(capturedCriteria || capturedFromUrl); }
  function priceOf(it) { return it && ((it._auction && it._auction.buyNowPrice) != null ? it._auction.buyNowPrice : (it.buyNowPrice != null ? it.buyNowPrice : (it.buyNow != null ? it.buyNow : null))); }
  function effectiveMax() { if (cfg.maxBuy > 0) return cfg.maxBuy; if (capturedCriteria && capturedCriteria.maxBuy > 0) return capturedCriteria.maxBuy; return 0; }
  function plannedSell() { var m = effectiveMax(); if (cfg.sellAt > 0) return cfg.sellAt; if (cfg.markupPercent > 0 && m) return roundStep(m * (1 + cfg.markupPercent / 100)); return 0; }
  function sellPriceFor(buy) { if (cfg.sellAt > 0) return cfg.sellAt; if (cfg.markupPercent > 0) return roundStep(buy * (1 + cfg.markupPercent / 100)); return 0; }
  function estProfit() { var m = effectiveMax(), s = plannedSell(); if (!s || !m) return null; return Math.floor(s * (1 - EA_TAX)) - m; }
  function sessionNet() { return (startCoins != null && coins() != null) ? coins() - startCoins : null; }

  // EA's official price range for a card (the green min/max) — a real, on-device reference.
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
  function doSearch() {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
      try { try { svc().Item.clearTransferMarketCache(); } catch (e) {}
        svc().Item.searchTransferMarket(buildCriteria(), 1).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          var items = (resp && ((resp.data && resp.data.items) || (resp.response && resp.response.items))) || [];
          var ok = !!(resp && (resp.success === true || (resp.success == null && resp.status != null && resp.status < 400) || items.length));
          if (ok) { if (items.length && !sampleKeys.length) { try { sampleKeys = Object.keys(items[0]); samplePrice = priceOf(items[0]); } catch (e) {} } finish({ ok: true, items: items }); }
          else finish({ ok: false, items: [], err: classify(resp) });
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
  function listItem(item, start, buyNow, dur) { return new Promise(function (res) { try { if (!svc().Item.list) return res(false); svc().Item.list(item, start, buyNow, dur).observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }
  async function relist(item, buy) { var sp = sellPriceFor(buy); if (!(sp > 0)) return; await sleep(rand(500, 900)); var moved = await moveToTransfer(item); await sleep(rand(600, 925)); var start = Math.max(150, sp - stepFor(sp)); var ok = await listItem(item, start, sp, 3600); log(ok ? ('listed for ' + sp) : ('relist failed' + (moved ? '' : ' (move failed)'))); }

  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { var u = self.__u || '';
          if (/transfermarket\?/i.test(u) && (self.__m || 'GET').toUpperCase() === 'GET') { tmUrls.unshift(u); tmUrls = tmUrls.slice(0, 5); var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; gotRange = false; render(); } }
          if (/transfermarket|\/trade/i.test(u) && self.status === 429) { var r = self.getResponseHeader && self.getResponseHeader('Retry-After'); requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart'); }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();

  function requestStop(reason) { running = false; phase = 'idle'; stopReason = reason; log('STOP: ' + reason); render(); }

  function deriveAuto(prices) {
    if (!prices.length) return false;
    var cheapest = prices[0], median = prices[Math.floor(prices.length / 2)];
    stats.marketCheapest = cheapest; stats.marketMedian = median;
    var under = roundStep(Math.max(150, cheapest - cfg.margin));
    if (under >= cheapest) under = roundStep(cheapest - stepFor(cheapest));
    cfg.maxBuy = under;
    cfg.sellAt = cfg.markupPercent > 0 ? roundStep(under * (1 + cfg.markupPercent / 100)) : roundStep(median);
    autoPriced = true; save(); render();
    log('auto price: market cheapest ' + cheapest + ' → snipe under ' + under + ', sell ' + cfg.sellAt + (estProfit() != null ? ', profit ' + estProfit() : ''));
    return true;
  }

  async function snipeLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      var r = await doSearch(); if (!running) return;
      stats.searches++; stats.sinceBreak++;
      if (!r.ok) { if ((r.err || {}).stop) return requestStop(r.err.msg); log('search: ' + ((r.err || {}).msg || '—')); }
      else {
        var cands = [];
        for (var i = 0; i < r.items.length; i++) { var p = priceOf(r.items[i]); if (p && p > 0) cands.push({ it: r.items[i], p: p }); }
        cands.sort(function (a, b) { return a.p - b.p; });
        if (cands.length) { stats.marketCheapest = cands[0].p; stats.marketMedian = cands[Math.floor(cands.length / 2)].p; }
        if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0]).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
        if (cfg.autoPrice && !autoPriced) { if (cands.length) deriveAuto(cands.map(function (c) { return c.p; })); else { log('no listings yet — searching…'); render(); } }
        var max = effectiveMax();
        if (max > 0) {
          for (var j = 0; j < cands.length && running; j++) {
            var price = cands[j].p; if (price > max) break;
            var bal = coins(); if (bal != null && price > bal) { log('not enough coins for ' + price); continue; }
            var b = await doBuy(cands[j].it, price); if (!running) return;
            if (b.ok) {
              stats.buys++; addDaily(1); lastBuy = 'ok ' + price;
              stats.spent += price; var e = sellPriceFor(price) > 0 ? Math.floor(sellPriceFor(price) * (1 - EA_TAX)) - price : 0; stats.est += e;
              life.bought++; life.spent += price; life.est += e; saveLife();
              log('BOUGHT ' + price + '  (' + stats.buys + ' this run, est +' + e + ')'); await relist(cands[j].it, price);
            }
            else { lastBuy = (b.err && b.err.msg) || 'failed'; if ((b.err || {}).stop) return requestStop(b.err.msg); }
            await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
            if (stats.buys >= cfg.sessionBuyCap) break;
          }
        }
      }
      render();
      if (stats.sinceBreak >= cfg.breakEvery) { stats.sinceBreak = 0; var br = rand(cfg.breakMinMs, cfg.breakMaxMs); phase = 'break'; log('break ' + Math.round(br / 1000) + 's'); render(); for (var t = 0; t < br && running; t += 500) await sleep(500); phase = 'running'; render(); }
      else { var w = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs)); for (var x = 0; x < w && running; x += 250) await sleep(250); }
    }
  }

  async function startFlow() {
    blockMsg = '';
    if (running) return;
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return; }
    if (!haveSearch()) { blockMsg = 'Pick a player in the market (search once), then Start.'; render(); return; }
    if (!cfg.autoPrice && effectiveMax() <= 0) { blockMsg = 'Set a Snipe-under price, or turn Auto price on.'; render(); return; }
    autoPriced = effectiveMax() > 0; gotRange = false; startCoins = coins();
    stats.searches = 0; stats.buys = 0; stats.sinceBreak = 0; stats.spent = 0; stats.est = 0;
    running = true; phase = 'running'; stopReason = ''; startTs = Date.now();
    log(cfg.autoPrice && !autoPriced ? 'starting — auto price from live market…' : 'sniping under ' + effectiveMax() + (plannedSell() ? ', relist ' + plannedSell() : ''));
    render(); snipeLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stopAll() { if (running) requestStop('stopped by you'); }
  function resetLife() { life = { bought: 0, spent: 0, est: 0 }; saveLife(); render(); }

  function diag() {
    var s = svc(), I = s && s.Item;
    var d = { version: VERSION, servicesFound: !!s, itemMethods: I ? ['searchTransferMarket', 'search', 'bid', 'list', 'move', 'requestMarketData', 'clearTransferMarketCache'].filter(function (m) { return typeof I[m] === 'function'; }) : [], itemPileTransfer: (window.ItemPile && window.ItemPile.TRANSFER) != null, criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedFromUrl: !!capturedFromUrl, autoPrice: cfg.autoPrice, autoPriced: autoPriced, speed: cfg.speed, effectiveMax: effectiveMax(), plannedSell: plannedSell(), estProfit: estProfit(), marketCheapest: stats.marketCheapest, eaMin: stats.eaMin, eaMax: stats.eaMax, sessionSpent: stats.spent, sessionEst: stats.est, sessionNet: sessionNet(), lifetime: life, lastBuy: lastBuy, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, recentMarketUrls: tmUrls };
    var text = 'FUT Snipe diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }

  // ---------- UI ----------
  var logLines = [];
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); try { console.debug('[FUT Snipe]', m); } catch (e) {} }
  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
  function fmtk(n) { return n == null ? '—' : (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'k' : fmt(n)); }
  function signed(n) { return n == null ? '—' : (n > 0 ? '+' + fmtk(n) : fmtk(n)); }

  var CSS =
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:58px;height:58px;border-radius:30px;background:#00CAF6;color:#05222c;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.5);cursor:pointer;font-family:-apple-system,system-ui,sans-serif}' +
    '#fs-fab .dot{position:absolute;top:8px;right:8px;width:12px;height:12px;border-radius:6px;background:#19e67d;border:2px solid #05222c;display:none}' +
    '#fs-fab.run .dot{display:block}' +
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:14px/1.45 -apple-system,system-ui,"SF Pro Text",Roboto,sans-serif;color:#eaf0f6;background:#0b1017}' +
    '#fs-panel.open{display:flex}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;padding-top:max(14px,env(safe-area-inset-top));background:linear-gradient(180deg,#152030,#101722);border-bottom:1px solid #223041}' +
    '#fs-head .t{font-weight:800;letter-spacing:.3px;font-size:18px}#fs-head .v{opacity:.5;font-size:11px;margin-left:6px}' +
    '#fs-head .coins{font-size:14px;font-weight:700;color:#f3c969;background:#1b2838;border-radius:10px;padding:7px 12px}' +
    '#fs-min{background:#1b2838;color:#cdd8e4;border:0;border-radius:10px;width:40px;height:40px;font-size:20px;margin-left:10px}' +
    '#fs-body{flex:1;overflow:auto;padding:14px;padding-bottom:max(24px,env(safe-area-inset-bottom));width:100%;max-width:520px;margin:0 auto}' +
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
    '.fs-r input[type=number]{width:104px;background:#0c131b;border:1px solid #223041;color:#eaf0f6;border-radius:8px;padding:9px 10px;font-size:15px;text-align:right}' +
    '.fs-sw{width:48px;height:28px;border-radius:15px;background:#2a3a4c;position:relative;transition:.15s}.fs-sw.on{background:#00CAF6}.fs-sw:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:.15s}.fs-sw.on:after{left:23px}' +
    '.fs-segw{display:flex;gap:5px}.fs-sg{background:#0c131b;color:#9fb0c3;border:1px solid #223041;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600}.fs-sg.on{background:#00CAF6;color:#05222c;border-color:#00CAF6}' +
    '.fs-btn{width:100%;border:0;border-radius:14px;padding:16px;font-size:16px;font-weight:800;letter-spacing:.2px;margin-top:2px}' +
    '.fs-go{background:#00CAF6;color:#05222c}.fs-stop{background:#FF5D0B;color:#fff}' +
    '.fs-btn .sub{display:block;font-size:12px;font-weight:600;opacity:.8;margin-top:3px}' +
    '.fs-mini{display:flex;gap:8px;margin-top:9px}.fs-mini button{flex:1;background:#1b2838;color:#9fb0c3;border:0;border-radius:11px;padding:11px;font-size:13px;font-weight:600}' +
    '#fs-block{color:#ff9a6b;font-size:12px;margin:0 0 10px}' +
    '#fs-status{font-size:13px;color:#8ea0b5;margin:12px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:120px;overflow:auto;white-space:pre-wrap;color:#7f93a8;font-size:11.5px;line-height:1.5}' +
    '.fs-sec summary{cursor:pointer;color:#8ea0b5;font-size:13px;padding:6px 2px;list-style:none}.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"⚙︎ ";opacity:.7}';

  function row(ic, label, key) { return '<label class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><input data-k="' + key + '" type="number" value="' + cfg[key] + '"></label>'; }
  function swRow(ic, label, key) { return '<div class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><div class="fs-sw' + (cfg[key] ? ' on' : '') + '" data-sw="' + key + '"></div></div>'; }
  function segRow(ic, label, key, opts) { var b = opts.map(function (o) { return '<button class="fs-sg' + (cfg[key] === o[1] ? ' on' : '') + '" data-seg="' + key + '" data-val="' + o[1] + '">' + o[0] + '</button>'; }).join(''); return '<div class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><div class="fs-segw">' + b + '</div></div>'; }

  function buildUI() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'fs-panel';
    el.innerHTML =
      '<div id="fs-head"><div><span class="t">⚡ FUT Snipe</span><span class="v">v' + VERSION + '</span></div><div style="display:flex;align-items:center"><span class="coins" id="fs-coins">—</span><button id="fs-min" title="Close">✕</button></div></div>' +
      '<div id="fs-body">' +
        '<div id="fs-block"></div>' +
        '<div class="fs-card"><div class="fs-ch">Price — EA range &amp; live market</div><div class="fs-cols">' +
          '<div class="c"><div class="l">EA min</div><div class="v" id="fs-emin">—</div></div>' +
          '<div class="c"><div class="l">EA max</div><div class="v" id="fs-emax">—</div></div>' +
          '<div class="c"><div class="l">Cheapest now</div><div class="v c" id="fs-cheap">—</div></div>' +
        '</div></div>' +
        '<div class="fs-card"><div class="fs-ch">Snipe plan</div><div class="fs-cols">' +
          '<div class="c"><div class="l">Snipe under</div><div class="v c" id="fs-p-max">—</div></div>' +
          '<div class="c"><div class="l">Sell at</div><div class="v" id="fs-p-sell">—</div></div>' +
          '<div class="c"><div class="l">Profit / card</div><div class="v g" id="fs-p-prof">—</div></div>' +
        '</div></div>' +
        '<div class="fs-card"><div class="fs-ch">This run</div><div class="fs-cols">' +
          '<div class="c"><div class="l">Bought</div><div class="v" id="fs-s-buys">0</div></div>' +
          '<div class="c"><div class="l">Est. profit</div><div class="v g" id="fs-s-est">—</div></div>' +
          '<div class="c"><div class="l">Coins net</div><div class="v" id="fs-s-net">—</div></div>' +
        '</div><div class="fs-life" id="fs-life"></div></div>' +
        '<div class="fs-rows">' +
          swRow('✨', 'Auto price', 'autoPrice') +
          segRow('🏎️', 'Speed', 'speed', [['Slow', 0], ['Normal', 1], ['Fast', 2]]) +
          row('◎', 'Snipe under', 'maxBuy') +
          row('🏷️', 'Sell at (0 = auto)', 'sellAt') +
          row('📈', 'Markup % (if Sell=0)', 'markupPercent') +
          row('🛑', 'Session buy cap', 'sessionBuyCap') +
        '</div>' +
        '<button class="fs-btn fs-go" id="fs-go"></button>' +
        '<div class="fs-mini"><button id="fs-reset">Reset totals</button><button id="fs-diag">Copy diag</button></div>' +
        '<details class="fs-sec"><summary>Advanced</summary><div class="fs-rows" style="margin-top:8px">' +
          row('🎯', 'Auto margin (under cheapest)', 'margin') + row('⏱️', 'Run minutes (0 = ∞)', 'runMinutes') +
          row('📅', 'Daily buy cap', 'dailyBuyCap') +
        '</div></details>' +
        '<div id="fs-status"></div><pre id="fs-log"></pre>' +
      '</div>';
    document.body.appendChild(el);
    // Floating launcher button — tap to open the full-screen panel, tap ✕ to close it.
    var fab = document.createElement('div'); fab.id = 'fs-fab'; fab.innerHTML = '⚡<span class="dot"></span>';
    fab.onclick = function () { el.classList.add('open'); fab.style.display = 'none'; render(); };
    document.body.appendChild(fab);
    el.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return; cfg[k] = Number(e.target.value) || 0; save(); render(); });
    el.addEventListener('click', function (e) {
      var sw = e.target.getAttribute && e.target.getAttribute('data-sw');
      if (sw) { cfg[sw] = cfg[sw] ? 0 : 1; e.target.className = 'fs-sw' + (cfg[sw] ? ' on' : ''); save(); render(); return; }
      var seg = e.target.getAttribute && e.target.getAttribute('data-seg');
      if (seg) { cfg[seg] = Number(e.target.getAttribute('data-val')) || 0; if (seg === 'speed') applySpeed(); save();
        var wrap = e.target.parentNode; Array.prototype.forEach.call(wrap.children, function (c) { c.className = 'fs-sg' + (Number(c.getAttribute('data-val')) === cfg[seg] ? ' on' : ''); }); render(); }
    });
    el.querySelector('#fs-go').onclick = function () { if (running) stopAll(); else startFlow(); };
    el.querySelector('#fs-reset').onclick = resetLife;
    el.querySelector('#fs-diag').onclick = diag;
    el.querySelector('#fs-min').onclick = function () { el.classList.remove('open'); fab.style.display = ''; };
    render();
  }

  function render() {
    var $ = function (id) { return document.getElementById(id); };
    var fb = $('fs-fab'); if (fb) fb.className = running ? 'run' : '';
    if (!$('fs-body')) return;
    $('fs-coins').textContent = coins() != null ? fmtk(coins()) : '—';
    $('fs-emin').textContent = stats.eaMin != null ? fmt(stats.eaMin) : '—';
    $('fs-emax').textContent = stats.eaMax != null ? fmt(stats.eaMax) : '—';
    $('fs-cheap').textContent = stats.marketCheapest != null ? fmt(stats.marketCheapest) : (haveSearch() ? '…' : '—');
    var m = effectiveMax(), s = plannedSell(), pr = estProfit();
    $('fs-p-max').textContent = m ? fmt(m) : '—';
    $('fs-p-sell').textContent = s ? fmt(s) : '—';
    $('fs-p-prof').textContent = pr == null ? '—' : signed(pr);
    $('fs-s-buys').textContent = stats.buys;
    $('fs-s-est').textContent = stats.buys ? signed(stats.est) : '—';
    var net = sessionNet(); $('fs-s-net').textContent = net == null ? '—' : signed(net);
    $('fs-s-net').className = 'v' + (net != null && net < 0 ? ' r' : net ? ' g' : '');
    $('fs-life').textContent = 'All-time: ' + fmtk(life.bought) + ' bought · est profit ' + signed(life.est);
    $('fs-block').textContent = blockMsg || '';
    var go = $('fs-go'), busy = running;
    go.className = 'fs-btn ' + (busy ? 'fs-stop' : 'fs-go');
    go.innerHTML = busy
      ? 'Stop sniping<span class="sub">bought ' + stats.buys + ' · ' + stats.searches + ' searches</span>'
      : 'Start sniping<span class="sub">' + (cfg.autoPrice && !(m > 0) ? 'auto price · finds it from the live market' : (m ? 'under ' + fmt(m) + (pr != null ? ' · ' + signed(pr) + '/card' : '') : 'set a snipe-under price')) + '</span>';
    $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'break' ? 'Taking a short break…' : running ? '● Running' : haveServices() ? (haveSearch() ? 'Ready' : 'Pick a player in the market, then Start') : 'Open the FUT Web App & sign in');
    $('fs-status').style.color = running ? '#19e67d' : stopReason ? '#ff9a6b' : '#8ea0b5';
  }

  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) buildUI();
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
