import { describe, expect, it } from "vitest";
import { addText, setTextAnimation, splitLayer, trimLayer } from "./edit.ts";
import { evaluateFrame, type VisualDraw } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import {
  createProject,
  type Project,
  rootComposition,
  type TextLayer,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import { textAnimationAt } from "./text-animation.ts";
import { sec } from "./time.ts";

function setup() {
  const h = new History();
  let id = "";
  const p = h.apply(createProject(), (d) => {
    id = addText(d, sec(1)) ?? ""; // 1 s to 4 s
  });
  return { h, p, id };
}

const texts = (p: Project) =>
  rootComposition(p)
    .tracks.flatMap((t) => t.layers)
    .filter((l): l is TextLayer => l.kind === "text");

const textDraw = (p: Project, t: number): VisualDraw | undefined =>
  evaluateFrame(p, sec(t)).find((d) => d.source.kind === "text");

/** On-canvas width of the text's layer-space unit vector: its current scale. */
const scaleOf = (d: VisualDraw) => Math.hypot(d.matrix[0], d.matrix[1]);

describe("text animations", () => {
  it("does nothing when there is no animation", () => {
    const { p } = setup();
    const a = textAnimationAt(texts(p)[0]!, sec(0.1));
    expect(a).toEqual({
      opacity: 1,
      scale: 1,
      dx: 0,
      dy: 0,
      rotation: 0,
      reveal: 1,
    });
  });

  it("fades in over its duration, then holds", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "fade", duration: sec(1) },
        }),
    );
    // Fully transparent frames aren't drawn at all.
    expect(textDraw(p, 1)).toBeUndefined();
    const mid = textDraw(p, 1.5)!.opacity;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(1);
    expect(textDraw(p, 2.5)!.opacity).toBe(1);
  });

  it("fades out at the end, and follows the end when the clip is trimmed", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          out: { kind: "fade", duration: sec(1) },
        }),
    );
    expect(textDraw(p, 2.5)!.opacity).toBe(1);
    expect(textDraw(p, 3.5)!.opacity).toBeLessThan(1);
    p = h.apply(p, (d) => void trimLayer(d, id, "end", sec(6)));
    expect(textDraw(p, 3.5)!.opacity).toBe(1); // no longer near the end
    expect(textDraw(p, 5.5)!.opacity).toBeLessThan(1);
  });

  it("pops in from small to full size", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "pop", duration: sec(0.5) },
        }),
    );
    // It starts invisible, so look just after the start: still about half size.
    expect(textDraw(p, 1)).toBeUndefined();
    expect(scaleOf(textDraw(p, 1.02)!)).toBeLessThan(0.62);
    expect(scaleOf(textDraw(p, 2)!)).toBeCloseTo(1, 6);
  });

  it("slides up into place, staying centred on its own position", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "slide-up", duration: sec(1) },
        }),
    );
    const start = apply(textDraw(p, 1.05)!.matrix, 0, 0);
    const end = apply(textDraw(p, 2.5)!.matrix, 0, 0);
    expect(start[0]).toBeCloseTo(end[0]);
    expect(start[1]).toBeGreaterThan(end[1]); // starts lower (y grows downward)
    expect(end).toEqual([540, 960]);
  });

  it("types the text out letter by letter", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "typewriter", duration: sec(1) },
        }),
    );
    const reveal = (t: number) => {
      const s = textDraw(p, t)?.source;
      return s?.kind === "text" ? (s.reveal ?? 1) : null;
    };
    expect(reveal(1)).toBe(0);
    expect(reveal(1.5)).toBeCloseTo(0.5, 1);
    expect(reveal(2.5)).toBe(1);
  });

  it("loops while on screen", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          loop: { kind: "pulse", period: sec(1) },
        }),
    );
    const scales = [1.25, 1.5, 1.75].map((t) => scaleOf(textDraw(p, t)!));
    expect(new Set(scales.map((s) => s.toFixed(3))).size).toBeGreaterThan(1);
    for (const s of scales) expect(Math.abs(s - 1)).toBeLessThanOrEqual(0.061);
  });

  it("shrinks in and out to fit a clip too short for both", () => {
    const { h, p: p0, id } = setup(); // 3 s long
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "fade", duration: sec(3) },
          out: { kind: "fade", duration: sec(3) },
        }),
    );
    // Each gets half the clip: fully visible only at the midpoint.
    expect(textDraw(p, 2.5)!.opacity).toBeCloseTo(1, 2);
    expect(textDraw(p, 1.75)!.opacity).toBeLessThan(1);
  });

  it("keeps 'in' on the left and 'out' on the right when split", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "fade", duration: sec(0.5) },
          out: { kind: "fade", duration: sec(0.5) },
          loop: { kind: "float", period: sec(2) },
        }),
    );
    p = h.apply(p, (d) => void splitLayer(d, id, sec(2.5)));
    const [left, right] = texts(p);
    expect(left!.animation?.in).not.toBeNull();
    expect(left!.animation?.out).toBeNull();
    expect(right!.animation?.in).toBeNull();
    expect(right!.animation?.out).not.toBeNull();
    expect(right!.animation?.loop).toEqual(left!.animation?.loop);
  });

  it("is saved and checked on load", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(
      p0,
      (d) =>
        void setTextAnimation(d, id, {
          in: { kind: "pop", duration: sec(0.5) },
        }),
    );
    expect(parseProject(structuredClone(p)).ok).toBe(true);
    const bad = structuredClone(p);
    (
      texts(bad)[0] as unknown as { animation: { in: { kind: string } } }
    ).animation.in.kind = "explode";
    expect(parseProject(bad).ok).toBe(false);
  });
});
