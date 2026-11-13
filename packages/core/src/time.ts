/** Integer microseconds. The same unit WebCodecs uses, so timestamps never drift. */
export type Micros = number;

export const US = 1_000_000;

export const sec = (seconds: number): Micros => Math.round(seconds * US);
export const toSec = (t: Micros): number => t / US;

/** Index of the frame shown at `t`. */
export const frameIndex = (t: Micros, fps: number): number =>
  Math.floor((t * fps) / US + 1e-6);

/** Start time of frame `i`. */
export const frameTime = (i: number, fps: number): Micros =>
  Math.round((i * US) / fps);

/** Snap `t` to the nearest frame boundary. */
export const snapToFrame = (t: Micros, fps: number): Micros =>
  frameTime(Math.round((t * fps) / US), fps);

/** `MM:SS:FF`, or `H:MM:SS:FF` past an hour. */
export function formatTimecode(t: Micros, fps: number): string {
  const safe = Math.max(0, t);
  const totalFrames = frameIndex(safe, fps);
  const fpsInt = Math.round(fps);
  const frames = totalFrames % fpsInt;
  const totalSeconds = Math.floor(totalFrames / fpsInt);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  const core = `${pad(m)}:${pad(s)}:${pad(frames)}`;
  return h > 0 ? `${h}:${core}` : core;
}

/** `0:04.2`-style label for rulers and durations. */
export function formatSeconds(t: Micros): string {
  const s = Math.max(0, t) / US;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
}
