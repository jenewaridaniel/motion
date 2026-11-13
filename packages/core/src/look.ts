/**
 * How a layer looks, beyond where it is: colour adjustments (each one can be
 * animated) and how it blends with what's under it.
 */
import {
  type Effects,
  type Mask,
  type ResolvedEffects,
  resolveEffects,
} from "./effects.ts";
import type { LayerLut } from "./lut.ts";
import { type Property, valueAt } from "./property.ts";
import type { Micros } from "./time.ts";
import type { Dip, Wipe } from "./transitions.ts";

export const ADJUST_KEYS = [
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "vibrance",
  "temperature",
  "tint",
  "highlights",
  "shadows",
  "fade",
] as const;

export type AdjustKey = (typeof ADJUST_KEYS)[number];

/** Only the adjustments that were touched are stored; the rest are 0. */
export type Adjustments = Partial<Record<AdjustKey, Property<number>>>;

/** Slider ranges. Exposure is in stops; the rest are -1 to 1 (fade 0 to 1). */
export const ADJUST_RANGE: Record<AdjustKey, { min: number; max: number }> = {
  exposure: { min: -3, max: 3 },
  brightness: { min: -1, max: 1 },
  contrast: { min: -1, max: 1 },
  saturation: { min: -1, max: 1 },
  vibrance: { min: -1, max: 1 },
  temperature: { min: -1, max: 1 },
  tint: { min: -1, max: 1 },
  highlights: { min: -1, max: 1 },
  shadows: { min: -1, max: 1 },
  fade: { min: 0, max: 1 },
};

/**
 * Blend modes the GPU does directly, so edges stay anti-aliased. Overlay and
 * soft light need a slower path and aren't offered yet.
 */
export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "add",
  "lighten",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** Everything the renderer needs about a layer's look at one moment. */
export interface DrawStyle extends ResolvedEffects {
  blend: BlendMode;
  /** Null when every adjustment is 0, so the renderer can skip colour work. */
  adjust: Record<AdjustKey, number> | null;
  /** Project LUT to apply after the adjustments, and how strongly (0 to 1). */
  lut: { id: string; intensity: number } | null;
  /** Set by transitions only: fade towards a colour. */
  dip: Dip | null;
  /** Set by transitions only: show one side of an edge across the canvas. */
  wipe: Wipe | null;
}

export function resolveStyle(
  layer: {
    adjust?: Adjustments;
    blend?: BlendMode;
    effects?: Effects;
    mask?: Mask;
    lut?: LayerLut;
  },
  local: Micros,
  shortSide: number,
): DrawStyle {
  return {
    blend: layer.blend ?? "normal",
    adjust: resolveAdjust(layer.adjust, local),
    lut: layer.lut
      ? {
          id: layer.lut.id,
          intensity: Math.min(
            1,
            Math.max(0, valueAt(layer.lut.intensity, local)),
          ),
        }
      : null,
    dip: null,
    wipe: null,
    ...resolveEffects(layer, local, shortSide),
  };
}

function resolveAdjust(
  adjust: Adjustments | undefined,
  local: Micros,
): Record<AdjustKey, number> | null {
  if (!adjust) return null;
  const out = {} as Record<AdjustKey, number>;
  let any = false;
  for (const k of ADJUST_KEYS) {
    const p = adjust[k];
    const { min, max } = ADJUST_RANGE[k];
    const v = p ? Math.min(max, Math.max(min, valueAt(p, local))) : 0;
    out[k] = v;
    if (v !== 0) any = true;
  }
  return any ? out : null;
}

/** A ready-made set of adjustments ("filter"). */
export interface Look {
  id: string;
  label: string;
  adjust: Partial<Record<AdjustKey, number>>;
}

export const LOOKS: Look[] = [
  { id: "none", label: "Original", adjust: {} },
  {
    id: "vivid",
    label: "Vivid",
    adjust: { contrast: 0.15, saturation: 0.25, vibrance: 0.3 },
  },
  {
    id: "warm",
    label: "Warm",
    adjust: { temperature: 0.45, saturation: 0.1, highlights: -0.1 },
  },
  {
    id: "cool",
    label: "Cool",
    adjust: { temperature: -0.45, tint: 0.05, contrast: 0.05 },
  },
  {
    id: "punch",
    label: "Punch",
    adjust: { contrast: 0.35, saturation: 0.15, shadows: -0.15 },
  },
  {
    id: "film",
    label: "Film",
    adjust: {
      fade: 0.18,
      contrast: -0.1,
      temperature: 0.15,
      saturation: -0.15,
    },
  },
  {
    id: "moody",
    label: "Moody",
    adjust: {
      exposure: -0.3,
      contrast: 0.2,
      saturation: -0.3,
      temperature: -0.15,
    },
  },
  {
    id: "dreamy",
    label: "Dreamy",
    adjust: {
      brightness: 0.1,
      fade: 0.12,
      highlights: 0.2,
      saturation: -0.1,
      tint: 0.08,
    },
  },
  { id: "mono", label: "Mono", adjust: { saturation: -1, contrast: 0.15 } },
  {
    id: "noir",
    label: "Noir",
    adjust: { saturation: -1, contrast: 0.5, shadows: -0.3, exposure: -0.15 },
  },
];
