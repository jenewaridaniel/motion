import {
  ASPECTS,
  type AspectKey,
  addAsset,
  appendAsset,
  projectDuration,
  setAspect,
} from "@motion/core";
import {
  type MediaHandle,
  probeFile,
  UnsupportedMediaError,
} from "@motion/media";
import { useEditor } from "./store.ts";

/** Live file handles by asset id. Not part of the (serialisable) project. */
const handles = new Map<string, MediaHandle>();

export const getHandle = (assetId: string) => handles.get(assetId);

export const ACCEPT =
  "video/*,audio/*,image/*,.mov,.mkv,.m4a,.mp3,.wav,.flac,.ogg";

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

/**
 * Probe files and add them to the timeline. The first visual clip on an
 * empty timeline sets the canvas shape, like CapCut's "Original".
 */
export async function importFiles(files: Iterable<File>): Promise<void> {
  const { setImporting, toast } = useEditor.getState();
  const list = [...files];
  if (list.length === 0) return;
  setImporting(list.length);
  try {
    for (const file of list) {
      try {
        const { asset, handle } = await probeFile(file);
        handles.set(asset.id, handle);
        const { project, edit, playhead } = useEditor.getState();
        const wasEmpty = projectDuration(project) === 0;
        edit((d) => {
          addAsset(d, asset);
          if (wasEmpty && asset.kind !== "audio") {
            setAspect(d, nearestAspect(asset.width, asset.height));
          }
          appendAsset(d, asset.id, playhead);
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
