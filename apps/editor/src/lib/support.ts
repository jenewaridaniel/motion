/**
 * What this browser can't do, checked once at start. Motion needs WebGL 2
 * (drawing), WebCodecs video decoding (reading video), OffscreenCanvas,
 * IndexedDB (saving) and Web Audio. Without those it shows a "please update"
 * screen instead of a broken editor. Sound and export encoders are extras:
 * missing ones are mentioned, and the editor still opens.
 */

export interface Support {
  /** Without these, Motion can't work. */
  missing: string[];
  /** Without these, some things won't work (said once, in plain words). */
  limits: string[];
}

/** The parts of the browser this looks at (a fake one in tests). */
export interface Env {
  VideoDecoder?: unknown;
  VideoEncoder?: unknown;
  AudioDecoder?: unknown;
  AudioEncoder?: unknown;
  OffscreenCanvas?: unknown;
  indexedDB?: unknown;
  AudioContext?: unknown;
  /** Whether a WebGL 2 context can be made. */
  webgl2: boolean;
}

export function checkSupport(env: Env): Support {
  const missing: string[] = [];
  const limits: string[] = [];
  if (!env.webgl2) missing.push("WebGL 2 (to draw the video)");
  if (!env.VideoDecoder) missing.push("WebCodecs (to read video files)");
  if (!env.OffscreenCanvas) missing.push("OffscreenCanvas (to draw frames)");
  if (!env.indexedDB) missing.push("IndexedDB (to save your projects)");
  if (!env.AudioContext) missing.push("Web Audio (to play sound)");
  if (!env.AudioDecoder) limits.push("play the sound in your clips");
  if (!env.VideoEncoder) limits.push("export videos");
  else if (!env.AudioEncoder) limits.push("put sound in exported videos");
  return { missing, limits };
}

/** The real browser. */
export function browserEnv(): Env {
  const g = globalThis as unknown as Record<string, unknown>;
  let webgl2 = false;
  try {
    webgl2 = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl2 = false;
  }
  return {
    VideoDecoder: g.VideoDecoder,
    VideoEncoder: g.VideoEncoder,
    AudioDecoder: g.AudioDecoder,
    AudioEncoder: g.AudioEncoder,
    OffscreenCanvas: g.OffscreenCanvas,
    indexedDB: g.indexedDB,
    AudioContext: g.AudioContext,
    webgl2,
  };
}

/** One sentence for the limits, e.g. "can't export videos or …". */
export function limitsMessage(limits: string[]): string | null {
  if (limits.length === 0) return null;
  const list =
    limits.length === 1
      ? limits[0]
      : `${limits.slice(0, -1).join(", ")} or ${limits.at(-1)}`;
  return `This browser can't ${list}. For everything, use the latest Chrome, Edge, Safari or Firefox.`;
}
