import { describe, expect, it } from "vitest";
import {
  dragPosition,
  layerHitTest,
  parentMatrixAt,
  rectCorners,
} from "./canvas.ts";
import {
  addAsset,
  addText,
  appendAsset,
  setParent,
  setPropertyValue,
} from "./edit.ts";
import { evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import { type Asset, createProject, rootComposition } from "./model.ts";
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

function project() {
  const h = new History();
  let textId = "";
  const p = h.apply(createProject(), (d) => {
    addAsset(d, video);
    appendAsset(d, "v");
    textId = addText(d, 0) ?? "";
  });
  const videoId = rootComposition(p).tracks[1]!.layers[0]!.id;
  return { h, p, textId, videoId };
}

describe("canvas geometry", () => {
  it("gives the four corners of a layer's rectangle on the canvas", () => {
    const { p } = project();
    const draw = evaluateFrame(p, sec(1)).find(
      (d) => d.source.kind === "video",
    )!;
    // 1920x1080 fitted into 1080x1920: full width, centred vertically.
    const c = rectCorners(draw.matrix, {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(c[0][0]).toBeCloseTo(0);
    expect(c[0][1]).toBeCloseTo(656.25);
    expect(c[2][0]).toBeCloseTo(1080);
    expect(c[2][1]).toBeCloseTo(1263.75);
  });

  it("finds the topmost layer under a point, and nothing outside", () => {
    const { p, textId, videoId } = project();
    const draws = evaluateFrame(p, sec(1));
    const rects = new Map([
      [draws[0]!.key, { x: 0, y: 0, width: 1920, height: 1080 }],
      [draws[1]!.key, { x: -200, y: -50, width: 400, height: 100 }],
    ]);
    expect(layerHitTest(draws, rects, 540, 960)).toBe(textId); // text is on top
    expect(layerHitTest(draws, rects, 100, 700)).toBe(videoId); // only the video
    expect(layerHitTest(draws, rects, 540, 100)).toBe(null); // above the video
  });

  it("follows rotation and scale when hit-testing", () => {
    const { h, p: p0, textId } = project();
    const p = h.apply(p0, (d) => {
      setPropertyValue(d, textId, "transform.rotation", 90, sec(1));
      setPropertyValue(d, textId, "transform.scale", [2, 2], sec(1));
    });
    const draws = evaluateFrame(p, sec(1));
    const rects = new Map([
      [draws[1]!.key, { x: -200, y: -50, width: 400, height: 100 }],
    ]);
    // Rotated 90 degrees and doubled: now 200 wide, 800 tall around the centre.
    expect(layerHitTest(draws, rects, 540, 960 + 350)).toBe(textId);
    expect(layerHitTest(draws, rects, 540 + 150, 960)).toBe(null);
  });

  it("turns a drag on the canvas into a new position", () => {
    const { p, textId } = project();
    const next = dragPosition(p, textId, sec(1), [540, 960], 100, -40);
    expect(next).toEqual([640, 920]);
  });

  it("converts the drag into the parent's space for a parented layer", () => {
    const { h, p: p0, textId, videoId } = project();
    const p = h.apply(p0, (d) => {
      setParent(d, textId, videoId);
    });
    const parent = parentMatrixAt(p, textId, sec(1));
    // The video is scaled to 0.5625; moving 100 canvas px is 177.8 parent px.
    const next = dragPosition(p, textId, sec(1), [0, 0], 100, 0);
    expect(next[0]).toBeCloseTo(100 / 0.5625);
    expect(next[1]).toBeCloseTo(0);
    // And the result lands 100 px to the right on the canvas.
    const before = apply(parent, 0, 0);
    const after = apply(parent, next[0], next[1]);
    expect(after[0] - before[0]).toBeCloseTo(100);
  });
});
