/**
 * Compress a recording (mono samples) into a small audio file: AAC in an
 * .m4a (Opus if the browser has no AAC encoder), about 0.7 MB a minute
 * instead of 5.7 MB as WAV. Returns null if the browser can't encode audio.
 */
import {
  AudioBufferSource,
  BufferTarget,
  getFirstEncodableAudioCodec,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

const BITRATE = 96_000;
/** Seconds of audio handed to the encoder at a time. */
const CHUNK = 10;

export async function encodeVoice(
  samples: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fileName: string,
): Promise<File | null> {
  const codec = await getFirstEncodableAudioCodec(["aac", "opus"], {
    numberOfChannels: 1,
    sampleRate,
    bitrate: BITRATE,
  });
  if (!codec) return null;
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const source = new AudioBufferSource({ codec, bitrate: BITRATE });
  output.addAudioTrack(source);
  await output.start();
  const step = CHUNK * sampleRate;
  for (let at = 0; at < samples.length; at += step) {
    const part = samples.subarray(at, Math.min(samples.length, at + step));
    const buf = new AudioBuffer({
      length: part.length,
      numberOfChannels: 1,
      sampleRate,
    });
    buf.copyToChannel(part, 0);
    await source.add(buf);
  }
  await output.finalize();
  if (!target.buffer) return null;
  return new File([target.buffer], `${fileName}.m4a`, { type: "audio/mp4" });
}
