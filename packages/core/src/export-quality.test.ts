import { describe, expect, it } from "vitest";
import { exportRateControl } from "./export-quality.ts";

const mbps = (b: number) => Math.round(b / 1e5) / 10;

describe("exportRateControl", () => {
  it("keeps the constant-quality levels the encoder already uses", () => {
    // Measured on the Mac hardware encoder: these give 48 dB brightness PSNR
    // on heavy grain at "high". Changing them changes every export.
    expect(exportRateControl("avc", 1920, 1080, 30, "standard").quantizer).toBe(
      29,
    );
    expect(exportRateControl("avc", 1920, 1080, 30, "high").quantizer).toBe(22);
    expect(exportRateControl("avc", 1920, 1080, 30, "max").quantizer).toBe(16);
    expect(exportRateControl("hevc", 1920, 1080, 30, "high").quantizer).toBe(
      22,
    );
  });

  it("falls back to recommended upload bitrates for H.264 'high' at 30 fps", () => {
    expect(mbps(exportRateControl("avc", 1280, 720, 30, "high").bitrate)).toBe(
      5,
    );
    expect(mbps(exportRateControl("avc", 1920, 1080, 30, "high").bitrate)).toBe(
      8,
    );
    expect(mbps(exportRateControl("avc", 2560, 1440, 30, "high").bitrate)).toBe(
      16,
    );
    expect(mbps(exportRateControl("avc", 3840, 2160, 30, "high").bitrate)).toBe(
      40,
    );
  });

  it("gives 60 fps about 1.5x the bits of 30 fps", () => {
    const at30 = exportRateControl("avc", 1920, 1080, 30, "high").bitrate;
    const at60 = exportRateControl("avc", 1920, 1080, 60, "high").bitrate;
    expect(at60 / at30).toBeGreaterThan(1.45);
    expect(at60 / at30).toBeLessThan(1.6);
    // And 24 fps a little less than 30.
    expect(
      exportRateControl("avc", 1920, 1080, 24, "high").bitrate,
    ).toBeLessThan(at30);
  });

  it("treats portrait the same as landscape with the same pixel count", () => {
    expect(exportRateControl("avc", 1080, 1920, 30, "high").bitrate).toBe(
      exportRateControl("avc", 1920, 1080, 30, "high").bitrate,
    );
  });

  it("interpolates between sizes and grows with every step up", () => {
    const sizes: [number, number][] = [
      [640, 360],
      [1080, 1080],
      [1080, 1350],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
      [5120, 2880],
    ];
    const rates = sizes.map(
      ([w, h]) => exportRateControl("avc", w, h, 30, "high").bitrate,
    );
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1] as number);
    }
    // 4:5 (1080x1350) has more pixels than square (1080x1080), so more bits.
    expect(rates[2]).toBeGreaterThan(rates[1] as number);
  });

  it("orders the quality tiers and makes HEVC smaller than H.264", () => {
    const at = (q: "standard" | "high" | "max") =>
      exportRateControl("avc", 1920, 1080, 30, q).bitrate;
    expect(at("standard")).toBeLessThan(at("high"));
    expect(at("high")).toBeLessThan(at("max"));
    expect(
      exportRateControl("hevc", 1920, 1080, 30, "high").bitrate,
    ).toBeLessThan(at("high"));
  });

  it("always returns a whole, positive bitrate", () => {
    for (const fps of [1, 24, 60, 120]) {
      const { bitrate } = exportRateControl("hevc", 2, 2, fps, "standard");
      expect(Number.isInteger(bitrate)).toBe(true);
      expect(bitrate).toBeGreaterThan(0);
    }
  });
});
