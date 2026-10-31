const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../fut-snipe/src/pricing.js");

test("snipe point = price after 5% tax minus profit, on a valid price", () => {
  assert.equal(P.snipePoint(15000, 500), 13750);
  assert.equal(P.snipePoint(1000, 100), 850);
  assert.equal(P.snipePoint(150, 500), 0); // profit too high
  assert.ok(P.profitAt(15000, P.snipePoint(15000, 500)) >= 500);
});

test("market price = 2nd-cheapest fresh listing", () => {
  const l = [
    { price: 9000, secs: 600 }, // old outlier: ignored, not fresh
    { price: 15000, secs: 3500 },
    { price: 14750, secs: 3300 },
    { price: 15250, secs: 3590 },
  ];
  assert.deepEqual(P.pickMarketPrice(l), { price: 15000, fresh: true, n: 3 });
});

test("one cheap fresh outlier can't set the price", () => {
  const l = [{ price: 5000, secs: 3500 }, { price: 15000, secs: 3400 }, { price: 15250, secs: 3450 }];
  assert.equal(P.pickMarketPrice(l).price, 15000);
});

test("no fresh listings: 2nd-cheapest of all; single listing: that one", () => {
  assert.deepEqual(P.pickMarketPrice([{ price: 900, secs: 60 }, { price: 1000, secs: 120 }]), { price: 1000, fresh: false, n: 2 });
  assert.equal(P.pickMarketPrice([{ price: 1000, secs: 3500 }]).price, 1000);
  assert.equal(P.pickMarketPrice([]), null);
});

test("binary search finds the few-listings price in few searches", () => {
  // Fake market: 30 listings from 14,750 up.
  // Fake market: one stale cheap outlier, then 30 fresh listings from 14,750 up.
  const market = [{ price: 9000, secs: 400 }].concat(Array.from({ length: 30 }, (_, i) => ({ price: 14750 + i * 250, secs: 3400 })));
  const under = (max) => market.filter((l) => l.price <= max);
  const count = (max) => under(max).length;
  let lo = 0, hi = 40000, searches = 0, found = 0;
  for (let i = 0; i < 14; i++) {
    const mid = P.probeMid(lo, hi);
    if (!mid) { found = hi; break; }
    searches++;
    const v = P.probeVerdict(under(mid));
    if (v === "none") lo = mid; else if (v === "many") hi = mid; else { found = mid; break; }
  }
  assert.ok(found >= 14750 && count(found) >= 1 && count(found) <= P.FEW + 1, `found ${found} (${count(found)} listings)`);
  assert.ok(P.pickMarketPrice(under(found)).price >= 14750, "stale 9,000 outlier ignored");
  assert.ok(searches <= 12, `${searches} searches`);
});

test("a few stale listings mean: look higher", () => {
  assert.equal(P.probeVerdict([{ price: 9000, secs: 400 }]), "none");
  assert.equal(P.probeVerdict([{ price: 9000, secs: 400 }, { price: 14750, secs: 3400 }]), "none", "one fresh isn't enough");
  assert.equal(P.probeVerdict([{ price: 9000, secs: 400 }, { price: 14750, secs: 3400 }, { price: 15000, secs: 3500 }]), "few");
  assert.equal(P.probeVerdict([]), "none");
});

test("probeMid stays on valid prices and stops when lo/hi are neighbours", () => {
  assert.equal(P.probeMid(14750, 15000), 0);
  const m = P.probeMid(9900, 10250);
  assert.ok(m > 9900 && m < 10250 && m === P.floorStep(m));
});

test("search gaps: Normal is always 3.5-5.5s, spread over the whole range", () => {
  const gaps = Array.from({ length: 4000 }, () => P.humanGapMs(3500, 5500, 0)).sort((a, b) => a - b);
  const pct = (p) => gaps[Math.floor(gaps.length * p)];
  assert.ok(gaps[0] >= 3500 && gaps[gaps.length - 1] <= 5500, `range ${gaps[0]}..${gaps[gaps.length - 1]}`);
  assert.ok(gaps[0] < 3800 && gaps[gaps.length - 1] > 5200, "reaches both ends");
  assert.ok(pct(0.9) - pct(0.1) >= 900, `spread p10 ${pct(0.1)} .. p90 ${pct(0.9)}`);
  assert.ok(new Set(gaps).size > 1000, "hardly ever the same twice");
  const slowMood = Array.from({ length: 2000 }, () => P.humanGapMs(3500, 5500, 0.2)), fastMood = Array.from({ length: 2000 }, () => P.humanGapMs(3500, 5500, -0.2));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(slowMood) > avg(fastMood) + 500, "mood leans quick or slow");
  assert.ok(Math.max(...slowMood) <= 5500 && Math.min(...fastMood) >= 3500, "still inside the range");
});

