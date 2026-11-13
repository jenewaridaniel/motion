import { describe, expect, it } from "vitest";
import {
  addAsset,
  appendAsset,
  extractAudio,
  moveLayer,
  setAudioFade,
  setPropertyValue,
  setTransition,
  setTransitionDuration,
  splitLayer,
  toggleKeyframe,
  trimLayer,
} from "./edit.ts";
import {
  audioGainAt,
  collectAudioSegments,
  evaluateFrame,
} from "./evaluate.ts";
import { History } from "./history.ts";
import {
  type Asset,
  createProject,
  type MediaLayer,
  type Project,
  rootComposition,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import { sec } from "./time.ts";
import { encodeWav } from "./wav.ts";

const video = (id: string, hasAudio = true): Asset => ({
  id,
  kind: "video",
  name: id,
  duration: sec(10),
  width: 1920,
  height: 1080,
  hasVideo: true,
  hasAudio,
});
const music: Asset = {
  id: "m",
  kind: "audio",
  name: "music",
  duration: sec(20),
  width: 0,
  height: 0,
  hasVideo: false,
  hasAudio: true,
};

function setup() {
  const h = new History();
  const p = h.apply(createProject(), (d) => {
    addAsset(d, video("v"));
    addAsset(d, music);
    appendAsset(d, "v");
    appendAsset(d, "m", 0);
  });
  const all = rootComposition(p).tracks.flatMap((t) => t.layers);
  return {
    h,
    p,
    v: all.find((l) => l.name === "v")!.id,
    m: all.find((l) => l.name === "music")!.id,
  };
}

const layers = (p: Project) =>
  rootComposition(p).tracks.flatMap((t) => t.layers) as MediaLayer[];
const seg = (p: Project, id: string) =>
  collectAudioSegments(p).find((s) => s.layerId === id)!;

describe("sound fades", () => {
  it("fade in from silence and out to silence, at the clip's ends", () => {
    const { h, p: p0, m } = setup();
    const p = h.apply(p0, (d) => {
      setAudioFade(d, m, "in", sec(2));
      setAudioFade(d, m, "out", sec(3));
    });
    const s = seg(p, m);
    expect(s.fadeIn).toEqual({ start: 0, end: sec(2) });
    expect(s.fadeOut).toEqual({ start: sec(17), end: sec(20) });
    expect(audioGainAt(s, 0)).toBeCloseTo(0, 6);
    expect(audioGainAt(s, sec(1))).toBeGreaterThan(0.3);
    expect(audioGainAt(s, sec(1))).toBeLessThan(1);
    expect(audioGainAt(s, sec(10))).toBe(1);
    expect(audioGainAt(s, sec(20))).toBeCloseTo(0, 6);
  });

  it("are kept between 0 and 10 s, and 0 removes them", () => {
    const { h, p: p0, m } = setup();
    let p = h.apply(p0, (d) => void setAudioFade(d, m, "in", sec(60)));
    expect(layers(p).find((l) => l.id === m)!.fade).toEqual({
      in: sec(10),
      out: 0,
    });
    p = h.apply(p, (d) => void setAudioFade(d, m, "in", 0));
    expect(layers(p).find((l) => l.id === m)!.fade).toBeUndefined();
  });

  it("shrink to fit a short clip", () => {
    const { h, p: p0, v } = setup();
    // 10 s clip, 8 s in + 8 s out: scaled to 5 s each.
    const p = h.apply(p0, (d) => {
      setAudioFade(d, v, "in", sec(8));
      setAudioFade(d, v, "out", sec(8));
    });
    const s = seg(p, v);
    expect(s.fadeIn).toEqual({ start: 0, end: sec(5) });
    expect(s.fadeOut).toEqual({ start: sec(5), end: sec(10) });
  });

  it("stay at the outer ends when the clip is split", () => {
    const { h, p: p0, m } = setup();
    let p = h.apply(p0, (d) => {
      setAudioFade(d, m, "in", sec(1));
      setAudioFade(d, m, "out", sec(1));
    });
    p = h.apply(p, (d) => void splitLayer(d, m, sec(10)));
    const music = layers(p).filter((l) => l.assetId === "m");
    expect(music.map((l) => l.fade)).toEqual([
      { in: sec(1), out: 0 },
      { in: 0, out: sec(1) },
    ]);
  });

  it("join a transition's crossfade at the same end", () => {
    const h = new History();
    let p = h.apply(createProject(), (d) => {
      addAsset(d, video("a"));
      addAsset(d, video("b"));
      appendAsset(d, "a");
      appendAsset(d, "b");
    });
    const [a, b] = layers(p).map((l) => l.id) as [string, string];
    p = h.apply(p, (d) => {
      setTransition(d, b, "dissolve");
      setTransitionDuration(d, b, sec(1));
      setAudioFade(d, b, "in", sec(2));
    });
    // Transition fade starts at the cut (no spare sound before B), the
    // clip's own 2 s fade ends later: one fade over both.
    expect(seg(p, b).fadeIn).toEqual({ start: sec(10), end: sec(12) });
    expect(seg(p, a).fadeOut).toEqual({ start: sec(9.5), end: sec(10) });
  });

  it("are saved and checked on load", () => {
    const { h, p: p0, m } = setup();
    const p = h.apply(p0, (d) => void setAudioFade(d, m, "out", sec(2)));
    const r = parseProject(structuredClone(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);
    const bad = structuredClone(p);
    (layers(bad).find((l) => l.id === m)!.fade as { out: number }).out = -1;
    expect(parseProject(bad).ok).toBe(false);
  });
});

describe("extract audio", () => {
  it("moves the sound to an audio clip with the same timing and mutes the video", () => {
    const { h, p: p0, v } = setup();
    let audioId: string | null = null;
    let p = h.apply(p0, (d) => {
      setPropertyValue(d, v, "volume", 0.6, 0);
      setAudioFade(d, v, "in", sec(1));
    });
    p = h.apply(p, (d) => {
      audioId = extractAudio(d, v);
    });
    expect(audioId).not.toBeNull();
    const audio = layers(p).find((l) => l.id === audioId)!;
    const vid = layers(p).find((l) => l.id === v)!;
    const track = rootComposition(p).tracks.find((t) =>
      t.layers.some((l) => l.id === audioId),
    )!;
    expect(track.kind).toBe("audio");
    expect([audio.start, audio.duration, audio.inPoint, audio.speed]).toEqual([
      vid.start,
      vid.duration,
      vid.inPoint,
      vid.speed,
    ]);
    expect(audio.volume.value).toBe(0.6);
    expect(audio.fade).toEqual({ in: sec(1), out: 0 });
    // Sound now comes only from the audio clip; the picture is unchanged.
    const sounds = collectAudioSegments(p).map((s) => s.layerId);
    expect(sounds).toContain(audioId);
    expect(sounds).not.toContain(v);
    expect(evaluateFrame(p, sec(1)).map((d) => d.layerId)).toEqual([v]);
  });

  it("doesn't overlap the music: uses a new audio track", () => {
    const { h, p: p0, v, m } = setup();
    let audioId: string | null = null;
    const p = h.apply(p0, (d) => {
      audioId = extractAudio(d, v);
    });
    const trackOf = (id: string) =>
      rootComposition(p).tracks.find((t) => t.layers.some((l) => l.id === id));
    expect(trackOf(audioId!)).not.toBe(trackOf(m));
  });

  it("does nothing for clips without sound, or already extracted", () => {
    const { h, p: p0, v, m } = setup();
    let second: string | null = "x";
    let p = h.apply(p0, (d) => void extractAudio(d, v));
    p = h.apply(p, (d) => {
      second = extractAudio(d, v);
    });
    expect(second).toBeNull();
    let fromMusic: string | null = "x";
    h.apply(p, (d) => {
      fromMusic = extractAudio(d, m);
    });
    expect(fromMusic).toBeNull();
  });

  it("undo puts the sound back on the video", () => {
    const { h, p: p0, v } = setup();
    const p = h.apply(p0, (d) => void extractAudio(d, v));
    const back = h.undo(p);
    expect(layers(back).length).toBe(2);
    expect(layers(back).find((l) => l.id === v)!.volume.value).toBe(1);
  });

  it("keeps a transition's crossfade while it stays in step with its video", () => {
    const h = new History();
    let p = h.apply(createProject(), (d) => {
      addAsset(d, video("a"));
      addAsset(d, video("b"));
      appendAsset(d, "a");
      appendAsset(d, "b");
    });
    const [a, b] = layers(p).map((l) => l.id) as [string, string];
    p = h.apply(p, (d) => {
      trimLayer(d, a, "end", sec(8));
      setTransition(d, b, "dissolve");
      setTransitionDuration(d, b, sec(1));
    });
    const before = { a: seg(p, a), b: seg(p, b) };
    let ea: string | null = null;
    let eb: string | null = null;
    p = h.apply(p, (d) => {
      ea = extractAudio(d, a);
      eb = extractAudio(d, b);
    });
    // Same crossfade as before, now on the audio clips.
    const strip = (s: ReturnType<typeof seg>) => ({
      start: s.start,
      duration: s.duration,
      sourceIn: s.sourceIn,
      fadeIn: s.fadeIn,
      fadeOut: s.fadeOut,
    });
    expect(strip(seg(p, ea!))).toEqual(strip(before.a));
    expect(strip(seg(p, eb!))).toEqual(strip(before.b));
    // Moved on its own, it's independent: no crossfade any more.
    p = h.apply(p, (d) => {
      const track = rootComposition(d).tracks.find((t) =>
        t.layers.some((l) => l.id === eb),
      )!;
      moveLayer(d, eb!, track.id, sec(12));
    });
    expect(seg(p, eb!).fadeIn).toBeNull();
    expect(seg(p, eb!).start).toBe(sec(12));
  });

  it("keeps volume keyframes in step", () => {
    const { h, p: p0, v } = setup();
    let audioId: string | null = null;
    let p = h.apply(p0, (d) => {
      toggleKeyframe(d, v, "volume", 0);
      toggleKeyframe(d, v, "volume", sec(4));
      setPropertyValue(d, v, "volume", 0.2, sec(4));
    });
    const before = audioGainAt(seg(p, v), sec(2));
    p = h.apply(p, (d) => {
      audioId = extractAudio(d, v);
    });
    expect(audioGainAt(seg(p, audioId!), sec(2))).toBeCloseTo(before, 9);
  });
});

describe("encodeWav", () => {
  it("writes a standard 16-bit PCM header and the samples", () => {
    const left = new Float32Array([0, 1, -1, 0.5]);
    const right = new Float32Array([0, -0.5, 2, 0]);
    const wav = encodeWav([left, right], 48000);
    const view = new DataView(wav.buffer);
    const str = (a: number, n: number) =>
      String.fromCharCode(...wav.slice(a, a + n));
    expect(str(0, 4)).toBe("RIFF");
    expect(str(8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(wav.length).toBe(44 + 16);
    // Interleaved L, R. 2 is clipped to 1.
    const s = (i: number) => view.getInt16(44 + i * 2, true);
    expect([s(0), s(1), s(2), s(3), s(4), s(5)]).toEqual([
      0, 0, 32767, -16384, -32768, 32767,
    ]);
  });
});
