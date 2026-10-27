// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      0.2.0
// @description  Self-run transfer-market sniper for the EA SPORTS FC Ultimate Team Web App, paced like a human. Repeats your own in-app search. Stops (never bypasses) on captcha / soft-ban. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * HOW TO USE (read this — it's why v0.1 didn't buy)
 * --------------------------------------------------
 * The Web App only accepts a real search-criteria object that it built itself. A
 * hand-made one is ignored, so v0.1 searched and found nothing. v0.2 instead REPEATS
 * your own search:
 *
 *   1. In the FUT Web App, go to Transfer Market > Search, set your filters and your
 *      "Max. Buy Now" price, and tap SEARCH once yourself.
 *   2. The panel's status flips to "captured your search ✓".
 *   3. Tap START. It repeats that exact search on a human-paced loop and buys every
 *      result at or under your Max Buy Now, until a cap or a stop signal.
 *
 * Use TEST SEARCH first: it runs one search and tells you how many items came back
 * and the cheapest buy-now — with no buying — so you can confirm it's wired up.
 *
 * SAFETY / FAIR USE
 * -----------------
 * Automating the FUT market breaks EA's User Agreement; accounts get transfer-banned,
 * coin-wiped, or permanently banned. This runs on your account at your own risk. It
 * paces itself (random delays with a hard floor, long breaks, per-session and per-day
 * caps) and it STOPS — never bypasses — when EA shows a captcha or a soft-ban. Don't
 * remove those limits. No data ever leaves your device.
 */

