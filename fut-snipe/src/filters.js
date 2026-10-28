  // ---------- Live Filters + diagnostics ----------
  function saveCurrentFilter() {
    var crit = capturedPlain || capturedFromUrl; if (!crit) { blockMsg = 'Search a player once first, then save it as a filter.'; render(); return; }
    var name = (window.prompt && window.prompt('Name this filter', 'Filter ' + (filters.length + 1))) || ('Filter ' + (filters.length + 1));
    filters.unshift({ name: name, crit: Object.assign({}, crit) }); filters = filters.slice(0, 40); lsSet(FILT_KEY, filters); render();
  }
  function loadFilter(i) { var f = filters[i]; if (!f || running) return; capturedFromUrl = Object.assign({ __fromUs: true }, f.crit); capturedCriteria = null; capturedPlain = Object.assign({}, f.crit); tab = 'snipe'; blockMsg = ''; log('loaded filter: ' + f.name); render(); }
  function deleteFilter(i) { filters.splice(i, 1); lsSet(FILT_KEY, filters); render(); }

  function diag() {
    try { var row = document.querySelector('li.listFUTItem, .listFUTItem'); if (row) lastCardHTML = row.outerHTML.slice(0, 1200); } catch (e) {}
    var s = svc(), I = s && s.Item;
    var d = { version: VERSION, servicesFound: !!s, itemMethods: I ? ['searchTransferMarket', 'search', 'bid', 'list', 'move', 'requestMarketData', 'clearTransferMarketCache'].filter(function (m) { return typeof I[m] === 'function'; }) : [], criteriaCtor: !!ctor(), userReadable: coins() != null, capturedCriteria: !!capturedCriteria, capturedPlain: capturedPlain, phase: phase, market: market, minProfit: cfg.minProfit, listDur: cfg.listDur, speed: cfg.speed, cheapest: stats.cheapest, curName: curName, curDefId: stats.curDefId, eaMin: stats.eaMin, eaMax: stats.eaMax, sessionNet: sessionNet(), lifetime: life, filtersSaved: filters.length, sessionsLogged: sessions.length, pricesCached: Object.keys(priceCache).length, badgesPainted: document.querySelectorAll('.fs-badge').length, lastBuy: lastBuy, sampleItemKeys: sampleKeys.slice(0, 40), samplePrice: samplePrice, marketCardHTML: lastCardHTML, recentMarketUrls: tmUrls };
    var text = 'FUT Snipe diagnostics\n' + JSON.stringify(d, null, 2);
    try { navigator.clipboard.writeText(text); log('diagnostics copied'); } catch (e) { log('clipboard blocked — see console'); }
    try { console.log(text); } catch (e) {}
    render();
  }
