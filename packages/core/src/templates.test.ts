import { describe, expect, it } from "vitest";
import { addAsset, appendAsset } from "./edit.ts";
import { evaluateFrame, projectDuration } from "./evaluate.ts";
import { ASPECTS, type Asset, rootComposition } from "./model.ts";
import { parseProject } from "./serialize.ts";
import { projectFromTemplate, TEMPLATES } from "./templates.ts";
import { sec } from "./time.ts";

describe("templates", () => {
  it("each one makes a valid project of the right shape and length", () => {
    for (const t of TEMPLATES) {
      const p = projectFromTemplate(t.id)!;
      expect(p, t.id).not.toBeNull();
      expect(p.name).toBe(t.name);
      expect(parseProject(structuredClone(p)).ok, t.id).toBe(true);
      const comp = rootComposition(p);
      expect([comp.width, comp.height], t.id).toEqual([
        ASPECTS[t.aspect].width,
        ASPECTS[t.aspect].height,
      ]);
      expect(projectDuration(p), t.id).toBeGreaterThanOrEqual(sec(3));
      // Something is on screen at its preview moment.
      expect(evaluateFrame(p, sec(t.previewAt)).length, t.id).toBeGreaterThan(
        0,
      );
    }
  });

  it("keeps every clip on the canvas, at the times it was given", () => {
    for (const t of TEMPLATES) {
      const p = projectFromTemplate(t.id)!;
      const comp = rootComposition(p);
      for (const l of comp.tracks.flatMap((x) => x.layers)) {
        const [x, y] = l.transform.position.value;
        expect(x, `${t.id} ${l.name}`).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(comp.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(comp.height);
        expect(l.start).toBeGreaterThanOrEqual(0);
      }
    }
    // Spot check: the countdown's "2" is on screen from 1 s to 2 s exactly.
    const p = projectFromTemplate("countdown")!;
    const two = rootComposition(p)
      .tracks.flatMap((t) => t.layers)
      .find((l) => l.kind === "text" && l.text === "2")!;
    expect([two.start, two.duration]).toEqual([sec(1), sec(1)]);
  });

  it("lists every font it uses", () => {
    for (const t of TEMPLATES) {
      const p = projectFromTemplate(t.id)!;
      const used = new Set(
        rootComposition(p)
          .tracks.flatMap((x) => x.layers)
          .flatMap((l) => (l.kind === "text" ? [l.style.font] : [])),
      );
      expect([...used].sort(), t.id).toEqual([...new Set(t.fonts)].sort());
    }
  });

  it("makes a fresh project every time", () => {
    const a = projectFromTemplate("quote")!;
    const b = projectFromTemplate("quote")!;
    expect(a.id).not.toBe(b.id);
    const ids = (p: typeof a) =>
      rootComposition(p).tracks.flatMap((t) => t.layers.map((l) => l.id));
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
    expect(projectFromTemplate("nope")).toBeNull();
  });

  it("a name label goes over the user's own video", () => {
    const p = projectFromTemplate("lower-third")!;
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
    addAsset(p, video);
    appendAsset(p, "v");
    const order = evaluateFrame(p, sec(2)).map((d) =>
      d.source.kind === "video" ? "video" : "graphic",
    );
    // Bottom to top: the video first, then the label on top of it.
    expect(order[0]).toBe("video");
    expect(order.slice(1).every((o) => o === "graphic")).toBe(true);
  });
});
