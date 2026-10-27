// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      0.4.1
// @description  Self-run transfer-market sniper for the EA SPORTS FC Ultimate Team Web App, paced like a human. Replays your own search (captured two ways). Stops (never bypasses) on captcha / soft-ban. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * HOW TO USE
 *   1. FUT Web App > Transfer Market > Search: set filters + Max Buy Now, tap SEARCH.
 *   2. The panel's "Your search" flips to captured ✓.
 *   3. Tap TEST SEARCH (no buying) to confirm it finds items, then START.
 *
 * If it still won't buy, tap COPY DIAG (after a manual search) and paste the text back
 * to whoever is helping you — it lists exactly which services/fields were found.
 *
 * Automating the FUT market breaks EA's rules; accounts get banned / coin-wiped. Your
 * account, your risk. It paces itself and STOPS (never bypasses) on captcha/soft-ban.
 * Nothing leaves your device.
 */

(function () {
  'use strict';
  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;
  var VERSION = '0.4.1';

  var LS_KEY = 'futSnipe.settings.v2';
  var DEFAULTS = {
    maxBuy: 0, searchMinMs: 4000, searchJitterMs: 3000, buyGapMinMs: 700, buyGapMaxMs: 1600,
    breakEvery: 25, breakMinMs: 60000, breakMaxMs: 180000, sessionBuyCap: 15, dailyBuyCap: 150, listAfterBuy: false
  };
  var HARD_FLOOR_MS = 2000;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }

  var running = false, stopReason = '', blockMsg = '';
  var stats = { searches: 0, buys: 0, sinceBreak: 0, lastItems: 0, lastCheapest: null };
  var OBS = {};
  var capturedCriteria = null;    // real criteria object from the service call
  var capturedFromUrl = null;     // criteria rebuilt from the market request URL
  var lastMethod = '', sampleKeys = [], samplePrice = null, tmUrls = [];
  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function svc() { return window.services || (window.App && window.App.services) || (window.repositories && window) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }

  // Capture the criteria object whenever the app searches, across possible method names.
  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    ['searchTransferMarket', 'search'].forEach(function (name) {
      if (typeof s.Item[name] !== 'function') return;
      var orig = s.Item[name].bind(s.Item);
      s.Item[name] = function (criteria, page) {
        try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; lastMethod = name; render(); } } catch (e) {}
        return orig.apply(null, arguments);
      };
    });
    s.Item.__futWrapped = true;
  }

  // Fallback: rebuild criteria from the transfer-market request the app actually sent.
  var URLMAP = { num: 'count', start: 'start', type: 'type', maskedDefId: 'maskedDefId', cat: 'category', lev: 'level',
    maxb: 'maxBuy', minb: 'minBuy', micr: 'minBid', macr: 'maxBid', pos: 'preferredPosition', zone: 'zone',
    nat: 'nationality', leag: 'league', team: 'team', playStyle: 'playStyle', rarities: 'rarities' };
  function criteriaFromUrl(u) {
    try {
      var q = u.split('?')[1]; if (!q) return null; var o = { __fromUs: true };
      q.split('&').forEach(function (kv) {
        var p = kv.split('='), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || '');
        var key = URLMAP[k]; if (!key) return; var n = Number(v); o[key] = (v !== '' && !isNaN(n)) ? n : v;
      });
      return Object.keys(o).length > 1 ? o : null;
    } catch (e) { return null; }
  }

  // The Web App's search DAO needs a real UTSearchCriteriaDTO instance (as the
  // extension uses: `new UTSearchCriteriaDTO; n.maxBuy=…`). A plain object is rejected.
  function ctor() { return window.UTSearchCriteriaDTO || (window.App && window.App.UTSearchCriteriaDTO) || null; }
  function applyFields(target, src) { for (var k in src) { if (k !== '__fromUs' && src[k] !== undefined && src[k] !== '') { try { target[k] = src[k]; } catch (e) {} } } return target; }
  function buildCriteria() {
    var out;
    if (capturedCriteria) { out = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria); }
    else {
      var C = ctor();
      var src = capturedFromUrl || { type: 'player', category: 'any', count: 50, minBuy: 0, maxBuy: 0, minBid: 0, maxBid: 0 };
      out = C ? applyFields(new C(), src) : Object.assign({}, src);
    }
    if (cfg.maxBuy > 0) out.maxBuy = cfg.maxBuy;
    try { out.offset = 0; } catch (e) {}
    out.__fromUs = true;
    return out;
  }
  function haveSearch() { return !!(capturedCriteria || capturedFromUrl); }
  function priceOf(it) { return it && (it.buyNowPrice != null ? it.buyNowPrice : (it.buyNow != null ? it.buyNow : (it._auction && it._auction.buyNowPrice))); }

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
      try {
        try { svc().Item.clearTransferMarketCache(); } catch (e) {}
        svc().Item.searchTransferMarket(buildCriteria(), 1).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          var items = (resp && ((resp.data && resp.data.items) || (resp.response && resp.response.items))) || [];
          var ok = !!(resp && (resp.success === true || (resp.success == null && resp.status != null && resp.status < 400) || items.length));
          if (ok) {
            if (items.length && !sampleKeys.length) { try { sampleKeys = Object.keys(items[0]); samplePrice = priceOf(items[0]); } catch (e) {} }
            finish({ ok: true, items: items });
          } else finish({ ok: false, items: [], err: classify(resp) });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, items: [], err: { msg: 'search error: ' + e } }); }
    });
  }

  function doBuy(item, price) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, err: { msg: 'bid timeout' } }); }, 15000);
      try {
        svc().Item.bid(item, price).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          if (resp && resp.success) finish({ ok: true }); else finish({ ok: false, err: classify(resp) });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, err: { msg: 'bid error: ' + e } }); }
    });
  }

  function listWon(item) { try { if (cfg.listAfterBuy && svc().Item.list) { var p = priceOf(item); if (p) svc().Item.list(item, Math.max(150, item.startingBid || p), p).observe(OBS, function () {}); } } catch (e) {} }

  // ---- hook the page's own traffic: stop on 429, and learn the real search URL ----
  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try {
          var u = self.__u || '';
          if (/transfermarket\?/i.test(u) && (self.__m || 'GET').toUpperCase() === 'GET') {
            tmUrls.unshift(u); tmUrls = tmUrls.slice(0, 5);
            var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; render(); }
          }
          if (/transfermarket|\/trade/i.test(u) && self.status === 429) {
            var r = self.getResponseHeader && self.getResponseHeader('Retry-After');
            requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart');
          }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();

  function requestStop(reason) { if (!running) return; running = false; stopReason = reason; log('STOP: ' + reason); render(); }

  async function testSearch() {
    blockMsg = '';
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; log(blockMsg); render(); return; }
    if (!haveSearch()) { blockMsg = 'Do a search in the market screen first.'; log(blockMsg); render(); return; }
    log('test search…');
    var r = await doSearch();
    if (r.ok) {
      var cheapest = null; r.items.forEach(function (it) { var p = priceOf(it); if (p && (cheapest == null || p < cheapest)) cheapest = p; });
      stats.lastItems = r.items.length; stats.lastCheapest = cheapest;
      log('found ' + r.items.length + ' items' + (cheapest != null ? ', cheapest BIN ' + cheapest : ', but no readable price — tap Copy diag'));
    } else { log('no results: ' + (r.err && r.err.msg)); }
    render();
  }

  async function loop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      var r = await doSearch(); if (!running) return;
      stats.searches++; stats.sinceBreak++; stats.lastItems = r.ok ? r.items.length : 0;
      if (!r.ok) { if ((r.err || {}).stop) return requestStop(r.err.msg); log('search: ' + ((r.err || {}).msg || '—')); }
      else {
        var cheapest = null, priced = 0;
        for (var i = 0; i < r.items.length && running; i++) {
          var it = r.items[i], price = priceOf(it);
          if (!price || price <= 0) continue; priced++;
          if (cheapest == null || price < cheapest) cheapest = price;
          if (cfg.maxBuy > 0 && price > cfg.maxBuy) continue;
          var bal = coins(); if (bal != null && price > bal) { log('skip: low coins'); continue; }
          var b = await doBuy(it, price); if (!running) return;
          if (b.ok) { stats.buys++; addDaily(1); log('BOUGHT ' + price + '  (session ' + stats.buys + ', today ' + dailyCount() + ')'); listWon(it); }
          else if ((b.err || {}).stop) return requestStop(b.err.msg);
          await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
          if (stats.buys >= cfg.sessionBuyCap) break;
        }
        stats.lastCheapest = cheapest;
        if (r.items.length && priced === 0) log('search ok but 0 items had a readable price — tap Copy diag');
      }
      render();
      if (stats.sinceBreak >= cfg.breakEvery) { stats.sinceBreak = 0; var br = rand(cfg.breakMinMs, cfg.breakMaxMs); log('break ' + Math.round(br / 1000) + 's'); for (var t = 0; t < br && running; t += 500) await sleep(500); }
      else { var wait = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs)); for (var w = 0; w < wait && running; w += 250) await sleep(250); }
    }
  }

  function start() {
    blockMsg = '';
    if (running) return;
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; log(blockMsg); render(); return; }
    if (!haveSearch()) { blockMsg = 'Do a search in the market screen first, then Start.'; log(blockMsg); render(); return; }
    running = true; stopReason = ''; stats.searches = 0; stats.buys = 0; stats.sinceBreak = 0;
    log('started. coins: ' + (coins() != null ? coins() : '?'));
    render(); loop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stop() { if (running) requestStop('stopped by you'); }

  function diag() {
    var s = svc(), I = s && s.Item;
    var d = {
      version: VERSION,
      servicesFound: !!s,
      itemMethods: I ? ['searchTransferMarket', 'search', 'bid', 'list', 'clearTransferMarketCache'].filter(function (m) { return typeof I[m] === 'function'; }) : [],
      criteriaCtor: !!ctor(),
      userReadable: coins() != null,
      capturedCriteria: !!capturedCriteria, capturedCriteriaKeys: capturedCriteria ? Object.keys(capturedCriteria) : [],
      capturedFromUrl: !!capturedFromUrl, capturedFromUrlKeys: capturedFromUrl ? Object.keys(capturedFromUrl) : [],
      lastSearchMethod: lastMethod, lastItemCount: stats.lastItems, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice,
      recentMarketUrls: tmUrls
    };
    var text = 'FUT Snipe diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied to clipboard'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }

  // ---------- UI ----------
  var logLines = [];
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); try { console.debug('[FUT Snipe]', m); } catch (e) {} }

  var CSS =
    '#fs-panel{position:fixed;top:12px;right:12px;z-index:2147483647;width:300px;max-width:92vw;font:13px/1.45 -apple-system,system-ui,"SF Pro Text",sans-serif;color:#eef1f5;background:#14171c;border:1px solid #2a2f37;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.55);overflow:hidden}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;background:linear-gradient(180deg,#1b1f26,#171a20);border-bottom:1px solid #262b33}' +
    '#fs-head b{font-size:14px}#fs-head .dot{font-size:11px;color:#8b94a3}' +
    '#fs-min{background:#232832;color:#aeb6c2;border:0;border-radius:8px;width:28px;height:28px;font-size:16px}' +
    '#fs-body{padding:12px 13px}' +
    '.fs-card{background:#1b1f26;border:1px solid #262b33;border-radius:10px;padding:10px 11px;margin-bottom:10px}' +
    '.fs-stat{display:flex;justify-content:space-between;font-size:12px;color:#aeb6c2;margin:2px 0}.fs-stat b{color:#eef1f5;font-weight:600}' +
    '.fs-hint{font-size:11.5px;color:#8b94a3;margin:0 0 10px}' +
    '.fs-row{display:flex;gap:8px;margin-top:8px}' +
    '.fs-btn{flex:1;border:0;border-radius:10px;padding:11px 8px;font-size:14px;font-weight:600;color:#fff}' +
    '#fs-start{background:#1f9d57}#fs-stop{background:#b5363a}#fs-test{background:#2b63c4}#fs-diag{background:#3a414c}' +
    '.fs-sec{margin-top:4px}.fs-sec summary{cursor:pointer;color:#aeb6c2;font-size:12px;padding:6px 0;list-style:none}.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"\\2699\\FE0E  ";opacity:.7}' +
    '.fs-f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0;font-size:12px;color:#c4ccd6}' +
    '.fs-f input{background:#0f1216;border:1px solid #2a2f37;color:#eef1f5;border-radius:7px;padding:6px 7px;font-size:13px}.fs-f input[type=number]{width:92px}' +
    '#fs-status{font-size:12px;font-weight:600;margin-bottom:8px}' +
    '#fs-block{font-size:11.5px;color:#e78b8e;margin:0 0 8px;min-height:0}' +
    '#fs-log{margin:8px 0 0;max-height:120px;overflow:auto;white-space:pre-wrap;color:#8b94a3;font-size:11px;line-height:1.5}';

  function f(label, key, type) { var v = type === 'checkbox' ? (cfg[key] ? 'checked' : '') : 'value="' + cfg[key] + '"'; return '<label class="fs-f"><span>' + label + '</span><input data-k="' + key + '" type="' + (type || 'number') + '" ' + v + '></label>'; }

  function buildUI() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'fs-panel';
    el.innerHTML =
      '<div id="fs-head"><div><b>⚽ FUT Snipe</b> <span style="opacity:.55;font-size:10.5px">v' + VERSION + '</span> <span class="dot" id="fs-dot">idle</span></div><button id="fs-min">–</button></div>' +
      '<div id="fs-body">' +
        '<div id="fs-status"></div><div id="fs-block"></div>' +
        '<p class="fs-hint">1) In the market screen set filters + Max Buy Now and tap <b>Search</b>. 2) Return here, tap <b>Test search</b>, then <b>Start</b>.</p>' +
        '<div class="fs-card">' +
          '<div class="fs-stat"><span>Your search</span><b id="fs-cap">not captured</b></div>' +
          '<div class="fs-stat"><span>Coins</span><b id="fs-coins">—</b></div>' +
          '<div class="fs-stat"><span>Last search</span><b id="fs-last">—</b></div>' +
          '<div class="fs-stat"><span>Bought (session / today)</span><b id="fs-buys">0 / 0</b></div>' +
        '</div>' +
        '<div class="fs-row"><button class="fs-btn" id="fs-test">Test search</button><button class="fs-btn" id="fs-diag">Copy diag</button></div>' +
        '<div class="fs-row"><button class="fs-btn" id="fs-start">Start</button><button class="fs-btn" id="fs-stop">Stop</button></div>' +
        '<details class="fs-sec"><summary>Settings</summary>' +
          f('Max Buy Now (0 = use filter)', 'maxBuy') + f('Search gap min (ms)', 'searchMinMs') + f('Search gap jitter (ms)', 'searchJitterMs') +
          f('Break every N searches', 'breakEvery') + f('Session buy cap', 'sessionBuyCap') + f('Daily buy cap', 'dailyBuyCap') + f('List won items', 'listAfterBuy', 'checkbox') +
        '</details><pre id="fs-log"></pre>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return; cfg[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' ? Number(e.target.value) : e.target.value); save(); });
    el.querySelector('#fs-test').onclick = testSearch;
    el.querySelector('#fs-diag').onclick = diag;
    el.querySelector('#fs-start').onclick = start;
    el.querySelector('#fs-stop').onclick = stop;
    el.querySelector('#fs-min').onclick = function () { var b = document.getElementById('fs-body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
    render();
  }

  function render() {
    var $ = function (id) { return document.getElementById(id); }; if (!$('fs-status')) return;
    $('fs-dot').textContent = running ? 'running' : (stopReason ? 'stopped' : 'idle');
    $('fs-dot').style.color = running ? '#53d08a' : (stopReason ? '#e78b8e' : '#8b94a3');
    $('fs-status').textContent = running ? '● Running — searches ' + stats.searches : (stopReason ? '■ ' + stopReason : (haveServices() ? '○ Ready' : '○ Open the FUT Web App & sign in'));
    $('fs-status').style.color = running ? '#53d08a' : (stopReason ? '#e78b8e' : '#aeb6c2');
    $('fs-block').textContent = blockMsg || '';
    $('fs-cap').textContent = capturedCriteria ? 'captured ✓' : (capturedFromUrl ? 'captured (url) ✓' : 'not captured');
    $('fs-cap').style.color = haveSearch() ? '#53d08a' : '#e7c37a';
    $('fs-coins').textContent = coins() != null ? coins().toLocaleString() : '—';
    $('fs-last').textContent = stats.lastItems + ' items' + (stats.lastCheapest != null ? ', cheapest ' + stats.lastCheapest : '');
    $('fs-buys').textContent = stats.buys + ' / ' + dailyCount();
  }

  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) buildUI();
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
