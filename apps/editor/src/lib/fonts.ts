/**
 * Fonts for text. The bundled ones are generated from their packages by
 * scripts/gen-fonts.mjs (all OFL or Apache 2.0, free to use in any video)
 * and download only when first used. Users can also add their own files.
 */
import type { Project } from "@motion/core";
import { BUNDLED_FONTS } from "./fonts.generated.ts";

export interface FontOption {
  label: string;
  /** CSS family name, as registered by the font's stylesheet. */
  family: string;
  /** Menu section. */
  group: string;
  /** Lightest and heaviest weight the font really has. */
  minWeight: number;
  maxWeight: number;
  /** Whether it has real italic letters (others would be slanted fakes). */
  italic: boolean;
  license?: string;
}

export const FONTS: FontOption[] = BUNDLED_FONTS;

export const FONT_GROUPS = ["Sans", "Display", "Serif", "Handwritten", "Mono"];

export const YOUR_FONTS = "Your fonts";

export const DEFAULT_FONT = (FONTS.find((f) => f.label === "Archivo") ??
  FONTS[0]) as FontOption;

/** The user's own fonts, as menu options. One file each, so any weight. */
export function customFonts(project: Project): FontOption[] {
  return Object.values(project.fonts ?? {}).map((f) => ({
    label: f.family,
    family: f.family,
    group: YOUR_FONTS,
    minWeight: 100,
    maxWeight: 900,
    italic: false,
  }));
}

export function fontByFamily(
  family: string,
  project?: Project,
): FontOption | undefined {
  return (
    FONTS.find((f) => f.family === family) ??
    (project
      ? customFonts(project).find((f) => f.family === family)
      : undefined)
  );
}

/** The closest weight `font` really has. */
export function clampWeight(font: FontOption, weight: number): number {
  return Math.min(font.maxWeight, Math.max(font.minWeight, weight));
}
