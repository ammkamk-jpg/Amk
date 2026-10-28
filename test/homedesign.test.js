const test = require("node:test");
const assert = require("node:assert/strict");
const RI = require("../homedesign/src/core.js");

test("Neu gestalten: Raum, Stil, Boden und Wand landen im Prompt", () => {
  const p = RI.buildPrompt({ task: "redesign", room: "bedroom", style: "mediterranean", floor: "wood", wall: "sage" });
  assert.match(p, /Redesign the bedroom/);
  assert.match(p, /Mediterranean style/);
  assert.match(p, /light oak wooden floorboards/);
  assert.match(p, /sage green \(#A9B8A0\)/);
  assert.match(p, /same camera angle/);
});

test("Eigener Stil ersetzt den gewählten Stil", () => {
  const p = RI.buildPrompt({ task: "redesign", room: "living", style: "modern", customStyle: " 70er Retro " });
  assert.match(p, /this style: 70er Retro\./);
  assert.doesNotMatch(p, /modern style/);
});

test("Ohne Pflichtauswahl gibt es keinen Prompt", () => {
  assert.deepEqual(RI.missing({ task: "redesign", room: "bedroom" }), ["Stil"]);
  assert.equal(RI.buildPrompt({ task: "redesign", room: "bedroom" }), "");
  assert.deepEqual(RI.missing({ task: "walls", room: "kitchen" }), ["Wandfarbe"]);
  assert.deepEqual(RI.missing({ task: "floor", room: "kitchen" }), ["Boden"]);
  assert.deepEqual(RI.missing({}), ["Aufgabe", "Raum"]);
});

test("Wände streichen: eigener Hex-Wert, sonst nichts ändern", () => {
  const p = RI.buildPrompt({ task: "walls", room: "kitchen", wall: "#12ab34" });
  assert.match(p, /Repaint the walls of the kitchen in the attached photo in the colour #12AB34/);
  assert.match(p, /Change nothing else/);
  assert.equal(RI.wallText("blau"), null);
});

test("Aufräumen braucht keinen Stil und behält die Möbel", () => {
  const p = RI.buildPrompt({ task: "declutter", room: "bedroom", style: "gothic" });
  assert.match(p, /Tidy up the bedroom/);
  assert.match(p, /Keep the existing furniture/);
  assert.doesNotMatch(p, /gothic/);
});

test("Außenbereich: kein Boden, keine Wandfarbe, Gebäude bleibt", () => {
  const n = RI.needs("redesign", "garden");
  assert.equal(n.floor, false);
  assert.equal(n.wall, false);
  const p = RI.buildPrompt({ task: "redesign", room: "garden", style: "japandi", floor: "marble", wall: "petrol" });
  assert.doesNotMatch(p, /marble|teal/);
  assert.match(p, /shape of the building/);
});

test("Zusammenfassung auf Deutsch", () => {
  assert.equal(RI.summary({ task: "redesign", room: "bedroom", style: "mediterranean", wall: "sage" }), "Schlafzimmer · Neu gestalten · Mediterran · Salbei");
  assert.equal(RI.summary({ task: "walls", room: "kitchen", wall: "#12ab34" }), "Küche · Wände streichen · #12AB34");
});
