// Builds fut-snipe.user.js (the file the Userscripts app installs) from fut-snipe/src/*.js.
// Edit the small files in fut-snipe/src/, then run: npm run build:fut-snipe
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const VERSION = "2.6.0";

const header = `// ==UserScript==
// @name         FUT Snipe (Userscripts / iOS Safari)
// @namespace    local.fut.snipe
// @version      ${VERSION}
// @description  Self-run FUT transfer-market sniper for the EA SPORTS FC Web App. One Start button: checks the market price on EA's own market, snipes cards at or below price minus tax minus your target profit, auto-relists, re-checks the price as the market moves. Price tags on cards. No third-party servers.
// @author       you
// @match        *://www.ea.com/*ea-sports-fc/ultimate-team/web-app*
// @match        *://www.ea.com/*fifa/ultimate-team/web-app/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
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
const parts = ["pricing", "store", "state", "ea", "engine", "filters", "badges", "styles", "ui"];
const body = parts.map((p) => read(`fut-snipe/src/${p}.js`).replace(/\s+$/, "")).join("\n\n");

const out = `${header}
(function () {
  'use strict';
  if (window.__futSnipeLoaded) return;
  window.__futSnipeLoaded = true;
  var VERSION = '${VERSION}';

${body}
})();
`;
const file = path.join(root, "fut-snipe.user.js");
fs.writeFileSync(file, out);
console.log(`fut-snipe.user.js v${VERSION} (${out.split("\n").length} lines)`);
