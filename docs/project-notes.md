# Motion: Project Notes

A CapCut-style video editor, free for everyone, running in the browser.
This file records our planning conversation so we can pick it up any time.
Status: **landing page built, editor first slice working (2026-11-13).**

---

## 1. The goal (what you told me)

- A CapCut clone **without the AI features** (no auto-captions, background removal, text-to-speech, etc.).
- **Most important feature: export in 1080p or higher with no watermark.**
- Everything else that makes CapCut feel like CapCut.
- **No MVP.** You want the full feature set, not a cut-down first version.
- **Free for everyone.** No pro tier, no paywalled features.
- **Available to everyone, on any device**, but people should **not have to download it from an app store**.
- Resolution target: **4K at 60fps** to start.
- **ProRes export from the start** (see the ProRes caveat below).
- Working name: **"Motion"**.

---

## 2. How the decisions evolved

| Step | Decision | Why it changed |
|---|---|---|
| 1 | Web app, MVP scope | My first suggestion |
| 2 | Desktop app (Electron plus native FFmpeg) | You made 1080p+ export with no watermark the top priority. Browsers are weaker at heavy export. |
| 3 | Shared Rust core with desktop and phone apps | You asked for phone support and ProRes from day one |
| 4 | **Web app, installable as a PWA** (final) | You said everyone, free, and no app store downloads. Only the web meets all three. |

**Final platform: a web app (PWA).** Users open a link and use it. They can optionally install it to their home screen or desktop from the browser, with no store involved. Optional desktop and store wrappers can come later if users ask for them.

---

## 3. Final stack (TypeScript everywhere)

| Part | Choice |
|---|---|
| Language | TypeScript |
| Landing page | **Next.js (static export) and Tailwind v4** (your pick). GSAP for scroll animation if wanted. |
| Editor app | Vite and React (not Next.js, because the editor is entirely client-side) |
| Styling | Tailwind v4 plus Radix UI primitives |
| State and undo/redo | Zustand and Immer patches |
| Rendering | WebGL2, then WebGPU where supported, in a worker with OffscreenCanvas. **One renderer shared by preview and export.** |
| Media I/O | WebCodecs and Mediabunny |
| Audio | Web Audio API, with OfflineAudioContext for the export mix |
| Worker calls | Comlink |
| Storage | OPFS for media and Dexie (IndexedDB) for project data |
| PWA | vite-plugin-pwa |
| ProRes (later) | Multi-threaded WASM encoder (needs special headers) |
| Repo | pnpm workspaces and Turborepo: `apps/landing`, `apps/editor`, `packages/core`, `renderer`, `media`, `ui` |
| Testing and linting | Vitest, Playwright, Biome |
| Hosting | Cloudflare Pages (free, supports the needed headers) |

Notes:
- The timeline UI will be hand-built (canvas or virtualized DOM), not a library, because snapping, zoom and touch need full control.
- Landing page and editor deploy separately: landing at the main domain, editor at `app.` or `/app`.

---

## 4. Features (CapCut without AI)

- **Timeline:** multi-track, magnetic snapping, trim, split, ripple delete, zoom, markers, undo/redo, autosave
- **Clip controls:** speed (constant and curves), reverse, freeze frame, crop, rotate, flip, picture-in-picture, blend modes, opacity
- **Keyframes:** position, scale, rotation, opacity, volume, with easing curves
- **Transitions and effects:** transition library, filters, glitch, blur and shake-style effects, masks, chroma key (green screen)
- **Color:** exposure, contrast, saturation, HSL, curves, LUT import
- **Text:** fonts, styles, outlines and shadows, in/out/loop animations, manual subtitles with SRT import
- **Stickers and overlays:** images, GIFs, shapes
- **Audio:** volume, fades, voiceover recording, sound effects, extract audio from video
- **Canvas:** 9:16, 16:9, 1:1, 4:5 presets, blurred or colored backgrounds
- **Templates:** saved layouts you fill with your own media (no AI)
- **Export:** up to 4K60, H.264 and HEVC first, ProRes later, no watermark

---

## 5. Honest limits of the web (agreed trade-offs)

1. **4K60 depends on the device.** Modern desktops and recent Macs are fine. Phones and weak laptops may only manage 1080p reliably. Plan: detect what each device supports and offer the highest working preset.
2. **iPhone Safari is the hardest target** because of tab memory limits. Plan: proxy media for editing and export streamed to disk. An installed home-screen app is more stable than a browser tab.
3. **ProRes is slow in the browser** and desktop-only (no browser encoder, so a WASM one is needed). It is built last, but the export pipeline is designed for it from day one.
4. **Export needs the tab open.** No background export like a native app.
5. **No cloud sync.** There is no backend, so projects live on the user's device (export and import a project file to move between devices).

Most CapCut-style creators make 9:16 1080p clips, which the web handles well.

---

## 6. Business model

- Free, no watermark, every feature unlocked.
- Sustainable because rendering runs on the user's own device. Costs are static hosting, a domain, and **licensed or original assets** (music, stickers, fonts), which is the one real cost to plan for.
- Later, if wanted: charge only for server-based extras (cloud sync, hosted templates, collaboration), or use donations or sponsors. The editor itself stays free.

---

## 7. Naming caveat

