import {
  type Animatable,
  type Layer,
  type Property,
  type PropertyPath,
  setLayerLut,
} from "@motion/core";
import { type ReactNode, useRef } from "react";
import { importLuts } from "../state/luts.ts";
import { useEditor } from "../state/store.ts";
import { NumberField } from "./NumberField.tsx";

interface Props {
  layer: Layer;
  at: <T extends Animatable>(p: Property<T>) => T;
  set: (path: PropertyPath, value: Animatable, gesture: string) => void;
  kfButton: (path: PropertyPath, label: string) => ReactNode;
}

const ADD = "__add";

/** Pick a LUT (.cube) for a clip, and how strongly it applies. */
export function LutControl({ layer, at, set, kfButton }: Props) {
  const luts = useEditor((s) => s.project.luts);
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const fileInput = useRef<HTMLInputElement>(null);
  const list = Object.values(luts ?? {});
  const use = (id: string | null) =>
    edit((d) => void setLayerLut(d, layer.id, id));

  return (
    <>
      <div className="mt-1 flex h-7 items-center gap-1.5">
        <label htmlFor="layer-lut" className="w-16 shrink-0 text-ink-faint">
          LUT
        </label>
        <select
          id="layer-lut"
          value={layer.lut?.id ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === ADD) {
              fileInput.current?.click();
              return;
            }
            use(v || null);
          }}
          className="h-7 min-w-0 flex-1 rounded-md bg-panel-2 px-1.5 text-ink outline-none focus:ring-1 focus:ring-flare"
        >
          <option value="">None</option>
          {list.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value={ADD}>Add .cube file…</option>
        </select>
        <span className="size-7 shrink-0" />
        <input
          ref={fileInput}
          type="file"
          accept=".cube"
          hidden
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            const [id] = await importLuts(files, { forClip: true });
            if (id) use(id);
          }}
        />
      </div>
      {layer.lut && (
        <NumberField
          label="Strength"
          value={at(layer.lut.intensity)}
          min={0}
          max={1}
          displayScale={100}
          unit="%"
          precision={0}
          onChange={(v, g) => set("lut.intensity", v, g)}
          onCommit={seal}
          trailing={kfButton("lut.intensity", "LUT strength")}
        />
      )}
    </>
  );
}
