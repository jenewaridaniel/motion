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
```

- **Time** is in integer microseconds (`Micros`), the same unit WebCodecs uses. That keeps time exact with no float drift.
- **Every animatable value is a `Property<T>`**: a static `value` plus optional `keyframes` with linear, hold or cubic-bezier easing. Keyframe times are relative to the layer start, so moving a clip moves its animation with it.
- **Transform** is anchor, position, scale and rotation in composition pixels. A layer's matrix is `T(position) · R(rotation) · S(scale) · T(-anchor)`.
- **Parenting**: a layer with `parentId` is multiplied by its parent's matrix, as in After Effects. Opacity is not inherited.
- **Nesting**: a `composition` layer draws another composition through its own transform. Nested content is not clipped to the nested canvas yet (that needs render-to-texture, see below).
- **Magnetic track**: the main track has no gaps. Its clips are packed back to back after every edit (ripple). Overlay and audio tracks are free and don't allow overlaps.

Planned layer kinds, which slot into the same union: `text`, `shape` (paths, strokes, trim paths), `solid`, `adjustment`.

## Edits and undo

Every change goes through `History.apply(project, recipe, mergeKey?)`. That uses Immer's `produceWithPatches` and stores forward and inverse patches. Dragging and scrubbing pass a `mergeKey`, so one whole gesture is one undo step. Edit functions in `core/edit.ts` take absolute targets (for example "trim the end to 4.2 s") instead of deltas, so repeating them during a drag is safe.

## Media and export

- **Reading**: Mediabunny `Input` over the user's `File`. Video frames come from a `CanvasSink` (rotation handled) through a `VideoReader`. It walks forward during playback and seeks on jumps. Each timeline layer gets its own reader, so two clips from the same file don't fight.
- **Export**: Mediabunny `Output` + `Mp4OutputFormat`. Video uses `CanvasSource` (H.264 or HEVC, checked with `canEncodeVideo` for the chosen size). Audio uses `AudioBufferSource` (AAC, with Opus as fallback), mixed in 2 s chunks and interleaved with the video. If the browser has `showSaveFilePicker`, the file streams straight to disk (`StreamTarget`). Otherwise it is built in memory and downloaded. **No watermark exists in the code path.**

## Not built yet (in order)

1. Move preview decoding and export into a worker (Comlink plus OffscreenCanvas) so the UI never stutters during export.
2. Persistence: media in OPFS, project in IndexedDB (Dexie), autosave, and import/export of the project file.
3. Render-to-texture in the compositor: nested-comp clipping, group opacity, effects, masks, blend modes, transitions.
4. Text and shape layers, the graph editor, motion paths on the canvas.
5. Device-adaptive export presets, proxies, ProRes (WASM).
6. PWA install (vite-plugin-pwa).
