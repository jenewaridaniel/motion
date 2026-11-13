import { describe, expect, it } from "vitest";
import {
  addAsset,
  addOverlay,
  appendAsset,
  deleteLayer,
  liftToOverlay,
  moveLayer,
  setPropertyValue,
  setSpeed,
  splitLayer,
  toggleKeyframe,
  trimLayer,
} from "./edit.ts";
import {
  collectAudioSegments,
  evaluateFrame,
  type VisualDraw,
} from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import {
  type Asset,
  createProject,
  type Layer,
  type Project,
  rootComposition,
} from "./model.ts";
import { cubicBezier, EASE, prop, setKeyframe, valueAt } from "./property.ts";
import { formatTimecode, sec } from "./time.ts";

const video = (id: string, seconds = 10): Asset => ({
  id,
  kind: "video",
  name: `${id}.mp4`,
  duration: sec(seconds),
  width: 1920,
  height: 1080,
  hasVideo: true,
  hasAudio: true,
});

function setup(...assets: Asset[]) {
  const history = new History();
  let p = createProject();
  p = history.apply(p, (d) => {
    for (const a of assets) addAsset(d, a);
  });
  return { history, p };
}

const videoTime = (d: VisualDraw) =>
  d.source.kind === "video" ? d.source.time : null;
const assetOf = (d: VisualDraw) =>
  d.source.kind === "text" || d.source.kind === "shape"
    ? null
    : d.source.assetId;

const main = (p: Project) => rootComposition(p).tracks.find((t) => t.magnetic)!;
const layers = (p: Project) => main(p).layers;

describe("time", () => {
  it("formats timecodes", () => {
    expect(formatTimecode(sec(61.5), 30)).toBe("01:01:15");
    expect(formatTimecode(sec(3725), 25)).toBe("1:02:05:00");
  });
});

describe("properties", () => {
  it("returns the static value without keyframes", () => {
    expect(valueAt(prop(0.5), sec(3))).toBe(0.5);
  });

  it("interpolates and holds at the ends", () => {
    const p = prop(0);
    setKeyframe(p, sec(1), 0, 1, EASE.linear);
    setKeyframe(p, sec(3), 100, 1, EASE.linear);
    expect(valueAt(p, 0)).toBe(0);
    expect(valueAt(p, sec(2))).toBeCloseTo(50);
    expect(valueAt(p, sec(10))).toBe(100);
  });

  it("interpolates vectors and respects hold easing", () => {
    const p = prop<readonly [number, number]>([0, 0]);
    setKeyframe(p, 0, [0, 0], 1, EASE.hold);
    setKeyframe(p, sec(1), [10, 20], 1);
    expect(valueAt(p, sec(0.99))).toEqual([0, 0]);
    expect(valueAt(p, sec(1))).toEqual([10, 20]);
  });

  it("solves cubic-bezier easing like CSS", () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 4);
    expect(cubicBezier(0.42, 0, 0.58, 1, 0.25)).toBeLessThan(0.25);
    expect(cubicBezier(0, 0, 1, 1, 0.3)).toBeCloseTo(0.3, 4);
  });
});

describe("magnetic main track", () => {
  it("appends clips back to back", () => {
    const { history, p: p0 } = setup(video("a", 4), video("b", 6));
    const p = history.apply(p0, (d) => {
      appendAsset(d, "a");
      appendAsset(d, "b");
    });
    expect(layers(p).map((l) => [l.start, l.duration])).toEqual([
      [0, sec(4)],
      [sec(4), sec(6)],
    ]);
  });

  it("ripples when a clip is deleted or trimmed", () => {
    const { history, p: p0 } = setup(video("a", 4), video("b", 6));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
      appendAsset(d, "b");
    });
    const [a, b] = layers(p) as [Layer, Layer];
    p = history.apply(p, (d) => {
      trimLayer(d, a.id, "end", sec(3));
    });
    expect(layers(p)[1]?.start).toBe(sec(3));
    p = history.apply(p, (d) => {
      deleteLayer(d, a.id);
    });
    expect(layers(p)).toHaveLength(1);
    expect(layers(p)[0]?.id).toBe(b.id);
    expect(layers(p)[0]?.start).toBe(0);
  });

  it("reorders by drop position", () => {
    const { history, p: p0 } = setup(video("a", 4), video("b", 6));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
      appendAsset(d, "b");
    });
    const [a, b] = layers(p) as [Layer, Layer];
    p = history.apply(p, (d) => {
      moveLayer(d, a.id, main(d).id, sec(9));
    });
    expect(layers(p).map((l) => l.id)).toEqual([b.id, a.id]);
    expect(layers(p)[1]?.start).toBe(sec(6));
  });
});

