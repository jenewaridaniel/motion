/**
 * How hard the encoder should work for each export quality.
 *
 * Two numbers, because encoders differ:
 * - `quantizer`: constant quality per frame (like FFmpeg's CRF; lower is
 *   better). Used wherever the encoder supports it, e.g. the Mac hardware
 *   encoder. Measured there on heavy grain at "high": 48 dB brightness PSNR at
 *   about 10 Mbps, so these values are kept as they were.
 * - `bitrate`: the fallback for encoders that can't hold a constant quality
 *   (e.g. Chrome's software H.264). Based on recommended upload bitrates, and
 *   scaled with frame rate so 60 fps doesn't get half the bits per frame.
 */
export type ExportQualityLevel = "standard" | "high" | "max";
export type ExportVideoCodec = "avc" | "hevc";

const QUANTIZER: Record<ExportQualityLevel, number> = {
  standard: 29,
  high: 22,
  max: 16,
};

/** H.264 "high" at 30 fps, by pixel count. Between points: linear in pixels. */
const HIGH_30FPS: [pixels: number, bitsPerSecond: number][] = [
  [1280 * 720, 5_000_000],
  [1920 * 1080, 8_000_000],
  [2560 * 1440, 16_000_000],
  [3840 * 2160, 40_000_000],
];

const TIER: Record<ExportQualityLevel, number> = {
  standard: 0.6,
  high: 1,
  max: 1.6,
};

/** HEVC needs fewer bits for the same quality. */
const CODEC: Record<ExportVideoCodec, number> = { avc: 1, hevc: 0.6 };

function bitsAt30(pixels: number): number {
  const first = HIGH_30FPS[0] as [number, number];
  const last = HIGH_30FPS[HIGH_30FPS.length - 1] as [number, number];
  // Outside the table, keep the bits-per-pixel of the nearest end.
  if (pixels <= first[0]) return (first[1] * pixels) / first[0];
  if (pixels >= last[0]) return (last[1] * pixels) / last[0];
  for (let i = 1; i < HIGH_30FPS.length; i++) {
    const [p1, b1] = HIGH_30FPS[i] as [number, number];
    if (pixels <= p1) {
      const [p0, b0] = HIGH_30FPS[i - 1] as [number, number];
      return b0 + ((b1 - b0) * (pixels - p0)) / (p1 - p0);
    }
  }
  return last[1];
}

export function exportRateControl(
  codec: ExportVideoCodec,
  width: number,
  height: number,
  fps: number,
  quality: ExportQualityLevel,
): { quantizer: number; bitrate: number } {
  // More frames need more bits, but not proportionally: consecutive frames
  // at higher rates are more alike. 60 fps gets about 1.5x.
  const fpsFactor = (Math.max(1, fps) / 30) ** 0.6;
  const bitrate =
    bitsAt30(Math.max(1, width * height)) *
    fpsFactor *
    TIER[quality] *
    CODEC[codec];
  return {
    quantizer: QUANTIZER[quality],
    bitrate: Math.max(100_000, Math.round(bitrate / 1000) * 1000),
  };
}
