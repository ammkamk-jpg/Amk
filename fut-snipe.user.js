// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      0.1.0
// @description  Self-run transfer-market sniper for the EA SPORTS FC Ultimate Team Web App, paced like a human. Stops (never bypasses) on captcha / soft-ban. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * WHAT THIS IS
 * ------------
 * A userscript port of the behaviour observed (via static analysis with REA) in the
 * "EA FC Sniping Bot & Autobuyer (FUT Simple Trader)" Chrome extension. It runs inside
 * the Web App page (@inject-into page) and drives EA's own in-page trading services
 * (services.Item.searchTransferMarket / services.Item.bid / services.User.getUser),
 * exactly as the extension does. The vendor telemetry the extension sent to
 * api.dashboard.futsimpletrader.com has been removed: this script makes NO external
 * requests and stores nothing off your device.
 *
 * READ BEFORE USING
 * -----------------
 * Automating the FUT transfer market violates EA's User Agreement and FUT rules. EA
 * detects it and penalises accounts: transfer-market bans, coin/item wipes, and
 * permanent bans. This script is for your own account at your own risk. To keep it
 * human-paced and honest it:
 *   - uses randomised delays with a hard minimum floor between actions,
 *   - takes longer breaks after a run of searches,
 *   - caps buys per session and per day,
 *   - STOPS when EA shows a captcha or a soft-ban (HTTP 429) — it does NOT try to
 *     solve or evade them; you solve the captcha yourself, then restart.
 * Do not remove those limits. If you raise the speed past human pace you will get
 * your account flagged faster, which is the opposite of what you want.
 *
 * INSTALL (iOS Safari + "Userscripts" by quoid)
 * ---------------------------------------------
 *   1. Install the "Userscripts" app from the App Store; enable it in
 *      Settings > Safari > Extensions and grant it access to ea.com ("Allow").
 *   2. Open this file's raw URL in Safari, then open the Userscripts popup and tap
 *      Install. (Or save a .user.js file into the Userscripts directory you set.)
 *   3. Open the FUT Web App in Safari and sign in. A small "FUT Snipe" panel appears.
 *
 * TUNING
 * ------
 * Set your snipe price in "Max buy-now". The search returns items at or under that
 * price and the script buys them. Start conservative (long intervals, low caps) and
 * watch the status line. Field names in the search criteria can change between titles;
 * if searches return nothing, see buildCriteria() and the console log.
 */