**"Motion" is already an Apple product** (Apple Motion, sold alongside Final Cut Pro) in the same category, so it is risky as a public name. Fine as a working codename. **Pick a different public name before release.**

---

## 8. Design direction (from your inspo)

Inspo image: `docs/inspo/landing-inspo-1.jpg` (a video-editing agency landing page, used as inspiration only; we will not copy its name, copy or photos).

What I see in it:
- **Palette:** soft blush-white background with a faint lavender tint, one deep burgundy accent, and near-black text. (Colors are eyeballed from the screenshot, not exact.)
- **Type:** a clean geometric sans for headlines, with **italic serif words in the accent color** for emphasis ("*Visual Stories*", "*Right Moments*"). Small uppercase eyebrow labels above sections.
- **Hero:** a floating pill navbar, a big centered headline, and a **curved, perspective-tilted row of vertical rounded video cards** (reads as the product's 9:16 output).
- **Section treatments:** a giant section word ("SERVICE") with a gradient fade, **arch-shaped image cards**, and small tilted photos sitting beside a paragraph.
- **Overall mood:** airy, editorial, warm, premium.

My notes:
- This works well for the **landing page**. It also fits the product, because the video-card carousel shows off what the editor makes.
- The **editor UI** needs to be denser and tool-like (timeline, panels, inspector). We would carry over the palette, type and rounded feel, but not the airy layout. A dark editor theme is likely. Worth a separate inspo round for the editor itself.

---

## 9. Build order

1. **Core and export engine:** timeline model, shared renderer, and a 4K60 H.264 and HEVC export with audio streaming to disk. This proves the top priority first.
2. **Editor UI:** responsive timeline with mouse and touch, preview player, media bin and property panels, installable as a PWA.
3. **Creative layer:** keyframes, transitions, effects, color, masks, chroma key.
4. **Text, stickers, audio tools and templates.**
5. **ProRes encoder, proxies and device-adaptive export presets.**
6. **Landing page** (can be built in parallel, since it is independent).

---

## 10. Open items

- [ ] Browser support floor: current Chrome, Edge, Safari and Firefox? (Older browsers see a "please update" screen.) *Not yet answered.*
- [ ] ProRes: is "slow, desktop browsers only" acceptable? *Not yet answered.*
- [ ] Public name (see section 7).
- [ ] Inspo for the **editor** UI (the image so far is landing-page inspo).
- [ ] Confirm landing and editor structure: separate apps in one monorepo.

## 11. Done so far (2026-11-13)

- Monorepo scaffolded at `~/motion` (pnpm workspaces and Turborepo).
- `apps/landing` built: Next.js 16 static export, Tailwind v4, GSAP. Run it with `pnpm dev:landing`.
- `PRODUCT.md` and `DESIGN.md` written at the repo root. Some PRODUCT.md answers are marked as assumptions to confirm.
- Fonts chosen: Archivo (width axis) and Bodoni Moda Italic. Palette: blush paper, wine and a coral "flare" accent.
- The editor CTA currently points at `#start` (set in `apps/landing/lib/site.ts`).

### Editor, first slice (2026-11-13)

- Decision: **video editor first, motion design later**, with the core built motion-ready (every property animatable, nesting, parenting).
- `docs/architecture.md` written. Packages: `core` (model, keyframes, edits, undo), `renderer` (WebGL2), `media` (Mediabunny import/export), `apps/editor` (Vite + React).
- Built: import video/photo/music, preview and playback with audio, magnetic main track, trim, split, move, overlays, speed, volume, keyframes (position, scale, rotation, opacity, volume), undo/redo, canvas presets, export MP4 (H.264 or HEVC, 720p to 4K, 24 to 60 fps, AAC audio, **no watermark**).
- Tested by hand in Chrome: import, scrubbing, playback, split, trim (both edges), reorder, overlay, moving an overlay with snapping, undo/redo, keyframes, Space/Escape keys, export. Verified exports: 1080p30 H.264 and 4K60 HEVC, frames match the timeline.
- **Not yet tested in a browser:** speed and volume changes, music files, track mute/hide, the Export button's "Save as" window, iPhone/MOV files, Safari and Firefox.
- Review on 2026-11-13 fixed: start-edge trim on the main track over-trimming, reorder not letting a long clip go first, playhead left past the end after a delete, Space re-pressing the last clicked button.
- Landing "Start editing" now opens the editor. Dev port is **5180** (5173 is used by another local project).

## 12. Next step

1. Put the project under version control (`git init`). There is no history or backup yet.
2. Persistence: autosave the project (IndexedDB) and media (OPFS) so a refresh doesn't lose work.
3. Export quality: set our own bitrates (the library's "High" is about 6 Mbps at 1080p and ignores frame rate).
4. Move export into a worker so the UI stays smooth.
5. Phone layout and touch timeline (the editor shows a "coming next" notice on phones).
6. Decide where the editor is hosted. The landing button points at `/app/` in production, and nothing is deployed there yet.
7. Thumbnails and waveforms on clips, text layers, transitions and effects.

Known rough edges from the review: photos larger than the GPU texture limit aren't downscaled; changing the canvas re-fits clips you resized by hand; changing speed doesn't move keyframes; export audio is resampled buffer by buffer (tiny discontinuities on non-48 kHz sources); the timeline isn't virtualised for very long projects; only `core` has automated tests.
