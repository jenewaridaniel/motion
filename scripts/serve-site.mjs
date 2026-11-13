/**
 * Serve `site/` locally the way the host will: same files, plus the
 * rules in `_headers` and `_redirects`. For testing a build before upload.
 *
 *   pnpm preview:site      (http://localhost:5190)
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const port = Number(process.env.PORT ?? 5190);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

/** `/app/*` style patterns, as Netlify and Cloudflare use them. */
const matches = (pattern, path) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);

function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(":");
      current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

function parseRedirects(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [from, to, status] = l.split(/\s+/);
      return { from, to, status: Number(status ?? 302) };
    });
}

const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "");
const headerRules = parseHeaders(read("_headers"));
const redirects = parseRedirects(read("_redirects"));

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const r = redirects.find((x) => x.from === path);
  if (r && r.status >= 300 && r.status < 400) {
    res.writeHead(r.status, { Location: r.to }).end();
    return;
  }
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  const found = existsSync(file);
  if (!found) file = join(root, "404.html");
  const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" };
  for (const rule of headerRules) {
    if (matches(rule.pattern, path)) for (const [k, v] of rule.headers) headers[k] = v;
  }
  res.writeHead(found ? 200 : 404, headers);
  if (existsSync(file)) createReadStream(file).pipe(res);
  else res.end("Not found");
}).listen(port, () => console.log(`Site at http://localhost:${port}`));
