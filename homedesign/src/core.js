// RaumIdee: Auswahl-Listen und Prompt-Bau für Gemini.
// Kein API-Aufruf: der Prompt wird kopiert und mit dem Foto in Gemini eingefügt.
// Läuft im Browser (window.RI) und in Node-Tests (CommonJS).
(function (root) {
  "use strict";

  // Was soll Gemini machen? Wie die Werkzeuge in Home AI.
  const TASKS = [
    { id: "redesign", label: "Neu gestalten", hint: "Raum komplett im neuen Stil" },
    { id: "declutter", label: "Aufräumen", hint: "Unordnung weg, Möbel bleiben" },
    { id: "walls", label: "Wände streichen", hint: "Nur die Wandfarbe ändern" },
    { id: "floor", label: "Boden tauschen", hint: "Nur den Bodenbelag ändern" },
  ];

  // outdoor: Außenbereich, dort gibt es keine Wände/Böden zum Tauschen.
  const ROOMS = [
    { id: "living", label: "Wohnzimmer", en: "living room" },
    { id: "bedroom", label: "Schlafzimmer", en: "bedroom" },
    { id: "kitchen", label: "Küche", en: "kitchen" },
    { id: "bathroom", label: "Badezimmer", en: "bathroom" },
    { id: "dining", label: "Esszimmer", en: "dining room" },
    { id: "office", label: "Arbeitszimmer", en: "home office" },
    { id: "kids", label: "Kinderzimmer", en: "children's room" },
    { id: "hallway", label: "Flur", en: "hallway" },
    { id: "garden", label: "Garten", en: "garden", outdoor: true },
    { id: "facade", label: "Fassade", en: "house exterior", outdoor: true },
  ];
  const TOP_ROOMS = 4; // so viele Chips sind ohne „Alle ansehen“ sichtbar

  // swatches: drei Farbtöne für die Farbkarte des Stils.
  const STYLES = [
    { id: "modern", label: "Modern", swatches: ["#E9E7E3", "#8A8D91", "#1E1F22"],
      en: "modern style: clean lines, neutral palette with black accents, sleek low furniture, statement lighting" },
    { id: "minimal", label: "Minimalistisch", swatches: ["#F4F3EF", "#D9CBB4", "#BFC3C2"],
      en: "minimalist style: very few pieces, white walls and light wood, hidden storage, lots of open space" },
    { id: "scandi", label: "Skandinavisch", swatches: ["#F1EEE8", "#C9A97E", "#9AA5A8"],
      en: "Scandinavian style: light oak, white walls, wool and linen textiles, soft greys, cosy hygge lighting" },
    { id: "mediterranean", label: "Mediterran", swatches: ["#EDE3D2", "#C1693F", "#3D6E8F"],
      en: "Mediterranean style: lime-washed walls, terracotta tiles, soft arches, rattan, olive green and sea-blue accents" },
    { id: "japandi", label: "Japandi", swatches: ["#E6DED2", "#8C6E52", "#4A4A42"],
      en: "Japandi style: low natural-wood furniture, paper lamps, muted earth tones, calm and uncluttered" },
    { id: "industrial", label: "Industrial", swatches: ["#9A5A44", "#8E8D88", "#2B2B2B"],
      en: "industrial style: exposed brick, concrete, black steel, worn leather, Edison bulb lighting" },
    { id: "boho", label: "Boho", swatches: ["#E4C9A3", "#B5613A", "#5E7B4E"],
      en: "boho style: layered patterned rugs, many plants, macramé, rattan, warm earthy textiles" },
    { id: "luxury", label: "Luxuriös", swatches: ["#ECE7E1", "#B08D57", "#1F3B36"],
      en: "luxurious style: marble, velvet upholstery, brushed brass details, a chandelier, deep jewel tones" },
    { id: "country", label: "Landhaus", swatches: ["#EFE9DC", "#A7B59A", "#7A5A3C"],
      en: "country house style: painted wood, linen, vintage pieces, subtle floral patterns" },
    { id: "contemporary", label: "Zeitgenössisch", swatches: ["#E8E1D8", "#A88F78", "#5B4B44"],
      en: "contemporary style: curved sofa, mixed textures, warm neutrals, sculptural decor" },
    { id: "gothic", label: "Gotisch", swatches: ["#2A2326", "#6B1E2B", "#8E7A5A"],
      en: "gothic style: dark walls, ornate carved wood, candelabra, burgundy velvet" },
  ];

  const FLOORS = [
    { id: "wood", label: "Holz", en: "light oak wooden floorboards" },
    { id: "marble", label: "Marmor", en: "polished white marble" },
    { id: "tiles", label: "Fliesen", en: "patterned ceramic tiles" },
    { id: "concrete", label: "Beton", en: "smooth polished concrete" },
    { id: "carpet", label: "Teppich", en: "soft wall-to-wall carpet" },
  ];

  const WALLS = [
    { id: "white", label: "Weiß", hex: "#F4F4F0", en: "warm white" },
    { id: "sage", label: "Salbei", hex: "#A9B8A0", en: "sage green" },
    { id: "petrol", label: "Petrol", hex: "#1F6F6B", en: "deep teal" },
    { id: "terracotta", label: "Terrakotta", hex: "#C46A47", en: "terracotta" },
    { id: "sand", label: "Sand", hex: "#D8C6A5", en: "sand beige" },
    { id: "dove", label: "Taubenblau", hex: "#7E93A8", en: "dusty blue" },
    { id: "anthracite", label: "Anthrazit", hex: "#3A3D40", en: "anthracite grey" },
  ];

  const byId = (list, id) => list.find((x) => x.id === id) || null;

  // Wandfarbe: eine Liste-ID oder ein eigener Hex-Wert aus dem Farbwähler.
  function wallText(wall) {
    if (!wall) return null;
    const known = byId(WALLS, wall);
    if (known) return `${known.en} (${known.hex})`;
    return /^#[0-9a-f]{6}$/i.test(wall) ? `the colour ${wall.toUpperCase()}` : null;
  }

  // Welche Auswahl braucht eine Aufgabe? Steuert die Oberfläche und den Prompt.
  function needs(taskId, roomId) {
    const outdoor = !!(byId(ROOMS, roomId) || {}).outdoor;
    return {
      style: taskId === "redesign",
      floor: !outdoor && (taskId === "floor" || taskId === "redesign"),
      wall: !outdoor && (taskId === "walls" || taskId === "redesign"),
      floorRequired: taskId === "floor",
      wallRequired: taskId === "walls",
    };
  }

  // Was fehlt noch, bevor der Prompt Sinn ergibt? Leere Liste = fertig.
  function missing(sel) {
    const out = [];
    if (!byId(TASKS, sel.task)) out.push("Aufgabe");
    if (!byId(ROOMS, sel.room)) out.push("Raum");
    const n = needs(sel.task, sel.room);
    if (n.style && !byId(STYLES, sel.style) && !(sel.customStyle || "").trim()) out.push("Stil");
    if (n.floorRequired && !byId(FLOORS, sel.floor)) out.push("Boden");
    if (n.wallRequired && !wallText(sel.wall)) out.push("Wandfarbe");
    return out;
  }

  // Baut den englischen Prompt (Gemini folgt englischen Bild-Anweisungen am zuverlässigsten).
  function buildPrompt(sel) {
    if (missing(sel).length) return "";
    const room = byId(ROOMS, sel.room);
    const n = needs(sel.task, sel.room);
    const custom = (sel.customStyle || "").trim();
    const style = byId(STYLES, sel.style);
    const floor = n.floor ? byId(FLOORS, sel.floor) : null;
    const wall = n.wall ? wallText(sel.wall) : null;
    const lines = [];

    if (sel.task === "redesign") {
      lines.push(`Redesign the ${room.en} in the attached photo in ${custom ? `this style: ${custom}` : style.en}.`);
      if (floor) lines.push(`Floor: ${floor.en}.`);
      if (wall) lines.push(`Walls painted ${wall}.`);
    } else if (sel.task === "declutter") {
      lines.push(`Tidy up the ${room.en} in the attached photo: remove all clutter, loose items, clothes and mess.`);
      lines.push("Keep the existing furniture, decor style and colours exactly as they are.");
    } else if (sel.task === "walls") {
      lines.push(`Repaint the walls of the ${room.en} in the attached photo in ${wall}.`);
      lines.push("Change nothing else: same furniture, floor, ceiling and decor.");
    } else if (sel.task === "floor") {
      lines.push(`Replace the floor of the ${room.en} in the attached photo with ${floor.en}.`);
      lines.push("Change nothing else: same walls, furniture and decor.");
    }

    lines.push(room.outdoor
      ? "Keep the shape of the building, the windows, doors and the plot exactly as in the photo."
      : "Keep the room's architecture exactly: walls, windows, doors, ceiling height and room size.");
    lines.push("Keep the same camera angle and framing. Make it a photorealistic photo with natural light.");
    lines.push("Return one edited image.");
    return lines.join("\n");
  }

  // Kurze deutsche Zusammenfassung für Verlauf und Ergebnis-Ansicht.
  function summary(sel) {
    const parts = [];
    const task = byId(TASKS, sel.task);
    const room = byId(ROOMS, sel.room);
    if (room) parts.push(room.label);
    if (task) parts.push(task.label);
    const n = needs(sel.task, sel.room);
    if (n.style) parts.push((sel.customStyle || "").trim() || (byId(STYLES, sel.style) || {}).label || "");
    if (n.floor && byId(FLOORS, sel.floor)) parts.push(byId(FLOORS, sel.floor).label);
    if (n.wall && sel.wall) parts.push((byId(WALLS, sel.wall) || {}).label || String(sel.wall).toUpperCase());
    return parts.filter(Boolean).join(" · ");
  }

  const api = { TASKS, ROOMS, TOP_ROOMS, STYLES, FLOORS, WALLS, byId, needs, missing, buildPrompt, summary, wallText };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RI = api;
})(typeof window !== "undefined" ? window : globalThis);
