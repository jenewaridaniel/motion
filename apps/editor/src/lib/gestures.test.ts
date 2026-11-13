import { describe, expect, it } from "vitest";
import {
  isLongPress,
  momentumStep,
  pinchZoom,
  scrollToKeep,
} from "./gestures.ts";

describe("pinch zoom", () => {
  it("scales the zoom by how far the fingers moved apart", () => {
    expect(pinchZoom(60, 100, 200, 8, 600)).toBe(120);
    expect(pinchZoom(60, 200, 100, 8, 600)).toBe(30);
  });

  it("stays within the zoom limits", () => {
    expect(pinchZoom(500, 100, 400, 8, 600)).toBe(600);
    expect(pinchZoom(10, 400, 100, 8, 600)).toBe(8);
  });

  it("ignores a degenerate start (fingers on the same spot)", () => {
    expect(pinchZoom(60, 0, 100, 8, 600)).toBe(60);
  });
});

describe("keeping the point under the fingers in place", () => {
  it("scrolls so the same time stays under the same screen x", () => {
    // 5 s was under x = 100 at 50 px/s; at 100 px/s it's at 500 px in the lanes.
    expect(scrollToKeep(5, 100, 100)).toBe(400);
  });

  it("never scrolls before the start", () => {
    expect(scrollToKeep(0.5, 300, 100)).toBe(0);
  });
});

describe("momentum", () => {
  it("slows down each frame and stops when slow enough", () => {
    let v = 2; // px per ms
    let travelled = 0;
    let frames = 0;
    for (;;) {
      const step = momentumStep(v, 16);
      if (!step) break;
      travelled += step.dx;
      v = step.v;
      frames++;
      expect(frames).toBeLessThan(500);
    }
    expect(travelled).toBeGreaterThan(100);
    expect(Math.abs(v)).toBeLessThan(0.05);
  });

  it("does nothing for a slow release", () => {
    expect(momentumStep(0.01, 16)).toBeNull();
  });
});

describe("long press", () => {
  it("needs the finger to stay still long enough", () => {
    expect(isLongPress(400, 3)).toBe(true);
    expect(isLongPress(200, 3)).toBe(false);
    expect(isLongPress(400, 20)).toBe(false);
  });
});
