/**
 * Turns a shape and its style into an image for the compositor, drawn at the
 * size it will appear (like text), so edges stay sharp at any scale. Cached;
 * images are never changed afterwards.
 */
import {
  gradientLine,
  type ShapeKind,
  type ShapeStyle,
  shapePath,
  type Vec2,
} from "@motion/core";
import type { PlacedImage } from "@motion/renderer";
import { pixelRatioStep } from "./text.ts";

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const MAX_SIDE = 4096;
const CACHE_PIXELS = 32 * 1024 * 1024;

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export class ShapeRasterizer {
  private cache = new Map<string, PlacedImage>();
  private cachedPixels = 0;

  /** An image of the shape, centred on the layer's origin. */
  render(
    shape: ShapeKind,
    size: Vec2,
    style: ShapeStyle,
    pixelRatio: number,
  ): PlacedImage | null {
    if (!style.fill && !style.stroke) return null;
    const ratio = pixelRatioStep(pixelRatio);
    const key = JSON.stringify([shape, size, style, ratio]);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    // The outline is centred on the edge, so half of it is outside the box.
    const margin = Math.ceil((style.stroke?.width ?? 0) / 2 + 2);
    const width = size[0] + margin * 2;
    const height = size[1] + margin * 2;
    const scale = Math.min(ratio, MAX_SIDE / width, MAX_SIDE / height);
    const canvas = makeCanvas(
      Math.max(1, Math.ceil(width * scale)),
      Math.max(1, Math.ceil(height * scale)),
    );
    const ctx = canvas.getContext("2d") as Canvas2D | null;
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.translate(width / 2, height / 2);
    const path = new Path2D();
    for (const c of shapePath(shape, size[0], size[1], style.radius)) {
      if (c[0] === "M") path.moveTo(c[1], c[2]);
      else if (c[0] === "L") path.lineTo(c[1], c[2]);
      else if (c[0] === "Q") path.quadraticCurveTo(c[1], c[2], c[3], c[4]);
      else if (c[0] === "C")
        path.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
      else path.closePath();
    }
    if (style.fill) {
      if (style.gradient) {
        const [x0, y0, x1, y1] = gradientLine(
          size[0],
          size[1],
          style.gradient.angle,
        );
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, style.fill);
        g.addColorStop(1, style.gradient.color);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = style.fill;
      }
      ctx.fill(path);
    }
    if (style.stroke && style.stroke.width > 0) {
      ctx.strokeStyle = style.stroke.color;
      ctx.lineWidth = style.stroke.width;
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }
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
