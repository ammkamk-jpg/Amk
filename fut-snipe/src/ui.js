  // ---------- UI ----------
  // Small line icons (24 px grid, stroke = currentColor).
  function icon(d) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  var ICON = {
    play: icon('<path d="M8 5v14l11-7z"/>'),
    grid: icon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    gear: icon('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
    bolt: icon('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>'),
    tag: icon('<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8.5" cy="8.5" r="1.4"/>'),
    target: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    box: icon('<path d="m4 7.5 8-4 8 4-8 4z"/><path d="M4 7.5v9l8 4 8-4v-9M12 11.5v9"/>'),
    clock: icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    list: icon('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    coins: icon('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'),
    refresh: icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    pack: icon('<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>')
  };
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
  function section(title, body) { return '<div class="ios-h">' + title + '</div><div class="fs-sect">' + body + '</div>'; }
  // A fold-away group: closed by default, so the screen shows only what you use every day.
  function fold(title, body, sub) { return '<details class="fs-det"><summary><span>' + title + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</summary><div class="in">' + body + '</div></details>'; }
  function rebuildView() { var b = document.getElementById('fs-body'); if (b) b.setAttribute('data-tab', ''); render(); }

  // ---------- Sniper: what it's trading, Start, live feed, saved searches ----------
  // Speed row: tap the name to switch Night/Normal/Turbo, - / + = 0.2 s slower / faster (Custom).
  function stepper() { return '<span class="sx-pm"><button data-spd="-1" aria-label="slower">−</button><b class="gap" data-gap>' + gapLabel() + '</b><button data-spd="1" aria-label="faster">+</button></span>'; }
  function speedRow() { return '<div class="sx-row sx-spd"><button class="sx-sk" id="fs-r-speed"><span class="ic">' + ICON.bolt + '</span><span class="k">Speed <small id="fs-r-speed-v"></small></span></button>' + stepper() + '</div>'; }
  // Auto/Custom row: Auto explains what it does, Custom shows your own controls.
  function autoSetting(name, flag, autoText, custom) {
    return '<div class="fs-set"><div class="top"><div class="nm">' + name + '</div>' + ctlSeg(flag, [['Auto', 0], ['Custom', 1]]) + '</div>' +
      '<div class="ds" data-auto="' + flag + '">' + autoText + '</div><div class="fs-cust" data-cust="' + flag + '">' + custom + '</div></div>';
  }
  function autoSummary() { var n = ['cRun', 'cCap', 'cCoins', 'cBreaks'].filter(function (k) { return cfg[k]; }).length; return n ? n + ' custom' : 'Auto'; }
  function sniperView() {
    var srow = function (id, ic, label) { return '<button class="sx-row" id="' + id + '"><span class="ic">' + ic + '</span><span class="k">' + label + '</span><span class="v" id="' + id + '-v"></span><span class="chev"></span></button>'; };
    var stat = function (id, label) { return '<div><b id="' + id + '">0</b><span>' + label + '</span></div>'; };
    return '<div id="fs-block"></div>' +
      '<div class="sx-sum">' +
        '<div class="sx-k" id="fs-t-kicker">Target</div><div class="sx-name" id="fs-t-name">—</div><div class="sx-sub" id="fs-t-mode"></div>' +
        '<div class="sx-3">' +
          '<div><span id="fs-l-snipe">Snipe under</span><b id="fs-t-snipe">—</b><small id="fs-t-price"></small></div>' +
          '<div><span id="fs-l-sell">Sell at</span><b id="fs-t-sell">—</b><small id="fs-t-sellsub"></small></div>' +
          '<div><span id="fs-l-prof">Profit</span><b id="fs-t-prof">—</b><small id="fs-t-profsub"></small></div>' +
        '</div></div>' +
      '<div class="sx-note" id="fs-t-sub"></div>' +
      '<div class="sx-rows">' + speedRow() + srow('fs-r-when', ICON.play, 'Start') + srow('fs-sell', ICON.tag, 'Sell price') + srow('fs-r-prof', ICON.target, 'Minimum profit') +
        srow('fs-r-after', ICON.box, 'After buying') + srow('fs-r-dur', ICON.clock, 'List for') + '</div>' +
      '<button class="fs-btn fs-go" id="fs-start"></button>' +
      '<div id="fs-act"></div>' +
      '<div class="sx-stats">' + stat('fs-s-buys', 'Bought') + stat('fs-s-sr', 'Searches') + stat('fs-s-est', 'Est. profit') + stat('fs-s-net', 'Coins net') + '</div>' +
      '<div class="fs-feed"></div>' +
      '<div class="ios-h"></div>' +
      fold('Saved searches', '<div id="fs-filters"></div><button class="fs-more" id="fs-savefilter">Save the current market search</button>', filters.length ? String(filters.length) : '') +
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
        segSetting('Speed', 'speed', [['Night', 0], ['Normal', 1], ['Turbo', 2], ['Custom', 3]], '') +
        setting('Search gap', stepper(), '<span id="fs-speedhint">' + speedHint() + '</span>')) +
      fold('Run &amp; breaks',
        autoSetting('Runtime', 'cRun', 'Runs until you tap Stop.', setting('Minutes', ctlNum('runMinutes'), '0 = no limit.')) +
        autoSetting('Stop limit', 'cCap', 'Stops after 15 cards bought.', setting('Stop after', ctlNum('sessionBuyCap'), 'cards bought in one run.')) +
        autoSetting('Out of coins', 'cCoins', 'Stops when a card costs more than your coins.', '<div class="ds">Keeps searching (coins from sales can come in).</div>') +
        autoSetting('Breaks', 'cBreaks', 'A ~90 s break every ~30 searches.', rangeSetting('Break every ~', 'breakEvery', 0, 120, 5, ' searches', '0 = no breaks (more risk).') + rangeSetting('Break length', 'breakSec', 15, 300, 5, 's', '')), '<span id="fs-asum">' + autoSummary() + '</span>') +
      fold('Safety stops',
        setting('Too many results stop (10+)', ctlSw('tooManyStop'), 'Manual price: 10+ cards at your price = probably a typo in the price. Stops before buying.') +
        setting('Price range stop', ctlSw('rangeStop'), 'Never lists outside EA\u2019s allowed price range.') +
        setting('Keep special versions', ctlSw('keepSpecials'), 'A TOTW/special caught by a player search is kept, not sold at the normal price.') +
        setting('Daily buy cap', ctlNum('dailyBuyCap'), 'Never more than this per day, whatever the run settings say.'), 'on') +
      fold('Transfer list',
        setting('Relist expired cards', ctlSw('relistExpired'), 'While sniping.') +
        setting('Re-price expired first', ctlSw('repriceExpired'), 'Today\u2019s price, never below break-even. Off = same price.') +
        segSetting('Clear sold items', 'clearSold', [['Off', 0], ['When full', 1], ['Always', 2]], '') +
        setting('Pack pulls: list if worth at least', ctlNum('packMin'), '')) +
      fold('Fine-tuning',
        rangeSetting('Re-check price every ~', 'reprobeEvery', 30, 120, 10, ' searches', '') +
        setting('Vary min bid', ctlSw('varyMinBid'), 'Fresh results on every search.') +
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
      '<div class="ios-h">Tools</div><div class="fs-hubbtns">' +
        hubTool('fs-h-bulk', ICON.list, 'List many at one price', 'Pick a player on your transfer list, one price for all', '') +
        hubTool('fs-h-clear', ICON.coins, 'Book &amp; clear sold', 'refresh first', 'fs-h-clear-s') +
        hubTool('fs-h-exp', ICON.refresh, 'Re-price &amp; relist expired', 'refresh first', 'fs-h-exp-s') +
        hubTool('fs-h-packs', ICON.pack, 'List pack pulls', 'refresh first', 'fs-h-packs-s') +
      '</div>' +
      fold('Sessions', '<div id="fs-h-sessions"></div>');
  }
  function hubTool(id, ic, title, sub, subId) { return '<button class="fs-hb" id="' + id + '"><span class="ic">' + ic + '</span><span class="tx"><b>' + title + '</b><span' + (subId ? ' id="' + subId + '"' : '') + '>' + sub + '</span></span><span class="chev"></span></button>'; }
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
      '<div id="fs-head"><div class="brand"><span class="logo">' + ICON.bolt + '</span><span class="t">TangaTolga<span class="v">v' + VERSION + '</span></span></div><div style="display:flex;align-items:center"><span class="coins" id="fs-coins">—</span><button id="fs-min" title="Close">✕</button></div></div>' +
      '<div id="fs-tiles">' +
        '<div class="fs-tile" data-tab="snipe"><div class="ti" id="fs-ti-run">' + ICON.play + '</div><div class="tl">Sniper</div></div>' +
        '<div class="fs-tile" data-tab="hub"><div class="ti">' + ICON.grid + '</div><div class="tl">My Hub</div></div>' +
        '<div class="fs-tile" data-tab="market"><div class="tg"><svg viewBox="0 0 200 118" id="fs-ti-gauge"></svg><b id="fs-ti-idx">—</b></div><div class="tl">Market</div></div>' +
        '<div class="fs-tile" data-tab="settings"><div class="ti">' + ICON.gear + '</div><div class="tl">Settings</div></div>' +
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
      var sp = g('data-spd'); if (sp) { speedStep(Number(sp)); save(); render(); return; }
      var hf = g('data-hf'); if (hf) { hubFilter = hf; hubShowAll = false; render(); return; }
      var bk = g('data-bk'); if (bk != null) { pickBulk(Number(bk)); return; }
      var bd = g('data-bkdur'); if (bd != null) { saveBulkInputs(); bulk.dur = Number(bd); rebuildView(); return; }
      var ld = g('data-load'); if (ld != null) { loadFilter(Number(ld)); return; }
      var dl = g('data-del'); if (dl != null) { deleteFilter(Number(dl)); return; }
      switch (tg.id) {
        case 'fs-start': if (running) stopAll(); else { unlockAudio(); start(); } break;
        case 'fs-sell': askSellPrice(); break;
        case 'fs-r-speed': cfg.speed = ((cfg.speed | 0) + 1) % 3; applySpeed(); save(); render(); break;
        case 'fs-r-when': if (running) break; var wt = window.prompt('Start at what time? (24 h, e.g. 22:30)\nLeave empty to start right away.', startAt || ''); if (wt != null) { wt = wt.trim().replace('.', ':'); if (!wt || startDelayMs(wt, new Date()) != null) { startAt = wt ? (wt.length === 4 ? '0' + wt : wt) : ''; blockMsg = ''; } else blockMsg = 'Type a time like 22:30.'; render(); } break;
        case 'fs-r-after': cfg.afterBuy = ((cfg.afterBuy | 0) + 1) % 3; save(); render(); break;
        case 'fs-r-dur': var di = LIST_DURS.map(function (d) { return d[1]; }).indexOf(cfg.listDur); cfg.listDur = LIST_DURS[(di + 1) % LIST_DURS.length][1]; save(); render(); break;
        case 'fs-r-prof': var mp = window.prompt('Minimum profit per card (after EA’s 5% tax)', cfg.minProfit); if (mp != null) { var mv = parseCoins(mp); if (mv != null && mv >= 0) { cfg.minProfit = mv; save(); applySell(); } render(); } break;
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
        var lbig = lock.querySelector('.lbig'); if (lbig) lbig.textContent = phase === 'waiting' ? 'Waiting' : 'Running';
        if ($('fs-lstop')) $('fs-lstop').textContent = phase === 'waiting' ? 'Cancel' : 'Stop';
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
    var gl = panel.querySelectorAll('[data-gap]'); for (i = 0; i < gl.length; i++) if (gl[i].textContent !== gapLabel()) gl[i].textContent = gapLabel();
    if (tab === 'settings') {
      if ($('fs-keep')) $('fs-keep').style.display = keepMode() ? '' : 'none'; if ($('fs-speedhint')) $('fs-speedhint').textContent = speedHint();
      var cu = panel.querySelectorAll('[data-cust]'); for (i = 0; i < cu.length; i++) cu[i].style.display = cfg[cu[i].getAttribute('data-cust')] ? '' : 'none';
      var au = panel.querySelectorAll('[data-auto]'); for (i = 0; i < au.length; i++) au[i].style.display = cfg[au[i].getAttribute('data-auto')] ? 'none' : '';
      if ($('fs-asum')) $('fs-asum').textContent = autoSummary();
      return;
    }

    // Sniper view
    var keep = keepMode(), pr = market.snipe && !keep ? profitAt(listPrice(), market.snipe) : null;
    var T = function (id, v) { var e = $(id); if (e && e.textContent !== String(v)) e.textContent = v; };
    T('fs-t-kicker', keep ? 'Target · keep' : 'Target · list & flip');
    if ($('fs-t-name')) { T('fs-t-name', haveSearch() ? searchLabel() : 'No search yet'); $('fs-t-name').className = 'sx-name' + (haveSearch() ? '' : ' muted'); }
    T('fs-t-mode', !haveSearch() ? 'Search a player in the transfer market' : keep ? (cfg.afterBuy === 2 ? 'Bought cards stay in Unassigned' : 'Bought cards go to your transfer list') : 'Bought under the market, listed at the sell price');
    T('fs-l-snipe', keep ? 'Buy under' : 'Snipe under');
    T('fs-t-snipe', keep ? (keepMaxNow() > 0 ? fmt(floorStep(keepMaxNow())) : '—') : market.snipe ? fmt(market.snipe) : '—');
    T('fs-t-price', keep ? (webMaxBuy() ? 'from web app' : keepMaxNow() ? 'fallback' : 'set in web app') : market.price ? 'today ' + fmt(market.price) : phase === 'checking' ? 'checking…' : 'checked at start');
    T('fs-l-sell', keep ? 'Min price' : 'Sell at');
    T('fs-t-sell', keep ? (keepMinNow() > 0 ? fmt(keepMinNow()) : '—') : cfg.sellPrice > 0 ? fmt(roundStep(cfg.sellPrice)) : market.price ? fmt(market.price) : 'Auto');
    T('fs-t-sellsub', keep ? (keepMinNow() > 0 ? 'skips cheaper' : 'no minimum') : cfg.sellPrice > 0 ? 'your price' : 'Auto · market');
    T('fs-l-prof', keep ? 'Then' : 'Profit');
    T('fs-t-prof', keep ? 'Keep' : (pr != null ? fmt(pr) : fmt(cfg.minProfit)) + '+');
    if ($('fs-t-prof')) $('fs-t-prof').className = keep ? '' : 'g';
    T('fs-t-profsub', keep ? (cfg.afterBuy === 2 ? 'in Unassigned' : 'transfer list') : 'after EA’s 5% cut');
    T('fs-t-sub', keep ? (webMaxBuy() ? 'Buys up to the Max. Buy Now of your web app search.' : keepMaxNow() ? 'Fallback price from Settings. A Max. Buy Now in your web app search replaces it.' : 'Set a Max. Buy Now in the web app search, search once, then start.') : !haveSearch() ? '' : market.snipe ? ('Checked ' + ago(market.checkedAt) + (market.fresh ? '' : ' · no fresh listings') + (stats.eaMax ? ' · EA range ' + fmtk(stats.eaMin) + '–' + fmtk(stats.eaMax) : '') + '. The bot re-checks the price as it runs.') : 'Estimate from your settings; the price check sets the exact prices at the start.');
    T('fs-r-speed-v', SPEEDS[cfg.speed | 0] || 'Normal');
    T('fs-r-when-v', phase === 'waiting' ? 'waiting · ' + startAt : startAt ? 'at ' + startAt : 'Now');
    T('fs-sell-v', cfg.sellPrice > 0 ? fmt(roundStep(cfg.sellPrice)) : 'Auto');
    T('fs-r-prof-v', fmt(cfg.minProfit));
    T('fs-r-after-v', ['List', 'Transfer list', 'Unassigned'][cfg.afterBuy | 0] || 'List');
    T('fs-r-dur-v', durLabel(cfg.listDur));
    ['fs-sell', 'fs-r-prof', 'fs-r-dur'].forEach(function (id) { var e = $(id); if (e) e.style.display = keep ? 'none' : ''; });
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
      var html = phase === 'waiting' ? 'Cancel<span class="sub">starts at ' + startAt + '</span>' : running ? 'Stop<span class="sub">bought ' + stats.buys + ' · ' + stats.searches + ' searches</span>'
        : startAt ? 'Start at ' + startAt + '<span class="sub">waits, then ' + (keep ? 'snipes' : 'checks the price and snipes') + '</span>'
        : keep ? 'Start Sniping<span class="sub">buys under ' + (keepMaxNow() > 0 ? fmt(floorStep(keepMaxNow())) : '?') + '</span>'
        : 'Check Price &amp; Start Sniping<span class="sub">' + (market.snipe ? 'snipes under ' + fmt(market.snipe) + ' · profit ' + fmt(pr != null ? pr : cfg.minProfit) + '+' : 'target profit ' + fmt(cfg.minProfit) + '+ per card') + '</span>';
      if (go.__html !== html) { go.__html = html; go.innerHTML = html; }
    }
    if ($('fs-status')) {
      $('fs-status').textContent = stopReason ? '■ ' + stopReason : (phase === 'waiting' ? 'Waiting to start at ' + startAt : phase === 'checking' ? 'Checking price…' : phase === 'break' ? 'Taking a short break…' : running ? ('● Sniping ≤ ' + fmt(market.snipe)) : haveServices() ? (haveSearch() ? 'Ready — tap Start' : 'Search a player, or load a saved search') : 'Open the FUT Web App & sign in');
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
