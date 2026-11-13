/**
 * Edit operations. Each one mutates a draft project (inside an Immer recipe)
 * and takes absolute targets, so calling it repeatedly during a drag is safe.
 */
import { current, isDraft } from "immer";
import {
  ASPECTS,
  type AspectKey,
  type Asset,
  type Composition,
  containScale,
  createMediaLayer,
  createTextLayer,
  createTrack,
  type FontAsset,
  findLayer,
  findTrack,
  hasSource,
  type Id,
  type Layer,
  layerEnd,
  maxLayerDuration,
  newId,
  type Project,
  rootComposition,
  type TextAnimation,
  type TextLayer,
  type TextStyle,
  type Track,
  textLayerName,
} from "./model.ts";
import {
  type Animatable,
  type Property,
  removeKeyframe,
  setKeyframe,
  setValueAt,
  shiftKeyframes,
  type Vec2,
  valueAt,
} from "./property.ts";
import { frameTime, type Micros } from "./time.ts";

const frame = (comp: Composition) => frameTime(1, comp.fps);

/** Re-pack a magnetic track: back to back from zero, in start order. */
export function packTrack(track: Track): void {
  if (!track.magnetic) return;
  track.layers.sort((a, b) => a.start - b.start);
  let t = 0;
  for (const l of track.layers) {
    l.start = t;
    t += l.duration;
  }
}

function sortTrack(track: Track) {
  track.layers.sort((a, b) => a.start - b.start);
}

/** Free space on a non-magnetic track for [start, start + duration), ignoring `except`. */
function fits(track: Track, start: Micros, duration: Micros, except?: Id) {
  if (start < 0) return false;
  const end = start + duration;
  return track.layers.every(
    (l) => l.id === except || end <= l.start || start >= layerEnd(l),
  );
}

// ---------------------------------------------------------------- assets and clips

export function addAsset(p: Project, asset: Asset): void {
  p.assets[asset.id] = asset;
}

export function addFont(p: Project, font: FontAsset): void {
  if (!p.fonts) p.fonts = {};
  p.fonts[font.id] = font;
}

function mainTrack(comp: Composition): Track {
  const found = comp.tracks.find((t) => t.kind === "visual" && t.magnetic);
  if (found) return found;
  const track = createTrack("visual", { name: "Main", magnetic: true });
  comp.tracks.push(track);
  return track;
}

/**
 * Add an asset to the timeline the CapCut way: video and images go to the end
 * of the main track, audio goes to the first audio track with room at `at`.
 */
export function appendAsset(p: Project, assetId: Id, at?: Micros): Id | null {
  const asset = p.assets[assetId];
  if (!asset) return null;
  const comp = rootComposition(p);
  if (asset.kind === "audio") {
    const start = Math.max(0, at ?? 0);
    const duration = asset.duration;
    let track = comp.tracks.find(
      (t) => t.kind === "audio" && fits(t, start, duration),
    );
    if (!track) {
      track = createTrack("audio", { name: "Audio" });
      comp.tracks.push(track);
    }
    const layer = createMediaLayer(asset, comp, start);
    track.layers.push(layer);
    sortTrack(track);
    return layer.id;
  }
  const track = mainTrack(comp);
  const end = track.layers.reduce((m, l) => Math.max(m, layerEnd(l)), 0);
  const layer = createMediaLayer(asset, comp, end);
  track.layers.push(layer);
  packTrack(track);
  return layer.id;
}

/** Put a visual asset on a new overlay track above everything, at `at`. */
export function addOverlay(p: Project, assetId: Id, at: Micros): Id | null {
  const asset = p.assets[assetId];
  if (!asset || asset.kind === "audio") return null;
  const comp = rootComposition(p);
  const track = createTrack("visual", { name: "Overlay" });
  comp.tracks.unshift(track);
  const layer = createMediaLayer(asset, comp, Math.max(0, at));
  track.layers.push(layer);
  return layer.id;
}

/** Move an existing layer onto a new overlay track, keeping its time. */
export function liftToOverlay(p: Project, layerId: Id): boolean {
  const loc = findLayer(p, layerId);
  if (!loc || loc.track.kind !== "visual") return false;
  const { comp, track, index } = loc;
  track.layers.splice(index, 1);
  packTrack(track);
  const overlay = createTrack("visual", { name: "Overlay" });
  overlay.layers.push(loc.layer);
  const at = Math.max(0, comp.tracks.indexOf(track));
  comp.tracks.splice(at, 0, overlay);
  return true;
}

