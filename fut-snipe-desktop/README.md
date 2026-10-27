# FUT Snipe Desktop

A desktop app that runs the sniper **on your PC** and lets you **control it from your iPhone**.

- **Left:** a dashboard (coins, snipe/sell/profit plan, Start/Stop, settings).
- **Right:** the real EA FC Ultimate Team **Web App**, embedded. You sign in there once;
  the sniper is injected automatically on login (no extension, no userscript needed).
- **Phone remote:** the app serves a mobile dashboard on your local network. Open the shown
  `http://<pc-ip>:7777` link in **Safari on your iPhone** (same Wi-Fi) to Start/Stop and watch
  stats. The FUT account runs on the PC; your phone is just the remote.

This is the only way to get the "embedded browser + auto-inject" experience that works with
your iPhone: iOS can't host it, so the PC hosts it and the phone controls it.

> **Fair use / risk.** Not affiliated with EA or FUT Simple Trader. Automating the FUT
> transfer market breaks EA's User Agreement — accounts get transfer-banned, coin-wiped or
> permanently banned. Use it on your own account at your own risk. It paces itself (random
> delays, breaks, per-session and per-day caps) and **stops — never bypasses — on captcha or
> soft-ban.** Don't remove those limits. It talks to no third-party server; all pricing is
> computed locally from live market samples, and the only network traffic is the phone remote
> on your own LAN.

## Run it (Windows or Mac — needs Node.js 18+)

```bash
cd fut-snipe-desktop
npm install          # downloads Electron + ws (first run is a few hundred MB)
npm start            # opens the app window
```

1. In the app window, sign in to EA on the right-hand web app.
2. Go to **Transfer Market -> Search**, set your filter, tap **Search** once (so it captures a
   real search). The dashboard's **Search** tile turns the check mark.
3. Leave **Auto price** on (it price-checks and picks snipe/sell), or set them yourself.
4. Click **Check price & Start**.

### Control from your iPhone
- The left panel shows a line like `Phone remote (same Wi-Fi): http://192.168.1.50:7777`.
- Open that URL in Safari on your iPhone (same network). You'll see the same dashboard and can
  Start/Stop, run Suggest, and watch coins/buys/log live.
- To reach it from outside your home network you'd need your own VPN or tunnel — not included.
- Change the port with `FUT_PORT=8080 npm start`.

## Build a double-click app (optional)

```bash
npm run dist         # builds into dist/ : .exe (Windows), .dmg (Mac), .AppImage (Linux)
```

This needs to run on the target OS (build the Windows app on Windows, the Mac app on a Mac).
Unsigned builds will show the usual "unidentified developer" warning — allow it in your OS
settings.

## Files

| File | What it is |
|---|---|
| `main.js` | Electron main: window + LAN server (serves the phone remote, relays commands/state). |
| `renderer/index.html`, `dashboard.js`, `styles.css` | The left dashboard + embedded `<webview>`. |
| `engine.js` | The sniper, injected into the web app page. Same logic as the userscript, headless. |
| `remote/remote.html` | The mobile dashboard your iPhone opens. |

The injected `engine.js` exposes `window.__FUTSNIPE.{start,stop,suggest,setCfg}` and emits
state to the host via `console.log('[FUTSNIPE]' + json)`, which the renderer reads and fans
out to the phone over WebSocket.
