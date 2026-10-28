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
  assert.equal(P.probeVerdict([{ price: 9000, secs: 400 }, { price: 14750, secs: 3400 }]), "few");
  assert.equal(P.probeVerdict([]), "none");
});

test("probeMid stays on valid prices and stops when lo/hi are neighbours", () => {
  assert.equal(P.probeMid(14750, 15000), 0);
  const m = P.probeMid(9900, 10250);
  assert.ok(m > 9900 && m < 10250 && m === P.floorStep(m));
});