test("tempo mood: lean -0.2..0.2 for 8-25 searches", () => {
  for (let i = 0; i < 300; i++) {
    const m = P.nextMood();
    assert.ok(m.bias >= -0.2 && m.bias <= 0.2 && m.left >= 8 && m.left <= 25, JSON.stringify(m));
  }
});

test("fuzzy counts: 50 +/- 20% -> 40..60, and not always the same", () => {
  const n = Array.from({ length: 200 }, () => P.fuzzyCount(50, 0.2));
  assert.ok(Math.min(...n) >= 40 && Math.max(...n) <= 60);
  assert.ok(new Set(n).size > 10);
  assert.equal(P.fuzzyCount(1, 0.5, () => 0), 1);
});

test("coin labels from EA's card rows", () => {
  assert.equal(P.parseCoins("61.3K"), 61300);
  assert.equal(P.parseCoins("7.7K"), 7700);
  assert.equal(P.parseCoins("1.25M"), 1250000);
  assert.equal(P.parseCoins("7,750"), 7750);
  assert.equal(P.parseCoins(" 850 "), 850);
  assert.equal(P.parseCoins("--"), null);
  assert.equal(P.parseCoins(null), null);
});

// Runs the price check the way the bot does, against a fake market; returns the price + searches used.
function runCheck(market, start) {
  const under = (max) => market.filter((l) => l.price <= max);
  let lo = 0, hi = 0, probe = start, searches = 0, few = null, hiItems = null;
  for (let t = 0; probe && t < 12; t++) {
    searches++;
    const items = under(probe), v = P.probeVerdict(items);
    if (v === "few") { few = items; break; }
    if (v === "many") hiItems = items;
    ({ lo, hi, next: probe } = P.nextProbe(lo, hi, probe, v));
  }
  if (!few) few = hiItems;
  return { price: P.pickMarketPrice(few).price, searches };
}

test("price check: from the cheapest listing seen, a few steps down", () => {
  const market = Array.from({ length: 40 }, (_, i) => ({ price: 21500 + i * 250, secs: 3300 + (i % 4) * 60 }));
  const r = runCheck(market, P.roundStep(26000));
  assert.ok(r.price >= 21500 && r.price <= 22000, `price ${r.price}`);
  assert.ok(r.searches <= 6, `${r.searches} searches`);
});

test("price check: re-check from the last price is quick", () => {
  const market = Array.from({ length: 40 }, (_, i) => ({ price: 21500 + i * 250, secs: 3400 }));
  assert.ok(runCheck(market, 21750).searches <= 2);
  // market moved up 10%: still found in a few searches
  const up = market.map((l) => ({ ...l, price: l.price + 2250 }));
  const r = runCheck(up, 21750);
  assert.ok(r.price >= 23750 && r.price <= 24250 && r.searches <= 5, JSON.stringify(r));
});

test("price check: a stale cheap outlier is stepped over", () => {
  const market = [{ price: 9000, secs: 400 }].concat(Array.from({ length: 30 }, (_, i) => ({ price: 14750 + i * 250, secs: 3400 })));
  const r = runCheck(market, 9000);
  assert.equal(r.price, 15000, JSON.stringify(r)); // 2nd-cheapest fresh
});

test("safety assistant", () => {
  assert.equal(P.safetyStatus(100, null).level, "ok");
  assert.equal(P.safetyStatus(100, null).minutes, 60);
  assert.equal(P.safetyStatus(1500, null).level, "warn");
  assert.equal(P.safetyStatus(1900, null).level, "stop");
  const b = P.safetyStatus(10, 30 * 60000);
  assert.equal(b.level, "stop"); assert.match(b.hint, /30 min ago/);
  assert.equal(P.safetyStatus(10, 7 * 3600000).level, "ok", "old block forgotten after 6h");
});

test("profit curve is cumulative, oldest first, skips unknown profits", () => {
  const sales = [{ profit: 300 }, { profit: null }, { profit: -100 }, { profit: 1000 }]; // newest first
  assert.deepEqual(P.profitCurve(sales), [1000, 900, 1200]);
});

test("too many results stop: 10+ cards at the buy price", () => {
  assert.equal(P.tooManyResults(2), false);
  assert.equal(P.tooManyResults(9), false);
  assert.equal(P.tooManyResults(10), true);
  assert.equal(P.tooManyResults(21), true);
});

test("price range stop", () => {
  const lim = { min: 10000, max: 200000 };
  assert.equal(P.outsideRange(15000, lim), false);
  assert.equal(P.outsideRange(250000, lim), true);
  assert.equal(P.outsideRange(9000, lim), true);
  assert.equal(P.outsideRange(15000, null), false, "unknown range: not stopped");
});

