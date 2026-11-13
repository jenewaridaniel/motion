import { describe, expect, it } from "vitest";
import { checkSupport, type Env, limitsMessage } from "./support.ts";

const everything: Env = {
  VideoDecoder: 1,
  VideoEncoder: 1,
  AudioDecoder: 1,
  AudioEncoder: 1,
  OffscreenCanvas: 1,
  indexedDB: 1,
  AudioContext: 1,
  webgl2: true,
};

describe("browser support", () => {
  it("a current browser has everything", () => {
    expect(checkSupport(everything)).toEqual({ missing: [], limits: [] });
    expect(limitsMessage([])).toBeNull();
  });

  it("missing essentials block the editor", () => {
    const s = checkSupport({
      ...everything,
      webgl2: false,
      VideoDecoder: undefined,
    });
    expect(s.missing).toEqual([
      "WebGL 2 (to draw the video)",
      "WebCodecs (to read video files)",
    ]);
  });

  it("missing sound or export encoders are only limits", () => {
    // Like an older Safari: no audio decoder or encoder.
    const s = checkSupport({
      ...everything,
      AudioDecoder: undefined,
      AudioEncoder: undefined,
    });
    expect(s.missing).toEqual([]);
    expect(s.limits).toEqual([
      "play the sound in your clips",
      "put sound in exported videos",
    ]);
    expect(limitsMessage(s.limits)).toBe(
      "This browser can't play the sound in your clips or put sound in exported videos. For everything, use the latest Chrome, Edge, Safari or Firefox.",
    );
    // No video encoder: export is out entirely (sound doesn't matter then).
    expect(
      checkSupport({
        ...everything,
        VideoEncoder: undefined,
        AudioEncoder: undefined,
      }).limits,
    ).toEqual(["export videos"]);
  });
});
