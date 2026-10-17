// Beispieldaten zum Ausprobieren. Werden geladen, wenn noch nichts gespeichert ist.
(function (root) {
  "use strict";

  function seed() {
    return {
      company: {
        name: "Mustermann Elektro GmbH",
        address: "Werkstraße 7\n12345 Musterstadt",
        taxId: "DE123456789",
        iban: "DE02 1203 0000 0000 2020 51",
        hourlyRate: 5900,
      },
      customers: [
        { id: "c1", name: "Bäckerei Krause", contact: "Anna Krause", address: "Marktplatz 3\n12345 Musterstadt", email: "info@baeckerei-krause.de" },
        { id: "c2", name: "Familie Berger", contact: "Thomas Berger", address: "Lindenweg 12\n12347 Musterstadt", email: "t.berger@example.de" },
        { id: "c3", name: "Hausverwaltung Nord", contact: "Petra Lang", address: "Nordring 88\n12349 Musterstadt", email: "lang@hv-nord.de" },
      ],
      catalog: [
        { id: "k1", name: "Elektriker-Stunde", unit: "Std.", unitPrice: 5900, taxRate: 19, kind: "leistung" },
        { id: "k2", name: "Anfahrt", unit: "pauschal", unitPrice: 3500, taxRate: 19, kind: "leistung" },
        { id: "k3", name: "Steckdose Unterputz", unit: "Stk.", unitPrice: 1290, taxRate: 19, kind: "material" },
        { id: "k4", name: "LED-Panel 40W", unit: "Stk.", unitPrice: 4990, taxRate: 19, kind: "material" },
        { id: "k5", name: "NYM-J 3x1,5 Kabel", unit: "m", unitPrice: 115, taxRate: 19, kind: "material" },
      ],
      offers: [
        {
          id: "o1", number: "A-2026-0007", customerId: "c1", date: "2026-10-02", status: "offen", note: "Gültig 30 Tage.",
          positions: [
            { name: "Elektriker-Stunde", qty: 6, unit: "Std.", unitPrice: 5900, taxRate: 19 },
            { name: "LED-Panel 40W", qty: 8, unit: "Stk.", unitPrice: 4990, taxRate: 19 },
            { name: "Anfahrt", qty: 1, unit: "pauschal", unitPrice: 3500, taxRate: 19 },
          ],
        },
      ],
      invoices: [
        {
          id: "r1", number: "2026-0011", customerId: "c2", date: "2026-09-15", status: "bezahlt", note: "", fromOffer: null,
          positions: [
            { name: "Elektriker-Stunde", qty: 3, unit: "Std.", unitPrice: 5900, taxRate: 19 },
            { name: "Steckdose Unterputz", qty: 5, unit: "Stk.", unitPrice: 1290, taxRate: 19 },
          ],
        },
        {
          id: "r2", number: "2026-0012", customerId: "c3", date: "2026-10-08", status: "offen", note: "Zahlbar in 14 Tagen.", fromOffer: null,
          positions: [
            { name: "Elektriker-Stunde", qty: 12, unit: "Std.", unitPrice: 5900, taxRate: 19 },
            { name: "NYM-J 3x1,5 Kabel", qty: 120, unit: "m", unitPrice: 115, taxRate: 19 },
            { name: "Anfahrt", qty: 2, unit: "pauschal", unitPrice: 3500, taxRate: 19 },
          ],
        },
      ],
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { seed };
  else root.WB_SEED = { seed };
})(typeof window !== "undefined" ? window : globalThis);
