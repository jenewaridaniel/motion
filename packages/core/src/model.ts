import type { Effects, Mask } from "./effects.ts";
import type { Adjustments, BlendMode } from "./look.ts";
import { type Property, prop, type Vec2 } from "./property.ts";
import { type Micros, sec } from "./time.ts";

export type Id = string;

export function newId(): Id {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------- assets

export type AssetKind = "video" | "image" | "audio";

/** Metadata for an imported file. The file itself lives outside the model. */
export interface Asset {
  id: Id;
  kind: AssetKind;
  name: string;
  /** Source duration. 0 for images, which can be stretched to any length. */
  duration: Micros;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

// ---------------------------------------------------------------- layers

export interface Transform {
  /** Pivot, in the layer's own pixels. */
  anchor: Property<Vec2>;
  /** Where the anchor sits, in composition pixels. */
  position: Property<Vec2>;
  scale: Property<Vec2>;
  /** Degrees, clockwise. */
  rotation: Property<number>;
}

interface LayerBase {
  id: Id;
  name: string;
  /** Composition time where the layer begins. */
  start: Micros;
  duration: Micros;
  /** Another layer in the same composition whose transform this one follows. */
  parentId?: Id;
  transform: Transform;
  /** 0 to 1. */
  opacity: Property<number>;
  /** Colour adjustments; only the ones that were changed are stored. */
  adjust?: Adjustments;
  /** How it combines with the layers under it. Missing means "normal". */
  blend?: BlendMode;
  effects?: Effects;
  mask?: Mask;
}

export interface MediaLayer extends LayerBase {
  kind: "media";
  assetId: Id;
  /** Source time at the layer's first frame. */
  inPoint: Micros;
  /** 1 is normal. 2 plays twice as fast and lasts half as long. */
  speed: number;
  /** Linear gain, 0 to 2. */
  volume: Property<number>;
}

/** A nested composition, used for grouping and motion design. */
export interface CompositionLayer extends LayerBase {
  kind: "composition";
  compositionId: Id;
  inPoint: Micros;
  speed: number;
}

export interface TextStyle {
  /** Font family name. The editor decides which fonts are offered. */
  font: string;
  /** 100 to 900. */
  weight: number;
  italic: boolean;
  /** Font size in layer pixels, before the layer's scale. */
  size: number;
  /** CSS hex, e.g. "#ffffff". */
  color: string;
  align: "left" | "center" | "right";
  /** Multiple of the font size. */
  lineHeight: number;
  /** Extra space between letters, in layer pixels. */
  letterSpacing: number;
  /** Outline around each letter. */
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number; x: number; y: number } | null;
  /** A filled box behind the text, like a caption label. */
  box: { color: string; padding: number; radius: number } | null;
}

export type TextInAnimation =
  | "fade"
  | "pop"
  | "slide-up"
  | "slide-down"
  | "typewriter";
export type TextOutAnimation = "fade" | "pop" | "slide-up" | "slide-down";
export type TextLoopAnimation = "pulse" | "float" | "wiggle";

/**
 * Ready-made motion, worked out from the clip's own timing at draw time, so
 * trimming moves the "out" with the end. Combines with keyframes.
 */
export interface TextAnimation {
  in: { kind: TextInAnimation; duration: Micros } | null;
  out: { kind: TextOutAnimation; duration: Micros } | null;
  /** One cycle every `period`. */
  loop: { kind: TextLoopAnimation; period: Micros } | null;
}

export const TEXT_IN_ANIMATIONS: TextInAnimation[] = [
  "fade",
  "pop",
  "slide-up",
  "slide-down",
  "typewriter",
];
export const TEXT_OUT_ANIMATIONS: TextOutAnimation[] = [
  "fade",
  "pop",
  "slide-up",
  "slide-down",
];
export const TEXT_LOOP_ANIMATIONS: TextLoopAnimation[] = [
  "pulse",
  "float",
  "wiggle",
];

/**
 * Text. Its layer space has the origin at the middle of the text block, so
 * the default anchor (0, 0) rotates and scales it around its centre.
 */
export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  style: TextStyle;
  /** Missing in projects saved before animations existed. */
  animation?: TextAnimation;
}

