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

test("search gaps: never below 2.5s, widely spread, sometimes long", () => {
  const gaps = Array.from({ length: 4000 }, () => P.humanGapMs(2500)).sort((a, b) => a - b);
  const pct = (p) => gaps[Math.floor(gaps.length * p)];
  assert.ok(gaps[0] >= 2575, `never below 2.5s (min ${gaps[0]})`);
  assert.ok(pct(0.9) - pct(0.1) >= 900, `spread p10 ${pct(0.1)} .. p90 ${pct(0.9)}`);
  assert.ok(pct(0.5) >= 2900 && pct(0.5) <= 3500, `median ${pct(0.5)}`);
  assert.ok(gaps[gaps.length - 1] > 5000, "sometimes a long pause");
  assert.ok(new Set(gaps).size > 900, "hardly ever the same twice");
});

test("tempo mood: 1.0-1.2x for 8-25 searches", () => {
  for (let i = 0; i < 300; i++) {
    const m = P.nextMood();
    assert.ok(m.mood >= 1 && m.mood <= 1.2 && m.left >= 8 && m.left <= 25, JSON.stringify(m));
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