test("special version bought by a player search", () => {
  const special = 3 * 16777216 + 231747;
  assert.equal(P.isSpecialBuy(231747, { rarities: [] }), false, "base card");
  assert.equal(P.isSpecialBuy(special, { rarities: [] }), true);
  assert.equal(P.isSpecialBuy(special, { rarities: [3] }), false, "searched with a rarity: wanted");
  assert.equal(P.isSpecialBuy(special, { maskedDefId: 231747 }), true, "no rarities field");
});

test("min bid for fresh results: varies, stays low, never repeats", () => {
  let prev = 0; const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const v = P.nextMinBid(prev, 13750);
    assert.notEqual(v, prev, "never the same twice in a row");
    assert.ok(v === 0 || (v >= 150 && v <= 1000 && v % 50 === 0), String(v));
    seen.add(v); prev = v;
  }
  assert.ok(seen.size > 10, "spread over many values");
  for (let i = 0; i < 100; i++) assert.ok(P.nextMinBid(0, 1000) <= 500, "below half the snipe point");
  assert.equal(P.nextMinBid(0, 250), 0, "cheap card: no min bid");
});

test("break-even price after tax", () => {
  assert.equal(P.breakEven(19500), 20750); // 20,750 * 0.95 = 19,712 >= 19,500; 20,500 * 0.95 = 19,475 < 19,500
  assert.ok(P.afterTax(P.breakEven(14000)) >= 14000);
  assert.ok(P.afterTax(P.breakEven(14000) - P.stepFor(P.breakEven(14000))) < 14000, "lowest such price");
});

test("re-pricing expired cards never dumps them", () => {
  assert.deepEqual(P.repriceFloor(21000, 22000, 19500), { price: 21000, floored: false }, "market price above break-even: use it");
  assert.deepEqual(P.repriceFloor(18000, 22000, 19500), { price: 20750, floored: true }, "below what you paid: break-even");
  assert.deepEqual(P.repriceFloor(15000, 22000, null), { price: 19750, floored: true }, "cost unknown: at most 10% under the old price");
  assert.deepEqual(P.repriceFloor(20500, 22000, null), { price: 20500, floored: false });
});

test("market overview from the bot's own price checks", () => {
  const now = 1e12, h = 3600000;
  const hist = [
    { id: 1, name: "A", p: 10000, t: now - 5 * h }, { id: 1, name: "A", p: 10500, t: now - 1 * h }, // +5%
    { id: 2, name: "B", p: 20000, t: now - 4 * h }, { id: 2, name: "B", p: 19000, t: now - 2 * h }, // -5%
    { id: 3, name: "C", p: 5000, t: now - 3 * h },                                                  // one check: no trend
    { id: 4, name: "D", p: 9000, t: now - 30 * h }, { id: 4, name: "D", p: 9900, t: now - 26 * h }, // older than 24h
  ];
  const tr = P.cardTrends(hist, now);
  assert.deepEqual(tr.map((c) => c.id), ["1", "2", "3"], "newest first, last 24h only");
  assert.equal(Math.round(tr[0].pct), 5);
  assert.equal(tr[2].pct, null);
  assert.deepEqual(P.marketIndex(hist, now), { index: 50, pct: 0, cards: 2 }, "+5% and -5%: flat");
  assert.equal(P.marketIndex([hist[0], hist[1]], now).index, 75, "+5% -> 75");
  assert.equal(P.marketIndex([{ id: 1, p: 100, t: now - h }, { id: 1, p: 50, t: now }], now).index, 0, "capped at 0");
  assert.equal(P.marketIndex([hist[4]], now), null, "not enough checks");
});

test("manual sell price: list there, keep the target profit", () => {
  assert.deepEqual(P.sellAndSnipe(15000, 0, 500), { sell: 15000, snipe: 13750 }, "auto: checked price");
  assert.deepEqual(P.sellAndSnipe(15000, 16000, 500), { sell: 16000, snipe: 13750 }, "above market: normal snipe point, more profit");
  const low = P.sellAndSnipe(15000, 14000, 500);
  assert.equal(low.sell, 14000); assert.ok(P.profitAt(14000, low.snipe) >= 500, "below market: buys cheaper so +500 still holds");
  assert.equal(P.sellAndSnipe(15000, 15040, 500).sell, 15000, "rounded to a valid price");
});

test("price check from the cheapest fresh listing skips a stale outlier quickly", () => {
  const market = [{ price: 9000, secs: 400 }].concat(Array.from({ length: 30 }, (_, i) => ({ price: 14750 + i * 250, secs: 3400 })));
  const fromOutlier = runCheck(market, 9000), fromFresh = runCheck(market, 14750);
  assert.equal(fromFresh.price, 15000);
  assert.ok(fromFresh.searches < fromOutlier.searches, `${fromFresh.searches} vs ${fromOutlier.searches} searches`);
});
