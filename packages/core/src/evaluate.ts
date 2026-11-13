import { shakeOffset } from "./effects.ts";
import { type DrawStyle, resolveStyle } from "./look.ts";
import {
  type Affine,
  apply,
  IDENTITY,
  multiply,
  rotate,
  scale,
  translate,
} from "./matrix.ts";
import {
  type Composition,
  compositionDuration,
  type Id,
  type Layer,
  layerEnd,
  type MediaLayer,
  type Project,
  sourceTimeAt,
  type TextStyle,
  type Track,
} from "./model.ts";
import { type Property, type Vec2, valueAt } from "./property.ts";
import type { ShapeKind, ShapeStyle } from "./shapes.ts";
import { textAnimationAt } from "./text-animation.ts";
import type { Micros } from "./time.ts";
import {
  type TransitionSide,
  transitionLength,
  transitionSides,
} from "./transitions.ts";

/** What a draw shows. File sources are in pixels from their top-left corner. */
export type DrawSource =
  | { kind: "video"; assetId: Id; time: Micros; width: number; height: number }
  | { kind: "image"; assetId: Id; width: number; height: number }
  /**
   * Laid out by whoever draws it; layer space is centred on the text block.
   * `reveal` (0 to 1) shows only that share of the letters, in reading order.
   */
  | { kind: "text"; text: string; style: TextStyle; reveal?: number }
  /** Centred on the layer's origin, `size` in layer pixels. */
  | { kind: "shape"; shape: ShapeKind; size: Vec2; style: ShapeStyle };

/** One thing to draw. Everything the renderer needs, nothing it has to look up. */
export interface VisualDraw {
  /** The root-level layer (or nested layer) this draw came from. Stable across frames. */
  key: string;
  layerId: Id;
  source: DrawSource;
  /** Layer space to root-composition pixels. */
  matrix: Affine;
  opacity: number;
  style: DrawStyle;
}

const MAX_DEPTH = 16;

/** The layer's own matrix at `local` time: T(position) · R(rotation) · S(scale) · T(-anchor). */
export function layerMatrix(layer: Layer, local: Micros): Affine {
  const t = layer.transform;
  const [ax, ay] = valueAt(t.anchor, local);
  const [px, py] = valueAt(t.position, local);
  const [sx, sy] = valueAt(t.scale, local);
  const r = valueAt(t.rotation, local);
  return multiply(
    multiply(multiply(translate(px, py), rotate(r)), scale(sx, sy)),
    translate(-ax, -ay),
  );
}

/** Matrix including the parent chain, evaluated at composition time `t`. */
function worldMatrix(
  layer: Layer,
  t: Micros,
  byId: Map<Id, Layer>,
  seen = new Set<Id>(),
): Affine {
  const own = layerMatrix(layer, t - layer.start);
  if (!layer.parentId || seen.has(layer.id)) return own;
  const parent = byId.get(layer.parentId);
  if (!parent) return own;
  seen.add(layer.id);
  return multiply(worldMatrix(parent, t, byId, seen), own);
}

function layersById(comp: Composition): Map<Id, Layer> {
  const map = new Map<Id, Layer>();
  for (const track of comp.tracks) {
    for (const l of track.layers) map.set(l.id, l);
  }
  return map;
}

/** Camera shake moves the whole layer around its anchor, on the canvas. */
function withShake(
  layer: Layer,
  local: Micros,
  matrix: Affine,
  shortSide: number,
): Affine {
  const shake = layer.effects?.shake;
  if (!shake) return matrix;
  const amount = valueAt(shake.amount, local);
  const o = shakeOffset(amount, shake.speed, local, shortSide);
  if (o.dx === 0 && o.dy === 0 && o.rotation === 0) return matrix;
  const [ax, ay] = valueAt(layer.transform.anchor, local);
  const [cx, cy] = apply(matrix, ax, ay);
  const around = multiply(
    multiply(translate(cx + o.dx, cy + o.dy), rotate(o.rotation)),
    translate(-cx, -cy),
  );
  return multiply(around, matrix);
}

const isActive = (l: Layer, t: Micros) => t >= l.start && t < layerEnd(l);

interface DrawContext {
  p: Project;
  byId: Map<Id, Layer>;
  parentMatrix: Affine;
  parentOpacity: number;
  keyPrefix: string;
  out: VisualDraw[];
  depth: number;
  width: number;
  height: number;
  shortSide: number;
}

interface ActiveTransition {
  from: Layer;
  to: Layer;
  sides: { from: TransitionSide; to: TransitionSide };
}

