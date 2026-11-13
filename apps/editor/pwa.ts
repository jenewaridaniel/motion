/**
 * Offline support: a service worker written at build time. It keeps the
 * app itself (page, code, styles, icons) ready offline, and saves other
 * built files (fonts and the like) the first time each is used, so nobody
 * downloads all 36 fonts up front. Files with a content hash in their name
 * never change, so they're served from the cache first.
 */
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export function motionPwa(): Plugin {
  let base = "/";
  return {
    name: "motion-pwa",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const shell = Object.values(bundle)
        .map((f) => f.fileName)
        .filter((name) => /\.(js|css)$/.test(name))
        .sort();
      const statics = [
        "./",
        "manifest.webmanifest",
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
        "apple-touch-icon.png",
      ];
      const files = [...statics, ...shell];
      const version = createHash("sha256")
        .update(files.join("\n"))
        .digest("hex")
        .slice(0, 12);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: serviceWorker(base, files, version),
      });
    },
  };
}

function serviceWorker(base: string, files: string[], version: string) {
  return `// Motion service worker (generated at build time).
const BASE = ${JSON.stringify(base)};
const SHELL = ${JSON.stringify(files)}.map((f) => new URL(f, self.location.href).href);
const CACHE = "motion-app-${version}";
const FILES = "motion-files";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("motion-app-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // The page: always the newest when online, the saved one when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(new URL("./", self.location.href).href)) ?? Response.error()),
    );
    return;
  }

  // Built files never change: cache first, and save new ones as they're used.
  if (url.pathname.startsWith(BASE + "assets/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) (await caches.open(FILES)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Anything else (icons, manifest): network first, saved copy offline.
  event.respondWith(fetch(req).catch(async () => (await caches.match(req)) ?? Response.error()));
});
`;
}
