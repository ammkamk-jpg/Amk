  // ---------- Hub: transfer list overview, real profit, re-priced relisting, pack pulls ----------
  var hub = { at: 0, total: 0, sold: 0, soldValue: 0, active: 0, expired: 0, unlisted: 0, packs: null, packsTradable: 0, busy: '' };
  var TRADEPILE_MAX = 100;

  function summarize(items) {
    hub.at = Date.now(); hub.total = items.length; hub.sold = 0; hub.soldValue = 0; hub.active = 0; hub.expired = 0; hub.unlisted = 0;
    items.forEach(function (it) {
      var st = tradeStateOf(it);
      if (st === 'closed') { hub.sold++; hub.soldValue += afterTax(salePriceOf(it)); }
      else if (st === 'active') hub.active++;
      else if (isExpired(it)) hub.expired++;
      else hub.unlisted++;
    });
  }
  // Book every sold card once: sale price after EA tax minus what it cost (bot buy, pack = 0).
  // Cards the bot didn't buy have no known cost: the sale is booked, profit stays unknown.
  function bookSales(items) {
    var n = 0;
    items.filter(isSold).forEach(function (it) {
      var id = String(it.id); if (ledger.booked[id]) return;
      var sold = salePriceOf(it); if (!(sold > 0)) return;
      var b = ledger.buys[id], buy = b ? b.buy : null, profit = buy != null ? profitAt(sold, buy) : null, name = nameOf(it) || (b && b.name) || 'Card';
      ledger.sales.unshift({ t: Date.now(), name: name, rating: ratingOf(it) || (b && b.rating) || null, buy: buy, sold: sold, profit: profit, pack: !!(b && b.pack) });
      ledger.booked[id] = 1; delete ledger.buys[id]; n++;
      feed(name + ' sold for ' + fmt(sold) + (profit != null ? ' · ' + signed(profit) : ''), 'hit');
    });
    if (n) saveLedger();
    return n;
  }
  function realProfit(sinceMs) {
    var sum = 0, n = 0;
    ledger.sales.forEach(function (s) { if (s.t >= sinceMs && s.profit != null) { sum += s.profit; n++; } });
    return { sum: sum, n: n };
  }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

  // Read the transfer list (+ unassigned pile), book sales, optionally clear them. 1-2 requests.
  async function refreshHub(withPacks) {
    var items = await transferItems(); if (!items) { feed('Could not read the transfer list', 'miss'); return null; }
    summarize(items); bookSales(items);
    if (withPacks) { var un = await unassignedItems(); if (un) { hub.packs = un.length; hub.packsTradable = un.filter(function (it) { return isPlayer(it) && isTradable(it); }).length; } }
    render();
    return items;
  }
  async function clearSoldNow() {
    if (!hub.sold) return;
    await sleep(rand(700, 1600));
    var ok = await clearSold();
    feed(ok ? 'Cleared ' + hub.sold + ' sold card' + (hub.sold > 1 ? 's' : '') + ' · +' + fmt(hub.soldValue) + ' coins' : 'Clearing sold cards failed', ok ? 'list' : 'stop');
    if (ok) { hub.total -= hub.sold; hub.sold = 0; hub.soldValue = 0; }
  }

  // Run fn while searches target exactly this card (base player id + exact version).
  async function withCard(it, fn) {
    var keep = { searchBase: searchBase, matchId: matchId, curName: curName, gotRange: gotRange };
    var def = defIdOf(it);
    // defId = [exact version], so cheaper versions of the same player don't crowd the 21 results.
    searchBase = { type: 'player', maskedDefId: baseIdOf(def), defId: [Number(def)], count: 21 }; matchId = def; curName = nameOf(it) || curName; gotRange = true;
    try { var res = await fn(); if (res && res.price) notePrice(def, nameOf(it) || 'Card', res.price); return res; }
    finally { searchBase = keep.searchBase; matchId = keep.matchId; curName = keep.curName; gotRange = keep.gotRange; }
  }
  async function listAt(it, price, why) {
    if (!(await rangeOk(it, price))) return false;
    var ok = await listItem(it, Math.max(MIN_PRICE, price - stepFor(price)), price, cfg.listDur || 3600);
    if (ok) noteList(it.id, price);
    feed(ok ? (nameOf(it) || 'Card') + ' listed for ' + fmt(price) + (why ? ' · ' + why : '') : 'Listing ' + (nameOf(it) || 'card') + ' failed', ok ? 'list' : 'stop');
    return ok;
  }

  // Expired cards: price-check each one first and relist at today's price (or EA's "Re-list all"
  // at the old price when re-pricing is off). max = cards per pass, so sniping isn't held up long.
  async function relistExpired(items, max) {
    var expired = items.filter(isExpired); if (!expired.length) return 0;
    if (!cfg.repriceExpired) {
      await sleep(rand(800, 2000));
      var ok = await relistAllExpired();
      feed(ok ? 'Relisted ' + expired.length + ' expired card' + (expired.length > 1 ? 's' : '') + ' (same price + time)' : 'Re-list of expired cards failed - use Re-list all', ok ? 'list' : 'stop');
      return ok ? expired.length : 0;
    }
    var done = 0;
    for (var i = 0; i < expired.length && i < max && running; i++) {
      var it = expired[i], old = salePriceOf(it), name = nameOf(it) || 'Card';
      setActivity('♻️ Re-pricing expired ' + name + '…');
      feed('♻️ Expired ' + name + ' (was ' + fmt(old) + '): re-pricing', 'check');
      var pick = isPlayer(it) ? await withCard(it, function () { return findPrice(old); }) : null;
      if (!running) break;
      var b = ledger.buys[String(it.id)], cost = b && !b.pack ? b.buy : null;
      var fl = pick ? repriceFloor(pick.price, old, cost) : { price: old, floored: false }, price = fl.price;
      if (!(price > 0)) { feed(name + ' · no price found, left expired', 'miss'); continue; }
      var why = !pick ? 'old price' : fl.floored ? 'market ' + fmt(pick.price) + ', kept at ' + (cost ? 'break-even' : 'max -10%') : price < old ? 'was ' + fmt(old) : price > old ? 'up from ' + fmt(old) : 'same price';
      await sleep(rand(600, 1400));
      if (await listAt(it, price, why)) done++;
    }
    return done;
  }

  // During sniping: every few minutes (and after each listing) look at the transfer list.
  var lastHubPass = 0;
  async function hubPass(force) {
    if (!force && Date.now() - lastHubPass < 180000) return;
    lastHubPass = Date.now() - rand(0, 40000);
    var items = await refreshHub(false); if (!items || !running) return;
    if (cfg.clearSold === 2 || (cfg.clearSold === 1 && hub.total >= TRADEPILE_MAX - 5)) await clearSoldNow(); // always / only when (nearly) full
    if (cfg.relistExpired && running) await relistExpired(items, 2);
  }

  // Pack pulls: price-check every tradeable player in the unassigned pile and list the ones worth
  // at least packMin; the rest stay where they are for you to decide.
  async function listPackPulls() {
    var un = await unassignedItems(); if (!un) return 'could not read your unassigned items';
    var cands = un.filter(function (it) { return isPlayer(it) && isTradable(it); });
    if (!cands.length) return 'no tradeable players in your unassigned items';
    var tp = await transferItems(), room = TRADEPILE_MAX - (tp ? tp.length : 0);
    if (room <= 0) return 'transfer list is full (' + TRADEPILE_MAX + ')';
    var listed = 0, kept = 0;
    for (var i = 0; i < cands.length && i < 12 && running; i++) {
      var it = cands[i], name = nameOf(it) || 'Card';
      setActivity('Pricing pack pull ' + (i + 1) + ' of ' + Math.min(cands.length, 12) + ': ' + name);
      var pick = await withCard(it, function () { return findPrice(0); }); if (!running) break;
      if (!pick) { feed(name + ' · not on the market, kept', 'miss'); kept++; continue; }
      if (pick.price < cfg.packMin) { feed(name + ' ≈ ' + fmt(pick.price) + ' · under ' + fmt(cfg.packMin) + ', kept', 'miss'); kept++; continue; }
      if (listed >= room) { feed('Transfer list full - stopped listing', 'stop'); break; }
      await sleep(rand(800, 1800));
      if (!(await moveToTransfer(it))) { feed(name + ' · could not move to transfer list', 'stop'); continue; }
      await sleep(rand(600, 1300));
      if (await listAt(it, pick.price, 'pack pull')) { noteBuy(it.id, 0, name, true, ratingOf(it), pick.price); listed++; }
    }
    return 'pack pulls: ' + listed + ' listed, ' + kept + ' kept';
  }

  // Hub buttons that need searches run like a short sniping run (lock screen, Stop works).
  function startJob(kind) {
    if (!canStart()) return;
    running = true; mode = 'job'; phase = 'job';
    var job = kind === 'packs' ? listPackPulls() : refreshHub(false).then(function (items) {
      if (!items) return 'could not read the transfer list';
      return relistExpired(items, 30).then(function (n) { return 'relisted ' + n + ' expired card' + (n === 1 ? '' : 's'); });
    });
    feed(kind === 'packs' ? 'Listing pack pulls…' : 'Re-pricing expired cards…', 'check'); render();
    job.then(function (msg) { if (running) requestStop('Done: ' + msg); refreshHub(true); }).catch(function (e) { requestStop('hub error: ' + e); });
  }
  async function hubRefreshButton() {
    if (running || hub.busy) return;
    hub.busy = 'refresh'; render();
    try { await refreshHub(true); } finally { hub.busy = ''; render(); }
  }
  async function hubClearButton() {
    if (running || hub.busy) return;
    hub.busy = 'clear'; render();
    try { if (await refreshHub(false)) await clearSoldNow(); } finally { hub.busy = ''; render(); }
  }
