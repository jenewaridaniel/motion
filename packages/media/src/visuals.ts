/**
 * What the timeline needs to draw clips: waveform peaks and small
 * thumbnails. Both are made in the background and cached.
 */
import { type Asset, type Micros, PeakBuilder, US } from "@motion/core";
import { CanvasSink } from "mediabunny";
import type { MediaHandle } from "./probe.ts";

type HandleLookup = (assetId: string) => MediaHandle | undefined;

/**
 * Peaks for a whole file's audio. Decodes in order and keeps only the peaks,
 * so a long file is never held in memory. Null if the file has no audio.
 */
export async function computePeaks(
  handle: MediaHandle,
  duration: Micros,
  signal?: AbortSignal,
): Promise<Float32Array | null> {
  const sink = handle.audioSink;
  if (!sink) return null;
  const builder = new PeakBuilder(duration);
  for await (const { buffer, timestamp } of sink.buffers()) {
    if (signal?.aborted) return null;
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }
    builder.add(channels, buffer.sampleRate, timestamp);
  }
  return builder.result();
}

/** Thumbnail height in pixels. Small on purpose: hundreds can be cached. */
export const THUMB_HEIGHT = 72;
const CACHE_LIMIT = 1500;
/** Frames decoded per batch, so new requests (after a scroll) get a turn. */
const BATCH = 24;

/**
 * Small frames for timeline clips, by asset and source time. Ask with
 * `want`; `get` returns what's ready; `onReady` fires as batches finish.
 */
export class Thumbnails {
  private cache = new Map<string, ImageBitmap>();
  private pending = new Map<string, Set<Micros>>();
  private sinks = new Map<string, CanvasSink>();
  private running = new Set<string>();
  private listeners = new Set<() => void>();
  private notifyQueued = false;

  constructor(private readonly handle: HandleLookup) {}

  private key = (assetId: string, t: Micros) => `${assetId}@${t}`;

  get(assetId: string, t: Micros): ImageBitmap | undefined {
    const k = this.key(assetId, t);
    const hit = this.cache.get(k);
    if (hit) {
      // Recently used last, so it's evicted last.
      this.cache.delete(k);
      this.cache.set(k, hit);
    }
    return hit;
  }

  /** Ask for frames. Already cached or queued times are skipped. */
  want(asset: Asset, times: Micros[]): void {
    let queue = this.pending.get(asset.id);
    if (!queue) {
      queue = new Set();
      this.pending.set(asset.id, queue);
    }
    for (const t of times) {
      if (!this.cache.has(this.key(asset.id, t))) queue.add(t);
    }
    if (queue.size > 0) void this.run(asset);
  }

  onReady(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private sink(asset: Asset): CanvasSink | null {
    let s = this.sinks.get(asset.id);
    if (s) return s;
    const track = this.handle(asset.id)?.videoTrack;
    if (!track || asset.height <= 0) return null;
    const width = Math.max(
      1,
      Math.round((THUMB_HEIGHT * asset.width) / asset.height),
    );
    s = new CanvasSink(track, {
      width,
      height: THUMB_HEIGHT,
      fit: "fill",
      poolSize: 2,
    });
    this.sinks.set(asset.id, s);
    return s;
  }

  private async run(asset: Asset): Promise<void> {
    if (this.running.has(asset.id)) return;
    this.running.add(asset.id);
    try {
      const sink = this.sink(asset);
      const queue = this.pending.get(asset.id);
      while (sink && queue && queue.size > 0) {
        // Newest requests first: they're what's on screen now.
        const batch = [...queue].slice(-BATCH).sort((a, b) => a - b);
        for (const t of batch) queue.delete(t);
        let i = 0;
        for await (const wrapped of sink.canvasesAtTimestamps(
          batch.map((t) => t / US),
        )) {
          const t = batch[i++] as Micros;
          // Copy out: the sink reuses its canvases.
          if (wrapped)
            this.store(
              this.key(asset.id, t),
              await createImageBitmap(wrapped.canvas),
            );
        }
        this.notify();
      }
    } catch (err) {
      console.warn("[motion] thumbnails", asset.name, err);
    } finally {
      this.running.delete(asset.id);
    }
  }

  private store(k: string, bitmap: ImageBitmap) {
    this.cache.set(k, bitmap);
    while (this.cache.size > CACHE_LIMIT) {
      const [oldKey, old] = this.cache.entries().next().value as [
        string,
        ImageBitmap,
      ];
      this.cache.delete(oldKey);
      old.close();
    }
  }

  private notify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      for (const cb of this.listeners) cb();
    });
  }
}