// ---------------------------------------------------------------- text

/**
 * Add a text clip at `at`, on a text track above everything. Reuses the top
 * text track if the clip fits there, so captions line up on one row.
 */
export function addText(
  p: Project,
  at: Micros,
  opts: { text?: string; style?: Partial<TextStyle> } = {},
): Id | null {
  const comp = rootComposition(p);
  const layer = createTextLayer(
    comp,
    Math.max(0, Math.round(at)),
    opts.text,
    opts.style,
  );
  const isTextTrack = (t: Track) =>
    t.kind === "visual" &&
    !t.magnetic &&
    t.layers.length > 0 &&
    t.layers.every((l) => l.kind === "text");
  let track = comp.tracks.find(
    (t) => isTextTrack(t) && fits(t, layer.start, layer.duration),
  );
  if (!track) {
    track = createTrack("visual", { name: "Text" });
    comp.tracks.unshift(track);
  }
  track.layers.push(layer);
  sortTrack(track);
  return layer.id;
}

function findText(p: Project, layerId: Id): TextLayer | null {
  const layer = findLayer(p, layerId)?.layer;
  return layer?.kind === "text" ? layer : null;
}

export function setText(p: Project, layerId: Id, text: string): boolean {
  const layer = findText(p, layerId);
  if (!layer) return false;
  layer.text = text;
  layer.name = textLayerName(text);
  return true;
}

export function setTextAnimation(
  p: Project,
  layerId: Id,
  patch: Partial<TextAnimation>,
): boolean {
  const layer = findText(p, layerId);
  if (!layer) return false;
  layer.animation = {
    ...(layer.animation ?? { in: null, out: null, loop: null }),
    ...patch,
  };
  return true;
}

export function setTextStyle(
  p: Project,
  layerId: Id,
  patch: Partial<TextStyle>,
): boolean {
  const layer = findText(p, layerId);
  if (!layer) return false;
  Object.assign(layer.style, patch);
  return true;
}

// ---------------------------------------------------------------- timing

/**
 * Move a layer onto `toTrackId`.
 * - Free track: `at` is the new start. Refused if it would overlap.
 * - Magnetic track: `at` is the drop point (where the pointer is). The clip
 *   goes in front of the first clip whose middle is after it.
 */
export function moveLayer(
  p: Project,
  layerId: Id,
  toTrackId: Id,
  at: Micros,
): boolean {
  const loc = findLayer(p, layerId);
  const dest = findTrack(p, toTrackId);
  if (!loc || !dest || dest.comp.id !== loc.comp.id) return false;
  if (dest.track.kind !== loc.track.kind) return false;
  const { layer } = loc;
  const target = Math.max(0, Math.round(at));

  if (dest.track.magnetic) {
    loc.track.layers.splice(loc.index, 1);
    if (loc.track !== dest.track) packTrack(loc.track);
    // Insert before the first clip whose midpoint is after the drop point.
    const others = dest.track.layers;
    let insertAt = others.findIndex((l) => l.start + l.duration / 2 > target);
    if (insertAt < 0) insertAt = others.length;
    others.splice(insertAt, 0, layer);
    // Keep the chosen order by assigning increasing provisional starts.
    others.forEach((l, i) => {
      l.start = i;
    });
    packTrack(dest.track);
    return true;
  }

  if (!fits(dest.track, target, layer.duration, layer.id)) return false;
  loc.track.layers.splice(loc.index, 1);
  if (loc.track !== dest.track) packTrack(loc.track);
  layer.start = target;
  dest.track.layers.push(layer);
  sortTrack(dest.track);
  return true;
}

/**
 * Move one edge of a layer to composition time `to`. Trimming the start also
 * moves the in-point and shifts keyframes, so the content stays in place.
 */
