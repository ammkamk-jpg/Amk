  // ---------- the one-button run: check price -> snipe -> relist -> re-check ----------
  function recordSession() {
    var net = sessionNet();
    if (stats.buys > 0 || (net != null && net !== 0)) {
      sessions.unshift({ t: Date.now(), buys: stats.buys, spent: stats.spent, est: stats.est, net: net });
      sessions = sessions.slice(0, 60); lsSet(SESS_KEY, sessions);
    }
  }
  function requestStop(reason) { if (!running) return; running = false; phase = 'idle'; stopReason = reason; recordSession(); var m = /^stopped/i.test(reason) ? 'S' + reason.slice(1) : 'Stopped: ' + reason; say(m); feed(m, 'stop'); render(); }

  async function wait(ms) { for (var x = 0; x < ms && running; x += 250) await sleep(Math.min(250, ms - x)); return running; }
  // Human-like gap between searches (never below the speed setting, never exactly the same,
  // sometimes a longer pause). Price-check searches go ~35% slower: a person reads the results.
  function pace(slow) { return wait(Math.max(HARD_FLOOR_MS, humanGapMs(cfg.searchMinMs * (slow ? 1.35 : 1)))); }
  // A counted, paced search. null = the run stopped (captcha / 429 / Stop).
  async function search(maxBuy, slow) {
    if (!(await pace(slow))) return null;
    var r = await doSearch(maxBuy); if (!running) return null;
    stats.searches++; stats.sinceBreak++;
    if (!r.ok && (r.err || {}).stop) { requestStop(r.err.msg); return null; }
    if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0].it).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
    return r;
  }
  // After ~20 lines the feed clears itself; the bot takes a short pause while it does.
  async function afterFeedLine() {
    if (!feedFull()) return;
    phase = 'tidy'; render();
    await clearFeed();
    await wait(rand(2000, 5000));
    if (running) phase = 'running'; render();
  }
  // Long breaks every ~breakEvery searches (the exact number changes every time).
  async function maybeBreak() {
    if (!running || stats.sinceBreak < nextBreakAt) return;
    stats.sinceBreak = 0; nextBreakAt = fuzzyCount(cfg.breakEvery, 0.25);
    var base = Math.max(5, cfg.breakSec) * 1000, br = rand(Math.round(base * 0.8), Math.round(base * 1.2));
    var back = phase; phase = 'break'; say('On a break (' + Math.round(br / 1000) + 's)…'); feed('Break ' + Math.round(br / 1000) + 's', 'break'); render();
    await wait(br);
    if (running) phase = back; render();
  }

  // Price of the current search: one search with NO max-buy, then lower/raise max-buy like a
  // person would (start at the last known price or the cheapest listing seen, step ~12%, then
  // halve the gap) until only a few listings are left, and take the 2nd-cheapest fresh one.
  // Returns {price, fresh} or null (none listed / stopped).
  async function findPrice() {
    var asListings = function (items) { return items.map(function (x) { return { price: x.p, secs: x.secs }; }); };
    var r = await search(0, true); if (!r) return null;
    feed('Checking ' + searchLabel() + ' · ' + (r.items.length ? r.items.length + ' listed' : 'none listed'), 'check'); await afterFeedLine();
    if (!r.ok || !r.items.length) return null;
    if (probeVerdict(asListings(r.items)) === 'few') return pickMarketPrice(asListings(r.items)); // tiny market: that's all there is
    var top = r.items[r.items.length - 1].p, lo = 0, hi = 0, hiItems = null, few = null;
    var probe = Math.min(top, market.price > 0 ? floorStep(market.price) : roundStep(r.items[0].p));
    for (var tries = 0; probe && tries < 12 && running; tries++) {
      var pr = await search(probe, true); if (!pr) return null;
      if (!pr.ok) { feed('Search failed (' + ((pr.err || {}).msg || '?') + ')', 'miss'); continue; }
      market.probeMax = probe; market.probeCount = pr.items.length;
      var v = probeVerdict(asListings(pr.items));
      feed('Checking ' + searchLabel() + ' ≤ ' + fmt(probe) + ' · ' + (pr.items.length > FEW ? FEW + '+' : pr.items.length) + ' listed', 'check'); render();
      await afterFeedLine();
      if (v === 'few') { few = pr.items; break; }
      if (v === 'many') hiItems = pr.items;
      var n = nextProbe(lo, hi, probe, v); lo = n.lo; hi = n.hi; probe = n.next;
    }
    if (!running) return null;
    if (!few) { // boxed in to neighbouring prices: the listings at hi are the cheapest there are
      if (!hiItems && hi) { var hr = await search(hi, true); if (!hr) return null; hiItems = hr.ok ? hr.items : []; }
      few = hiItems || r.items;
    }
    return pickMarketPrice(asListings(few));
  }

  async function checkPrice() {
    phase = 'checking'; market.probeMax = 0; market.probeCount = null;
    say('Checking price for ' + searchLabel() + '…'); render();
    var pick = await findPrice();
    if (!running) return false;
    if (!pick) { feed(searchLabel() + ' · none listed yet', 'miss'); return false; }
    var sp = snipePoint(pick.price, cfg.minProfit);
    if (!sp) { requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(pick.price) + ' card'); return false; }
    market.price = pick.price; market.fresh = pick.fresh; market.snipe = sp; market.checkedAt = Date.now();
    stats.sinceCheck = 0; nextCheckAt = fuzzyCount(cfg.reprobeEvery, 0.2);
    feed('Price ' + searchLabel() + ' ' + fmt(pick.price) + (pick.fresh ? '' : ' (no fresh)') + ' → snipe ≤ ' + fmt(sp) + ' · +' + fmt(profitAt(pick.price, sp)), 'price');
    say('Sniping ' + searchLabel() + ' ≤ ' + fmt(sp));
    phase = 'running'; render();
    return true;
  }

  // Expired (unsold) cards on the transfer list go back up at their old price + duration,
  // via EA's own "Re-list all". Checked after each listing and every few minutes.
  var lastExpiredCheck = 0;
  async function maybeRelistExpired(force) {
    if (!cfg.relistExpired || (!force && Date.now() - lastExpiredCheck < 180000)) return;
    lastExpiredCheck = Date.now() - rand(0, 40000);
    var items = await transferItems(); if (!items) return;
    var n = items.filter(isExpired).length; if (!n) return;
    await sleep(rand(800, 2000));
    var ok = await relistAllExpired();
    feed(ok ? 'Relisted ' + n + ' expired card' + (n > 1 ? 's' : '') + ' (same price + time)' : 'Re-list of expired cards failed - use Re-list all', ok ? 'list' : 'stop');
  }

  async function relist(item) {
    if (!cfg.autoList) return;
    var sell = market.price; if (!(sell > 0)) return;
    await sleep(rand(1500, 4000)); // still lists if you tap Stop meanwhile: a bought card shouldn't sit unlisted
    var moved = await moveToTransfer(item);
    await sleep(rand(600, 1200));
    var ok = await listItem(item, Math.max(MIN_PRICE, sell - stepFor(sell)), sell, cfg.listDur || 3600);
    feed(ok ? searchLabel() + ' listed for ' + fmt(sell) + ' · ' + durLabel(cfg.listDur) : 'Listing failed' + (moved ? '' : ' (move failed)') + ' - list it by hand', ok ? 'list' : 'stop');
    if (ok) await maybeRelistExpired(true);
  }

  // Buy everything at or below the snipe point (any freshness), then relist each one.
  async function snipeOnce() {
    var r = await search(market.snipe); if (!r) return;
    if (!r.ok) { feed(searchLabel() + ' · search failed (' + ((r.err || {}).msg || '?') + ')', 'miss'); return afterFeedLine(); }
    stats.cheapest = r.items.length ? r.items[0].p : stats.cheapest;
    var bought = 0;
    for (var j = 0; j < r.items.length && running; j++) {
      var price = r.items[j].p; if (price > market.snipe) break;
      var bal = coins(); if (bal != null && price > bal) { feed('Not enough coins for ' + fmt(price), 'miss'); continue; }
      var b = await doBuy(r.items[j].it, price); if (!running) return;
      if (b.ok) {
        var e = profitAt(market.price, price);
        stats.buys++; bought++; addDaily(1); lastBuy = 'ok ' + price;
        stats.spent += price; stats.est += e; life.bought++; life.spent += price; life.est += e; saveLife();
        feed(searchLabel() + ' sniped for ' + fmt(price) + ' · +' + fmt(e), 'hit'); render();
        await relist(r.items[j].it);
      } else { lastBuy = (b.err && b.err.msg) || 'failed'; feed(searchLabel() + ' ' + fmt(price) + ' · ' + lastBuy, 'miss'); if ((b.err || {}).stop) return requestStop(b.err.msg); }
      if (stats.buys >= cfg.sessionBuyCap) return;
      await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
    }
    if (!bought) { feed(searchLabel() + ' not found', 'miss'); setActivity('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe)); }
    await afterFeedLine();
  }

  async function runLoop() {
    while (running) {
      if (stats.buys >= cfg.sessionBuyCap) return requestStop('session cap reached (' + cfg.sessionBuyCap + ')');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (cfg.runMinutes > 0 && Date.now() - startTs > cfg.runMinutes * 60000) return requestStop('time limit (' + cfg.runMinutes + ' min)');
      if (!market.snipe || stats.sinceCheck >= nextCheckAt) { if (market.snipe) feed('Re-checking the price…', 'check'); await checkPrice(); }
      else { await snipeOnce(); stats.sinceCheck++; if (running) await maybeRelistExpired(false); }
      render();
      await maybeBreak();
    }
  }

  function canStart() {
    if (running) return false;
    resetRun(); clearFeed(true);
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return false; }
    return true;
  }
  function start() {
    if (!canStart()) return;
    if (!haveSearch()) { blockMsg = 'Search a player in the transfer market (or load a filter), then Start.'; render(); return; }
    running = true; phase = 'checking';
    feed('Start ' + searchLabel() + ' · target +' + fmt(cfg.minProfit) + '/card', 'price');
    render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }

  function stopAll() { requestStop('stopped by you'); }
  function resetLife() { life = { bought: 0, spent: 0, est: 0 }; saveLife(); render(); }
