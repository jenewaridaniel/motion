import { describe, expect, it } from "vitest";
import {
  PeakBuilder,
  peakBetween,
  quantizeThumbTime,
  thumbnailSlots,
} from "./clip-visuals.ts";
import { sourceTimeAt } from "./model.ts";
import { sec } from "./time.ts";

describe("waveform peaks", () => {
  it("keeps the loudest sample of each bucket, across channels", () => {
    const b = new PeakBuilder(sec(1), 4); // 4 buckets of 0.25 s
    const left = new Float32Array(8); // 8 samples at 8 Hz = 1 s
    const right = new Float32Array(8);
    left[0] = 0.2; // bucket 0
    right[1] = -0.9; // bucket 0, louder, negative
    left[3] = 0.5; // bucket 1
    right[7] = 0.1; // bucket 3
    b.add([left, right], 8, 0);
    expect([...b.result()].map((v) => +v.toFixed(2))).toEqual([
      0.9, 0.5, 0, 0.1,
    ]);
  });

  it("accepts audio in several chunks, starting anywhere", () => {
    const b = new PeakBuilder(sec(2), 2);
    b.add([new Float32Array([0.3, 0.3])], 2, 0); // 0 to 1 s
    b.add([new Float32Array([0.8, 0.1])], 2, 1); // 1 to 2 s
    expect([...b.result()].map((v) => +v.toFixed(2))).toEqual([
      0.3, 0.3, 0.8, 0.1,
    ]);
  });

  it("ignores samples outside the duration instead of growing", () => {
    const b = new PeakBuilder(sec(1), 2);
    b.add([new Float32Array([1, 1, 1, 1])], 2, 0); // 2 s of audio for a 1 s file
    expect(b.result()).toHaveLength(2);
  });

  it("finds the loudest point in a time range", () => {
    const peaks = new Float32Array([0.1, 0.7, 0.2, 0.4]); // 4 per second
    expect(peakBetween(peaks, 4, 0, 0.25)).toBeCloseTo(0.1);
    expect(peakBetween(peaks, 4, 0.2, 0.6)).toBeCloseTo(0.7);
    expect(peakBetween(peaks, 4, 0.5, 1)).toBeCloseTo(0.4);
    // A range thinner than one bucket still reads that bucket.
    expect(peakBetween(peaks, 4, 0.3, 0.31)).toBeCloseTo(0.7);
    // Outside the audio: silence.
    expect(peakBetween(peaks, 4, 2, 3)).toBe(0);
  });
});

describe("thumbnail slots", () => {
  it("lines slots up with the clip start, and only returns those in the tile", () => {
    // 100 px slots, tile covers 250 to 450 px of the clip, 50 px per second.
    const slots = thumbnailSlots({
      tileStart: 250,
      tileWidth: 200,
      slotWidth: 100,
      pxPerSec: 50,
    });
    expect(slots.map((s) => s.x)).toEqual([200, 300, 400]);
    // Each slot shows the frame at its left edge: 200 px = 4 s into the clip.
    expect(slots.map((s) => s.local)).toEqual([sec(4), sec(6), sec(8)]);
  });

  it("returns nothing for an empty tile", () => {
    expect(
      thumbnailSlots({
        tileStart: 0,
        tileWidth: 0,
        slotWidth: 100,
        pxPerSec: 50,
      }),
    ).toEqual([]);
  });

  it("rounds times to a grid of at most a quarter slot, for cache hits across zooms", () => {
    // Slots 2.5 s apart: grid of 0.5 s, so a thumbnail is never more than
    // 0.25 s (a tenth of a slot) away from the true frame.
    expect(quantizeThumbTime(sec(4.9), sec(2.5))).toBe(sec(5));
    expect(quantizeThumbTime(sec(3), sec(3.16))).toBe(sec(3));
    for (const t of [0.13, 1.7, 3, 4.26, 7.9]) {
      expect(
        Math.abs(quantizeThumbTime(sec(t), sec(2.5)) - sec(t)),
      ).toBeLessThanOrEqual(sec(0.25));
    }
    // Very close slots never go below one frame at 30 fps.
    const q = quantizeThumbTime(sec(1.004), sec(0.001));
    expect(q % Math.round(1e6 / 32)).toBe(0);
  });
});

describe("sourceTimeAt", () => {
  it("maps clip time to source time with in-point and speed", () => {
    const layer = { kind: "media", inPoint: sec(2), speed: 2 } as const;
    expect(sourceTimeAt(layer as never, sec(1.5))).toBe(sec(5));
  });
});
