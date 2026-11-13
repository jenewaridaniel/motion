/**
 * Per-layer effects and masks. Every number is an animatable property;
 * `resolveEffects` turns them into plain values for the renderer.
 */
import { type Property, prop, type Vec2, valueAt } from "./property.ts";
import { type Micros, US } from "./time.ts";

export interface Effects {
  /** 0 to 100. */
  blur?: { amount: Property<number> };
  /** Green screen. Percentages 0 to 100. */
  chromaKey?: {
    color: string;
    similarity: Property<number>;
    smoothness: Property<number>;
    spill: Property<number>;
  };
  glitch?: { amount: Property<number> };
  /** `speed` is shakes per second. */
  shake?: { amount: Property<number>; speed: number };
  vignette?: { amount: Property<number>; size: Property<number> };
}

export type EffectKind = keyof Effects;
export const EFFECT_KINDS: EffectKind[] = [
  "blur",
  "chromaKey",
  "glitch",
  "shake",
  "vignette",
];

export const MASK_SHAPES = ["rect", "ellipse", "linear"] as const;
export type MaskShape = (typeof MASK_SHAPES)[number];

/** Centre and size are fractions of the layer's image (0 to 1). */
export interface Mask {
  shape: MaskShape;
  center: Property<Vec2>;
  size: Property<Vec2>;
  /** Degrees. */
  rotation: Property<number>;
  /** Soft edge, 0 to 1. */
  feather: Property<number>;
  invert: boolean;
}

export function defaultEffect<K extends EffectKind>(
  kind: K,
): NonNullable<Effects[K]> {
  const effects: Required<Effects> = {
    blur: { amount: prop(30) },
    chromaKey: {
      color: "#00ff00",
      similarity: prop(40),
      smoothness: prop(10),
      spill: prop(50),
    },
    glitch: { amount: prop(50) },
    shake: { amount: prop(40), speed: 8 },
    vignette: { amount: prop(50), size: prop(60) },
  };
  return effects[kind] as NonNullable<Effects[K]>;
}

export function defaultMask(shape: MaskShape): Mask {
  return {
    shape,
    center: prop<Vec2>([0.5, 0.5]),
    size: prop<Vec2>(shape === "linear" ? [1, 1] : [0.5, 0.5]),
    rotation: prop(0),
    feather: prop(0.05),
    invert: false,
  };
}

/** What the renderer needs from effects and the mask, at one moment. */
export interface ResolvedEffects {
  /** Gaussian strength (sigma) in composition pixels; 0 = none. */
  blur: number;
  key: {
    color: [number, number, number];
    similarity: number;
    smoothness: number;
    spill: number;
  } | null;
  mask: {
    shape: MaskShape;
    center: Vec2;
    size: Vec2;
    rotation: number;
    feather: number;
    invert: boolean;
  } | null;
  /** `seed` changes 12 times a second, so the pattern jumps like a real glitch. */
  glitch: { amount: number; seed: number } | null;
  vignette: { amount: number; size: number } | null;
}

const pct = (p: Property<number>, t: Micros) =>
  Math.min(100, Math.max(0, valueAt(p, t))) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m?.[1] ? Number.parseInt(m[1], 16) : 0x00ff00;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Strongest blur, as a share of the canvas' short side. */
const MAX_BLUR = 0.03;
/** Strongest shake movement, as a share of the canvas' short side. */
const MAX_SHAKE = 0.03;

export function resolveEffects(
  layer: { effects?: Effects; mask?: Mask },
  local: Micros,
  shortSide: number,
): ResolvedEffects {
  const e = layer.effects;
  const m = layer.mask;
  return {
    blur: e?.blur ? pct(e.blur.amount, local) * MAX_BLUR * shortSide : 0,
    key: e?.chromaKey
      ? {
          color: hexToRgb(e.chromaKey.color),
          similarity: pct(e.chromaKey.similarity, local),
          smoothness: pct(e.chromaKey.smoothness, local),
          spill: pct(e.chromaKey.spill, local),
        }
      : null,
    mask: m
      ? {
          shape: m.shape,
          center: valueAt(m.center, local),
          size: valueAt(m.size, local),
          rotation: valueAt(m.rotation, local),
          feather: clamp01(valueAt(m.feather, local)),
          invert: m.invert,
        }
      : null,
    glitch: e?.glitch
      ? {
          amount: pct(e.glitch.amount, local),
          seed: Math.floor((local / US) * 12),
        }
      : null,
    vignette: e?.vignette
      ? {
          amount: pct(e.vignette.amount, local),
          size: pct(e.vignette.size, local),
        }
      : null,
  };
}

/**
 * Camera shake at time `t`: a smooth, repeatable wobble (sums of sines at
 * unrelated frequencies), so preview and export match. At most 3% of the
 * short side, plus a slight rotation.
 */
export function shakeOffset(
  amount: number,
  speed: number,
  t: Micros,
  shortSide: number,
): { dx: number; dy: number; rotation: number } {
  if (amount <= 0) return { dx: 0, dy: 0, rotation: 0 };
  const a = Math.min(100, amount) / 100;
  const w = 2 * Math.PI * Math.max(0.1, speed) * (t / US);
  const wave = (k: number) =>
    (Math.sin(w * (1 + 0.37 * k) + k) +
      0.6 * Math.sin(w * 1.37 * (1 + 0.21 * k) + 1.3 * k) +
      0.3 * Math.sin(w * 2.11 * (1 + 0.13 * k) + 2.1 * k)) /
    1.9;
  // Divide by √2 so the combined (x, y) distance stays within the maximum.
  const max = (a * MAX_SHAKE * shortSide) / Math.SQRT2;
  return { dx: max * wave(0), dy: max * wave(1), rotation: a * 1.5 * wave(2) };
}
