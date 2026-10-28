  // ---------- UI ----------
  var logLines = [], activity = '';
  function log(m) { logLines.unshift(new Date().toLocaleTimeString() + '  ' + m); logLines = logLines.slice(0, 30); var b = document.getElementById('fs-log'); if (b) b.textContent = logLines.join('\n'); }
  // A step worth seeing: on screen (activity line + log) and in the console.
  function say(m) { log(m); setActivity(m); try { console.log('[FUT Snipe] ' + m); } catch (e) {} }
  function setActivity(m) { activity = m; ['fs-act', 'fs-l-act'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = m; }); }
  // Live feed: one line per search ("Player not found  14:03:22"), newest on top. Clears itself
  // after ~20 lines (the bot pauses briefly meanwhile, see afterFeedLine).
  var feedLines = [], feedLimit = 20, feedClearing = false;
  function clock() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function feedHTML(l) { return '<div class="fs-fl ' + l.kind + '"><span class="tx">' + esc(l.text) + '</span><span class="tm">' + l.time + '</span></div>'; }
  // quiet = already written to the console by say().
  function feed(text, kind, quiet) {
    var l = { text: text, kind: kind || 'miss', time: clock() };
    feedLines.unshift(l);
    if (!quiet) try { console.log('[FUT Snipe] ' + text + '  ' + l.time); } catch (e) {}
    var boxes = document.querySelectorAll('.fs-feed');
    for (var i = 0; i < boxes.length; i++) { if (boxes[i].classList.contains('clearing')) continue; boxes[i].insertAdjacentHTML('afterbegin', feedHTML(l)); while (boxes[i].children.length > 30) boxes[i].removeChild(boxes[i].lastChild); }
  }
  function feedFull() { return feedLines.length >= feedLimit; }
  function clearFeed(instant) {
    feedLines = []; feedLimit = rand(18, 24);
    var boxes = document.querySelectorAll('.fs-feed'), i;
    if (instant) { for (i = 0; i < boxes.length; i++) boxes[i].innerHTML = ''; return Promise.resolve(); }
    feedClearing = true; setTidy('clearing the list · short pause…');
    for (i = 0; i < boxes.length; i++) {
      boxes[i].classList.add('clearing');
      var kids = boxes[i].children; for (var k = 0; k < kids.length; k++) kids[k].style.animationDelay = (k * 30) + 'ms';
    }
    return sleep(900).then(function () {
      var bx = document.querySelectorAll('.fs-feed');
      for (var j = 0; j < bx.length; j++) { bx[j].classList.remove('clearing'); bx[j].innerHTML = ''; }
      feedClearing = false; setTidy('');
    });
  }
  function setTidy(m) { var t = document.querySelectorAll('.fs-tidy'); for (var i = 0; i < t.length; i++) t[i].textContent = m; }
  function fillFeeds() { var html = feedLines.map(feedHTML).join(''), b = document.querySelectorAll('.fs-feed'); for (var i = 0; i < b.length; i++) if (!b[i].children.length && html) b[i].innerHTML = html; }

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
      '<div id="fs-act"></div><div class="fs-tidy"></div><div class="fs-feed"></div>' +
      '<div class="fs-rows" style="margin-top:11px">' +
        row('🎯', 'Target profit / card', 'minProfit') +
        segRow('⏳', 'List for', 'listDur', LIST_DURS) +
        swRow('🧾', 'Auto-relist after buy', 'autoList') +
        swRow('♻️', 'Relist expired cards', 'relistExpired') +
        sliderRow('🔁', 'Re-check price every ~', 'reprobeEvery', 30, 120, 10, ' searches') +
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
        row('🛑', 'Session buy cap', 'sessionBuyCap') +
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
    fab.onclick = function () { if (Date.now() - fabDraggedAt < 400) return; el.classList.add('open'); fab.style.display = 'none'; render(); };
    document.body.appendChild(fab);
    makeFabDraggable(fab);

    var lock = document.createElement('div'); lock.id = 'fs-lock';
    lock.innerHTML = '<div class="spin"></div><div class="lbig">⚡ FUT Snipe running</div>' +
      '<div class="lstat" id="fs-l-act">Checking price…</div>' +
      '<div class="lrow"><div>Bought<b id="fs-l-buys">0</b></div><div>Searches<b id="fs-l-sr">0</b></div><div>Coins net<b id="fs-l-net">—</b></div></div>' +
      '<div class="lsub" id="fs-l-sub"></div>' +
      '<div class="fs-tidy"></div><div class="fs-feed"></div>' +
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
    if (body.getAttribute('data-tab') !== tab) { body.setAttribute('data-tab', tab); body.innerHTML = tab === 'filters' ? filtersView() : tab === 'stats' ? statsView() : snipeView(); fillFeeds(); }
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
      $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'checking' ? 'Checking price…' : phase === 'tidy' ? 'Short pause…' : phase === 'break' ? 'Taking a short break…' : running ? ('● Sniping ≤ ' + fmt(market.snipe)) : haveServices() ? (haveSearch() ? 'Ready — tap Start' : 'Search a player, or load a filter') : 'Open the FUT Web App & sign in');
      $('fs-status').style.color = running ? '#19e67d' : stopReason ? '#ff9a6b' : '#8ea0b5';
    }
  }

  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) { buildUI(); startBadgeObserver(); paintBadges(); }
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
