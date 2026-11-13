/**
 * Math for drawing clips on the timeline: waveform peaks and thumbnail
 * slots. Pure, so the drawing code only has to paint.
 */
import { type Micros, US } from "./time.ts";

/** Waveform resolution. 100 per second is finer than any useful zoom. */
export const PEAKS_PER_SECOND = 100;

/**
 * Builds a waveform from audio chunks as they are decoded, so a long file
 * never has to be in memory at once. Each bucket keeps its loudest sample.
 */
export class PeakBuilder {
  private peaks: Float32Array;

  constructor(
    duration: Micros,
    readonly peaksPerSecond = PEAKS_PER_SECOND,
  ) {
    this.peaks = new Float32Array(
      Math.max(1, Math.ceil((duration / US) * peaksPerSecond)),
    );
  }

  /** Add planar samples that start at `startSec` in the file. */
  add(channels: Float32Array[], sampleRate: number, startSec: number): void {
    const n = channels[0]?.length ?? 0;
    const per = sampleRate / this.peaksPerSecond; // samples per bucket
    const first = startSec * this.peaksPerSecond;
    const last = this.peaks.length;
    for (let i = 0; i < n; ) {
      const bucket = Math.floor(first + i / per);
      if (bucket >= last) break;
      // Samples up to the start of the next bucket.
      const end = Math.min(n, Math.ceil((bucket + 1 - first) * per));
      let max = bucket >= 0 ? (this.peaks[bucket] as number) : 0;
      for (const ch of channels) {
        for (let j = i; j < end; j++) {
          const v = Math.abs(ch[j] as number);
          if (v > max) max = v;
        }
      }
      if (bucket >= 0) this.peaks[bucket] = max;
      i = Math.max(end, i + 1);
    }
  }

  result(): Float32Array {
    return this.peaks;
  }
}

/** Loudest peak between two source times (seconds). At least one bucket. */
export function peakBetween(
  peaks: Float32Array,
  peaksPerSecond: number,
  fromSec: number,
  toSec: number,
): number {
  const a = Math.max(0, Math.floor(fromSec * peaksPerSecond));
  const b = Math.min(
    peaks.length,
    Math.max(a + 1, Math.ceil(toSec * peaksPerSecond)),
  );
  let max = 0;
  for (let i = a; i < b; i++) {
    const v = peaks[i] as number;
    if (v > max) max = v;
  }
  return max;
}

export interface ThumbnailSlot {
  /** Left edge, in pixels from the clip's start. */
  x: number;
  /** Clip time the slot shows (its left edge). */
  local: Micros;
}

/**
 * Thumbnail slots that overlap one tile of a clip. Slots are lined up with
 * the clip's start so they don't shift when the view scrolls.
 */
export function thumbnailSlots(opts: {
  tileStart: number;
  tileWidth: number;
  slotWidth: number;
  pxPerSec: number;
}): ThumbnailSlot[] {
  const { tileStart, tileWidth, slotWidth, pxPerSec } = opts;
  if (tileWidth <= 0 || slotWidth <= 0 || pxPerSec <= 0) return [];
  const out: ThumbnailSlot[] = [];
  const first = Math.floor(tileStart / slotWidth);
  for (let k = first; k * slotWidth < tileStart + tileWidth; k++) {
    const x = k * slotWidth;
    out.push({ x, local: Math.round((x / pxPerSec) * US) });
  }
  return out;
}

/** Finest thumbnail grid: 1/32 s, about one frame at 30 fps. */
const MIN_STEP = US / 32;

/**
 * Round a source time to a power-of-two-seconds grid of at most a quarter of
 * the spacing between slots: close to the true frame, while zooming a little
 * still reuses the same thumbnails.
 */
export function quantizeThumbTime(t: Micros, slotSpacing: Micros): Micros {
  const step = Math.max(
    MIN_STEP,
    US * 2 ** Math.floor(Math.log2(Math.max(slotSpacing / 4, 1) / US)),
  );
  return Math.round(t / step) * step;
}
