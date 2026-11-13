# Putting Motion online (Netlify)

Motion is a static website: the landing page at `/` and the editor at `/app/`.
Nothing runs on a server and nothing is uploaded; every visitor's browser does
the editing. Netlify hosts it for free.

## Build and check it on your computer first

```sh
pnpm build:site      # builds everything into site/
pnpm preview:site    # serves it the way the host will: http://localhost:5190
```

`site/` is what goes online. `deploy/_headers` and `deploy/_redirects` are
copied into it (Netlify reads both): security headers, a strict content policy
for the editor (it may only run its own files; the microphone is allowed for
voiceovers), long caching for files whose names contain a content hash,
no-cache for the app page and service worker, and `/app` → `/app/`.
`netlify.toml` tells Netlify how to build.

## Option A: automatic updates from GitHub (recommended)

Needs the code on GitHub (say "push" first).

1. Log in at app.netlify.com.
2. **Add new site → Import an existing project → GitHub.** Pick the
   repository.
3. Netlify reads `netlify.toml`, so the settings fill in by themselves:
   build command `pnpm build:site`, publish directory `site`, Node 22.
   Leave "Base directory" empty.
4. **Deploy.** You get an address like `motion-xxxx.netlify.app`. Every push
   to the main branch updates it; pull requests get their own preview
   addresses.

## Option B: upload from this computer (no GitHub needed)

```sh
pnpm deploy:site
```

That builds the site and uploads `site/` with the Netlify CLI. It runs
`npx netlify-cli deploy --dir="$PWD/site" --filter landing --prod`:

- `--dir` is the full path to the finished site, which holds both apps.
- `--filter landing` only answers the CLI's "which project?" question (it
  sees several apps in this repository); nothing from `apps/landing` is
  rebuilt or changed.
- The first time, it opens the browser to log in, then asks whether to
  create a new Netlify project or link an existing one. The link is saved in
  `.netlify/` (not in git).
- Leave out `--prod` for a draft address you can check first.

## Other hosts

Cloudflare Pages reads the same `_headers` and `_redirects`: build command
`pnpm build:site`, output directory `site`, environment variable
`NODE_VERSION=22`. Vercel would need its own `vercel.json`; GitHub Pages
can't set headers, so it isn't a good fit.

## Installable and offline

The editor is a PWA: browsers offer "Install" (desktop: the install icon in
the address bar; iPhone: Share → Add to Home Screen) and it opens in its own
window. Its service worker (`apps/editor/pwa.ts`, written at build time)
keeps the app itself ready offline and saves fonts and other files the first
time each is used. A new version is picked up on the next visit; nobody's
edit is interrupted by an update. App icons are drawn by
`apps/editor/scripts/gen-icons.mjs` from the same shapes as `icon.svg`.

## Later

- **Own domain:** in Netlify, **Domain management → Add a domain**.
  Decide the public name first (see project notes: "Motion" is a working name).
- **ProRes export** will need two more headers on `/app/*`
  (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`) for its multi-threaded encoder.