/** The two main-track clips in the middle of a transition at `t`, if any. */
function activeTransition(
  track: Track,
  t: Micros,
  width: number,
  height: number,
): ActiveTransition | null {
  if (!track.magnetic) return null;
  const layers = track.layers;
  for (let i = 1; i < layers.length; i++) {
    const to = layers[i];
    const from = layers[i - 1];
    if (!to?.transition || !from) continue;
    const length = transitionLength(to.transition, from, to);
    if (length <= 0) continue;
    // Centred on the cut (the main track has no gaps, so `to.start` is it).
    const begin = to.start - length / 2;
    if (t < begin || t >= begin + length) continue;
    return {
      from,
      to,
      sides: transitionSides(
        to.transition.kind,
        (t - begin) / length,
        width,
        height,
      ),
    };
  }
  return null;
}

function drawComposition(
  p: Project,
  compId: Id,
  t: Micros,
  parentMatrix: Affine,
  parentOpacity: number,
  keyPrefix: string,
  out: VisualDraw[],
  depth: number,
): void {
  const comp = p.compositions[compId];
  if (!comp || depth > MAX_DEPTH) return;
  const ctx: DrawContext = {
    p,
    byId: layersById(comp),
    parentMatrix,
    parentOpacity,
    keyPrefix,
    out,
    depth,
    width: comp.width,
    height: comp.height,
    shortSide: Math.min(comp.width, comp.height),
  };
  // tracks[0] is on top, so draw from the last track up.
  for (let i = comp.tracks.length - 1; i >= 0; i--) {
    const track = comp.tracks[i];
    if (!track || track.hidden || track.kind !== "visual") continue;
    const tr = activeTransition(track, t, comp.width, comp.height);
    // Track order puts the incoming clip after (on top of) the outgoing one.
    for (const layer of track.layers) {
      const side =
        layer === tr?.from
          ? tr.sides.from
          : layer === tr?.to
            ? tr.sides.to
            : undefined;
      if (side ? !side.visible : !isActive(layer, t)) continue;
      drawLayer(ctx, layer, t, side);
    }
  }
}

function drawLayer(
  ctx: DrawContext,
  layer: Layer,
  t: Micros,
  side: TransitionSide | undefined,
): void {
  const { p, out, shortSide } = ctx;
  // During a transition a clip is drawn a little before its start or after
  // its end. Everything keeps running there as if the clip were longer:
  // keyframes continue (and hold past their first / last one), effects keep
  // moving, and the footage beyond the trim points is used.
  const local = t - layer.start;
  const opacity =
    ctx.parentOpacity *
    clamp01(valueAt(layer.opacity, local)) *
    (side?.opacity ?? 1);
  if (opacity <= 0) return;
  const own = worldMatrix(layer, t, ctx.byId);
  const matrix = withShake(
    layer,
    local,
    multiply(ctx.parentMatrix, side ? multiply(side.matrix, own) : own),
    shortSide,
  );
  const style = (): DrawStyle => {
    const base = resolveStyle(layer, local, shortSide);
    if (!side) return base;
    return {
      ...base,
      blur: Math.hypot(base.blur, side.blur * shortSide),
      dip: side.dip,
      wipe: side.wipe,
    };
  };
  const key = ctx.keyPrefix + layer.id;

  if (layer.kind === "composition") {
    // TODO(render-to-texture): clip nested content to the nested canvas.
    drawComposition(
      p,
      layer.compositionId,
      Math.max(0, sourceTimeAt(layer, local)),
      matrix,
      opacity,
      `${key}/`,
      out,
      ctx.depth + 1,
    );
    return;
  }
  if (layer.kind === "text") {
    if (layer.text.trim() === "") return;
    // Text in / out animations are defined within the clip.
    const anim = textAnimationAt(
      layer,
      Math.min(Math.max(local, 0), Math.max(0, layer.duration - 1)),
    );
    const shown = opacity * anim.opacity;
    if (shown <= 0) return;
    // Animation scales and rotates around the anchor, and offsets in the
    // layer's own space so a slide follows the text's rotation.
    const [ax, ay] = valueAt(layer.transform.anchor, local);
    const extra = multiply(
      multiply(
        multiply(translate(ax + anim.dx, ay + anim.dy), rotate(anim.rotation)),
        scale(anim.scale, anim.scale),
      ),
      translate(-ax, -ay),
    );
    out.push({
      key,
      layerId: layer.id,
      source: {
        kind: "text",
        text: layer.text,
        style: layer.style,
        ...(anim.reveal < 1 ? { reveal: anim.reveal } : {}),
      },
      matrix: multiply(matrix, extra),
      opacity: shown,
      style: style(),
    });
    return;
  }
  if (layer.kind === "shape") {
    out.push({
      key,
      layerId: layer.id,
      source: {
        kind: "shape",
        shape: layer.shape,
        size: layer.size,
        style: layer.style,
      },
      matrix,
      opacity,
      style: style(),
    });
    return;
  }
  const asset = p.assets[layer.assetId];
  if (!asset || asset.kind === "audio" || !asset.hasVideo) return;
  const { width, height } = asset;
  // Footage beyond the trim points is used when a transition needs it;
  // where the file runs out, the first / last frame holds.
  const sourceTime = Math.min(
    Math.max(0, sourceTimeAt(layer, local)),
    Math.max(0, asset.duration - 1),
  );
  const source: DrawSource =
    asset.kind === "video"
      ? { kind: "video", assetId: asset.id, time: sourceTime, width, height }
      : { kind: "image", assetId: asset.id, width, height };
  out.push({
    key,
    layerId: layer.id,
    source,
    matrix,
    opacity,
    style: style(),
  });
}

