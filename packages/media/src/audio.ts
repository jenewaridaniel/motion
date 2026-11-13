import { type AudioSegment, gainPoints, type Micros, US } from "@motion/core";
import type { MediaHandle } from "./probe.ts";

type HandleLookup = (assetId: string) => MediaHandle | undefined;

interface ScheduleOptions {
  /** Converts composition time to this context's clock. */
  toCtx: (t: Micros) => number;
  isCancelled?: () => boolean;
  /** Awaited after each buffer, to pace decoding in real time. */
  pace?: (when: number) => Promise<void>;
  nodes?: Set<AudioScheduledSourceNode>;
}

const GAIN_STEP = US / 50;

function scheduleGain(
  param: AudioParam,
  seg: AudioSegment,
  from: Micros,
  to: Micros,
  toCtx: (t: Micros) => number,
) {
  const points = gainPoints(seg, from, to, GAIN_STEP);
  const [first] = points;
  if (!first) return;
  if (points.every(([, g]) => g === first[1])) {
    param.value = first[1];
    return;
  }
  param.setValueAtTime(first[1], Math.max(0, toCtx(first[0])));
  for (const [t, g] of points.slice(1)) {
    param.linearRampToValueAtTime(g, Math.max(0, toCtx(t)));
  }
}

/**
 * Schedule one segment's audio between composition times `from` and `to`.
 * Used by both live preview and export, so they mix identically.
 */
async function scheduleSegment(
  ctx: BaseAudioContext,
  dest: AudioNode,
  seg: AudioSegment,
  handle: MediaHandle,
  from: Micros,
  to: Micros,
  opts: ScheduleOptions,
): Promise<void> {
  const sink = handle.audioSink;
  if (!sink) return;
  const a = Math.max(from, seg.start);
  const b = Math.min(to, seg.start + seg.duration);
  if (b <= a) return;

  const gain = ctx.createGain();
  gain.connect(dest);
  scheduleGain(gain.gain, seg, a, b, opts.toCtx);

  const srcA = (seg.sourceIn + (a - seg.start) * seg.speed) / US;
  const srcB = (seg.sourceIn + (b - seg.start) * seg.speed) / US;
  const startAt = opts.toCtx(a);
  const stopAt = opts.toCtx(b);

  for await (const { buffer, timestamp } of sink.buffers(srcA, srcB)) {
    if (opts.isCancelled?.()) break;
    const compT = seg.start + (timestamp * US - seg.sourceIn) / seg.speed;
    let when = opts.toCtx(compT);
    let offset = 0;
    const earliest = Math.max(startAt, ctx.currentTime);
    if (when < earliest) {
      offset = (earliest - when) * seg.speed;
      when = earliest;
    }
    if (offset >= buffer.duration || when >= stopAt) continue;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = seg.speed;
    node.connect(gain);
    node.start(when, offset);
    node.stop(stopAt);
    if (opts.nodes) {
      const nodes = opts.nodes;
      nodes.add(node);
      node.onended = () => nodes.delete(node);
    }
    await opts.pace?.(when);
  }
}

export const EXPORT_SAMPLE_RATE = 48_000;

/** Mix [from, to) of the timeline into a stereo buffer. */
export async function mixAudio(
  segments: AudioSegment[],
  handle: HandleLookup,
  from: Micros,
  to: Micros,
  sampleRate = EXPORT_SAMPLE_RATE,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.round(((to - from) / US) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  await Promise.all(
    segments.map((seg) => {
      const h = handle(seg.assetId);
      if (!h) return Promise.resolve();
      return scheduleSegment(ctx, ctx.destination, seg, h, from, to, {
        toCtx: (t) => (t - from) / US,
      });
    }),
  );
  return ctx.startRendering();
}

/** Live audio for the preview. Its clock drives the playhead while playing. */
export class AudioPreview {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Per-play bus; disconnecting it silences and frees everything scheduled. */
  private bus: GainNode | null = null;
  private token = 0;
  private nodes = new Set<AudioScheduledSourceNode>();
  private ctxStart = 0;
  private from: Micros = 0;
  private playing = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Call from a user gesture (click or key press) so the browser allows sound. */
  play(segments: AudioSegment[], handle: HandleLookup, from: Micros): void {
    const ctx = this.ensure();
    void ctx.resume();
    this.stop();
    const token = ++this.token;
    this.playing = true;
    this.from = from;
    this.ctxStart = ctx.currentTime + 0.05;
    const toCtx = (t: Micros) => this.ctxStart + (t - from) / US;
    const isCancelled = () => token !== this.token;
    const pace = async (when: number) => {
      while (!isCancelled() && when - ctx.currentTime > 1.5) {
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    const bus = ctx.createGain();
    bus.connect(this.master as GainNode);
    this.bus = bus;
    for (const seg of segments) {
      const h = handle(seg.assetId);
      if (!h) continue;
      scheduleSegment(ctx, bus, seg, h, from, Number.POSITIVE_INFINITY, {
        toCtx,
        isCancelled,
        pace,
        nodes: this.nodes,
      }).catch((err) => console.warn("[motion] audio preview", err));
    }
  }

  /** Silence the preview's sound (e.g. while recording a voiceover). */
  setMuted(muted: boolean): void {
    this.ensure();
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /** Current composition time on the audio clock. */
  get time(): Micros {
    if (!this.ctx || !this.playing) return this.from;
    return this.from + Math.max(0, this.ctx.currentTime - this.ctxStart) * US;
  }

  stop(): void {
    this.token++;
    this.playing = false;
    for (const n of this.nodes) {
      try {
        n.stop();
        n.disconnect();
      } catch {
        // Already stopped.
      }
    }
    this.nodes.clear();
    this.bus?.disconnect();
    this.bus = null;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
