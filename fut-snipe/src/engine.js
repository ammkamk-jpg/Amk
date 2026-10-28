  // ---------- the one-button run: check price -> snipe -> relist -> re-check ----------
  function recordSession() {
    var net = sessionNet();
    if (stats.buys > 0 || (net != null && net !== 0)) {
      sessions.unshift({ t: Date.now(), buys: stats.buys, spent: stats.spent, est: stats.est, net: net });
      sessions = sessions.slice(0, 60); lsSet(SESS_KEY, sessions);
    }
  }
  function requestStop(reason) { if (!running) return; running = false; phase = 'idle'; stopReason = reason; recordSession(); say('STOP: ' + reason); render(); }

  // Human-like gap between searches; returns false if stopped while waiting.
  async function pace() {
    var w = Math.max(HARD_FLOOR_MS, cfg.searchMinMs + rand(0, cfg.searchJitterMs));
    for (var x = 0; x < w && running; x += 250) await sleep(250);
    return running;
  }
  // A counted, paced search. null = the run stopped (captcha / 429 / Stop).
  async function search(maxBuy) {
    if (!(await pace())) return null;
    var r = await doSearch(maxBuy); if (!running) return null;
    stats.searches++; stats.sinceBreak++;
    if (!r.ok) { if ((r.err || {}).stop) { requestStop(r.err.msg); return null; } log('search: ' + ((r.err || {}).msg || '—')); }
    if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0].it).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
    return r;
  }

  // Price check: search with NO max-buy; its dearest listing is the ceiling. Then binary-search max-buy down until only
  // a few listings are left (the cheapest ones), and take the 2nd-cheapest fresh one as the price.
  async function checkPrice() {
    phase = 'checking'; market.probeMax = 0; market.probeCount = null;
    say('Checking price for ' + searchLabel() + '…'); render();
    var r = await search(0); if (!r) return false;
    if (!r.ok || !r.items.length) { say('Checking price: ' + searchLabel() + ' - none listed yet'); return false; }
    var lo = stats.eaMin > 0 ? Math.max(0, stats.eaMin - stepFor(stats.eaMin)) : 0, hi = r.items[r.items.length - 1].p, hiItems = null, few = null;
    var asListings = function (items) { return items.map(function (x) { return { price: x.p, secs: x.secs }; }); };
    if (probeVerdict(asListings(r.items)) === 'few') few = r.items; // tiny market: the unfiltered search already is "a few"
    for (var tries = 0; !few && tries < 14 && running; tries++) {
      var mid = probeMid(lo, hi); if (!mid) break;
      var pr = await search(mid); if (!pr) return false;
      if (!pr.ok) continue;
      market.probeMax = mid; market.probeCount = pr.items.length;
      var v = probeVerdict(asListings(pr.items));
      log('price check: max ' + fmt(mid) + ' -> ' + (pr.items.length > FEW ? FEW + '+' : pr.items.length) + ' listings'); render();
      if (v === 'none') lo = mid; else if (v === 'many') { hi = mid; hiItems = pr.items; } else few = pr.items;
    }
    if (!running) return false;
    if (!few) { // lo and hi are neighbouring prices: the listings at hi are the cheapest there are
      if (!hiItems) { var hr = await search(hi); if (!hr) return false; hiItems = hr.ok ? hr.items : []; }
      few = hiItems;
    }
    var pick = pickMarketPrice(asListings(few));
    if (!pick) { say('Checking price: ' + searchLabel() + ' - none found'); return false; }
    var sp = snipePoint(pick.price, cfg.minProfit);
    if (!sp) { requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(pick.price) + ' card'); return false; }
    market.price = pick.price; market.fresh = pick.fresh; market.snipe = sp; market.checkedAt = Date.now();
    stats.sinceCheck = 0; cachePrice(stats.curDefId, pick.price, true); saveCacheSoon(); paintBadges();
    say('Price ' + searchLabel() + ': ' + fmt(pick.price) + (pick.fresh ? '' : ' (no fresh listings)') + ' -> snipe <= ' + fmt(sp) + ', list ' + fmt(pick.price) + ', +' + fmt(profitAt(pick.price, sp)) + '/card');
    phase = 'running'; render();
    return true;
  }

  async function relist(item, buy) {
    if (!cfg.autoList) return;
    var sell = market.price; if (!(sell > 0)) return;
    await sleep(rand(1500, 4000)); // still lists if you tap Stop meanwhile: a bought card shouldn't sit unlisted
    var moved = await moveToTransfer(item);
    await sleep(rand(600, 1200));
    var ok = await listItem(item, Math.max(MIN_PRICE, sell - stepFor(sell)), sell, cfg.listDur || 3600);
    say(ok ? (searchLabel() + ' listed for ' + fmt(sell) + ' (' + durLabel(cfg.listDur) + ')') : ('relist failed' + (moved ? '' : ' (move failed)') + ' - list it by hand'));
  }

  // Buy everything at or below the snipe point (any freshness), then relist each one.
  async function snipeOnce() {
    var r = await search(market.snipe); if (!r) return;
    if (!r.ok) return;
    stats.cheapest = r.items.length ? r.items[0].p : stats.cheapest;
    var bought = 0;
    for (var j = 0; j < r.items.length && running; j++) {
      var price = r.items[j].p; if (price > market.snipe) break;
      var bal = coins(); if (bal != null && price > bal) { log('not enough coins for ' + fmt(price)); continue; }
      var b = await doBuy(r.items[j].it, price); if (!running) return;
      if (b.ok) {
        var e = profitAt(market.price, price);
        stats.buys++; bought++; addDaily(1); lastBuy = 'ok ' + price;
        stats.spent += price; stats.est += e; life.bought++; life.spent += price; life.est += e; saveLife();
        say(searchLabel() + ' sniped for ' + fmt(price) + ' (est +' + fmt(e) + ')'); render();
        await relist(r.items[j].it, price);
      } else { lastBuy = (b.err && b.err.msg) || 'failed'; log('buy ' + fmt(price) + ': ' + lastBuy); if ((b.err || {}).stop) return requestStop(b.err.msg); }
      if (stats.buys >= cfg.sessionBuyCap) return;
      await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
    }
    if (!bought) { var m = 'searching ' + searchLabel() + ' <= ' + fmt(market.snipe) + ' - none found'; console.log('[FUT Snipe] ' + m); setActivity(m); }
  }

  async function runLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      if (!market.snipe || stats.sinceCheck >= (cfg.reprobeEvery || 20)) { if (market.snipe) log('re-checking the price (the market moves)…'); await checkPrice(); }
      else { await snipeOnce(); stats.sinceCheck++; }
      render();
      if (running && stats.sinceBreak >= cfg.breakEvery) {
        stats.sinceBreak = 0; var base = Math.max(5, cfg.breakSec) * 1000, br = rand(Math.round(base * 0.8), Math.round(base * 1.2));
        phase = 'break'; say('break ' + Math.round(br / 1000) + 's (after ' + cfg.breakEvery + ' searches)'); render();
        for (var t = 0; t < br && running; t += 500) await sleep(500);
        if (running) phase = 'running'; render();
      }
    }
  }

  function start() {
    if (running) return;
    resetRun();
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return; }
    if (!haveSearch()) { blockMsg = 'Search a player in the transfer market (or load a filter), then Start.'; render(); return; }
    running = true; phase = 'checking';
    say('Start: ' + searchLabel() + ', target +' + fmt(cfg.minProfit) + '/card');
    render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }
  function stopAll() { requestStop('stopped by you'); }
  function resetLife() { life = { bought: 0, spent: 0, est: 0 }; saveLife(); render(); }
