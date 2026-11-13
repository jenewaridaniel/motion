import { addShape, SHAPES, type ShapePreset, STICKERS } from "@motion/core";
import { useEditor } from "../state/store.ts";
import { ShapeThumb } from "./ShapeThumb.tsx";

/** Shapes and stickers to add at the playhead. */
export function ShapesPanel() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <Group title="Shapes" items={SHAPES} />
      <Group title="Stickers" items={STICKERS} />
      <p className="px-1 text-[11px] text-ink-faint leading-relaxed">
        Added at the playhead, in the middle of the canvas. Change colours and
        outline in the clip's settings.
      </p>
    </div>
  );
}

function Group({ title, items }: { title: string; items: ShapePreset[] }) {
  const edit = useEditor((s) => s.edit);
  const select = useEditor((s) => s.select);
  return (
    <section aria-label={title}>
      <h3 className="px-1 pb-1.5 font-semibold text-[11px] text-ink-soft">
        {title}
      </h3>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.name}
            aria-label={`Add ${s.name}`}
            onClick={() => {
              const { playhead } = useEditor.getState();
              let id = "";
              edit((d) => {
                id = addShape(d, s, playhead);
              });
              if (id) select(id);
            }}
            className="grid aspect-square place-items-center rounded-md bg-panel-2 transition-colors hover:bg-raised"
          >
            <ShapeThumb
              shape={s.shape}
              size={[s.size[0] * 1000, s.size[1] * 1000]}
              style={{
                ...s.style,
                // Thumbnail outlines at the same share of the size as on canvas.
                stroke: s.style.stroke
                  ? {
                      ...s.style.stroke,
                      width: (s.style.stroke.width / 1080) * 1000,
                    }
                  : null,
                radius: (s.style.radius / 1080) * 1000,
              }}
              box={34}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
