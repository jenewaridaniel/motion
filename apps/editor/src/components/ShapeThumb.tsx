import {
  type ShapeKind,
  type ShapeStyle,
  shapePath,
  shapePathToSvg,
  type Vec2,
} from "@motion/core";

/** A shape drawn as SVG from the same outline the renderer uses. */
export function ShapeThumb({
  shape,
  size,
  style,
  box = 40,
}: {
  shape: ShapeKind;
  size: Vec2;
  style: ShapeStyle;
  /** Largest side of the thumbnail, in CSS pixels. */
  box?: number;
}) {
  const stroke = style.stroke?.width ?? 0;
  const w = size[0] + stroke;
  const h = size[1] + stroke;
  const k = box / Math.max(w, h);
  return (
    <svg
      aria-hidden="true"
      width={Math.max(2, w * k)}
      height={Math.max(2, h * k)}
      viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
    >
      <path
        d={shapePathToSvg(shapePath(shape, size[0], size[1], style.radius))}
        fill={style.fill ?? "none"}
        stroke={style.stroke?.color ?? "none"}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}
