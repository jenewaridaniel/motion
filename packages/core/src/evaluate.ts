import {
  type Affine,
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
  type TextStyle,
} from "./model.ts";
import { type Property, valueAt } from "./property.ts";
import { textAnimationAt } from "./text-animation.ts";
import type { Micros } from "./time.ts";

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

const isActive = (l: Layer, t: Micros) => t >= l.start && t < layerEnd(l);

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
  const byId = layersById(comp);
  // tracks[0] is on top, so draw from the last track up.
  for (let i = comp.tracks.length - 1; i >= 0; i--) {
    const track = comp.tracks[i];
    if (!track || track.hidden || track.kind !== "visual") continue;
    for (const layer of track.layers) {
      if (!isActive(layer, t)) continue;
      const local = t - layer.start;
      const opacity = parentOpacity * clamp01(valueAt(layer.opacity, local));
      if (opacity <= 0) continue;
      const matrix = multiply(parentMatrix, worldMatrix(layer, t, byId));
      const key = keyPrefix + layer.id;
      if (layer.kind === "composition") {
        // TODO(render-to-texture): clip nested content to the nested canvas.
        drawComposition(
          p,
          layer.compositionId,
          layer.inPoint + Math.round(local * layer.speed),
          matrix,
          opacity,
          `${key}/`,
          out,
          depth + 1,
        );
        continue;
      }
      if (layer.kind === "text") {
        if (layer.text.trim() === "") continue;
        const anim = textAnimationAt(layer, local);
        const shown = opacity * anim.opacity;
        if (shown <= 0) continue;
        // Animation scales and rotates around the anchor, and offsets in the
        // layer's own space so a slide follows the text's rotation.
        const [ax, ay] = valueAt(layer.transform.anchor, local);
        const extra = multiply(
          multiply(
            multiply(
              translate(ax + anim.dx, ay + anim.dy),
              rotate(anim.rotation),
            ),
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
        });
        continue;
      }
      const asset = p.assets[layer.assetId];
      if (!asset || asset.kind === "audio" || !asset.hasVideo) continue;
      const { width, height } = asset;
      const source: DrawSource =
        asset.kind === "video"
          ? {
              kind: "video",
              assetId: asset.id,
              time: Math.min(
                layer.inPoint + Math.round(local * layer.speed),
                Math.max(0, asset.duration - 1),
              ),
              width,
              height,
            }
          : { kind: "image", assetId: asset.id, width, height };
      out.push({ key, layerId: layer.id, source, matrix, opacity });
    }
  }
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
