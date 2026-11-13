import {
  type Animatable,
  type EffectKind,
  type Layer,
  MASK_SHAPES,
  type MaskShape,
  type Property,
  type PropertyPath,
  setEffect,
  setEffectOption,
  setMask,
  setMaskInvert,
  type Vec2,
} from "@motion/core";
import type { ReactNode } from "react";
import { useEditor } from "../state/store.ts";
import { NumberField } from "./NumberField.tsx";

interface Props {
  layer: Layer;
  /** Value of a property at the playhead. */
  at: <T extends Animatable>(p: Property<T>) => T;
  set: (path: PropertyPath, value: Animatable, gesture: string) => void;
  kfButton: (path: PropertyPath, label: string) => ReactNode;
}

const EFFECTS: { kind: EffectKind; label: string }[] = [
  { kind: "blur", label: "Blur" },
  { kind: "chromaKey", label: "Green screen" },
  { kind: "glitch", label: "Glitch" },
  { kind: "shake", label: "Shake" },
  { kind: "vignette", label: "Vignette" },
];

const MASK_LABEL: Record<MaskShape, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  linear: "Line",
};

/** The browser's colour picker that samples from the screen (Chrome, Edge). */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function EffectsInspector({ layer, at, set, kfButton }: Props) {
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const fx = layer.effects ?? {};
  const pctField = (label: string, path: PropertyPath, p: Property<number>) => (
    <NumberField
      key={path}
      label={label}
      value={at(p)}
      min={0}
      max={100}
      unit="%"
      precision={0}
      onChange={(v, g) => set(path, v, g)}
      onCommit={seal}
      trailing={kfButton(path, label.toLowerCase())}
    />
  );
  const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor })
    .EyeDropper;

  return (
    <>
      <section className="border-line-soft border-b px-4 py-3">
        <h3 className="mb-2 font-semibold text-[11px] text-ink-soft">
          Effects
        </h3>
        <div className="flex flex-col gap-2">
          {EFFECTS.map(({ kind, label }) => {
            const on = !!fx[kind];
            return (
              <div key={kind}>
                <label className="flex cursor-pointer items-center justify-between">
                  <span className={on ? "text-ink" : "text-ink-soft"}>
                    {label}
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      edit((d) => void setEffect(d, layer.id, kind, !on))
                    }
                    className="size-4 accent-flare"
                  />
                </label>
                {on && (
                  <div className="mt-1 flex flex-col gap-1">
                    {kind === "blur" &&
                      fx.blur &&
                      pctField("Amount", "effects.blur.amount", fx.blur.amount)}
                    {kind === "glitch" &&
                      fx.glitch &&
                      pctField(
                        "Amount",
                        "effects.glitch.amount",
                        fx.glitch.amount,
                      )}
                    {kind === "vignette" && fx.vignette && (
                      <>
                        {pctField(
                          "Amount",
                          "effects.vignette.amount",
                          fx.vignette.amount,
                        )}
                        {pctField(
                          "Size",
                          "effects.vignette.size",
                          fx.vignette.size,
                        )}
                      </>
                    )}
                    {kind === "shake" && fx.shake && (
                      <>
                        {pctField(
                          "Amount",
                          "effects.shake.amount",
                          fx.shake.amount,
                        )}
                        <NumberField
                          label="Speed"
                          value={fx.shake.speed}
                          min={0.1}
                          max={30}
                          step={0.5}
                          precision={1}
                          unit="/s"
                          onChange={(v, g) =>
                            edit(
                              (d) =>
                                void setEffectOption(
                                  d,
                                  layer.id,
                                  "shake",
                                  "speed",
                                  v,
                                ),
                              g,
                            )
                          }
                          onCommit={seal}
                          trailing={<span className="size-7 shrink-0" />}
                        />
                      </>
                    )}
                    {kind === "chromaKey" && fx.chromaKey && (
                      <>
                        <div className="flex h-7 items-center gap-1.5">
                          <span className="w-16 shrink-0 text-ink-faint">
                            Key
                          </span>
                          <input
                            type="color"
                            aria-label="Key colour"
                            value={fx.chromaKey.color}
                            onChange={(e) => {
                              const c = e.target.value;
                              edit(
                                (d) =>
                                  void setEffectOption(
                                    d,
                                    layer.id,
                                    "chromaKey",
                                    "color",
                                    c,
                                  ),
                                "key-color",
                              );
                            }}
                            onBlur={seal}
                            className="size-7 cursor-pointer rounded border border-line bg-transparent"
                          />
                          {eyeDropper && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const { sRGBHex } =
                                    await new eyeDropper().open();
                                  edit(
                                    (d) =>
                                      void setEffectOption(
                                        d,
                                        layer.id,
                                        "chromaKey",
                                        "color",
                                        sRGBHex,
                                      ),
                                  );
                                } catch {
                                  // Cancelled.
                                }
                              }}
                              className="h-7 rounded-md bg-panel-2 px-2.5 text-[12px] text-ink-soft hover:text-ink"
                            >
                              Pick from screen
                            </button>
                          )}
                        </div>
                        {pctField(
                          "Strength",
                          "effects.chromaKey.similarity",
                          fx.chromaKey.similarity,
                        )}
                        {pctField(
                          "Edges",
                          "effects.chromaKey.smoothness",
                          fx.chromaKey.smoothness,
                        )}
                        {pctField(
                          "Spill",
                          "effects.chromaKey.spill",
                          fx.chromaKey.spill,
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-line-soft border-b px-4 py-3">
        <h3 className="mb-2 font-semibold text-[11px] text-ink-soft">Mask</h3>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Mask shape</legend>
          {([null, ...MASK_SHAPES] as (MaskShape | null)[]).map((shape) => {
            const active = (layer.mask?.shape ?? null) === shape;
            return (
              <button
                key={shape ?? "none"}
                type="button"
                aria-pressed={active}
                onClick={() => edit((d) => void setMask(d, layer.id, shape))}
                className={`h-7 flex-1 rounded-md text-[11px] transition-colors ${active ? "bg-ink text-bg" : "bg-panel-2 text-ink-soft hover:text-ink"}`}
              >
                {shape ? MASK_LABEL[shape] : "None"}
              </button>
            );
          })}
        </fieldset>
        {layer.mask && (
          <div className="mt-2 flex flex-col gap-1">
            {(() => {
              const m = layer.mask;
              const c = at(m.center);
              const s = at(m.size);
              const vec = (v: Vec2, i: 0 | 1, x: number) =>
                (i === 0 ? [x, v[1]] : [v[0], x]) as Vec2;
              return (
                <>
                  <NumberField
                    label="X"
                    value={c[0]}
                    displayScale={100}
                    unit="%"
                    precision={0}
                    onChange={(x, g) => set("mask.center", vec(c, 0, x), g)}
                    onCommit={seal}
                    trailing={kfButton("mask.center", "mask position")}
                  />
                  <NumberField
                    label="Y"
                    value={c[1]}
                    displayScale={100}
                    unit="%"
                    precision={0}
                    onChange={(y, g) => set("mask.center", vec(c, 1, y), g)}
                    onCommit={seal}
                    trailing={<span className="size-7 shrink-0" />}
                  />
                  {m.shape !== "linear" && (
                    <>
                      <NumberField
                        label="Width"
                        value={s[0]}
                        min={0}
                        displayScale={100}
                        unit="%"
                        precision={0}
                        onChange={(w, g) => set("mask.size", vec(s, 0, w), g)}
                        onCommit={seal}
                        trailing={kfButton("mask.size", "mask size")}
                      />
                      <NumberField
                        label="Height"
                        value={s[1]}
                        min={0}
                        displayScale={100}
                        unit="%"
                        precision={0}
                        onChange={(h, g) => set("mask.size", vec(s, 1, h), g)}
                        onCommit={seal}
                        trailing={<span className="size-7 shrink-0" />}
                      />
                    </>
                  )}
                  <NumberField
                    label="Rotation"
                    value={at(m.rotation)}
                    unit="°"
                    precision={0}
                    onChange={(v, g) => set("mask.rotation", v, g)}
                    onCommit={seal}
                    trailing={kfButton("mask.rotation", "mask rotation")}
                  />
                  <NumberField
                    label="Feather"
                    value={at(m.feather)}
                    min={0}
                    max={1}
                    displayScale={100}
                    unit="%"
                    precision={0}
                    onChange={(v, g) => set("mask.feather", v, g)}
                    onCommit={seal}
                    trailing={kfButton("mask.feather", "mask feather")}
                  />
                  <label className="flex cursor-pointer items-center justify-between pt-1">
                    <span className="text-ink-soft">Invert</span>
                    <input
                      type="checkbox"
                      checked={m.invert}
                      onChange={() =>
                        edit((d) => void setMaskInvert(d, layer.id, !m.invert))
                      }
                      className="size-4 accent-flare"
                    />
                  </label>
                </>
              );
            })()}
          </div>
        )}
      </section>
    </>
  );
}
