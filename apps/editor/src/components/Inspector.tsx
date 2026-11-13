import {
  ADJUST_KEYS,
  ADJUST_RANGE,
  type AdjustKey,
  type Animatable,
  ASPECTS,
  type AspectKey,
  BLEND_MODES,
  type BlendMode,
  fittedTransform,
  frameTime,
  getProperty,
  type Layer,
  LOOKS,
  type Property,
  type PropertyPath,
  rootComposition,
  setAspect,
  setBackground,
  setBlend,
  setFps,
  setLook,
  setPropertyValue,
  setSpeed,
  toggleKeyframe,
  type Vec2,
  valueAt,
} from "@motion/core";
import type { ReactNode } from "react";
import { useEditor, useSelectedLayer } from "../state/store.ts";
import { Diamond } from "./icons.tsx";
import { NumberField } from "./NumberField.tsx";
import { TextInspector } from "./TextInspector.tsx";

const ADJUST_LABELS: Record<AdjustKey, string> = {
  exposure: "Exposure",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  vibrance: "Vibrance",
  temperature: "Warmth",
  tint: "Tint",
  highlights: "Highlights",
  shadows: "Shadows",
  fade: "Fade",
};

export function Inspector({ inSheet = false }: { inSheet?: boolean }) {
  const sel = useSelectedLayer();
  return (
    <aside
      aria-label="Inspector"
      className={
        inSheet
          ? "flex flex-col bg-panel"
          : "scroll-thin flex w-72 shrink-0 flex-col overflow-y-auto border-line border-l bg-panel"
      }
    >
      {sel ? <LayerInspector layer={sel} /> : <ProjectSettings />}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line-soft border-b px-4 py-3">
      <h3 className="mb-2 font-semibold text-[11px] text-ink-soft">{title}</h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- project

function ProjectSettings() {
  const comp = useEditor((s) => rootComposition(s.project));
  const edit = useEditor((s) => s.edit);
  const aspect = (Object.keys(ASPECTS) as AspectKey[]).find(
    (k) => ASPECTS[k].width === comp.width && ASPECTS[k].height === comp.height,
  );

  return (
    <>
      <div className="border-line-soft border-b px-4 py-3">
        <h2 className="font-semibold text-ink">Project</h2>
        <p className="mt-0.5 text-ink-faint">Select a clip to edit it.</p>
      </div>
      <Section title="Canvas">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(ASPECTS) as AspectKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={aspect === k}
              onClick={() => edit((d) => setAspect(d, k))}
              className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-[11px] transition-colors ${aspect === k ? "border-flare bg-raised text-ink" : "border-line-soft text-ink-soft hover:border-line hover:text-ink"}`}
            >
              <AspectGlyph w={ASPECTS[k].width} h={ASPECTS[k].height} />
              {k}
            </button>
          ))}
        </div>
        <p className="tabular mt-1 text-[11px] text-ink-faint">
          {comp.width} × {comp.height}. Export can go up to 4K.
        </p>
      </Section>
      <Section title="Frame rate">
        <div className="flex gap-1">
          {[24, 25, 30, 50, 60].map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={comp.fps === f}
              onClick={() => edit((d) => setFps(d, f))}
              className={`tabular h-7 flex-1 rounded-md text-[12px] transition-colors ${comp.fps === f ? "bg-flare font-semibold text-flare-ink" : "bg-panel-2 text-ink-soft hover:text-ink"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Background">
        <label className="flex items-center gap-2 text-ink-soft">
          <input
            type="color"
            value={comp.background}
            onChange={(e) => {
              const v = e.target.value;
              edit((d) => setBackground(d, v), "background");
            }}
            onBlur={() => useEditor.getState().seal()}
            className="size-7 cursor-pointer rounded border border-line bg-transparent"
          />
          <span className="tabular uppercase">{comp.background}</span>
        </label>
      </Section>
    </>
  );
}

function AspectGlyph({ w, h }: { w: number; h: number }) {
  const s = 18 / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="block rounded-[2px] border border-current"
      style={{ width: w * s, height: h * s }}
    />
  );
}

// ---------------------------------------------------------------- layer

function LayerInspector({ layer }: { layer: Layer }) {
  const playhead = useEditor((s) => s.playhead);
  const project = useEditor((s) => s.project);
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const comp = rootComposition(project);
  const local = playhead - layer.start;
  const inRange = local >= 0 && local < layer.duration;
  const tol = frameTime(1, comp.fps) / 2;
  const asset =
    layer.kind === "media" ? project.assets[layer.assetId] : undefined;
  const visual = asset ? asset.kind !== "audio" : true;

  // Edit at the time whose value is on screen. With the playhead outside the
  // clip that is the nearest edge, so no keyframe lands outside the clip.
  const editAt = layer.start + Math.max(0, Math.min(local, layer.duration - 1));
  const set = (path: PropertyPath, value: Animatable, gesture: string) =>
    edit(
      (d) => void setPropertyValue(d, layer.id, path, value, editAt),
      gesture,
    );

  const kfState = (path: PropertyPath): "on" | "animated" | "off" => {
    const p = getProperty(layer, path);
    if (!p?.keyframes?.length) return "off";
    return p.keyframes.some((k) => Math.abs(k.time - local) <= tol)
      ? "on"
      : "animated";
  };

  const kfButton = (path: PropertyPath, label: string) => {
    const state = kfState(path);
    return (
      <button
        type="button"
        disabled={!inRange}
        aria-label={
          state === "on"
            ? `Remove ${label} keyframe`
            : `Add ${label} keyframe at playhead`
        }
        title={
          inRange
            ? state === "on"
              ? "Remove keyframe"
              : "Add keyframe at playhead"
            : "Move the playhead over this clip to keyframe it"
        }
        onClick={() =>
          edit((d) => void toggleKeyframe(d, layer.id, path, playhead))
        }
        className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-raised disabled:opacity-30 ${state === "off" ? "text-ink-faint" : "text-flare"}`}
      >
        <Diamond state={state} width={13} height={13} />
      </button>
    );
  };

  const at = <T extends Animatable>(p: Property<T>) =>
    valueAt(p, Math.max(0, Math.min(local, layer.duration)));
  const pos = at(layer.transform.position);
  const scl = at(layer.transform.scale);
  const rot = at(layer.transform.rotation);
  const opa = at(layer.opacity);

  return (
    <>
      <div className="border-line-soft border-b px-4 py-3">
        <h2 className="truncate font-semibold text-ink">{layer.name}</h2>
        <p className="mt-0.5 text-ink-faint">
          {layer.kind === "text"
            ? "Text"
            : asset?.kind === "image"
              ? "Photo"
              : asset?.kind === "audio"
                ? "Audio"
                : "Video"}
          {!inRange && " · playhead is outside this clip"}
        </p>
      </div>

      {layer.kind === "text" && <TextInspector layer={layer} />}

      {visual && (
        <Section title="Transform">
          <NumberField
            label="X"
            value={pos[0]}
            onChange={(v, g) =>
              set("transform.position", [v, pos[1]] as Vec2, g)
            }
            onCommit={seal}
            unit="px"
            precision={0}
            trailing={kfButton("transform.position", "position")}
          />
          <NumberField
            label="Y"
            value={pos[1]}
            onChange={(v, g) =>
              set("transform.position", [pos[0], v] as Vec2, g)
            }
            onCommit={seal}
            unit="px"
            precision={0}
            trailing={<span className="size-7 shrink-0" />}
          />
          <NumberField
            label="Scale"
            value={scl[0]}
            displayScale={100}
            step={1}
            min={0.01}
            unit="%"
            precision={1}
            onChange={(v, g) => {
              const ratio = scl[0] === 0 ? 1 : scl[1] / scl[0];
              set("transform.scale", [v, v * ratio] as Vec2, g);
            }}
            onCommit={seal}
            trailing={kfButton("transform.scale", "scale")}
          />
          <NumberField
            label="Rotation"
            value={rot}
            unit="°"
            precision={1}
            onChange={(v, g) => set("transform.rotation", v, g)}
            onCommit={seal}
            trailing={kfButton("transform.rotation", "rotation")}
          />
          <NumberField
            label="Opacity"
            value={opa}
            displayScale={100}
            min={0}
            max={1}
            unit="%"
            precision={0}
            onChange={(v, g) => set("opacity", v, g)}
            onCommit={seal}
            trailing={kfButton("opacity", "opacity")}
          />
          {layer.kind === "media" && (
            <div className="mt-2 flex gap-1.5">
              <FitButton layer={layer} mode="fit" />
              <FitButton layer={layer} mode="fill" />
            </div>
          )}
        </Section>
      )}

      {visual && (
        <Section title="Color">
          <div className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1">
            {LOOKS.map((look) => (
              <button
                key={look.id}
                type="button"
                onClick={() => edit((d) => void setLook(d, layer.id, look.id))}
                className="h-7 shrink-0 rounded-full bg-panel-2 px-3 text-[11px] text-ink-soft transition-colors hover:bg-raised hover:text-ink"
              >
                {look.label}
              </button>
            ))}
          </div>
          {ADJUST_KEYS.map((k) => {
            const range = ADJUST_RANGE[k];
            const p = layer.adjust?.[k];
            const value = p ? at(p) : 0;
            const stops = k === "exposure";
            return (
              <NumberField
                key={k}
                label={ADJUST_LABELS[k]}
                value={value}
                min={range.min}
                max={range.max}
                displayScale={stops ? 1 : 100}
                step={stops ? 0.1 : 1}
                precision={stops ? 1 : 0}
                unit={stops ? "EV" : undefined}
                onChange={(v, g) => set(`adjust.${k}`, v, g)}
                onCommit={seal}
                trailing={kfButton(
                  `adjust.${k}`,
                  ADJUST_LABELS[k].toLowerCase(),
                )}
              />
            );
          })}
          <div className="mt-1 flex h-7 items-center gap-1.5">
            <label
              htmlFor="blend-mode"
              className="w-16 shrink-0 text-ink-faint"
            >
              Blend
            </label>
            <select
              id="blend-mode"
              value={layer.blend ?? "normal"}
              onChange={(e) => {
                const mode = e.target.value as BlendMode;
                edit((d) => void setBlend(d, layer.id, mode));
              }}
              className="h-7 min-w-0 flex-1 rounded-md bg-panel-2 px-1.5 text-ink outline-none focus:ring-1 focus:ring-flare"
            >
              {BLEND_MODES.map((m) => (
                <option key={m} value={m}>
                  {m[0]?.toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
            <span className="size-7 shrink-0" />
          </div>
        </Section>
      )}

      {layer.kind === "media" && (
        <Section title="Clip">
          {asset?.kind !== "image" && (
            <NumberField
              label="Speed"
              value={layer.speed}
              min={0.1}
              max={10}
              step={0.05}
              precision={2}
              unit="×"
              onChange={(v, g) => edit((d) => void setSpeed(d, layer.id, v), g)}
              onCommit={seal}
              trailing={<span className="size-7 shrink-0" />}
            />
          )}
          {asset?.hasAudio && (
            <NumberField
              label="Volume"
              value={at(layer.volume)}
              displayScale={100}
              min={0}
              max={2}
              unit="%"
              precision={0}
              onChange={(v, g) => set("volume", v, g)}
              onCommit={seal}
              trailing={kfButton("volume", "volume")}
            />
          )}
        </Section>
      )}

      <p className="px-4 py-3 text-[11px] text-ink-faint leading-relaxed">
        Click a diamond to keyframe a value at the playhead. Move the playhead,
        change the value, and Motion animates between them. Drag a label to
        scrub its value.
      </p>
    </>
  );
}

function FitButton({ layer, mode }: { layer: Layer; mode: "fit" | "fill" }) {
  const edit = useEditor((s) => s.edit);
  return (
    <button
      type="button"
      onClick={() =>
        edit((d) => {
          const comp = rootComposition(d);
          for (const t of comp.tracks) {
            const l = t.layers.find((x) => x.id === layer.id);
            if (!l || l.kind !== "media") continue;
            const a = d.assets[l.assetId];
            if (!a) return;
            const fresh = fittedTransform(a.width, a.height, comp);
            if (mode === "fill") {
              const s = Math.max(comp.width / a.width, comp.height / a.height);
              fresh.scale.value = [s, s];
            }
            l.transform = fresh;
          }
        })
      }
      className="h-7 flex-1 rounded-md bg-panel-2 text-[12px] text-ink-soft transition-colors hover:bg-raised hover:text-ink"
    >
      {mode === "fit" ? "Fit canvas" : "Fill canvas"}
    </button>
  );
}
