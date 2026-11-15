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
  var cellHook = { done: false, cls: null };
  function hookCells() {
    if (cellHook.done) return true;
    var names = ['UTItemTableCellView', 'UTItemTableCellViewWithChem', 'UTTransferListItemView'];
    for (var i = 0; i < names.length; i++) {
      var C = window[names[i]]; if (!C || !C.prototype || typeof C.prototype.render !== 'function' || C.prototype.__fsHooked) continue;
      (function (P) {
        var orig = P.render;
        P.render = function (item) {
          var r = orig.apply(this, arguments);
          try { var root = (this.getRootElement && this.getRootElement()) || this.__root || this._root; if (root && item && item.id != null) { root.__fsItem = item; root.setAttribute('data-fs-id', String(item.id)); } } catch (e) {}
          paintBadges(); return r;
        };
        P.__fsHooked = true;
      })(C.prototype);
      cellHook.done = true; cellHook.cls = names[i];
    }
    return cellHook.done;
  }
  function rowItem(row) {
    if (row.__fsItem) return row.__fsItem;
    var el = row.querySelector('[data-fs-id]') || (row.closest && row.closest('[data-fs-id]'));
    return el ? el.__fsItem || null : null;
  }
  // {profit, sold} for a row's card, or null (unknown cost / no price).
  function rowProfit(it) {
    if (!it || it.id == null) return null;
    var id = String(it.id), b = ledger.buys[id];
    if (b) { var a = it._auction || {}, price = tradeStateOf(it) === 'closed' ? salePriceOf(it) : (a.buyNowPrice > 0 ? a.buyNowPrice : b.list); return price > 0 ? { profit: profitAt(price, b.buy), price: price } : null; }
    for (var i = 0; i < ledger.sales.length && i < 300; i++) if (ledger.sales[i].id === id && ledger.sales[i].profit != null) return { profit: ledger.sales[i].profit, price: ledger.sales[i].sold, sold: true };
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
      var rows = document.querySelectorAll(ROW_SEL);
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
