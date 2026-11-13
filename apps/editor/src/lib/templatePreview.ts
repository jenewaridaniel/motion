/**
 * Pictures of templates for the gallery, drawn by the real renderer (the
 * same code as the preview and export), one at a time, then cached.
 */
import {
  evaluateFrame,
  placeholdersAt,
  projectFromTemplate,
  rootComposition,
  sec,
  TEMPLATES,
} from "@motion/core";
import { FrameProvider } from "@motion/media";
import { Compositor } from "@motion/renderer";

const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

async function draw(id: string, width: number): Promise<string | null> {
  const t = TEMPLATES.find((x) => x.id === id);
  const p = projectFromTemplate(id);
  if (!t || !p) return null;
  const comp = rootComposition(p);
  const height = Math.round((width * comp.height) / comp.width);
  const canvas = new OffscreenCanvas(width, height);
  const compositor = new Compositor(canvas, { preserveDrawingBuffer: true });
  // Templates have no media, only text and shapes.
  const frames = new FrameProvider(() => undefined);
  try {
    const draws = evaluateFrame(p, sec(t.previewAt));
    const images = await frames.images(draws, width / comp.width);
    compositor.render({
      draws,
      images,
      compWidth: comp.width,
      compHeight: comp.height,
      background: comp.background,
    });
    // Show the template's empty slots, as the editor does.
    const out = new OffscreenCanvas(width, height);
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    const k = width / comp.width;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (const slot of placeholdersAt(p, sec(t.previewAt))) {
      ctx.beginPath();
      for (const [i, [x, y]] of slot.corners.entries()) {
        // Inset a little so full-canvas slots show their edge.
        const ix = Math.min(Math.max(x * k, 2), width - 2);
        const iy = Math.min(Math.max(y * k, 2), height - 2);
        if (i === 0) ctx.moveTo(ix, iy);
        else ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    const blob = await out.convertToBlob({ type: "image/png" });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("[motion] template preview", id, err);
    return null;
  } finally {
    void frames.dispose();
    compositor.dispose({ loseContext: true });
  }
}

/** A picture of the template (object URL), or null if it can't be drawn. */
export function templatePreview(
  id: string,
  width = 360,
): Promise<string | null> {
  const key = `${id}@${width}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = queue.then(() => draw(id, width));
    queue = hit;
    cache.set(key, hit);
  }
  return hit;
}
