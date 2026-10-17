const test = require("node:test");
const assert = require("node:assert/strict");
const WB = require("../werkbuero/src/core.js");

const positions = [
  { name: "Arbeitsstunde", qty: 8, unitPrice: 5500, taxRate: 19 }, // 440,00 €
  { name: "Material", qty: 3, unitPrice: 1299, taxRate: 19 }, // 38,97 €
];

test("Zeilensumme", () => {
  assert.equal(WB.lineNet(positions[0]), 44000);
  assert.equal(WB.lineNet({ qty: 2.5, unitPrice: 1000 }), 2500);
});

test("Summen mit einem Steuersatz", () => {
  const t = WB.totals(positions);
  assert.equal(t.net, 47897);
  assert.equal(t.tax, 9100); // 19 % von 478,97 = 90,9043 -> 91,00 €
  assert.equal(t.gross, 56997);
  assert.equal(t.taxes.length, 1);
});

test("Gemischte Steuersätze einzeln gerundet", () => {
  const t = WB.totals([
    { qty: 1, unitPrice: 10033, taxRate: 19 },
    { qty: 1, unitPrice: 10033, taxRate: 7 },
  ]);
  assert.equal(t.net, 20066);
  assert.equal(t.taxes[0].rate, 7);
  assert.equal(t.taxes[0].tax, 702); // 7 % von 100,33 = 7,0231 -> 7,02 €
  assert.equal(t.taxes[1].tax, 1906); // 19 % von 100,33 = 19,0627 -> 19,06 €
  assert.equal(t.tax, 2608);
  assert.equal(t.gross, 22674);
});

test("Standard-Steuersatz, wenn keiner angegeben", () => {
  const t = WB.totals([{ qty: 1, unitPrice: 10000 }]);
  assert.equal(t.tax, 1900);
});

test("Fortlaufende Rechnungsnummer", () => {
  assert.equal(WB.nextNumber([], 2026), "2026-0001");
  assert.equal(WB.nextNumber(["2026-0001", "2026-0002"], 2026), "2026-0003");
  assert.equal(WB.nextNumber(["2025-0009"], 2026), "2026-0001"); // anderes Jahr beginnt neu
  assert.equal(WB.nextNumber(["2026-0001", "2026-0010", "2026-0007"], 2026), "2026-0011");
});

test("Angebot zu Rechnung", () => {
  const offer = { id: "o1", customerId: "c1", positions, note: "Danke", status: "offen" };
  const inv = WB.offerToInvoice(offer, "2026-0005", "2026-10-17");
  assert.equal(inv.number, "2026-0005");
  assert.equal(inv.customerId, "c1");
  assert.equal(inv.fromOffer, "o1");
  assert.equal(inv.status, "offen");
  assert.equal(inv.positions.length, 2);
  assert.notEqual(inv.positions[0], positions[0]); // Kopie, kein Verweis
});

test("Offene Posten und Umsatz", () => {
  const invoices = [
    { date: "2026-01-10", status: "bezahlt", positions: [{ qty: 1, unitPrice: 10000, taxRate: 19 }] },
    { date: "2026-02-10", status: "offen", positions: [{ qty: 1, unitPrice: 20000, taxRate: 19 }] },
    { date: "2026-03-10", status: "überfällig", positions: [{ qty: 1, unitPrice: 5000, taxRate: 19 }] },
  ];
  assert.equal(WB.openAmount(invoices), 23800 + 5950); // offen + überfällig, brutto
  assert.equal(WB.revenue(invoices), 11900);
  assert.equal(WB.revenue(invoices, "2026-02-01"), 0);
});

test("Euro formatieren und einlesen", () => {
  assert.equal(WB.euro(56997), "569,97 €");
  assert.equal(WB.euro(100000), "1.000,00 €");
  assert.equal(WB.parseEuro("12,50"), 1250);
  assert.equal(WB.parseEuro("1.299,00"), 129900);
  assert.equal(WB.parseEuro("55"), 5500);
  assert.equal(WB.parseEuro("abc"), 0);
});
