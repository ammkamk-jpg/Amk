  // ---------- price tags on cards ----------
  // EA draws cards on a <canvas> (no player id in the page), but every card row already carries
  // its average coin value in a hidden stats view ("AVG 61.3K"). The tag shows that value on the
  // card itself: Club, transfer list, market, everywhere. No extra EA calls.
  var badgeTimer = null, badgeObs = null;
  var ROW_SEL = 'li.listFUTItem';
  function startBadgeObserver() {
    if (badgeObs || !window.MutationObserver || !document.body) return;
    badgeObs = new MutationObserver(function () { paintBadges(); });
    try { badgeObs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    window.addEventListener('resize', paintBadges);
  }
  function paintBadges() { if (!cfg.badges || badgeTimer) return; badgeTimer = setTimeout(function () { badgeTimer = null; doPaintBadges(); }, 300); }
  // Profit tags on the transfer list: the row's item comes from EA's list cell view (its render()
  // is wrapped to remember the item on the row). Cost = what the bot paid (ledger), price = the
  // listing's Buy Now (or the sale price once sold). Cards the bot didn't buy get no tag.
  var cellHook = { done: false, cls: null, calls: 0, withItem: 0 };
  function hookCells() {
    if (cellHook.done) return true;
    var names = ['UTItemTableCellView'].concat(Object.keys(window).filter(function (k) { return /^UT\w*(TableCell|ListItem)\w*View$/.test(k) && k !== 'UTItemTableCellView'; }));
    for (var i = 0; i < names.length; i++) {
      var C = window[names[i]]; if (!C || !C.prototype || typeof C.prototype.render !== 'function' || C.prototype.__fsHooked) continue;
      (function (P) {
        var orig = P.render;
        P.render = function (item) {
          var r = orig.apply(this, arguments); cellHook.calls++;
          try { var root = (this.getRootElement && this.getRootElement()) || this.__root || this._root; if (root && item && item.id != null) { root.__fsItem = item; root.setAttribute('data-fs-id', String(item.id)); cellHook.withItem++; } } catch (e) {}
          paintBadges(); return r;
        };
        P.__fsHooked = true;
      })(C.prototype);
      cellHook.done = true; cellHook.cls = (cellHook.cls ? cellHook.cls + ',' : '') + names[i];
    }
    return cellHook.done;
  }
  // Fallback when the hook finds nothing: the transfer list page shows exactly the items of
  // requestTransferItems. Read them (at most every 45 s, only while such rows are on screen),
  // then line them up with the rows. A line-up is used only if every
  // row's rating (and Buy Now, where the row shows one) matches its item.
  var tpAlign = { at: 0, busy: false, n: 0, ok: false, tried: 0 };
  function rowSig(row) {
    var r = row.querySelector('.playerOverview .rating'), nums = [], vs = row.querySelectorAll('.auction .value, .auctionValue .value, .auction .currency-coins');
    for (var i = 0; i < vs.length; i++) { var v = parseCoins(vs[i].textContent.trim()); if (v > 0) nums.push(v); }
    return { rating: r ? Number(r.textContent.trim()) || null : null, nums: nums };
  }
  function sigMatch(sig, it) {
    var rt = ratingOf(it); if (sig.rating && rt && sig.rating !== rt) return false;
    var bn = (it._auction || {}).buyNowPrice; if (sig.nums.length && bn > 0 && sig.nums.indexOf(bn) < 0) return false;
    return true;
  }
  function tpOrders(items) {
    var by = { closed: [], expired: [], unlisted: [], active: [] };
    items.forEach(function (it) { var s = tradeStateOf(it); by[s === 'closed' ? 'closed' : s === 'active' ? 'active' : isExpired(it) ? 'expired' : 'unlisted'].push(it); });
    var act = by.active.slice().sort(function (a, b) { return (expiresOf(a) || 0) - (expiresOf(b) || 0); });
    var out = [items];
    [['closed', 'expired', 'unlisted', 'active'], ['closed', 'active', 'expired', 'unlisted'], ['closed', 'unlisted', 'expired', 'active'], ['active', 'expired', 'unlisted', 'closed']].forEach(function (o) {
      out.push([].concat.apply([], o.map(function (k) { return by[k]; }))); out.push([].concat.apply([], o.map(function (k) { return k === 'active' ? act : by[k]; })));
    });
    return out;
  }
  function alignRows(rows) {
    if (tpAlign.busy || (Date.now() - tpAlign.at < 45000 && tpAlign.n === rows.length)) return;
    tpAlign.busy = true; tpAlign.at = Date.now(); tpAlign.n = rows.length; tpAlign.tried++;
    transferItems().then(function (items) {
      tpAlign.busy = false; tpAlign.ok = false;
      if (items) tpAlign.sample = items.slice(0, 4).map(function (it) { return { rating: ratingOf(it), state: tradeStateOf(it), buyNow: (it._auction || {}).buyNowPrice, lastSalePrice: it.lastSalePrice }; });
      tpAlign.items = items ? items.length : null; tpAlign.rows = rows.length;
      if (!items || items.length !== rows.length) return;
      var sigs = []; for (var i = 0; i < rows.length; i++) sigs.push(rowSig(rows[i]));
      var cands = tpOrders(items);
      for (var c = 0; c < cands.length; c++) {
        var ok = true; for (var j = 0; j < rows.length && ok; j++) ok = sigMatch(sigs[j], cands[c][j]);
        if (ok) { for (var k = 0; k < rows.length; k++) rows[k].__fsGuess = cands[c][k]; tpAlign.ok = true; break; }
      }
      paintBadges();
    }, function () { tpAlign.busy = false; });
  }
  function rowItem(row) {
    if (row.__fsItem) return row.__fsItem;
    if (row.__fsGuess) return row.__fsGuess;
    var el = row.querySelector('[data-fs-id]') || (row.closest && row.closest('[data-fs-id]'));
    return el ? el.__fsItem || null : null;
  }
  // {profit, sold} for a row's card, or null (unknown cost / no price).
  function rowProfit(it) {
    if (!it || it.id == null) return null;
    var id = String(it.id), b = ledger.buys[id];
    if (b) { var a = it._auction || {}, price = tradeStateOf(it) === 'closed' ? salePriceOf(it) : (a.buyNowPrice > 0 ? a.buyNowPrice : b.list); return price > 0 ? { profit: profitAt(price, b.buy), price: price } : null; }
    for (var i = 0; i < ledger.sales.length && i < 300; i++) if (ledger.sales[i].id === id && ledger.sales[i].profit != null) return { profit: ledger.sales[i].profit, price: ledger.sales[i].sold, sold: true };
    // Bought by hand: EA keeps the price the card last changed hands for (lastSalePrice) = what
    // you paid, as long as it hasn't sold again. Packed cards have 0 -> no tag.
    var paid = Number(it.lastSalePrice) || 0, a2 = it._auction || {};
    if (paid > 0 && tradeStateOf(it) !== 'closed' && a2.buyNowPrice > 0) return { profit: profitAt(a2.buyNowPrice, paid), price: a2.buyNowPrice, manual: true };
    return null;
  }
  function paintProfitTag(host, card, it) {
    var t = host.querySelector('.fs-badge.pf'), rp = rowProfit(it);
    if (!rp) { if (t) t.parentNode.removeChild(t); return; }
    if (!t) { t = document.createElement('div'); t.className = 'fs-badge pf'; host.appendChild(t); }
    var text = (rp.profit >= 0 ? '+' : '−') + fmt(Math.abs(rp.profit)), cls = 'fs-badge pf' + (rp.profit < 0 ? ' neg' : '');
    if (t.textContent !== text) t.textContent = text; if (t.className !== cls) t.className = cls;
    var hr = host.getBoundingClientRect(), cr = card.getBoundingClientRect(); if (!cr.width || !hr.width) return;
    var left = Math.round(Math.max(2, cr.left - hr.left + cr.width / 2 - t.offsetWidth / 2)) + 'px', top = Math.round(Math.max(0, cr.top - hr.top - t.offsetHeight * 0.4)) + 'px';
    if (t.style.left !== left) t.style.left = left; if (t.style.top !== top) t.style.top = top;
  }
  function removeBadges() { try { var b = document.querySelectorAll('.fs-badge'); for (var i = 0; i < b.length; i++) b[i].parentNode && b[i].parentNode.removeChild(b[i]); } catch (e) {} }
  // The "AVG" row of the card's stats view, e.g. "61.3K".
  function avgLabelOf(row) {
    var rows = row.querySelectorAll('.ut-item-view--stats .ut-item-row');
    for (var i = 0; i < rows.length; i++) {
      var l = rows[i].querySelector('.ut-item-row-label--left'), v = rows[i].querySelector('.ut-item-row-label.coin');
      if (v && (!l || /avg/i.test(l.textContent))) return v.textContent.trim();
    }
    return null;
  }
  // The tag lives on the row (EA shrinks the card itself and would clip anything inside it) and
  // is placed by measuring where the card really is: centred on the card's bottom edge.
  function placeBadge(b, host, card) {
    var hr = host.getBoundingClientRect(), cr = card.getBoundingClientRect();
    if (!cr.width || !hr.width) return;
    var left = Math.round(Math.max(2, cr.left - hr.left + cr.width / 2 - b.offsetWidth / 2)) + 'px';
    var top = Math.round(cr.bottom - hr.top - b.offsetHeight * 0.6) + 'px';
    if (b.style.left !== left) b.style.left = left;
    if (b.style.top !== top) b.style.top = top;
  }
  function doPaintBadges() {
    if (badgeObs) badgeObs.disconnect();
    try {
      var rows = document.querySelectorAll(ROW_SEL), hooked = 0;
      for (var h = 0; h < rows.length; h++) if (rows[h].__fsItem || rows[h].__fsGuess || rows[h].querySelector('[data-fs-id]')) hooked++;
      if (rows.length && !hooked && rows.length <= 100) alignRows(rows);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i], host = row.querySelector('.rowContent') || row;
        var card = row.querySelector('.entityContainer canvas') || row.querySelector('.entityContainer') || row;
        try { if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) {}
        paintProfitTag(host, card, rowItem(row));
        var label = avgLabelOf(row), b = host.querySelector('.fs-badge:not(.pf)');
        if (!(parseCoins(label) > 0)) { if (b) b.parentNode.removeChild(b); continue; }
        var text = '≈ ' + label;
        if (!b) {
          try { if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) {}
          b = document.createElement('div'); b.className = 'fs-badge'; host.appendChild(b);
        }
        if (b.textContent !== text) b.textContent = text;
        placeBadge(b, host, card);
      }
    } catch (e) {}
    if (badgeObs) { try { badgeObs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {} }
  }
