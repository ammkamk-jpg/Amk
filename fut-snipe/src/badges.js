  // ---------- price tags on cards ----------
  // Prices come from EA's own market: the bot's price check, plus the cheapest Buy Now seen in
  // any transfer-market search (see recordMarketPrices). No extra EA calls just for tags.
  var badgeTimer = null, badgeObs = null;
  var ROW_SEL = 'li.listFUTItem, .listFUTItem, ul.paginated > li, .ut-club-search-results-view li, .itemList > li';
  var RESULTS_SEL = '.SearchResults, .ut-search-results, [class*="SearchResults"], [class*="search-results"]';
  function startBadgeObserver() {
    if (badgeObs || !window.MutationObserver || !document.body) return;
    badgeObs = new MutationObserver(function () { paintBadges(); });
    try { badgeObs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  function paintBadges() { if (!cfg.badges || badgeTimer) return; badgeTimer = setTimeout(function () { badgeTimer = null; doPaintBadges(); }, 300); }
  function removeBadges() { try { var b = document.querySelectorAll('.fs-badge'); for (var i = 0; i < b.length; i++) b[i].parentNode && b[i].parentNode.removeChild(b[i]); } catch (e) {} }
  // Best-effort read of the card ids from a rendered card (varies across web-app versions).
  function cardIds(el) {
    var out = [];
    try {
      if (!el || !el.getAttribute) return out;
      ['data-definition-id', 'data-def-id', 'data-resource-id', 'data-asset-id'].forEach(function (a) { var v = el.getAttribute(a); if (v) out.push(v); });
      var imgs = el.querySelectorAll ? el.querySelectorAll('img') : [];
      for (var i = 0; i < imgs.length; i++) { var m = (imgs[i].getAttribute('src') || '').match(/\/(?:p)?(\d{3,10})\.(?:png|webp|avif)/); if (m) out.push(m[1]); }
    } catch (e) {}
    return out;
  }
  function priceForRow(row, art) {
    var ids = cardIds(row).concat(cardIds(art));
    for (var i = 0; i < ids.length; i++) { var p = cachedPrice(ids[i]); if (p) return p; }
    // Market results for the searched player: every row is that player.
    if (!ids.length && stats.curDefId && row.closest && row.closest(RESULTS_SEL)) return cachedPrice(stats.curDefId);
    return null;
  }
  function doPaintBadges() {
    if (badgeObs) badgeObs.disconnect();
    try {
      var rows = document.querySelectorAll(ROW_SEL);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var art = row.querySelector('.ut-item-view, .cardView, .playerCard, .entityContainer, .player') || row;
        var price = priceForRow(row, art), old = art.querySelector && art.querySelector('.fs-badge');
        if (!(price > 0)) { if (old) old.parentNode.removeChild(old); continue; }
        var text = '≈ ' + fmt(price);
        if (old) { if (old.textContent !== text) old.textContent = text; continue; }
        try { var cs = window.getComputedStyle(art); if (cs && cs.position === 'static') art.style.position = 'relative'; } catch (e) {}
        var b = document.createElement('div'); b.className = 'fs-badge'; b.textContent = text;
        art.appendChild(b);
      }
    } catch (e) {}
    if (badgeObs) { try { badgeObs.observe(document.body, { childList: true, subtree: true }); } catch (e) {} }
  }
