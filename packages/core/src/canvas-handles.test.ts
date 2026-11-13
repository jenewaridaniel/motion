import { describe, expect, it } from "vitest";
import {
  angleStep,
  handleSizes,
  scaleFromHandle,
  snapRotation,
} from "./canvas.ts";
import { addCaptions } from "./captions.ts";
import {
  addText,
  applyTextLookToTrack,
  setPropertyValue,
  setTextAnimation,
  setTextStyle,
} from "./edit.ts";
import { History } from "./history.ts";
import { createProject, rootComposition, type TextLayer } from "./model.ts";
import { sec } from "./time.ts";

describe("canvas handles", () => {
  it("scale follows the distance from the centre", () => {
    const c: [number, number] = [100, 100];
    expect(scaleFromHandle(c, [150, 150], [200, 200], [1, 0.5])).toEqual([
      2, 1,
    ]);
    expect(scaleFromHandle(c, [150, 150], [125, 125], [2, 2])).toEqual([1, 1]);
    // Moving along the circle keeps the size.
    const s = scaleFromHandle(c, [150, 100], [100, 150], [1, 1]);
    expect(s[0]).toBeCloseTo(1, 9);
    // Never collapses or flips through the centre.
    expect(scaleFromHandle(c, [150, 150], [100, 100], [1, 1])).toEqual([
      0.01, 0.01,
    ]);
  });

  it("rotation adds up small steps, clockwise, through full turns", () => {
    const c: [number, number] = [0, 0];
    // Screen y points down, so right → down is a clockwise quarter turn.
    expect(angleStep(c, [10, 0], [0, 10])).toBeCloseTo(90, 9);
    expect(angleStep(c, [10, 0], [0, -10])).toBeCloseTo(-90, 9);
    // Crossing the ±180° line is a small step, not a jump.
    expect(angleStep(c, [-10, 1], [-10, -1])).toBeCloseTo(11.42, 1);
    // Twelve 30° steps make a full turn.
    let total = 0;
    let prev: [number, number] = [10, 0];
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      const next: [number, number] = [10 * Math.cos(a), 10 * Math.sin(a)];
      total += angleStep(c, prev, next);
      prev = next;
    }
    expect(total).toBeCloseTo(360, 6);
  });

  it("handles are finger-sized on touch, and leave small clips draggable", () => {
    expect(handleSizes(true, 500).target).toBe(44);
    expect(handleSizes(false, 500).target).toBe(24);
    // A 60 px clip: targets shrink to 40% of it so its middle stays free.
    expect(handleSizes(true, 60).target).toBe(24);
    // Never smaller than 16 px.
    expect(handleSizes(true, 10).target).toBe(16);
    // The rotate handle is always clear of the corner targets.
    for (const touch of [true, false]) {
      for (const side of [10, 60, 500]) {
        const h = handleSizes(touch, side);
        expect(h.rotateOffset).toBeGreaterThan(h.target);
      }
    }
  });

  it("snaps to 45° steps only when close", () => {
    expect(snapRotation(87)).toBe(90);
    expect(snapRotation(-46.5)).toBe(-45);
    expect(snapRotation(80)).toBe(80);
  });
});

describe("restyle all captions", () => {
  function setup() {
    const h = new History();
    const p = h.apply(createProject(), (d) => {
      addCaptions(d, [
        { start: 0, end: sec(1), text: "One" },
        { start: sec(1), end: sec(2), text: "Two" },
        { start: sec(2), end: sec(3), text: "Three" },
      ]);
      // Overlaps the captions, so it goes on a track of its own.
      addText(d, sec(0.5), { text: "Title" });
    });
    const texts = () =>
      rootComposition(p).tracks.flatMap((t) => t.layers) as TextLayer[];
    return { h, p, texts };
  }
  const all = (p: ReturnType<typeof setup>["p"]) =>
    rootComposition(p).tracks.flatMap((t) => t.layers) as TextLayer[];

  it("copies style, animation and placement to the clips on the same track", () => {
    const { h, p: p0 } = setup();
    const one = all(p0).find((l) => l.text === "One")!;
    let p = h.apply(p0, (d) => {
      setTextStyle(d, one.id, { color: "#ffcc00", size: 90, weight: 900 });
      setTextAnimation(d, one.id, { in: { kind: "pop", duration: sec(0.3) } });
      setPropertyValue(d, one.id, "transform.position", [540, 1500], 0);
    });
    let changed = 0;
    p = h.apply(p, (d) => {
      changed = applyTextLookToTrack(d, one.id);
    });
    expect(changed).toBe(2);
    const caps = all(p).filter((l) => ["One", "Two", "Three"].includes(l.text));
    for (const c of caps) {
      expect(c.style.color).toBe("#ffcc00");
      expect(c.style.size).toBe(90);
      expect(c.animation?.in?.kind).toBe("pop");
      expect(c.transform.position.value).toEqual([540, 1500]);
    }
    // Words stay their own; a text clip on another track is untouched.
    expect(caps.map((c) => c.text)).toEqual(["One", "Two", "Three"]);
    expect(all(p).find((l) => l.text === "Title")!.style.color).not.toBe(
      "#ffcc00",
    );
    // One undo step puts all of them back.
    const back = all(h.undo(p)).find((l) => l.text === "Three")!;
    expect(back.style.color).not.toBe("#ffcc00");
  });
});
