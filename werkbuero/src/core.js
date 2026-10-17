// WerkBüro: reine Rechenlogik für Angebote und Rechnungen.
// In Cent gerechnet, damit keine Rundungsfehler entstehen.
// Läuft im Browser (window.WB) und in Node-Tests (CommonJS).
(function (root) {
  "use strict";

  const DEFAULT_TAX = 19; // Prozent

  // Rundet kaufmännisch auf ganze Cent.
  function round(cents) {
    return Math.round(cents);
  }

  // Zeilensumme einer Position in Cent: Menge × Einzelpreis.
  function lineNet(position) {
    const qty = Number(position.qty) || 0;
    const price = Number(position.unitPrice) || 0;
    return round(qty * price);
  }

  // Rechnet eine Liste von Positionen zu Netto, MwSt. je Satz und Brutto zusammen.
  function totals(positions) {
    const byRate = {};
    let net = 0;

    for (const pos of positions) {
      const sum = lineNet(pos);
      const rate = pos.taxRate == null ? DEFAULT_TAX : Number(pos.taxRate);
      net += sum;
      byRate[rate] = (byRate[rate] || 0) + sum;
    }

    // MwSt. pro Satz einzeln runden, dann summieren (wie auf echten Rechnungen).
    const taxes = Object.keys(byRate)
      .map(Number)
      .sort((a, b) => a - b)
      .map((rate) => ({ rate, net: byRate[rate], tax: round((byRate[rate] * rate) / 100) }));

    const tax = taxes.reduce((sum, t) => sum + t.tax, 0);
    return { net, tax, gross: net + tax, taxes };
  }

  // Nächste fortlaufende Rechnungsnummer im Format <Jahr>-<4-stellig>.
  function nextNumber(existingNumbers, year, prefix) {
    const y = year || new Date().getFullYear();
    const pre = prefix == null ? String(y) : prefix;
    let max = 0;
    for (const num of existingNumbers || []) {
      const match = String(num).match(/(\d+)\s*$/);
      if (String(num).startsWith(pre) && match) max = Math.max(max, parseInt(match[1], 10));
    }
    return `${pre}-${String(max + 1).padStart(4, "0")}`;
  }

  // Ein Angebot in eine Rechnung übernehmen: Positionen bleiben, neue Nummer und Datum.
  function offerToInvoice(offer, number, dateIso) {
    return {
      number,
      customerId: offer.customerId,
      date: dateIso,
      positions: offer.positions.map((p) => ({ ...p })),
      note: offer.note || "",
      status: "offen",
      fromOffer: offer.id || null,
    };
  }

  // Offene Posten: Summe der Brutto-Beträge aller nicht bezahlten Rechnungen.
  function openAmount(invoices) {
    return invoices
      .filter((inv) => inv.status !== "bezahlt")
      .reduce((sum, inv) => sum + totals(inv.positions).gross, 0);
  }

  // Umsatz: Brutto aller bezahlten Rechnungen, optional ab einem Datum.
  function revenue(invoices, sinceIso) {
    return invoices
      .filter((inv) => inv.status === "bezahlt" && (!sinceIso || inv.date >= sinceIso))
      .reduce((sum, inv) => sum + totals(inv.positions).gross, 0);
  }

  // Cent als deutschen Euro-Betrag formatieren.
  function euro(cents) {
    return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  // Euro-Eingabe ("12,50" oder "12.50") in Cent.
  function parseEuro(text) {
    const clean = String(text).replace(/\s|€/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const value = parseFloat(clean);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  const api = { DEFAULT_TAX, lineNet, totals, nextNumber, offerToInvoice, openAmount, revenue, euro, parseEuro };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WB = api;
})(typeof window !== "undefined" ? window : globalThis);