export type Layer = MediaLayer | CompositionLayer | TextLayer;

/** Layers that play part of a source (a file or a nested composition). */
export type SourceLayer = MediaLayer | CompositionLayer;

export const hasSource = (l: Layer): l is SourceLayer =>
  l.kind === "media" || l.kind === "composition";

/** Source time shown at `local` time into a layer (after in-point and speed). */
export const sourceTimeAt = (l: SourceLayer, local: Micros): Micros =>
  l.inPoint + Math.round(local * l.speed);

// ---------------------------------------------------------------- tracks

export interface Track {
  id: Id;
  kind: "visual" | "audio";
  name: string;
  /** Magnetic tracks have no gaps: clips are packed back to back. */
  magnetic: boolean;
  hidden: boolean;
  muted: boolean;
  /** Sorted by start, never overlapping. */
  layers: Layer[];
}

export interface Composition {
  id: Id;
  name: string;
  width: number;
  height: number;
  fps: number;
  /** CSS hex, e.g. "#000000". */
  background: string;
  /** Index 0 is drawn on top. */
  tracks: Track[];
}

/** A font file the user added. The file itself is stored outside the model. */
export interface FontAsset {
  id: Id;
  /** The name text clips use in `style.font`. Unique in the project. */
  family: string;
  fileName: string;
}

export interface Project {
  version: 1;
  id: Id;
  name: string;
  assets: Record<Id, Asset>;
  /** Fonts the user added. Missing in projects saved before this existed. */
  fonts?: Record<Id, FontAsset>;
  compositions: Record<Id, Composition>;
  rootCompositionId: Id;
}

// ---------------------------------------------------------------- canvas presets

export const ASPECTS = {
  "9:16": { width: 1080, height: 1920, label: "9:16 Vertical" },
  "16:9": { width: 1920, height: 1080, label: "16:9 Landscape" },
  "1:1": { width: 1080, height: 1080, label: "1:1 Square" },
  "4:5": { width: 1080, height: 1350, label: "4:5 Portrait" },
} as const;

export type AspectKey = keyof typeof ASPECTS;

// ---------------------------------------------------------------- factories

export function createTrack(
  kind: Track["kind"],
  opts: Partial<Omit<Track, "id" | "kind">> = {},
): Track {
  return {
    id: newId(),
    kind,
    name: opts.name ?? (kind === "audio" ? "Audio" : "Overlay"),
    magnetic: opts.magnetic ?? false,
    hidden: opts.hidden ?? false,
    muted: opts.muted ?? false,
    layers: opts.layers ?? [],
  };
}

export function createComposition(
  opts: Partial<Omit<Composition, "id">> = {},
): Composition {
  return {
    id: newId(),
    name: opts.name ?? "Main",
    width: opts.width ?? ASPECTS["9:16"].width,
    height: opts.height ?? ASPECTS["9:16"].height,
    fps: opts.fps ?? 30,
    background: opts.background ?? "#000000",
    tracks: opts.tracks ?? [
      createTrack("visual", { name: "Main", magnetic: true }),
    ],
  };
}

export function createProject(name = "Untitled project"): Project {
  const root = createComposition();
  return {
    version: 1,
    id: newId(),
    name,
    assets: {},
    compositions: { [root.id]: root },
    rootCompositionId: root.id,
  };
}

/** Uniform scale that fits `w × h` inside `cw × ch` without cropping. */
export function containScale(w: number, h: number, cw: number, ch: number) {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(cw / w, ch / h);
}

/** Transform that centres a `w × h` source in the composition, fitted. */
export function fittedTransform(
  w: number,
  h: number,
  comp: Pick<Composition, "width" | "height">,
): Transform {
  const s = containScale(w, h, comp.width, comp.height);
  return {
    anchor: prop<Vec2>([w / 2, h / 2]),
    position: prop<Vec2>([comp.width / 2, comp.height / 2]),
    scale: prop<Vec2>([s, s]),
    rotation: prop(0),
  };
}

