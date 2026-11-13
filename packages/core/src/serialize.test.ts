import { describe, expect, it } from "vitest";
import {
  addAsset,
  addOverlay,
  appendAsset,
  setPropertyValue,
  toggleKeyframe,
} from "./edit.ts";
import { History } from "./history.ts";
import {
  type Asset,
  createProject,
  type Project,
  rootComposition,
} from "./model.ts";
import { isSameMedia, PROJECT_VERSION, parseProject } from "./serialize.ts";
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
const photo: Asset = {
  id: "p1",
  kind: "image",
  name: "photo",
  duration: 0,
  width: 800,
  height: 800,
  hasVideo: true,
  hasAudio: false,
};

/** A project with every kind of thing that gets saved: clips, an overlay, keyframes. */
function richProject(): Project {
  const h = new History();
  let p = createProject("Holiday");
  p = h.apply(p, (d) => {
    addAsset(d, video);
    addAsset(d, photo);
    appendAsset(d, "v1");
    addOverlay(d, "p1", sec(1));
  });
  const id = rootComposition(p).tracks[1]!.layers[0]!.id;
  p = h.apply(p, (d) => {
    toggleKeyframe(d, id, "transform.scale", 0);
    setPropertyValue(d, id, "transform.scale", [2, 2], sec(3));
  });
  return p;
}

/** What IndexedDB does to a value: a structured clone, which drops Immer's freezing. */
const roundTrip = <T>(v: T): T => structuredClone(v);

describe("parseProject", () => {
  it("accepts a project after a storage round trip, unchanged", () => {
    const p = richProject();
    const result = parseProject(roundTrip(p));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project).toEqual(p);
  });

  it("accepts a brand-new empty project", () => {
    expect(parseProject(roundTrip(createProject())).ok).toBe(true);
  });

  it("rejects things that aren't projects", () => {
    for (const bad of [null, undefined, 42, "x", [], {}]) {
      expect(parseProject(bad).ok).toBe(false);
    }
  });

  it("explains a project from a newer version", () => {
    const p = { ...roundTrip(richProject()), version: PROJECT_VERSION + 1 };
    const r = parseProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/newer version/);
  });

  it("rejects a clip that points at a missing file", () => {
    const p = roundTrip(richProject()) as unknown as {
      assets: Record<string, unknown>;
    };
    delete p.assets.v1;
    const r = parseProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing asset/);
  });

  it("rejects a missing main timeline", () => {
    const p = { ...roundTrip(richProject()), rootCompositionId: "nope" };
    expect(parseProject(p).ok).toBe(false);
  });

  it("rejects broken keyframes and broken timing", () => {
    const a = roundTrip(richProject());
    const layer = rootComposition(a).tracks[1]!.layers[0]! as unknown as {
      transform: { scale: { keyframes: unknown[] } };
    };
    layer.transform.scale.keyframes.push({ time: "soon", value: [1, 1] });
    expect(parseProject(a).ok).toBe(false);

    const b = roundTrip(richProject());
    (
      rootComposition(b).tracks[0]!.layers[0]! as { duration: number }
    ).duration = Number.NaN;
    expect(parseProject(b).ok).toBe(false);
  });
});

describe("isSameMedia", () => {
  it("matches the same file read twice, even with a tiny duration difference", () => {
    expect(
      isSameMedia(video, {
        ...video,
        id: "other",
        duration: video.duration + 500,
      }),
    ).toBe(true);
  });

  it("does not match a different file", () => {
    expect(isSameMedia(video, { ...video, width: 1280 })).toBe(false);
    expect(
      isSameMedia(video, { ...video, duration: video.duration + sec(1) }),
    ).toBe(false);
    expect(isSameMedia(video, { ...video, hasAudio: false })).toBe(false);
    expect(isSameMedia(video, photo)).toBe(false);
  });

  it("can require the same name, for reconnecting a missing file", () => {
    const renamed = { ...video, id: "x", name: "clip copy" };
    expect(isSameMedia(video, renamed)).toBe(true);
    expect(isSameMedia(video, renamed, { name: true })).toBe(false);
  });
});
