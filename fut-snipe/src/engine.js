  // ---------- the one-button run: check price -> snipe -> relist -> re-check ----------
  function recordSession() {
    var net = sessionNet();
    if (stats.buys > 0 || (net != null && net !== 0)) {
      sessions.unshift({ t: Date.now(), buys: stats.buys, spent: stats.spent, est: stats.est, net: net });
      sessions = sessions.slice(0, 60); lsSet(SESS_KEY, sessions);
    }
  }
  function requestStop(reason) { if (!running) return; running = false; phase = 'idle'; stopReason = reason; if (/429|captcha|blocked/i.test(reason)) life.lastBlock = Date.now(); saveLife(); recordSession(); var m = /^(stopped|done)/i.test(reason) ? reason.charAt(0).toUpperCase() + reason.slice(1) : 'Stopped: ' + reason; say(m); feed(m, 'stop'); render(); }

  async function wait(ms) { for (var x = 0; x < ms && running; x += 250) await sleep(Math.min(250, ms - x)); return running; }
  // Human-like gap between searches (never below the speed setting, never exactly the same,
  // sometimes a longer pause). Price-check searches go faster (~0.6x): they're quick look-ups of
  // a few prices, and the check is done in a handful of searches.
  var tempo = { bias: 0, left: 0 };
  function pace(slow) {
    if (--tempo.left <= 0) tempo = nextMood();
    return wait(Math.max(HARD_FLOOR_MS, humanGapMs(cfg.gapMinMs, cfg.gapMaxMs, tempo.bias) * (slow ? 0.6 : 1)));
  }
  // A counted, paced search. null = the run stopped (captcha / 429 / Stop).
  async function search(maxBuy, slow, minBuy, minBid, maxBid) {
    if (!(await pace(slow))) return null;
    var r = await doSearch(maxBuy, minBuy, minBid, maxBid); if (!running) return null;
    stats.searches++; stats.sinceBreak++; countSearch();
    if (!r.ok && (r.err || {}).stop) { requestStop(r.err.msg); return null; }
    if (!gotRange && r.items.length) { gotRange = true; priceLimits(r.items[0].it).then(function (lim) { if (lim) { stats.eaMin = lim.min; stats.eaMax = lim.max; render(); } }); }
    return r;
  }
  // Long breaks every ~breakEvery searches (the exact number changes every time).
  async function maybeBreak() {
    if (!running || !breakEveryNow() || stats.sinceBreak < nextBreakAt) return;
    stats.sinceBreak = 0; nextBreakAt = fuzzyCount(breakEveryNow(), 0.25);
    var base = Math.max(5, breakSecNow()) * 1000, br = rand(Math.round(base * 0.8), Math.round(base * 1.2));
    var back = phase; phase = 'break'; say('On a break (' + Math.round(br / 1000) + 's)…'); feed('Break ' + Math.round(br / 1000) + 's', 'break'); render();
    await wait(br);
    if (running) phase = back; render();
  }

  // Price of the current search: one search with NO max-buy, then lower/raise max-buy like a
  // person would (start at a known price, else the cheapest listing seen, step ~12%, then halve
  // the gap) until only a few listings are left, and take the 2nd-cheapest fresh one.
  // Returns {price, fresh} or null (none listed / stopped).
  async function findPrice(start) {
    var asListings = function (items) { return items.map(function (x) { return { price: x.p, secs: x.secs }; }); };
    var r = await search(0, true); if (!r) return null;
    feed('Checking ' + searchLabel() + ' · ' + (r.items.length ? r.items.length + ' listed' : 'none listed'), 'check');
    if (!r.ok || !r.items.length) return null;
    if (probeVerdict(asListings(r.items)) === 'few') return pickMarketPrice(asListings(r.items)); // tiny market: that's all there is
    var top = r.items[r.items.length - 1].p, lo = 0, hi = 0, hiItems = null, few = null;
    // start at a known price, else the cheapest FRESH listing seen (a stale cheap outlier would cost extra steps)
    var firstFresh = r.items.filter(function (x) { return isFreshSecs(x.secs); })[0] || r.items[0];
    var probe = Math.min(top, start > 0 ? floorStep(start) : roundStep(firstFresh.p));
    for (var tries = 0; probe && tries < 12 && running; tries++) {
      var pr = await search(probe, true); if (!pr) return null;
      if (!pr.ok) { feed('Search failed (' + ((pr.err || {}).msg || '?') + ')', 'miss'); continue; }
      market.probeMax = probe; market.probeCount = pr.items.length;
      var v = probeVerdict(asListings(pr.items));
      feed('Checking ' + searchLabel() + ' ≤ ' + fmt(probe) + ' · ' + (pr.items.length > FEW ? FEW + '+' : pr.items.length) + ' listed', 'check'); render();
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
    // A player search without a rarity also returns special versions (TOTW, ...): price the normal card only.
    var keepMatch = matchId;
    if (searchedDefId() && !hasRarityFilter(capturedPlain || capturedFromUrl)) matchId = searchedDefId();
    var pick; try { pick = await findPrice(market.price); } finally { matchId = keepMatch; }
    if (!running) return false;
    if (!pick) { feed(searchLabel() + ' · none listed yet', 'miss'); return false; }
    var ss = sellAndSnipe(pick.price, cfg.sellPrice, cfg.minProfit), sp = ss.snipe;
    if (!sp) { requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(ss.sell) + ' sell price'); return false; }
    market.price = pick.price; market.fresh = pick.fresh; market.snipe = sp; market.checkedAt = Date.now();
    notePrice(searchedDefId() || stats.curDefId, searchLabel(), pick.price);
    stats.sinceCheck = 0; nextCheckAt = fuzzyCount(cfg.reprobeEvery, 0.2);
    feed('Price ' + searchLabel() + ' ' + fmt(pick.price) + (pick.fresh ? '' : ' (no fresh)') + (cfg.sellPrice > 0 ? ' · sell at ' + fmt(ss.sell) + ' (yours)' : '') + ' → snipe ≤ ' + fmt(sp) + ' · +' + fmt(profitAt(ss.sell, sp)), 'price');
    say('Sniping ' + searchLabel() + ' ≤ ' + fmt(sp));
    phase = 'running'; render();
    return true;
  }

  // After a buy: List (price check + auto-relist, as always), or keep it: move it to the transfer
  // list unlisted, or leave it in Unassigned. Keep modes skip the price check and buy at a price
  // you set (keepMax, optional keepMin).
  function keepMode() { return (cfg.afterBuy | 0) !== 0; }
  // Manual mode buys at the "Max. Buy Now" (and from the "Min. Buy Now") you typed into the web
  // app's own search. The bot's fields in Settings are only a fallback for a search without one.
  function webCrit() { return capturedPlain || capturedFromUrl || null; }
  function webMaxBuy() { var c = webCrit(); return c && c.maxBuy > 0 ? Number(c.maxBuy) : 0; }
  function keepMaxNow() { return webMaxBuy() || (cfg.keepMax | 0); }
  function keepMinNow() { var c = webCrit(); return c && c.minBuy > 0 ? Number(c.minBuy) : (cfg.keepMin | 0); }
  // Where bought cards get listed: your manual sell price, else the checked market price.
  function listPrice() { return cfg.sellPrice > 0 ? roundStep(cfg.sellPrice) : market.price; }
  // Sell price or target profit changed (also mid-run): move the snipe point with it.
  function applySell() {
    if (keepMode() || !(market.price > 0)) return;
    var ss = sellAndSnipe(market.price, cfg.sellPrice, cfg.minProfit);
    if (!ss.snipe) return running && requestStop('target profit ' + fmt(cfg.minProfit) + ' is too high for a ' + fmt(ss.sell) + ' sell price');
    market.snipe = ss.snipe;
    if (running) { feed('Sell at ' + fmt(ss.sell) + (cfg.sellPrice > 0 ? ' (yours)' : ' (auto)') + ' → snipe ≤ ' + fmt(ss.snipe) + ' · +' + fmt(profitAt(ss.sell, ss.snipe)), 'price'); say('Sniping ' + searchLabel() + ' ≤ ' + fmt(ss.snipe)); }
  }
  async function afterBuy(item) {
    if (!keepMode()) return relist(item);
    if (cfg.afterBuy === 2) { feed(cardLabel(item) + ' left in Unassigned', 'list'); return; }
    await sleep(rand(1200, 3000)); // still moves if you tap Stop meanwhile
    var ok = await moveToTransfer(item);
    feed(ok ? cardLabel(item) + ' moved to transfer list (not listed)' : 'Move to transfer list failed (full?) - card is in Unassigned', ok ? 'list' : 'stop');
  }

  // A special version caught by a player search: keep it on the transfer list unlisted, price-check
  // that exact card and tell you what it's worth.
  async function keepSpecial(item, price) {
    await sleep(rand(1200, 3000));
    var moved = await moveToTransfer(item);
    feed('⚠ Special version bought for ' + fmt(price) + ' - kept ' + (moved ? 'on the transfer list' : 'in Unassigned') + ', not listed', 'stop');
    if (!running) return;
    var pick = await withCard(item, function () { return findPrice(price); });
    if (pick) feed('⚠ That special card is worth ≈ ' + fmt(pick.price) + ' (you paid ' + fmt(price) + ') - list it yourself', 'price');
  }
  // Price range stop: EA's allowed range for this card. Unknown range = not checked (said once).
  var rangeUnknownSaid = false;
  async function rangeOk(item, price) {
    if (!cfg.rangeStop) return true;
    var lim = await priceLimits(item);
    if (!lim) { if (!rangeUnknownSaid) { rangeUnknownSaid = true; feed('EA price range not available - range stop can\u2019t check', 'miss'); } return true; }
    if (!outsideRange(price, lim)) return true;
    feed('⛔ ' + fmt(price) + ' is outside EA\u2019s range ' + fmt(lim.min) + '–' + fmt(lim.max) + ' - not listed', 'stop');
    return false;
  }

  async function relist(item) {
    var sell = listPrice(); if (!(sell > 0)) return;
    await sleep(rand(1500, 4000)); // still lists if you tap Stop meanwhile: a bought card shouldn't sit unlisted
    var moved = await moveToTransfer(item);
    await sleep(rand(600, 1200));
    if (!(await rangeOk(item, sell))) return requestStop('price range stop: list price ' + fmt(sell) + ' is outside EA\u2019s range');
    var ok = await listItem(item, Math.max(MIN_PRICE, sell - stepFor(sell)), sell, cfg.listDur || 3600);
    if (ok) noteList(item.id, sell);
    feed(ok ? cardLabel(item) + ' listed for ' + fmt(sell) + ' · ' + durLabel(cfg.listDur) : 'Listing failed' + (moved ? '' : ' (move failed)') + ' - list it by hand', ok ? 'list' : 'stop');
    if (ok) await hubPass(true);
  }

  // Buy everything at or below the snipe point (any freshness), then relist each one.
  var lastMinBid = 0;
  async function snipeOnce() {
    var keep = keepMode(), minB = keep ? keepMinNow() : 0;
    if (cfg.varyMinBid) lastMinBid = nextMinBid(lastMinBid, market.snipe);
    var r = await search(market.snipe, false, minB, cfg.varyMinBid ? lastMinBid : 0); if (!r) return;
    if (!r.ok) { feed(searchLabel() + ' · search failed (' + ((r.err || {}).msg || '?') + ')', 'miss'); return; }
    stats.cheapest = r.items.length ? r.items[0].p : stats.cheapest;
    var hits = r.items.filter(function (x) { return x.p <= market.snipe && x.p >= minB; }).length;
    if (keep && cfg.tooManyStop && tooManyResults(hits)) return requestStop(hits + (hits >= 21 ? '+' : '') + ' cards at ≤ ' + fmt(market.snipe) + ' - is your price right? (too many results stop)');
    var bought = 0;
    for (var j = 0; j < r.items.length && running; j++) {
      var price = r.items[j].p; if (price > market.snipe) break; if (price < minB) continue;
      var bal = coins(); if (bal != null && price > bal) { if (!cfg.cCoins) return requestStop('out of coins (' + fmt(bal) + ' left, card costs ' + fmt(price) + ')'); feed('Not enough coins for ' + fmt(price), 'miss'); continue; }
      var b = await doBuy(r.items[j].it, price); if (!running) return;
      if (b.ok) {
        var it = r.items[j].it, special = !keep && cfg.keepSpecials && isSpecialBuy(defIdOf(it), capturedPlain || capturedFromUrl);
        var e = keep || special ? 0 : profitAt(listPrice(), price);
        stats.buys++; bought++; addDaily(1); lastBuy = 'ok ' + price; noteBuy(r.items[j].it.id, price, cardLabel(r.items[j].it), false, ratingOf(r.items[j].it));
        stats.spent += price; stats.est += e; life.bought++; life.spent += price; life.est += e; saveLife();
        feed(cardLabel(it) + ' sniped for ' + fmt(price) + (keep || special ? '' : ' · +' + fmt(e)), 'hit'); celebrate(cardLabel(it), price, keep || special ? null : e); render();
        if (special) await keepSpecial(it, price); else await afterBuy(it);
      } else { lastBuy = (b.err && b.err.msg) || 'failed'; feed(searchLabel() + ' ' + fmt(price) + ' · ' + lastBuy, 'miss'); if ((b.err || {}).stop) return requestStop(b.err.msg); }
      if (stats.buys >= buyCapNow()) return;
      await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
    }
    if (!bought) { feed(searchLabel() + ' not found · search ' + stats.searches, 'quiet'); setActivity('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe)); }
  }

  // ---------- Auto bidder: bid on auctions about to end, collect the won cards ----------
  // Max bid: your web app search's Max. Bid (else its Max. Buy Now) in Transfer list / Unassigned
  // mode, the checked snipe point in List mode. One bid per card, no bidding wars.
  function bidMode() { return (cfg.bidMode | 0) === 1; }
  function bidMaxNow() { if (!keepMode()) return market.snipe || 0; var c = webCrit(); return floorStep(c && c.maxBid > 0 ? Number(c.maxBid) : keepMaxNow()); }
  var bids = {}; // id -> {it, amt, end, name}
  function openBids() { return Object.keys(bids).length; }
  async function bidOnce() {
    var maxB = bidMaxNow(); if (!(maxB > 0)) return requestStop('no max bid: set a Max. Bid or Max. Buy Now in the web app search');
    var room = Math.max(1, cfg.bidCap | 0) - openBids();
    if (room > 0) {
      var r = await search(0, false, 0, 0, maxB); if (!r) return;
      if (!r.ok) { feed(searchLabel() + ' · search failed (' + ((r.err || {}).msg || '?') + ')', 'miss'); return; }
      var rows = r.items.map(function (x) { var a = auctionOf(x.it); return { it: x.it, id: x.it.id, secs: x.secs, cur: a.cur, start: a.start, mine: a.bidState === 'highest' || !!bids[x.it.id] }; });
      var picks = bidPick(rows, maxB, cfg.bidSecs || 90).slice(0, room), placed = 0;
      for (var i = 0; i < picks.length && running; i++) {
        var pk = picks[i], bal = coins();
        if (bal != null && pk.bid > bal) { if (!cfg.cCoins) return requestStop('out of coins for bids (' + fmt(bal) + ' left)'); break; }
        var b = await doBuy(pk.it, pk.bid); if (!running) return;
        if (b.ok) { placed++; bids[pk.id] = { it: pk.it, amt: pk.bid, end: Date.now() + pk.secs * 1000, name: cardLabel(pk.it) }; feed('Bid ' + fmt(pk.bid) + ' on ' + cardLabel(pk.it) + ' · ends in ' + pk.secs + 's', 'check'); }
        else { feed(cardLabel(pk.it) + ' bid ' + fmt(pk.bid) + ' · ' + ((b.err && b.err.msg) || 'failed'), 'miss'); if ((b.err || {}).stop) return requestStop(b.err.msg); }
        await sleep(Math.max(HARD_FLOOR_MS, rand(cfg.buyGapMinMs, cfg.buyGapMaxMs)));
      }
      if (!placed) setActivity('Bidding ' + searchLabel() + ' ≤ ' + fmt(maxB) + ' · ' + openBids() + ' open bid' + (openBids() === 1 ? '' : 's'));
    } else if (!(await pace(false))) return;
    await settleBids();
  }
  // Ended auctions (+8 s): read the watchlist once, keep the won cards (list / move them like a
  // bought card), remove the lost ones from the watchlist.
  async function settleBids() {
    var now = Date.now(), due = Object.keys(bids).filter(function (id) { return bids[id].end + 8000 < now; });
    if (!due.length || !running) return;
    var w = await watchedItems(); if (!w) { feed('Could not read the watchlist', 'miss'); return; }
    var byId = {}; w.forEach(function (it) { byId[String(it.id)] = it; });
    for (var i = 0; i < due.length && running; i++) {
      var b = bids[due[i]], it = byId[String(due[i])], a = auctionOf(it);
      if (it && a.tradeState === 'active') { b.end = Date.now() + 15000; continue; } // still running (EA extends near the end)
      delete bids[due[i]];
      if (it && a.bidState === 'highest') {
        var paid = a.cur || b.amt, keep = keepMode(), e = keep ? 0 : profitAt(listPrice(), paid);
        stats.buys++; addDaily(1); noteBuy(it.id, paid, b.name, false, ratingOf(it)); stats.spent += paid; stats.est += e; life.bought++; life.spent += paid; life.est += e; saveLife();
        feed(b.name + ' won for ' + fmt(paid) + (keep ? '' : ' · +' + fmt(e)), 'hit'); celebrate(b.name, paid, keep ? null : e); render();
        await afterBuy(it);
        if (stats.buys >= buyCapNow()) return;
      } else {
        feed(b.name + ' lost' + (a.cur ? ' (went for ' + fmt(a.cur) + ')' : ''), 'miss');
        if (it) { await sleep(rand(500, 1200)); await untargetItem(it); }
      }
    }
  }

  async function runLoop() {
    while (running) {
      if (stats.buys >= buyCapNow()) return requestStop('stop limit reached (' + buyCapNow() + ' bought)');
      if (dailyCount() >= cfg.dailyBuyCap) return requestStop('daily cap reached (' + cfg.dailyBuyCap + ')');
      if (runLimitMin() > 0 && Date.now() - startTs > runLimitMin() * 60000) return requestStop('time limit (' + runLimitMin() + ' min)');
      if (!keepMode() && (!market.snipe || stats.sinceCheck >= nextCheckAt)) { if (market.snipe) feed('Re-checking the price…', 'check'); await checkPrice(); }
      else { if (bidMode()) await bidOnce(); else await snipeOnce(); stats.sinceCheck++; if (running) await hubPass(false); }
      render();
      await maybeBreak();
    }
  }

  function canStart() {
    if (running) return false;
    resetRun(); clearFeed();
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return false; }
    return true;
  }
  // Start at a set time: the run waits (Stop cancels), then starts as if you tapped Start then.
  async function waitForStart() {
    var ms = startDelayMs(startAt, new Date()); if (ms == null) { startAt = ''; return true; }
    var end = Date.now() + ms; running = true; phase = 'waiting';
    feed('Waiting · starts at ' + startAt, 'break');
    while (running && Date.now() < end) {
      var left = end - Date.now(), mins = Math.ceil(left / 60000);
      setActivity('Starts at ' + startAt + ' · in ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min'));
      render(); await wait(Math.min(20000, left));
    }
    if (!running) { startAt = ''; setActivity(''); return false; }
    running = false; phase = 'idle'; startAt = ''; resetRun(); setActivity('');
    return true;
  }
  async function start() {
    if (!canStart()) return;
    if (!haveSearch()) { blockMsg = 'Search a player in the transfer market (or load a filter), then Start.'; render(); return; }
    var flagged = life.lastBlock ? Date.now() - life.lastBlock : null;
    if (flagged != null && flagged < 6 * 3600000 && !window.confirm('EA flagged this account ' + Math.max(1, Math.round(flagged / 60000)) + ' min ago (captcha / 429). Sniping again this soon raises the ban risk.\n\nStart anyway?')) { blockMsg = 'Not started: EA flagged you recently. Wait a few hours.'; render(); return; }
    if (startAt && !(await waitForStart())) return;
    if (!haveServices()) { blockMsg = 'Trading services not found — open & sign into the FUT Web App.'; render(); return; }
    resolveName();
    if (keepMode()) {
      var wc = webCrit(), kmax = bidMode() && wc && wc.maxBid > 0 ? Number(wc.maxBid) : keepMaxNow(), kmin = keepMinNow();
      if (!(kmax > 0)) { blockMsg = 'Transfer list / Unassigned mode: type a Max. Buy Now into the web app search, search once, then Start.'; render(); return; }
      if (kmin > kmax) { blockMsg = 'The Min. Buy Now is higher than the Max. Buy Now.'; render(); return; }
      market.snipe = floorStep(kmax); bids = {}; running = true; phase = 'running';
      feed('Start ' + searchLabel() + (bidMode() ? ' · bids ≤ ' + fmt(bidMaxNow()) + ' on auctions ending within ' + (cfg.bidSecs || 90) + 's' : ' · buy ≤ ' + fmt(market.snipe)) + (webMaxBuy() || (wc && wc.maxBid > 0) ? ' (your web app search)' : ' (fallback from Settings)') + (kmin > 0 ? ' and ≥ ' + fmt(kmin) : '') + ' · ' + (cfg.afterBuy === 2 ? 'leave in Unassigned' : 'to transfer list'), 'price');
      say('Sniping ' + searchLabel() + ' ≤ ' + fmt(market.snipe));
      render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
      return;
    }
    bids = {}; running = true; phase = 'checking';
    feed('Start ' + searchLabel() + ' · target +' + fmt(cfg.minProfit) + '/card', 'price');
    render(); runLoop().catch(function (e) { requestStop('loop error: ' + e); });
  }

  function stopAll() { var ob = typeof openBids === 'function' ? openBids() : 0; requestStop('stopped by you' + (ob ? ' · ' + ob + ' bid' + (ob > 1 ? 's' : '') + ' still running: won cards wait in your watchlist' : '')); }
  // Keeps lastBlock: the safety assistant still needs to know when EA last flagged you.
  function resetLife() { life = { bought: 0, spent: 0, est: 0, searches: 0, lastBlock: life.lastBlock || null }; saveLife(); sessions = []; lsSet(SESS_KEY, sessions); }
