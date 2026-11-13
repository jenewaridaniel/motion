import {
  type Asset,
  type MediaLayer,
  PEAKS_PER_SECOND,
  peakBetween,
  quantizeThumbTime,
  sourceTimeAt,
  thumbnailSlots,
  US,
  valueAt,
} from "@motion/core";
import { useEffect, useReducer, useRef, useState } from "react";
import { getHandle } from "../state/media.ts";
import { onVisualsChanged, peaksFor, thumbnails } from "../state/visuals.ts";

/** Clips are drawn in tiles this wide, and only the visible ones. */
const TILE = 1024;
/** Height of the waveform strip under a video clip's thumbnails. */
const STRIP = 16;

interface Props {
  layer: MediaLayer;
  asset: Asset;
  /** Clip size in CSS pixels. */
  width: number;
  height: number;
  pxPerSec: number;
}

/** Thumbnails and/or a waveform behind a timeline clip. */
export function ClipVisuals(props: Props) {
  const tiles = Math.ceil(props.width / TILE);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: tiles }, (_, i) => (
        <Tile
          // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
          key={i}
          {...props}
          x0={i * TILE}
          w={Math.min(TILE, props.width - i * TILE)}
        />
      ))}
    </div>
  );
}

function Tile({
  layer,
  asset,
  height,
  pxPerSec,
  x0,
  w,
}: Props & { x0: number; w: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [version, bump] = useReducer((n: number) => n + 1, 0);

  // Draw only while on screen (the timeline can be far wider than the view).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setVisible(!!e?.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => (visible ? onVisualsChanged(bump) : undefined), [visible]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version redraws when thumbnails/peaks arrive
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !visible || w <= 0 || height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);
    const peaks = peaksFor(asset);
    const visual = asset.kind !== "audio";
    const waveH = visual ? (peaks ? STRIP : 0) : height;
    if (visual)
      drawThumbnails(ctx, layer, asset, x0, w, height - waveH, pxPerSec);
    if (peaks)
      drawWaveform(
        ctx,
        layer,
        peaks,
        x0,
        w,
        height - waveH,
        waveH,
        pxPerSec,
        visual,
      );
  }, [visible, version, layer, asset, height, pxPerSec, x0, w]);

  return (
    <canvas
      ref={ref}
      className="absolute top-0"
      style={{ left: x0, width: w, height }}
    />
  );
}

function drawThumbnails(
  ctx: CanvasRenderingContext2D,
  layer: MediaLayer,
  asset: Asset,
  x0: number,
  w: number,
  h: number,
  pxPerSec: number,
) {
  if (h <= 0 || asset.width <= 0 || asset.height <= 0) return;
  const slotWidth = Math.max(8, (h * asset.width) / asset.height);
  const image = asset.kind === "image" ? getHandle(asset.id)?.image : null;
  const slots = thumbnailSlots({
    tileStart: x0,
    tileWidth: w,
    slotWidth,
    pxPerSec,
  });
  // Source time between neighbouring slots, for the cache grid.
  const spacing = (slotWidth / pxPerSec) * US * layer.speed;
  const wanted: number[] = [];
  for (const slot of slots) {
    const x = slot.x - x0;
    if (image) {
      ctx.drawImage(image, x, 0, slotWidth, h);
      continue;
    }
    const raw = Math.min(
      sourceTimeAt(layer, slot.local),
      Math.max(0, asset.duration - 1),
    );
    const t = quantizeThumbTime(raw, spacing);
    const frame = thumbnails.get(asset.id, t);
    if (frame) ctx.drawImage(frame, x, 0, slotWidth, h);
    else wanted.push(t);
  }
  if (wanted.length > 0) thumbnails.want(asset, wanted);
  // Thin dividers between thumbnails, as in other editors.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (const slot of slots) ctx.fillRect(slot.x - x0, 0, 1, h);
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  layer: MediaLayer,
  peaks: Float32Array,
  x0: number,
  w: number,
  top: number,
  h: number,
  pxPerSec: number,
  strip: boolean,
) {
  if (h <= 0) return;
  if (strip) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, top, w, h);
  }
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  const mid = top + h / 2;
  for (let x = 0; x < w; x++) {
    const local = ((x0 + x) / pxPerSec) * US;
    const a = sourceTimeAt(layer, local) / US;
    const b = sourceTimeAt(layer, local + US / pxPerSec) / US;
    // Show what you'll hear: the clip's volume scales the wave.
    const gain = Math.min(2, Math.max(0, valueAt(layer.volume, local)));
    const amp = Math.min(1, peakBetween(peaks, PEAKS_PER_SECOND, a, b) * gain);
    const bar = Math.max(1, amp * (h - 2));
    ctx.fillRect(x, mid - bar / 2, 1, bar);
  }
}
