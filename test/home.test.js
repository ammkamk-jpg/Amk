const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const dgram = require("node:dgram");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp, loadConfig } = require("../home/server.js");

// ---- Fake Shelly (Gen2 oder Gen1) ----
function fakeShelly(gen, temp) {
  const st = { on: false, temp, calls: [] };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"); st.calls.push(req.url);
    const send = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
    if (u.pathname === "/shelly") return send(gen === 2 ? { gen: 2, id: "shellyplus1" } : { type: "SHSW-1" });
    if (gen === 2) {
      if (u.pathname === "/rpc/Switch.GetStatus") return send({ id: 0, output: st.on });
      if (u.pathname === "/rpc/Switch.Set") { st.on = u.searchParams.get("on") === "true"; return send({ was_on: !st.on }); }
      if (u.pathname === "/rpc/Temperature.GetStatus") return send({ id: 100, tC: st.temp });
    } else {
      if (u.pathname === "/relay/0") { if (u.searchParams.get("turn")) st.on = u.searchParams.get("turn") === "on"; return send({ ison: st.on }); }
      if (u.pathname === "/status") return send({ ext_temperature: { 0: { tC: st.temp } } });
    }
    res.statusCode = 404; res.end("{}");
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, st, host: "127.0.0.1:" + srv.address().port })));
}
// ---- Fake Govee-Lampe (UDP) ----
function fakeGovee(devPort, listenPort) {
  const st = { onOff: 0, brightness: 40, color: { r: 255, g: 255, b: 255 }, colorTemInKelvin: 2700, got: [] };
  const s = dgram.createSocket("udp4");
  s.on("message", (buf, rinfo) => {
    const m = JSON.parse(buf.toString()).msg; st.got.push(m.cmd);
    if (m.cmd === "turn") st.onOff = m.data.value;
    if (m.cmd === "brightness") st.brightness = m.data.value;
    if (m.cmd === "colorwc") { st.color = m.data.color; st.colorTemInKelvin = m.data.colorTemInKelvin; }
    if (m.cmd === "devStatus") s.send(JSON.stringify({ msg: { cmd: "devStatus", data: { onOff: st.onOff, brightness: st.brightness, color: st.color, colorTemInKelvin: st.colorTemInKelvin } } }), listenPort, "127.0.0.1");
  });
  return new Promise((r) => s.bind(devPort, "127.0.0.1", () => r({ s, st })));
}
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "home-")), "state.json");
const post = (base, p, b) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ code: r.status, j: await r.json() }));

test("Heizung Gen2: Ein/Aus, Auto mit Temperaturfühler", async () => {
  const sh = await fakeShelly(2, 19);
  const app = createApp({ ...loadConfig("/nope"), heating: { name: "FBH", host: sh.host, channel: 0, tempSensor: 100, target: 21, hysteresis: 0.5, autoOffHours: 0 }, lamps: [] }, { stateFile: tmp(), minSwitchMs: 0 });
  const port = await app.start(0), base = "http://127.0.0.1:" + port;
  let s = await (await fetch(base + "/api/state")).json();
  assert.equal(s.heating.on, false); assert.equal(s.heating.temp, 19); assert.equal(s.heating.canAuto, true);
  await post(base, "/api/heating", { mode: "on" }); assert.equal(sh.st.on, true);
  await post(base, "/api/heating", { mode: "off" }); assert.equal(sh.st.on, false);
  await post(base, "/api/heating", { mode: "auto", target: 21 }); assert.equal(sh.st.on, true, "19 < 20,5: heizt");
  sh.st.temp = 20.7; await app.tick(); assert.equal(sh.st.on, true, "im Toleranzband bleibt es an");
  sh.st.temp = 21.2; await app.tick(); assert.equal(sh.st.on, false, "Ziel erreicht: aus");
  sh.st.temp = 20.8; await app.tick(); assert.equal(sh.st.on, false, "im Toleranzband bleibt es aus");
  sh.st.temp = 20.4; await app.tick(); assert.equal(sh.st.on, true, "unter Ziel minus Toleranz: an");
  assert.equal((await post(base, "/api/heating", { target: 99 })).code, 400);
  assert.equal((await post(base, "/api/heating", { mode: "banane" })).code, 400);
  await app.stop(); sh.srv.close();
});