(function () {
  'use strict';

  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;

  // ---- persistent settings (this device only) -----------------------------
  var LS_KEY = 'futSnipe.settings.v1';
  var DEFAULTS = {
    minBuy: 0,          // 0 = no lower bound
    maxBuy: 1000,       // your snipe price (buy-now ceiling)
    maskedDefId: '',    // optional: a specific player's definition id from the web app
    searchMinMs: 4000,  // floor between search cycles (kept >= HARD_FLOOR)
    searchJitterMs: 3000, // extra random 0..this added each cycle
    breakEvery: 25,     // after this many searches, take a long break
    breakMinMs: 60000,  // long break length: min
    breakMaxMs: 180000, // long break length: max
    sessionBuyCap: 20,  // stop after this many buys in one Start
    dailyBuyCap: 200,   // stop after this many buys today (local date)
    listAfterBuy: false // move won items to the transfer list (true) or leave unassigned
  };
  var HARD_FLOOR_MS = 2000; // never act faster than this, whatever the settings say

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }
  var cfg = load();

  // ---- daily counter -------------------------------------------------------
  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyCount() {
    try {
      var d = JSON.parse(localStorage.getItem('futSnipe.daily') || '{}');
      return d.date === today() ? (d.n | 0) : 0;
    } catch (e) { return 0; }
  }
  function addDaily(n) {
    var cur = dailyCount();
    try { localStorage.setItem('futSnipe.daily', JSON.stringify({ date: today(), n: cur + n })); } catch (e) {}
  }

  // ---- run state -----------------------------------------------------------
  var running = false;
  var stopReason = '';
  var stats = { searches: 0, buys: 0, sinceBreak: 0 };
  var OBS = {}; // stable observer context object for services.*.observe

  var rand = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---- safety net: watch the page's own traffic for captcha / soft-ban -----
  // Mirrors the extension: a 429 on a transfer-market call, or a captcha trigger,
  // means EA is throttling us. We STOP. We never try to defeat either.
  function requestStop(reason) {
    if (!running) return;
    running = false;
    stopReason = reason;
    log('STOP: ' + reason);
    render();
  }
  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          var u = this.__u || '';
          if (/transfermarket|\/trade/i.test(u) && this.status === 429) {
            var retry = this.getResponseHeader && this.getResponseHeader('Retry-After');
            requestStop('EA soft-ban (HTTP 429)' + (retry ? ', Retry-After ' + retry + 's' : '') + ' — wait it out, then restart.');
          }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();

  // EA signals captcha through its own error code (UtasErrorCode.CAPTCHA_REQUIRED).
  // We detect it per-response in the service callbacks (see classifyError) and stop.
  function classifyError(resp, httpStatus) {
    var code = (resp && (resp.status || resp.error || (resp.data && resp.data.code))) || httpStatus || 0;
    // Status codes observed in the web app's own handling:
    if (code === 429) return { stop: true, msg: 'EA soft-ban (429)' };
    if (code === 459 || code === 460 || /captcha/i.test(JSON.stringify(resp || ''))) return { stop: true, msg: 'Captcha required' };
    if (code === 461 || code === 462 || code === 478) return { stop: false, msg: 'item already gone' };
    if (code === 473) return { stop: false, msg: 'transfer list full' };
    if (code === 494) return { stop: true, msg: 'account banned/blocked' };
    return { stop: false, msg: 'request failed (' + code + ')' };
  }

  // ---- EA service wrappers (Promise over the web app's .observe callbacks) --
  function haveServices() {
    return !!(window.services && services.Item && services.Item.searchTransferMarket &&
      services.Item.bid && services.User && services.User.getUser);
  }
  function coins() {
    try { return services.User.getUser().coins.amount; } catch (e) { return null; }
  }

  // Build a search criteria object. The web app exposes its own criteria class in
  // some builds; prefer it, else fall back to a plain object with the long-stable
  // FUT field names. Adjust here if a title renames fields.
  function buildCriteria() {
    var base = {
      type: 'player',
      count: 50,
      start: 0,
      minBuy: cfg.minBuy || 0,
      maxBuy: cfg.maxBuy || 0,
      minBid: 0,
      maxBid: 0
    };
    if (cfg.maskedDefId) base.maskedDefId = cfg.maskedDefId;
    try {
      if (window.UTSearchCriteriaDTO) {
        var c = new UTSearchCriteriaDTO();
        Object.assign(c, base);
        return c;
      }
    } catch (e) {}
    return base;
  }

  function search() {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
      try {
        services.Item.searchTransferMarket(buildCriteria(), 1).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          if (resp && resp.success) finish({ ok: true, items: (resp.data && resp.data.items) || [] });
          else finish({ ok: false, items: [], err: classifyError(resp) });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, items: [], err: { msg: 'search threw: ' + e } }); }
    });
  }

  function buy(item) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, err: { msg: 'bid timeout' } }); }, 15000);
      try {
        services.Item.bid(item, item.buyNowPrice).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          if (resp && resp.success) finish({ ok: true });
          else finish({ ok: false, err: classifyError(resp) });
        });
      } catch (e) { clearTimeout(to); finish({ ok: false, err: { msg: 'bid threw: ' + e } }); }
    });
  }

  function listWon(item) {
    // Optional: move a won item to the transfer list. Best-effort; failures are non-fatal.
    try {
      if (cfg.listAfterBuy && services.Item.list && item.buyNowPrice) {
        services.Item.list(item, Math.max(150, item.startingBid || item.buyNowPrice), item.buyNowPrice).observe(OBS, function () {});
      }
    } catch (e) {}
  }

  // ---- the snipe loop ------------------------------------------------------
  async function loop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session buy cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily buy cap reached (' + cfg.dailyBuyCap + ')');

      var r = await search();
      if (!running) return;
      stats.searches++; stats.sinceBreak++;

      if (!r.ok) {
        var c = r.err || { stop: false, msg: 'search failed' };
        if (c.stop) return requestStop(c.msg);
        log('search: ' + (c.msg || 'no result'));
      } else {
        for (var i = 0; i < r.items.length && running; i++) {
          var it = r.items[i];
          var price = it && it.buyNowPrice;
          if (!price || price <= 0) continue;
          if (cfg.maxBuy && price > cfg.maxBuy) continue;
          var bal = coins();
          if (bal != null && price > bal) { log('skip: not enough coins'); continue; }

          var b = await buy(it);
          if (!running) return;
          if (b.ok) {
            stats.buys++; addDaily(1);
            log('BOUGHT for ' + price + '  (session ' + stats.buys + ', today ' + dailyCount() + ')');
            listWon(it);
          } else {
            var ce = b.err || { stop: false, msg: 'bid failed' };
            if (ce.stop) return requestStop(ce.msg);
            // else: usually "already gone" — normal in sniping, keep going
          }
          await sleep(Math.max(HARD_FLOOR_MS, rand(600, 1500))); // small gap between buys
          if (stats.buys >= cfg.sessionBuyCap) break;
        }
      }
      render();

      // long break after a run of searches, to look human
      if (stats.sinceBreak >= cfg.breakEvery) {
        stats.sinceBreak = 0;
        var br = rand(cfg.breakMinMs, cfg.breakMaxMs);
        log('break ' + Math.round(br / 1000) + 's');
        for (var t = 0; t < br && running; t += 500) await sleep(500);
      } else {
        var wait = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs));
        for (var w = 0; w < wait && running; w += 250) await sleep(250);
      }
    }
  }

  function start() {
    if (running) return;
    if (!haveServices()) { log('Web App trading services not ready — open the FUT Web App and sign in first.'); return; }
    running = true; stopReason = ''; stats = { searches: 0, buys: 0, sinceBreak: 0 };
    log('started. coins: ' + (coins() != null ? coins() : '?'));
    render();
    loop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stop() { if (running) requestStop('stopped by you'); }

  // ---- minimal on-page UI --------------------------------------------------
  var logLines = [];
  function log(m) {
    var line = new Date().toLocaleTimeString() + '  ' + m;
    logLines.unshift(line); logLines = logLines.slice(0, 40);
    try { console.debug('[FUT Snipe]', m); } catch (e) {}
    var box = document.getElementById('futsnipe-log');
    if (box) box.textContent = logLines.join('\n');
  }

  function field(label, key, type) {
    return '<label style="display:flex;justify-content:space-between;gap:8px;margin:2px 0">' +
      '<span>' + label + '</span>' +
      '<input data-k="' + key + '" type="' + (type || 'number') + '" ' +
      (type === 'checkbox' ? (cfg[key] ? 'checked' : '') : 'value="' + cfg[key] + '"') +
      ' style="width:110px"></label>';
  }

  function buildUI() {
    var el = document.createElement('div');
    el.id = 'futsnipe-panel';
    el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;width:280px;' +
      'font:12px/1.4 -apple-system,system-ui,sans-serif;background:#0f1115;color:#e6e6e6;' +
      'border:1px solid #333;border-radius:10px;padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.5)';
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<strong>FUT Snipe</strong>' +
        '<button id="futsnipe-min" style="background:#222;color:#aaa;border:0;border-radius:6px;padding:2px 8px">–</button>' +
      '</div>' +
      '<div id="futsnipe-body">' +
        field('Min buy-now', 'minBuy') +
        field('Max buy-now (snipe)', 'maxBuy') +
        field('Player defId (opt.)', 'maskedDefId', 'text') +
        field('Search floor (ms)', 'searchMinMs') +
        field('Search jitter (ms)', 'searchJitterMs') +
        field('Break every N', 'breakEvery') +
        field('Session buy cap', 'sessionBuyCap') +
        field('Daily buy cap', 'dailyBuyCap') +
        field('List won items', 'listAfterBuy', 'checkbox') +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<button id="futsnipe-start" style="flex:1;background:#1f8b4c;color:#fff;border:0;border-radius:6px;padding:6px">Start</button>' +
          '<button id="futsnipe-stop" style="flex:1;background:#8b1f1f;color:#fff;border:0;border-radius:6px;padding:6px">Stop</button>' +
        '</div>' +
        '<div id="futsnipe-status" style="margin-top:8px;color:#9fe3b0"></div>' +
        '<pre id="futsnipe-log" style="margin:6px 0 0;max-height:120px;overflow:auto;white-space:pre-wrap;color:#9aa4b2;font-size:11px"></pre>' +
      '</div>';
    document.body.appendChild(el);

    el.addEventListener('change', function (e) {
      var k = e.target && e.target.getAttribute && e.target.getAttribute('data-k');
      if (!k) return;
      cfg[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' ? Number(e.target.value) : e.target.value);
      save(cfg);
    });
    el.querySelector('#futsnipe-start').onclick = start;
    el.querySelector('#futsnipe-stop').onclick = stop;
    el.querySelector('#futsnipe-min').onclick = function () {
      var b = document.getElementById('futsnipe-body');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    };
    render();
  }

  function render() {
    var s = document.getElementById('futsnipe-status');
    if (!s) return;
    s.textContent = (running ? '● running' : '○ idle') +
      '   searches ' + stats.searches + '   buys ' + stats.buys +
      '   today ' + dailyCount() +
      (coins() != null ? '   coins ' + coins() : '') +
      (stopReason ? '\n' + stopReason : '');
    s.style.color = running ? '#9fe3b0' : (stopReason ? '#e3a09f' : '#9aa4b2');
  }

  // ---- boot: wait for the Web App to be ready ------------------------------
  function boot(tries) {
    if (document.getElementById('futsnipe-panel')) return;
    if (document.body) buildUI();
    if (!haveServices()) {
      if ((tries || 0) < 120) return setTimeout(function () { boot((tries || 0) + 1); }, 1000);
    } else {
      log('trading services detected — ready.');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); });
  else boot(0);
})();
