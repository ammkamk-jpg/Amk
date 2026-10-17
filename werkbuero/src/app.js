// WerkBüro: Oberfläche für Angebote und Rechnungen.
// Speichert im Claude-Konto (db) wenn als Artifact veröffentlicht, sonst im localStorage.
(function () {
  "use strict";

  const LOCAL_KEY = "werkbuero.v1";
  const fmt = WB.euro;

  // ---------- Speicher ----------

  function readLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (data && data.customers) return data;
    } catch (e) { /* fällt auf Seed zurück */ }
    return WB_SEED.seed();
  }

  let state = readLocal();
  const cloud = { ref: null, writing: false, dirty: false };

  function writeLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch (e) { /* ohne Speicher nur bis Neuladen */ }
  }

  function persist() {
    writeLocal();
    if (!cloud.ref) return;
    cloud.dirty = true;
    if (!cloud.writing) flush();
  }

  async function flush() {
    cloud.writing = true;
    while (cloud.dirty) {
      cloud.dirty = false;
      try { await cloud.ref.set({ data: state }); }
      catch (e) { showToast("Speichern im Konto fehlgeschlagen. Änderung ist in diesem Browser gesichert."); break; }
    }
    cloud.writing = false;
  }

  async function connectCloud() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    try {
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const ref = db.collection("data/users/" + id).doc("werkbuero");
      const doc = await ref.get();
      cloud.ref = ref;
      if (doc.exists && doc.data().data) {
        state = doc.data().data;
        writeLocal();
      } else {
        persist();
      }
      document.getElementById("store-status").textContent = "In deinem Claude-Konto gespeichert";
      renderAll();
    } catch (e) { cloud.ref = null; }
  }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- Helfer ----------

  const $ = (sel) => document.querySelector(sel);

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function deDate(iso) { return iso ? iso.split("-").reverse().join(".") : ""; }
  function customerName(id) { const c = state.customers.find((c) => c.id === id); return c ? c.name : "— Kunde gelöscht —"; }

  let toastTimer = null;
  function showToast(text) {
    const t = $("#toast");
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  function confirmTap(button) {
    if (button.dataset.armed) return true;
    const label = button.textContent;
    button.dataset.armed = "1";
    button.classList.add("armed");
    button.textContent = "Sicher?";
    setTimeout(() => { delete button.dataset.armed; button.classList.remove("armed"); button.textContent = label; }, 3000);
    return false;
  }

  function statusBadge(status) {
    const cls = status === "bezahlt" ? "bezahlt" : status === "überfällig" ? "ueberfaellig" : "offen";
    return `<span class="badge ${cls}">${esc(status)}</span>`;
  }

  // ---------- Tabs ----------

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("main > .panel").forEach((p) => p.classList.toggle("active", p.id === tab.dataset.tab));
    });
  });

  // ---------- Dashboard ----------

  function renderDashboard() {
    const year = String(new Date().getFullYear());
    const open = WB.openAmount(state.invoices);
    const overdue = state.invoices.filter((i) => i.status === "überfällig").reduce((s, i) => s + WB.totals(i.positions).gross, 0);
    const offersOpen = state.offers.filter((o) => o.status === "offen").length;

    $("#dashboard").innerHTML = `
      <div class="stat-grid">
        <div class="stat"><span class="k">Umsatz ${year} (bezahlt)</span><span class="v good">${fmt(WB.revenue(state.invoices, year + "-01-01"))}</span></div>
        <div class="stat"><span class="k">Offene Posten</span><span class="v">${fmt(open)}</span></div>
        <div class="stat"><span class="k">Davon überfällig</span><span class="v ${overdue ? "bad" : ""}">${fmt(overdue)}</span></div>
        <div class="stat"><span class="k">Offene Angebote</span><span class="v">${offersOpen}</span></div>
      </div>
      <div class="card">
        <h2>Schnellstart</h2>
        <div class="actions">
          <button data-new="offer">Neues Angebot</button>
          <button data-new="invoice">Neue Rechnung</button>
          <button class="secondary" data-new="customer">Neuer Kunde</button>
        </div>
      </div>
      ${recentCard()}`;
  }

  function recentCard() {
    const docs = [
      ...state.offers.map((o) => ({ ...o, t: "offer" })),
      ...state.invoices.map((i) => ({ ...i, t: "invoice" })),
    ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
    if (!docs.length) return "";
    return `<div class="card"><h2>Zuletzt</h2>${docs.map((d) => `
      <div class="list-item" data-open="${d.t}" data-id="${d.id}">
        <div class="main">
          <div class="name">${esc(d.number)} · ${esc(customerName(d.customerId))}</div>
          <div class="sub">${d.t === "offer" ? "Angebot" : "Rechnung"} · ${deDate(d.date)}</div>
        </div>
        <div class="side">${statusBadge(d.status)}<span class="amount">${fmt(WB.totals(d.positions).gross)}</span></div>
      </div>`).join("")}</div>`;
  }

  // ---------- Listen: Angebote / Rechnungen ----------

  function renderDocList(kind) {
    const list = kind === "offer" ? state.offers : state.invoices;
    const panel = $(kind === "offer" ? "#offers" : "#invoices");
    const sorted = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    panel.innerHTML = `
      <div class="actions"><button data-new="${kind}">${kind === "offer" ? "Neues Angebot" : "Neue Rechnung"}</button></div>
      ${sorted.length ? sorted.map((d) => `
        <div class="list-item" data-open="${kind}" data-id="${d.id}">
          <div class="main">
            <div class="name">${esc(d.number)}</div>
            <div class="sub">${esc(customerName(d.customerId))} · ${deDate(d.date)}</div>
          </div>
          <div class="side">${statusBadge(d.status)}<span class="amount">${fmt(WB.totals(d.positions).gross)}</span></div>
        </div>`).join("")
      : `<div class="card empty">Noch nichts hier. Lege ${kind === "offer" ? "ein Angebot" : "eine Rechnung"} an.</div>`}`;
  }

  // ---------- Kunden ----------

  function renderCustomers() {
    $("#customers").innerHTML = `
      <div class="actions"><button data-new="customer">Neuer Kunde</button></div>
      ${state.customers.length ? state.customers.map((c) => `
        <div class="list-item" data-edit="customer" data-id="${c.id}">
          <div class="main">
            <div class="name">${esc(c.name)}</div>
            <div class="sub">${esc(c.contact || "")}${c.email ? " · " + esc(c.email) : ""}</div>
          </div>
          <button class="secondary small" data-edit="customer" data-id="${c.id}">Bearbeiten</button>
        </div>`).join("")
      : `<div class="card empty">Noch keine Kunden.</div>`}`;
  }

  // ---------- Katalog ----------

  function renderCatalog() {
    $("#catalog").innerHTML = `
      <div class="actions"><button data-new="item">Neuer Eintrag</button></div>
      ${state.catalog.length ? state.catalog.map((k) => `
        <div class="list-item" data-edit="item" data-id="${k.id}">
          <div class="main">
            <div class="name">${esc(k.name)}</div>
            <div class="sub">${esc(k.kind === "material" ? "Material" : "Leistung")} · ${esc(k.unit)} · ${k.taxRate} %</div>
          </div>
          <div class="side"><span class="amount">${fmt(k.unitPrice)}</span></div>
        </div>`).join("")
      : `<div class="card empty">Noch keine Katalog-Einträge.</div>`}`;
  }

  // ---------- Sheet (Formular-Overlay) ----------

  let sheetSubmit = null;

  function openSheet(title, bodyHtml, onSubmit) {
    sheetSubmit = onSubmit;
    $("#sheet-title").textContent = title;
    $("#sheet-body").innerHTML = bodyHtml;
    $("#sheet-back").hidden = false;
    const first = $("#sheet-body input, #sheet-body select, #sheet-body textarea");
    if (first) first.focus();
  }
  function closeSheet() { $("#sheet-back").hidden = true; sheetSubmit = null; }

  $("#sheet-back").addEventListener("click", (e) => { if (e.target.id === "sheet-back" || e.target.dataset.action === "close") closeSheet(); });

  // ---------- Dokument bearbeiten ----------

  function blankDoc(kind) {
    const nums = kind === "offer" ? state.offers.map((o) => o.number) : state.invoices.map((i) => i.number);
    return {
      id: null, kind,
      number: WB.nextNumber(nums, null, kind === "offer" ? "A-" + new Date().getFullYear() : null),
      customerId: state.customers[0] ? state.customers[0].id : "",
      date: todayIso(), status: "offen", note: "", positions: [], fromOffer: null,
    };
  }

  function posRow(pos, i) {
    const opts = state.catalog.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join("");
    return `<div class="pos-row" data-i="${i}">
      <input data-f="name" value="${esc(pos.name)}" placeholder="Bezeichnung" list="catalog-list" aria-label="Bezeichnung">
      <input data-f="qty" inputmode="decimal" value="${pos.qty}" aria-label="Menge">
      <input data-f="unitPrice" inputmode="decimal" value="${(pos.unitPrice / 100).toString().replace(".", ",")}" aria-label="Einzelpreis €">
      <select data-f="taxRate" aria-label="MwSt">${[19, 7, 0].map((r) => `<option value="${r}" ${r === pos.taxRate ? "selected" : ""}>${r}%</option>`).join("")}</select>
      <button type="button" class="danger del" data-del="${i}" aria-label="Position löschen">×</button>
      <datalist id="catalog-list">${opts}</datalist>
    </div>`;
  }

  function docSheetBody(doc) {
    const custOpts = state.customers.map((c) => `<option value="${c.id}" ${c.id === doc.customerId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    const t = WB.totals(doc.positions);
    return `
      <div class="row">
        <label>Nummer <input id="d-number" value="${esc(doc.number)}"></label>
        <label>Datum <input id="d-date" type="date" value="${esc(doc.date)}"></label>
      </div>
      <label>Kunde <select id="d-customer">${custOpts || `<option value="">Erst Kunde anlegen</option>`}</select></label>
      <label>Status
        <select id="d-status">${["offen", "bezahlt", "überfällig"].map((s) => `<option ${s === doc.status ? "selected" : ""}>${s}</option>`).join("")}</select>
      </label>
      <h2>Positionen</h2>
      <div class="pos-head"><span>Bezeichnung</span><span>Menge</span><span>Preis €</span><span>MwSt</span><span></span></div>
      <div id="pos-rows">${doc.positions.map(posRow).join("")}</div>
      <button type="button" class="secondary" id="add-pos">+ Position</button>
      <label>Notiz <textarea id="d-note">${esc(doc.note)}</textarea></label>
      <dl class="result" id="d-totals">${totalsRows(t)}</dl>
      <div class="actions">
        <button type="button" id="save-doc">Speichern</button>
        ${doc.kind === "invoice" ? `<button type="button" class="secondary" id="preview-doc">Vorschau</button>` : ""}
        ${doc.id ? `<button type="button" class="danger" id="del-doc">Löschen</button>` : ""}
      </div>`;
  }

  function totalsRows(t) {
    return `<dt>Netto</dt><dd>${fmt(t.net)}</dd>` +
      t.taxes.filter((x) => x.rate > 0).map((x) => `<dt>zzgl. ${x.rate}% MwSt.</dt><dd>${fmt(x.tax)}</dd>`).join("") +
      `<dt>Gesamt (brutto)</dt><dd class="total">${fmt(t.gross)}</dd>`;
  }

  function openDoc(kind, id) {
    const list = kind === "offer" ? state.offers : state.invoices;
    const original = id ? list.find((d) => d.id === id) : null;
    const doc = original ? JSON.parse(JSON.stringify({ ...original, kind })) : blankDoc(kind);
    if (!doc.positions.length) doc.positions.push({ name: "", qty: 1, unit: "", unitPrice: 0, taxRate: WB.DEFAULT_TAX });

    openSheet(kind === "offer" ? "Angebot" : "Rechnung", docSheetBody(doc), null);

    const rowsEl = $("#pos-rows");
    const readRows = () => Array.from(rowsEl.querySelectorAll(".pos-row")).map((row) => {
      const g = (f) => row.querySelector(`[data-f="${f}"]`);
      return {
        name: g("name").value.trim(),
        qty: parseFloat(g("qty").value.replace(",", ".")) || 0,
        unitPrice: WB.parseEuro(g("unitPrice").value),
        taxRate: parseInt(g("taxRate").value, 10),
        unit: "",
      };
    });
    const refreshTotals = () => { $("#d-totals").innerHTML = totalsRows(WB.totals(readRows())); };

    rowsEl.addEventListener("input", refreshTotals);
    rowsEl.addEventListener("change", (e) => {
      if (e.target.dataset.f === "name") {
        const hit = state.catalog.find((k) => k.name === e.target.value);
        if (hit) {
          const row = e.target.closest(".pos-row");
          row.querySelector('[data-f="unitPrice"]').value = (hit.unitPrice / 100).toString().replace(".", ",");
          row.querySelector('[data-f="taxRate"]').value = hit.taxRate;
          refreshTotals();
        }
      }
    });
    rowsEl.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (!del) return;
      if (rowsEl.querySelectorAll(".pos-row").length <= 1) { showToast("Mindestens eine Position."); return; }
      del.closest(".pos-row").remove();
      refreshTotals();
    });
    $("#add-pos").addEventListener("click", () => {
      const i = rowsEl.querySelectorAll(".pos-row").length;
      rowsEl.insertAdjacentHTML("beforeend", posRow({ name: "", qty: 1, unitPrice: 0, taxRate: WB.DEFAULT_TAX }, i));
    });

    const collect = () => ({
      number: $("#d-number").value.trim(),
      customerId: $("#d-customer").value,
      date: $("#d-date").value || todayIso(),
      status: $("#d-status").value,
      note: $("#d-note").value.trim(),
      positions: readRows().filter((p) => p.name || p.unitPrice),
    });

    $("#save-doc").addEventListener("click", () => {
      const data = collect();
      if (!data.customerId) return showToast("Bitte einen Kunden wählen.");
      if (!data.positions.length) return showToast("Bitte mindestens eine Position ausfüllen.");
      if (original) Object.assign(original, data);
      else list.unshift({ id: newId(), kind, fromOffer: null, ...data });
      persist();
      closeSheet();
      renderAll();
      showToast(kind === "offer" ? "Angebot gespeichert." : "Rechnung gespeichert.");
    });

    if (doc.kind === "invoice") {
      $("#preview-doc").addEventListener("click", () => openPreview({ ...doc, ...collect() }));
    }
    if (doc.id) {
      $("#del-doc").addEventListener("click", (e) => {
        if (!confirmTap(e.target)) return;
        const idx = list.indexOf(original);
        if (idx >= 0) list.splice(idx, 1);
        persist(); closeSheet(); renderAll();
      });
    }
  }

  // ---------- Angebot -> Rechnung ----------

  function offerToInvoice(offer) {
    const number = WB.nextNumber(state.invoices.map((i) => i.number), null, null);
    const inv = WB.offerToInvoice(offer, number, todayIso());
    inv.id = newId(); inv.kind = "invoice";
    state.invoices.unshift(inv);
    offer.status = "angenommen";
    persist(); renderAll();
    showToast(`Rechnung ${number} aus Angebot erstellt.`);
    document.querySelector('.tab[data-tab="invoices"]').click();
    openDoc("invoice", inv.id);
  }

  // ---------- Rechnungsvorschau ----------

  function openPreview(doc) {
    const c = state.customers.find((x) => x.id === doc.customerId) || {};
    const t = WB.totals(doc.positions);
    const co = state.company;
    const body = `
      <div class="invoice-paper">
        <div class="ip-head">
          <div class="from">${esc(co.name)}\n${esc(co.address)}${co.taxId ? "\nUSt-IdNr. " + esc(co.taxId) : ""}</div>
          <div><strong>Rechnung</strong><br>${esc(doc.number)}<br>${deDate(doc.date)}</div>
        </div>
        <div class="ip-to"><strong>${esc(c.name || "")}</strong>\n${esc(c.address || "")}</div>
        <table>
          <thead><tr><th>Position</th><th class="n">Menge</th><th class="n">Einzel</th><th class="n">Summe</th></tr></thead>
          <tbody>${doc.positions.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${String(p.qty).replace(".", ",")}</td><td class="n">${fmt(p.unitPrice)}</td><td class="n">${fmt(WB.lineNet(p))}</td></tr>`).join("")}</tbody>
        </table>
        <dl class="result">${totalsRows(t)}</dl>
        ${doc.note ? `<div class="ip-note">${esc(doc.note)}</div>` : ""}
        ${co.iban ? `<div class="hint">Bitte überweisen auf IBAN ${esc(co.iban)} unter Angabe der Rechnungsnummer.</div>` : ""}
        <div class="hint">Beispiel-Vorlage. Für echte Rechnungen die Pflichtangaben mit einem Steuerberater prüfen.</div>
      </div>
      <div class="actions"><button type="button" class="secondary" data-action="close">Schließen</button></div>`;
    openSheet("Vorschau " + doc.number, body, null);
  }

  // ---------- Kunde / Katalog bearbeiten ----------

  function openCustomer(id) {
    const c = id ? state.customers.find((x) => x.id === id) : null;
    const d = c || { name: "", contact: "", address: "", email: "" };
    openSheet(c ? "Kunde bearbeiten" : "Neuer Kunde", `
      <label>Name / Firma <input id="c-name" value="${esc(d.name)}"></label>
      <label>Ansprechpartner <input id="c-contact" value="${esc(d.contact)}"></label>
      <label>Adresse <textarea id="c-address">${esc(d.address)}</textarea></label>
      <label>E-Mail <input id="c-email" type="email" value="${esc(d.email)}"></label>
      <div class="actions">
        <button type="button" id="c-save">Speichern</button>
        ${c ? `<button type="button" class="danger" id="c-del">Löschen</button>` : ""}
      </div>`, null);
    $("#c-save").addEventListener("click", () => {
      const name = $("#c-name").value.trim();
      if (!name) return showToast("Name darf nicht leer sein.");
      const data = { name, contact: $("#c-contact").value.trim(), address: $("#c-address").value.trim(), email: $("#c-email").value.trim() };
      if (c) Object.assign(c, data);
      else state.customers.push({ id: newId(), ...data });
      persist(); closeSheet(); renderAll(); showToast("Kunde gespeichert.");
    });
    if (c) $("#c-del").addEventListener("click", (e) => {
      if (!confirmTap(e.target)) return;
      state.customers = state.customers.filter((x) => x !== c);
      persist(); closeSheet(); renderAll();
    });
  }

  function openItem(id) {
    const k = id ? state.catalog.find((x) => x.id === id) : null;
    const d = k || { name: "", kind: "leistung", unit: "Std.", unitPrice: 0, taxRate: 19 };
    openSheet(k ? "Katalog-Eintrag" : "Neuer Eintrag", `
      <label>Bezeichnung <input id="k-name" value="${esc(d.name)}"></label>
      <div class="row">
        <label>Art <select id="k-kind">${["leistung", "material"].map((x) => `<option value="${x}" ${x === d.kind ? "selected" : ""}>${x === "material" ? "Material" : "Leistung"}</option>`).join("")}</select></label>
        <label>Einheit <input id="k-unit" value="${esc(d.unit)}"></label>
      </div>
      <div class="row">
        <label>Einzelpreis € <input id="k-price" inputmode="decimal" value="${(d.unitPrice / 100).toString().replace(".", ",")}"></label>
        <label>MwSt <select id="k-tax">${[19, 7, 0].map((r) => `<option value="${r}" ${r === d.taxRate ? "selected" : ""}>${r}%</option>`).join("")}</select></label>
      </div>
      <div class="actions">
        <button type="button" id="k-save">Speichern</button>
        ${k ? `<button type="button" class="danger" id="k-del">Löschen</button>` : ""}
      </div>`, null);
    $("#k-save").addEventListener("click", () => {
      const name = $("#k-name").value.trim();
      if (!name) return showToast("Bezeichnung darf nicht leer sein.");
      const data = { name, kind: $("#k-kind").value, unit: $("#k-unit").value.trim(), unitPrice: WB.parseEuro($("#k-price").value), taxRate: parseInt($("#k-tax").value, 10) };
      if (k) Object.assign(k, data);
      else state.catalog.push({ id: newId(), ...data });
      persist(); closeSheet(); renderAll(); showToast("Eintrag gespeichert.");
    });
    if (k) $("#k-del").addEventListener("click", (e) => {
      if (!confirmTap(e.target)) return;
      state.catalog = state.catalog.filter((x) => x !== k);
      persist(); closeSheet(); renderAll();
    });
  }

  // ---------- Klicks ----------

  document.addEventListener("click", (e) => {
    const neu = e.target.closest("[data-new]");
    if (neu) {
      const map = { offer: () => openDoc("offer", null), invoice: () => openDoc("invoice", null), customer: () => openCustomer(null), item: () => openItem(null) };
      map[neu.dataset.new]();
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) { openDoc(open.dataset.open, open.dataset.id); return; }
    const edit = e.target.closest("[data-edit]");
    if (edit) { (edit.dataset.edit === "customer" ? openCustomer : openItem)(edit.dataset.id); return; }
  });

  // Angebot-Sheet: Button "In Rechnung umwandeln" wird dort nicht gebraucht,
  // weil wir es über die Angebotsliste anbieten.
  $("#offers").addEventListener("click", (e) => {
    const conv = e.target.closest("[data-convert]");
    if (!conv) return;
    const offer = state.offers.find((o) => o.id === conv.dataset.convert);
    if (offer) offerToInvoice(offer);
  });

  // ---------- Backup ----------

  $("#export-btn").addEventListener("click", async () => {
    const json = JSON.stringify(state, null, 2);
    const filename = `werkbuero-${todayIso()}.json`;
    if (window.claude && typeof window.claude.use === "function") {
      const dl = await window.claude.use("downloads");
      if (dl) { try { await dl.save({ filename, data: json }); showToast("Backup gespeichert."); } catch (err) { if (err && err.code !== "declined") showToast("Backup fehlgeschlagen."); } return; }
      try { await navigator.clipboard.writeText(json); showToast("Backup in die Zwischenablage kopiert."); } catch (err) { showToast("Export hier nicht möglich."); }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  });

  let pendingImport = null;
  $("#import-input").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.customers || !data.invoices) throw new Error("Format");
      pendingImport = data;
      $("#import-text").textContent = `${data.customers.length} Kunden, ${data.offers ? data.offers.length : 0} Angebote und ${data.invoices.length} Rechnungen importieren? Ersetzt die aktuellen Daten.`;
      $("#import-bar").hidden = false;
    } catch (err) { showToast("Die Datei ist kein WerkBüro-Backup."); }
  });
  $("#import-confirm").addEventListener("click", () => {
    if (!pendingImport) return;
    state = pendingImport; pendingImport = null;
    $("#import-bar").hidden = true; persist(); renderAll(); showToast("Backup importiert.");
  });
  $("#import-cancel").addEventListener("click", () => { pendingImport = null; $("#import-bar").hidden = true; });

  // ---------- Firmendaten ----------

  $("#company-btn").addEventListener("click", () => {
    const co = state.company;
    openSheet("Meine Firma", `
      <label>Firmenname <input id="co-name" value="${esc(co.name)}"></label>
      <label>Adresse <textarea id="co-address">${esc(co.address)}</textarea></label>
      <div class="row">
        <label>USt-IdNr. <input id="co-tax" value="${esc(co.taxId)}"></label>
        <label>Stundensatz € <input id="co-rate" inputmode="decimal" value="${(co.hourlyRate / 100).toString().replace(".", ",")}"></label>
      </div>
      <label>IBAN <input id="co-iban" value="${esc(co.iban)}"></label>
      <div class="actions"><button type="button" id="co-save">Speichern</button></div>`, null);
    $("#co-save").addEventListener("click", () => {
      state.company = { name: $("#co-name").value.trim(), address: $("#co-address").value.trim(), taxId: $("#co-tax").value.trim(), iban: $("#co-iban").value.trim(), hourlyRate: WB.parseEuro($("#co-rate").value) };
      persist(); closeSheet(); renderAll(); showToast("Firmendaten gespeichert.");
    });
  });

  // ---------- Angebotsliste mit Umwandeln ----------

  function enhanceOfferList() {
    document.querySelectorAll('#offers .list-item[data-open="offer"]').forEach((el) => {
      const id = el.dataset.id;
      const offer = state.offers.find((o) => o.id === id);
      if (offer && offer.status === "offen" && !el.querySelector("[data-convert]")) {
        const btn = document.createElement("button");
        btn.className = "secondary small"; btn.textContent = "→ Rechnung"; btn.dataset.convert = id;
        btn.addEventListener("click", (ev) => { ev.stopPropagation(); offerToInvoice(offer); });
        el.querySelector(".side").prepend(btn);
      }
    });
  }

  // ---------- Rendern ----------

  function renderAll() {
    renderDashboard();
    renderDocList("offer");
    renderDocList("invoice");
    renderCustomers();
    renderCatalog();
    enhanceOfferList();
    $("#company-name").textContent = state.company.name;
  }

  renderAll();
  connectCloud();
})();