test("Heizung Gen1 ohne Fühler: Auto geht nicht, Auto-Aus nach Zeit", async () => {
  const sh = await fakeShelly(1, null); let now = 1e12;
  const app = createApp({ ...loadConfig("/nope"), heating: { name: "FBH", host: sh.host, channel: 0, tempSensor: null, target: 21, hysteresis: 0.5, autoOffHours: 2 }, lamps: [] }, { stateFile: tmp(), now: () => now });
  const port = await app.start(0), base = "http://127.0.0.1:" + port;
  assert.equal((await post(base, "/api/heating", { mode: "auto" })).code, 400);
  await post(base, "/api/heating", { mode: "on" }); assert.equal(sh.st.on, true);
  now += 3 * 3600e3; await app.tick(); assert.equal(sh.st.on, false, "nach 2 Stunden wieder aus");
  assert.equal((await app.getHeating()).mode, "off");
  await app.stop(); sh.srv.close();
});

test("Heizung nicht erreichbar: Fehlermeldung statt Absturz, Zustand bleibt gespeichert", async () => {
  const file = tmp();
  const cfg = { ...loadConfig("/nope"), heating: { name: "FBH", host: "127.0.0.1:1", channel: 0, tempSensor: null, target: 22, hysteresis: 0.5, autoOffHours: 0 }, lamps: [] };
  const app = createApp(cfg, { stateFile: file }); const port = await app.start(0);
  const s = await (await fetch("http://127.0.0.1:" + port + "/api/state")).json();
  assert.equal(s.heating.reachable, false); assert.match(s.heating.error, /Nicht erreichbar/);
  await app.stop();
});

test("Govee: Status, An/Aus, Helligkeit, Farbe, Weißton", async () => {
  const L = 24002, D = 24003, g = await fakeGovee(D, L);
  const app = createApp({ ...loadConfig("/nope"), heating: null, lamps: [{ name: "Sofa", ip: "127.0.0.1" }], goveePorts: { listen: L, device: D, scan: 24001 } }, { stateFile: tmp() });
  const port = await app.start(0), base = "http://127.0.0.1:" + port;
  let s = await (await fetch(base + "/api/state")).json();
  assert.equal(s.heating, null); assert.equal(s.lamps[0].reachable, true); assert.equal(s.lamps[0].on, false); assert.equal(s.lamps[0].brightness, 40);
  await post(base, "/api/lamp/0", { on: true, brightness: 80 });
  await new Promise((r) => setTimeout(r, 100)); assert.equal(g.st.onOff, 1); assert.equal(g.st.brightness, 80);
  await post(base, "/api/lamp/0", { color: { r: 255, g: 0, b: 0 } });
  await new Promise((r) => setTimeout(r, 100)); assert.deepEqual(g.st.color, { r: 255, g: 0, b: 0 });
  await post(base, "/api/lamp/0", { kelvin: 2700 });
  await new Promise((r) => setTimeout(r, 100)); assert.equal(g.st.colorTemInKelvin, 2700);
  assert.equal((await post(base, "/api/lamp/0", { color: { r: 999, g: 0, b: 0 } })).code, 400);
  assert.equal((await post(base, "/api/lamp/5", { on: true })).code, 400);
  s = await (await fetch(base + "/api/state")).json(); assert.equal(s.lamps[0].on, true);
  await app.stop(); g.s.close();
});

test("Govee-Lampe aus dem Netz: offline mit Hinweis, Rest läuft weiter", async () => {
  const app = createApp({ ...loadConfig("/nope"), heating: null, lamps: [{ name: "Weg", ip: "127.0.0.1" }], goveePorts: { listen: 24012, device: 24013, scan: 24011 } }, { stateFile: tmp() });
  const port = await app.start(0);
  const s = await (await fetch("http://127.0.0.1:" + port + "/api/state")).json();
  assert.equal(s.lamps[0].reachable, false); assert.match(s.lamps[0].error, /LAN-Steuerung/);
  await app.stop();
});

test("Seite wird ausgeliefert", async () => {
  const app = createApp({ ...loadConfig("/nope"), heating: null, lamps: [] }, { stateFile: tmp() }); const port = await app.start(0);
  const r = await fetch("http://127.0.0.1:" + port + "/"); assert.equal(r.status, 200); assert.match(await r.text(), /<title>Haus<\/title>/);
  await app.stop();
});
