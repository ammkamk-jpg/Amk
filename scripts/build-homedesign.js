// Baut homedesign/index.html zu einer einzelnen Seite (dist/homedesign.html)
// für ein claude.ai-Artifact: CSS und JS inline, ohne <html>/<head>/<body>.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("homedesign/index.html");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const pick = (re) => (head.match(re) || [""])[0];

const page = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<meta name="claude:viewport-fit-sides"[^>]*>/),
  pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/),
  `<style>\n${read("homedesign/src/styles.css")}</style>`,
  body.replace(/<link rel="stylesheet" href="src\/styles\.css">\s*/g, "")
      .replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, src) => `<script>\n${read("homedesign/" + src)}</script>`)
      .trim(),
  "",
].join("\n");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/homedesign.html"), page);
console.log(`dist/homedesign.html (${page.length} Zeichen)`);
