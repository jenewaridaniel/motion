/**
 * Checking a saved project before it is loaded. Storage can hold anything:
 * an older format, a half-written record, or data from a future version.
 * Loading a broken project would crash the editor, so every saved project
 * goes through `parseProject` first.
 */
import { EFFECT_KINDS, MASK_SHAPES } from "./effects.ts";
import { ADJUST_KEYS, BLEND_MODES } from "./look.ts";
import {
  type Asset,
  type Project,
  TEXT_IN_ANIMATIONS,
  TEXT_LOOP_ANIMATIONS,
  TEXT_OUT_ANIMATIONS,
} from "./model.ts";
import { SHAPE_KINDS } from "./shapes.ts";
import { TRANSITION_KINDS } from "./transitions.ts";

/** The project format this build reads and writes. */
export const PROJECT_VERSION = 1;

export type ParseResult =
  | { ok: true; project: Project }
  | { ok: false; reason: string };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isVec2 = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** A Property<T>: a value, plus optional keyframes of the same shape. */
function isProperty(v: unknown, isValue: (x: unknown) => boolean): boolean {
  if (!isObj(v) || !isValue(v.value)) return false;
  if (v.keyframes === undefined) return true;
  return (
    Array.isArray(v.keyframes) &&
    v.keyframes.every(
      (k) => isObj(k) && isNum(k.time) && isValue(k.value) && isObj(k.easing),
    )
  );
}

function checkAsset(a: unknown, id: string): string | null {
  if (!isObj(a)) return `asset ${id} is not an object`;
  if (a.id !== id) return `asset ${id} has a mismatched id`;
  if (!["video", "image", "audio"].includes(a.kind as string)) {
    return `asset ${id} has an unknown kind`;
  }
  for (const k of ["duration", "width", "height"]) {
    if (!isNum(a[k])) return `asset ${id} has no valid ${k}`;
  }
  if (!isStr(a.name)) return `asset ${id} has no name`;
  return null;
}

const isColor = (v: unknown) => isStr(v) && /^#[0-9a-f]{6}$/i.test(v);

/** Optional parts of a text style are either null or a complete object. */
function isNullOr(v: unknown, check: (o: Obj) => boolean): boolean {
  return v === null || (isObj(v) && check(v));
}

function checkTextStyle(s: unknown): boolean {
  return (
    isObj(s) &&
    isStr(s.font) &&
    isNum(s.weight) &&
    typeof s.italic === "boolean" &&
    isNum(s.size) &&
    s.size > 0 &&
    isColor(s.color) &&
    ["left", "center", "right"].includes(s.align as string) &&
    isNum(s.lineHeight) &&
    isNum(s.letterSpacing) &&
    isNullOr(s.stroke, (o) => isColor(o.color) && isNum(o.width)) &&
    isNullOr(
      s.shadow,
      (o) => isColor(o.color) && isNum(o.blur) && isNum(o.x) && isNum(o.y),
    ) &&
    isNullOr(
      s.box,
      (o) => isColor(o.color) && isNum(o.padding) && isNum(o.radius),
    )
  );
}

function checkTextAnimation(a: unknown): boolean {
  const part = (v: unknown, kinds: readonly string[], field: string) =>
    isNullOr(
      v,
      (o) =>
        kinds.includes(o.kind as string) &&
        isNum(o[field]) &&
        (o[field] as number) >= 0,
    );
  return (
    isObj(a) &&
    part(a.in, TEXT_IN_ANIMATIONS, "duration") &&
    part(a.out, TEXT_OUT_ANIMATIONS, "duration") &&
    part(a.loop, TEXT_LOOP_ANIMATIONS, "period")
  );
}

function checkEffects(e: unknown): string | null {
  if (!isObj(e)) return "invalid effects";
  for (const [kind, v] of Object.entries(e)) {
    if (!EFFECT_KINDS.includes(kind as never) || !isObj(v)) {
      return `an unknown effect (${kind})`;
    }
    for (const [k, field] of Object.entries(v)) {
      if (kind === "chromaKey" && k === "color") {
        if (!isColor(field)) return "an invalid key colour";
      } else if (kind === "shake" && k === "speed") {
        if (!isNum(field)) return "an invalid shake speed";
      } else if (!isProperty(field, isNum)) {
        return `an invalid ${kind} setting (${k})`;
      }
    }
  }
  return null;
}

