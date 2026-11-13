/**
 * Waveforms and thumbnails for timeline clips, made in the background and
 * kept in memory. Components subscribe with `onVisualsChanged` and redraw.
 */
import type { Asset } from "@motion/core";
import { computePeaks, Thumbnails } from "@motion/media";
import { getHandle } from "./media.ts";
import { useEditor } from "./store.ts";

export const thumbnails = new Thumbnails(getHandle);

const peaks = new Map<string, Float32Array | null>();
const computing = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

/** Called when peaks or thumbnails become available. */
export function onVisualsChanged(cb: () => void): () => void {
  listeners.add(cb);
  const off = thumbnails.onReady(cb);
  return () => {
    listeners.delete(cb);
    off();
  };
}

/**
 * The waveform for an asset: peaks if ready, null if it has no sound,
 * undefined while it's still being worked out (it starts on first ask).
 */
export function peaksFor(asset: Asset): Float32Array | null | undefined {
  if (!asset.hasAudio) return null;
  if (peaks.has(asset.id)) return peaks.get(asset.id);
  const handle = getHandle(asset.id);
  // File missing: ask again after it's reconnected.
  if (!handle || computing.has(asset.id)) return undefined;
  computing.add(asset.id);
  computePeaks(handle, asset.duration)
    .then((p) => peaks.set(asset.id, p))
    .catch((err) => {
      console.warn("[motion] waveform", asset.name, err);
      peaks.set(asset.id, null);
    })
    .finally(() => {
      computing.delete(asset.id);
      notify();
    });
  return undefined;
}

// A reconnected file may now have a waveform to show.
useEditor.subscribe((s, prev) => {
  if (s.mediaVersion !== prev.mediaVersion) notify();
});
