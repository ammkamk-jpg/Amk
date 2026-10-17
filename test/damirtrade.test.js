const test = require("node:test");
const assert = require("node:assert/strict");
const DT = require("../damirtrade/src/core.js");

const BASE = "https://utas.mob.v4.prd.futc-ext.gcp.ea.com/ut/game/fc26";

const search = {
  auctionInfo: [
    { tradeId: 1, buyNowPrice: 9500, startingBid: 9000, currentBid: 0, tradeState: "active", itemData: { id: 11, assetId: 231747, rating: 91 } },
    { tradeId: 2, buyNowPrice: 12000, startingBid: 11000, currentBid: 0, tradeState: "active", itemData: { id: 12, assetId: 231747, rating: 91 } },
    { tradeId: 3, buyNowPrice: 800, startingBid: 700, currentBid: 0, tradeState: "active", itemData: { id: 13, assetId: 5, rating: 75 } },
  ],
};

const settings = { minProfitValue: 500, minProfitUnit: "coins", useMarketPrice: true };

test("Anfragen erkennen", () => {
  assert.equal(DT.classifyRequest("GET", `${BASE}/transfermarket?num=21&type=player`), "search");
  assert.equal(DT.classifyRequest("PUT", `${BASE}/trade/123456/bid`), "bid");
  assert.equal(DT.classifyRequest("POST", `${BASE}/auctionhouse`), "list");
  assert.equal(DT.classifyRequest("GET", `${BASE}/tradepile`), "tradepile");
  assert.equal(DT.classifyRequest("GET", "https://www.ea.com/fonts/x.woff"), null);
  assert.equal(DT.classifyError(429), "softban");
  assert.equal(DT.classifyError(458), "captcha");
});

test("Suchergebnisse lesen", () => {
  const auctions = DT.parseAuctions(search);
  assert.equal(auctions.length, 3);
  assert.equal(auctions[0].buyNow, 9500);
  assert.equal(auctions[0].name, "Spieler 231747 (91)");
  assert.deepEqual(DT.lowestPrices(auctions), { "231747:91": 9500, "5:75": 800 });
});

test("Bewertung mit Ziel", () => {
  const [cheap, expensive] = DT.parseAuctions(search, () => "Mbappé");
  const targets = [{ enabled: true, name: "mbapp", maxBuy: 10000, sellPrice: 12000 }];
  const good = DT.evaluate(cheap, targets, null, settings);
  assert.equal(good.profit, 1900);
  assert.ok(good.hit);
  const tooExpensive = DT.evaluate(expensive, targets, null, { ...settings, useMarketPrice: false });
  assert.equal(tooExpensive.hit, false);
});

test("Bewertung mit Marktpreis und Prozent-Gewinn", () => {
  const [cheap] = DT.parseAuctions(search);
  const result = DT.evaluate(cheap, [], 11000, { minProfitValue: 5, minProfitUnit: "percent", useMarketPrice: true });
  assert.equal(result.profit, 950);
  assert.ok(result.hit);
  assert.equal(DT.evaluate(cheap, [], null, settings).hit, false);
});

test("Kauf erkennen", () => {
  const response = {
    credits: 50500,
    auctionInfo: [{ tradeId: 1, buyNowPrice: 9500, currentBid: 9500, bidState: "highest", tradeState: "closed", itemData: { id: 11, assetId: 231747, rating: 91 } }],
  };
  const bid = DT.parseBid('{"bid":9500}', response);
  assert.equal(bid.amount, 9500);
  assert.ok(bid.won);
  assert.equal(bid.coins, 50500);
  assert.equal(bid.auction.itemId, 11);
  const lost = DT.parseBid('{"bid":9500}', { auctionInfo: [{ ...response.auctionInfo[0], bidState: "outbid", tradeState: "active" }] });
  assert.equal(lost.won, false);
});

test("Verkäufe in der Transferliste", () => {
  const pile = {
    auctionInfo: [
      { tradeId: 1, currentBid: 12000, tradeState: "closed", itemData: { id: 11, assetId: 1 } },
      { tradeId: 2, currentBid: 0, tradeState: "expired", itemData: { id: 12, assetId: 2 } },
    ],
  };
  const sold = DT.soldItems(pile);
  assert.equal(sold.length, 1);
  assert.equal(sold[0].itemId, 11);
});

test("Verkaufsprofile", () => {
  assert.equal(DT.suggestListPrice(10000, { mode: "margin", value: 1000 }, {}), 11750);
  assert.equal(DT.suggestListPrice(10000, { mode: "fixed", value: 12340 }, {}), 12500);
  assert.equal(DT.suggestListPrice(10000, { mode: "market", value: 1 }, { marketPrice: 13000 }), 12750);
  assert.equal(DT.suggestListPrice(10000, { mode: "market", value: 1 }, { marketPrice: 10000 }), 10750);
});

test("Session-Statistik", () => {
  const stats = DT.sessionStats({ startedAt: 0, searches: 40, hits: 4, buys: 2, spent: 19000, profit: 3000 }, 30 * 60000);
  assert.equal(stats.hitRate, 10);
  assert.equal(stats.profitPerHour, 6000);
});
