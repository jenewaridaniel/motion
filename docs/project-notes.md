# Motion: Project Notes

A CapCut-style video editor, free for everyone, running in the browser.
This file records our planning conversation so we can pick it up any time.
Status: **landing page built, editor first slice working, autosave added (2026-11-13).**

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
- The landing navbar keeps its desktop layout and provides a touch-friendly mobile menu with section links and the editor CTA. Manually verified at 320px and 390px (including open, close and link navigation) and at 1024px (desktop layout).

### Editor, first slice (2026-11-13)

- Decision: **video editor first, motion design later**, with the core built motion-ready (every property animatable, nesting, parenting).
- `docs/architecture.md` written. Packages: `core` (model, keyframes, edits, undo), `renderer` (WebGL2), `media` (Mediabunny import/export), `apps/editor` (Vite + React).
- Built: import video/photo/music, preview and playback with audio, magnetic main track, trim, split, move, overlays, speed, volume, keyframes (position, scale, rotation, opacity, volume), undo/redo, canvas presets, export MP4 (H.264 or HEVC, 720p to 4K, 24 to 60 fps, AAC audio, **no watermark**).
- Tested by hand in Chrome: import, scrubbing, playback, split, trim (both edges), reorder, overlay, moving an overlay with snapping, undo/redo, keyframes, Space/Escape keys, export. Verified exports: 1080p30 H.264 and 4K60 HEVC, frames match the timeline.
- **Not yet tested in a browser:** speed and volume changes, music files, track mute/hide, the Export button's "Save as" window, iPhone/MOV files, Safari and Firefox.
- Review on 2026-11-13 fixed: start-edge trim on the main track over-trimming, reorder not letting a long clip go first, playhead left past the end after a delete, Space re-pressing the last clicked button.
- Landing "Start editing" now opens the editor. Dev port is **5180** (5173 is used by another local project).

### Autosave (2026-11-13)

- Built: the project and every imported file are kept in the browser (IndexedDB) and come back after a reload. Details in `docs/architecture.md` → Autosave.
- Tested by hand in Chrome (full reloads, state checked through `window.__motion` and by reading IndexedDB directly):
  - import 3 files → project and all 3 files stored; top bar says "Saved on this device"
  - rename, split, scale keyframe → reload → project identical, all files open, preview correct, playback and export work
  - delete a clip then reload instantly → the change was kept (saved as the page closed)
  - second tab → shows "Open in another tab: not saving"; its edit never reached storage
  - stored file removed → clear message, clip kept, media list says "File missing"; importing the same file reconnects it, and it survives another reload
  - project marked as a newer version → clear message, new empty project, old one kept untouched
  - import then undo → after reload the unused stored copy is removed, the project's files are kept
- **Not tested:** a save failing (disk full) and being retried; a "Leave site?" warning while a large file is still being copied (built; with small test files the copy finished too fast to catch); browsers without storage (some private windows); Safari and Firefox; very large files (several GB).
- Known limits: if a saved project can't be opened, it is kept in storage but there is no screen to get it back yet; once you edit the new project, the old one is no longer the one that opens. There is one project only, with no "New project" button, so starting over means deleting clips by hand.

### Phase 1: foundation (2026-11-13)