function checkLayer(l: unknown, p: Obj): string | null {
  if (!isObj(l) || !isStr(l.id)) return "a layer has no id";
  const where = `layer ${l.id}`;
  if (!isNum(l.start) || !isNum(l.duration) || l.duration <= 0) {
    return `${where} has invalid timing`;
  }
  const t = l.transform;
  if (
    !isObj(t) ||
    !isProperty(t.anchor, isVec2) ||
    !isProperty(t.position, isVec2) ||
    !isProperty(t.scale, isVec2) ||
    !isProperty(t.rotation, isNum)
  ) {
    return `${where} has an invalid transform`;
  }
  if (!isProperty(l.opacity, isNum)) return `${where} has invalid opacity`;
  if (l.blend !== undefined && !BLEND_MODES.includes(l.blend as never)) {
    return `${where} has an unknown blend mode`;
  }
  if (l.effects !== undefined) {
    const err = checkEffects(l.effects);
    if (err) return `${where} has ${err}`;
  }
  if (l.mask !== undefined) {
    const m = l.mask;
    if (
      !isObj(m) ||
      !MASK_SHAPES.includes(m.shape as never) ||
      !isProperty(m.center, isVec2) ||
      !isProperty(m.size, isVec2) ||
      !isProperty(m.rotation, isNum) ||
      !isProperty(m.feather, isNum) ||
      typeof m.invert !== "boolean"
    ) {
      return `${where} has an invalid mask`;
    }
  }
  if (l.lut !== undefined) {
    if (
      !isObj(l.lut) ||
      !isStr(l.lut.id) ||
      !isProperty(l.lut.intensity, isNum)
    ) {
      return `${where} has an invalid LUT`;
    }
    if (!isObj(p.luts) || !(l.lut.id in p.luts))
      return `${where} uses a missing LUT`;
  }
  if (l.transition !== undefined) {
    const tr = l.transition;
    if (
      !isObj(tr) ||
      !TRANSITION_KINDS.includes(tr.kind as never) ||
      !isNum(tr.duration) ||
      tr.duration <= 0
    ) {
      return `${where} has an invalid transition`;
    }
  }
  if (l.adjust !== undefined) {
    if (!isObj(l.adjust)) return `${where} has invalid adjustments`;
    for (const [k, v] of Object.entries(l.adjust)) {
      if (!ADJUST_KEYS.includes(k as never) || !isProperty(v, isNum)) {
        return `${where} has an invalid adjustment (${k})`;
      }
    }
  }
  if (l.kind === "placeholder") {
    if (!isStr(l.label) || !isVec2(l.size)) {
      return `${where} is an invalid placeholder`;
    }
    return null;
  }
  if (l.kind === "shape") {
    const st = l.style;
    const strokeOk = (v: unknown) =>
      v === null ||
      (isObj(v) && isColor(v.color) && isNum(v.width) && v.width >= 0);
    if (
      !SHAPE_KINDS.includes(l.shape as never) ||
      !isVec2(l.size) ||
      !isObj(st) ||
      !(st.fill === null || isColor(st.fill)) ||
      !strokeOk(st.stroke) ||
      !isNum(st.radius) ||
      !(
        st.gradient === undefined ||
        st.gradient === null ||
        (isObj(st.gradient) &&
          isColor(st.gradient.color) &&
          isNum(st.gradient.angle))
      )
    ) {
      return `${where} is an invalid shape`;
    }
    return null;
  }
  if (l.kind === "text") {
    if (!isStr(l.text)) return `${where} has no text`;
    if (!checkTextStyle(l.style)) return `${where} has an invalid text style`;
    if (l.animation !== undefined && !checkTextAnimation(l.animation)) {
      return `${where} has an invalid text animation`;
    }
    return null;
  }
  if (!isNum(l.inPoint) || !isNum(l.speed) || l.speed <= 0) {
    return `${where} has an invalid in-point or speed`;
  }
  if (l.kind === "media") {
    if (!isStr(l.assetId) || !isObj(p.assets) || !(l.assetId in p.assets)) {
      return `${where} uses a missing asset`;
    }
    if (!isProperty(l.volume, isNum)) return `${where} has invalid volume`;
    if (
      l.fade !== undefined &&
      (!isObj(l.fade) ||
        !isNum(l.fade.in) ||
        !isNum(l.fade.out) ||
        l.fade.in < 0 ||
        l.fade.out < 0)
    ) {
      return `${where} has an invalid sound fade`;
    }
    if (l.linkedTo !== undefined && !isStr(l.linkedTo)) {
      return `${where} has an invalid link`;
    }
    return null;
  }
  if (l.kind === "composition") {
    if (
      !isStr(l.compositionId) ||
      !isObj(p.compositions) ||
      !(l.compositionId in p.compositions)
    ) {
      return `${where} uses a missing composition`;
    }
    return null;
  }
  return `${where} has an unknown kind`;
}

