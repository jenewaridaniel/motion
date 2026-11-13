import type { Micros } from "./time.ts";

export type Vec2 = readonly [number, number];
export type Animatable = number | Vec2;

export type Easing =
  | { type: "linear" }
  | { type: "hold" }
  /** CSS-style cubic-bezier. x1 and x2 are clamped to [0, 1]. */
  | { type: "bezier"; x1: number; y1: number; x2: number; y2: number };

export interface Keyframe<T extends Animatable> {
  /** Relative to the owning layer's start. */
  time: Micros;
  value: T;
  /** Easing from this keyframe to the next one. */
  easing: Easing;
}

/**
 * Any value that can animate. With no keyframes, `value` is used.
 * With keyframes, `value` is ignored and kept only as the last static value.
 */
export interface Property<T extends Animatable> {
  value: T;
  keyframes?: Keyframe<T>[];
}

export const EASE = {
  linear: { type: "linear" },
  hold: { type: "hold" },
  easeInOut: { type: "bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  easeOut: { type: "bezier", x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
  easeIn: { type: "bezier", x1: 0.7, y1: 0, x2: 0.84, y2: 0 },
} as const satisfies Record<string, Easing>;

export const prop = <T extends Animatable>(value: T): Property<T> => ({
  value,
});

export const isAnimated = (p: Property<Animatable>): boolean =>
  (p.keyframes?.length ?? 0) > 0;

/** Solve a CSS cubic-bezier for progress `x` in [0, 1]. */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx1 = Math.min(1, Math.max(0, x1));
  const cx2 = Math.min(1, Math.max(0, x2));
  const bx = (t: number) =>
    3 * (1 - t) * (1 - t) * t * cx1 + 3 * (1 - t) * t * t * cx2 + t * t * t;
  const by = (t: number) =>
    3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  const dbx = (t: number) =>
    3 * (1 - t) * (1 - t) * cx1 +
    6 * (1 - t) * t * (cx2 - cx1) +
    3 * t * t * (1 - cx2);
  // Newton first, then bisection if the slope is too flat.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = bx(t) - x;
    if (Math.abs(err) < 1e-7) return by(t);
    const d = dbx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 40; i++) {
    const v = bx(t);
    if (Math.abs(v - x) < 1e-7) break;
    if (v < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

export function ease(e: Easing, x: number): number {
  switch (e.type) {
    case "linear":
      return x;
    case "hold":
      return 0;
    case "bezier":
      return cubicBezier(e.x1, e.y1, e.x2, e.y2, x);
  }
}

function lerp<T extends Animatable>(a: T, b: T, k: number): T {
  if (typeof a === "number") return (a + ((b as number) - a) * k) as T;
  const av = a as Vec2;
  const bv = b as Vec2;
  return [
    av[0] + (bv[0] - av[0]) * k,
    av[1] + (bv[1] - av[1]) * k,
  ] as const as T;
}

/** Value of `p` at `time` (relative to the layer start). */
export function valueAt<T extends Animatable>(p: Property<T>, time: Micros): T {
  const kfs = p.keyframes;
  if (!kfs || kfs.length === 0) return p.value;
  const first = kfs[0] as Keyframe<T>;
  if (time <= first.time) return first.value;
  const last = kfs[kfs.length - 1] as Keyframe<T>;
  if (time >= last.time) return last.value;
  // Keyframe lists are short; a linear scan beats the bookkeeping of a search.
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i] as Keyframe<T>;
    const b = kfs[i + 1] as Keyframe<T>;
    if (time >= a.time && time < b.time) {
      const span = b.time - a.time;
      const k = span <= 0 ? 1 : ease(a.easing, (time - a.time) / span);
      return lerp(a.value, b.value, k);
    }
  }
  return last.value;
}

/** Keyframes within half a frame of `time` count as "at" it. */
export function keyframeIndexAt(
  p: Property<Animatable>,
  time: Micros,
  tolerance: Micros,
): number {
  return (p.keyframes ?? []).findIndex(
    (k) => Math.abs(k.time - time) <= tolerance,
  );
}

/** Mutates `p`: adds or replaces a keyframe and keeps the list sorted. */
export function setKeyframe<T extends Animatable>(
  p: Property<T>,
  time: Micros,
  value: T,
  tolerance: Micros,
  easing: Easing = EASE.easeInOut,
): void {
  if (!p.keyframes) p.keyframes = [];
  const kfs = p.keyframes;
  const i = keyframeIndexAt(p, time, tolerance);
  if (i >= 0) {
    (kfs[i] as Keyframe<T>).value = value;
  } else {
    kfs.push({ time, value, easing });
    kfs.sort((a, b) => a.time - b.time);
  }
  p.value = value;
}

/** Mutates `p`. Removing the last keyframe freezes the value at `time`. */
export function removeKeyframe<T extends Animatable>(
  p: Property<T>,
  time: Micros,
  tolerance: Micros,
): void {
  const i = keyframeIndexAt(p, time, tolerance);
  if (i < 0 || !p.keyframes) return;
  const current = valueAt(p, time);
  p.keyframes.splice(i, 1);
  if (p.keyframes.length === 0) {
    delete p.keyframes;
    p.value = current;
  }
}

/** Mutates `p`: sets the value at `time`, keyframing it when `p` is animated. */
export function setValueAt<T extends Animatable>(
  p: Property<T>,
  time: Micros,
  value: T,
  tolerance: Micros,
): void {
  if (p.keyframes && p.keyframes.length > 0) {
    setKeyframe(p, time, value, tolerance);
  } else {
    p.value = value;
  }
}

/** Mutates `p`: shifts every keyframe by `delta`. */
export function shiftKeyframes(p: Property<Animatable>, delta: Micros): void {
  if (!p.keyframes) return;
  for (const k of p.keyframes) k.time += delta;
}
