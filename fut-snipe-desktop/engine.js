// FUT Snipe — headless engine, injected into the FUT Web App page inside the Electron
// <webview>. No on-page UI: it exposes window.__FUTSNIPE for the app's own dashboards and
// emits state to the host via console.log('[FUTSNIPE]' + json) (read by the renderer's
// console-message listener). Same search/buy/price-check/caps/stop logic as the userscript.
//
// Automating the FUT market breaks EA's rules (ban / coin-wipe). Paces itself and STOPS
// (never bypasses) on captcha / soft-ban. Nothing leaves your device except over your own
// LAN to the phone remote you open yourself.
(function () {
  'use strict';
  if (window.__FUTSNIPE) return;

  var EA_TAX = 0.05, HARD_FLOOR_MS = 2000;
  var cfg = {
    autoPrice: 1, margin: 250, maxBuy: 0, sellAt: 0, markupPercent: 0, runMinutes: 0,
    searchMinMs: 4000, searchJitterMs: 3000, buyGapMinMs: 700, buyGapMaxMs: 1600,
    breakEvery: 25, breakMinMs: 60000, breakMaxMs: 180000, sessionBuyCap: 15, dailyBuyCap: 150
  };
  var running = false, phase = 'idle', stopReason = '', startTs = 0;
  var stats = { searches: 0, buys: 0, sinceBreak: 0, marketCheapest: null, marketMedian: null, lastCheapest: null };
  var capturedCriteria = null, capturedFromUrl = null, lastBuy = '';
  var OBS = {}, logLines = [];
  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function stepFor(p) { return p < 1000 ? 50 : p < 10000 ? 100 : p < 50000 ? 250 : p < 100000 ? 500 : 1000; }
  function roundStep(p) { var s = stepFor(p); return Math.max(150, Math.round(p / s) * s); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }

  function svc() { return window.services || (window.App && window.App.services) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }
  function haveSearch() { return !!(capturedCriteria || capturedFromUrl); }
  function priceOf(it) { return it && ((it._auction && it._auction.buyNowPrice) != null ? it._auction.buyNowPrice : (it.buyNowPrice != null ? it.buyNowPrice : (it.buyNow != null ? it.buyNow : null))); }
  function effectiveMax() { if (cfg.maxBuy > 0) return cfg.maxBuy; if (capturedCriteria && capturedCriteria.maxBuy > 0) return capturedCriteria.maxBuy; return 0; }
  function plannedSell() { var m = effectiveMax(); if (cfg.sellAt > 0) return cfg.sellAt; if (cfg.markupPercent > 0 && m) return roundStep(m * (1 + cfg.markupPercent / 100)); return 0; }
  function sellPriceFor(buy) { if (cfg.sellAt > 0) return cfg.sellAt; if (cfg.markupPercent > 0) return roundStep(buy * (1 + cfg.markupPercent / 100)); return 0; }
  function estProfit() { var m = effectiveMax(), s = plannedSell(); if (!s || !m) return null; return Math.floor(s * (1 - EA_TAX)) - m; }

  function emit() {
    var st = { v: '1', phase: phase, running: running, stopReason: stopReason, coins: coins(), haveSearch: haveSearch(),
      searches: stats.searches, buys: stats.buys, daily: dailyCount(), snipeUnder: effectiveMax(), sellAt: plannedSell(),
      profit: estProfit(), marketCheapest: stats.marketCheapest, marketMedian: stats.marketMedian, lastBuy: lastBuy,
      servicesReady: haveServices(), cfg: cfg, log: logLines.slice(0, 12) };
    try { console.log('[FUTSNIPE]' + JSON.stringify({ type: 'state', state: st })); } catch (e) {}
  }
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 40); emit(); }

  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    ['searchTransferMarket', 'search'].forEach(function (name) {
      if (typeof s.Item[name] !== 'function') return;
      var orig = s.Item[name].bind(s.Item);
      s.Item[name] = function (criteria) { try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; emit(); } } catch (e) {} return orig.apply(null, arguments); };
    });
    s.Item.__futWrapped = true;
  }
  var URLMAP = { num: 'count', start: 'start', type: 'type', maskedDefId: 'maskedDefId', cat: 'category', lev: 'level', maxb: 'maxBuy', minb: 'minBuy', micr: 'minBid', macr: 'maxBid', pos: 'preferredPosition', zone: 'zone', nat: 'nationality', leag: 'league', team: 'team', playStyle: 'playStyle', rarities: 'rarities' };
  function criteriaFromUrl(u) { try { var q = u.split('?')[1]; if (!q) return null; var o = { __fromUs: true }; q.split('&').forEach(function (kv) { var p = kv.split('='), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || ''), key = URLMAP[k]; if (!key) return; var n = Number(v); o[key] = (v !== '' && !isNaN(n)) ? n : v; }); return Object.keys(o).length > 1 ? o : null; } catch (e) { return null; } }
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
  function classify(resp, http) { var code = (resp && (resp.status || resp.error || (resp.data && resp.data.code))) || http || 0;
    if (code === 429) return { stop: true, msg: 'EA soft-ban (429) — wait, then restart' };
    if (code === 459 || code === 460 || /captcha/i.test(JSON.stringify(resp || ''))) return { stop: true, msg: 'Captcha — solve it, then restart' };
    if (code === 461 || code === 462 || code === 478) return { stop: false, msg: 'already gone' };
    if (code === 473) return { stop: false, msg: 'list full' };
    if (code === 494) return { stop: true, msg: 'account blocked' };
    return { stop: false, msg: 'request failed (' + code + ')' };
  }
  function doSearch() { return new Promise(function (resolve) {
    var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
    var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
    try { try { svc().Item.clearTransferMarketCache(); } catch (e) {}
      svc().Item.searchTransferMarket(buildCriteria(), 1).observe(OBS, function (sender, resp) { clearTimeout(to);
        var items = (resp && ((resp.data && resp.data.items) || (resp.response && resp.response.items))) || [];
        var ok = !!(resp && (resp.success === true || (resp.success == null && resp.status != null && resp.status < 400) || items.length));
        if (ok) finish({ ok: true, items: items }); else finish({ ok: false, items: [], err: classify(resp) });
      });
    } catch (e) { clearTimeout(to); finish({ ok: false, items: [], err: { msg: 'search error: ' + e } }); }
  }); }
  function doBuy(item, price) { return new Promise(function (resolve) {
    var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
    var to = setTimeout(function () { finish({ ok: false, err: { msg: 'bid timeout' } }); }, 15000);
    try { svc().Item.bid(item, price).observe(OBS, function (sender, resp) { clearTimeout(to); if (resp && resp.success) finish({ ok: true }); else finish({ ok: false, err: classify(resp) }); });
    } catch (e) { clearTimeout(to); finish({ ok: false, err: { msg: 'bid error: ' + e } }); }
  }); }
  function listWon(item, buy) { try { var sp = sellPriceFor(buy); if (sp > 0 && svc().Item.list) { var start = Math.max(150, sp - stepFor(sp)); svc().Item.list(item, start, sp).observe(OBS, function () {}); } } catch (e) {} }

  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () { var self = this;
      this.addEventListener('load', function () { try { var u = self.__u || '';
        if (/transfermarket\?/i.test(u) && (self.__m || 'GET').toUpperCase() === 'GET') { var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; emit(); } }
        if (/transfermarket|\/trade/i.test(u) && self.status === 429) { var r = self.getResponseHeader && self.getResponseHeader('Retry-After'); requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart'); }
      } catch (e) {} });
      return send.apply(this, arguments);
    };
  })();

  function requestStop(reason) { running = false; phase = 'idle'; stopReason = reason; log('STOP: ' + reason); }

  async function priceCheck(rounds) { var all = [];
    for (var k = 0; k < (rounds || 3) && phase === 'checking'; k++) { var r = await doSearch();
      if (r.ok) r.items.forEach(function (it) { var p = priceOf(it); if (p && p > 0) all.push(p); });
      else if ((r.err || {}).stop) { requestStop(r.err.msg); return null; }
      await sleep(Math.max(HARD_FLOOR_MS, rand(1500, 2600)));
    }
    if (!all.length) return null; all.sort(function (a, b) { return a - b; });
    var cheapest = all[0], median = all[Math.floor(all.length / 2)];
    stats.marketCheapest = cheapest; stats.marketMedian = median;
    log('price check: ' + all.length + ' BINs, cheapest ' + cheapest + ', median ' + median);
    return { cheapest: cheapest, median: median };
  }
  function applySuggestion(pc) { if (!pc) return false;
    var under = roundStep(Math.max(150, pc.cheapest - cfg.margin));
    if (under >= pc.cheapest) under = roundStep(pc.cheapest - stepFor(pc.cheapest));
    cfg.maxBuy = under; cfg.sellAt = cfg.markupPercent > 0 ? roundStep(under * (1 + cfg.markupPercent / 100)) : roundStep(pc.median);
    log('suggested: under ' + cfg.maxBuy + ', sell ' + cfg.sellAt + (estProfit() != null ? ', profit ' + estProfit() : '')); return true;
  }

  async function snipeLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      var r = await doSearch(); if (!running) return;
      stats.searches++; stats.sinceBreak++;
      if (!r.ok) { if ((r.err || {}).stop) return requestStop(r.err.msg); log('search: ' + ((r.err || {}).msg || '—')); }
      else {
        var max = effectiveMax(), cands = [];
        for (var i = 0; i < r.items.length; i++) { var p = priceOf(r.items[i]); if (p && p > 0) cands.push({ it: r.items[i], p: p }); }
        cands.sort(function (a, b) { return a.p - b.p; });
        stats.lastCheapest = cands.length ? cands[0].p : null;
        for (var j = 0; j < cands.length && running; j++) { var price = cands[j].p; if (price > max) break;
          var bal = coins(); if (bal != null && price > bal) { log('low coins for ' + price); continue; }
          var b = await doBuy(cands[j].it, price); if (!running) return;
          if (b.ok) { stats.buys++; addDaily(1); lastBuy = 'ok ' + price; log('BOUGHT ' + price + '  (' + stats.buys + ' this run)'); listWon(cands[j].it, price); }
          else { lastBuy = (b.err && b.err.msg) || 'failed'; if ((b.err || {}).stop) return requestStop(b.err.msg); }
          await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
          if (stats.buys >= cfg.sessionBuyCap) break;
        }
      }
      emit();
      if (stats.sinceBreak >= cfg.breakEvery) { stats.sinceBreak = 0; var br = rand(cfg.breakMinMs, cfg.breakMaxMs); phase = 'break'; log('break ' + Math.round(br / 1000) + 's'); for (var t = 0; t < br && running; t += 500) await sleep(500); phase = 'running'; emit(); }
      else { var w = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs)); for (var x = 0; x < w && running; x += 250) await sleep(250); }
    }
  }

  async function start(newCfg) {
    if (running || phase === 'checking') return;
    if (newCfg) Object.assign(cfg, newCfg);
    if (!haveServices()) { log('not ready — sign into the FUT Web App'); return; }
    if (!haveSearch()) { log('search once in the market first'); return; }
    if (!cfg.autoPrice && effectiveMax() <= 0) { log('set a Snipe-under price, or Auto price'); return; }
    phase = 'checking'; stopReason = ''; log('checking market price…'); emit();
    var pc = await priceCheck(3);
    if (phase !== 'checking') return;
    if (cfg.autoPrice) { if (!applySuggestion(pc)) { requestStop('price check found nothing'); return; } }
    if (effectiveMax() <= 0) { requestStop('no snipe price'); return; }
    running = true; phase = 'running'; startTs = Date.now(); stats.searches = 0; stats.buys = 0; stats.sinceBreak = 0;
    log('sniping under ' + effectiveMax() + (plannedSell() ? ', relist ' + plannedSell() : '')); emit();
    snipeLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stop() { if (running || phase === 'checking') requestStop('stopped'); }
  async function suggest() { if (running || phase === 'checking') return; if (!haveServices() || !haveSearch()) { log('sign in + search once first'); return; } phase = 'checking'; log('checking market price…'); emit(); var pc = await priceCheck(3); phase = 'idle'; if (pc) applySuggestion(pc); else log('no prices found'); emit(); }

  window.__FUTSNIPE = {
    start: start, stop: stop, suggest: suggest,
    setCfg: function (c) { if (c) Object.assign(cfg, c); emit(); },
    getState: function () { emit(); return true; }
  };

  (function boot(t) { if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } }
    emit(); if ((t || 0) < 600) setTimeout(function () { boot((t || 0) + 1); }, 1000); })(0);
})();