function checkComposition(c: unknown, id: string, p: Obj): string | null {
  if (!isObj(c)) return `composition ${id} is not an object`;
  if (c.id !== id) return `composition ${id} has a mismatched id`;
  if (!isNum(c.width) || !isNum(c.height) || c.width <= 0 || c.height <= 0) {
    return `composition ${id} has an invalid size`;
  }
  if (!isNum(c.fps) || c.fps <= 0) return `composition ${id} has invalid fps`;
  if (!isStr(c.background)) return `composition ${id} has no background`;
  if (!Array.isArray(c.tracks)) return `composition ${id} has no tracks`;
  for (const track of c.tracks) {
    if (
      !isObj(track) ||
      !isStr(track.id) ||
      !["visual", "audio"].includes(track.kind as string) ||
      !Array.isArray(track.layers)
    ) {
      return `composition ${id} has an invalid track`;
    }
    for (const layer of track.layers) {
      const err = checkLayer(layer, p);
      if (err) return err;
    }
  }
  return null;
}

/**
 * Check that `raw` is a complete, loadable project. Returns the project, or
 * the first problem found. Never throws.
 */
export function parseProject(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, reason: "not a project" };
  if (raw.version !== PROJECT_VERSION) {
    return {
      ok: false,
      reason:
        isNum(raw.version) && raw.version > PROJECT_VERSION
          ? "it was saved by a newer version of Motion"
          : "it uses an unknown project format",
    };
  }
  if (!isStr(raw.id) || !isStr(raw.name)) {
    return { ok: false, reason: "it has no id or name" };
  }
  if (!isObj(raw.assets) || !isObj(raw.compositions)) {
    return { ok: false, reason: "it has no assets or compositions" };
  }
  if (raw.fonts !== undefined) {
    if (!isObj(raw.fonts))
      return { ok: false, reason: "its font list is invalid" };
    for (const [id, f] of Object.entries(raw.fonts)) {
      if (!isObj(f) || f.id !== id || !isStr(f.family) || !isStr(f.fileName)) {
        return { ok: false, reason: `font ${id} is invalid` };
      }
    }
  }
  if (raw.luts !== undefined) {
    if (!isObj(raw.luts))
      return { ok: false, reason: "its LUT list is invalid" };
    for (const [id, f] of Object.entries(raw.luts)) {
      if (!isObj(f) || f.id !== id || !isStr(f.name) || !isStr(f.fileName)) {
        return { ok: false, reason: `LUT ${id} is invalid` };
      }
    }
  }
  for (const [id, a] of Object.entries(raw.assets)) {
    const err = checkAsset(a, id);
    if (err) return { ok: false, reason: err };
  }
  if (
    !isStr(raw.rootCompositionId) ||
    !(raw.rootCompositionId in raw.compositions)
  ) {
    return { ok: false, reason: "its main timeline is missing" };
  }
  for (const [id, c] of Object.entries(raw.compositions)) {
    const err = checkComposition(c, id, raw);
    if (err) return { ok: false, reason: err };
  }
  // The checks above mirror the types in model.ts. Update both together.
  return { ok: true, project: raw as unknown as Project };
}

/**
 * Whether two assets describe the same file. Used to check a stored copy
 * before reopening it, and to reconnect a missing file the user imports again.
 * Durations may differ by a rounding step between reads.
 */
export function isSameMedia(
  a: Asset,
  b: Asset,
  opts: { name?: boolean } = {},
): boolean {
  return (
    a.kind === b.kind &&
    a.width === b.width &&
    a.height === b.height &&
    a.hasVideo === b.hasVideo &&
    a.hasAudio === b.hasAudio &&
    Math.abs(a.duration - b.duration) <= 1000 &&
    (!opts.name || a.name === b.name)
  );
}
