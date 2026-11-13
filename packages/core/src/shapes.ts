/**
 * Shapes and stickers: vector graphics drawn by Motion itself.
 *
 * `shapePath` gives each shape as plain path commands in a box centred on
 * the origin. The renderer turns them into Canvas paths, the editor into SVG
 * for its thumbnails, so both show exactly the same outline.
 */
import type { Vec2 } from "./property.ts";

export const SHAPE_KINDS = [
  "rect",
  "ellipse",
  "triangle",
  "star",
  "heart",
  "arrow",
  "line",
  "speech",
  "burst",
  "sparkle",
  "check",
  "cross",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  star: "Star",
  heart: "Heart",
  arrow: "Arrow",
  line: "Line",
  speech: "Speech bubble",
  burst: "Burst",
  sparkle: "Sparkle",
  check: "Tick",
  cross: "Cross",
};

export interface ShapeStyle {
  /** CSS hex, or null for no fill. */
  fill: string | null;
  /** Outline; its width is in layer pixels. */
  stroke: { color: string; width: number } | null;
  /** Corner rounding for rectangles and speech bubbles, in layer pixels. */
  radius: number;
}

export type PathCommand =
  | ["M", number, number]
  | ["L", number, number]
  | ["Q", number, number, number, number]
  | ["C", number, number, number, number, number, number]
  | ["Z"];

/** Bezier handle length for a quarter circle. */
const K = 0.5522847498;

function polygon(points: Vec2[]): PathCommand[] {
  const [first, ...rest] = points;
  if (!first) return [];
  return [
    ["M", first[0], first[1]],
    ...rest.map(([x, y]): PathCommand => ["L", x, y]),
    ["Z"],
  ];
}

function ellipse(rx: number, ry: number, cx = 0, cy = 0): PathCommand[] {
  const kx = rx * K;
  const ky = ry * K;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ["Z"],
  ];
}

/** Rounded rectangle from (x0, y0) to (x1, y1), corners `r`. */
function roundRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): PathCommand[] {
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  if (r === 0) {
    return polygon([
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]);
  }
  return [
    ["M", x0 + r, y0],
    ["L", x1 - r, y0],
    ["Q", x1, y0, x1, y0 + r],
    ["L", x1, y1 - r],
    ["Q", x1, y1, x1 - r, y1],
    ["L", x0 + r, y1],
    ["Q", x0, y1, x0, y1 - r],
    ["L", x0, y0 + r],
    ["Q", x0, y0, x0 + r, y0],
    ["Z"],
  ];
}

/** Star with `n` points, outer radius filling the box, inner `inner` of it. */
function star(n: number, w: number, h: number, inner: number): PathCommand[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? 1 : inner;
    pts.push([(Math.cos(a) * r * w) / 2, (Math.sin(a) * r * h) / 2]);
  }
  return polygon(pts);
}

/**
 * The outline of a shape `width` × `height`, centred on (0, 0), y down.
 * Everything stays inside the box.
 */
export function shapePath(
  kind: ShapeKind,
  width: number,
  height: number,
  radius = 0,
): PathCommand[] {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const y1 = h / 2;
  switch (kind) {
    case "rect":
    case "line":
      return roundRect(x0, y0, x1, y1, kind === "line" ? h / 2 : radius);
    case "ellipse":
      return ellipse(w / 2, h / 2);
    case "triangle":
      return polygon([
        [0, y0],
        [x1, y1],
        [x0, y1],
      ]);
    case "star":
      return star(5, w, h, 0.45);
    case "burst":
      return star(12, w, h, 0.72);
    case "sparkle": {
      // Four points with curved sides.
      const c = 0.12;
      return [
        ["M", 0, y0],
        ["Q", (w * c) / 2, (-h * c) / 2, x1, 0],
        ["Q", (w * c) / 2, (h * c) / 2, 0, y1],
        ["Q", (-w * c) / 2, (h * c) / 2, x0, 0],
        ["Q", (-w * c) / 2, (-h * c) / 2, 0, y0],
        ["Z"],
      ];
    }
    case "heart":
      return [
        ["M", 0, y1],
        ["C", -w * 0.1, y1 - h * 0.1, x0, h * 0.12, x0, -h * 0.18],
        ["C", x0, y0 + h * 0.02, -w * 0.05, y0, 0, y0 + h * 0.2],
        ["C", w * 0.05, y0, x1, y0 + h * 0.02, x1, -h * 0.18],
        ["C", x1, h * 0.12, w * 0.1, y1 - h * 0.1, 0, y1],
        ["Z"],
      ];
    case "arrow": {
      // Pointing right; the shaft is 40% of the height.
      const head = Math.min(w * 0.45, h * 0.9);
      const shaft = h * 0.2;
      return polygon([
        [x0, -shaft],
        [x1 - head, -shaft],
        [x1 - head, y0],
        [x1, 0],
        [x1 - head, y1],
        [x1 - head, shaft],
        [x0, shaft],
      ]);
    }
    case "speech": {
      // A rounded box over the top 78%, with a tail at the bottom left.
      const boxBottom = y0 + h * 0.78;
      const r = Math.max(0, Math.min(radius, w / 2, (boxBottom - y0) / 2));
      return [
        ["M", x0 + r, y0],
        ["L", x1 - r, y0],
        ["Q", x1, y0, x1, y0 + r],
        ["L", x1, boxBottom - r],
        ["Q", x1, boxBottom, x1 - r, boxBottom],
        ["L", x0 + w * 0.42, boxBottom],
        ["L", x0 + w * 0.18, y1],
        ["L", x0 + w * 0.24, boxBottom],
        ["L", x0 + r, boxBottom],
        ["Q", x0, boxBottom, x0, boxBottom - r],
        ["L", x0, y0 + r],
        ["Q", x0, y0, x0 + r, y0],
        ["Z"],
      ];
    }
    case "check":
      return polygon([
        [x0, h * 0.05],
        [x0 + w * 0.16, -h * 0.11],
        [-w * 0.14, h * 0.2],
        [x1 - w * 0.15, y0],
        [x1, y0 + h * 0.15],
        [-w * 0.14, y1],
      ]);
    case "cross": {
      // Two diagonal bars as one outline, worked out in a unit square
      // (-0.5 to 0.5) and stretched to the box. `s` is where each bar's
      // edges meet the box sides and the centre lines.
      const s = 0.2 / Math.SQRT2;
      const unit: Vec2[] = [
        [-0.5, -0.5 + s],
        [-0.5 + s, -0.5],
        [0, -s],
        [0.5 - s, -0.5],
        [0.5, -0.5 + s],
        [s, 0],
        [0.5, 0.5 - s],
        [0.5 - s, 0.5],
        [0, s],
        [-0.5 + s, 0.5],
        [-0.5, 0.5 - s],
        [-s, 0],
      ];
      return polygon(unit.map(([x, y]) => [x * w, y * h]));
    }
  }
}

