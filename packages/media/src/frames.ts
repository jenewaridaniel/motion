import { US, type VisualDraw } from "@motion/core";
import type { PlacedImage } from "@motion/renderer";
import {
  CanvasSink,
  type InputVideoTrack,
  type WrappedCanvas,
} from "mediabunny";
import type { MediaHandle } from "./probe.ts";
import { TextRasterizer } from "./text.ts";

/**
 * Frame access for one timeline layer. Walks forward through the decoder
 * during playback and export, and seeks when the playhead jumps.
 */
export class VideoReader {
  private sink: CanvasSink;
  private iter: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  private current: WrappedCanvas | null = null;
  private next: WrappedCanvas | null = null;
  private ended = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(track: InputVideoTrack) {
    // A small pool avoids allocating a new canvas for every frame. We hold at
    // most two at once (current and next), so four leaves headroom.
    this.sink = new CanvasSink(track, { poolSize: 4 });
  }

  /** The frame shown at `t` seconds. Calls are queued, never overlapped. */
  frameAt(t: number): Promise<WrappedCanvas | null> {
    const run = this.queue.then(() => this.read(t));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(t: number): Promise<WrappedCanvas | null> {
    const cur = this.current;
    // Walk forward when the target is at or a little after what we have.
    if (this.iter && cur && t >= cur.timestamp && t < cur.timestamp + 2) {
      for (;;) {
        if (!this.next) {
          if (this.ended) return this.current;
          const r = await this.iter.next();
          if (r.done) {
            this.ended = true;
            return this.current;
          }
          this.next = r.value;
        }
        if (this.next.timestamp <= t + 1e-6) {
          this.current = this.next;
          this.next = null;
        } else {
          return this.current;
        }
      }
    }
    // Otherwise seek.
    await this.iter?.return();
    this.iter = this.sink.canvases(Math.max(0, t));
    this.ended = false;
    this.next = null;
    const first = await this.iter.next();
    this.current = first.done ? null : first.value;
    if (first.done) this.ended = true;
    return this.current;
  }

  async dispose(): Promise<void> {
    await this.queue;
    await this.iter?.return();
    this.iter = null;
    this.current = null;
    this.next = null;
  }
}

/** How many output pixels one layer pixel covers, for a draw's matrix. */
function layerToOutputScale(draw: VisualDraw, outputScale: number): number {
  const [a, b, c, d] = draw.matrix;
  return Math.max(Math.hypot(a, b), Math.hypot(c, d)) * outputScale;
}

/**
 * Resolves draws to images. Each draw key gets its own reader, so two clips
 * cut from the same file never fight over one decoder.
 */
export class FrameProvider {
  private readers = new Map<string, VideoReader>();
  /** Last good frame per key, shown while a new frame is still decoding. */
  private last = new Map<string, PlacedImage>();
  private text = new TextRasterizer();

  constructor(
    private readonly handle: (assetId: string) => MediaHandle | undefined,
  ) {}

  private reader(key: string, assetId: string): VideoReader | null {
    let r = this.readers.get(key);
    if (r) return r;
    const track = this.handle(assetId)?.videoTrack;
    if (!track) return null;
    r = new VideoReader(track);
    this.readers.set(key, r);
    return r;
  }

  /**
   * Images for every draw. `outputScale` is output pixels per composition
   * pixel (text is drawn at that resolution). `keep` lists extra keys whose
   * video readers stay warm.
   */
  async images(
    draws: VisualDraw[],
    outputScale: number,
    keep: Iterable<string> = [],
  ): Promise<Map<string, PlacedImage>> {
    const out = new Map<string, PlacedImage>();
    await Promise.all(
      draws.map(async (d) => {
        const src = d.source;
        if (src.kind === "text") {
          const img = await this.text.render(
            src.text,
            src.style,
            layerToOutputScale(d, outputScale),
          );
          if (img) out.set(d.key, img);
          return;
        }
        if (src.kind === "image") {
          const image = this.handle(src.assetId)?.image;
          if (image) {
            out.set(d.key, {
              image,
              x: 0,
              y: 0,
              width: src.width,
              height: src.height,
              fixed: true,
            });
          }
          return;
        }
        const wrapped = await this.reader(d.key, src.assetId)?.frameAt(
          src.time / US,
        );
        if (wrapped) {
          const placed: PlacedImage = {
            image: wrapped.canvas,
            x: 0,
            y: 0,
            width: src.width,
            height: src.height,
            // Pooled canvases are reused for later frames.
            fixed: false,
          };
          out.set(d.key, placed);
          this.last.set(d.key, placed);
        } else {
          const prev = this.last.get(d.key);
          if (prev) out.set(d.key, prev);
        }
      }),
    );
    this.prune(new Set([...draws.map((d) => d.key), ...keep]));
    return out;
  }

  /** Start decoding upcoming draws so cuts don't stall. Fire and forget. */
  warm(draws: VisualDraw[]): void {
    for (const d of draws) {
      const src = d.source;
      if (src.kind !== "video" || this.readers.has(d.key)) continue;
      void this.reader(d.key, src.assetId)
        ?.frameAt(src.time / US)
        .catch(() => undefined);
    }
  }

  private prune(active: Set<string>) {
    for (const [key, r] of this.readers) {
      if (active.has(key)) continue;
      void r.dispose();
      this.readers.delete(key);
      this.last.delete(key);
    }
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.readers.values()].map((r) => r.dispose()));
    this.readers.clear();
    this.last.clear();
  }
}
