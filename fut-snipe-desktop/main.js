// FUT Snipe Desktop — Electron main process.
// Opens a window with a left dashboard + an embedded FUT Web App (<webview>), and runs a
// small LAN server so your phone can open the same dashboard in Safari and Start/Stop /
// watch stats. The sniper engine is injected into the web app page by the renderer.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

let win;
const PORT = Number(process.env.FUT_PORT || 7777);
let wss = null;
const wsClients = new Set();
let lastState = { phase: 'idle', running: false };

function lanIPs() {
  const out = [];
  const ni = os.networkInterfaces();
  for (const k in ni) for (const a of ni[k]) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, backgroundColor: '#0b1017',
    webPreferences: { nodeIntegration: true, contextIsolation: false, webviewTag: true }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // win.webContents.openDevTools();
}

// Renderer asks for the engine source to inject into the webview.
ipcMain.handle('get-engine', () => fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8'));
ipcMain.handle('lan-info', () => ({ port: PORT, ips: lanIPs() }));

// Renderer forwards live state here; we fan it out to phone clients.
ipcMain.on('fut-state', (_e, state) => {
  lastState = state;
  const msg = JSON.stringify({ type: 'state', state });
  for (const c of wsClients) { try { c.send(msg); } catch (e) {} }
});

// --- tiny LAN server: serves the phone remote + a WebSocket for commands/state ---
function startServer() {
  let WebSocketServer;
  try { WebSocketServer = require('ws').Server; } catch (e) { console.error('ws missing — run npm install'); return; }
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/index')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(path.join(__dirname, 'remote', 'remote.html')).pipe(res);
    } else { res.writeHead(404); res.end('not found'); }
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    try { ws.send(JSON.stringify({ type: 'state', state: lastState })); } catch (e) {}
    ws.on('message', (data) => {
      let m; try { m = JSON.parse(String(data)); } catch (e) { return; }
      // relay a command from the phone to the renderer -> webview engine
      if (m && m.type === 'cmd' && win && !win.isDestroyed()) win.webContents.send('remote-cmd', m);
    });
    ws.on('close', () => wsClients.delete(ws));
  });
  server.listen(PORT, '0.0.0.0', () => {
    const ips = lanIPs();
    console.log('[FUT Snipe] phone remote on: ' + ips.map(ip => 'http://' + ip + ':' + PORT).join('  '));
  });
}

app.whenReady().then(() => { createWindow(); startServer(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
