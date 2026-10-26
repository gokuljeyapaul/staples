// Tiny static server for local use and the e2e suite.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  if (path.includes("..")) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(root, path || "staple.html"));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(port, "127.0.0.1", () => console.log(`Staple on http://127.0.0.1:${port}/staple.html`));
