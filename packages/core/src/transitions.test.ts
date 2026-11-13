import { describe, expect, it } from "vitest";
import {
  addAsset,
  appendAsset,
  deleteLayer,
  liftToOverlay,
  setTransition,
  setTransitionDuration,
  splitLayer,
  trimLayer,
} from "./edit.ts";
import { evaluateFrame, projectDuration } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import {
  type Asset,
  createProject,
  type Layer,
  type Project,
  rootComposition,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import { sec } from "./time.ts";
import { TRANSITION_KINDS, transitionSides } from "./transitions.ts";

const video = (id: string): Asset => ({
  id,
  kind: "video",
  name: id,
  duration: sec(10),
  width: 1920,
  height: 1080,
  hasVideo: true,
  hasAudio: false,
});

const main = (p: Project) =>
  rootComposition(p).tracks.find((t) => t.magnetic)!.layers;

/**
 * Clip A: source 0–8 s at 0–8 s (2 s of spare footage after it).
 * Clip B: source 2–10 s at 8–16 s (2 s of spare footage before it).
 * Clip C: source 0–10 s at 16–26 s.
 */
function setup() {
  const h = new History();
  let p = h.apply(createProject(), (d) => {
    addAsset(d, video("a"));
    addAsset(d, video("b"));
    addAsset(d, video("c"));
    appendAsset(d, "a");
    appendAsset(d, "b");
    appendAsset(d, "c");
  });
  const [a, b, c] = main(p).map((l) => l.id) as [string, string, string];
  p = h.apply(p, (d) => {
    trimLayer(d, a, "end", sec(8));
    trimLayer(d, b, "start", sec(10));
  });
  return { h, p, a, b, c };
}

const drawsAt = (p: Project, t: number) => evaluateFrame(p, sec(t));
const find = (p: Project, t: number, id: string) =>
  drawsAt(p, t).find((d) => d.layerId === id);
const videoTime = (p: Project, t: number, id: string) => {
  const s = find(p, t, id)?.source;
  return s?.kind === "video" ? s.time : undefined;
};

describe("transition setup", () => {
  it("the test project is what the comments say", () => {
    const { p } = setup();
    expect(main(p).map((l) => [l.start, l.duration])).toEqual([
      [0, sec(8)],
      [sec(8), sec(8)],
      [sec(16), sec(10)],
    ]);
    expect((main(p)[1] as Layer & { inPoint: number }).inPoint).toBe(sec(2));
  });
});

describe("transitions", () => {
  it("don't change the video's length or move any clip", () => {
    const { h, p: p0, b } = setup();
    const p = h.apply(p0, (d) => void setTransition(d, b, "dissolve"));
    expect(projectDuration(p)).toBe(projectDuration(p0));
    expect(main(p).map((l) => l.start)).toEqual(main(p0).map((l) => l.start));
  });

  it("dissolve: both clips show during the transition, centred on the cut", () => {
    const { h, p: p0, a, b } = setup();
    let p = h.apply(p0, (d) => void setTransition(d, b, "dissolve"));
    p = h.apply(p, (d) => void setTransitionDuration(d, b, sec(1)));
    // Window is 7.5 s to 8.5 s.
    expect(drawsAt(p, 7.4).map((d) => d.layerId)).toEqual([a]);
    expect(drawsAt(p, 7.75).map((d) => d.layerId)).toEqual([a, b]);
    expect(find(p, 7.75, b)!.opacity).toBeCloseTo(0.25, 6);
    expect(find(p, 7.75, a)!.opacity).toBe(1);
    expect(find(p, 8, b)!.opacity).toBeCloseTo(0.5, 6);
    expect(find(p, 8.25, b)!.opacity).toBeCloseTo(0.75, 6);
    expect(drawsAt(p, 8.5).map((d) => d.layerId)).toEqual([b]);
  });

  it("uses the footage beyond each clip's trim points", () => {
    const { h, p: p0, a, b } = setup();
    let p = h.apply(p0, (d) => void setTransition(d, b, "dissolve"));
    p = h.apply(p, (d) => void setTransitionDuration(d, b, sec(1)));
    // The incoming clip starts 0.25 s early: source 2 s - 0.25 s.
    expect(videoTime(p, 7.75, b)).toBe(sec(1.75));
    // The outgoing clip keeps playing past its end: source 8 s + 0.25 s.
    expect(videoTime(p, 8.25, a)).toBe(sec(8.25));
  });

  it("holds the first or last frame when there is no spare footage", () => {
    const { h, p: p0, b, c } = setup();
    // B ends at the end of its file; C starts at the start of its file.
    let p = h.apply(p0, (d) => void setTransition(d, c, "dissolve"));
    p = h.apply(p, (d) => void setTransitionDuration(d, c, sec(1)));
    expect(videoTime(p, 15.75, c)).toBe(0);
    expect(videoTime(p, 16.25, b)).toBe(sec(10) - 1);
  });

  it("is never longer than either clip", () => {
    const { h, p: p0, a, b } = setup();
    let p = h.apply(p0, (d) => void trimLayer(d, a, "end", sec(1)));
    p = h.apply(p, (d) => {
      setTransition(d, b, "dissolve");
      setTransitionDuration(d, b, sec(5));
    });
    // A is 1 s long, so the window is 1 s around the cut at 1 s.
    expect(drawsAt(p, 0.45).length).toBe(1);
    expect(drawsAt(p, 0.55).length).toBe(2);
    expect(drawsAt(p, 1.55).length).toBe(1);
  });

  it("dip to black: the old clip fades to black, then the new one fades in", () => {
    const { h, p: p0, a, b } = setup();
    let p = h.apply(p0, (d) => void setTransition(d, b, "dipBlack"));
    p = h.apply(p, (d) => void setTransitionDuration(d, b, sec(1)));
    expect(drawsAt(p, 7.75).map((d) => d.layerId)).toEqual([a]);
    expect(find(p, 7.75, a)!.style.dip).toEqual({
      color: [0, 0, 0],
      amount: 0.5,
    });
    expect(drawsAt(p, 8.25).map((d) => d.layerId)).toEqual([b]);
    expect(find(p, 8.25, b)!.style.dip?.amount).toBeCloseTo(0.5, 6);
    // Untouched outside the transition.
    expect(find(p, 9, b)!.style.dip).toBeNull();
  });

  it("slide: the new clip pushes the old one off the canvas", () => {
    const { h, p: p0, a, b } = setup();
    let p = h.apply(p0, (d) => void setTransition(d, b, "slideLeft"));
    p = h.apply(p, (d) => void setTransitionDuration(d, b, sec(1)));
    const width = rootComposition(p).width;
    // Where the middle of each clip's picture lands on the canvas.
    const centre = (proj: Project, id: string, t: number) =>
      apply(find(proj, t, id)!.matrix, 960, 540);
    const restA = centre(p, a, 4);
    const restB = centre(p, b, 12);
    // Half way: A moved half a canvas left, B is half a canvas right.
    expect(centre(p, a, 8)[0]).toBeCloseTo(restA[0] - width / 2, 3);
    expect(centre(p, b, 8)[0]).toBeCloseTo(restB[0] + width / 2, 3);
    expect(centre(p, b, 8)[1]).toBeCloseTo(restB[1], 3);
  });

  it("wipe: the new clip gets an edge that moves across the canvas", () => {
    const { h, p: p0, b } = setup();
    let p = h.apply(p0, (d) => void setTransition(d, b, "wipeRight"));
    p = h.apply(p, (d) => void setTransitionDuration(d, b, sec(1)));
    const w = find(p, 8, b)!.style.wipe!;
    expect(w.dir).toEqual([1, 0]);
    expect(w.edge).toBeCloseTo(0.5, 6);
    expect(find(p, 7.6, b)!.style.wipe!.edge).toBeLessThan(0.5);
  });

  it("blur and zoom change the outgoing clip as it leaves", () => {
    const { h, p: p0, a, b } = setup();
    let p = h.apply(p0, (d) => {
      setTransition(d, b, "blur");
      setTransitionDuration(d, b, sec(1));
    });
    expect(find(p, 8.25, a)!.style.blur).toBeGreaterThan(0);
    expect(find(p, 9, b)!.style.blur).toBe(0);
    p = h.apply(p, (d) => void setTransition(d, b, "zoom"));
    const size = (t: number) => {
      const m = find(p, t, a)!.matrix;
      return Math.hypot(m[0], m[1]);
    };
    expect(size(8.25)).toBeGreaterThan(size(4) * 1.1);
  });

  it("every kind starts as the old clip and ends as the new one", () => {
    for (const kind of TRANSITION_KINDS) {
      const start = transitionSides(kind, 0, 1920, 1080);
      const end = transitionSides(kind, 1, 1920, 1080);
      // At the start the new clip can't be seen; at the end it's fully there.
      const hiddenAtStart =
        !start.to.visible ||
        start.to.opacity === 0 ||
        (start.to.dip?.amount ?? 0) === 1 ||
        (start.to.wipe ? start.to.wipe.edge < 0 : false) ||
        Math.abs(start.to.matrix[4]) >= 1920 ||
        Math.abs(start.to.matrix[5]) >= 1080;
      expect(hiddenAtStart, kind).toBe(true);
      expect(end.to.visible && end.to.opacity === 1, kind).toBe(true);
      expect(end.to.dip?.amount ?? 0, kind).toBe(0);
      for (const [i, v] of end.to.matrix.entries()) {
        expect(v, kind).toBeCloseTo([1, 0, 0, 1, 0, 0][i] ?? 0, 9);
      }
      expect(end.to.blur, kind).toBe(0);
    }
  });
});

describe("transition editing", () => {
  it("the first clip can't have one", () => {
    const { h, p: p0, a } = setup();
    let ok = true;
    h.apply(p0, (d) => {
      ok = setTransition(d, a, "dissolve");
    });
    expect(ok).toBe(false);
  });

  it("length is kept between 0.1 s and 5 s", () => {
    const { h, p: p0, b } = setup();
    let p = h.apply(p0, (d) => {
      setTransition(d, b, "dissolve");
      setTransitionDuration(d, b, 1);
    });
    expect(main(p)[1]!.transition!.duration).toBe(sec(0.1));
    p = h.apply(p, (d) => void setTransitionDuration(d, b, sec(60)));
    expect(main(p)[1]!.transition!.duration).toBe(sec(5));
    // Changing the kind keeps the length.
    p = h.apply(p, (d) => void setTransition(d, b, "zoom"));
    expect(main(p)[1]!.transition).toEqual({ kind: "zoom", duration: sec(5) });
  });

  it("splitting keeps it on the left part only", () => {
    const { h, p: p0, b } = setup();
    let p = h.apply(p0, (d) => void setTransition(d, b, "dissolve"));
    p = h.apply(p, (d) => void splitLayer(d, b, sec(12)));
    expect(main(p).map((l) => l.transition?.kind ?? null)).toEqual([
      null,
      "dissolve",
      null,
      null,
    ]);
  });

  it("is removed when its clip becomes first, or leaves the main track", () => {
    const { h, p: p0, a, b, c } = setup();
    let p = h.apply(p0, (d) => {
      setTransition(d, b, "dissolve");
      setTransition(d, c, "dipBlack");
    });
    p = h.apply(p, (d) => void deleteLayer(d, a));
    expect(main(p)[0]!.transition).toBeUndefined();
    p = h.apply(p, (d) => void liftToOverlay(d, c));
    const lifted = rootComposition(p)
      .tracks.flatMap((t) => t.layers)
      .find((l) => l.id === c)!;
    expect(lifted.transition).toBeUndefined();
  });

  it("undo brings it back", () => {
    const { h, p: p0, b } = setup();
    const p1 = h.apply(p0, (d) => void setTransition(d, b, "wipeLeft"));
    const p2 = h.apply(p1, (d) => void setTransition(d, b, null));
    expect(main(p2)[1]!.transition).toBeUndefined();
    expect(main(h.undo(p2)!)[1]!.transition?.kind).toBe("wipeLeft");
  });

  it("is saved and checked on load", () => {
    const { h, p: p0, b } = setup();
    const p = h.apply(p0, (d) => void setTransition(d, b, "slideUp"));
    const r = parseProject(structuredClone(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);
    const bad = structuredClone(p);
    (main(bad)[1]!.transition as { kind: string }).kind = "spin";
    expect(parseProject(bad).ok).toBe(false);
  });
});
