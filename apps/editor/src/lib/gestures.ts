/**
 * Touch gesture math for the timeline. Pure, so it can be tested without a
 * touch screen.
 */

/** New zoom after a pinch, from the fingers' start and current distance. */
export function pinchZoom(
  startZoom: number,
  startDistance: number,
  distance: number,
  min: number,
  max: number,
): number {
  if (startDistance <= 0) return startZoom;
  return Math.min(max, Math.max(min, (startZoom * distance) / startDistance));
}

/**
 * Scroll position that keeps `seconds` under screen position `x` (measured
 * from the lanes' left edge) at zoom `pxPerSec`.
 */
export function scrollToKeep(
  seconds: number,
  x: number,
  pxPerSec: number,
): number {
  return Math.max(0, seconds * pxPerSec - x);
}

/** Friction per 16 ms frame. Lower stops sooner. */
const FRICTION = 0.95;
const STOP_SPEED = 0.05; // px per ms

/**
 * One frame of momentum scrolling after a swipe. Returns the distance to
 * move and the new speed, or null when it has come to rest.
 */
export function momentumStep(
  speed: number,
  frameMs: number,
): { dx: number; v: number } | null {
  if (Math.abs(speed) < STOP_SPEED) return null;
  const v = speed * FRICTION ** (frameMs / 16);
  return { dx: v * frameMs, v };
}

/** How long and how still a press must be to pick a clip up. */
export const LONG_PRESS_MS = 350;
export const TOUCH_SLOP_PX = 8;

export const isLongPress = (heldMs: number, movedPx: number) =>
  heldMs >= LONG_PRESS_MS && movedPx <= TOUCH_SLOP_PX;
