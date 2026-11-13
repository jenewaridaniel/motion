/**
 * Turns text and its style into an image for the compositor.
 *
 * The image is drawn at the size it will appear on screen (or in the export),
 * so text stays sharp at any zoom or scale. Results are cached and never
 * changed afterwards, so the compositor uploads each one to the GPU only once.
 */
import type { TextStyle } from "@motion/core";
import type { PlacedImage } from "@motion/renderer";

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Largest side of a text image. Safe on every GPU. */
const MAX_SIDE = 4096;
/** Cache limit, in pixels of all cached images together (about 256 MB). */
const CACHE_PIXELS = 64 * 1024 * 1024;

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "system-ui",
]);

export function cssFont(style: TextStyle): string {
  const name = style.font.replace(/"/g, "");
  // Generic families must not be quoted, or they're read as a font name.
  const family = GENERIC.has(name) ? name : `"${name}", sans-serif`;
  return `${style.italic ? "italic " : ""}${style.weight} ${style.size}px ${family}`;
}

/** The font set to wait on: the page's, or a worker's. */
function fontSet(): FontFaceSet | null {
  const g = globalThis as { document?: Document; fonts?: FontFaceSet };
  return g.document?.fonts ?? g.fonts ?? null;
}

const fontLoads = new Map<string, Promise<unknown>>();

/** Wait until the font for `style` can draw `text`. Never throws. */
function loadFont(style: TextStyle, text: string): Promise<unknown> {
  const fonts = fontSet();
  if (!fonts) return Promise.resolve();
  const key = cssFont(style);
  // Different text may need different subsets (e.g. accented letters), but
  // asking again is cheap once the common subset is in.
  const cached = fontLoads.get(key);
  if (cached && fonts.check(key, text)) return cached;
  const p = fonts.load(key, text).catch(() => undefined);
  fontLoads.set(key, p);
  return p;
}

/** Round the scale up to a quarter-octave step, so smooth zooms reuse images. */
export function pixelRatioStep(ratio: number): number {
  const r = Math.max(0.25, ratio);
  return 2 ** (Math.ceil(Math.log2(r) * 4) / 4);
}

function layout(ctx: Canvas2D, text: string, style: TextStyle) {
  ctx.font = cssFont(style);
  if ("letterSpacing" in ctx) {
    (ctx as { letterSpacing: string }).letterSpacing =
      `${style.letterSpacing}px`;
  }
  const lines = text.split("\n");
  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineHeight = style.size * style.lineHeight;
  return {
    lines,
    widths,
    lineHeight,
    width: Math.max(1, ...widths),
    height: Math.max(1, lines.length * lineHeight),
  };
}

export class TextRasterizer {
  private cache = new Map<string, PlacedImage>();
  private cachedPixels = 0;
  private measure: Canvas2D | null = null;

  /**
   * An image of `text`, centred on the layer's origin. `pixelRatio` is how
   * many output pixels one layer pixel covers.
   */
  async render(
    text: string,
    style: TextStyle,
    pixelRatio: number,
  ): Promise<PlacedImage | null> {
    if (text.trim() === "") return null;
    const ratio = pixelRatioStep(pixelRatio);
    const key = JSON.stringify([text, style, ratio]);
    const hit = this.cache.get(key);
    if (hit) {
      // Keep recently used images at the end, so they're evicted last.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }

    await loadFont(style, text);
    if (!this.measure) {
      this.measure = makeCanvas(1, 1).getContext("2d") as Canvas2D;
    }
    const m = layout(this.measure, text, style);

    // The text block (plus its box) is centred on the origin. Outlines and
    // shadows spill outside it, so the image gets a margin for them.
    const pad = style.box ? style.box.padding : 0;
    const blockW = m.width + pad * 2;
    const blockH = m.height + pad * 2;
    const stroke = style.stroke ? style.stroke.width : 0;
    const shadow = style.shadow
      ? style.shadow.blur * 2 +
        Math.max(Math.abs(style.shadow.x), Math.abs(style.shadow.y))
      : 0;
    const margin = Math.ceil(stroke + shadow + style.size * 0.15);
    const width = blockW + margin * 2;
    const height = blockH + margin * 2;

    const scale = Math.min(ratio, MAX_SIDE / width, MAX_SIDE / height);
    const canvas = makeCanvas(
      Math.max(1, Math.ceil(width * scale)),
      Math.max(1, Math.ceil(height * scale)),
    );
    const ctx = canvas.getContext("2d") as Canvas2D | null;
    if (!ctx) return null;
    ctx.scale(scale, scale);
    // From here on, coordinates are layer pixels with the block centred.
    ctx.translate(width / 2, height / 2);

    const shadowOn = () => {
      if (!style.shadow) return;
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur * scale;
      ctx.shadowOffsetX = style.shadow.x * scale;
      ctx.shadowOffsetY = style.shadow.y * scale;
    };
    const shadowOff = () => {
      ctx.shadowColor = "transparent";
    };

    // The shadow goes on the first thing painted, so it isn't doubled.
    let shadowUsed = false;
    if (style.box) {
      shadowOn();
      shadowUsed = true;
      ctx.fillStyle = style.box.color;
      ctx.beginPath();
      ctx.roundRect(-blockW / 2, -blockH / 2, blockW, blockH, style.box.radius);
      ctx.fill();
      shadowOff();
    }

    // Re-apply the font: a new context starts with defaults.
    layout(ctx, "", style);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.lineJoin = "round";
    const top = -m.height / 2;
    const lineX = (w: number) =>
      style.align === "left"
        ? -m.width / 2
        : style.align === "right"
          ? m.width / 2 - w
          : -w / 2;

    if (style.stroke && style.stroke.width > 0) {
      if (!shadowUsed) shadowOn();
      ctx.strokeStyle = style.stroke.color;
      // Twice as wide, because the fill covers the inner half.
      ctx.lineWidth = style.stroke.width * 2;
      m.lines.forEach((line, i) => {
        ctx.strokeText(
          line,
          lineX(m.widths[i] ?? 0),
          top + (i + 0.5) * m.lineHeight,
        );
      });
      shadowOff();
      shadowUsed = true;
    }

    if (!shadowUsed) shadowOn();
    ctx.fillStyle = style.color;
    m.lines.forEach((line, i) => {
      ctx.fillText(
        line,
        lineX(m.widths[i] ?? 0),
        top + (i + 0.5) * m.lineHeight,
      );
    });

    const placed: PlacedImage = {
      image: canvas,
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      fixed: true,
    };
    this.cache.set(key, placed);
    this.cachedPixels += canvas.width * canvas.height;
    // Evict the least recently used until under budget (always keep this one).
    while (this.cachedPixels > CACHE_PIXELS && this.cache.size > 1) {
      const [oldKey, old] = this.cache.entries().next().value as [
        string,
        PlacedImage,
      ];
      this.cache.delete(oldKey);
      const c = old.image as { width: number; height: number };
      this.cachedPixels -= c.width * c.height;
    }
    return placed;
  }
}
