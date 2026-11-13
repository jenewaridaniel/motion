# Putting Motion online (Cloudflare Pages)

Motion is a static website: the landing page at `/` and the editor at `/app/`.
Nothing runs on a server and nothing is uploaded; every visitor's browser does
the editing. Cloudflare Pages hosts it for free.

## Build and check it on your computer first

```sh
pnpm build:site      # builds everything into site/
pnpm preview:site    # serves it like Cloudflare will: http://localhost:5190
```

`site/` is what goes online. `deploy/_headers` and `deploy/_redirects` are
copied into it: security headers, a strict content policy for the editor
(it may only run its own files; the microphone is allowed for voiceovers),
long caching for files whose names contain a content hash, and `/app` →
`/app/`.

## Option A: automatic updates from GitHub (recommended)

Needs the code on GitHub (say "push" first).

1. Log in at dash.cloudflare.com (free account).
2. **Workers & Pages → Create → Pages → Connect to Git.** Pick the repository.
3. Settings:
   - Framework preset: **None**
   - Build command: `pnpm build:site`
   - Build output directory: `site`
   - Environment variable: `NODE_VERSION` = `22`
4. **Save and Deploy.** You get an address like `motion-xxxx.pages.dev`.
   Every push updates it; pushes to other branches get their own preview
   addresses.

## Option B: upload from this computer (no GitHub needed)

```sh
pnpm build:site
npx wrangler pages deploy site --project-name motion
```

The first time, Wrangler opens the browser to log in to Cloudflare.

## Installable and offline

The editor is a PWA: browsers offer "Install" (desktop: the install icon in
the address bar; iPhone: Share → Add to Home Screen) and it opens in its own
window. Its service worker (`apps/editor/pwa.ts`, written at build time)
keeps the app itself ready offline and saves fonts and other files the first
time each is used. A new version is picked up on the next visit; nobody's
edit is interrupted by an update. App icons are drawn by
`apps/editor/scripts/gen-icons.mjs` from the same shapes as `icon.svg`.

## Later

- **Own domain:** in the Pages project, **Custom domains → Set up a domain**.
  Decide the public name first (see project notes: "Motion" is a working name).
- **ProRes export** will need two more headers on `/app/*`
  (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`) for its multi-threaded encoder.
