/**
 * Pictures of templates for the gallery, drawn by the real renderer (the
 * same code as the preview and export), one at a time, then cached.
 */
import {
  evaluateFrame,
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
    const blob = await canvas.convertToBlob({ type: "image/png" });
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