- **Git:** the repo already existed (your 02:52 commit, GitHub remote `origin`). Autosave and review fixes committed on top. Nothing pushed yet.
- **Export quality, measured on a grainy 1080p clip (Mac, Chrome):**
  - The compositor is lossless. Quality is set by the encoder.
  - The hardware encoder already runs in constant-quality mode. "Standard / High / Max" give 4.9 / 10.2 / 17.6 Mbps and 43.5 / 47.9 / 50.3 dB brightness PSNR. Kept unchanged.
  - Color detail stays at ~36 dB on the hardware encoder at any bitrate (its color conversion). It only shows on extreme synthetic grain.
  - Changed: the fallback bitrate for encoders without constant quality (e.g. Chrome's software H.264). It was 6.1 Mbps at 1080p for both 30 and 60 fps. It is now 8 / 12.1 Mbps (`core.exportRateControl`).
  - Earlier note that "High" was lower than phone quality was wrong (based on the library's formula, not a measurement).
- **Export in a worker: not built, on purpose.** Measured during export: 4K60 single clip, 75 screen updates/s, worst pause 14 ms. Four stacked layers at 4K60, 69 updates/s, 3 pauses (worst 160 ms) in 6.4 s. Not worth the cost now: Web Audio (used to mix export audio, same as preview) isn't available in workers, so a worker needs a second audio path. Re-measure on phones and weak laptops.
- **Not tested:** export quality on Windows/Linux, Safari, Firefox; real camera footage (only synthetic test clips).

### Phase 2, step 1: text (2026-11-13)

- Built: "Text" button in the timeline adds a text clip at the playhead on a text track (reused when there is room). Inspector Text section: words (multi-line), 7 bundled fonts, weight, italic (where the font has it), size, color, alignment, line height, letter spacing, outline, shadow, background box. Moves, scales, rotates, fades and keyframes like any clip; trims, splits, undo, autosave, export.
- Tested by hand in Chrome (full reloads, state read through `window.__motion`): add text; type two lines (one undo step for the whole typing); font, color, outline, background box, alignment through the real controls; scale keyframes (40% → 100% pop-in); split; trim the end past 3 s and a blocked start trim; reload → identical; export at 1080p (text pixels present while on screen, none after); 4K export sharpness (blurry-edge ratio 0.45 of 1080p, i.e. drawn at 4K); all 7 fonts load; empty text draws nothing; 9:16 switch keeps a centred caption centred; 300% scale stays sharp; text cache stays under its memory limit.
- Bugs found and fixed: the clip color class collided with Tailwind's `bg-clip-text` utility (clip looked black); text-only tracks showed a pointless mute button.
- Noticed, not changed: the first seek after a reload takes ~0.6 s while the video decoder starts.
- **Not tested:** Safari and Firefox; fonts with non-Latin scripts (Arabic, Chinese, etc.); emoji; very long text.
- Not built (could come next): dragging text directly on the preview, text animation presets (in/out/loop), captions from SRT.

### Text follow-ups (2026-11-13)

Tested in a separate test copy on port 5181 (its own storage), because the user was working in 5180 at the same time.

- **Slow first seek (investigated, no code change):** the ~0.6 s came mostly from the test clips, which have one keyframe at 0 s. Phone-like footage (keyframe every second): 25 to 125 ms per seek. Jumping back to a clip restarts its decoder (+25 to 50 ms); keeping decoders alive would cost ~32 MB each at 1080p, so not done. Files with rare keyframes need proxies (Phase 4).
- **Drag on the preview:** click selects the topmost clip under the pointer, drag moves it, the centre snaps to the canvas centre lines (Alt skips), one undo per drag, an animated position gets a keyframe. Parented layers move in their parent's space. Tested: select, outline, drag with snap, sideways drag, undo, select video, drag animated text.
- **Text animations:** In (fade, pop, slide up/down, typewriter), Out (fade, pop, slide up/down), Loop (pulse, float, wiggle). Worked out at draw time from the clip's timing, on top of keyframes. Tested in preview, after reload and in an export.
- **Captions from SRT/VTT:** import or drop a .srt/.vtt file; one outlined text clip per cue on a Captions track, overlaps on extra tracks, one undo step. Tested with a messy SRT (CRLF, BOM, tags, broken entry) and a junk file.
- **Fonts:** 36 bundled fonts (OFL or Apache 2.0), generated from their packages by `apps/editor/scripts/gen-fonts.mjs` (`pnpm --filter editor gen:fonts`), grouped Sans / Display / Serif / Handwritten / Mono. Plus "add your own font" (.ttf, .otf, .woff, .woff2), stored on the device with the project, reconnected when re-added after going missing. Tested: all 36 load, UI font width axis intact, upload applies to the selected text, reload, export uses it, fake font refused, missing font message and reconnect.
- Bugs found and fixed on the way: re-adding a missing font file would have created a duplicate ("… 2") instead of fixing the text; text drawn in a fallback font stayed cached after the real font arrived.
- Size: fonts add 9.8 MB to the deployed files (396 files) but each person downloads only the fonts they use; the CSS everyone loads grew from 29 KB to 191 KB (about 20 KB compressed).
- **Not tested:** Safari, Firefox; fonts that don't cover a language's letters (they fall back to a standard font); very large font files; caption files with thousands of cues; dragging on touch screens.
- Not built: changing the style of all captions at once, resize/rotate handles on the preview, editing caption timing in bulk.

### Phase 2, step 2: thumbnails and waveforms (2026-11-13)

- Built: video clips show thumbnails along their length; photos repeat; clips with sound show a waveform (full height for audio, a strip under video). Both follow trims, splits, speed and zoom; the waveform also follows volume. Drawn in 1024 px tiles, only while visible. Peaks are read in one pass without holding the audio (`core.PeakBuilder`); thumbnails come from `media.Thumbnails` (batched, newest first, 1,500 cached).
- Tested by hand in Chrome (test copy on port 5181): thumbnails, photo and waveforms on import; only 7 of 24 tiles drawn when zoomed far in; first thumbnail matches the true frame after a 3 s trim at zoom 20 to 400 (hue-coded test video, pixels read from the tile); 2x speed shows the end of the source; beat test clip shows 10 beeps in 5 s, flat at volume 0, same 10 beeps in half the width at 2x; 10-minute MP3 waveform in 1 s (234 KB, one 58 ms pause); everything redraws after reload.
- Bug found and fixed: thumbnails were rounded to a grid as coarse as the slot spacing, so the first thumbnail of a trimmed clip could be up to a second off. Grid is now a quarter slot.
- **Not tested:** real camera footage, very long videos (only short ones), Safari and Firefox.
- Waveforms and thumbnails are kept in memory only, so they're worked out again after a reload (1 s for 10 minutes of audio).

### Phase 2, step 3: phone layout and touch timeline (2026-11-13)

- Built: below 1024 px wide, a compact layout: top bar, preview, timeline, and a bottom toolbar (Media, Text, Edit/Canvas, Split, Delete, Undo, Redo). Media and clip settings open as slide-up panels (55% of the height, so the video stays visible). Short screens (phone sideways) put the preview and timeline side by side. Desktop layout unchanged at 1024 px and up.
- Touch on the timeline: swipe to scroll with momentum, pinch to zoom around the fingers, tap to select, press and hold (350 ms) to pick a clip up and move it, trim handles only on a selected clip (and wider on touch screens), tap empty space to deselect, drag the ruler to scrub. Mouse behaviour unchanged. Gesture math in `apps/editor/src/lib/gestures.ts` with 8 tests (the editor's first tests).
- Tested in Chrome with the editor in a 390x844 (and 844x390) frame and touch pointer events: swipe + momentum, pinch (3x spread → 3x zoom, same moment under the fingers), tap, swipe on a clip (scrolls, doesn't move or select), long press + drag (1 s), trim on a selected clip (0.5 s for 30 px), no trim on an unselected clip, tap/swipe on empty space, ruler scrub, toolbar actions, Text opens the Edit panel and typing works, Media panel, thumbnails in the phone timeline, dragging text on the preview by touch, desktop layout still intact at full width.
- Bugs found and fixed on the way: the Edit panel covered the video (now 55% high); a phone held sideways squashed the video to 49 px (now side by side); "fit timeline" ignored the header width change.
- **Not tested on a real phone or tablet.** All touch tests used simulated touch events in desktop Chrome. Not tested: iOS Safari (the most important one), Android Chrome, the on-screen keyboard, real momentum feel, pinch on real hardware.
- Known limits: inspector controls are desktop-sized (28 px rows), smaller than the 44 px touch guideline; no pinch to resize text on the preview; momentum isn't stopped when playback starts following the playhead.

### Phase 2, step 4: project list (2026-11-13). Phase 2 complete.

- Built: a Projects screen (grid button in the top bar; slide-up panel on phones) listing every project on the device with saved time, length, shape and clip count. New project, Open, Rename, Duplicate ("… copy", numbered), Delete (asks first; removes the project's files unless another project uses them; deleting the open project switches to the most recent other one). "Save as file" writes one `.motion` file (a standard ZIP: `project.json` plus every media and font file, ZIP64 above 4 GB, built from references so big media isn't copied into memory). "Open project file" (or Import / drag-and-drop) stores the files, then the project under a new id and a numbered name if the name is taken.
- Tested by hand in Chrome (test copies on ports 5181 and 5182, so the user's 5180 project was untouched): rename, new, add a clip, switch both ways (86 ms, all files reopen), duplicate, delete the copy (shared files kept), delete the open project (its own file removed, switches to the other, reload opens it), save as file (13.2 MB, every file at its exact size, checksums match), open that file (identical content, new id), open a project file in an empty editor on 5182 ("another device": video plays, text draws, survives reload), a junk `.motion` refused, opening through Import, the phone-size panel. ZIP files pass macOS `unzip -t` and extract correctly with Finder's tool (`ditto`), including the ZIP64 form.
- Bugs found and fixed: an opened project file kept its name, so two projects could share it (now numbered); the Projects window would have grabbed focus on every redraw and could cut a rename short.
- **Not tested:** the real save dialog (a stand-in caught the file; the system dialog can't be driven from here); projects over 4 GB for real (ZIP64 tested with a forced small limit); Safari and Firefox (Safari has no save dialog, so it downloads); a second tab trying to manage projects (it's refused with a message, by design, but not exercised).
- Known limits: media from projects you switched away from stays open in memory until reload; saving a big project reads every file once to checksum it (takes a while for many GB).

### Phase 3, stage A: colour, looks and blend modes (2026-11-13)

- Built: a Color section for every video, photo and text clip. Ten adjustments (exposure, brightness, contrast, saturation, vibrance, warmth, tint, highlights, shadows, fade), all with keyframes. Ten one-tap looks (Original, Vivid, Warm, Cool, Punch, Film, Moody, Dreamy, Mono, Noir) that just set those sliders. Blend modes: Normal, Multiply, Screen, Add, Lighten. Logic in `core/look.ts`; the GPU shader does the maths, so preview and export match.
- Tested by hand: 7 reference frames with no colour changes are pixel-identical to before (nothing else changed). Every adjustment and blend mode compared against an independent JavaScript version of the formula: 0 difference. In the editor: Mono look, typing exposure, contrast keyframes, Screen blend, reload keeps them, export of a Mono clip has 0 colourful pixels.
- **Not tested:** HDR or 10-bit sources; how the looks feel on real footage (they were checked for correctness, not taste).

### Phase 3, stage B: effects and masks (2026-11-13)

- Built: per-clip effects with keyframes: Blur, Green screen (key colour, a screen colour picker in Chrome and Edge, strength, edges, spill), Glitch, Shake (amount and speed), Vignette. Masks: Rectangle, Ellipse, Line, with position, size, rotation, feather and invert. Logic in `core/effects.ts`.
- Tested by hand: reference frames still identical. Blur within 1 colour level of an exact Gaussian at two strengths. Green screen removes green and keeps red. Each mask shape and invert checked by reading pixels inside, outside and at the edge. Vignette: corner 52 vs centre 255. Glitch gives the same picture every time at the same moment (so export matches preview). In the editor: turning each effect on and off, reload, export (masked centre in colour, corner black).
- **Not tested:** speed of heavy blur on 4K exports or on a phone; green screen on real (unevenly lit) footage.

### Phase 3, stage C: LUTs (2026-11-13)

- Built: import `.cube` LUT files (the 3D kind that colour packs, Resolve and Premiere use) through Import, drag-and-drop, or a clip's Color section (LUT menu, "Add .cube file…"). Each clip can use one LUT with a Strength (0 to 100%, with keyframes). LUTs are stored on the device, come back after reload, travel inside `.motion` files, and are kept by the file cleanup. A LUT that can't be loaded gives a message; adding the same file again reconnects it. Parsing in `core/lut.ts` (with tests); the GPU applies it after green screen and colour adjustments.
- Tested by hand (test copy on port 5181): reference frames still identical. Pixel checks against the expected result on a real video frame: identity LUT changes nothing (0 difference), invert LUT exact on every pixel, a 33-point red/blue swap exact, 50% strength gives exactly the midpoint. In the editor: a broken `.cube` is refused with "The LUT should have 8 colours, found 2" and nothing is added; adding invert.cube from the Color section applies it to the selected clip; typing 50 into Strength; reload (LUT restored, preview grey as expected); export (the LUT clip is flat grey within 1 level, the next clip keeps its colours); "None" removes it, undo brings it back, redo removes it; file cleanup keeps the LUT file; a `.motion` file contains the LUT and, after deleting the stored copy, opening the file brings it back; with the stored copy deleted, the missing-LUT message appears and importing the same file reconnects it (no duplicate).
- Bug found and fixed: **every LUT drew black.** WebGL refuses to upload raw numbers into a 3D texture while "premultiply alpha" is on, and the compositor turns that on for photos and video. Found by the pixel check; the upload now switches it off for the LUT only. There is no automated renderer test (WebGL needs a browser), so the check lives in the browser test only.
- **Not tested:** the export dialog's own button (I called the same export function with the same LUT list it passes); real commercial LUT packs (only LUTs I generated); LUTs with a custom input range on real files (parsed and tested in core, not seen on screen); 65-point LUTs for speed; Safari and Firefox.
- Known limits: one LUT per clip. (Removing a LUT from the project was added later the same day, see below.)

### Phase 3, stage D: transitions (2026-11-13)

- Built: transitions between neighbouring clips on the main track: Dissolve, Dip to black, Dip to white, Slide left / right / up / down, Wipe left / right, Zoom, Blur. Pick one in the Transition section of a clip's settings (it's the transition from the clip before), with a Length (0.1 to 5 s, default 0.5 s). A small marker sits at each cut that has one; clicking it selects that clip.
- How it works: the transition is centred on the cut. Clips don't move, so the video keeps its length and captions/overlays stay in sync. During the transition the old clip keeps playing past its end and the new one starts early, using the extra footage beyond the trim points; where a file has no extra footage, its first/last frame holds. A transition is never longer than either clip (the panel says when it's been shortened). Logic in `core/transitions.ts` and `evaluateFrame`, so preview and export share it.
- Rules: the first clip can't have one (removed automatically if a clip becomes first); splitting keeps it on the left part; moving a clip to another track removes it.
- Tested by hand (test copy on port 5181): reference frames with no transitions still identical. Pixel checks against a reference mix of the two clips' own frames: dissolve half way and dip to black within half a colour level, wipe and slide exact. Zoom, blur and dip to white checked by eye in the preview. In the editor: choosing Dissolve in the panel, the marker appearing and selecting its clip, typing a 4 s length on a 2.5 s clip (kept, used as 2.5 s, note shown), undo with Cmd+Z, reload keeps them, real playback through a transition (61 frames in the 1 s window, longest gap 27 ms, every frame had both pictures, the incoming clip used its footage from before its trim point), a clean playback through two transitions with no console errors, export (same 22 s length; the dip to white reaches pure white at the cut in the file).
- **Not tested:** slow devices or 4K (two videos decode at once during a transition); every kind on every clip type (photos were not tested in a transition); dragging the trim handle right where a marker sits (the marker covers the bottom 14 px of the cut); transitions inside nested compositions (they can't be made in the editor yet; the wipe edge would use the whole canvas).
- Known limits: no transition preview button. (The first version had a hard sound cut and froze the old clip's keyframes past its end; both fixed below.)

### Follow-ups to stages C and D (2026-11-13)

- Built: **sound crossfades at transitions.** The old clip's sound plays on past the cut and fades out while the new one fades in, over the same window as the picture, using the sound beyond the trim points (or fitting the fades into what exists). Equal-power curves, so the loudness stays steady. Fades live on each audio segment (`fadeIn` / `fadeOut`) and core works out the gain (`audioGainAt`, `gainPoints`); preview and export both use it.
- Built: **clips keep animating during a transition.** Past its end (or before its start) a clip's keyframes, shake and glitch carry on instead of freezing. Keyframes still hold past their first / last one. Text in/out animations stay within the clip.
- Built: **remove a LUT from the project** ("Remove LUT from project" under the LUT menu). It's taken off every clip using it; undo brings it back. The stored file is deleted by the startup cleanup.
- Tests first: 9 new core tests (2 for animation past the end failed before the fix, 6 for sound, 1 for LUT removal).
- Tested by hand (port 5181): two test clips made with ffmpeg (440 Hz and 1000 Hz tones) imported, trimmed, dissolve added, then mixed through the export mixer and measured every 20 ms: each tone follows the equal-power curve within 2.3% (the measuring window), combined loudness steady within 4%, no clicks, the new clip's sound starts half a second early from its spare audio. In the preview: playing across the cut sends the same fades to the audio system (about 50 volume steps per fade at the right times). LUT removal: used by 2 clips, removed with the button (message "Removed Invert from the project and 2 clips"), Cmd+Z restores both clips and the picture, removing and reloading gives no warning and the file is cleaned up. Reference frames still identical.
- **Not tested:** listening to the crossfade (I can't hear the preview; only measured the export mix and the scheduled preview fades); crossfades on clips with speed changes; music on the audio track is unaffected by design (it has no transitions).


### Phase 3, stage E: audio tools (2026-11-13)

- Built:
  - **Sound fades** on any clip with sound (Fade in / Fade out in the Clip section, 0 to 10 s). Equal-power curves; they shrink to fit a short clip, join a transition's crossfade at the same end, stay at the outer ends when a clip is split, and show as dark wedges on the clip in the timeline.
  - **Extract audio**: a button for video clips. The sound becomes its own clip on an audio track with the same timing, volume, keyframes and fades; the video clip is muted. Undo puts it back.
  - **Voiceover**: a Voiceover button in the timeline toolbar (Voice in the phone bar). It asks for the microphone, plays the video without its sound (so the speakers don't echo into the mic), and records raw samples into a WAV file, placed on an audio track where recording started. Shows a timer while recording.
  - **Sound effects**: 9 built-in sounds made in code (Whoosh, Swish, Pop, Click, Ding, Notification, Riser, Impact, Camera shutter), listed in the Media panel with Listen and Add buttons. Added at the playhead as a normal WAV file; adding the same sound again reuses the file.
  - Core: `setAudioFade`, `extractAudio`, `encodeWav`; 12 new core tests.
- Tested by hand (port 5181, a project with two ffmpeg test clips, 440 Hz and 1000 Hz): every sound effect renders at its length with the same peak level and is identical each time; Add Whoosh twice (one file, two clips, second on a new track because they overlap); typed fades of 1 s / 0.5 s (the mixed sound follows the curve exactly: 0.383 / 0.708 / 0.924 at a quarter / half / three-quarters); Extract audio with the real button (video muted, audio clip at the same time and in-point, same loudness 0.1251 before and after); voiceover with a stand-in microphone producing a 660 Hz tone (placed where recording started, video played during recording and stopped after, the tone is in the clip at the right level, a timed 3 s recording came out 3.003 s); reload keeps everything and every file reopens; the full-project mix contains all of it.
- **Not tested:** a real microphone (the browser's permission prompt can't be answered from here, so the mic was replaced by a tone; everything after the mic is the real code); how the sound effects actually sound (checked by measurement, not by ear); the phone-size Voice button; Safari and Firefox recording.
- Known limits: an extracted clip doesn't keep a transition's crossfade (it cuts at the clip's edges); recording has a small delay (tens of milliseconds) between the mic and the timeline; long voiceovers are big (WAV, about 5.7 MB a minute).

### Phase 3, stage F: shapes and stickers (2026-11-13)

- Built: a new **shape** layer. The Media panel now has tabs (Media / Sounds / Shapes). Shapes: rectangle, circle, triangle, star, arrow, line, outline circle, label bar. Stickers (drawn in code, no licensed art or emoji fonts): heart, gold star, sparkle, burst, speech bubble, tick, cross, pointer, in bold colours with a white outline. Click to add at the playhead in the middle of the canvas, on a "Graphics" track under any text. The clip's Shape settings change the shape (12 kinds), width and height, corner rounding, fill (or none), outline colour and thickness (or none). Everything else works on shapes too: move on the canvas, keyframes, colour, effects, masks, blend modes.
- How it works: `core/shapes.ts` gives every shape as path commands (tested: closed, inside its box). The renderer draws them with Canvas 2D at the size they appear (cached, like text), and the panel thumbnails are SVG from the same commands.
- Tested by hand (port 5181): the Shapes tab shows every shape and sticker; added a Heart (selected, on a Graphics track between the text tracks and the main track, starts at the playhead); pixel check of the rendered frame: the middle is exactly the heart's colour and the edge is the white outline; in the settings changed it to a star, turned the outline off, typed a width of 500, picked a blue fill; dragged it on the canvas in 12 small moves (moved exactly 240 by 120 canvas pixels, one undo step); reload keeps it; exported video shows the star's colour within 1 level at its new place.
- Bug found and fixed: the Import button was cut off once the panel had tabs (now it only shows on the Media tab).
- **Not tested:** every one of the 12 shape kinds on the canvas (all are covered by core tests and the panel thumbnails, but only heart and star were checked as rendered pixels); shapes in phone layout; very large shapes (capped at 4096 pixels per side, like text).
- Known limits: no gradient fills; stickers have no built-in animations (use keyframes).

## 12. Next step

Agreed order (Phase 2 next):
1. ~~Text layers.~~ Done.
2. ~~Thumbnails and waveforms on clips.~~ Done.
3. ~~Phone layout and touch timeline.~~ Done (needs a real-device test pass). Re-measure export smoothness on a phone.
4. ~~A project list~~ Done. **Phase 2 is complete** (only the real-phone test is left, and needs the user).
Phase 3 (in progress): ~~A. colour, looks, blend modes~~ done. ~~B. effects and masks~~ done. ~~C. LUTs~~ done. ~~D. transitions~~ done. ~~E. audio tools~~ done. ~~F. shapes and stickers~~ done. Next: G. shapes and stickers, G. restyle all captions at once and resize/rotate handles on the preview, H. templates.
Then Phase 4 (hosting, PWA, Safari/Firefox, public name, ProRes).

Known rough edges from the review: photos larger than the GPU texture limit aren't downscaled; changing the canvas re-fits clips you resized by hand; changing speed doesn't move keyframes; export audio is resampled buffer by buffer (tiny discontinuities on non-48 kHz sources); the timeline isn't virtualised for very long projects; only `core` has automated tests.
