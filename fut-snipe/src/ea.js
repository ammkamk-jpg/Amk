  // ---------- EA services ----------
  function svc() { return window.services || (window.App && window.App.services) || null; }
  function haveServices() { var s = svc(); return !!(s && s.Item && s.Item.searchTransferMarket && s.Item.bid && s.User && s.User.getUser); }
  function coins() { try { return svc().User.getUser().coins.amount; } catch (e) { return null; } }

  // Remember the user's own market search so Start knows which player to trade.
  function wrapSearch() {
    var s = svc(); if (!s || !s.Item || s.Item.__futWrapped) return;
    ['searchTransferMarket', 'search'].forEach(function (name) {
      if (typeof s.Item[name] !== 'function') return;
      var orig = s.Item[name].bind(s.Item);
      s.Item[name] = function (criteria) { try { if (criteria && !criteria.__fromUs) { capturedCriteria = criteria; capturedPlain = plainCriteria(criteria); capturedName = readSearchName(); render(); } } catch (e) {} return orig.apply(null, arguments); };
    });
    s.Item.__futWrapped = true;
  }

  var URLMAP = { num: 'count', start: 'start', type: 'type', maskedDefId: 'maskedDefId', cat: 'category', lev: 'level', maxb: 'maxBuy', minb: 'minBuy', micr: 'minBid', macr: 'maxBid', pos: 'preferredPosition', zone: 'zone', nat: 'nationality', leag: 'league', team: 'team', playStyle: 'playStyle', rarities: 'rarities' };
  var FIELDS = ['type', 'category', 'level', 'maskedDefId', 'defId', 'preferredPosition', 'zone', 'nationality', 'league', 'team', 'playStyle', 'rarities', 'minBid', 'maxBid', 'minBuy', 'maxBuy', 'count'];
  function plainCriteria(c) { var o = {}; try { FIELDS.forEach(function (k) { if (c[k] !== undefined && c[k] !== null && c[k] !== '') o[k] = c[k]; }); } catch (e) {} return o; }
  function criteriaFromUrl(u) {
    try { var q = u.split('?')[1]; if (!q) return null; var o = { __fromUs: true };
      q.split('&').forEach(function (kv) { var p = kv.split('='), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || ''), key = URLMAP[k]; if (!key) return; var n = Number(v); o[key] = (v !== '' && !isNaN(n)) ? n : v; });
      return Object.keys(o).length > 1 ? o : null;
    } catch (e) { return null; }
  }
  function ctor() { return window.UTSearchCriteriaDTO || (window.App && window.App.UTSearchCriteriaDTO) || null; }
  function applyFields(t, s) { for (var k in s) { if (k !== '__fromUs' && s[k] !== undefined && s[k] !== '') { try { t[k] = s[k]; } catch (e) {} } } return t; }
  // The user's search (player, rarity, ...) but with OUR prices: their own max-buy / min-buy /
  // bid filters are dropped so they can't skew the price check. maxBuy 0 = no limit.
  function buildCriteria(maxBuy, minBuy, minBid) {
    var out;
    if (capturedCriteria && !searchBase) out = Object.assign(Object.create(Object.getPrototypeOf(capturedCriteria)), capturedCriteria);
    else { var C = ctor(); var src = searchBase || capturedFromUrl || capturedPlain || { type: 'player', category: 'any', count: 50 }; out = C ? applyFields(new C(), src) : Object.assign({}, src); }
    try { out.minBuy = minBuy > 0 ? minBuy : 0; out.minBid = minBid > 0 ? minBid : 0; out.maxBid = 0; out.maxBuy = maxBuy > 0 ? maxBuy : 0; out.offset = 0; } catch (e) {}
    out.__fromUs = true; return out;
  }
  function haveSearch() { return !!(capturedCriteria || capturedFromUrl || capturedPlain); }
  function priceOf(it) { return it && ((it._auction && it._auction.buyNowPrice) != null ? it._auction.buyNowPrice : (it.buyNowPrice != null ? it.buyNowPrice : (it.buyNow != null ? it.buyNow : null))); }
  function defIdOf(it) { try { return (it.definitionId != null ? it.definitionId : (it._staticData && it._staticData.id) || (it.resourceId) || (it.id)) || null; } catch (e) { return null; } }
  function expiresOf(it) { try { var a = it._auction || {}; if (a.expires != null) return a.expires; if (a.timeRemaining != null) return a.timeRemaining; var et = it.endTime || a.endTime; if (et) { var now = Date.now(); if (et > 1e12) return Math.round((et - now) / 1000); if (et > 1e9) return Math.round((et * 1000 - now) / 1000); } return null; } catch (e) { return null; } }
  function ratingOf(it) { try { var r = it.rating != null ? it.rating : (it._staticData && it._staticData.rating); return r > 0 ? r : null; } catch (e) { return null; } }
  function nameOf(it) { try { return (it._staticData && it._staticData.name) || it.name || (it.getStaticData && it.getStaticData().name) || null; } catch (e) { return null; } }
  // ---------- player name (instead of "player #231747") ----------
  // 1) the name in the market search box when you searched, 2) EA's own static player data,
  // 3) EA's item lookup by id (async), 4) the first search result (doSearch sets curName).
  var capturedName = null;
  function searchedDefId() { var c = capturedPlain || capturedFromUrl; return c ? (c.maskedDefId || null) : null; }
  function readSearchName() {
    try {
      var el = document.querySelector('.ut-player-search-control input, .ut-player-search-control--input-container input, input.ut-text-input-control');
      var v = el && el.value && el.value.trim(); return v && v.length > 1 && v.length < 40 ? v : null;
    } catch (e) { return null; }
  }
  function staticName(defId) {
    try {
      var R = window.repositories && window.repositories.Item, d = R && R.getStaticDataByDefId && R.getStaticDataByDefId(defId);
      if (d) return d.name || (d.lastName ? ((d.firstName ? d.firstName.charAt(0) + '. ' : '') + d.lastName) : null);
    } catch (e) {}
    return null;
  }
  function resolveName() {
    var id = searchedDefId(); if (!id) return;
    curName = curName || staticName(id) || capturedName;
    if (curName || !svc().Item.requestItemByDefId) return;
    try {
      svc().Item.requestItemByDefId(id).observe(OBS, function (s, r) {
        try { var d = r && (r.data || r.response) || {}, it = d.item || (d.items && d.items[0]) || d; var n = nameOf(it); if (n && !curName) { curName = n; render(); } } catch (e) {}
      });
    } catch (e) {}
  }
  function searchLabel() { if (curName) return curName; var id = searchedDefId() || stats.curDefId; return id ? ('player #' + id) : 'player'; }
  function sessionNet() { return (startCoins != null && coins() != null) ? coins() - startCoins : null; }

  // EA's allowed price range per card. Read from (a) the item itself, (b) the requestMarketData
  // response, or (c) any /pricelimits response the web app loads (see the XHR hook). Cached by
  // item id and by card id; the last raw response shape goes into the diagnostics.
  var limitsCache = {}, limitsDebug = null;
  function readLimitsObj(o) {
    if (!o) return null;
    var mn = o.minimum != null ? o.minimum : o.minPrice != null ? o.minPrice : o.min, mx = o.maximum != null ? o.maximum : o.maxPrice != null ? o.maxPrice : o.max;
    return mx > 0 ? { min: mn || 0, max: mx } : null;
  }
  function rememberLimits(list) {
    (list || []).forEach(function (x) { var l = readLimitsObj(x); if (!l) return; if (x.itemId != null) limitsCache['i' + x.itemId] = l; if (x.defId != null) limitsCache['d' + x.defId] = l; });
  }
  function cachedLimits(item) { return limitsCache['i' + item.id] || limitsCache['d' + defIdOf(item)] || null; }
  function priceLimits(item) {
    return new Promise(function (res) {
      var fromItem = function () { try { return (item.getPriceLimits && readLimitsObj(item.getPriceLimits())) || readLimitsObj(item._itemPriceLimits); } catch (e) { return null; } };
      var have = cachedLimits(item) || fromItem(); if (have) return res(have);
      try {
        if (!svc().Item.requestMarketData) return res(null);
        var to = setTimeout(function () { res(cachedLimits(item) || fromItem()); }, 8000);
        svc().Item.requestMarketData(item).observe(OBS, function (s, r) {
          clearTimeout(to);
          try {
            var d = r && (r.data || r.response); limitsDebug = d ? Object.keys(d).slice(0, 12) : null;
            if (d) rememberLimits(Array.isArray(d) ? d : (d.itemPriceLimits || d.priceLimits || d.items || [d]));
          } catch (e) {}
          var l = cachedLimits(item) || fromItem(); if (l) { limitsCache['i' + item.id] = l; limitsCache['d' + defIdOf(item)] = l; }
          res(l);
        });
      } catch (e) { res(null); }
    });
  }

  function classify(resp, http) {
    var code = (resp && (resp.status || resp.error || (resp.data && resp.data.code))) || http || 0;
    if (code === 429) return { stop: true, msg: 'EA soft-ban (429) — wait, then restart' };
    if (code === 459 || code === 460 || /captcha/i.test(JSON.stringify(resp || ''))) return { stop: true, msg: 'Captcha — solve it, then restart' };
    if (code === 461 || code === 462 || code === 478) return { stop: false, msg: 'already gone' };
    if (code === 473) return { stop: false, msg: 'list full' };
    if (code === 494) return { stop: true, msg: 'account blocked' };
    return { stop: false, msg: 'request failed (' + code + ')' };
  }
  // One market search. Returns {ok, items: [{it, p, secs}] sorted cheapest first}.
  function doSearch(maxBuy, minBuy, minBid) {
    return new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
      var to = setTimeout(function () { finish({ ok: false, items: [], err: { msg: 'search timeout' } }); }, 15000);
      try { try { svc().Item.clearTransferMarketCache(); } catch (e) {}
        svc().Item.searchTransferMarket(buildCriteria(maxBuy, minBuy, minBid), 1).observe(OBS, function (sender, resp) {
          clearTimeout(to);
          var raw = (resp && ((resp.data && resp.data.items) || (resp.response && resp.response.items))) || [];
          var ok = !!(resp && (resp.success === true || (resp.success == null && resp.status != null && resp.status < 400) || raw.length));
          if (!ok) return finish({ ok: false, items: [], err: classify(resp) });
          if (raw.length && !sampleKeys.length) { try { sampleKeys = Object.keys(raw[0]); samplePrice = priceOf(raw[0]); } catch (e) {} }
          var items = [];
          for (var i = 0; i < raw.length; i++) {
            var p = priceOf(raw[i]); if (!(p > 0)) continue;
            if (matchId != null && String(defIdOf(raw[i])) !== String(matchId)) continue; // pricing one exact card version
            items.push({ it: raw[i], p: p, secs: expiresOf(raw[i]) });
          }
          items.sort(function (a, b) { return a.p - b.p; });
          if (items.length && !curName) { // name from a result of the searched card itself, not a special version of it
            var base = searchedDefId(), own = items.filter(function (x) { return !base || String(defIdOf(x.it)) === String(base); })[0] || items[0];
            curName = nameOf(own.it) || curName; stats.curDefId = defIdOf(own.it) || stats.curDefId;
          }
          finish({ ok: true, items: items });
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
  function moveToTransfer(item) { return new Promise(function (res) { try { var P = window.ItemPile && window.ItemPile.TRANSFER; if (P == null || !svc().Item.move) return res(false); svc().Item.move(item, P).observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }
  function listItem(item, start, buyNow, dur) { return new Promise(function (res) { try { if (!svc().Item.list) return res(false); svc().Item.list(item, start, buyNow, dur).observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { return res(false); } }); }

  // Transfer list: expired (unsold) cards, and EA's own "Re-list all" (same price + duration as before).
  function isExpired(it) { try { var a = it._auction || {}; return a.tradeState === 'expired' || (it.getAuctionData && it.getAuctionData().isExpired && it.getAuctionData().isExpired()); } catch (e) { return false; } }
  function transferItems() { return new Promise(function (res) { try { if (!svc().Item.requestTransferItems) return res(null); svc().Item.requestTransferItems().observe(OBS, function (s, r) { res(r && r.success ? ((r.data && r.data.items) || (r.response && r.response.items) || []) : null); }); } catch (e) { res(null); } }); }
  function tradeStateOf(it) { try { return (it._auction && it._auction.tradeState) || (it.getAuctionData && it.getAuctionData().tradeState) || null; } catch (e) { return null; } }
  function isSold(it) { return tradeStateOf(it) === 'closed'; }
  function salePriceOf(it) { var a = (it && it._auction) || {}; return a.currentBid > 0 ? a.currentBid : (a.buyNowPrice > 0 ? a.buyNowPrice : 0); }
  function isTradable(it) { try { if (typeof it.isTradeable === 'function') return !!it.isTradeable(); } catch (e) {} return it.tradable !== false && !(it.untradeableCount > 0); }
  function isPlayer(it) { try { return it.type === 'player' || (typeof it.isPlayer === 'function' && it.isPlayer()); } catch (e) { return false; } }
  function unassignedItems() { return new Promise(function (res) { try { if (!svc().Item.requestUnassignedItems) return res(null); svc().Item.requestUnassignedItems().observe(OBS, function (s, r) { res(r && r.success ? ((r.data && r.data.items) || (r.response && r.response.items) || []) : null); }); } catch (e) { res(null); } }); }
  function clearSold() { return new Promise(function (res) { try { if (!svc().Item.clearSoldItems) return res(false); svc().Item.clearSoldItems().observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }
  function relistAllExpired() { return new Promise(function (res) { try { if (!svc().Item.relistExpiredAuctions) return res(false); svc().Item.relistExpiredAuctions().observe(OBS, function (s, r) { res(!!(r && r.success)); }); } catch (e) { res(false); } }); }

  // Remembers the user's market searches (URL) and stops the bot on a 429.
  (function hookXHR() {
    var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { var u = String(self.__u || ''), get = (self.__m || 'GET').toUpperCase() === 'GET';
          if (/transfermarket\?/i.test(u) && get) {
            tmUrls.unshift(u); tmUrls = tmUrls.slice(0, 5);
            if (!running) { var c = criteriaFromUrl(u); if (c) { capturedFromUrl = c; capturedName = readSearchName(); render(); } } // the bot's own searches don't count
          }
          if (/pricelimits/i.test(u) && self.status === 200) { try { var pl = self.responseType === 'json' ? self.response : JSON.parse(self.responseText); rememberLimits(Array.isArray(pl) ? pl : (pl && (pl.itemPriceLimits || pl.priceLimits)) || []); } catch (e) {} }
          if (/transfermarket|\/trade/i.test(u) && self.status === 429) { var r = self.getResponseHeader && self.getResponseHeader('Retry-After'); requestStop('EA soft-ban (429)' + (r ? ', retry after ' + r + 's' : '') + ' — wait, then restart'); }
        } catch (e) {}
      });
      return send.apply(this, arguments);
    };
  })();
