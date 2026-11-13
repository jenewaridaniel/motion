import {
  type CubeLut,
  collectAudioSegments,
  type ExportQualityLevel,
  evaluateFrame,
  exportRateControl,
  frameTime,
  type Micros,
  type Project,
  projectDuration,
  rootComposition,
  US,
} from "@motion/core";
import { Compositor } from "@motion/renderer";
import {
  AudioBufferSource,
  type AudioCodec,
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  type StreamTargetChunk,
  type VideoCodec,
} from "mediabunny";
import { EXPORT_SAMPLE_RATE, mixAudio } from "./audio.ts";
import { FrameProvider } from "./frames.ts";
import type { MediaHandle } from "./probe.ts";

export type ExportCodec = Extract<VideoCodec, "avc" | "hevc">;
export type ExportQuality = ExportQualityLevel;

/**
 * Encoder quality for these settings: constant quality where the encoder
 * supports it, otherwise a bitrate that scales with size and frame rate.
 * See core's exportRateControl for the numbers and why.
 */
export function exportQuality(settings: ExportSettings): Quality {
  const { quantizer, bitrate } = exportRateControl(
    settings.codec,
    settings.width,
    settings.height,
    settings.fps,
    settings.quality,
  );
  return new Quality({ quantizer, bitrate });
}

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  codec: ExportCodec;
  quality: ExportQuality;
}

export type ExportDestination =
  /** Streams to disk as it encodes. Needs the File System Access API. */
  | { kind: "file"; writable: WritableStream<StreamTargetChunk> }
  /** Built in memory, returned as a Blob. */
  | { kind: "memory" };

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  /** 0 to 1. */
  progress: number;
}

export interface ExportResult {
  blob: Blob | null;
  /** Things the user should know, e.g. audio was skipped. */
  notes: string[];
}

/** Can this browser encode `codec` at this size? */
export function canExport(codec: ExportCodec, width: number, height: number) {
  return canEncodeVideo(codec, { width, height });
}

/** Output size for a short-side preset, keeping the composition's shape. */
export function exportSize(
  project: Project,
  shortSide: number,
): { width: number; height: number } {
  const comp = rootComposition(project);
  const portrait = comp.height >= comp.width;
  const ratio = portrait ? comp.height / comp.width : comp.width / comp.height;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const long = even(shortSide * ratio);
  return portrait
    ? { width: even(shortSide), height: long }
    : { width: long, height: even(shortSide) };
}

const AUDIO_CHUNK: Micros = 2 * US;

/**
 * Render the root composition to an MP4. Uses the same evaluate → compositor
 * path as the preview. There is no watermark step, by design.
 */
export async function exportProject(
  project: Project,
  handle: (assetId: string) => MediaHandle | undefined,
  settings: ExportSettings,
  dest: ExportDestination,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
  /** Project LUTs by id (the same ones the preview uses). */
  luts?: ReadonlyMap<string, CubeLut>,
): Promise<ExportResult> {
  const notes: string[] = [];
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error("The timeline is empty.");
  const comp = rootComposition(project);
  const { width, height, fps } = settings;

  if (!(await canExport(settings.codec, width, height))) {
    throw new Error(
      `This browser can't encode ${settings.codec === "hevc" ? "HEVC" : "H.264"} at ${width}×${height}. Try a lower resolution or the other codec.`,
    );
  }

  const segments = collectAudioSegments(project);
  let audioCodec: AudioCodec | null = null;
  if (segments.length > 0) {
    audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
      numberOfChannels: 2,
      sampleRate: EXPORT_SAMPLE_RATE,
    });
    if (!audioCodec) {
      notes.push(
        "This browser can't encode audio, so the video was exported silent.",
      );
    }
  }

  const canvas = new OffscreenCanvas(width, height);
  const compositor = new Compositor(canvas, { preserveDrawingBuffer: true });
  const frames = new FrameProvider(handle);

  const target =
    dest.kind === "file"
      ? new StreamTarget(dest.writable, { chunked: true })
      : new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: dest.kind === "file" ? false : "in-memory",
    }),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: settings.codec,
    quality: exportQuality(settings),
    keyFrameInterval: 2,
    latencyMode: "quality",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  const audioSource = audioCodec
    ? new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  const totalFrames = Math.max(1, Math.ceil((duration * fps) / US - 1e-6));
  let audioDone: Micros = 0;
  const pushAudioUntil = async (t: Micros) => {
    if (!audioSource) return;
    while (audioDone < Math.min(t, duration)) {
      const end = Math.min(audioDone + AUDIO_CHUNK, duration);
      const buf = await mixAudio(segments, handle, audioDone, end);
      await audioSource.add(buf);
      audioDone = end;
    }
  };

  const abortIfNeeded = () => {
    if (signal?.aborted)
      throw new DOMException("Export canceled", "AbortError");
  };

  try {
    await output.start();
    for (let i = 0; i < totalFrames; i++) {
      abortIfNeeded();
      const t = frameTime(i, fps);
      const draws = evaluateFrame(project, t);
      const images = await frames.images(draws, width / comp.width);
      compositor.render({
        draws,
        images,
        compWidth: comp.width,
        compHeight: comp.height,
        background: comp.background,
        luts,
      });
      await videoSource.add(t / US, 1 / fps);
      // Keep audio a chunk ahead of video so the muxer can interleave.
      await pushAudioUntil(t + AUDIO_CHUNK);
      onProgress({
        frame: i + 1,
        totalFrames,
        progress: (i + 1) / totalFrames,
      });
    }
    await pushAudioUntil(duration);
    abortIfNeeded();
    await output.finalize();
  } catch (err) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined);
    }
    throw err;
  } finally {
    await frames.dispose();
    compositor.dispose({ loseContext: true });
  }

  if (target instanceof BufferTarget) {
    if (!target.buffer) throw new Error("Export produced no data.");
    return { blob: new Blob([target.buffer], { type: "video/mp4" }), notes };
  }
  return { blob: null, notes };
}
