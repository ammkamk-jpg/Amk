// RaumIdee: Oberfläche. Auswahl per Chips und Farbkarten, kein Suchfeld (wie Home AI).
(function () {
  "use strict";
  const RI = window.RI;
  const $ = (id) => document.getElementById(id);
  const SEL_KEY = "raumidee.sel.v1";
  const HIST_KEY = "raumidee.history.v1";

  function lsGet(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privates Fenster: dann eben ohne Speichern */ }
  }

  // Startet mit einer fertigen Beispielauswahl, damit sofort ein Prompt dasteht.
  const sel = Object.assign({ task: "redesign", room: "bedroom", style: "mediterranean", customStyle: "", floor: "", wall: "" }, lsGet(SEL_KEY, {}));
  let history = lsGet(HIST_KEY, []);
  let showAllRooms = false, showAllStyles = false;
  let beforeUrl = null, afterUrl = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  // Ausgewählten Raum immer zeigen, auch wenn er nicht unter den ersten Chips ist.
  function visibleRooms() {
    if (showAllRooms) return RI.ROOMS;
    const top = RI.ROOMS.slice(0, RI.TOP_ROOMS);
    const cur = RI.byId(RI.ROOMS, sel.room);
    return cur && !top.includes(cur) ? top.concat(cur) : top;
  }

  function chip(kind, item, on, extra) {
    return `<button type="button" class="chip" data-${kind}="${item.id}" aria-pressed="${on}">${esc(item.label)}${extra || ""}</button>`;
  }

  function render() {
    const n = RI.needs(sel.task, sel.room);

    $("tasks").className = "chips tasks";
    $("tasks").innerHTML = RI.TASKS.map((t) => chip("task", t, sel.task === t.id, `<small>${esc(t.hint)}</small>`)).join("");

    $("rooms").innerHTML = visibleRooms().map((r) => chip("room", r, sel.room === r.id)).join("");
    $("rooms-all").textContent = showAllRooms ? "Weniger" : "Alle ansehen";

    $("style-step").hidden = !n.style;
    const custom = sel.customStyle.trim();
    $("styles").className = "cards" + (showAllStyles ? " all" : "");
    $("styles").innerHTML = RI.STYLES.map((s) =>
      `<button type="button" class="card" data-style="${s.id}" aria-pressed="${!custom && sel.style === s.id}">` +
      `<div class="sw">${s.swatches.map((c) => `<i style="background:${c}"></i>`).join("")}</div>` +
      `<span>${esc(s.label)}</span></button>`).join("");
    $("styles-all").textContent = showAllStyles ? "Weniger" : "Alle ansehen";
    if (document.activeElement !== $("custom-style")) $("custom-style").value = sel.customStyle;

    $("detail-step").hidden = !n.floor && !n.wall;
    $("floor-row").hidden = !n.floor;
    $("wall-row").hidden = !n.wall;
    $("floors").innerHTML = RI.FLOORS.map((f) => chip("floor", f, sel.floor === f.id)).join("");
    const customWall = /^#/.test(sel.wall) ? sel.wall : "";
    $("walls").innerHTML = RI.WALLS.map((w) =>
      `<button type="button" class="paint" data-wall="${w.id}" aria-pressed="${sel.wall === w.id}"><i style="background:${w.hex}"></i><span>${esc(w.label)}</span></button>`).join("") +
      `<label class="paint custom" aria-pressed="${!!customWall}"><i style="background:${customWall ||
        "conic-gradient(#e0574a,#e8c547,#5fbf6a,#4a90d9,#a35ad1,#e0574a)"}"></i><span>${customWall ? customWall.toUpperCase() : "Eigene"}</span>` +
      `<input id="wall-picker" type="color" value="${customWall || "#88a0a8"}" aria-label="Eigene Wandfarbe"></label>`;

    const miss = RI.missing(sel);
    $("prompt").value = RI.buildPrompt(sel);
    $("summary").textContent = miss.length ? "Noch wählen: " + miss.join(", ") : RI.summary(sel);
    $("summary").className = "sum" + (miss.length ? " missing" : "");
    $("copy-btn").disabled = miss.length > 0;

    $("history-step").hidden = history.length === 0;
    $("history").innerHTML = history.map((h, i) =>
      `<button type="button" class="hist" data-hist="${i}"><span>${esc(RI.summary(h.sel))}</span><time>${new Date(h.t).toLocaleDateString("de-DE")}</time></button>`).join("");

    lsSet(SEL_KEY, sel);
  }

  // Abwählen erlaubt bei optionalen Extras (nochmal tippen = aus).
  function toggle(key, id, optional) {
    sel[key] = optional && sel[key] === id ? "" : id;
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, [data-wall]");
    if (!el) return;
    const d = el.dataset;
    if (d.task) sel.task = d.task;
    else if (d.room) sel.room = d.room;
    else if (d.style) { sel.style = d.style; sel.customStyle = ""; }
    else if (d.floor) toggle("floor", d.floor, sel.task !== "floor");
    else if (d.wall) toggle("wall", d.wall, sel.task !== "walls");
    else if (d.hist) { Object.assign(sel, history[Number(d.hist)].sel); toast("Auswahl geladen"); }
    else if (el.id === "rooms-all") showAllRooms = !showAllRooms;
    else if (el.id === "styles-all") showAllStyles = !showAllStyles;
    else if (el.id === "copy-btn") { copyPrompt(); return; }
    else return;
    render();
  });

  $("custom-style").addEventListener("input", (e) => { sel.customStyle = e.target.value; render(); });
  document.addEventListener("change", (e) => {
    if (e.target.id === "wall-picker") { sel.wall = e.target.value; render(); }
  });

  function remember() {
    const entry = { t: Date.now(), sel: Object.assign({}, sel) };
    history = [entry].concat(history.filter((h) => RI.summary(h.sel) !== RI.summary(sel))).slice(0, 8);
    lsSet(HIST_KEY, history);
  }

  function copyPrompt() {
    const text = $("prompt").value;
    if (!text) return;
    const done = () => { remember(); render(); toast("Prompt kopiert. Jetzt Gemini öffnen."); };
    const fallback = () => {
      const ta = $("prompt");
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      if (ok) done(); else toast("Text ist markiert. Tippe auf Kopieren.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // Vorher-nachher: beide Bilder nur im Speicher, nichts wird hochgeladen.
  function readImage(input, cb) {
    const file = input.files && input.files[0];
    if (!file) return;
    cb(URL.createObjectURL(file));
    input.value = "";
  }

  function renderCompare() {
    const show = !!(beforeUrl && afterUrl);
    $("compare").hidden = !show;
    $("compare-note").hidden = !afterUrl;
    if (!show) {
      if (afterUrl) toast("Lade oben noch dein Vorher-Foto, dann siehst du den Vergleich.");
      return;
    }
    $("cmp-before").src = beforeUrl;
    $("cmp-after").src = afterUrl;
  }

  $("photo-input").addEventListener("change", (e) => readImage(e.target, (url) => {
    if (beforeUrl) URL.revokeObjectURL(beforeUrl);
    beforeUrl = url;
    $("photo-img").src = url;
    $("photo-img").hidden = false;
    $("photo-empty").hidden = true;
    renderCompare();
  }));

  $("result-input").addEventListener("change", (e) => readImage(e.target, (url) => {
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    afterUrl = url;
    renderCompare();
  }));

  $("cmp-range").addEventListener("input", (e) => {
    $("cmp-before").style.clipPath = `inset(0 ${100 - Number(e.target.value)}% 0 0)`;
  });

  render();
  // Gewählten Stil in der Leiste sichtbar machen.
  const picked = $("styles").querySelector('[aria-pressed="true"]');
  if (picked) $("styles").scrollLeft = picked.offsetLeft - $("styles").offsetLeft - 8;
})();
