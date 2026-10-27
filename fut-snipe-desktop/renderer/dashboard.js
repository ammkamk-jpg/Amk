// Renderer: injects the engine into the embedded FUT web app, mirrors its state on the
// left dashboard, relays commands, and forwards state to the LAN server for the phone.
const { ipcRenderer } = require('electron');

const fut = document.getElementById('fut');
const $ = (id) => document.getElementById(id);
const FIELDS = ['maxBuy', 'sellAt', 'markupPercent', 'sessionBuyCap', 'runMinutes', 'margin'];
let engineSrc = '';
let autoPrice = 1;
let injected = false;

function cfgFromInputs() {
  const c = { autoPrice };
  for (const f of FIELDS) c[f] = Number($('in-' + f).value) || 0;
  return c;
}
function run(js) { fut.executeJavaScript(js).catch(() => {}); }
function sendCmd(m) {
  if (m.type === 'start') run('window.__FUTSNIPE && window.__FUTSNIPE.start(' + JSON.stringify(m.cfg || {}) + ')');
  else if (m.type === 'stop') run('window.__FUTSNIPE && window.__FUTSNIPE.stop()');
  else if (m.type === 'suggest') run('window.__FUTSNIPE && window.__FUTSNIPE.suggest()');
  else if (m.type === 'setCfg') run('window.__FUTSNIPE && window.__FUTSNIPE.setCfg(' + JSON.stringify(m.cfg || {}) + ')');
}

// --- inject engine when the web app page loads ---
async function ensureEngine() { if (!engineSrc) engineSrc = await ipcRenderer.invoke('get-engine'); }
fut.addEventListener('dom-ready', async () => { await ensureEngine(); run(engineSrc); injected = true; });

// --- receive state from the engine via console bridge ---
fut.addEventListener('console-message', (e) => {
  const msg = e.message || '';
  if (msg.indexOf('[FUTSNIPE]') !== 0) return;
  let data; try { data = JSON.parse(msg.slice('[FUTSNIPE]'.length)); } catch (err) { return; }
  if (data.type === 'state') { paint(data.state); ipcRenderer.send('fut-state', data.state); }
});

// --- phone remote commands come through main (envelope: {type:'cmd', cmd, cfg}) ---
ipcRenderer.on('remote-cmd', (_e, m) => sendCmd({ type: m.cmd, cfg: m.cfg }));

// --- dashboard controls ---
$('sw-auto').onclick = () => { autoPrice = autoPrice ? 0 : 1; $('sw-auto').className = 'sw' + (autoPrice ? ' on' : ''); sendCmd({ type: 'setCfg', cfg: cfgFromInputs() }); };
for (const f of FIELDS) $('in-' + f).onchange = () => sendCmd({ type: 'setCfg', cfg: cfgFromInputs() });
$('go').onclick = () => { if ($('go').dataset.busy === '1') sendCmd({ type: 'stop' }); else sendCmd({ type: 'start', cfg: cfgFromInputs() }); };
$('suggest').onclick = () => sendCmd({ type: 'suggest' });

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
let synced = false;
function paint(s) {
  $('t-coins').textContent = s.coins != null ? (s.coins >= 1e6 ? (s.coins / 1e6).toFixed(2) + 'M' : fmt(s.coins)) : '—';
  $('t-search').textContent = s.haveSearch ? '✓' : '—';
  $('t-search').style.color = s.haveSearch ? '#19e67d' : '#e7c37a';
  $('t-buys').textContent = s.buys || 0;
  $('p-max').textContent = s.snipeUnder ? fmt(s.snipeUnder) : '—';
  $('p-sell').textContent = s.sellAt ? fmt(s.sellAt) : '—';
  $('p-prof').textContent = s.profit == null ? '—' : (s.profit > 0 ? '+' + fmt(s.profit) : fmt(s.profit));
  const busy = s.running || s.phase === 'checking';
  const go = $('go'); go.dataset.busy = busy ? '1' : '0';
  go.className = 'btn ' + (busy ? 'stop' : 'go');
  go.textContent = busy ? (s.phase === 'checking' ? 'Stop price check' : 'Stop sniping') : 'Check price & Start';
  $('status').textContent = s.stopReason ? '■ ' + s.stopReason : (s.phase === 'checking' ? 'Checking market prices…' : s.phase === 'break' ? 'Taking a break…' : s.running ? '● Running — ' + s.searches + ' searches' : s.servicesReady ? (s.haveSearch ? 'Ready' : 'Search once in the market, then Start') : 'Sign into the FUT Web App on the right');
  $('status').style.color = busy ? '#19e67d' : s.stopReason ? '#ff9a6b' : '#8ea0b5';
  if (s.log) $('log').textContent = s.log.join('\n');
  if (!synced && s.cfg) { synced = true; autoPrice = s.cfg.autoPrice ? 1 : 0; $('sw-auto').className = 'sw' + (autoPrice ? ' on' : ''); for (const f of FIELDS) if (s.cfg[f] != null) $('in-' + f).value = s.cfg[f]; }
}

ipcRenderer.invoke('lan-info').then((info) => {
  if (!info || !info.ips || !info.ips.length) { $('phone').textContent = 'Phone remote: start the app on a network to get a link'; return; }
  $('phone').innerHTML = '📱 Phone remote (same Wi-Fi):<br>' + info.ips.map(ip => 'http://' + ip + ':' + info.port).join('<br>');
});
