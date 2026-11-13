/**
 * Ready-made text animations, as numbers the renderer can apply on top of
 * the layer's own transform. Pure: depends only on the layer and the time.
 */
import type { TextLayer } from "./model.ts";
import type { Micros } from "./time.ts";

export interface TextAnimationState {
  /** Multiplies the layer's opacity. */
  opacity: number;
  /** Multiplies the layer's scale, around its anchor. */
  scale: number;
  /** Offset in the layer's own pixels (so it follows rotation and scale). */
  dx: number;
  dy: number;
  /** Added rotation, in degrees. */
  rotation: number;
  /** Share of the letters shown, 0 to 1 (typewriter). */
  reveal: number;
}

const NONE: TextAnimationState = {
  opacity: 1,
  scale: 1,
  dx: 0,
  dy: 0,
  rotation: 0,
  reveal: 1,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
/** Overshoots a little before settling: the "pop". */
const easeOutBack = (x: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

/** Animation state of `layer` at `local` time (relative to the layer start). */
export function textAnimationAt(
  layer: TextLayer,
  local: Micros,
): TextAnimationState {
  const a = layer.animation;
  if (!a || (!a.in && !a.out && !a.loop)) return { ...NONE };
  const s = { ...NONE };
  // Distance for slides: most of a line, so it reads as a move, not a jitter.
  const travel = layer.style.size * 0.8;

  // If "in" and "out" don't both fit, share the clip between them.
  const inDur = a.in?.duration ?? 0;
  const outDur = a.out?.duration ?? 0;
  const fit =
    inDur + outDur > layer.duration ? layer.duration / (inDur + outDur) : 1;

  if (a.in && inDur > 0) {
    const p = clamp01(local / (inDur * fit));
    const e = easeOutCubic(p);
    switch (a.in.kind) {
      case "fade":
        s.opacity *= e;
        break;
      case "pop":
        s.scale *= 0.5 + 0.5 * easeOutBack(p);
        s.opacity *= clamp01(p * 3);
        break;
      case "slide-up":
        s.dy += (1 - e) * travel;
        s.opacity *= e;
        break;
      case "slide-down":
        s.dy -= (1 - e) * travel;
        s.opacity *= e;
        break;
      case "typewriter":
        s.reveal = p;
        break;
    }
  }

  if (a.out && outDur > 0) {
    // 1 while fully shown, falling to 0 at the clip's end.
    const p = clamp01((layer.duration - local) / (outDur * fit));
    const e = easeOutCubic(p);
    switch (a.out.kind) {
      case "fade":
        s.opacity *= e;
        break;
      case "pop":
        s.scale *= 0.5 + 0.5 * e;
        s.opacity *= clamp01(p * 3);
        break;
      case "slide-up":
        s.dy -= (1 - e) * travel;
        s.opacity *= e;
        break;
      case "slide-down":
        s.dy += (1 - e) * travel;
        s.opacity *= e;
        break;
    }
  }

  if (a.loop && a.loop.period > 0) {
    const wave = Math.sin((2 * Math.PI * local) / a.loop.period);
    switch (a.loop.kind) {
      case "pulse":
        s.scale *= 1 + 0.06 * wave;
        break;
      case "float":
        s.dy += wave * layer.style.size * 0.12;
        break;
      case "wiggle":
        s.rotation += 4 * wave;
        break;
    }
  }
  return s;
}