describe("trim and split", () => {
  it("trimming the start moves the in-point and clamps to the source", () => {
    const { history, p: p0 } = setup(video("a", 10));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
    });
    const id = layers(p)[0]!.id;
    p = history.apply(p, (d) => {
      trimLayer(d, id, "start", sec(2));
    });
    const l = layers(p)[0]!;
    expect(l.kind === "media" && l.inPoint).toBe(sec(2));
    expect(l.start).toBe(0); // magnetic: packed back to zero
    expect(l.duration).toBe(sec(8));
    p = history.apply(p, (d) => {
      trimLayer(d, id, "end", sec(100));
    });
    expect(layers(p)[0]!.duration).toBe(sec(8)); // can't exceed the source
  });

  it("split keeps the animation identical on both halves", () => {
    const { history, p: p0 } = setup(video("a", 10));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
    });
    const id = layers(p)[0]!.id;
    p = history.apply(p, (d) => {
      toggleKeyframe(d, id, "opacity", 0);
      setPropertyValue(d, id, "opacity", 1, 0);
      toggleKeyframe(d, id, "opacity", sec(10));
      setPropertyValue(d, id, "opacity", 0, sec(10) - 1);
    });
    const before = evaluateFrame(p, sec(7))[0]!.opacity;
    p = history.apply(p, (d) => {
      splitLayer(d, id, sec(4));
    });
    expect(layers(p)).toHaveLength(2);
    const right = layers(p)[1]!;
    expect(right.kind === "media" && right.inPoint).toBe(sec(4));
    expect(evaluateFrame(p, sec(7))[0]!.opacity).toBeCloseTo(before, 6);
    expect(videoTime(evaluateFrame(p, sec(7))[0]!)).toBe(sec(7));
  });

  it("speed changes duration and source mapping", () => {
    const { history, p: p0 } = setup(video("a", 10));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
    });
    const id = layers(p)[0]!.id;
    p = history.apply(p, (d) => {
      setSpeed(d, id, 2);
    });
    expect(layers(p)[0]!.duration).toBe(sec(5));
    expect(videoTime(evaluateFrame(p, sec(1))[0]!)).toBe(sec(2));
  });
});

describe("evaluation", () => {
  it("draws overlays on top of the main track", () => {
    const { history, p: p0 } = setup(video("a"), video("b"));
    const p = history.apply(p0, (d) => {
      appendAsset(d, "a");
      addOverlay(d, "b", sec(1));
    });
    expect(evaluateFrame(p, sec(0.5)).map(assetOf)).toEqual(["a"]);
    expect(evaluateFrame(p, sec(2)).map(assetOf)).toEqual(["a", "b"]);
  });

  it("fits media to the canvas by default", () => {
    const { history, p: p0 } = setup(video("a"));
    const p = history.apply(p0, (d) => {
      appendAsset(d, "a");
    });
    const draw = evaluateFrame(p, 0)[0]!;
    // 1920x1080 into 1080x1920: width-limited, centred vertically.
    const [x0, y0] = apply(draw.matrix, 0, 0);
    const [x1, y1] = apply(draw.matrix, 1920, 1080);
    expect(x0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(1080);
    expect(y0).toBeCloseTo((1920 - 607.5) / 2);
    expect(y1 - y0).toBeCloseTo(607.5);
  });

  it("applies parent transforms", () => {
    const { history, p: p0 } = setup(video("a"), video("b"));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
      addOverlay(d, "b", 0);
    });
    const comp = rootComposition(p);
    const child = comp.tracks[0]!.layers[0]!;
    const parent = layers(p)[0]!;
    const before = apply(evaluateFrame(p, 0)[1]!.matrix, 0, 0);
    p = history.apply(p, (d) => {
      const c = rootComposition(d).tracks[0]!.layers[0]!;
      c.parentId = parent.id;
      setPropertyValue(d, parent.id, "transform.position", [540 + 100, 960], 0);
    });
    expect(child.id).toBeTruthy();
    const after = apply(evaluateFrame(p, 0)[1]!.matrix, 0, 0);
    // Parent moved 100px right; child follows (scaled by the parent's scale).
    expect(after[0]).toBeGreaterThan(before[0]);
  });

  it("lists audio segments and skips muted tracks", () => {
    const { history, p: p0 } = setup(video("a"));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
    });
    expect(collectAudioSegments(p)).toHaveLength(1);
    p = history.apply(p, (d) => {
      main(d).muted = true;
    });
    expect(collectAudioSegments(p)).toHaveLength(0);
  });

  it("lifting to an overlay keeps the clip's time", () => {
    const { history, p: p0 } = setup(video("a", 4), video("b", 4));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
      appendAsset(d, "b");
    });
    const b = layers(p)[1]!;
    p = history.apply(p, (d) => {
      liftToOverlay(d, b.id);
    });
    const overlay = rootComposition(p).tracks[0]!;
    expect(overlay.magnetic).toBe(false);
    expect(overlay.layers[0]!.start).toBe(sec(4));
  });
});

describe("history", () => {
  it("undoes and redoes, merging a gesture into one step", () => {
    const { history, p: p0 } = setup(video("a", 10));
    let p = history.apply(p0, (d) => {
      appendAsset(d, "a");
    });
    const id = layers(p)[0]!.id;
    for (const t of [9, 8, 7, 6]) {
      p = history.apply(
        p,
        (d) => {
          trimLayer(d, id, "end", sec(t));
        },
        "drag-1",
      );
    }
    expect(layers(p)[0]!.duration).toBe(sec(6));
    p = history.undo(p);
    expect(layers(p)[0]!.duration).toBe(sec(10));
    p = history.redo(p);
    expect(layers(p)[0]!.duration).toBe(sec(6));
    p = history.undo(p);
    p = history.undo(p);
    expect(layers(p)).toHaveLength(0);
  });
});
