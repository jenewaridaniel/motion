/**
 * Transitions between neighbouring clips on the main track.
 *
 * A transition belongs to the cut before a clip (`layer.transition`) and is
 * centred on it: half before the cut, half after. Clips don't move, so the
 * video keeps its length and overlays stay in sync. During the transition
 * the outgoing clip keeps playing past its end and the incoming one starts
 * early, using the footage beyond their trim points (or holding the last /
 * first frame where there is none).
 */
import { type Affine, IDENTITY, multiply, scale, translate } from "./matrix.ts";
import type { Micros } from "./time.ts";

export const TRANSITION_KINDS = [
  "dissolve",
  "dipBlack",
  "dipWhite",
  "slideLeft",
  "slideRight",
  "slideUp",
  "slideDown",
  "wipeLeft",
  "wipeRight",
  "zoom",
  "blur",
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export interface Transition {
  kind: TransitionKind;
  /** Whole length, centred on the cut. */
  duration: Micros;
}

export const DEFAULT_TRANSITION: Micros = 500_000;
export const MIN_TRANSITION: Micros = 100_000;
export const MAX_TRANSITION: Micros = 5_000_000;

/** A colour the picture fades towards (dip to black / white). */
export interface Dip {
  color: [number, number, number];
  /** 0 = untouched, 1 = solid colour. */
  amount: number;
}

/**
 * A straight edge across the canvas. Points `p` (0 to 1 across the canvas,
 * y down) are shown where `dot(p, dir) <= edge`, softened by `feather`.
 */
export interface Wipe {
  dir: [number, number];
  edge: number;
  feather: number;
}

/** How a transition changes one of the two clips at one moment. */
export interface TransitionSide {
  visible: boolean;
  /** Multiplies the clip's opacity. */
  opacity: number;
  /** Applied on top of the clip's own matrix, in canvas pixels. */
  matrix: Affine;
  /** Extra blur, as a share of the canvas' short side (0 to 1). */
  blur: number;
  dip: Dip | null;
  wipe: Wipe | null;
}

const UNCHANGED: TransitionSide = {
  visible: true,
  opacity: 1,
  matrix: IDENTITY,
  blur: 0,
  dip: null,
  wipe: null,
};
const HIDDEN: TransitionSide = { ...UNCHANGED, visible: false };

/** Strongest transition blur, as a share of the short side. */
const BLUR_SHARE = 0.03;
const WIPE_FEATHER = 0.02;

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Scale around the canvas centre. */
function zoomAt(s: number, w: number, h: number): Affine {
  return multiply(
    multiply(translate(w / 2, h / 2), scale(s, s)),
    translate(-w / 2, -h / 2),
  );
}

function wipe(dir: [number, number], e: number): Wipe {
  // Range of dot(p, dir) over the canvas corners, so the edge starts fully
  // off one side and ends fully off the other.
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([x, y]) => (x ?? 0) * dir[0] + (y ?? 0) * dir[1]);
  const lo = Math.min(...corners) - WIPE_FEATHER;
  const hi = Math.max(...corners) + WIPE_FEATHER;
  return { dir, edge: lo + (hi - lo) * e, feather: WIPE_FEATHER };
}

/**
 * What happens to the outgoing (`from`) and incoming (`to`) clip at
 * `progress` (0 at the start of the transition, 1 at the end). The incoming
 * clip is drawn on top.
 */
export function transitionSides(
  kind: TransitionKind,
  progress: number,
  width: number,
  height: number,
): { from: TransitionSide; to: TransitionSide } {
  const p = clamp01(progress);
  const e = smooth(p);
  switch (kind) {
    case "dissolve":
      return { from: UNCHANGED, to: { ...UNCHANGED, opacity: p } };
    case "dipBlack":
    case "dipWhite": {
      const v = kind === "dipBlack" ? 0 : 1;
      const color: [number, number, number] = [v, v, v];
      // First half: the old clip fades to the colour; then the new one fades in.
      return p < 0.5
        ? {
            from: { ...UNCHANGED, dip: { color, amount: p * 2 } },
            to: HIDDEN,
          }
        : {
            from: HIDDEN,
            to: { ...UNCHANGED, dip: { color, amount: (1 - p) * 2 } },
          };
    }
    case "slideLeft":
    case "slideRight":
    case "slideUp":
    case "slideDown": {
      // The new clip pushes the old one off the canvas.
      const [dx, dy] =
        kind === "slideLeft"
          ? [-width, 0]
          : kind === "slideRight"
            ? [width, 0]
            : kind === "slideUp"
              ? [0, -height]
              : [0, height];
      return {
        from: { ...UNCHANGED, matrix: translate(dx * e, dy * e) },
        to: {
          ...UNCHANGED,
          matrix: translate(-dx * (1 - e), -dy * (1 - e)),
        },
      };
    }
    case "wipeLeft":
    case "wipeRight":
      // The new clip is revealed behind an edge moving across the canvas.
      return {
        from: UNCHANGED,
        to: {
          ...UNCHANGED,
          wipe: wipe(kind === "wipeLeft" ? [-1, 0] : [1, 0], e),
        },
      };
    case "zoom":
      // Both keep zooming in; the new clip fades in over the old one.
      return {
        from: { ...UNCHANGED, matrix: zoomAt(1 + 0.5 * e, width, height) },
        to: {
          ...UNCHANGED,
          opacity: p,
          matrix: zoomAt(2 / 3 + e / 3, width, height),
        },
      };
    case "blur":
      return {
        from: { ...UNCHANGED, blur: BLUR_SHARE * e },
        to: { ...UNCHANGED, opacity: p, blur: BLUR_SHARE * (1 - e) },
      };
  }
}

/** Length actually used: never longer than either clip. */
export function transitionLength(
  t: Transition,
  from: { duration: Micros },
  to: { duration: Micros },
): Micros {
  return Math.max(0, Math.min(t.duration, from.duration, to.duration));
}