export const DEFAULT_IMAGE_DURATION = sec(5);
export const DEFAULT_TEXT_DURATION = sec(3);

/** White, bold, centred, with a soft shadow so it reads on any footage. */
export function defaultTextStyle(
  comp: Pick<Composition, "width" | "height">,
): TextStyle {
  return {
    // Generic, so core needs no font files. The editor passes its own default.
    font: "sans-serif",
    weight: 800,
    italic: false,
    // About 7.5% of the short side: 81 px on a 1080-wide canvas.
    size: Math.round(Math.min(comp.width, comp.height) * 0.075),
    color: "#ffffff",
    align: "center",
    lineHeight: 1.15,
    letterSpacing: 0,
    stroke: null,
    shadow: { color: "#000000", blur: 12, x: 0, y: 4 },
    box: null,
  };
}

/** The clip name for some text: its first non-empty line, shortened. */
export function textLayerName(text: string): string {
  const line = text
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  if (!line) return "Text";
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}

export function createTextLayer(
  comp: Pick<Composition, "width" | "height">,
  start: Micros,
  text = "Your text",
  style: Partial<TextStyle> = {},
): TextLayer {
  return {
    id: newId(),
    kind: "text",
    name: textLayerName(text),
    start,
    duration: DEFAULT_TEXT_DURATION,
    transform: {
      anchor: prop<Vec2>([0, 0]),
      position: prop<Vec2>([comp.width / 2, comp.height / 2]),
      scale: prop<Vec2>([1, 1]),
      rotation: prop(0),
    },
    opacity: prop(1),
    text,
    style: { ...defaultTextStyle(comp), ...style },
  };
}

export function createMediaLayer(
  asset: Asset,
  comp: Pick<Composition, "width" | "height">,
  start: Micros,
): MediaLayer {
  const duration =
    asset.kind === "image" ? DEFAULT_IMAGE_DURATION : asset.duration;
  return {
    id: newId(),
    kind: "media",
    name: asset.name,
    assetId: asset.id,
    start,
    duration,
    inPoint: 0,
    speed: 1,
    transform: fittedTransform(asset.width || 1, asset.height || 1, comp),
    opacity: prop(1),
    volume: prop(1),
  };
}

// ---------------------------------------------------------------- lookups

export const rootComposition = (p: Project): Composition =>
  p.compositions[p.rootCompositionId] as Composition;

export const layerEnd = (l: Layer): Micros => l.start + l.duration;

export function compositionDuration(comp: Composition): Micros {
  let end = 0;
  for (const t of comp.tracks) {
    for (const l of t.layers) end = Math.max(end, layerEnd(l));
  }
  return end;
}

export interface LayerLocation {
  comp: Composition;
  track: Track;
  layer: Layer;
  index: number;
}

export function findLayer(p: Project, layerId: Id): LayerLocation | null {
  for (const comp of Object.values(p.compositions)) {
    for (const track of comp.tracks) {
      const index = track.layers.findIndex((l) => l.id === layerId);
      if (index >= 0) {
        return { comp, track, layer: track.layers[index] as Layer, index };
      }
    }
  }
  return null;
}

export function findTrack(
  p: Project,
  trackId: Id,
): { comp: Composition; track: Track } | null {
  for (const comp of Object.values(p.compositions)) {
    const track = comp.tracks.find((t) => t.id === trackId);
    if (track) return { comp, track };
  }
  return null;
}

/** Longest the layer can last given its source and speed. */
export function maxLayerDuration(p: Project, layer: Layer): Micros {
  if (layer.kind === "text") return Number.POSITIVE_INFINITY;
  if (layer.kind === "media") {
    const asset = p.assets[layer.assetId];
    if (!asset || asset.kind === "image") return Number.POSITIVE_INFINITY;
    return Math.floor((asset.duration - layer.inPoint) / layer.speed);
  }
  const nested = p.compositions[layer.compositionId];
  if (!nested) return 0;
  return Math.floor(
    (compositionDuration(nested) - layer.inPoint) / layer.speed,
  );
}
