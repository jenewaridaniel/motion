import { describe, expect, it } from "vitest";
import {
  addAsset,
  addLut,
  appendAsset,
  removeLut,
  setLayerLut,
  setPropertyValue,
  splitLayer,
  toggleKeyframe,
} from "./edit.ts";
import { evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { parseCube } from "./lut.ts";
import { type Asset, createProject, rootComposition } from "./model.ts";
import { parseProject } from "./serialize.ts";
import { sec } from "./time.ts";

/** A 2x2x2 identity LUT, red changing fastest (the .cube order). */
const IDENTITY_2 = `# Made by hand
TITLE "Identity"
LUT_3D_SIZE 2

0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe("parseCube", () => {
  it("reads size, title and values", () => {
    const lut = parseCube(IDENTITY_2);
    expect(lut.size).toBe(2);
    expect(lut.title).toBe("Identity");
    expect(lut.data).toHaveLength(2 * 2 * 2 * 3);
    // Entry 1 (red = 1) and entry 6 (green and blue = 1).
    expect([...lut.data.slice(3, 6)]).toEqual([1, 0, 0]);
    expect([...lut.data.slice(18, 21)]).toEqual([0, 1, 1]);
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it("copes with Windows line endings, tabs and a custom domain", () => {
    const text = IDENTITY_2.replace(
      "LUT_3D_SIZE 2",
      "DOMAIN_MIN 0 0 0\r\nDOMAIN_MAX 2 2 2\r\nLUT_3D_SIZE\t2",
    ).replace(/\n/g, "\r\n");
    const lut = parseCube(text);
    expect(lut.domainMax).toEqual([2, 2, 2]);
    expect(lut.data).toHaveLength(24);
  });

  it("refuses files that aren't 3D LUTs, or are incomplete", () => {
    expect(() => parseCube("just text")).toThrow(/size/i);
    expect(() => parseCube("LUT_1D_SIZE 4\n0 0 0\n")).toThrow(/3D/i);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0\n1 1 1\n")).toThrow(
      /8 colours, found 2/,
    );
    expect(() => parseCube(`LUT_3D_SIZE 2\n${"0 0 x\n".repeat(8)}`)).toThrow(
      /number/i,
    );
    expect(() => parseCube("LUT_3D_SIZE 300\n")).toThrow(/too big/i);
  });
});

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

describe("LUTs on clips", () => {
  function setup() {
    const h = new History();
    let p = h.apply(createProject(), (d) => {
      addAsset(d, video);
      appendAsset(d, "v");
      addLut(d, { id: "L1", name: "Teal and orange", fileName: "teal.cube" });
    });
    const id = rootComposition(p).tracks[0]!.layers[0]!.id;
    p = h.apply(p, (d) => void setLayerLut(d, id, "L1"));
    return { h, p, id };
  }

  it("passes the LUT and its strength to the renderer", () => {
    const { p } = setup();
    expect(evaluateFrame(p, sec(1))[0]!.style.lut).toEqual({
      id: "L1",
      intensity: 1,
    });
  });

  it("strength is animatable, and removing the LUT turns it off", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(
      p0,
      (d) => void setPropertyValue(d, id, "lut.intensity", 0.4, 0),
    );
    expect(evaluateFrame(p, sec(1))[0]!.style.lut?.intensity).toBe(0.4);
    p = h.apply(p, (d) => void setLayerLut(d, id, null));
    expect(evaluateFrame(p, sec(1))[0]!.style.lut).toBeNull();
  });

  it("strength keyframes survive a split", () => {
    const { h, p: p0, id } = setup();
    let p = h.apply(p0, (d) => {
      toggleKeyframe(d, id, "lut.intensity", 0);
      toggleKeyframe(d, id, "lut.intensity", sec(8));
      setPropertyValue(d, id, "lut.intensity", 0, sec(8));
    });
    const before = evaluateFrame(p, sec(6))[0]!.style.lut!.intensity;
    p = h.apply(p, (d) => void splitLayer(d, id, sec(3)));
    const after = evaluateFrame(p, sec(6))[0]!.style.lut!;
    expect(after.id).toBe("L1");
    expect(after.intensity).toBeCloseTo(before, 6);
    // Mid-animation, so the check above means something.
    expect(before).toBeGreaterThan(0.05);
    expect(before).toBeLessThan(0.95);
  });

  it("can be removed from the project, and from every clip using it", () => {
    const { h, p: p0, id } = setup();
    let second = "";
    let p = h.apply(p0, (d) => {
      second = appendAsset(d, "v") ?? "";
      setLayerLut(d, second, "L1");
      addLut(d, { id: "L2", name: "Other", fileName: "other.cube" });
    });
    let used = -1;
    p = h.apply(p, (d) => {
      used = removeLut(d, "L1");
    });
    expect(used).toBe(2);
    expect(p.luts).toEqual({
      L2: { id: "L2", name: "Other", fileName: "other.cube" },
    });
    const layers = rootComposition(p).tracks.flatMap((t) => t.layers);
    expect(layers.every((l) => l.lut === undefined)).toBe(true);
    expect(evaluateFrame(p, sec(1))[0]!.style.lut).toBeNull();
    // Still a valid project, and undo brings everything back.
    expect(parseProject(structuredClone(p)).ok).toBe(true);
    const back = h.undo(p);
    expect(back.luts?.L1).toBeDefined();
    const restored = rootComposition(back).tracks.flatMap((t) => t.layers);
    expect(restored.find((l) => l.id === id)?.lut?.id).toBe("L1");
    expect(restored.find((l) => l.id === second)?.lut?.id).toBe("L1");
  });

  it("is saved and checked on load, including a LUT that's no longer in the project", () => {
    const { p } = setup();
    expect(parseProject(structuredClone(p)).ok).toBe(true);
    const orphan = structuredClone(p);
    delete orphan.luts!.L1;
    const r = parseProject(orphan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing LUT/);
  });
});
