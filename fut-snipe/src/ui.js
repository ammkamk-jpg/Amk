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
      '<div class="fs-sect-h" style="margin-top:16px">Saved searches</div><div id="fs-filters"></div>' +
      '<button class="fs-more" id="fs-savefilter">★ Save the current market search</button>' +
      '<div id="fs-status"></div><pre id="fs-log"></pre>';
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
    var segs = arc(1.5, 23, '#fb7185') + arc(27, 43, '#fb923c') + arc(47, 58, '#fbbf24') + arc(62, 98.5, '#34d399');
    if (v == null) return '<g opacity=".3">' + segs + '</g>';
    var p = pt(v, 80).split(' ');
    return segs + '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="11" fill="#fff" stroke="#06080d" stroke-width="4"/>';
  }
  function miniSpark(pts) {
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo || 1, up = pts[pts.length - 1] >= pts[0];
    return '<svg class="msp" viewBox="0 0 60 20" preserveAspectRatio="none"><polyline fill="none" stroke="' + (up ? '#34d399' : '#fb7185') + '" stroke-width="2" vector-effect="non-scaling-stroke" points="' +
      pts.map(function (v, i) { return (i * 60 / (pts.length - 1)).toFixed(1) + ',' + (18 - (v - lo) / span * 16).toFixed(1); }).join(' ') + '"/></svg>';
  }
  function marketWord(m) { return !m ? 'not enough checks yet' : m.index >= 60 ? 'prices rising' : m.index <= 40 ? 'prices falling' : 'prices steady'; }
  function marketView() {
    return '<div class="fs-mkt"><svg viewBox="0 0 200 118" id="fs-m-gauge"></svg><div class="mv"><b id="fs-m-idx">—</b><span id="fs-m-lbl"></span></div></div>' +
      '<div class="ds" style="text-align:center;margin:0 6px 14px">Built from the bot’s own price checks in the last 24 h (only cards checked twice or more count). 50 = flat · higher = your cards are getting dearer · lower = cheaper.</div>' +
      '<div class="fs-sect-h">Cards checked (24 h)</div><div id="fs-m-list"></div>';
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
    return section('Look',
        segSetting('Theme', 'theme', THEMES.map(function (t, i) { return [t.name, i]; }), 'Sakura = pink anime style with falling cherry blossoms. Neon = pink / cyan.') +
        '<div class="fs-set"><div class="top"><div class="nm">Wallpaper</div><span class="sv" id="fs-wall-st"></span></div>' +
          '<div class="fs-wallrow"><button class="pick" id="fs-wall-pick">🖼 Choose a picture</button><button id="fs-wall-rm">Remove</button></div>' +
          '<input type="file" accept="image/*" id="fs-wall-file" style="display:none">' +
          '<div class="ds">Any picture from your phone, behind the bot and the running screen. Panels turn to frosted glass so text stays readable.</div></div>' +
        rangeSetting('Wallpaper dim', 'wallDim', 20, 85, 5, '%', 'Darker = easier to read.') +
        rangeSetting('Wallpaper blur', 'wallBlur', 0, 20, 1, 'px', '') +
        setting('Wallpaper on the running screen', ctlSw('wallRun'), '') +
        (typeof MASCOT_ASSETS === 'object' && MASCOT_ASSETS ? setting('Mascot', ctlSw('mascot'), 'She idles on the running screen, cheers \u201cuwuuu~\u201d on every snipe and pouts when the bot stops.') +
          segSetting('Mascot size', 'mascotSize', MASCOT_SIZES, '') +
          setting('Mascot voice', ctlSw('mascotVoice'), 'On iPhone, sound starts working after you tap Start (or the test button).') +
          '<button class="fs-more" id="fs-mascot-test">💖 Test her</button>' : '') +
        setting('Falling petals', ctlSw('petals'), 'Cherry blossoms drifting in the background, in the theme\u2019s colours.')) +
      section('Sniping',
        setting('Target profit per card', ctlNum('minProfit'), 'Coins you want to make per card after EA’s 5% tax. The snipe point is the sell price minus tax minus this, rounded down to EA’s price steps.') +
        setting('Sell price', ctlNum('sellPrice'), '0 = auto (the checked market price). Set your own and bought cards are listed there; the snipe point follows so your target profit still holds. Also on the Sniper card.') +
        segSetting('After buy', 'afterBuy', [['List', 0], ['Transfer list', 1], ['Unassigned', 2]], 'List = price check + auto-relist. Transfer list / Unassigned = no price check, you set the buy price below.') +
        '<div id="fs-keep">' + setting('Buy at or below', ctlNum('keepMax'), 'The most you pay per card (Transfer list / Unassigned mode).') +
          setting('Min price', ctlNum('keepMin'), 'Cards cheaper than this are skipped. 0 = off.') + '</div>' +
        segSetting('List for', 'listDur', LIST_DURS, 'How long bought cards are listed.') +
        rangeSetting('Re-check price every ~', 'reprobeEvery', 30, 120, 10, ' searches', 'The market moves: the bot checks the price again after about this many searches (the exact number varies).')) +
      section('Search settings',
        segSetting('Speed', 'speed', [['Night', 0], ['Normal', 1], ['Turbo', 2]], '<span id="fs-speedhint">' + speedHint() + '</span> · never faster than this, gaps vary like a person’s. Night is the safest.') +
        setting('Vary min bid', ctlSw('varyMinBid'), 'A different min bid (0-1,000) on every search so EA always returns fresh results instead of a cached page.') +
        rangeSetting('Break every ~', 'breakEvery', 20, 120, 5, ' searches', 'A longer pause after about this many searches.') +
        rangeSetting('Break length', 'breakSec', 15, 300, 5, 's', 'How long that pause lasts (varies ±20%).')) +
      section('Safety stops',
        setting('Too many results stop (10+)', ctlSw('tooManyStop'), 'Manual price only: if a search finds 10+ cards at your price, the filter is probably wrong (e.g. 10,000 instead of 1,000). Stops before buying.') +
        setting('Price range stop', ctlSw('rangeStop'), 'Stops if the list price would be outside EA’s allowed price range for the card.') +
        setting('Keep special versions', ctlSw('keepSpecials'), 'A player search without a rarity can buy a TOTW/special under the normal card’s price. It’s kept unlisted (not sold at the normal price) and you get its real value.') +
        setting('Session buy cap', ctlNum('sessionBuyCap'), 'Stop after this many buys in one run.') +
        setting('Daily buy cap', ctlNum('dailyBuyCap'), 'Stop after this many buys in a day.') +
        setting('Run minutes', ctlNum('runMinutes'), 'Stop after this many minutes. 0 = no limit.')) +
      section('Transfer list',
        setting('Relist expired cards', ctlSw('relistExpired'), 'While sniping, unsold cards go back up automatically.') +
        setting('Re-price expired before relisting', ctlSw('repriceExpired'), 'Price-check each expired card and relist at today’s price, never below break-even. Off = same price via EA’s Re-list all.') +
        segSetting('Clear sold items', 'clearSold', [['Off', 0], ['When full', 1], ['Always', 2]], 'Books the profit and clears sold cards while sniping. When full = only once the list is at 95+ of 100.') +
        setting('Pack pulls: list if worth at least', ctlNum('packMin'), 'For Hub → List pack pulls. Cheaper cards stay in Unassigned.')) +
      section('Alerts &amp; display',
        segSetting('Snipe sound', 'sound', SOUNDS, 'Tap one to hear it. On iPhone, sound starts working after you tap Start.') +
        setting('Vibrate on snipe', ctlSw('vibrate'), 'Haptic tick on iPhone (iOS 18), vibration on Android.') +
        setting('Price tags on cards', ctlSw('badges'), 'Shows EA’s AVG value under every card: Club, transfer list, market.') +
        '<button class="fs-more" id="fs-test">🎉 Test the snipe celebration</button>') +
      section('Help &amp; data',
        '<div class="fs-mini"><button id="fs-diag">Copy diagnostics</button><button id="fs-clearsess">Clear sessions</button><button id="fs-reset2">Reset all-time</button></div>' +
        '<div class="ds" style="margin-top:8px">Diagnostics contain no password or login data. Reset keeps the record of EA’s last captcha / 429 for the safety assistant.</div><pre id="fs-log"></pre>');
  }

  // Hub, top to bottom: profit + activity cards, safety assistant, trades (bought / sold), then
  // the transfer list tools.
  var hubFilter = 'all', hubShowAll = false;
  function hubView() {
    return '' +
      '<div class="fs-dash">' +
        '<div class="fs-dc pr"><div class="dh"><span class="di">↗</span>Profit</div><div class="dv" id="fs-h-total">—</div>' +
          '<div class="dsub">of which unrealized <b id="fs-h-unreal">—</b></div><div class="dsub" id="fs-h-vs"></div><svg class="spark" id="fs-h-spark" viewBox="0 0 100 32" preserveAspectRatio="none"></svg></div>' +
        '<div class="fs-dc ac"><div class="dh"><span class="di">▮▮</span>Activity</div><div class="dpair"><div><b id="fs-h-sess">—</b><span>sessions</span></div><div><b id="fs-h-srch">—</b><span>searches</span></div></div>' +
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
        '<button class="fs-hb" id="fs-h-clear"><b>💰 Book &amp; clear sold</b><span id="fs-h-clear-s">refresh first</span></button>' +
        '<button class="fs-hb" id="fs-h-exp"><b>♻️ Re-price &amp; relist expired</b><span id="fs-h-exp-s">refresh first</span></button>' +
        '<button class="fs-hb" id="fs-h-packs"><b>📦 List pack pulls</b><span id="fs-h-packs-s">refresh first</span></button>' +
      '</div>' +
      '<div class="fs-sect-h" style="margin-top:16px">Sessions</div><div id="fs-h-sessions"></div>';
  }
  function sessionsHTML() {
    if (!sessions.length) return '<div class="fs-empty" style="padding:14px 10px">No sessions yet.</div>';
    var maxAbs = Math.max.apply(null, sessions.map(function (s) { return Math.abs(s.net || s.est || 0); }).concat([1]));
    return sessions.slice(0, 15).map(function (s) {
      var val = s.net != null ? s.net : s.est, w = Math.round(Math.abs(val || 0) / maxAbs * 100);
      return '<div class="fs-sale"><div style="flex:1"><div class="nm">' + signed(val) + ' coins</div><div class="de">' + ago(s.t) + ' · ' + (s.buys || 0) + ' bought · est ' + signed(s.est) + '</div><div class="fs-bar"><i style="width:' + w + '%;background:' + ((val || 0) < 0 ? '#fb7185' : '#34d399') + '"></i></div></div></div>';
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
    return '<defs><linearGradient id="fsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tt-a1);stop-opacity:.45"/><stop offset="1" style="stop-color:var(--tt-a1);stop-opacity:0"/></linearGradient></defs>' +
      '<polygon fill="url(#fsg)" points="0,32 ' + xy.join(' ') + ' 100,32"/><polyline fill="none" style="stroke:var(--tt-a1)" stroke-width="1.6" vector-effect="non-scaling-stroke" points="' + xy.join(' ') + '"/>';
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
    el.innerHTML = lookLayers() +
      '<div id="fs-head"><div><span class="t">TangaTolga</span><span class="t2">SNIPER</span><span class="v">v' + VERSION + '</span></div><div style="display:flex;align-items:center"><span class="coins" id="fs-coins">—</span><button id="fs-min" title="Close">✕</button></div></div>' +
      '<div id="fs-tiles">' +
        '<div class="fs-tile" data-tab="snipe"><div class="ti" id="fs-ti-run">▶</div><div class="tl">Sniper</div></div>' +
        '<div class="fs-tile" data-tab="hub"><div class="ti">▦</div><div class="tl">My Hub</div></div>' +
        '<div class="fs-tile" data-tab="market"><div class="tg"><svg viewBox="0 0 200 118" id="fs-ti-gauge"></svg><b id="fs-ti-idx">—</b></div><div class="tl">Market</div></div>' +
        '<div class="fs-tile" data-tab="settings"><div class="ti">⚙︎</div><div class="tl">Settings</div></div>' +
      '</div><div id="fs-body"></div>';
    document.body.appendChild(el);
    var fab = document.createElement('div'); fab.id = 'fs-fab'; fab.innerHTML = '⚡<span class="dot"></span>';
    fab.onclick = function () { if (Date.now() - fabDraggedAt < 400) return; el.classList.add('open'); fab.style.display = 'none'; render(); };
    document.body.appendChild(fab);
    makeFabDraggable(fab);

    var lock = document.createElement('div'); lock.id = 'fs-lock';
    lock.innerHTML = lookLayers() + mascotIdleHTML() + '<div class="lbig">TangaTolga <b>hunting</b></div>' +
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
    applyLook();

    // live label while dragging a slider
    el.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k || e.target.type !== 'range') return; cfg[k] = Number(e.target.value) || 0; var lab = el.querySelector('[data-sv="' + k + '"]'); if (lab) lab.textContent = cfg[k] + (e.target.getAttribute('data-unit') || ''); if (k === 'wallDim' || k === 'wallBlur') applyLook(); });
    el.addEventListener('change', function (e) {
      if (e.target.id === 'fs-wall-file') { pickWallpaper(e.target.files && e.target.files[0]); e.target.value = ''; return; }
      var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return; cfg[k] = Number(e.target.value) || 0; if (k === 'sellPrice' || k === 'minProfit') applySell(); save(); render(); });
    el.addEventListener('click', function (e) {
      // closest(): a tap on the subtitle <span> inside a button still counts as that button.
      var tg = e.target && e.target.closest ? e.target.closest('button,[data-tab],[data-sw]') : e.target;
      if (!tg || !el.contains(tg)) return;
      var g = function (a) { return tg.getAttribute && tg.getAttribute(a); };
      var tb = g('data-tab'); if (tb) { tab = tb; render(); return; }
      var sw = g('data-sw'); if (sw) { cfg[sw] = cfg[sw] ? 0 : 1; if (sw === 'vibrate' && cfg.vibrate) vibrate(); if (sw === 'badges') { if (cfg.badges) paintBadges(); else removeBadges(); } if (sw === 'wallRun' || sw === 'petals' || sw === 'mascot') applyLook(); save(); render(); return; }
      var seg = g('data-seg'); if (seg) { cfg[seg] = Number(g('data-val')) || 0; if (seg === 'speed') applySpeed(); if (seg === 'sound') { unlockAudio(); playSound(cfg.sound); } if (seg === 'theme' || seg === 'mascotSize') applyLook(); save(); render(); return; }
      var hf = g('data-hf'); if (hf) { hubFilter = hf; hubShowAll = false; render(); return; }
      var ld = g('data-load'); if (ld != null) { loadFilter(Number(ld)); return; }
      var dl = g('data-del'); if (dl != null) { deleteFilter(Number(dl)); return; }
      switch (tg.id) {
        case 'fs-start': if (running) stopAll(); else { unlockAudio(); start(); } break;
        case 'fs-sell': askSellPrice(); break;
        case 'fs-wall-pick': var fi = document.getElementById('fs-wall-file'); if (fi) fi.click(); break;
        case 'fs-wall-rm': removeWallpaper(); break;
        case 'fs-mascot-test': unlockAudio(); mascotReact('win', 'uwuuu~ 💖', 'Test snipe · +662'); break;
        case 'fs-test': unlockAudio(); celebrate('Test snipe', 13750, 662); break;
        case 'fs-min': el.classList.remove('open'); fab.style.display = ''; break;
        case 'fs-diag': diag(); break;
        case 'fs-savefilter': saveCurrentFilter(); break;
        case 'fs-clearsess': if (window.confirm('Clear the session history?')) { sessions = []; lsSet(SESS_KEY, sessions); redrawTab(); } break;
        case 'fs-reset2': if (window.confirm('Reset all-time stats and session history? This can’t be undone.')) { resetLife(); redrawTab(); } break;
        case 'fs-h-refresh': hubRefreshButton(); break;
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
        if ($('fs-l-sub')) $('fs-l-sub').textContent = mode === 'job' ? 'Hub job running — tap Stop any time, finished cards stay listed.' : keepMode() ? 'Buy ≤ ' + fmt(market.snipe) + (cfg.keepMin > 0 ? ' · min ' + fmt(cfg.keepMin) : '') + ' · ' + (cfg.afterBuy === 2 ? 'leave in Unassigned' : 'to transfer list') + ' · no price check' : market.snipe ? ('Price ' + fmt(market.price) + (cfg.sellPrice > 0 ? ' · sell ' + fmt(listPrice()) : '') + ' · snipe ≤ ' + fmt(market.snipe) + ' · step ' + fmt(stepFor(market.price)) + ' · list ' + durLabel(cfg.listDur)) : 'Screen locked so you don’t swipe the web app while it runs. Hide to reach the controls.';
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
    if ($('fs-ti-run')) { $('fs-ti-run').textContent = running ? '●' : '▶'; $('fs-ti-run').className = 'ti' + (running ? ' live' : ''); }
    // body (only rebuilt on view change, so inputs stay usable)
    var body = $('fs-body');
    if (body.getAttribute('data-tab') !== tab) {
      body.setAttribute('data-tab', tab);
      body.innerHTML = tab === 'hub' ? hubView() : tab === 'market' ? marketView() : tab === 'settings' ? settingsView() : sniperView();
      fillFeeds(); if ($('fs-log')) $('fs-log').textContent = logLines.join('\n');
      if (tab === 'hub' && !hub.at && !running) hubRefreshButton();
    }
    $('fs-coins').textContent = coins() != null ? fmtk(coins()) : '—';
    // switches / segments reflect cfg in whichever view is open
    var sws = panel.querySelectorAll('[data-sw]'); for (i = 0; i < sws.length; i++) sws[i].className = 'fs-sw' + (cfg[sws[i].getAttribute('data-sw')] ? ' on' : '');
    var segs = panel.querySelectorAll('[data-seg]'); for (i = 0; i < segs.length; i++) segs[i].className = 'fs-sg' + (Number(segs[i].getAttribute('data-val')) === cfg[segs[i].getAttribute('data-seg')] ? ' on' : '');
    if (tab === 'hub') { renderHub($); var sl = $('fs-h-sessions'), shh = sessionsHTML(); if (sl && sl.__html !== shh) { sl.__html = shh; sl.innerHTML = shh; } return; }
    if (tab === 'market') return renderMarket($);
    if (tab === 'settings') { if ($('fs-wall-st')) $('fs-wall-st').textContent = wallData() ? 'set ✓' : 'none'; if ($('fs-keep')) $('fs-keep').style.display = keepMode() ? '' : 'none'; if ($('fs-speedhint')) $('fs-speedhint').textContent = speedHint(); return; }

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
    if ($('fs-t-snipe')) $('fs-t-snipe').textContent = keep ? (cfg.keepMax > 0 ? fmt(floorStep(cfg.keepMax)) : 'set price') : market.snipe ? fmt(market.snipe) : '—';
    if ($('fs-t-prof')) $('fs-t-prof').textContent = keep ? '—' : pr != null ? signed(pr) : '+' + fmt(cfg.minProfit);
    if ($('fs-t-sub')) $('fs-t-sub').textContent = keep ? ('your price' + (cfg.keepMin > 0 ? ' · min ' + fmt(cfg.keepMin) : '') + ' · change it in Settings') : market.snipe ? ('step ' + fmt(stepFor(market.price)) + (market.fresh ? '' : ' · no fresh listings') + ' · checked ' + ago(market.checkedAt) + (stats.eaMax ? ' · EA range ' + fmtk(stats.eaMin) + '–' + fmtk(stats.eaMax) : '')) : 'Start checks the market price first, then snipes below it.';
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
        ? '■ Stop<span class="sub">bought ' + stats.buys + ' · ' + stats.searches + ' searches</span>'
        : keep ? '▶ Start<span class="sub">buys at ≤ ' + (cfg.keepMax > 0 ? fmt(floorStep(cfg.keepMax)) : '?') + ' · ' + (cfg.afterBuy === 2 ? 'leaves them in Unassigned' : 'moves them to your transfer list') + '</span>'
        : '▶ Start<span class="sub">checks the price, then snipes for +' + fmt(cfg.minProfit) + '/card and relists (' + durLabel(cfg.listDur) + ')</span>';
      if (go.__html !== html) { go.__html = html; go.innerHTML = html; }
    }
    if ($('fs-status')) {
      $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'checking' ? 'Checking price…' : phase === 'break' ? 'Taking a short break…' : running ? ('● Sniping ≤ ' + fmt(market.snipe)) : haveServices() ? (haveSearch() ? 'Ready — tap Start' : 'Search a player, or load a saved search') : 'Open the FUT Web App & sign in');
      $('fs-status').style.color = running ? '#34d399' : stopReason ? '#fb923c' : '#8b95a8';
    }
  }

  setInterval(function () { if ((tab === 'hub' || tab === 'market') && document.getElementById('fs-panel') && document.getElementById('fs-panel').classList.contains('open')) render(); }, 5000);
  function boot(tries) {
    if (!document.getElementById('fs-panel') && document.body) { buildUI(); startBadgeObserver(); paintBadges(); }
    if (haveServices()) { wrapSearch(); if (!window.__futReady) { window.__futReady = true; log('trading services detected ✓'); } render(); }
    if ((tries || 0) < 180) setTimeout(function () { boot((tries || 0) + 1); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); }); else boot(0);
