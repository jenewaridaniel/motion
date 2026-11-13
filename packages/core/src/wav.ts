/**
 * WAV files (16-bit PCM), for sounds Motion makes itself (sound effects).
 */

/** Encode channels of samples (-1 to 1) as a 16-bit PCM WAV file. */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): Uint8Array<ArrayBuffer> {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataSize = frames * count * 2;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true); // bytes per second
  view.setUint16(32, count * 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, dataSize, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of channels) {
      const v = Math.max(-1, Math.min(1, ch[i] ?? 0));
      view.setInt16(at, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true);
      at += 2;
    }
  }
  return out;
}
