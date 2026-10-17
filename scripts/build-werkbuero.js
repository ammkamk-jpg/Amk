// Baut werkbuero/index.html zu einer einzelnen Seite (dist/werkbuero.html)
// für ein claude.ai-Artifact: CSS und JS inline, ohne <html>/<head>/<body>.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("werkbuero/index.html");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const pick = (re) => (head.match(re) || [""])[0];

const page = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<meta name="claude:viewport-fit-sides"[^>]*>/),
  pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/),
  `<style>\n${read("werkbuero/src/styles.css")}</style>`,
  body.replace(/<link rel="stylesheet" href="src\/styles\.css">\s*/g, "")
      .replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, src) => `<script>\n${read("werkbuero/" + src)}</script>`)
      .trim(),
  "",
].join("\n");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/werkbuero.html"), page);
console.log(`dist/werkbuero.html (${page.length} Zeichen)`);
