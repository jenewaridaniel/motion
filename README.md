# Motion

A free, watermark-free, CapCut-style video editor that runs in the browser (working name).

## Structure

```
motion/
├── apps/
│   ├── landing/      Next.js 16 (static export) + Tailwind v4 + GSAP marketing site
│   └── editor/       Vite + React editor (the product)
├── packages/
│   ├── core/         timeline model, keyframes, edits, undo (pure TS, tested)
│   ├── renderer/     WebGL2 compositor shared by preview and export
│   └── media/        Mediabunny import, playback audio and MP4 export
├── docs/
│   ├── project-notes.md   planning decisions
│   ├── architecture.md    how the editor works
│   └── inspo/             design references
├── PRODUCT.md        who it's for, brand, principles
└── DESIGN.md         visual system
```


## Commands

```bash
pnpm install          # once
pnpm dev:landing      # landing page at http://localhost:3000
pnpm dev:editor       # editor at http://localhost:5180
pnpm test             # core tests
pnpm build            # static build; landing output in apps/landing/out
```
