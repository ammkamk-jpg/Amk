// FUT-Marktregeln: Preisstufen, 5 % EA-Steuer, Gewinnrechnung.
// Läuft als klassisches <script> (window.FUT) und als CommonJS-Modul (Tests).
(function (root) {
  "use strict";

  const MIN_PRICE = 200;
  const MAX_PRICE = 15000000;
  const TAX_PERCENT = 5;

  // Schrittweite des Transfermarkts für einen Preis.
  function stepFor(price) {
    if (price < 1000) return 50;
    if (price < 10000) return 100;
    if (price < 50000) return 250;
    if (price < 100000) return 500;
    return 1000;
  }

  function clamp(price) {
    return Math.min(MAX_PRICE, Math.max(MIN_PRICE, price));
  }

  // Auf den nächsten gültigen Preis abrunden.
  function roundDown(price) {
    const step = stepFor(price);
    return clamp(Math.floor(price / step) * step);
  }

  // Auf den nächsten gültigen Preis aufrunden.
  function roundUp(price) {
    const step = stepFor(price);
    return clamp(Math.ceil(price / step) * step);
  }

  function isValidPrice(price) {
    return Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE && price % stepFor(price) === 0;
  }

  // Erlös nach Steuer. Abgerundet, damit der Gewinn nie zu hoch angezeigt wird.
  function netAfterTax(sellPrice) {
    return Math.floor((sellPrice * (100 - TAX_PERCENT)) / 100);
  }

  function tax(sellPrice) {
    return sellPrice - netAfterTax(sellPrice);
  }

  function profit(buyPrice, sellPrice) {
    return netAfterTax(sellPrice) - buyPrice;
  }

  // Rendite in Prozent bezogen auf den Kaufpreis.
  function roi(buyPrice, sellPrice) {
    if (buyPrice <= 0) return 0;
    return (profit(buyPrice, sellPrice) / buyPrice) * 100;
  }

  // Kleinster gültiger Verkaufspreis, bei dem man nach Steuer mindestens
  // buyPrice + minProfit zurückbekommt.
  function minSellPrice(buyPrice, minProfit = 0) {
    const needed = buyPrice + minProfit;
    let price = roundUp(Math.ceil((needed * 100) / (100 - TAX_PERCENT)));
    while (netAfterTax(price) < needed && price < MAX_PRICE) price += stepFor(price);
    return netAfterTax(price) >= needed ? price : null;
  }

  // Höchster gültiger Kaufpreis, der beim Verkauf zu sellPrice noch minProfit bringt.
  function maxBuyPrice(sellPrice, minProfit = 0) {
    const limit = netAfterTax(sellPrice) - minProfit;
    if (limit < MIN_PRICE) return null;
    return roundDown(limit);
  }

  const api = {
    MIN_PRICE,
    MAX_PRICE,
    TAX_PERCENT,
    stepFor,
    roundDown,
    roundUp,
    isValidPrice,
    netAfterTax,
    tax,
    profit,
    roi,
    minSellPrice,
    maxBuyPrice,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FUT = api;
})(typeof window !== "undefined" ? window : globalThis);
