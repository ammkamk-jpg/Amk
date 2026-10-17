// WerkBüro: Logik für Termine und Zeiterfassung. Minuten als Grundeinheit.
// Läuft im Browser (window.WB_TIME) und in Node-Tests (CommonJS).
(function (root) {
  "use strict";

  const WB = typeof module !== "undefined" && module.exports ? require("./core.js") : root.WB;

  // "08:30" -> Minuten seit Mitternacht; ungültig -> null.
  function parseTime(text) {
    const m = String(text || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  // Minuten -> "08:30".
  function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Dauer in Minuten zwischen Start und Ende. Pausenminuten werden abgezogen.
  // Ende vor Start zählt als über Mitternacht (+24 h).
  function duration(start, end, pause) {
    const s = parseTime(start);
    const e = parseTime(end);
    if (s == null || e == null) return 0;
    let diff = e - s;
    if (diff < 0) diff += 24 * 60;
    diff -= Number(pause) || 0;
    return Math.max(0, diff);
  }

  // Minuten -> Dezimalstunden auf 2 Nachkommastellen (90 -> 1.5).
  function hours(minutes) {
    return Math.round((minutes / 60) * 100) / 100;
  }

  // Minuten -> "1,5 h" bzw. "0,25 h".
  function formatHours(minutes) {
    return hours(minutes).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " h";
  }

  function sumMinutes(entries) {
    return entries.reduce((sum, e) => sum + (Number(e.minutes) || 0), 0);
  }

  // Einträge nach Datum (ISO) gruppieren, neueste zuerst.
  function groupByDate(entries) {
    const map = {};
    for (const e of entries) (map[e.date] = map[e.date] || []).push(e);
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({ date, entries: map[date], minutes: sumMinutes(map[date]) }));
  }

  // ISO-Kalenderwoche eines ISO-Datums ("2026-10-17" -> {year, week}).
  function isoWeek(dateIso) {
    const d = new Date(dateIso + "T00:00:00Z");
    const day = (d.getUTCDay() + 6) % 7; // Mo=0
    d.setUTCDate(d.getUTCDate() - day + 3); // Donnerstag der Woche
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const fday = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
    const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
    return { year: d.getUTCFullYear(), week };
  }

  // Summe der Minuten in derselben ISO-Woche wie refIso.
  function minutesInWeek(entries, refIso) {
    const ref = isoWeek(refIso);
    return sumMinutes(entries.filter((e) => {
      const w = isoWeek(e.date);
      return w.year === ref.year && w.week === ref.week;
    }));
  }

  // Abrechenbare, noch nicht fakturierte Zeiten je Kunde zu Rechnungspositionen.
  // Stundensatz in Cent. Ergebnis: [{customerId, minutes, position}].
  function billableToPositions(times, hourlyRate, customerId) {
    const open = times.filter((t) => t.billable && !t.invoiced && (!customerId || t.customerId === customerId));
    const byCustomer = {};
    for (const t of open) byCustomer[t.customerId] = (byCustomer[t.customerId] || 0) + (Number(t.minutes) || 0);
    return Object.keys(byCustomer).map((cid) => ({
      customerId: cid,
      minutes: byCustomer[cid],
      position: {
        name: "Arbeitszeit",
        qty: hours(byCustomer[cid]),
        unit: "Std.",
        unitPrice: hourlyRate,
        taxRate: WB.DEFAULT_TAX,
      },
    }));
  }

  const api = { parseTime, formatTime, duration, hours, formatHours, sumMinutes, groupByDate, isoWeek, minutesInWeek, billableToPositions };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WB_TIME = api;
})(typeof window !== "undefined" ? window : globalThis);