export function trimLayer(
  p: Project,
  layerId: Id,
  edge: "start" | "end",
  to: Micros,
): boolean {
  const loc = findLayer(p, layerId);
  if (!loc) return false;
  const { comp, track, layer, index } = loc;
  const minDur = frame(comp);
  const end = layerEnd(layer);

  if (edge === "end") {
    let target = Math.round(to);
    target = Math.max(target, layer.start + minDur);
    target = Math.min(target, layer.start + maxLayerDuration(p, layer));
    if (!track.magnetic) {
      const next = track.layers[index + 1];
      if (next) target = Math.min(target, next.start);
    }
    layer.duration = target - layer.start;
    packTrack(track);
    return true;
  }

  // Start edge. The earliest start is where the source runs out. Photos and
  // text have no source time, so they can grow back to zero.
  const timed =
    hasSource(layer) &&
    !(layer.kind === "media" && p.assets[layer.assetId]?.kind === "image")
      ? layer
      : null;
  const earliestBySource = timed
    ? timed.start - Math.floor(timed.inPoint / timed.speed)
    : 0;
  let target = Math.round(to);
  target = Math.min(target, end - minDur);
  target = Math.max(target, earliestBySource, 0);
  if (!track.magnetic) {
    const prev = track.layers[index - 1];
    if (prev) target = Math.max(target, layerEnd(prev));
  }
  const delta = target - layer.start;
  if (delta === 0) return true;
  if (timed) {
    timed.inPoint = Math.max(
      0,
      timed.inPoint + Math.round(delta * timed.speed),
    );
  }
  layer.duration = end - target;
  layer.start = target;
  forEachProperty(layer, (prop) => shiftKeyframes(prop, -delta));
  packTrack(track);
  return true;
}

/**
 * Trim the start so the layer lasts `duration`, keeping its end content.
 * Unlike `trimLayer(…, "start", to)`, repeating this is safe on a magnetic
 * track, where the clip snaps back to its slot after every trim. Drags use it.
 */
export function trimStartToDuration(
  p: Project,
  layerId: Id,
  duration: Micros,
): boolean {
  const loc = findLayer(p, layerId);
  if (!loc) return false;
  const { layer } = loc;
  return trimLayer(p, layerId, "start", layerEnd(layer) - Math.round(duration));
}

/** Split at composition time `at`. Returns the new right-hand layer's id. */
export function splitLayer(p: Project, layerId: Id, at: Micros): Id | null {
  const loc = findLayer(p, layerId);
  if (!loc) return null;
  const { comp, track, layer, index } = loc;
  const local = Math.round(at) - layer.start;
  const minDur = frame(comp);
  if (local < minDur || layer.duration - local < minDur) return null;

  // Drafts are proxies; snapshot before cloning.
  const snapshot: Layer = isDraft(layer)
    ? (current(layer as never) as Layer)
    : layer;
  const right = structuredClone(snapshot);
  right.id = newId();
  right.start = layer.start + local;
  right.duration = layer.duration - local;
  if (hasSource(right) && hasSource(layer)) {
    right.inPoint = layer.inPoint + Math.round(local * layer.speed);
  }
  // The entrance stays at the start and the exit at the end, so nothing
  // animates at the cut.
  if (right.kind === "text" && right.animation) {
    right.animation.in = null;
  }
  if (layer.kind === "text" && layer.animation) {
    layer.animation.out = null;
  }
  // Shift keyframes so both halves keep exactly the same animation.
  forEachProperty(right, (prop) => shiftKeyframes(prop, -local));
  layer.duration = local;
  track.layers.splice(index + 1, 0, right);
  // Children of the original keep following the left half.
  packTrack(track);
  return right.id;
}

export function deleteLayer(p: Project, layerId: Id): boolean {
  const loc = findLayer(p, layerId);
  if (!loc) return false;
  loc.track.layers.splice(loc.index, 1);
  for (const t of loc.comp.tracks) {
    for (const l of t.layers) if (l.parentId === layerId) delete l.parentId;
  }
  packTrack(loc.track);
  // Drop empty non-magnetic tracks so the timeline stays tidy.
  if (!loc.track.magnetic && loc.track.layers.length === 0) {
    loc.comp.tracks = loc.comp.tracks.filter((t) => t !== loc.track);
  }
  return true;
}

/** Change speed, keeping the in-point and the source span the clip covered. */
export function setSpeed(p: Project, layerId: Id, speed: number): boolean {
  const loc = findLayer(p, layerId);
  if (!loc || loc.layer.kind !== "media") return false;
  const { layer, track, index } = loc;
  const next = Math.min(100, Math.max(0.1, speed));
  const span = layer.duration * layer.speed;
  let duration = Math.max(frame(loc.comp), Math.round(span / next));
  if (!track.magnetic) {
    const after = track.layers[index + 1];
    if (after) duration = Math.min(duration, after.start - layer.start);
  }
  layer.speed = next;
  layer.duration = duration;
  packTrack(track);
  return true;
}

// ---------------------------------------------------------------- properties

