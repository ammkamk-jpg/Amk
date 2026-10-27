// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      0.6.0
// @description  Self-run transfer-market sniper for the EA SPORTS FC Ultimate Team Web App. Replays your own search, price-checks, snipes under your price and (optionally) re-lists. Paces like a human; stops (never bypasses) on captcha/soft-ban. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Not affiliated with EA or FUT Simple Trader. Styled similarly, but it is its own tool
 * and uses no third-party server. Automating the FUT market breaks EA's rules; accounts
 * get banned / coin-wiped. Your account, your risk. It paces itself and STOPS (never
 * bypasses) on captcha / soft-ban. Nothing leaves your device.
 *
 * USE: In the FUT market screen set filters + Max Buy Now and tap SEARCH once (so it
 * captures a real search). Then open this panel, set your Snipe-under price, and tap
 * "Check price & Start".
 */

(function () {
  'use strict';
  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;
  var VERSION = '0.6.0';

  // ---------- settings ----------
  var LS_KEY = 'futSnipe.settings.v3';
  var DEFAULTS = {
    maxBuy: 0,        // snipe under this price (0 = use the Max Buy Now from your FUT filter)
    sellAt: 0,        // re-list won cards at this price (0 = keep them, no relist)
    runMinutes: 0,    // auto-stop after N minutes (0 = no time limit)
    searchMinMs: 4000, searchJitterMs: 3000, buyGapMinMs: 700, buyGapMaxMs: 1600,
    breakEvery: 25, breakMinMs: 60000, breakMaxMs: 180000,
    sessionBuyCap: 15, dailyBuyCap: 150
  };
  var HARD_FLOOR_MS = 2000, EA_TAX = 0.05;
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }

  // ---------- state ----------
  var running = false, stopReason = '', blockMsg = '', phase = 'idle', startTs = 0;
  var stats = { searches: 0, buys: 0, sinceBreak: 0, lastItems: 0, lastCheapest: null, marketPrice: null };
  var OBS = {};
  var capturedCriteria = null, capturedFromUrl = null;
  var lastMethod = '', sampleKeys = [], samplePrice = null, tmUrls = [], lastBuy = '';
  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------- EA services (unchanged engine) ----------
  function svc() { return window.services || (window.App && window.App.services) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }

  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    ['searchTransferMarket', 'search'].forEach(function (name) {
      if (typeof s.Item[name] !== 'function') return;
      var orig = s.Item[name].bind(s.Item);
      s.Item[name] = function (criteria) { try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; lastMethod = name; render(); } } catch (e) {} return orig.apply(null, arguments); };
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
  function estProfit() { var m = effectiveMax(); if (!cfg.sellAt || !m) return null; return Math.floor(cfg.sellAt * (1 - EA_TAX)) - m; }

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
  function listWon(item) { try { if (cfg.sellAt > 0 && svc().Item.list) { var start = Math.max(150, cfg.sellAt - Math.max(50, Math.round(cfg.sellAt * 0.02))); svc().Item.list(item, start, cfg.sellAt).observe(OBS, function () {}); } } catch (e) {} }

  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { var u = self.__u || '';
          if (/transfermarket\?/i.test(u) && (self.__m || 'GET').toUpperCase() === 'GET') { tmUrls.unshift(u); tmUrls = tmUrls.slice(0, 5); var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; render(); } }
          if (/transfermarket|\/trade/i.test(u) && self.status === 429) { var r = self.getResponseHeader && self.getResponseHeader('Retry-After'); requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart'); }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();

  function requestStop(reason) { running = false; phase = 'idle'; stopReason = reason; log('STOP: ' + reason); render(); }

  // price check: a few searches to find the current cheapest buy-now, no buying
  async function priceCheck(rounds) {
    var best = null;
    for (var k = 0; k < (rounds || 3) && phase === 'checking'; k++) {
      var r = await doSearch();
      if (r.ok) r.items.forEach(function (it) { var p = priceOf(it); if (p && (best == null || p < best)) best = p; });
      else if ((r.err || {}).stop) { requestStop(r.err.msg); return null; }
      await sleep(Math.max(HARD_FLOOR_MS, rand(1500, 2600)));
    }
    if (best != null) { stats.marketPrice = best; log('market ~ ' + best); }
    return best;
  }

  async function snipeLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      var r = await doSearch(); if (!running) return;
      stats.searches++; stats.sinceBreak++; stats.lastItems = r.ok ? r.items.length : 0;
      if (!r.ok) { if ((r.err || {}).stop) return requestStop(r.err.msg); log('search: ' + ((r.err || {}).msg || '—')); }
      else {
        var max = effectiveMax(), cands = [];
        for (var i = 0; i < r.items.length; i++) { var p = priceOf(r.items[i]); if (p && p > 0) cands.push({ it: r.items[i], p: p }); }
        cands.sort(function (a, b) { return a.p - b.p; });
        stats.lastCheapest = cands.length ? cands[0].p : null;
        if (r.items.length && !cands.length) log('found items but no readable price — Copy diag');
        for (var j = 0; j < cands.length && running; j++) {
          var price = cands[j].p; if (price > max) break;
          var bal = coins(); if (bal != null && price > bal) { log('not enough coins for ' + price); continue; }
          var b = await doBuy(cands[j].it, price); if (!running) return;
          if (b.ok) { stats.buys++; addDaily(1); lastBuy = 'ok ' + price; log('BOUGHT ' + price + '  (' + stats.buys + ' this run)'); listWon(cands[j].it); }
          else { lastBuy = (b.err && b.err.msg) || 'failed'; if ((b.err || {}).stop) return requestStop(b.err.msg); }
          await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
          if (stats.buys >= cfg.sessionBuyCap) break;
        }
      }
      render();
      if (stats.sinceBreak >= cfg.breakEvery) { stats.sinceBreak = 0; var br = rand(cfg.breakMinMs, cfg.breakMaxMs); phase = 'break'; log('break ' + Math.round(br / 1000) + 's'); render(); for (var t = 0; t < br && running; t += 500) await sleep(500); phase = 'running'; render(); }
      else { var w = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs)); for (var x = 0; x < w && running; x += 250) await sleep(250); }
    }
  }

  async function startFlow() {
    blockMsg = '';
    if (running || phase === 'checking') return;
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return; }
    if (!haveSearch()) { blockMsg = 'Do a search in the market screen first (so it captures it).'; render(); return; }
    if (effectiveMax() <= 0) { blockMsg = 'Set a Snipe-under price (or Max Buy Now in your FUT filter).'; render(); return; }
    phase = 'checking'; stopReason = ''; render(); log('checking market price…');
    await priceCheck(3);
    if (phase !== 'checking') return; // stopped/cancelled during check
    running = true; phase = 'running'; startTs = Date.now(); stats.searches = 0; stats.buys = 0; stats.sinceBreak = 0;
    log('sniping under ' + effectiveMax() + (cfg.sellAt ? ', relist ' + cfg.sellAt : ''));
    render(); snipeLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stopAll() { if (running || phase === 'checking') requestStop('stopped by you'); }

  function diag() {
    var s = svc(), I = s && s.Item;
    var d = { version: VERSION, servicesFound: !!s, itemMethods: I ? ['searchTransferMarket', 'search', 'bid', 'list', 'clearTransferMarketCache'].filter(function (m) { return typeof I[m] === 'function'; }) : [], criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedFromUrl: !!capturedFromUrl, effectiveMax: effectiveMax(), sellAt: cfg.sellAt, estProfit: estProfit(), marketPrice: stats.marketPrice, lastBuy: lastBuy, lastSearchMethod: lastMethod, lastItemCount: stats.lastItems, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, recentMarketUrls: tmUrls };
    var text = 'FUT Snipe diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }

  // ---------- UI (dark + cyan, styled after the market overlays) ----------
  var logLines = [];
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); try { console.debug('[FUT Snipe]', m); } catch (e) {} }
  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }

  var CSS =
    '#fs-panel{position:fixed;top:12px;right:12px;z-index:2147483647;width:316px;max-width:93vw;font:13px/1.45 -apple-system,system-ui,"SF Pro Text",Roboto,sans-serif;color:#eaf0f6;background:#0f1620;border:1px solid #223041;border-radius:18px;box-shadow:0 14px 48px rgba(0,0,0,.6);overflow:hidden}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(180deg,#152030,#101722);border-bottom:1px solid #223041}' +
    '#fs-head .t{font-weight:800;letter-spacing:.3px;font-size:15px}#fs-head .v{opacity:.5;font-size:10px;margin-left:5px}' +
    '#fs-min{background:#1b2838;color:#9fb0c3;border:0;border-radius:9px;width:30px;height:30px;font-size:17px}' +
    '#fs-body{padding:13px 14px;max-height:78vh;overflow:auto}' +
    '.fs-tiles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px}' +
    '.fs-tile{background:#172231;border:1px solid #223041;border-radius:12px;padding:9px 8px;text-align:center}' +
    '.fs-tile .l{font-size:9.5px;letter-spacing:.6px;color:#7f93a8;text-transform:uppercase}.fs-tile .v{font-size:15px;font-weight:800;margin-top:2px}' +
    '.fs-plan{display:grid;grid-template-columns:1fr 1fr 1fr;background:#121c28;border:1px solid #223041;border-radius:14px;overflow:hidden;margin-bottom:12px}' +
    '.fs-plan .c{padding:11px 10px;border-right:1px solid #1d2a39}.fs-plan .c:last-child{border-right:0}' +
    '.fs-plan .l{font-size:9.5px;letter-spacing:.5px;color:#7f93a8;text-transform:uppercase}' +
    '.fs-plan .v{font-size:16px;font-weight:800;margin-top:3px}.fs-plan .v.g{color:#19e67d}.fs-plan .v.c2{color:#00CAF6}' +
    '.fs-rows{background:#141f2c;border:1px solid #223041;border-radius:14px;margin-bottom:12px;overflow:hidden}' +
    '.fs-r{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border-bottom:1px solid #1b2836}.fs-r:last-child{border-bottom:0}' +
    '.fs-r .lab{display:flex;align-items:center;gap:9px;color:#cdd8e4}.fs-r .ic{width:17px;text-align:center;opacity:.85}' +
    '.fs-r input{width:96px;background:#0c131b;border:1px solid #223041;color:#eaf0f6;border-radius:8px;padding:7px 8px;font-size:13px;text-align:right}' +
    '.fs-btn{width:100%;border:0;border-radius:13px;padding:14px;font-size:15px;font-weight:800;letter-spacing:.2px}' +
    '.fs-go{background:#00CAF6;color:#05222c}.fs-stop{background:#FF5D0B;color:#fff}' +
    '.fs-btn .sub{display:block;font-size:11px;font-weight:600;opacity:.8;margin-top:2px}' +
    '.fs-mini{display:flex;gap:8px;margin-top:9px}.fs-mini button{flex:1;background:#1b2838;color:#9fb0c3;border:0;border-radius:10px;padding:9px;font-size:12px;font-weight:600}' +
    '#fs-block{color:#ff9a6b;font-size:11.5px;margin:0 0 10px}' +
    '#fs-status{font-size:12px;color:#8ea0b5;margin:10px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:108px;overflow:auto;white-space:pre-wrap;color:#7f93a8;font-size:11px;line-height:1.5}' +
    '.fs-sec summary{cursor:pointer;color:#8ea0b5;font-size:12px;padding:4px 2px;list-style:none}.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"⚙︎ ";opacity:.7}';

  function row(ic, label, key) { return '<label class="fs-r"><span class="lab"><span class="ic">' + ic + '</span>' + label + '</span><input data-k="' + key + '" type="number" value="' + cfg[key] + '"></label>'; }

  function buildUI() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'fs-panel';
    el.innerHTML =
      '<div id="fs-head"><div><span class="t">⚡ FUT Snipe</span><span class="v">v' + VERSION + '</span></div><button id="fs-min">–</button></div>' +
      '<div id="fs-body">' +
        '<div id="fs-block"></div>' +
        '<div class="fs-tiles">' +
          '<div class="fs-tile"><div class="l">Coins</div><div class="v" id="fs-coins">—</div></div>' +
          '<div class="fs-tile"><div class="l">Search</div><div class="v" id="fs-cap2">—</div></div>' +
          '<div class="fs-tile"><div class="l">Bought</div><div class="v" id="fs-buys">0</div></div>' +
        '</div>' +
        '<div class="fs-plan">' +
          '<div class="c"><div class="l">Snipe under</div><div class="v c2" id="fs-p-max">—</div></div>' +
          '<div class="c"><div class="l">Sell at</div><div class="v" id="fs-p-sell">—</div></div>' +
          '<div class="c"><div class="l">Profit</div><div class="v g" id="fs-p-prof">—</div></div>' +
        '</div>' +
        '<div class="fs-rows">' +
          row('◎', 'Snipe under', 'maxBuy') +
          row('🏷️', 'Sell at (0 = keep)', 'sellAt') +
          row('⏱️', 'Run minutes (0 = ∞)', 'runMinutes') +
          row('🛑', 'Session buy cap', 'sessionBuyCap') +
        '</div>' +
        '<button class="fs-btn fs-go" id="fs-go"></button>' +
        '<div class="fs-mini"><button id="fs-test">Test search</button><button id="fs-diag">Copy diag</button></div>' +
        '<details class="fs-sec"><summary>Advanced</summary><div class="fs-rows" style="margin-top:8px">' +
          row('⚡', 'Search gap min (ms)', 'searchMinMs') + row('🎲', 'Search gap jitter (ms)', 'searchJitterMs') +
          row('☕', 'Break every N', 'breakEvery') + row('📅', 'Daily buy cap', 'dailyBuyCap') +
        '</div></details>' +
        '<div id="fs-status"></div><pre id="fs-log"></pre>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return; cfg[k] = Number(e.target.value) || 0; save(); render(); });
    el.querySelector('#fs-go').onclick = function () { if (running || phase === 'checking') stopAll(); else startFlow(); };
    el.querySelector('#fs-test').onclick = async function () { if (!haveServices()) { blockMsg = 'Open & sign into the FUT Web App.'; render(); return; } if (!haveSearch()) { blockMsg = 'Search once in the market screen first.'; render(); return; } log('test search…'); var r = await doSearch(); if (r.ok) { var c = null; r.items.forEach(function (it) { var p = priceOf(it); if (p && (c == null || p < c)) c = p; }); stats.lastItems = r.items.length; stats.lastCheapest = c; log('found ' + r.items.length + ' items' + (c != null ? ', cheapest ' + c : ', no readable price — Copy diag')); } else log('no results: ' + (r.err && r.err.msg)); render(); };
    el.querySelector('#fs-diag').onclick = diag;
    el.querySelector('#fs-min').onclick = function () { var b = document.getElementById('fs-body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
    render();
  }

  function render() {
    var $ = function (id) { return document.getElementById(id); }; if (!$('fs-body')) return;
    $('fs-coins').textContent = coins() != null ? (coins() >= 1e6 ? (coins() / 1e6).toFixed(2) + 'M' : fmt(coins())) : '—';
    $('fs-cap2').textContent = haveSearch() ? '✓' : '—';
    $('fs-cap2').style.color = haveSearch() ? '#19e67d' : '#e7c37a';
    $('fs-buys').textContent = stats.buys;
    var m = effectiveMax();
    $('fs-p-max').textContent = m ? fmt(m) : '—';
    $('fs-p-sell').textContent = cfg.sellAt ? fmt(cfg.sellAt) : '—';
    var pr = estProfit(); $('fs-p-prof').textContent = pr == null ? '—' : (pr > 0 ? '+' + fmt(pr) : fmt(pr));
    $('fs-block').textContent = blockMsg || '';
    var go = $('fs-go'), busy = running || phase === 'checking';
    go.className = 'fs-btn ' + (busy ? 'fs-stop' : 'fs-go');
    go.innerHTML = busy
      ? (phase === 'checking' ? 'Stop price check' : 'Stop sniping') + '<span class="sub">' + (phase === 'checking' ? 'checking market prices…' : 'bought ' + stats.buys + ' · ' + stats.searches + ' searches') + '</span>'
      : 'Check price &amp; Start' + '<span class="sub">' + (m ? 'snipes under ' + fmt(m) + (estProfit() != null ? ' · profit ' + (estProfit() > 0 ? '+' : '') + fmt(estProfit()) : '') : 'set a snipe-under price') + '</span>';
    $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'checking' ? 'Checking market prices…' : phase === 'break' ? 'Taking a short break…' : running ? '● Running' : haveServices() ? (haveSearch() ? 'Ready' : 'Search once in the market, then Start') : 'Open the FUT Web App & sign in');
    $('fs-status').style.color = running || phase === 'checking' ? '#19e67d' : stopReason ? '#ff9a6b' : '#8ea0b5';
  }

  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) buildUI();
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
