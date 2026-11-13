import { describe, expect, it } from "vitest";
import { placeholderHit, placeholdersAt } from "./canvas.ts";
import {
  addAsset,
  addPlaceholder,
  fillPlaceholder,
  setAspect,
} from "./edit.ts";
import { evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import {
  type Asset,
  createProject,
  type MediaLayer,
  type Project,
  rootComposition,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import { sec } from "./time.ts";

const media = (
  id: string,
  kind: "video" | "image",
  w: number,
  h: number,
  dur = 10,
): Asset => ({
  id,
  kind,
  name: id,
  duration: kind === "image" ? 0 : sec(dur),
  width: w,
  height: h,
  hasVideo: true,
  hasAudio: false,
});
const all = (p: Project) => rootComposition(p).tracks.flatMap((t) => t.layers);

function setup() {
  const h = new History();
  let main = "";
  let box = "";
  const p = h.apply(createProject(), (d) => {
    // Default canvas: 1080 × 1920.
    main = addPlaceholder(d, 0, {
      label: "Your video",
      duration: sec(6),
      main: true,
    });
    box = addPlaceholder(d, sec(1), {
      label: "Your photo",
      duration: sec(3),
      position: [540, 600],
      size: [600, 600],
    });
    addAsset(d, media("v", "video", 1920, 1080));
    addAsset(d, media("short", "video", 1920, 1080, 2));
    addAsset(d, media("img", "image", 1600, 900));
    addAsset(d, {
      ...media("a", "video", 0, 0),
      kind: "audio",
      hasVideo: false,
      hasAudio: true,
    });
  });
  return { h, p, main, box };
}

describe("placeholders", () => {
  it("draw nothing in the picture, but the editor knows where they are", () => {
    const { p, main, box } = setup();
    expect(evaluateFrame(p, sec(2))).toEqual([]);
    const views = placeholdersAt(p, sec(2));
    expect(views.map((v) => v.label).sort()).toEqual([
      "Your photo",
      "Your video",
    ]);
    expect(views.find((v) => v.layerId === main)!.corners).toEqual([
      [0, 0],
      [1080, 0],
      [1080, 1920],
      [0, 1920],
    ]);
    expect(views.find((v) => v.layerId === box)!.corners[0]).toEqual([
      240, 300,
    ]);
    // The box sits on top of the full-screen slot.
    expect(placeholderHit(views, 540, 600)).toBe(box);
    expect(placeholderHit(views, 100, 1800)).toBe(main);
    expect(placeholderHit(views, -5, 10)).toBeNull();
    // Outside its time, a slot isn't shown.
    expect(placeholdersAt(p, sec(5)).map((v) => v.layerId)).toEqual([main]);
  });

  it("a full-screen slot takes a video that covers the canvas, in its place and time", () => {
    const { h, p: p0, main } = setup();
    let id: string | null = null;
    const p = h.apply(p0, (d) => {
      id = fillPlaceholder(d, main, "v");
    });
    const clip = all(p).find((l) => l.id === id) as MediaLayer;
    expect(all(p).some((l) => l.id === main)).toBe(false);
    expect(
      rootComposition(p).tracks.find((t) => t.magnetic)!.layers[0]!.id,
    ).toBe(id);
    expect([clip.start, clip.duration]).toEqual([0, sec(6)]);
    // 1920 × 1080 into 1080 × 1920: scaled to cover the height.
    expect(clip.transform.scale.value[0]).toBeCloseTo(1920 / 1080, 9);
    expect(clip.mask).toBeUndefined();
    const draw = evaluateFrame(p, sec(1)).find((d) => d.layerId === id)!;
    expect(apply(draw.matrix, 960, 540)).toEqual([540, 960]);
    // Undo brings the slot back.
    expect(all(h.undo(p)).some((l) => l.id === main)).toBe(true);
  });

  it("a box slot crops the media to the box", () => {
    const { h, p: p0, box } = setup();
    let id: string | null = null;
    const p = h.apply(p0, (d) => {
      id = fillPlaceholder(d, box, "img");
    });
    const clip = all(p).find((l) => l.id === id) as MediaLayer;
    expect([clip.start, clip.duration]).toEqual([sec(1), sec(3)]);
    // 1600 × 900 into 600 × 600: covers the height, sides cropped by a mask.
    const cover = 600 / 900;
    expect(clip.transform.scale.value[0]).toBeCloseTo(cover, 9);
    expect(clip.mask?.shape).toBe("rect");
    expect(clip.mask!.size.value[0]).toBeCloseTo(600 / (1600 * cover), 9);
    expect(clip.mask!.size.value[1]).toBeCloseTo(1, 9);
    expect(
      evaluateFrame(p, sec(2)).find((d) => d.layerId === id)!.style.mask,
    ).not.toBeNull();
  });

  it("a short video keeps its own length; sound files are refused", () => {
    const { h, p: p0, main } = setup();
    let id: string | null = null;
    let audio: string | null = "x";
    const p = h.apply(p0, (d) => {
      audio = fillPlaceholder(d, main, "a");
      id = fillPlaceholder(d, main, "short");
    });
    expect(audio).toBeNull();
    expect((all(p).find((l) => l.id === id) as MediaLayer).duration).toBe(
      sec(2),
    );
  });

  it("keeps covering the same share of the canvas when its shape changes", () => {
    const { h, p: p0, main } = setup();
    const p = h.apply(p0, (d) => void setAspect(d, "16:9"));
    expect(
      placeholdersAt(p, sec(1)).find((v) => v.layerId === main)!.corners[2],
    ).toEqual([1920, 1080]);
  });

  it("are saved and checked on load", () => {
    const { p, box } = setup();
    expect(parseProject(structuredClone(p)).ok).toBe(true);
    const bad = structuredClone(p);
    (all(bad).find((l) => l.id === box) as unknown as { size: unknown }).size =
      "big";
    expect(parseProject(bad).ok).toBe(false);
  });
});