export type PropertyPath =
  | "transform.position"
  | "transform.scale"
  | "transform.rotation"
  | "transform.anchor"
  | "opacity"
  | "volume";

export function getProperty(
  layer: Layer,
  path: PropertyPath,
): Property<Animatable> | null {
  switch (path) {
    case "transform.position":
      return layer.transform.position;
    case "transform.scale":
      return layer.transform.scale;
    case "transform.rotation":
      return layer.transform.rotation;
    case "transform.anchor":
      return layer.transform.anchor;
    case "opacity":
      return layer.opacity;
    case "volume":
      return layer.kind === "media" ? layer.volume : null;
  }
}

function forEachProperty(
  layer: Layer,
  fn: (prop: Property<Animatable>) => void,
): void {
  const t = layer.transform;
  for (const prop of [
    t.anchor,
    t.position,
    t.scale,
    t.rotation,
    layer.opacity,
  ]) {
    fn(prop as Property<Animatable>);
  }
  if (layer.kind === "media") fn(layer.volume);
}

/** Set a value at composition time `at`. Keyframes it if the property is animated. */
export function setPropertyValue(
  p: Project,
  layerId: Id,
  path: PropertyPath,
  value: Animatable,
  at: Micros,
): boolean {
  const loc = findLayer(p, layerId);
  const prop = loc && getProperty(loc.layer, path);
  if (!loc || !prop) return false;
  setValueAt(prop, at - loc.layer.start, value, frame(loc.comp) / 2);
  return true;
}

/** Add a keyframe at `at` holding the current value, or remove the one there. */
export function toggleKeyframe(
  p: Project,
  layerId: Id,
  path: PropertyPath,
  at: Micros,
): boolean {
  const loc = findLayer(p, layerId);
  const prop = loc && getProperty(loc.layer, path);
  if (!loc || !prop) return false;
  const local = at - loc.layer.start;
  const tol = frame(loc.comp) / 2;
  const exists = (prop.keyframes ?? []).some(
    (k) => Math.abs(k.time - local) <= tol,
  );
  if (exists) removeKeyframe(prop, local, tol);
  else setKeyframe(prop, local, valueAt(prop, local), tol);
  return true;
}

export function setParent(
  p: Project,
  layerId: Id,
  parentId: Id | null,
): boolean {
  const loc = findLayer(p, layerId);
  if (!loc) return false;
  if (!parentId) {
    delete loc.layer.parentId;
    return true;
  }
  // Refuse cycles.
  const byId = new Map<Id, Layer>();
  for (const t of loc.comp.tracks) for (const l of t.layers) byId.set(l.id, l);
  let cursor: Id | undefined = parentId;
  while (cursor) {
    if (cursor === layerId) return false;
    cursor = byId.get(cursor)?.parentId;
  }
  if (!byId.has(parentId)) return false;
  loc.layer.parentId = parentId;
  return true;
}

// ---------------------------------------------------------------- composition

/** Change the canvas. Un-animated layers are re-fitted and re-centred. */
export function setAspect(p: Project, aspect: AspectKey): void {
  const comp = rootComposition(p);
  const { width, height } = ASPECTS[aspect];
  const sx = width / comp.width;
  const sy = height / comp.height;
  comp.width = width;
  comp.height = height;
  for (const track of comp.tracks) {
    for (const layer of track.layers) {
      if (layer.kind === "text") {
        // Same fraction of the canvas, so a caption near the bottom stays there.
        const pos = layer.transform.position;
        const move = ([x, y]: Vec2): Vec2 => [x * sx, y * sy];
        pos.value = move(pos.value);
        for (const k of pos.keyframes ?? []) k.value = move(k.value);
        continue;
      }
      if (layer.kind !== "media") continue;
      const asset = p.assets[layer.assetId];
      if (!asset || asset.kind === "audio") continue;
      const t = layer.transform;
      if (!t.position.keyframes?.length) {
        t.position.value = [width / 2, height / 2] as Vec2;
      }
      if (!t.scale.keyframes?.length) {
        const s = containScale(asset.width, asset.height, width, height);
        t.scale.value = [s, s] as Vec2;
      }
    }
  }
}

export function setFps(p: Project, fps: number): void {
  rootComposition(p).fps = fps;
}

export function setBackground(p: Project, color: string): void {
  rootComposition(p).background = color;
}

export function renameProject(p: Project, name: string): void {
  p.name = name.trim() || "Untitled project";
}