/** Everything visible at time `t`, bottom to top. */
export function evaluateFrame(
  p: Project,
  t: Micros,
  compId: Id = p.rootCompositionId,
): VisualDraw[] {
  const out: VisualDraw[] = [];
  drawComposition(p, compId, t, IDENTITY, 1, "", out, 0);
  return out;
}

// ---------------------------------------------------------------- audio

/** A fade over [start, end) in root-composition time. */
export interface AudioFade {
  start: Micros;
  end: Micros;
}

export interface AudioSegment {
  layerId: Id;
  assetId: Id;
  /** Root-composition time range. */
  start: Micros;
  duration: Micros;
  /** Source time at `start`. */
  sourceIn: Micros;
  speed: number;
  /** Volume property; its keyframe times are relative to `layerStart`. */
  volume: Property<number>;
  /** Where the clip starts (a transition can make its sound start earlier). */
  layerStart: Micros;
  /** Silent at `fadeIn.start`, full at `fadeIn.end`. */
  fadeIn: AudioFade | null;
  /** Full at `fadeOut.start`, silent at `fadeOut.end`. */
  fadeOut: AudioFade | null;
}

/**
 * Every piece of audio in the root composition.
 *
 * At a transition on the main track the two clips' sound crossfades over
 * the same window as the picture: the old clip plays on past the cut and
 * the new one starts early, using the sound beyond the trim points. Where a
 * file has no sound there, the fade fits into what exists.
 * TODO(nesting): include audio from nested compositions.
 */
