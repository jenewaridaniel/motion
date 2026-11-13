import { expect, it } from "vitest";
import {
  addAsset,
  appendAsset,
  moveLayer,
  trimStartToDuration,
} from "./edit.ts";
import { History } from "./history.ts";
import { type Asset, createProject, rootComposition } from "./model.ts";
import { sec } from "./time.ts";

const video = (id: string, seconds = 10): Asset => ({
  id,
  kind: "video",
  name: id,
  duration: sec(seconds),
  width: 1920,
  height: 1080,
  hasVideo: true,
  hasAudio: true,
});

it("dragging the start edge on the main track: repeating the same target must not trim more", () => {
  const h = new History();
  let p = h.apply(createProject(), (d) => {
    addAsset(d, video("a"));
    addAsset(d, video("b"));
    appendAsset(d, "a");
    appendAsset(d, "b");
  });
  const main = () => rootComposition(p).tracks[0]!;
  const b = main().layers[1]!;
  // A drag sends the same target on every pointer move.
  for (let i = 0; i < 5; i++) {
    p = h.apply(p, (d) => void trimStartToDuration(d, b.id, sec(9)), "drag");
  }
  const after = main().layers[1]!;
  expect(after.kind === "media" && after.inPoint).toBe(sec(1));
  expect(after.duration).toBe(sec(9));
  expect(after.start).toBe(sec(10)); // still packed against the first clip
  // Dragging back out restores the full clip.
  p = h.apply(p, (d) => void trimStartToDuration(d, b.id, sec(10)), "drag");
  const back = main().layers[1]!;
  expect(back.kind === "media" && back.inPoint).toBe(0);
  expect(back.duration).toBe(sec(10));
});

it("a long clip can be dragged in front of a shorter first clip", () => {
  const h = new History();
  let p = h.apply(createProject(), (d) => {
    addAsset(d, video("short", 4));
    addAsset(d, video("long", 9));
    appendAsset(d, "short");
    appendAsset(d, "long");
  });
  const main = () => rootComposition(p).tracks[0]!;
  const long = main().layers[1]!;
  // Pointer dragged to the far left; repeated as a drag would.
  for (let i = 0; i < 3; i++) {
    p = h.apply(
      p,
      (d) => void moveLayer(d, long.id, main().id, sec(0.3)),
      "drag",
    );
  }
  expect(main().layers.map((l) => l.name)).toEqual(["long", "short"]);
  expect(main().layers.map((l) => l.start)).toEqual([0, sec(9)]);
});
