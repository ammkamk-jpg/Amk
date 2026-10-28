  // ---------- Live Filters + diagnostics ----------
  function saveCurrentFilter() {
    var crit = capturedPlain || capturedFromUrl; if (!crit) { blockMsg = 'Search a player once first, then save it as a filter.'; render(); return; }
    var name = (window.prompt && window.prompt('Name this filter', 'Filter ' + (filters.length + 1))) || ('Filter ' + (filters.length + 1));
    filters.unshift({ name: name, crit: Object.assign({}, crit) }); filters = filters.slice(0, 40); lsSet(FILT_KEY, filters); render();
  }
  function loadFilter(i) { var f = filters[i]; if (!f || running) return; capturedFromUrl = Object.assign({ __fromUs: true }, f.crit); capturedCriteria = null; capturedPlain = Object.assign({}, f.crit); tab = 'snipe'; blockMsg = ''; log('loaded filter: ' + f.name); render(); }
  function deleteFilter(i) { filters.splice(i, 1); lsSet(FILT_KEY, filters); render(); }

  function diag() {
    try { var row = document.querySelector('li.listFUTItem, .listFUTItem'); if (row) lastCardHTML = row.outerHTML.slice(0, 2500); } catch (e) {}
    var s = svc(), I = s && s.Item;
    var fnNames = function (o) { var out = {}; try { for (var p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach(function (k) { try { if (k !== 'constructor' && typeof o[k] === 'function') out[k] = 1; } catch (e) {} }); } catch (e) {} return Object.keys(out).sort(); };
    var rows = document.querySelectorAll(ROW_SEL), withAvg = 0;
    for (var i = 0; i < rows.length; i++) if (parseCoins(avgLabelOf(rows[i])) > 0) withAvg++;
    var d = { version: VERSION, servicesFound: !!s, services: s ? Object.keys(s).sort() : [], itemMethods: I ? fnNames(I) : [], criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedPlain: capturedPlain, phase: phase, market: market, minProfit: cfg.minProfit, listDur: cfg.listDur, speed: cfg.speed, reprobeEvery: cfg.reprobeEvery, cheapest: stats.cheapest, curName: curName, curDefId: stats.curDefId, eaMin: stats.eaMin, eaMax: stats.eaMax, sessionNet: sessionNet(), lifetime: life, filtersSaved: filters.length, sessionsLogged: sessions.length, cardRows: rows.length, cardRowsWithAvg: withAvg, firstAvg: rows.length ? avgLabelOf(rows[0]) : null, badgesPainted: document.querySelectorAll('.fs-badge').length, lastBuy: lastBuy, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, marketCardHTML: lastCardHTML, recentMarketUrls: tmUrls, stopReason: stopReason, priceLimitsResponse: limitsDebug, priceLimitsCached: Object.keys(limitsCache).length, hub: { at: hub.at, total: hub.total, sold: hub.sold, expired: hub.expired }, settings: { afterBuy: cfg.afterBuy, repriceExpired: cfg.repriceExpired, relistExpired: cfg.relistExpired, clearSold: cfg.clearSold, varyMinBid: cfg.varyMinBid, tooManyStop: cfg.tooManyStop, rangeStop: cfg.rangeStop, keepSpecials: cfg.keepSpecials } };
    var text = 'TangaTolga Sniper diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }
