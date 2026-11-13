import { describe, expect, it } from "vitest";
import { addCaptions, parseCaptions } from "./captions.ts";
import { History } from "./history.ts";
import { createProject, rootComposition, type TextLayer } from "./model.ts";
import { sec } from "./time.ts";

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello there

2
00:00:04,000 --> 00:00:06,250
Two lines
of text
`;

describe("parseCaptions", () => {
  it("reads SRT", () => {
    expect(parseCaptions(SRT)).toEqual([
      { start: sec(1), end: sec(3.5), text: "Hello there" },
      { start: sec(4), end: sec(6.25), text: "Two lines\nof text" },
    ]);
  });

  it("reads WebVTT, with or without hours, with cue ids, settings and notes", () => {
    const vtt = `WEBVTT - My captions

NOTE This is a comment
that spans lines

intro
00:01.000 --> 00:02.500 align:center line:90%
First

00:00:03.000 --> 00:00:04.000
<v Speaker>Second</v>
`;
    expect(parseCaptions(vtt)).toEqual([
      { start: sec(1), end: sec(2.5), text: "First" },
      { start: sec(3), end: sec(4), text: "Second" },
    ]);
  });

  it("copes with Windows line endings and a byte-order mark", () => {
    const messy = `﻿${SRT.replace(/\n/g, "\r\n")}`;
    expect(parseCaptions(messy)).toHaveLength(2);
    expect(parseCaptions(messy)[1]?.text).toBe("Two lines\nof text");
  });

  it("removes formatting tags and decodes common entities", () => {
    const srt = `1
00:00:00,000 --> 00:00:01,000
{\\an8}<i>Quiet</i> &amp; <b>loud</b> &lt;3
`;
    expect(parseCaptions(srt)[0]?.text).toBe("Quiet & loud <3");
  });

  it("skips broken or empty entries but keeps the good ones, in time order", () => {
    const srt = `1
not a time
Lost

2
00:00:05,000 --> 00:00:06,000
Later

3
00:00:02,000 --> 00:00:02,000
Zero length

4
00:00:01,000 --> 00:00:02,000

5
00:00:00,500 --> 00:00:01,000
Earlier
`;
    expect(parseCaptions(srt).map((c) => c.text)).toEqual(["Earlier", "Later"]);
  });

  it("returns nothing for a file that isn't captions", () => {
    expect(parseCaptions("just some notes\nwith no times")).toEqual([]);
    expect(parseCaptions("")).toEqual([]);
  });
});

describe("addCaptions", () => {
  it("adds one text clip per caption on a Captions track, near the bottom", () => {
    const h = new History();
    let n = 0;
    const p = h.apply(createProject(), (d) => {
      n = addCaptions(d, parseCaptions(SRT));
    });
    expect(n).toBe(2);
    const comp = rootComposition(p);
    const track = comp.tracks[0]!;
    expect(track.name).toBe("Captions");
    const clips = track.layers as TextLayer[];
    expect(clips.map((c) => [c.start, c.duration, c.text])).toEqual([
      [sec(1), sec(2.5), "Hello there"],
      [sec(4), sec(2.25), "Two lines\nof text"],
    ]);
    // Centred horizontally, in the lower part of the frame.
    const [x, y] = clips[0]!.transform.position.value;
    expect(x).toBe(comp.width / 2);
    expect(y).toBeGreaterThan(comp.height * 0.6);
    // Readable on any footage: outlined.
    expect(clips[0]!.style.stroke).not.toBeNull();
  });

  it("puts overlapping captions on a second track instead of dropping them", () => {
    const cues = [
      { start: sec(0), end: sec(3), text: "A" },
      { start: sec(1), end: sec(2), text: "B" },
      { start: sec(3), end: sec(4), text: "C" },
    ];
    const p = new History().apply(
      createProject(),
      (d) => void addCaptions(d, cues),
    );
    const tracks = rootComposition(p).tracks.filter(
      (t) => t.name === "Captions",
    );
    expect(tracks).toHaveLength(2);
    const texts = tracks.map((t) =>
      (t.layers as TextLayer[]).map((l) => l.text),
    );
    expect(texts).toEqual([["B"], ["A", "C"]]);
  });

  it("is one undo step", () => {
    const h = new History();
    const p0 = createProject();
    const p = h.apply(p0, (d) => void addCaptions(d, parseCaptions(SRT)));
    expect(
      rootComposition(h.undo(p)).tracks.some((t) => t.name === "Captions"),
    ).toBe(false);
  });

  it("accepts a style override, e.g. the editor's font", () => {
    const p = new History().apply(
      createProject(),
      (d) =>
        void addCaptions(d, parseCaptions(SRT), { font: "Inter Variable" }),
    );
    const clip = rootComposition(p).tracks[0]!.layers[0] as TextLayer;
    expect(clip.style.font).toBe("Inter Variable");
  });
});
