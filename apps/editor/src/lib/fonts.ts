/**
 * Fonts offered for text. All are open-source (SIL Open Font License) and
 * bundled with the app, so text never loads anything from another site.
 * Each file downloads only when a font is first used.
 */
import "@fontsource-variable/archivo/wght-italic.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/anton/400.css";
import "@fontsource-variable/playfair-display/wght.css";
import "@fontsource-variable/playfair-display/wght-italic.css";
import "@fontsource-variable/caveat/wght.css";
import "@fontsource/pacifico/400.css";

export interface FontOption {
  label: string;
  /** CSS family name, as registered by the font's stylesheet. */
  family: string;
  /** Lightest and heaviest weight the font really has. */
  minWeight: number;
  maxWeight: number;
  /** Whether it has real italic letters (others would be slanted fakes). */
  italic: boolean;
}

export const FONTS: FontOption[] = [
  {
    label: "Archivo",
    family: "Archivo Variable",
    minWeight: 100,
    maxWeight: 900,
    italic: true,
  },
  {
    label: "Inter",
    family: "Inter Variable",
    minWeight: 100,
    maxWeight: 900,
    italic: true,
  },
  {
    label: "Bebas Neue",
    family: "Bebas Neue",
    minWeight: 400,
    maxWeight: 400,
    italic: false,
  },
  {
    label: "Anton",
    family: "Anton",
    minWeight: 400,
    maxWeight: 400,
    italic: false,
  },
  {
    label: "Playfair Display",
    family: "Playfair Display Variable",
    minWeight: 400,
    maxWeight: 900,
    italic: true,
  },
  {
    label: "Caveat",
    family: "Caveat Variable",
    minWeight: 400,
    maxWeight: 700,
    italic: false,
  },
  {
    label: "Pacifico",
    family: "Pacifico",
    minWeight: 400,
    maxWeight: 400,
    italic: false,
  },
];

export const DEFAULT_FONT = FONTS[0] as FontOption;

export function fontByFamily(family: string): FontOption | undefined {
  return FONTS.find((f) => f.family === family);
}

/** The closest weight `font` really has. */
export function clampWeight(font: FontOption, weight: number): number {
  return Math.min(font.maxWeight, Math.max(font.minWeight, weight));
}
