import { describe, expect, it } from "vitest";
import {
  addAsset,
  addText,
  appendAsset,
  setEffect,
  setEffectOption,
  setMask,
  setMaskInvert,
  setPropertyValue,
  splitLayer,
  toggleKeyframe,
} from "./edit.ts";
import { shakeOffset } from "./effects.ts";
import { evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
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
  return { h, p, id: rootComposition(p).tracks[0]!.layers[0]!.id };
}

const drawAt = (p: Project, t: number) => evaluateFrame(p, sec(t))[0]!;
const layerOf = (p: Project) =>
  rootComposition(p).tracks.flatMap((x) => x.layers)[0]!;

describe("effects", () => {
  it("are all off by default", () => {
    const { p } = setup();
    expect(drawAt(p, 1).style).toEqual({
      blend: "normal",
      adjust: null,
      lut: null,
      dip: null,
      wipe: null,
      blur: 0,
      key: null,
      mask: null,
      glitch: null,
      vignette: null,
    });
  });

  it("blur gives the renderer a strength in canvas pixels", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      setEffect(d, id, "blur", true);
      setPropertyValue(d, id, "effects.blur.amount", 50, 0);
    });
    // 50% of the maximum (3% of the short side: 1080 * 0.03 = 32.4 px).
    expect(drawAt(p, 1).style.blur).toBeCloseTo(16.2, 6);
  });

  it("green screen passes the key colour as numbers", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      setEffect(d, id, "chromaKey", true);
      setEffectOption(d, id, "chromaKey", "color", "#00b140");
    });
    const key = drawAt(p, 1).style.key!;
    expect(key.color.map((c) => Math.round(c * 255))).toEqual([0, 177, 64]);
    expect(key.similarity).toBeGreaterThan(0);
  });

  it("glitch changes its pattern over time, the same way every time", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => void setEffect(d, id, "glitch", true));
    const a = drawAt(p, 1).style.glitch!;
    const b = drawAt(p, 1.5).style.glitch!;
    expect(a.seed).not.toBe(b.seed);
    expect(drawAt(p, 1).style.glitch).toEqual(a);
  });

  it("shake moves the layer a little, smoothly, and not at all at 0", () => {
    const { h, p: p0, id } = setup();
    const still = apply(drawAt(p0, 1).matrix, 0, 0);
    const p = h.apply(p0, (d) => void setEffect(d, id, "shake", true));
    const moved = apply(drawAt(p, 1).matrix, 0, 0);
    expect(moved).not.toEqual(still);
    // Never more than the maximum (3% of the short side at 100%).
    for (let t = 0; t < 2; t += 0.05) {
      const o = shakeOffset(100, 8, sec(t), 1080);
      expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(1080 * 0.03 * 1.01);
    }
    // Smooth: neighbouring frames are close.
    // Smooth at a gentle speed (fast shakes are meant to jump around).
    const f1 = shakeOffset(50, 2, sec(1), 1080);
    const f2 = shakeOffset(50, 2, sec(1 + 1 / 60), 1080);
    expect(Math.abs(f1.dx - f2.dx)).toBeLessThan(5);
    expect(shakeOffset(0, 8, sec(1), 1080)).toEqual({
      dx: 0,
      dy: 0,
      rotation: 0,
    });
  });

  it("vignette has an amount and a size", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => void setEffect(d, id, "vignette", true));
    expect(drawAt(p, 1).style.vignette).toEqual({ amount: 0.5, size: 0.6 });
  });

  it("turning an effect off removes it", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(p0, (d) => void setEffect(d, id, "blur", true));
    p = h.apply(p, (d) => void setEffect(d, id, "blur", false));
    expect(layerOf(p).effects).toBeUndefined();
    expect(drawAt(p, 1).style.blur).toBe(0);
  });
});

describe("masks", () => {
  it("resolve to shape, centre, size, rotation, feather and invert", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      setMask(d, id, "ellipse");
      setPropertyValue(d, id, "mask.size", [0.4, 0.3], 0);
      setMaskInvert(d, id, true);
    });
    expect(drawAt(p, 1).style.mask).toEqual({
      shape: "ellipse",
      center: [0.5, 0.5],
      size: [0.4, 0.3],
      rotation: 0,
      feather: 0.05,
      invert: true,
    });
  });

  it("can be removed", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(p0, (d) => void setMask(d, id, "rect"));
    p = h.apply(p, (d) => void setMask(d, id, null));
    expect(drawAt(p, 1).style.mask).toBeNull();
  });

  it("work on text too", () => {
    const h = new History();
    let id = "";
    let p = h.apply(createProject(), (d) => {
      id = addText(d, 0) ?? "";
    });
    p = h.apply(p, (d) => void setMask(d, id, "linear"));
    expect(drawAt(p, 1).style.mask?.shape).toBe("linear");
  });
});

describe("animation and saving", () => {
  it("effect and mask keyframes survive a split", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(p0, (d) => {
      setEffect(d, id, "blur", true);
      setMask(d, id, "rect");
      toggleKeyframe(d, id, "effects.blur.amount", 0);
      toggleKeyframe(d, id, "effects.blur.amount", sec(8));
      setPropertyValue(d, id, "effects.blur.amount", 100, sec(8));
      toggleKeyframe(d, id, "mask.feather", 0);
      toggleKeyframe(d, id, "mask.feather", sec(8));
      setPropertyValue(d, id, "mask.feather", 0.5, sec(8));
    });
    const before = drawAt(p, 6).style;
    p = h.apply(p, (d) => void splitLayer(d, id, sec(3)));
    const after = evaluateFrame(p, sec(6))[0]!.style;
    expect(after.blur).toBeCloseTo(before.blur, 6);
    expect(after.mask!.feather).toBeCloseTo(before.mask!.feather, 6);
  });

  it("are saved and checked on load", () => {
    const { h, p: p0, id } = setup();
    const p = h.apply(p0, (d) => {
      for (const k of [
        "blur",
        "chromaKey",
        "glitch",
        "shake",
        "vignette",
      ] as const)
        setEffect(d, id, k, true);
      setMask(d, id, "ellipse");
    });
    const r = parseProject(structuredClone(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);

    const badKey = structuredClone(p);
    (
      layerOf(badKey) as unknown as {
        effects: { chromaKey: { color: string } };
      }
    ).effects.chromaKey.color = "green";
    expect(parseProject(badKey).ok).toBe(false);

    const badMask = structuredClone(p);
    (layerOf(badMask) as unknown as { mask: { shape: string } }).mask.shape =
      "star";
    expect(parseProject(badMask).ok).toBe(false);

    const unknown = structuredClone(p);
    (
      layerOf(unknown) as unknown as { effects: Record<string, unknown> }
    ).effects.sparkle = {};
    expect(parseProject(unknown).ok).toBe(false);
  });
});
