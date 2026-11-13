import {
  SHAPE_KINDS,
  SHAPE_LABELS,
  type ShapeLayer,
  setShapeKind,
  setShapeSize,
  setShapeStyle,
} from "@motion/core";
import { useEditor } from "../state/store.ts";
import { NumberField } from "./NumberField.tsx";
import { ShapeThumb } from "./ShapeThumb.tsx";

const THUMB = { fill: "currentColor", stroke: null, radius: 12 } as const;

/** Shape, size, fill and outline of a shape or sticker. */
export function ShapeInspector({ layer }: { layer: ShapeLayer }) {
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const { style, size } = layer;
  const set = (patch: Parameters<typeof setShapeStyle>[2], gesture?: string) =>
    edit((d) => void setShapeStyle(d, layer.id, patch), gesture);
  const rounded = layer.shape === "rect" || layer.shape === "speech";

  return (
    <section className="border-line-soft border-b px-4 py-3">
      <h3 className="mb-2 font-semibold text-[11px] text-ink-soft">Shape</h3>
      <fieldset className="mb-3 grid grid-cols-6 gap-1">
        <legend className="sr-only">Shape</legend>
        {SHAPE_KINDS.map((k) => {
          const active = layer.shape === k;
          return (
            <button
              key={k}
              type="button"
              title={SHAPE_LABELS[k]}
              aria-label={SHAPE_LABELS[k]}
              aria-pressed={active}
              onClick={() => edit((d) => void setShapeKind(d, layer.id, k))}
              className={`grid h-9 place-items-center rounded-md transition-colors ${active ? "bg-ink text-bg" : "bg-panel-2 text-ink-soft hover:text-ink"}`}
            >
              <ShapeThumb
                shape={k}
                size={
                  k === "line"
                    ? [100, 12]
                    : k === "arrow"
                      ? [100, 60]
                      : [100, 100]
                }
                style={THUMB}
                box={18}
              />
            </button>
          );
        })}
      </fieldset>
      <div className="flex flex-col gap-1">
        <NumberField
          label="Width"
          value={size[0]}
          min={1}
          unit="px"
          precision={0}
          onChange={(v, g) =>
            edit((d) => void setShapeSize(d, layer.id, [v, size[1]]), g)
          }
          onCommit={seal}
          trailing={<span className="size-7 shrink-0" />}
        />
        <NumberField
          label="Height"
          value={size[1]}
          min={1}
          unit="px"
          precision={0}
          onChange={(v, g) =>
            edit((d) => void setShapeSize(d, layer.id, [size[0], v]), g)
          }
          onCommit={seal}
          trailing={<span className="size-7 shrink-0" />}
        />
        {rounded && (
          <NumberField
            label="Corners"
            value={style.radius}
            min={0}
            unit="px"
            precision={0}
            onChange={(v, g) => set({ radius: v }, g)}
            onCommit={seal}
            trailing={<span className="size-7 shrink-0" />}
          />
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ColorRow
          label="Fill"
          value={style.fill}
          onToggle={(on) => set({ fill: on ? "#ffffff" : null })}
          onChange={(c) => set({ fill: c }, `shape-fill-${layer.id}`)}
          onDone={seal}
        />
        {style.fill && (
          <ColorRow
            label="Gradient"
            value={style.gradient?.color ?? null}
            onToggle={(on) =>
              set({ gradient: on ? { color: "#000000", angle: 90 } : null })
            }
            onChange={(c) =>
              set(
                { gradient: { color: c, angle: style.gradient?.angle ?? 90 } },
                `shape-gradient-${layer.id}`,
              )
            }
            onDone={seal}
          />
        )}
        {style.fill && style.gradient && (
          <NumberField
            label="Angle"
            value={style.gradient.angle}
            unit="°"
            precision={0}
            onChange={(v, g) =>
              set(
                {
                  gradient: {
                    color: style.gradient?.color ?? "#000000",
                    angle: v,
                  },
                },
                g,
              )
            }
            onCommit={seal}
            trailing={<span className="size-7 shrink-0" />}
          />
        )}
        <ColorRow
          label="Outline"
          value={style.stroke?.color ?? null}
          onToggle={(on) =>
            set({ stroke: on ? { color: "#ffffff", width: 8 } : null })
          }
          onChange={(c) =>
            set(
              { stroke: { color: c, width: style.stroke?.width ?? 8 } },
              `shape-stroke-${layer.id}`,
            )
          }
          onDone={seal}
        />
        {style.stroke && (
          <NumberField
            label="Thickness"
            value={style.stroke.width}
            min={0}
            unit="px"
            precision={0}
            onChange={(v, g) =>
              set(
                {
                  stroke: { color: style.stroke?.color ?? "#ffffff", width: v },
                },
                g,
              )
            }
            onCommit={seal}
            trailing={<span className="size-7 shrink-0" />}
          />
        )}
      </div>
    </section>
  );
}

function ColorRow({
  label,
  value,
  onToggle,
  onChange,
  onDone,
}: {
  label: string;
  value: string | null;
  onToggle: (on: boolean) => void;
  onChange: (hex: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex h-7 items-center gap-2">
      <label className="flex w-20 shrink-0 cursor-pointer items-center gap-2 text-ink-soft">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-4 accent-flare"
        />
        {label}
      </label>
      {value !== null && (
        <>
          <input
            type="color"
            aria-label={`${label} colour`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onDone}
            className="size-7 cursor-pointer rounded border border-line bg-transparent"
          />
          <span className="tabular text-[11px] text-ink-faint uppercase">
            {value}
          </span>
        </>
      )}
    </div>
  );
}
