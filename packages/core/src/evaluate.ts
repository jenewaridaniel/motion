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
import { type Property, valueAt } from "./property.ts";
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
  | { kind: "text"; text: string; style: TextStyle; reveal?: number };

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
  // its end. Its settings hold their first / last values there; only the
  // footage keeps moving (see `sourceTime` below).
  const raw = t - layer.start;
  const local = Math.min(Math.max(raw, 0), Math.max(0, layer.duration - 1));
  const opacity =
    ctx.parentOpacity *
    clamp01(valueAt(layer.opacity, local)) *
    (side?.opacity ?? 1);
  if (opacity <= 0) return;
  const own = worldMatrix(layer, layer.start + local, ctx.byId);
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
      Math.max(0, sourceTimeAt(layer, raw)),
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
    const anim = textAnimationAt(layer, local);
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
  const asset = p.assets[layer.assetId];
  if (!asset || asset.kind === "audio" || !asset.hasVideo) return;
  const { width, height } = asset;
  // Footage beyond the trim points is used when a transition needs it;
  // where the file runs out, the first / last frame holds.
  const sourceTime = Math.min(
    Math.max(0, sourceTimeAt(layer, raw)),
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

export interface AudioSegment {
  layerId: Id;
  assetId: Id;
  /** Root-composition time range. */
  start: Micros;
  duration: Micros;
  /** Source time at `start`. */
  sourceIn: Micros;
  speed: number;
  /** Volume property, sampled with time relative to `start`. */
  volume: Property<number>;
}

/**
 * Every piece of audio in the root composition.
 * TODO(nesting): include audio from nested compositions.
 */
export function collectAudioSegments(
  p: Project,
  compId: Id = p.rootCompositionId,
): AudioSegment[] {
  const comp = p.compositions[compId];
  if (!comp) return [];
  const out: AudioSegment[] = [];
  for (const track of comp.tracks) {
    if (track.muted) continue;
    for (const layer of track.layers) {
      if (layer.kind !== "media") continue;
      const asset = p.assets[layer.assetId];
      if (!asset?.hasAudio) continue;
      if (isSilent(layer)) continue;
      out.push({
        layerId: layer.id,
        assetId: asset.id,
        start: layer.start,
        duration: layer.duration,
        sourceIn: layer.inPoint,
        speed: layer.speed,
        volume: layer.volume,
      });
    }
  }
  return out;
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
