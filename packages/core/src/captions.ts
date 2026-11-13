/**
 * Captions from subtitle files (SubRip .srt and WebVTT .vtt), turned into
 * text clips. Real-world files are messy, so parsing is forgiving: a broken
 * entry is skipped, never the whole file.
 */
import {
  createTextLayer,
  createTrack,
  type Project,
  rootComposition,
  type TextStyle,
  type Track,
} from "./model.ts";
import { type Micros, sec } from "./time.ts";

export interface Cue {
  start: Micros;
  end: Micros;
  text: string;
}

/** "01:02:03,456", "02:03.456" or "1:02:03.4". */
const TIME = String.raw`(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})`;
const TIMING = new RegExp(`^\\s*${TIME}\\s*-->\\s*${TIME}`);

function toMicros(h?: string, m?: string, s?: string, frac?: string): Micros {
  const seconds =
    Number(h ?? 0) * 3600 +
    Number(m ?? 0) * 60 +
    Number(s ?? 0) +
    Number(`0.${frac ?? "0"}`);
  return sec(seconds);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function cleanLine(line: string): string {
  return line
    .replace(/\{\\[^}]*\}/g, "") // SSA-style overrides, e.g. {\an8}
    .replace(/<[^>]*>/g, "") // <i>, <b>, <v Speaker>, <c.yellow> ...
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .trim();
}

/** All cues in an SRT or WebVTT file, in time order. */
export function parseCaptions(source: string): Cue[] {
  const blocks = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const first = lines.find((l) => l.trim() !== "")?.trim() ?? "";
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(first)) continue;
    const at = lines.findIndex((l) => TIMING.test(l));
    if (at < 0) continue;
    const m = TIMING.exec(lines[at] as string);
    if (!m) continue;
    const start = toMicros(m[1], m[2], m[3], m[4]);
    const end = toMicros(m[5], m[6], m[7], m[8]);
    const text = lines
      .slice(at + 1)
      .map(cleanLine)
      .filter((l) => l !== "")
      .join("\n");
    if (text === "" || end <= start) continue;
    cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Add each cue as a text clip, centred near the bottom. Overlapping cues go
 * on extra tracks. Returns how many clips were added.
 */
export function addCaptions(
  p: Project,
  cues: Cue[],
  style: Partial<TextStyle> = {},
): number {
  if (cues.length === 0) return 0;
  const comp = rootComposition(p);
  const portrait = comp.height > comp.width;
  // Vertical video apps cover the bottom fifth with buttons, so sit higher.
  const y = Math.round(comp.height * (portrait ? 0.72 : 0.85));
  const size = Math.round(Math.min(comp.width, comp.height) * 0.055);
  const captionStyle: Partial<TextStyle> = {
    weight: 700,
    size,
    stroke: { color: "#000000", width: Math.max(2, Math.round(size * 0.08)) },
    shadow: { color: "#000000", blur: 8, x: 0, y: 2 },
    ...style,
  };

  // Each lane is a track; a cue goes in the first lane that is free by then.
  const lanes: { track: Track; end: Micros }[] = [];
  for (const cue of cues) {
    let lane = lanes.find((l) => l.end <= cue.start);
    if (!lane) {
      lane = { track: createTrack("visual", { name: "Captions" }), end: 0 };
      lanes.push(lane);
    }
    const layer = createTextLayer(comp, cue.start, cue.text, captionStyle);
    layer.duration = cue.end - cue.start;
    layer.transform.position.value = [comp.width / 2, y];
    lane.track.layers.push(layer);
    lane.end = cue.end;
  }
  // Later lanes (the overlaps) go on top.
  for (const lane of lanes) comp.tracks.unshift(lane.track);
  return cues.length;
}
