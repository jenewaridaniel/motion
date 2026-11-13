import {
  apply,
  dragPosition,
  findLayer,
  layerHitTest,
  parentMatrixAt,
  rectCorners,
  setPropertyValue,
  type Vec2,
  valueAt,
} from "@motion/core";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { engine } from "../lib/engine.ts";
import { useEditor } from "../state/store.ts";

/** How close (in screen pixels) a layer's centre must be to snap to a centre line. */
const SNAP_PX = 8;

let gesture = 0;

interface Drag {
  id: string;
  /** Pointer position on the canvas when the drag started. */
  x0: number;
  y0: number;
  /** The layer's position value when the drag started. */
  start: Vec2;
  /** Where that position sits on the canvas. */
  startOnCanvas: [number, number];
  key: string;
  moved: boolean;
}

/**
 * Sits exactly over the preview canvas. Click a clip to select it, drag to
 * move it. The layer's centre snaps to the canvas centre lines.
 */
export function CanvasOverlay({
  width,
  height,
  compWidth,
  compHeight,
}: {
  width: number;
  height: number;
  compWidth: number;
  compHeight: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const selection = useEditor((s) => s.selection);
  // Redraw the outline whenever the preview draws a new frame.
  const [, frameDrawn] = useReducer((n: number) => n + 1, 0);
  useEffect(() => engine.onFrame(frameDrawn), []);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [hovering, setHovering] = useState(false);
  const drag = useRef<Drag | null>(null);

  // Screen pixels per canvas pixel.
  const k = width / compWidth;
  const frame = engine.lastFrame;
  const selected = selection
    ? frame.draws.find((d) => d.key === selection)
    : undefined;
  const rect = selected && frame.rects.get(selected.key);
  const outline =
    selected && rect
      ? rectCorners(selected.matrix, rect)
          .map(([x, y]) => `${x * k},${y * k}`)
          .join(" ")
      : null;

  const toCanvas = (e: ReactPointerEvent): [number, number] => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [(e.clientX - box.left) / k, (e.clientY - box.top) / k];
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const [x, y] = toCanvas(e);
    const { draws, rects } = engine.lastFrame;
    const id = layerHitTest(draws, rects, x, y);
    const s = useEditor.getState();
    s.select(id);
    if (!id) return;
    const layer = findLayer(s.project, id)?.layer;
    if (!layer) return;
    engine.pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = useEditor.getState().playhead;
    const start = valueAt(layer.transform.position, t - layer.start);
    drag.current = {
      id,
      x0: x,
      y0: y,
      start,
      startOnCanvas: apply(
        parentMatrixAt(s.project, id, t),
        start[0],
        start[1],
      ),
      key: `canvas-${++gesture}`,
      moved: false,
    };
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const [x, y] = toCanvas(e);
    const d = drag.current;
    if (!d) {
      const { draws, rects } = engine.lastFrame;
      setHovering(layerHitTest(draws, rects, x, y) !== null);
      return;
    }
    let dx = x - d.x0;
    let dy = y - d.y0;
    if (!d.moved && Math.hypot(dx, dy) * k < 3) return;
    d.moved = true;
    // Snap the layer's anchor (its centre, by default) to the centre lines.
    const tol = SNAP_PX / k;
    const cx = d.startOnCanvas[0] + dx;
    const cy = d.startOnCanvas[1] + dy;
    const snapX = !e.altKey && Math.abs(cx - compWidth / 2) < tol;
    const snapY = !e.altKey && Math.abs(cy - compHeight / 2) < tol;
    if (snapX) dx = compWidth / 2 - d.startOnCanvas[0];
    if (snapY) dy = compHeight / 2 - d.startOnCanvas[1];
    setGuides({ x: snapX, y: snapY });
    const s = useEditor.getState();
    const next = dragPosition(s.project, d.id, s.playhead, d.start, dx, dy);
    s.edit(
      (draft) =>
        void setPropertyValue(
          draft,
          d.id,
          "transform.position",
          next,
          s.playhead,
        ),
      d.key,
    );
  };

  const onUp = () => {
    if (drag.current?.moved) useEditor.getState().seal();
    drag.current = null;
    setGuides({ x: false, y: false });
  };

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      aria-hidden="true"
      className="absolute inset-0 touch-none"
      style={{
        cursor: drag.current?.moved
          ? "grabbing"
          : hovering
            ? "move"
            : "default",
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => setHovering(false)}
    >
      {guides.x && (
        <line
          x1={width / 2}
          y1={0}
          x2={width / 2}
          y2={height}
          stroke="var(--color-flare)"
          strokeDasharray="4 4"
        />
      )}
      {guides.y && (
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-flare)"
          strokeDasharray="4 4"
        />
      )}
      {outline && (
        <polygon
          points={outline}
          fill="none"
          stroke="var(--color-flare)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
