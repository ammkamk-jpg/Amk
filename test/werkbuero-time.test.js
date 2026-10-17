const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../werkbuero/src/time.js");

test("Uhrzeit lesen und formatieren", () => {
  assert.equal(T.parseTime("08:30"), 510);
  assert.equal(T.parseTime("00:00"), 0);
  assert.equal(T.parseTime("23:59"), 1439);
  assert.equal(T.parseTime("24:00"), null);
  assert.equal(T.parseTime("8:5"), null);
  assert.equal(T.formatTime(510), "08:30");
});

test("Dauer mit Pause und über Mitternacht", () => {
  assert.equal(T.duration("08:00", "16:30", 30), 480); // 8,5 h minus 30 min = 8 h
  assert.equal(T.duration("09:00", "12:00", 0), 180);
  assert.equal(T.duration("22:00", "02:00", 0), 240); // über Mitternacht
  assert.equal(T.duration("10:00", "10:00", 0), 0);
  assert.equal(T.duration("bad", "10:00", 0), 0);
});

test("Stunden rechnen und formatieren", () => {
  assert.equal(T.hours(90), 1.5);
  assert.equal(T.hours(15), 0.25);
  assert.equal(T.formatHours(90), "1,5 h");
  assert.equal(T.formatHours(480), "8,0 h");
});

test("Summe und Gruppierung", () => {
  const entries = [
    { date: "2026-10-15", minutes: 120 },
    { date: "2026-10-15", minutes: 60 },
    { date: "2026-10-16", minutes: 480 },
  ];
  assert.equal(T.sumMinutes(entries), 660);
  const groups = T.groupByDate(entries);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].date, "2026-10-16"); // neueste zuerst
  assert.equal(groups[1].minutes, 180);
});

test("ISO-Kalenderwoche", () => {
  assert.deepEqual(T.isoWeek("2026-10-17"), { year: 2026, week: 42 });
  assert.deepEqual(T.isoWeek("2026-01-01"), { year: 2026, week: 1 });
  assert.deepEqual(T.isoWeek("2025-12-29"), { year: 2026, week: 1 }); // gehört zur KW1 2026
});

test("Minuten in der Woche", () => {
  const entries = [
    { date: "2026-10-12", minutes: 480 }, // Mo, KW42
    { date: "2026-10-18", minutes: 120 }, // So, KW42
    { date: "2026-10-19", minutes: 300 }, // Mo, KW43
  ];
  assert.equal(T.minutesInWeek(entries, "2026-10-15"), 600);
  assert.equal(T.minutesInWeek(entries, "2026-10-19"), 300);
});

test("Abrechenbare Zeiten zu Positionen", () => {
  const times = [
    { customerId: "c1", minutes: 90, billable: true, invoiced: false },
    { customerId: "c1", minutes: 30, billable: true, invoiced: false },
    { customerId: "c1", minutes: 60, billable: true, invoiced: true }, // schon fakturiert
    { customerId: "c2", minutes: 480, billable: false, invoiced: false }, // nicht abrechenbar
  ];
  const result = T.billableToPositions(times, 5900);
  assert.equal(result.length, 1);
  assert.equal(result[0].customerId, "c1");
  assert.equal(result[0].minutes, 120);
  assert.equal(result[0].position.qty, 2);
  assert.equal(result[0].position.unitPrice, 5900);
  assert.equal(result[0].position.taxRate, 19);
});
