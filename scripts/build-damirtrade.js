// Baut das Userscript damirtrade/damirtrade.user.js aus fut.js, core.js und ui.js.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { version } = JSON.parse(read("package.json"));
const raw = "https://raw.githubusercontent.com/ammkamk-jpg/Amk/master/damirtrade/damirtrade.user.js";

const header = `// ==UserScript==
// @name         damirtrade
// @namespace    https://github.com/ammkamk-jpg/Amk
// @version      ${version}
// @description  Trading-Panel für die EA FC Web App: Treffer, Session-Statistik und Trade-Log. Liest nur mit, kauft nie selbst.
// @match        https://www.ea.com/*ultimate-team/web-app*
// @run-at       document-start
// @grant        none
// @downloadURL  ${raw}
// @updateURL    ${raw}
// ==/UserScript==
`;

const body = ["src/fut.js", "damirtrade/src/core.js", "damirtrade/src/ui.js"].map(read).join("\n");
const out = path.join(root, "damirtrade/damirtrade.user.js");
fs.writeFileSync(out, `${header}\n${body}`);
console.log(`damirtrade/damirtrade.user.js (${fs.statSync(out).size} Bytes)`);
