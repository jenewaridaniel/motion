import {
  gradientLine,
  type ShapeKind,
  type ShapeStyle,
  shapePath,
  shapePathToSvg,
  type Vec2,
} from "@motion/core";
import { useId } from "react";

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
  const gradientId = useId();
  const g =
    style.fill && style.gradient
      ? gradientLine(size[0], size[1], style.gradient.angle)
      : null;
  return (
    <svg
      aria-hidden="true"
      width={Math.max(2, w * k)}
      height={Math.max(2, h * k)}
      viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
    >
      {g && style.gradient && style.fill && (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={g[0]}
            y1={g[1]}
            x2={g[2]}
            y2={g[3]}
          >
            <stop offset="0" stopColor={style.fill} />
            <stop offset="1" stopColor={style.gradient.color} />
          </linearGradient>
        </defs>
      )}
      <path
        d={shapePathToSvg(shapePath(shape, size[0], size[1], style.radius))}
        fill={g ? `url(#${gradientId})` : (style.fill ?? "none")}
        stroke={style.stroke?.color ?? "none"}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}
