import { describe, expect, it } from "vitest";
import {
  addAsset,
  appendAsset,
  getProperty,
  setBlend,
  setLook,
  setPropertyValue,
  splitLayer,
  toggleKeyframe,
  trimLayer,
} from "./edit.ts";
import { evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { ADJUST_KEYS, LOOKS } from "./look.ts";
import {
  type Asset,
  createProject,
  type Project,
  rootComposition,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import { sec } from "./time.ts";

const video: Asset = {
  id: "v",
  kind: "video",
  name: "clip",
  duration: sec(10),
  width: 1920,
  height: 1080,
  hasVideo: true,
  hasAudio: false,
};

function setup() {
  const h = new History();
  const p = h.apply(createProject(), (d) => {
    addAsset(d, video);
    appendAsset(d, "v");
  });
  const id = rootComposition(p).tracks[0]!.layers[0]!.id;
  return { h, p, id };
}

const layerOf = (p: Project) =>
  rootComposition(p).tracks.flatMap((t) => t.layers)[0]!;
const styleAt = (p: Project, t: number) => evaluateFrame(p, sec(t))[0]!.style;

describe("colour adjustments", () => {
  it("are off by default, so drawing stays exactly as before", () => {
    const { p } = setup();
    expect(styleAt(p, 1)).toEqual({ blend: "normal", adjust: null });
  });

  it("can be set like any property, and are resolved to numbers for drawing", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      setPropertyValue(d, id, "adjust.exposure", 0.5, sec(1));
      setPropertyValue(d, id, "adjust.saturation", -1, sec(1));
    });
    const adjust = styleAt(p, 1).adjust!;
    expect(adjust.exposure).toBe(0.5);
    expect(adjust.saturation).toBe(-1);
    expect(adjust.contrast).toBe(0);
    expect(Object.keys(adjust).sort()).toEqual([...ADJUST_KEYS].sort());
  });

  it("can be animated with keyframes", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      toggleKeyframe(d, id, "adjust.contrast", 0);
      toggleKeyframe(d, id, "adjust.contrast", sec(4));
      setPropertyValue(d, id, "adjust.contrast", 1, sec(4));
    });
    expect(styleAt(p, 0)).toEqual({ blend: "normal", adjust: null });
    expect(styleAt(p, 2).adjust!.contrast).toBeGreaterThan(0);
    expect(styleAt(p, 2).adjust!.contrast).toBeLessThan(1);
    expect(styleAt(p, 5).adjust!.contrast).toBe(1);
  });

  it("keep their animation through a split and a start trim", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(p0, (d) => {
      toggleKeyframe(d, id, "adjust.temperature", 0);
      toggleKeyframe(d, id, "adjust.temperature", sec(8));
      setPropertyValue(d, id, "adjust.temperature", 1, sec(8));
    });
    const at6 = styleAt(p, 6).adjust!.temperature;
    p = h.apply(p, (d) => void splitLayer(d, id, sec(3)));
    expect(styleAt(p, 6).adjust!.temperature).toBeCloseTo(at6, 6);
    p = h.apply(p, (d) => {
      const right = rootComposition(d).tracks[0]!.layers[1]!;
      trimLayer(d, right.id, "start", sec(4));
    });
    // Main track packs the clip back; its content time 6 s is now at 5 s.
    expect(styleAt(p, 5).adjust!.temperature).toBeCloseTo(at6, 6);
  });

  it("has ready-made looks that set several values at once, and a reset", () => {
    const { h, p: p0, id } = setup();
    const look = LOOKS.find((l) => l.id === "warm")!;
    let p = h.apply(p0, (d) => void setLook(d, id, "warm"));
    for (const [k, v] of Object.entries(look.adjust)) {
      expect(styleAt(p, 1).adjust![k as keyof typeof look.adjust]).toBe(v);
    }
    p = h.apply(p, (d) => void setLook(d, id, "none"));
    expect(styleAt(p, 1).adjust).toBeNull();
    expect(getProperty(layerOf(p), "adjust.exposure")).toBeNull();
  });
});

describe("blend modes", () => {
  it("are passed to the renderer", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => void setBlend(d, id, "screen"));
    expect(styleAt(p, 1).blend).toBe("screen");
  });
});

describe("saving", () => {
  it("keeps adjustments and blend mode, and refuses broken ones", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      setPropertyValue(d, id, "adjust.fade", 0.3, 0);
      setBlend(d, id, "multiply");
    });
    const r = parseProject(structuredClone(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);

    const badBlend = structuredClone(p);
    (layerOf(badBlend) as unknown as { blend: string }).blend = "explode";
    expect(parseProject(badBlend).ok).toBe(false);

    const badAdjust = structuredClone(p);
    (
      layerOf(badAdjust) as unknown as { adjust: Record<string, unknown> }
    ).adjust.fade = { value: "a lot" };
    expect(parseProject(badAdjust).ok).toBe(false);

    const unknownKey = structuredClone(p);
    (
      layerOf(unknownKey) as unknown as { adjust: Record<string, unknown> }
    ).adjust.sparkle = { value: 1 };
    expect(parseProject(unknownKey).ok).toBe(false);
  });
});
