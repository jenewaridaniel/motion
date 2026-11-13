import { describe, expect, it } from "vitest";
import {
  addAsset,
  addText,
  appendAsset,
  moveLayer,
  setAspect,
  setPropertyValue,
  setText,
  setTextStyle,
  splitLayer,
  toggleKeyframe,
  trimLayer,
} from "./edit.ts";
import { collectAudioSegments, evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import {
  type Asset,
  createProject,
  type Project,
  rootComposition,
  type TextLayer,
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
  hasAudio: true,
};

function withText(at = sec(1)) {
  const h = new History();
  let p = h.apply(createProject(), (d) => {
    addAsset(d, video);
    appendAsset(d, "v");
  });
  let id = "";
  p = h.apply(p, (d) => {
    id = addText(d, at) ?? "";
  });
  return { h, p, id };
}

const textLayers = (p: Project) =>
  rootComposition(p)
    .tracks.flatMap((t) => t.layers)
    .filter((l): l is TextLayer => l.kind === "text");

describe("text layers", () => {
  it("adds a text clip at the playhead on its own track, above the video", () => {
    const { p, id } = withText(sec(2));
    const comp = rootComposition(p);
    const t = comp.tracks[0]!;
    expect(t.layers[0]!.id).toBe(id);
    expect(t.magnetic).toBe(false);
    const layer = t.layers[0] as TextLayer;
    expect(layer.kind).toBe("text");
    expect(layer.start).toBe(sec(2));
    expect(layer.duration).toBe(sec(3));
    expect(layer.text.length).toBeGreaterThan(0);
    // Centred on the canvas.
    expect(layer.transform.position.value).toEqual([540, 960]);
  });

  it("reuses a text track when there is room, and stacks a new one when not", () => {
    const { h, p: p0 } = withText(sec(0));
    let p = h.apply(p0, (d) => void addText(d, sec(5)));
    expect(rootComposition(p).tracks.length).toBe(2); // one text track + main
    p = h.apply(p, (d) => void addText(d, sec(1))); // overlaps the first
    expect(rootComposition(p).tracks.length).toBe(3);
  });

  it("draws text over the video with the text and style the renderer needs", () => {
    const { p } = withText(sec(1));
    const draws = evaluateFrame(p, sec(2));
    expect(draws.map((d) => d.source.kind)).toEqual(["video", "text"]);
    const text = draws[1]!;
    if (text.source.kind !== "text") throw new Error("expected text");
    expect(text.source.style.color).toBe("#ffffff");
    // Layer space origin is the middle of the text, at the canvas centre.
    expect(apply(text.matrix, 0, 0)).toEqual([540, 960]);
    // Not drawn before it starts.
    expect(evaluateFrame(p, sec(0.5)).map((d) => d.source.kind)).toEqual([
      "video",
    ]);
  });

  it("edits the words and style, and keeps the clip name in step", () => {
    const { h, p: p0, id } = withText();
    const p = h.apply(p0, (d) => {
      setText(d, id, "Summer\nin Lagos");
      setTextStyle(d, id, {
        color: "#ff7356",
        size: 120,
        stroke: { color: "#000000", width: 6 },
      });
    });
    const layer = textLayers(p)[0]!;
    expect(layer.text).toBe("Summer\nin Lagos");
    expect(layer.name).toBe("Summer");
    expect(layer.style.color).toBe("#ff7356");
    expect(layer.style.size).toBe(120);
    expect(layer.style.stroke).toEqual({ color: "#000000", width: 6 });
    // Untouched fields keep their values.
    expect(layer.style.align).toBe("center");
  });

  it("can be stretched to any length and from either edge (no source to run out)", () => {
    const { h, p: p0, id } = withText(sec(4));
    let p = h.apply(p0, (d) => void trimLayer(d, id, "end", sec(60)));
    expect(textLayers(p)[0]!.duration).toBe(sec(56));
    p = h.apply(p, (d) => void trimLayer(d, id, "start", sec(1)));
    expect(textLayers(p)[0]!.start).toBe(sec(1));
    expect(textLayers(p)[0]!.duration).toBe(sec(59));
  });

  it("splits into two clips with the same words, style and animation", () => {
    const { h, p: p0, id } = withText(sec(0));
    let p = h.apply(p0, (d) => {
      toggleKeyframe(d, id, "opacity", 0);
      setPropertyValue(d, id, "opacity", 0, 0);
      toggleKeyframe(d, id, "opacity", sec(2));
      setPropertyValue(d, id, "opacity", 1, sec(2));
    });
    const before = evaluateFrame(p, sec(1.5))[1]!.opacity;
    p = h.apply(p, (d) => void splitLayer(d, id, sec(1)));
    const [a, b] = textLayers(p);
    expect(b!.text).toBe(a!.text);
    expect(b!.style).toEqual(a!.style);
    expect(evaluateFrame(p, sec(1.5))[1]!.opacity).toBeCloseTo(before, 6);
  });

  it("moves along its track and refuses to overlap another text clip", () => {
    const { h, p: p0, id } = withText(sec(0));
    let p = h.apply(p0, (d) => void addText(d, sec(5)));
    const track = rootComposition(p).tracks[0]!;
    p = h.apply(p, (d) => void moveLayer(d, id, track.id, sec(4))); // would overlap
    expect(textLayers(p).find((l) => l.id === id)!.start).toBe(0);
    p = h.apply(p, (d) => void moveLayer(d, id, track.id, sec(9)));
    expect(textLayers(p).find((l) => l.id === id)!.start).toBe(sec(9));
  });

  it("stays in the same relative place when the canvas shape changes", () => {
    const { h, p: p0, id } = withText();
    let p = h.apply(p0, (d) => {
      setPropertyValue(d, id, "transform.position", [540, 1600], sec(1));
    });
    p = h.apply(p, (d) => setAspect(d, "16:9"));
    // 9:16 (1080x1920) to 16:9 (1920x1080): same fraction of width and height.
    expect(textLayers(p)[0]!.transform.position.value).toEqual([960, 900]);
  });

  it("has no sound", () => {
    const { p } = withText();
    expect(collectAudioSegments(p).map((s) => s.assetId)).toEqual(["v"]);
  });

  it("survives saving and loading, and bad text data is refused", () => {
    const { p } = withText();
    const stored = structuredClone(p);
    const r = parseProject(stored);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);

    const broken = structuredClone(p);
    (
      textLayers(broken)[0] as unknown as { style: { size: string } }
    ).style.size = "big";
    expect(parseProject(broken).ok).toBe(false);

    const noText = structuredClone(p);
    delete (textLayers(noText)[0] as unknown as { text?: string }).text;
    expect(parseProject(noText).ok).toBe(false);
  });
});
