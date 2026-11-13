import {
  ASPECTS,
  type AspectKey,
  type Asset,
  addAsset,
  addCaptions,
  appendAsset,
  isSameMedia,
  type Micros,
  parseCaptions,
  projectDuration,
  setAspect,
} from "@motion/core";
import {
  disposeHandle,
  type MediaHandle,
  probeFile,
  reopenFile,
  UnsupportedMediaError,
} from "@motion/media";
import { DEFAULT_FONT } from "../lib/fonts.ts";
import { importFonts, isFontFile } from "./customFonts.ts";
import { importLuts, isLutFile } from "./luts.ts";
import { isProjectFile, openProjectFile } from "./projects.ts";
import { loadMedia, saveMedia } from "./storage.ts";
import { useEditor } from "./store.ts";

/** Live file handles by asset id. Not part of the (serialisable) project. */
const handles = new Map<string, MediaHandle>();

export const getHandle = (assetId: string) => handles.get(assetId);

export const ACCEPT =
  "video/*,audio/*,image/*,.mov,.mkv,.m4a,.mp3,.wav,.flac,.ogg,.srt,.vtt,.ttf,.otf,.woff,.woff2,.motion,.cube";

/** Preset closest in shape to `w × h`. */
function nearestAspect(w: number, h: number): AspectKey {
  const ratio = w / h;
  let best: AspectKey = "9:16";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [key, a] of Object.entries(ASPECTS) as [
    AspectKey,
    (typeof ASPECTS)[AspectKey],
  ][]) {
    const diff = Math.abs(Math.log(ratio / (a.width / a.height)));
    if (diff < bestDiff) {
      best = key;
      bestDiff = diff;
    }
  }
  return best;
}

const isCaptionFile = (f: File) =>
  /\.(srt|vtt)$/i.test(f.name) || f.type === "text/vtt";

/** Turn a subtitle file into text clips. Nothing is stored but the text. */
async function importCaptions(file: File): Promise<void> {
  const { edit, toast } = useEditor.getState();
  const cues = parseCaptions(await file.text());
  if (cues.length === 0) {
    toast(`${file.name} has no captions we could read.`, "error");
    return;
  }
  edit((d) => void addCaptions(d, cues, { font: DEFAULT_FONT.family }));
  toast(
    `Added ${cues.length} caption${cues.length === 1 ? "" : "s"} from ${file.name}.`,
  );
}

/**
 * Probe files and add them to the timeline. The first visual clip on an
 * empty timeline sets the canvas shape, like CapCut's "Original".
 */
export async function importFiles(
  files: Iterable<File>,
  opts: { at?: Micros } = {},
): Promise<void> {
  const { setImporting, toast, restoring } = useEditor.getState();
  const list = [...files];
  if (list.length === 0) return;
  if (restoring) {
    // The restored project would replace anything added now.
    toast("Still opening your project. Try again in a moment.");
    return;
  }
  setImporting(list.length);
  try {
    for (const file of list) {
      try {
        if (isCaptionFile(file)) {
          await importCaptions(file);
          continue;
        }
        if (isFontFile(file)) {
          await importFonts([file]);
          continue;
        }
        if (isLutFile(file)) {
          await importLuts([file]);
          continue;
        }
        if (isProjectFile(file)) {
          await openProjectFile(file);
          continue;
        }
        const { asset, handle } = await probeFile(file);
        const { project, edit, playhead } = useEditor.getState();

        // The same file as one whose stored copy is missing: reconnect it,
        // so the clips already on the timeline work again.
        const missing = Object.values(project.assets).find(
          (a) => !handles.has(a.id) && isSameMedia(a, asset, { name: true }),
        );
        if (missing) {
          disposeHandle(handle);
          handles.set(missing.id, await reopenFile(missing, file));
          void saveMedia(missing.id, missing.name, file);
          useEditor.getState().mediaChanged();
          toast(`Reconnected ${missing.name}.`);
          continue;
        }

        handles.set(asset.id, handle);
        // Keep a copy on this device so the project survives a reload.
        void saveMedia(asset.id, asset.name, file);
        const wasEmpty = projectDuration(project) === 0;
        edit((d) => {
          addAsset(d, asset);
          if (wasEmpty && asset.kind !== "audio") {
            setAspect(d, nearestAspect(asset.width, asset.height));
          }
          appendAsset(d, asset.id, opts.at ?? playhead);
        });
      } catch (err) {
        const msg =
          err instanceof UnsupportedMediaError
            ? err.message
            : `Couldn't import ${file.name}.`;
        console.error("[motion] import", err);
        toast(msg, "error");
      } finally {
        setImporting(-1);
      }
    }
  } finally {
    useEditor.getState().seal();
  }
}

/**
 * Reopen the stored files for a restored project. Returns the names of assets
 * whose files are missing or no longer match; their clips show as empty.
 */
export async function restoreMedia(assets: Asset[]): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    assets.map(async (asset) => {
      // Already open (shared with the project we're switching from).
      if (handles.has(asset.id)) return;
      try {
        const file = await loadMedia(asset.id);
        if (!file) throw new Error("not stored");
        handles.set(asset.id, await reopenFile(asset, file));
      } catch (err) {
        console.warn("[motion] restore media", asset.name, err);
        missing.push(asset.name);
      }
    }),
  );
  return missing;
}

/** Whether an asset's file is open and playable. */
export const hasMedia = (assetId: string) => handles.has(assetId);