/** The path as an SVG `d` attribute. */
export function shapePathToSvg(path: PathCommand[]): string {
  const n = (v: number) => +v.toFixed(2);
  return path
    .map((c) =>
      c[0] === "Z"
        ? "Z"
        : `${c[0]}${c
            .slice(1)
            .map((v) => n(v as number))
            .join(" ")}`,
    )
    .join(" ");
}

/** A shape or sticker ready to add: its look and its size on the canvas. */
export interface ShapePreset {
  id: string;
  name: string;
  shape: ShapeKind;
  /** Width and height as shares of the canvas' short side. */
  size: Vec2;
  style: ShapeStyle;
}

const plain = (fill: string): ShapeStyle => ({ fill, stroke: null, radius: 0 });
/** Stickers: bold colour with a white outline, like a cut-out. */
const sticker = (fill: string): ShapeStyle => ({
  fill,
  stroke: { color: "#ffffff", width: 14 },
  radius: 0,
});

export const SHAPES: ShapePreset[] = [
  {
    id: "rect",
    name: "Rectangle",
    shape: "rect",
    size: [0.5, 0.32],
    style: { ...plain("#ffffff"), radius: 24 },
  },
  {
    id: "ellipse",
    name: "Circle",
    shape: "ellipse",
    size: [0.4, 0.4],
    style: plain("#ffffff"),
  },
  {
    id: "triangle",
    name: "Triangle",
    shape: "triangle",
    size: [0.4, 0.36],
    style: plain("#ffffff"),
  },
  {
    id: "star",
    name: "Star",
    shape: "star",
    size: [0.4, 0.4],
    style: plain("#ffffff"),
  },
  {
    id: "arrow",
    name: "Arrow",
    shape: "arrow",
    size: [0.5, 0.22],
    style: plain("#ffffff"),
  },
  {
    id: "line",
    name: "Line",
    shape: "line",
    size: [0.6, 0.02],
    style: plain("#ffffff"),
  },
  {
    id: "outline",
    name: "Outline circle",
    shape: "ellipse",
    size: [0.4, 0.4],
    style: { fill: null, stroke: { color: "#ffffff", width: 12 }, radius: 0 },
  },
  {
    id: "bar",
    name: "Label bar",
    shape: "rect",
    size: [0.8, 0.12],
    style: { ...plain("#111111"), radius: 18 },
  },
];

export const STICKERS: ShapePreset[] = [
  {
    id: "heart",
    name: "Heart",
    shape: "heart",
    size: [0.3, 0.28],
    style: sticker("#ff3b5c"),
  },
  {
    id: "gold-star",
    name: "Gold star",
    shape: "star",
    size: [0.3, 0.3],
    style: sticker("#ffc93c"),
  },
  {
    id: "sparkle",
    name: "Sparkle",
    shape: "sparkle",
    size: [0.24, 0.3],
    style: sticker("#ffe066"),
  },
  {
    id: "burst",
    name: "Burst",
    shape: "burst",
    size: [0.34, 0.34],
    style: sticker("#ff7a1a"),
  },
  {
    id: "speech",
    name: "Speech bubble",
    shape: "speech",
    size: [0.44, 0.32],
    style: {
      fill: "#ffffff",
      stroke: { color: "#111111", width: 10 },
      radius: 40,
    },
  },
  {
    id: "check",
    name: "Tick",
    shape: "check",
    size: [0.28, 0.24],
    style: sticker("#22c55e"),
  },
  {
    id: "cross",
    name: "Cross",
    shape: "cross",
    size: [0.26, 0.26],
    style: sticker("#ef4444"),
  },
  {
    id: "pointer",
    name: "Pointer",
    shape: "arrow",
    size: [0.34, 0.18],
    style: sticker("#3b82f6"),
  },
];
