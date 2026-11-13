import { describe, expect, it } from "vitest";
import { addAsset, addText, appendAsset } from "./edit.ts";
import { History } from "./history.ts";
import { type Asset, createProject, rootComposition } from "./model.ts";
import { duplicateProject, projectSummary, reidProject } from "./projects.ts";
import { parseProject } from "./serialize.ts";
import { sec } from "./time.ts";

const video: Asset = {
  id: "v1",
  kind: "video",
  name: "clip",
  duration: sec(8),
  width: 1920,
  height: 1080,
  hasVideo: true,
  hasAudio: true,
};

function sample() {
  const h = new History();
  return h.apply(createProject("Holiday"), (d) => {
    addAsset(d, video);
    appendAsset(d, "v1");
    addText(d, sec(1));
  });
}

describe("duplicateProject", () => {
  it("makes an independent copy with a new id and a 'copy' name", () => {
    const p = sample();
    const copy = duplicateProject(p);
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe("Holiday copy");
    // Same media (files are shared by asset id), same timeline.
    expect(copy.assets).toEqual(p.assets);
    expect(rootComposition(copy).tracks).toEqual(rootComposition(p).tracks);
    expect(parseProject(structuredClone(copy)).ok).toBe(true);
  });

  it("doesn't share objects with the original", () => {
    const p = sample();
    const copy = duplicateProject(p);
    rootComposition(copy).tracks[0]!.name = "Changed";
    expect(rootComposition(p).tracks[0]!.name).not.toBe("Changed");
  });

  it("numbers repeated copies", () => {
    const p = sample();
    expect(duplicateProject(p, ["Holiday copy"]).name).toBe("Holiday copy 2");
    expect(duplicateProject(p, ["Holiday copy", "Holiday copy 2"]).name).toBe(
      "Holiday copy 3",
    );
  });
});

describe("reidProject", () => {
  it("gives an opened project file a new id so it never overwrites a project here", () => {
    const p = sample();
    const opened = reidProject(structuredClone(p));
    expect(opened.id).not.toBe(p.id);
    expect(opened.name).toBe(p.name);
    expect(opened.assets).toEqual(p.assets);
  });

  it("numbers the name when a project with that name is already here", () => {
    const p = sample();
    expect(reidProject(structuredClone(p), ["Holiday"]).name).toBe("Holiday 2");
    expect(reidProject(structuredClone(p), ["holiday", "Holiday 2"]).name).toBe(
      "Holiday 3",
    );
    expect(reidProject(structuredClone(p), ["Other"]).name).toBe("Holiday");
  });
});

describe("projectSummary", () => {
  it("describes a project for the list", () => {
    const s = projectSummary(sample(), 1_700_000_000_000);
    expect(s).toMatchObject({
      name: "Holiday",
      savedAt: 1_700_000_000_000,
      duration: sec(8),
      width: 1080,
      height: 1920,
      clips: 2,
      ok: true,
    });
  });

  it("still lists a project that can't be opened, so it can be deleted", () => {
    const broken = { id: "x1", name: "Old", version: 99 };
    const s = projectSummary(broken, 5);
    expect(s).toMatchObject({ id: "x1", name: "Old", ok: false });
    expect(s.problem).toMatch(/newer version/);
  });

  it("copes with something that isn't a project at all", () => {
    const s = projectSummary(42, 0);
    expect(s.ok).toBe(false);
    expect(s.name).toBe("Untitled project");
  });
});
