// Builds fut-snipe.user.js (the file the Userscripts app installs) from fut-snipe/src/*.js.
// Edit the small files in fut-snipe/src/, then run: npm run build:fut-snipe
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const VERSION = "3.2.0";
const raw = "https://raw.githubusercontent.com/ammkamk-jpg/Amk/fut-snipe-one-button/fut-snipe.user.js";

const header = `// ==UserScript==
// @name         TangaTolga Sniper
// @namespace    local.tangatolga.sniper
// @version      ${VERSION}
// @description  Self-run FUT transfer-market sniper for the EA SPORTS FC Web App. One Start button: checks the market price on EA's own market, snipes cards at or below price minus tax minus your target profit, auto-relists, re-checks the price as the market moves. Price tags on cards. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// @downloadURL  ${raw}
// @updateURL    ${raw}
// ==/UserScript==

/*
 * Not affiliated with EA or FUT Simple Trader. Its own tool, no third-party server; all
 * prices come from EA's own web app (live market + EA price range). Automating the FUT
 * market breaks EA's rules; accounts get banned / coin-wiped. Your account, your risk.
 * Paces itself and STOPS (never bypasses) on captcha / soft-ban. Nothing leaves your device.
 *
 * GENERATED FILE: edit fut-snipe/src/*.js and run \`npm run build:fut-snipe\`.
 */
`;

// Order matters only for code that runs at load time (settings, XHR hook, boot is last).
const parts = ["pricing", "store", "state", "ea", "engine", "hub", "filters", "badges", "fx", "styles", "ui"];
const body = parts.map((p) => read(`fut-snipe/src/${p}.js`).replace(/\s+$/, "")).join("\n\n");

const out = `${header}
(function () {
  'use strict';
  if (window.__tangaTolgaLoaded) return;
  window.__tangaTolgaLoaded = true;
  // An old "FUT Snipe" install got here first: say so instead of fighting it for the screen.
  if (window.__futSnipeLoaded) {
    var warn = function () {
      var w = document.createElement('div');
      w.style.cssText = 'position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483647;padding:14px 16px;border-radius:16px;background:#1f1020;border:1px solid #fb7185;color:#fff;font:700 14px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)';
      w.textContent = 'TangaTolga Sniper: an old "FUT Snipe" is also installed and is running instead. Open the Userscripts app, delete "FUT Snipe", then reload this page.';
      w.onclick = function () { w.remove(); };
      document.body.appendChild(w);
    };
    if (document.body) warn(); else document.addEventListener('DOMContentLoaded', warn);
    return;
  }
  window.__futSnipeLoaded = true; // an old FUT Snipe loading after this one stops itself
  var VERSION = '${VERSION}';

${body}
})();
`;
const file = path.join(root, "fut-snipe.user.js");
fs.writeFileSync(file, out);
console.log(`TangaTolga Sniper -> fut-snipe.user.js v${VERSION} (${out.split("\n").length} lines)`);