(function () {
  'use strict';
  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;

  // ---------- settings (saved on this device) ----------
  var LS_KEY = 'futSnipe.settings.v2';
  var DEFAULTS = {
    maxBuy: 0,            // 0 = trust the price filter from your in-app search
    searchMinMs: 4000,    // minimum gap between search cycles
    searchJitterMs: 3000, // plus a random 0..this each cycle
    buyGapMinMs: 700, buyGapMaxMs: 1600,
    breakEvery: 25,       // searches before a long break
    breakMinMs: 60000, breakMaxMs: 180000,
    sessionBuyCap: 15,    // stop after this many buys per Start
    dailyBuyCap: 150,     // stop after this many buys per calendar day
    listAfterBuy: false
  };
  var HARD_FLOOR_MS = 2000;

  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = load();

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() { try { var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}'); return d.date === today() ? (d.n | 0) : 0; } catch (e) { return 0; } }
  function addDaily(n) { try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: dailyCount() + n })); } catch (e) {} }

  // ---------- run state ----------
  var running = false, stopReason = '', lastInfo = '';
  var stats = { searches: 0, buys: 0, sinceBreak: 0, lastItems: 0, lastCheapest: null };
  var OBS = {};
  var capturedCriteria = null;    // the last criteria the Web App itself searched with
  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------- EA services ----------
  function svc() { return window.services || (window.App && window.App.services) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }

  // Capture the criteria object whenever the Web App (or we) search, so we can replay
  // a real, accepted search. This is the key to actually finding items.
  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    var orig = s.Item.searchTransferMarket.bind(s.Item);
    s.Item.searchTransferMarket = function (criteria, page) {
      try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; render(); } } catch (e) {}
      return orig(criteria, page);
    };
    s.Item.__futWrapped = true;
  }

  // Build the criteria to search with: clone the captured one (keeps its prototype and
  // the filters you set), optionally tightening Max Buy Now. Falls back to a plain
  // object only if you never searched manually.
  function buildCriteria() {
    if (capturedCriteria) {
      var c = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria);
      if (cfg.maxBuy && cfg.maxBuy > 0) c.maxBuy = cfg.maxBuy;
      c.__fromUs = true;
      return c;
    }
    return { type: 'player', category: 'any', count: 50, start: 0, minBuy: 0, maxBuy: cfg.maxBuy || 0, minBid: 0, maxBid: 0, __fromUs: true };
  }

  function classify(resp, http) {
    var code = (resp && (resp.status || resp.error || (resp.data && resp.data.code))) || http || 0;
    if (code === 429) return { stop: true, msg: 'EA soft-ban (429) — wait, then restart' };
    if (code === 459 || code === 460 || /captcha/i.test(JSON.stringify(resp || ''))) return { stop: true, msg: 'Captcha — solve it in the app, then restart' };
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
          if (resp && resp.success) finish({ ok: true, items: (resp.data && resp.data.items) || [] });
          else finish({ ok: false, items: [], err: classify(resp) });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, items: [], err: { msg: 'search error: ' + e } }); }
    });
  }

  function doBuy(item) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, err: { msg: 'bid timeout' } }); }, 15000);
      try {
        svc().Item.bid(item, item.buyNowPrice).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          if (resp && resp.success) finish({ ok: true }); else finish({ ok: false, err: classify(resp) });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, err: { msg: 'bid error: ' + e } }); }
    });
  }

  function listWon(item) {
    try { if (cfg.listAfterBuy && svc().Item.list && item.buyNowPrice) svc().Item.list(item, Math.max(150, item.startingBid || item.buyNowPrice), item.buyNowPrice).observe(OBS, function () {}); } catch (e) {}
  }

  // ---------- safety net: stop on 429 seen on the page's own traffic ----------
  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          if (/transfermarket|\/trade/i.test(this.__u || '') && this.status === 429) {
            var r = this.getResponseHeader && this.getResponseHeader('Retry-After');
            requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart');
          }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();

  // ---------- loop ----------
  function requestStop(reason) { if (!running) return; running = false; stopReason = reason; log('STOP: ' + reason); render(); }

  async function testSearch() {
    if (!haveServices()) { log('Open the FUT Web App and sign in first.'); return; }
    if (!capturedCriteria) { log('Run a search in the FUT market screen first, then Test.'); return; }
    log('test search…');
    var r = await doSearch();
    if (r.ok) {
      var cheapest = r.items.reduce(function (m, it) { return (it.buyNowPrice && (m == null || it.buyNowPrice < m)) ? it.buyNowPrice : m; }, null);
      stats.lastItems = r.items.length; stats.lastCheapest = cheapest;
      log('found ' + r.items.length + ' items' + (cheapest != null ? ', cheapest BIN ' + cheapest : ''));
    } else { log('no results: ' + (r.err && r.err.msg)); }
    render();
  }

  async function loop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');

      var r = await doSearch(); if (!running) return;
      stats.searches++; stats.sinceBreak++; stats.lastItems = r.ok ? r.items.length : 0;

      if (!r.ok) { var c = r.err || {}; if (c.stop) return requestStop(c.msg); log('search: ' + (c.msg || '—')); }
      else {
        var cheapest = null;
        for (var i = 0; i < r.items.length && running; i++) {
          var it = r.items[i], price = it && it.buyNowPrice;
          if (!price || price <= 0) continue;
          if (cheapest == null || price < cheapest) cheapest = price;
          if (cfg.maxBuy && cfg.maxBuy > 0 && price > cfg.maxBuy) continue;
          var bal = coins(); if (bal != null && price > bal) { log('skip: low coins'); continue; }
          var b = await doBuy(it); if (!running) return;
          if (b.ok) { stats.buys++; addDaily(1); log('BOUGHT ' + price + '  (session ' + stats.buys + ', today ' + dailyCount() + ')'); listWon(it); }
          else { var ce = b.err || {}; if (ce.stop) return requestStop(ce.msg); }
          await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
          if (stats.buys >= cfg.sessionBuyCap) break;
        }
        stats.lastCheapest = cheapest;
      }
      render();

      if (stats.sinceBreak >= cfg.breakEvery) {
        stats.sinceBreak = 0; var br = rand(cfg.breakMinMs, cfg.breakMaxMs); log('break ' + Math.round(br / 1000) + 's');
        for (var t = 0; t < br && running; t += 500) await sleep(500);
      } else {
        var wait = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs));
        for (var w = 0; w < wait && running; w += 250) await sleep(250);
      }
    }
  }

  function start() {
    if (running) return;
    if (!haveServices()) { log('Trading services not ready — open the FUT Web App and sign in.'); return; }
    if (!capturedCriteria) { log('First run a search in the FUT market screen, then Start.'); return; }
    running = true; stopReason = ''; stats.searches = 0; stats.buys = 0; stats.sinceBreak = 0;
    log('started. coins: ' + (coins() != null ? coins() : '?'));
    render(); loop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stop() { if (running) requestStop('stopped by you'); }

  // ---------- UI ----------
  var logLines = [];
  function log(m) {
    logLines.unshift(new Date().toLocaleTimeString().replace(/:\d\d /, ' ') + '  ' + m); logLines = logLines.slice(0, 30);
    try { console.debug('[FUT Snipe]', m); } catch (e) {}
    var box = document.getElementById('fs-log'); if (box) box.textContent = logLines.join('\n');
  }

  var CSS =
    '#fs-panel{position:fixed;top:12px;right:12px;z-index:2147483647;width:300px;max-width:92vw;' +
    'font:13px/1.45 -apple-system,system-ui,"SF Pro Text",sans-serif;color:#eef1f5;background:#14171c;' +
    'border:1px solid #2a2f37;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.55);overflow:hidden}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;background:linear-gradient(180deg,#1b1f26,#171a20);border-bottom:1px solid #262b33}' +
    '#fs-head b{font-size:14px;letter-spacing:.2px}#fs-head .dot{font-size:11px;color:#8b94a3}' +
    '#fs-min{background:#232832;color:#aeb6c2;border:0;border-radius:8px;width:28px;height:28px;font-size:16px}' +
    '#fs-body{padding:12px 13px}' +
    '.fs-card{background:#1b1f26;border:1px solid #262b33;border-radius:10px;padding:10px 11px;margin-bottom:10px}' +
    '.fs-stat{display:flex;justify-content:space-between;font-size:12px;color:#aeb6c2;margin:2px 0}' +
    '.fs-stat b{color:#eef1f5;font-weight:600}' +
    '.fs-hint{font-size:11.5px;color:#8b94a3;margin:0 0 10px}' +
    '.fs-row{display:flex;gap:8px;margin-top:8px}' +
    '.fs-btn{flex:1;border:0;border-radius:10px;padding:11px 8px;font-size:14px;font-weight:600;color:#fff}' +
    '#fs-start{background:#1f9d57}#fs-stop{background:#b5363a}#fs-test{background:#2b63c4;width:100%;margin-top:8px}' +
    '.fs-sec{margin-top:4px}.fs-sec summary{cursor:pointer;color:#aeb6c2;font-size:12px;padding:6px 0;list-style:none}' +
    '.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"⚙︎ ";opacity:.7}' +
    '.fs-f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0;font-size:12px;color:#c4ccd6}' +
    '.fs-f input[type=number]{width:92px}.fs-f input{background:#0f1216;border:1px solid #2a2f37;color:#eef1f5;border-radius:7px;padding:6px 7px;font-size:13px}' +
    '#fs-status{font-size:12px;font-weight:600;margin-bottom:8px}' +
    '#fs-log{margin:8px 0 0;max-height:120px;overflow:auto;white-space:pre-wrap;color:#8b94a3;font-size:11px;line-height:1.5}';

  function f(label, key, type) {
    var v = type === 'checkbox' ? (cfg[key] ? 'checked' : '') : 'value="' + cfg[key] + '"';
    return '<label class="fs-f"><span>' + label + '</span><input data-k="' + key + '" type="' + (type || 'number') + '" ' + v + '></label>';
  }

  function buildUI() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'fs-panel';
    el.innerHTML =
      '<div id="fs-head"><div><b>⚽ FUT Snipe</b> <span class="dot" id="fs-dot">idle</span></div><button id="fs-min">–</button></div>' +
      '<div id="fs-body">' +
        '<div id="fs-status"></div>' +
        '<p class="fs-hint">1) In the market screen set filters + Max Buy Now and tap <b>Search</b> once. 2) Come back and tap <b>Start</b>.</p>' +
        '<div class="fs-card">' +
          '<div class="fs-stat"><span>Your search</span><b id="fs-cap">not captured</b></div>' +
          '<div class="fs-stat"><span>Coins</span><b id="fs-coins">—</b></div>' +
          '<div class="fs-stat"><span>Last search</span><b id="fs-last">—</b></div>' +
          '<div class="fs-stat"><span>Bought (session / today)</span><b id="fs-buys">0 / 0</b></div>' +
        '</div>' +
        '<button class="fs-btn" id="fs-test">Test search (no buying)</button>' +
        '<div class="fs-row"><button class="fs-btn" id="fs-start">Start</button><button class="fs-btn" id="fs-stop">Stop</button></div>' +
        '<details class="fs-sec"><summary>Settings</summary>' +
          f('Max Buy Now (0 = use filter)', 'maxBuy') +
          f('Search gap min (ms)', 'searchMinMs') +
          f('Search gap jitter (ms)', 'searchJitterMs') +
          f('Break every N searches', 'breakEvery') +
          f('Session buy cap', 'sessionBuyCap') +
          f('Daily buy cap', 'dailyBuyCap') +
          f('List won items', 'listAfterBuy', 'checkbox') +
        '</details>' +
        '<pre id="fs-log"></pre>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return;
      cfg[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' ? Number(e.target.value) : e.target.value); save();
    });
    el.querySelector('#fs-test').onclick = testSearch;
    el.querySelector('#fs-start').onclick = start;
    el.querySelector('#fs-stop').onclick = stop;
    el.querySelector('#fs-min').onclick = function () { var b = document.getElementById('fs-body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
    render();
  }

  function render() {
    var $ = function (id) { return document.getElementById(id); };
    if (!$('fs-status')) return;
    $('fs-dot').textContent = running ? 'running' : (stopReason ? 'stopped' : 'idle');
    $('fs-dot').style.color = running ? '#53d08a' : (stopReason ? '#e78b8e' : '#8b94a3');
    $('fs-status').textContent = running ? '● Running — searches ' + stats.searches : (stopReason ? '■ ' + stopReason : (haveServices() ? '○ Ready' : '○ Open the FUT Web App & sign in'));
    $('fs-status').style.color = running ? '#53d08a' : (stopReason ? '#e78b8e' : '#aeb6c2');
    $('fs-cap').textContent = capturedCriteria ? 'captured ✓' : 'not captured';
    $('fs-cap').style.color = capturedCriteria ? '#53d08a' : '#e7c37a';
    $('fs-coins').textContent = coins() != null ? coins().toLocaleString() : '—';
    $('fs-last').textContent = stats.lastItems + ' items' + (stats.lastCheapest != null ? ', cheapest ' + stats.lastCheapest : '');
    $('fs-buys').textContent = stats.buys + ' / ' + dailyCount();
  }

  // ---------- boot ----------
  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) buildUI();
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
})();
