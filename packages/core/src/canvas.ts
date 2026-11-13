/**
 * Geometry for working on the canvas directly: which layer is under the
 * pointer, where a layer's corners are, and how a drag moves a layer.
 */
import { layerMatrix, type VisualDraw } from "./evaluate.ts";
import { type Affine, apply, IDENTITY, invert, multiply } from "./matrix.ts";
import { findLayer, type Id, type Layer, type Project } from "./model.ts";
import type { Vec2 } from "./property.ts";
import type { Micros } from "./time.ts";

/** A rectangle in a layer's own space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Point = [number, number];

/** Top-left, top-right, bottom-right, bottom-left, on the canvas. */
export function rectCorners(m: Affine, r: Rect): [Point, Point, Point, Point] {
  return [
    apply(m, r.x, r.y),
    apply(m, r.x + r.width, r.y),
    apply(m, r.x + r.width, r.y + r.height),
    apply(m, r.x, r.y + r.height),
  ];
}

/** The root-level layer a draw belongs to (nested draws select their parent). */
export const rootLayerOf = (key: string): Id => key.split("/")[0] as Id;

/**
 * The topmost layer whose drawn rectangle contains canvas point (x, y).
 * `rects` holds each draw's rectangle in its layer space, by draw key.
 */
export function layerHitTest(
  draws: VisualDraw[],
  rects: Map<string, Rect>,
  x: number,
  y: number,
): Id | null {
  for (let i = draws.length - 1; i >= 0; i--) {
    const d = draws[i] as VisualDraw;
    const r = rects.get(d.key);
    const inv = r && invert(d.matrix);
    if (!r || !inv) continue;
    const [lx, ly] = apply(inv, x, y);
    if (lx >= r.x && lx <= r.x + r.width && ly >= r.y && ly <= r.y + r.height) {
      return rootLayerOf(d.key);
    }
  }
  return null;
}

/**
 * Matrix from the space a layer's position lives in (its parent's space,
 * or the canvas) to the canvas, at composition time `t`.
 */
export function parentMatrixAt(p: Project, layerId: Id, t: Micros): Affine {
  const loc = findLayer(p, layerId);
  if (!loc) return IDENTITY;
  const byId = new Map<Id, Layer>();
  for (const track of loc.comp.tracks) {
    for (const l of track.layers) byId.set(l.id, l);
  }
  let m: Affine = IDENTITY;
  const seen = new Set<Id>([layerId]);
  let parent = loc.layer.parentId ? byId.get(loc.layer.parentId) : undefined;
  // Build from the nearest parent outwards: canvas = p_n ... p_1 · position.
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    m = multiply(layerMatrix(parent, t - parent.start), m);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return m;
}

/**
 * The position a layer should have after dragging (dx, dy) canvas pixels
 * from `start`. Accounts for a parent's scale and rotation.
 */
export function dragPosition(
  p: Project,
  layerId: Id,
  t: Micros,
  start: Vec2,
  dx: number,
  dy: number,
): Vec2 {
  const inv = invert(parentMatrixAt(p, layerId, t));
  if (!inv) return start;
  // Directions only: drop the translation part.
  const vx = inv[0] * dx + inv[2] * dy;
  const vy = inv[1] * dx + inv[3] * dy;
  return [start[0] + vx, start[1] + vy];
}

/**
 * Uniform scale from dragging a corner handle: the layer grows or shrinks by
 * how much farther the pointer is from the layer's centre than when the drag
 * started. Never flips or collapses (at least 1% of the starting size).
 */
export function scaleFromHandle(
  center: Point,
  start: Point,
  now: Point,
  startScale: Vec2,
): Vec2 {
  const d0 = Math.hypot(start[0] - center[0], start[1] - center[1]);
  if (d0 < 1e-6) return startScale;
  const d1 = Math.hypot(now[0] - center[0], now[1] - center[1]);
  const k = Math.max(0.01, d1 / d0);
  return [startScale[0] * k, startScale[1] * k];
}

/** Snap to the nearest 45° when within this many degrees. */
const ROTATE_SNAP = 4;

/**
 * How many degrees (clockwise, like the rotation property) the pointer
 * turned around `center` between two positions, the short way round. Add up
 * the steps of a drag to follow the pointer through full turns.
 */
export function angleStep(center: Point, from: Point, to: Point): number {
  const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const a1 = Math.atan2(to[1] - center[1], to[0] - center[0]);
  const d = ((a1 - a0) * 180) / Math.PI;
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** Snap a rotation to the nearest 45° when it's within a few degrees. */
export function snapRotation(degrees: number): number {
  const nearest = Math.round(degrees / 45) * 45;
  return Math.abs(degrees - nearest) <= ROTATE_SNAP ? nearest : degrees;
}