export function collectAudioSegments(
  p: Project,
  compId: Id = p.rootCompositionId,
): AudioSegment[] {
  const comp = p.compositions[compId];
  if (!comp) return [];
  const out: AudioSegment[] = [];
  /**
   * The clip's neighbours on the main track, for transitions. Extracted
   * sound uses its video clip's place while their timing still matches
   * (moved or trimmed on its own, it's independent).
   */
  const mainPlace = (layer: MediaLayer, track: Track, i: number) => {
    if (track.magnetic) {
      return { prev: track.layers[i - 1], next: track.layers[i + 1] };
    }
    if (!layer.linkedTo) return {};
    for (const t of comp.tracks) {
      if (!t.magnetic) continue;
      const j = t.layers.findIndex((l) => l.id === layer.linkedTo);
      const v = t.layers[j];
      if (
        v?.kind === "media" &&
        v.start === layer.start &&
        v.duration === layer.duration &&
        v.inPoint === layer.inPoint &&
        v.speed === layer.speed &&
        v.assetId === layer.assetId
      ) {
        // The transition into this clip lives on the video clip.
        return { prev: t.layers[j - 1], next: t.layers[j + 1], self: v };
      }
    }
    return {};
  };
  for (const track of comp.tracks) {
    if (track.muted) continue;
    track.layers.forEach((layer, i) => {
      if (layer.kind !== "media") return;
      const asset = p.assets[layer.assetId];
      if (!asset?.hasAudio) return;
      if (isSilent(layer)) return;
      let start = layer.start;
      let end = layerEnd(layer);
      let sourceIn = layer.inPoint;
      let fadeIn: AudioFade | null = null;
      let fadeOut: AudioFade | null = null;
      const place = mainPlace(layer, track, i);
      const { prev, next } = place;
      const transitionIn = (place.self ?? layer).transition;
      if (prev && transitionIn) {
        const half = Math.floor(
          transitionLength(transitionIn, prev, layer) / 2,
        );
        if (half > 0) {
          // Start early by up to half the transition, if the file has sound there.
          const early = Math.min(half, Math.floor(layer.inPoint / layer.speed));
          start = layer.start - early;
          sourceIn = layer.inPoint - Math.round(early * layer.speed);
          fadeIn = { start, end: layer.start + half };
        }
      }
      if (next?.transition) {
        const half = Math.floor(
          transitionLength(next.transition, layer, next) / 2,
        );
        if (half > 0) {
          const cut = layerEnd(layer);
          // Where the file runs out, in timeline time.
          const fileEnd =
            layer.start + (asset.duration - layer.inPoint) / layer.speed;
          end = cut + Math.max(0, Math.min(half, Math.floor(fileEnd - cut)));
          fadeOut = { start: cut - half, end };
        }
      }
      // The clip's own fades, joined with any transition fade at that end.
      if (layer.fade) {
        let fi = Math.min(layer.fade.in, layer.duration);
        let fo = Math.min(layer.fade.out, layer.duration);
        if (fi + fo > layer.duration) {
          const k = layer.duration / (fi + fo);
          fi = Math.floor(fi * k);
          fo = Math.floor(fo * k);
        }
        if (fi > 0) {
          const fadeEnd = layer.start + fi;
          fadeIn = fadeIn
            ? { start: fadeIn.start, end: Math.max(fadeIn.end, fadeEnd) }
            : { start: layer.start, end: fadeEnd };
        }
        if (fo > 0) {
          const fadeStart = layerEnd(layer) - fo;
          fadeOut = fadeOut
            ? { start: Math.min(fadeOut.start, fadeStart), end: fadeOut.end }
            : { start: fadeStart, end: layerEnd(layer) };
        }
      }
      out.push({
        layerId: layer.id,
        assetId: asset.id,
        start,
        duration: end - start,
        sourceIn,
        speed: layer.speed,
        volume: layer.volume,
        layerStart: layer.start,
        fadeIn,
        fadeOut,
      });
    });
  }
  return out;
}

const fadeAt = (f: AudioFade, t: Micros) =>
  f.end <= f.start
    ? t >= f.end
      ? 1
      : 0
    : clamp01((t - f.start) / (f.end - f.start));

/**
 * Gain (0 to 2) of a segment at root-composition time `t`: its volume times
 * any fades. Fades are equal-power, so a crossfade keeps the loudness steady.
 */
export function audioGainAt(seg: AudioSegment, t: Micros): number {
  let g = Math.min(2, Math.max(0, valueAt(seg.volume, t - seg.layerStart)));
  if (seg.fadeIn) g *= Math.sin((Math.PI / 2) * fadeAt(seg.fadeIn, t));
  if (seg.fadeOut) g *= Math.cos((Math.PI / 2) * fadeAt(seg.fadeOut, t));
  return g;
}

/**
 * Gain over [from, to] as points to ramp between linearly: every `step`
 * where the gain changes (keyframed volume, fades), and only the edges
 * where it's flat.
 */
export function gainPoints(
  seg: AudioSegment,
  from: Micros,
  to: Micros,
  step: Micros,
): [Micros, number][] {
  const animated = !!seg.volume.keyframes?.length;
  const fades = [seg.fadeIn, seg.fadeOut].filter((f): f is AudioFade => !!f);
  const inFade = (t: Micros) => fades.some((f) => t >= f.start && t < f.end);
  const edges = fades
    .flatMap((f) => [f.start, f.end])
    .filter((e) => e > from && e < to)
    .sort((x, y) => x - y);
  const points: [Micros, number][] = [[from, audioGainAt(seg, from)]];
  let t = from;
  while (t < to) {
    const nextEdge = edges.find((e) => e > t) ?? to;
    const next =
      animated || inFade(t) ? Math.min(t + step, nextEdge) : nextEdge;
    points.push([next, audioGainAt(seg, next)]);
    t = next;
  }
  return points;
}

function isSilent(layer: MediaLayer): boolean {
  const v = layer.volume;
  if (v.keyframes?.length) return v.keyframes.every((k) => k.value <= 0);
  return v.value <= 0;
}

export function projectDuration(p: Project): Micros {
  const comp = p.compositions[p.rootCompositionId];
  return comp ? compositionDuration(comp) : 0;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
