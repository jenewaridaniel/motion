# Motion: Architecture

How the editor is put together. Read with `docs/project-notes.md` (decisions) and `PRODUCT.md` (who it's for).

## Packages

```
apps/
  landing/     Next.js marketing site (static)
  editor/      Vite + React editor (the product). Client-only.
packages/
  core/        Project model, keyframes, evaluation, edits, undo/redo. Pure TS, no DOM.
  renderer/    WebGL2 compositor. Draws one frame from core's evaluation.
  media/       Mediabunny I/O: probing files, frame readers, audio mixing, export.
```

Dependency direction: `editor -> media -> renderer -> core`. `core` depends on nothing but Immer.

## The one rule

**Preview and export run the same code.** For any time `t`, `core.evaluateFrame(project, t)` returns a flat list of draws (which asset, which source time, a matrix and an opacity). The renderer turns that list into pixels. The preview calls it on every animation frame. Export calls it once per output frame, on an OffscreenCanvas at the output size. If it looks right in the preview, it exports the same way.

Audio follows the same idea. `core.collectAudioSegments(project)` describes what plays when. The preview schedules it on a live `AudioContext`, and export renders the same segments through an `OfflineAudioContext`.

## Project model (motion-ready)

```
Project
  assets:        Record<id, Asset>          imported media metadata (files live outside the model)
  compositions:  Record<id, Composition>    the root timeline, plus any nested ones
  rootCompositionId

Composition { width, height, fps, background, tracks[] }   tracks[0] is drawn on top
Track       { kind: visual | audio, magnetic, hidden, muted, layers[] }
Layer       { start, duration, parentId?, transform, opacity, ...kind }
  kind media        assetId, inPoint, speed, volume
  kind composition  compositionId, inPoint, speed      (nested comp, used for motion design)
  kind text         text, style                          (layer space centred on the text block)
```

- **Time** is in integer microseconds (`Micros`), the same unit WebCodecs uses. That keeps time exact with no float drift.
- **Every animatable value is a `Property<T>`**: a static `value` plus optional `keyframes` with linear, hold or cubic-bezier easing. Keyframe times are relative to the layer start, so moving a clip moves its animation with it.
- **Transform** is anchor, position, scale and rotation in composition pixels. A layer's matrix is `T(position) · R(rotation) · S(scale) · T(-anchor)`.
- **Parenting**: a layer with `parentId` is multiplied by its parent's matrix, as in After Effects. Opacity is not inherited.
- **Nesting**: a `composition` layer draws another composition through its own transform. Nested content is not clipped to the nested canvas yet (that needs render-to-texture, see below).
- **Magnetic track**: the main track has no gaps. Its clips are packed back to back after every edit (ripple). Overlay and audio tracks are free and don't allow overlaps.

Planned layer kinds, which slot into the same union: `shape` (paths, strokes, trim paths), `solid`, `adjustment`.

## Text

- **Model:** `TextLayer` holds the words and a `TextStyle` (font, weight, italic, size, color, alignment, line height, letter spacing, optional outline, shadow and background box). Transform and opacity animate like any layer. Text has no source time, so it trims freely and has no sound.
- **Drawing:** `evaluateFrame` returns draws whose `source` is `video`, `image` or `text`. `media.TextRasterizer` draws text with Canvas 2D at the size it will appear (layer scale x output scale, rounded to quarter-octave steps), caches the result (LRU, 64 megapixels max) and hands the compositor a `PlacedImage` centred on the layer origin. Same path for preview and export, so 4K exports get 4K-sharp text.
- **Animations:** `TextLayer.animation` (in / out / loop presets). `core.textAnimationAt` turns them into opacity, scale, offset, rotation and a letter `reveal` at draw time; `evaluateFrame` applies them around the anchor, on top of keyframes. Split keeps "in" on the left and "out" on the right.
- **Captions:** `core.parseCaptions` (SRT, WebVTT) and `core.addCaptions` (text clips near the bottom, overlaps on extra tracks).
- **Fonts:** 36 bundled fonts (OFL or Apache 2.0), listed in `apps/editor/src/lib/fonts.generated.ts`, which `scripts/gen-fonts.mjs` builds from the font packages. Each downloads only when used. Users' own fonts are `Project.fonts` entries; the file is stored in the `media` store by font id and registered with `FontFace` on load. Core's default is generic `sans-serif`; the editor passes its default (Archivo).

## Working on the canvas

`core/canvas.ts` hit-tests draws (topmost rectangle under a point, following rotation and scale) and turns a drag into a position change in the parent's space. The engine keeps the last frame's draws and rectangles; `CanvasOverlay` sits over the preview for select, drag, centre snapping and the selection outline.

## Colour, effects and LUTs

- **Model:** every layer can have `adjust` (colour sliders), `blend`, `effects` (blur, chromaKey, glitch, shake, vignette), `mask` and `lut` (`{ id, intensity }`). Numbers are `Property` values, so they animate. LUT files are `Project.luts` entries; the file is stored in the `media` store by LUT id, like fonts.
- **Resolving:** `core.resolveStyle` turns them into plain numbers for one moment (`VisualDraw.style`). Shake changes the layer's matrix instead.
- **Drawing:** one fragment shader, in this order: glitch (shifted sampling), green screen, colour adjustments, LUT, mask, vignette. Blur runs first as a separate two-pass Gaussian into textures (at lower resolution for big blurs). Blend modes are GPU blend functions. The LUT is a 3D half-float texture on texture unit 1. The editor keeps parsed LUTs in `state/luts.ts` and passes them to both the preview and export (`RenderInput.luts`), so they match.

## Edits and undo

Every change goes through `History.apply(project, recipe, mergeKey?)`. That uses Immer's `produceWithPatches` and stores forward and inverse patches. Dragging and scrubbing pass a `mergeKey`, so one whole gesture is one undo step. Edit functions in `core/edit.ts` take absolute targets (for example "trim the end to 4.2 s") instead of deltas, so repeating them during a drag is safe.

## Media and export

- **Reading**: Mediabunny `Input` over the user's `File`. Video frames come from a `CanvasSink` (rotation handled) through a `VideoReader`. It walks forward during playback and seeks on jumps. Each timeline layer gets its own reader, so two clips from the same file don't fight.
- **Export**: Mediabunny `Output` + `Mp4OutputFormat`. Video uses `CanvasSource` (H.264 or HEVC, checked with `canEncodeVideo` for the chosen size). Audio uses `AudioBufferSource` (AAC, with Opus as fallback), mixed in 2 s chunks and interleaved with the video. If the browser has `showSaveFilePicker`, the file streams straight to disk (`StreamTarget`). Otherwise it is built in memory and downloaded. **No watermark exists in the code path.**

## Autosave

- **Where:** IndexedDB, database `motion`, stores `projects` (by project id), `media` (each imported File, by asset id) and `meta` (`currentProjectId`). IndexedDB rather than OPFS because it stores files in every browser we target with one API. Nothing leaves the device.
- **Saving:** `apps/editor/src/state/autosave.ts` saves 400 ms after the last change, one save at a time, and again when the tab is hidden or closed. Files are copied in the background when imported; the top bar shows Saving / Saved / Not saved.
- **Restoring:** on start, the saved project goes through `core.parseProject` (shape and version check) before loading. Each file is reopened with `media.reopenFile`, which refuses a copy that doesn't match (`core.isSameMedia`). A missing file leaves its clips in place; importing the same file again reconnects them.
- **One tab saves:** a Web Lock (`motion-editor`) is held by the first tab. Others open the project but don't save, and say so.
- **Cleanup:** at startup (while imports are blocked), stored files that no saved project uses are deleted. They come from undone imports.
- **Not saved:** undo history, selection, playhead, zoom.

## Not built yet (in order)

1. Export in a worker, only if measured stutter on weaker devices calls for it. Export already stays smooth on a Mac (see project-notes). Web Audio isn't available in workers, so audio mixing would stay on the main thread and stream chunks to the worker.
2. Render-to-texture for whole compositions: nested-comp clipping and group opacity. (Effects, masks, blend modes and LUTs work per layer already.)
3. Transitions (Phase 3, stage D).
4. Shape layers (Phase 3, stage F), the graph editor, motion paths on the canvas.
5. Device-adaptive export presets, proxies, ProRes (WASM).
6. PWA install (vite-plugin-pwa).
