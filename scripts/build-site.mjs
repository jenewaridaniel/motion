/**
 * Build the whole website into `site/`, ready to upload (Netlify):
 * the landing page at `/` and the editor at `/app/`.
 *
 *   pnpm build:site
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const run = (cmd, env = {}) =>
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

// The landing page links to /app/ in production (apps/landing/lib/site.ts).
run("pnpm --filter landing build");
run("pnpm --filter editor build", { EDITOR_BASE: "/app/" });

rmSync(site, { recursive: true, force: true });
cpSync(join(root, "apps/landing/out"), site, { recursive: true });
cpSync(join(root, "apps/editor/dist"), join(site, "app"), { recursive: true });
for (const f of ["_headers", "_redirects"]) {
  cpSync(join(root, "deploy", f), join(site, f));
}
if (!existsSync(join(site, "index.html")) || !existsSync(join(site, "app/index.html"))) {
  throw new Error("The site is missing its landing or editor page.");
}
console.log(`\nSite ready in ${site}`);
