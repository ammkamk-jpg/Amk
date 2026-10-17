// damirtrade: reine Logik ohne DOM. Erkennt EA-Web-App-Anfragen, liest
// Suchergebnisse, Käufe und die Transferliste aus und bewertet Angebote.
// Läuft im Userscript (window.DT_CORE) und in Node-Tests (CommonJS).
(function (root) {
  "use strict";

  const FUT = typeof module !== "undefined" && module.exports ? require("../../src/fut.js") : root.FUT;

  // ---------- Anfragen erkennen ----------

  // Ordnet eine Anfrage der Web App einer Art zu. Nur lesend: damirtrade
  // schickt selbst nie Anfragen an EA.
  function classifyRequest(method, url) {
    const m = String(method || "GET").toUpperCase();
    const path = String(url || "").split("?")[0];
    if (!/\/ut\/game\//.test(path)) return null;
    if (m === "GET" && /\/transfermarket$/.test(path)) return "search";
    if (m === "PUT" && /\/trade\/\d+\/bid$/.test(path)) return "bid";
    if (m === "POST" && /\/auctionhouse$/.test(path)) return "list";
    if (m === "GET" && /\/tradepile$/.test(path)) return "tradepile";
    if (m === "GET" && /\/usermassinfo$/.test(path)) return "userinfo";
    return "other";
  }

  // EA meldet zu viele Anfragen (429) oder verlangt ein Captcha (458).
  function classifyError(status) {
    if (status === 429) return "softban";
    if (status === 458) return "captcha";
    if (status === 401) return "session";
    return null;
  }

  // ---------- Antworten lesen ----------

  function toAuction(info, nameOf) {
    if (!info || !info.itemData) return null;
    const item = info.itemData;
    return {
      tradeId: info.tradeId,
      itemId: item.id,
      assetId: item.assetId,
      rating: item.rating || null,
      name: nameOf(item),
      buyNow: info.buyNowPrice || 0,
      startingBid: info.startingBid || 0,
      currentBid: info.currentBid || 0,
      expires: info.expires,
      tradeState: info.tradeState || null,
      bidState: info.bidState || null,
    };
  }

  function defaultName(item) {
    return `Spieler ${item.assetId}${item.rating ? " (" + item.rating + ")" : ""}`;
  }

  function parseAuctions(json, nameOf = defaultName) {
    const list = json && Array.isArray(json.auctionInfo) ? json.auctionInfo : [];
    return list.map((info) => toAuction(info, nameOf)).filter(Boolean);
  }

  function coinsOf(json) {
    if (!json) return null;
    if (typeof json.credits === "number") return json.credits;
    const coins = Array.isArray(json.currencies) && json.currencies.find((c) => c.name === "COINS");
    return coins ? coins.finalFunds : null;
  }

  // Ein Gebot war erfolgreich, wenn wir danach Höchstbietender sind und der
  // Handel durch "Sofort kaufen" abgeschlossen ist.
  function parseBid(requestBody, json, nameOf = defaultName) {
    let amount = null;
    try {
      amount = JSON.parse(requestBody).bid;
    } catch (e) {
      amount = null;
    }
    const auction = parseAuctions(json, nameOf)[0] || null;
    const won = !!auction && auction.bidState === "highest" && auction.tradeState === "closed";
    return { amount, auction, won, coins: coinsOf(json) };
  }

  // Verkaufte Karten in der Transferliste: Handel geschlossen, mit Gebot.
  function soldItems(json, nameOf = defaultName) {
    return parseAuctions(json, nameOf).filter((a) => a.tradeState === "closed" && a.currentBid > 0);
  }

  // ---------- Bewertung ----------

  function matchesTarget(auction, target) {
    if (target.name && !auction.name.toLowerCase().includes(target.name.toLowerCase())) return false;
    if (target.minRating && (auction.rating || 0) < target.minRating) return false;
    if (target.maxRating && (auction.rating || 0) > target.maxRating) return false;
    return true;
  }

  function meetsMinProfit(buy, profit, settings) {
    if (settings.minProfitUnit === "percent") return buy > 0 && (profit / buy) * 100 >= settings.minProfitValue;
    return profit >= settings.minProfitValue;
  }

  // Bewertet ein Angebot gegen die Ziele und den beobachteten Marktpreis.
  // Ergebnis: bester erwarteter Gewinn und ob es ein Treffer ist.
  function evaluate(auction, targets, marketPrice, settings) {
    const buy = auction.buyNow;
    let best = null;

    for (const target of targets) {
      if (!target.enabled || !matchesTarget(auction, target)) continue;
      if (target.maxBuy && buy > target.maxBuy) continue;
      const sell = target.sellPrice || marketPrice;
      if (!sell) continue;
      const profit = FUT.profit(buy, sell);
      if (!best || profit > best.profit) best = { profit, sell, source: target.label || target.name || "Ziel" };
    }

    if (!best && settings.useMarketPrice && marketPrice) {
      const profit = FUT.profit(buy, marketPrice);
      best = { profit, sell: marketPrice, source: "Marktpreis" };
    }

    if (!best) return { profit: null, sell: null, source: null, hit: false };
    return { ...best, hit: meetsMinProfit(buy, best.profit, settings) };
  }

  // Niedrigster "Sofort kaufen"-Preis je Karte (assetId + Wertung) aus einer Suche.
  function lowestPrices(auctions) {
    const lowest = {};
    for (const a of auctions) {
      if (!a.buyNow) continue;
      const key = `${a.assetId}:${a.rating || 0}`;
      if (!lowest[key] || a.buyNow < lowest[key]) lowest[key] = a.buyNow;
    }
    return lowest;
  }

  // Empfohlener Verkaufspreis nach Verkaufsprofil (wie "Listing profiles").
  function suggestListPrice(buy, profile, context) {
    if (profile.mode === "fixed" && profile.value) return FUT.roundUp(profile.value);
    if (profile.mode === "market" && context.marketPrice) {
      const undercut = context.marketPrice - FUT.stepFor(context.marketPrice - 1) * (profile.value || 0);
      return Math.max(FUT.roundDown(undercut), FUT.minSellPrice(buy) || 0);
    }
    return FUT.minSellPrice(buy, profile.value || 0);
  }

  function sessionStats(session, now) {
    const minutes = Math.max(1, (now - session.startedAt) / 60000);
    return {
      minutes: Math.floor(minutes),
      searches: session.searches,
      hits: session.hits,
      buys: session.buys,
      spent: session.spent,
      hitRate: session.searches ? (session.hits / session.searches) * 100 : 0,
      profit: session.profit,
      profitPerHour: Math.round((session.profit / minutes) * 60),
    };
  }

  const api = {
    classifyRequest,
    classifyError,
    parseAuctions,
    parseBid,
    soldItems,
    coinsOf,
    evaluate,
    lowestPrices,
    suggestListPrice,
    sessionStats,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DT_CORE = api;
})(typeof window !== "undefined" ? window : globalThis);
