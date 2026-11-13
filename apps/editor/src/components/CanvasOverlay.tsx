import {
  angleStep,
  apply,
  dragPosition,
  findLayer,
  handleSizes,
  layerHitTest,
  parentMatrixAt,
  placeholderHit,
  placeholdersAt,
  rectCorners,
  scaleFromHandle,
  setPropertyValue,
  snapRotation,
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
import { pickForPlaceholder } from "../state/placeholders.ts";
import { useEditor } from "../state/store.ts";

/** How close (in screen pixels) a layer's centre must be to snap to a centre line. */
const SNAP_PX = 8;

let gesture = 0;

const hasTouchScreen = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(any-pointer: coarse)").matches;

/** Corners in the order `rectCorners` gives them. */
const CORNER_NAMES = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** A corner (scale) or rotate-handle drag. Points are in canvas pixels. */
interface HandleDrag {
  mode: "scale" | "rotate";
  id: string;
  /** The layer's anchor on the canvas: what it scales and turns around. */
  center: [number, number];
  start: [number, number];
  /** Previous pointer position (rotation adds up the steps). */
  last: [number, number];
  startScale: Vec2;
  /** Rotation so far, before snapping. */
  rotation: number;
  key: string;
}

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
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const slots = placeholdersAt(project, playhead);
  // Redraw the outline whenever the preview draws a new frame.
  const [, frameDrawn] = useReducer((n: number) => n + 1, 0);
  useEffect(() => engine.onFrame(frameDrawn), []);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [hovering, setHovering] = useState(false);
  const drag = useRef<Drag | null>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  // Finger-sized handles on touch screens, or once a finger has been used.
  const [touchUsed, setTouchUsed] = useState(false);
  const touch = touchUsed || hasTouchScreen();
  const playing = useEditor((s) => s.playing);

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

  // Corners on screen, and the rotate handle a little beyond the top edge.
  const corners =
    selected && rect
      ? rectCorners(selected.matrix, rect).map(
          ([x, y]) => [x * k, y * k] as [number, number],
        )
      : null;
  // Shortest side of the selection on screen, for sizing the handles.
  const side = corners
    ? Math.min(
        ...corners.map(([x, y], i) => {
          const [nx, ny] = corners[(i + 1) % 4] as [number, number];
          return Math.hypot(nx - x, ny - y);
        }),
      )
    : 0;
  const sizes = handleSizes(touch, side);
  const rotateHandle = (() => {
    if (!corners) return null;
    const [a, b, c, d] = corners as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const top: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const mid: [number, number] = [
      (a[0] + b[0] + c[0] + d[0]) / 4,
      (a[1] + b[1] + c[1] + d[1]) / 4,
    ];
    const len = Math.hypot(top[0] - mid[0], top[1] - mid[1]) || 1;
    const out = sizes.rotateOffset;
    return {
      from: top,
      at: [
        top[0] + ((top[0] - mid[0]) / len) * out,
        top[1] + ((top[1] - mid[1]) / len) * out,
      ] as [number, number],
    };
  })();

  const startHandle = (
    e: ReactPointerEvent<SVGElement>,
    mode: HandleDrag["mode"],
  ) => {
    if (e.pointerType === "touch") setTouchUsed(true);
    if (e.button !== 0 || !selected) return;
    e.stopPropagation();
    const s = useEditor.getState();
    const layer = findLayer(s.project, selected.layerId)?.layer;
    if (!layer) return;
    engine.pause();
    ref.current?.setPointerCapture(e.pointerId);
    const local = s.playhead - layer.start;
    const anchor = valueAt(layer.transform.anchor, local);
    const p = toCanvas(e);
    handleDrag.current = {
      mode,
      id: layer.id,
      center: apply(selected.matrix, anchor[0], anchor[1]),
      start: p,
      last: p,
      startScale: valueAt(layer.transform.scale, local),
      rotation: valueAt(layer.transform.rotation, local),
      key: `handle-${++gesture}`,
    };
  };

  const moveHandle = (e: ReactPointerEvent, h: HandleDrag) => {
    const p = toCanvas(e);
    const s = useEditor.getState();
    if (h.mode === "scale") {
      const next = scaleFromHandle(h.center, h.start, p, h.startScale);
      s.edit(
        (d) =>
          void setPropertyValue(d, h.id, "transform.scale", next, s.playhead),
        h.key,
      );
      return;
    }
    h.rotation += angleStep(h.center, h.last, p);
    h.last = p;
    const next = e.altKey ? h.rotation : snapRotation(h.rotation);
    s.edit(
      (d) =>
        void setPropertyValue(d, h.id, "transform.rotation", next, s.playhead),
      h.key,
    );
  };

  const toCanvas = (e: ReactPointerEvent): [number, number] => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [(e.clientX - box.left) / k, (e.clientY - box.top) / k];
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") setTouchUsed(true);
    if (e.button !== 0) return;
    const [x, y] = toCanvas(e);
    const { draws, rects } = engine.lastFrame;
    const s = useEditor.getState();
    const drawn = layerHitTest(draws, rects, x, y);
    if (!drawn) {
      // Empty slots aren't drawn, but you can still click them.
      s.select(placeholderHit(slots, x, y));
      return;
    }
    const id = drawn;
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
    if (handleDrag.current) {
      moveHandle(e, handleDrag.current);
      return;
    }
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
    if (handleDrag.current) {
      handleDrag.current = null;
      useEditor.getState().seal();
      return;
    }
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
      {slots.map((slot) => {
        const pts = slot.corners.map(([x, y]) => [x * k, y * k]);
        const cx = pts.reduce((a, p) => a + (p[0] ?? 0), 0) / 4;
        const cy = pts.reduce((a, p) => a + (p[1] ?? 0), 0) / 4;
        const active = slot.layerId === selection;
        return (
          <g key={slot.layerId} data-placeholder={slot.layerId}>
            <polygon
              points={pts.map((p) => p.join(",")).join(" ")}
              fill="rgba(255,255,255,0.04)"
              stroke={active ? "var(--color-flare)" : "rgba(255,255,255,0.55)"}
              strokeWidth={1.5}
              strokeDasharray="6 5"
              pointerEvents="none"
            />
            <text
              x={cx}
              y={cy - 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.8)"
              fontSize={12}
              pointerEvents="none"
            >
              {slot.label}
            </text>
            {/* Pointer shortcut only (this overlay is hidden from screen
                readers); the same action is a real button in the settings. */}
            <g
              style={{ cursor: "pointer" }}
              data-add-placeholder={slot.layerId}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button === 0) pickForPlaceholder(slot.layerId);
              }}
            >
              <rect
                x={cx - 42}
                y={cy - 4}
                width={84}
                height={28}
                rx={14}
                fill="var(--color-flare)"
              />
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fill="var(--color-flare-ink)"
                fontSize={12}
                fontWeight={600}
              >
                + Add
              </text>
            </g>
          </g>
        );
      })}
      {outline && (
        <polygon
          points={outline}
          fill="none"
          stroke="var(--color-flare)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {corners && rotateHandle && !playing && (
        <g>
          <line
            x1={rotateHandle.from[0]}
            y1={rotateHandle.from[1]}
            x2={rotateHandle.at[0]}
            y2={rotateHandle.at[1]}
            stroke="var(--color-flare)"
            strokeWidth={1.5}
          />
          {/* Bigger invisible targets, so the handles are easy to grab. */}
          <circle
            data-handle="rotate"
            cx={rotateHandle.at[0]}
            cy={rotateHandle.at[1]}
            r={sizes.target / 2}
            fill="transparent"
            style={{ cursor: "grab" }}
            onPointerDown={(e) => startHandle(e, "rotate")}
          />
          <circle
            cx={rotateHandle.at[0]}
            cy={rotateHandle.at[1]}
            r={sizes.visible / 2}
            fill="var(--color-ink)"
            stroke="var(--color-flare)"
            strokeWidth={1.5}
            pointerEvents="none"
          />
          {corners.map(([x, y], i) => (
            <g key={CORNER_NAMES[i]}>
              <rect
                data-handle={`scale-${i}`}
                x={x - sizes.target / 2}
                y={y - sizes.target / 2}
                width={sizes.target}
                height={sizes.target}
                fill="transparent"
                style={{ cursor: i % 2 === 0 ? "nwse-resize" : "nesw-resize" }}
                onPointerDown={(e) => startHandle(e, "scale")}
              />
              <rect
                x={x - sizes.visible / 2}
                y={y - sizes.visible / 2}
                width={sizes.visible}
                height={sizes.visible}
                rx={1.5}
                fill="var(--color-ink)"
                stroke="var(--color-flare)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
