'use strict';
// Einfaches Haus-Panel: Fußbodenheizung (Shelly) + Lampen (Govee). Keine Abhängigkeiten, nur Node 18+.
// Start: node home/server.js   (Konfiguration: home/config.json)
const http = require('node:http');
const dgram = require('node:dgram');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  port: 8080,
  heating: { name: 'Fußbodenheizung', host: '192.168.1.50', channel: 0, tempSensor: null, target: 21, hysteresis: 0.5, autoOffHours: 0 },
  lamps: [],                       // [{ name: 'Wohnzimmer', ip: '192.168.1.60' }]
  goveePorts: { listen: 4002, device: 4003, scan: 4001 },
};
function loadConfig(file) {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('config.json ist kaputt: ' + e.message); }
  return { ...DEFAULTS, ...c, heating: c.heating === null ? null : { ...DEFAULTS.heating, ...(c.heating || {}) }, goveePorts: { ...DEFAULTS.goveePorts, ...(c.goveePorts || {}) } };
}

function createApp(cfg, opts = {}) {
  const stateFile = opts.stateFile || process.env.HOME_STATE || path.join(__dirname, 'state.json');
  const clock = opts.now || Date.now;
  // ---------- gespeicherter Zustand der Heizung ----------
  let hs = { mode: 'off', target: cfg.heating ? cfg.heating.target : 21, offAt: null, lastSwitch: 0 };
  try { hs = { ...hs, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch (e) {}
  const saveState = () => { try { fs.writeFileSync(stateFile, JSON.stringify(hs)); } catch (e) {} };

  // ---------- Shelly ----------
  const gens = {};
  async function sh(host, p) {
    const r = await fetch('http://' + host + p, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('Shelly ' + host + ' antwortet mit ' + r.status);
    return r.json();
  }
  async function gen(host) {
    if (gens[host]) return gens[host];
    const i = await sh(host, '/shelly');
    return (gens[host] = i.gen >= 2 ? 2 : 1);
  }
  async function heatingStatus() {
    const h = cfg.heating, g = await gen(h.host), out = { reachable: true };
    if (g === 2) {
      out.on = !!(await sh(h.host, '/rpc/Switch.GetStatus?id=' + h.channel)).output;
      if (h.tempSensor != null) { try { out.temp = (await sh(h.host, '/rpc/Temperature.GetStatus?id=' + h.tempSensor)).tC; } catch (e) {} }
    } else {
      out.on = !!(await sh(h.host, '/relay/' + h.channel)).ison;
      if (h.tempSensor != null) { try { const s = await sh(h.host, '/status'); const t = s.ext_temperature && s.ext_temperature[h.tempSensor]; if (t) out.temp = t.tC; } catch (e) {} }
    }
    if (typeof out.temp !== 'number') out.temp = null;
    return out;
  }
  async function heatingSwitch(on) {
    const h = cfg.heating, g = await gen(h.host);
    if (g === 2) await sh(h.host, '/rpc/Switch.Set?id=' + h.channel + '&on=' + (on ? 'true' : 'false'));
    else await sh(h.host, '/relay/' + h.channel + '?turn=' + (on ? 'on' : 'off'));
    hs.lastSwitch = clock();
  }
  // Regelung: wird alle 30 s aufgerufen und nach jeder Eingabe
  async function tick() {
    if (!cfg.heating) return;
    let st; try { st = await heatingStatus(); } catch (e) { return; }
    if (hs.mode === 'on' && hs.offAt && clock() > hs.offAt) { hs.mode = 'off'; hs.offAt = null; saveState(); }
    let want = st.on;
    if (hs.mode === 'off') want = false;
    else if (hs.mode === 'on') want = true;
    else if (hs.mode === 'auto' && st.temp != null) {
      if (st.temp < hs.target - cfg.heating.hysteresis) want = true;
      else if (st.temp >= hs.target) want = false;
      if (want !== st.on && clock() - hs.lastSwitch < (opts.minSwitchMs ?? 120000)) want = st.on; // Relais schonen
    } else if (hs.mode === 'auto') want = false; // ohne Messwert lieber aus
    if (want !== st.on) { try { await heatingSwitch(want); } catch (e) {} }
  }
  async function getHeating() {
    if (!cfg.heating) return null;
    const base = { name: cfg.heating.name, mode: hs.mode, target: hs.target, offAt: hs.offAt, canAuto: cfg.heating.tempSensor != null };
    try { return { ...base, ...(await heatingStatus()) }; } catch (e) { return { ...base, reachable: false, error: 'Nicht erreichbar (' + cfg.heating.host + ')' }; }
  }
  async function setHeating(b) {
    if (b.mode != null) {
      if (!['on', 'off', 'auto'].includes(b.mode)) throw new Error('mode: on, off oder auto');
      if (b.mode === 'auto' && cfg.heating.tempSensor == null) throw new Error('Auto braucht einen Temperaturfühler (tempSensor in der config.json)');
      hs.mode = b.mode; hs.offAt = b.mode === 'on' && cfg.heating.autoOffHours > 0 ? clock() + cfg.heating.autoOffHours * 3600e3 : null;
      hs.lastSwitch = 0;
    }
    if (b.target != null) { const t = Number(b.target); if (!(t >= 5 && t <= 30)) throw new Error('Zieltemperatur 5 bis 30 °C'); hs.target = Math.round(t * 2) / 2; }
    saveState(); await tick();
    return getHeating();
  }

  // ---------- Govee (Lokales Netzwerk, ohne Cloud und ohne Schlüssel) ----------
  const P = cfg.goveePorts;
  let sock = null, sockError = null; const waiting = new Map(); const scanFound = new Map();
  function openSocket() {
    if (sock || sockError || !(cfg.lamps.length || opts.forceGovee)) return Promise.resolve();
    return new Promise((resolve) => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.on('error', (e) => { sockError = 'Govee-Port ' + P.listen + ' nicht frei (' + e.code + ')'; resolve(); });
      s.on('message', (buf, rinfo) => {
        let m; try { m = JSON.parse(buf.toString()).msg; } catch (e) { return; }
        if (!m) return;
        if (m.cmd === 'devStatus' && waiting.has(rinfo.address)) { const w = waiting.get(rinfo.address); waiting.delete(rinfo.address); clearTimeout(w.t); w.res(m.data); }
        else if (m.cmd === 'scan' && m.data) scanFound.set(m.data.ip || rinfo.address, m.data);
      });
      s.bind(P.listen, () => { try { s.addMembership('239.255.255.250'); } catch (e) {} sock = s; resolve(); });
    });
  }
  const gsend = (ip, port, msg) => new Promise((res) => sock.send(JSON.stringify({ msg }), port, ip, () => res()));
  async function lampStatus(l) {
    await openSocket();
    if (!sock) return { name: l.name, ip: l.ip, reachable: false, error: sockError };
    const data = await new Promise((res) => {
      const t = setTimeout(() => { waiting.delete(l.ip); res(null); }, 1500);
      waiting.set(l.ip, { res, t });
      gsend(l.ip, P.device, { cmd: 'devStatus', data: {} });
    });
    if (!data) return { name: l.name, ip: l.ip, reachable: false, error: 'Keine Antwort. LAN-Steuerung in der Govee-App einschalten?' };
    return { name: l.name, ip: l.ip, reachable: true, on: !!data.onOff, brightness: data.brightness, color: data.color, kelvin: data.colorTemInKelvin || 0 };
  }
  async function setLamp(i, b) {
    const l = cfg.lamps[i]; if (!l) throw new Error('Lampe gibt es nicht');
    await openSocket(); if (!sock) throw new Error(sockError);
    const dev = (cmd, data) => gsend(l.ip, P.device, { cmd, data });
    if (b.on != null) await dev('turn', { value: b.on ? 1 : 0 });
    if (b.brightness != null) await dev('brightness', { value: Math.max(1, Math.min(100, Math.round(Number(b.brightness)))) });
    if (b.color) { const c = b.color, ok = [c.r, c.g, c.b].every((x) => x >= 0 && x <= 255); if (!ok) throw new Error('Farbe 0 bis 255'); await dev('colorwc', { color: { r: c.r | 0, g: c.g | 0, b: c.b | 0 }, colorTemInKelvin: 0 }); }
    else if (b.kelvin) await dev('colorwc', { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: Math.max(2000, Math.min(9000, b.kelvin | 0)) });
  }
  async function scan() {
    await openSocket(); if (!sock) throw new Error(sockError);
    scanFound.clear();
    await gsend('239.255.255.250', P.scan, { cmd: 'scan', data: { account_topic: 'reserve' } });
    await new Promise((r) => setTimeout(r, 1800));
    return [...scanFound.values()].map((d) => ({ ip: d.ip, sku: d.sku, device: d.device }));
  }

  // ---------- HTTP ----------
  const page = () => fs.readFileSync(path.join(__dirname, 'index.html'));
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = (req) => new Promise((resolve, reject) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e4) { reject(new Error('zu groß')); req.destroy(); } }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('kein gültiges JSON')); } }); });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page()); }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { heating: await getHeating(), lamps: await Promise.all(cfg.lamps.map(lampStatus)) });
      if (req.method === 'GET' && url.pathname === '/api/scan') return json(res, 200, await scan());
      if (req.method === 'POST' && url.pathname === '/api/heating') return json(res, 200, await setHeating(await body(req)));
      const m = url.pathname.match(/^\/api\/lamp\/(\d+)$/);
      if (req.method === 'POST' && m) { await setLamp(Number(m[1]), await body(req)); return json(res, 200, { ok: true }); }
      json(res, 404, { error: 'nicht gefunden' });
    } catch (e) { json(res, 400, { error: String(e.message || e) }); }
  });
  let timer = null;
  return {
    server, tick, getHeating, setHeating, scan,
    start(port) { return new Promise((r) => server.listen(port ?? cfg.port, '0.0.0.0', () => { timer = setInterval(tick, 30000); r(server.address().port); })); },
    stop() { clearInterval(timer); try { sock && sock.close(); } catch (e) {} return new Promise((r) => server.close(() => r())); },
  };
}

module.exports = { createApp, loadConfig, DEFAULTS };

if (require.main === module) {
  const file = process.env.HOME_CONFIG || path.join(__dirname, 'config.json');
  const cfg = loadConfig(file);
  if (!fs.existsSync(file)) console.log('Hinweis: ' + file + ' fehlt, es gelten die Standardwerte. Kopiere home/config.example.json nach home/config.json und passe die IP-Adressen an.');
  createApp(cfg).start().then((p) => console.log('Haus-Panel läuft: http://<IP-dieses-Rechners>:' + p));
}
