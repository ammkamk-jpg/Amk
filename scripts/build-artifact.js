// Baut index.html zu einer einzelnen Seite (dist/fut-trader.html) für ein
// claude.ai-Artifact: CSS und JS inline, ohne <html>/<head>/<body>-Gerüst.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const pick = (pattern) => (head.match(pattern) || [""])[0];
const title = pick(/<title>[\s\S]*?<\/title>/);
const fitSides = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/);
const fonts = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/);

const inlined = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${read(src)}</script>`);

const page = [title, fitSides, fonts, `<style>\n${read("src/styles.css")}</style>`, inlined.trim(), ""].join("\n");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/fut-trader.html"), page);
console.log(`dist/fut-trader.html (${page.length} Zeichen)`);
