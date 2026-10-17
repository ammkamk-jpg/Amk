const test = require("node:test");
const assert = require("node:assert/strict");
const FUT = require("../src/fut.js");

test("Preisstufen", () => {
  assert.equal(FUT.stepFor(950), 50);
  assert.equal(FUT.stepFor(1000), 100);
  assert.equal(FUT.stepFor(10000), 250);
  assert.equal(FUT.stepFor(50000), 500);
  assert.equal(FUT.stepFor(100000), 1000);
});

test("Runden auf gültige Preise", () => {
  assert.equal(FUT.roundDown(1049), 1000);
  assert.equal(FUT.roundDown(999), 950);
  assert.equal(FUT.roundUp(990), 1000);
  assert.equal(FUT.roundUp(49900), 50000);
  assert.equal(FUT.roundUp(10), FUT.MIN_PRICE);
  assert.equal(FUT.roundDown(99999999), FUT.MAX_PRICE);
});

test("Gültigkeit", () => {
  assert.ok(FUT.isValidPrice(10250));
  assert.ok(!FUT.isValidPrice(10100));
  assert.ok(!FUT.isValidPrice(150));
});

test("Steuer und Gewinn", () => {
  assert.equal(FUT.netAfterTax(10000), 9500);
  assert.equal(FUT.tax(10000), 500);
  assert.equal(FUT.netAfterTax(1050), 997);
  assert.equal(FUT.profit(9000, 10000), 500);
  assert.equal(FUT.roi(10000, 10000), -5);
});

test("Break-even-Verkaufspreis", () => {
  const sell = FUT.minSellPrice(10000);
  assert.equal(sell, 10750);
  assert.ok(FUT.netAfterTax(sell) >= 10000);
  assert.ok(FUT.netAfterTax(sell - FUT.stepFor(sell - 1)) < 10000);
  assert.equal(FUT.minSellPrice(10000, 1000), 11750);
});

test("Maximaler Kaufpreis", () => {
  assert.equal(FUT.maxBuyPrice(20000), 19000);
  assert.equal(FUT.maxBuyPrice(20000, 1000), 18000);
  assert.equal(FUT.maxBuyPrice(200, 100), null);
  const buy = FUT.maxBuyPrice(53000, 500);
  assert.ok(FUT.profit(buy, 53000) >= 500);
});
