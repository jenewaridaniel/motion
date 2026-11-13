import {
  applyTextLookToTrack,
  rootComposition,
  sec,
  setText,
  setTextAnimation,
  setTextStyle,
  TEXT_IN_ANIMATIONS,
  TEXT_LOOP_ANIMATIONS,
  TEXT_OUT_ANIMATIONS,
  type TextAnimation,
  type TextLayer,
  type TextStyle,
  US,
} from "@motion/core";
import { type ReactNode, useId, useRef } from "react";
import {
  clampWeight,
  customFonts,
  FONT_GROUPS,
  FONTS,
  fontByFamily,
  YOUR_FONTS,
} from "../lib/fonts.ts";
import { FONT_ACCEPT, importFonts } from "../state/customFonts.ts";
import { useEditor } from "../state/store.ts";
import { PlusIcon } from "./icons.tsx";
import { NumberField } from "./NumberField.tsx";

const WEIGHTS = [
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra bold" },
  { value: 900, label: "Black" },
];

let session = 0;

/** Words and style for a text clip. Each control is one undo step per use. */
export function TextInspector({ layer }: { layer: TextLayer }) {
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const style = layer.style;
  const project = useEditor((s) => s.project);
  const mine = customFonts(project);
  const font = fontByFamily(style.font, project);
  const fontInput = useRef<HTMLInputElement>(null);
  // One undo step per typing session in the text box.
  const typing = useRef(`text-${++session}`);
  const textId = useId();

  const patch = (p: Partial<TextStyle>, gesture?: string) =>
    edit((d) => void setTextStyle(d, layer.id, p), gesture);

  return (
    <section className="border-line-soft border-b px-4 py-3">
      <h3 className="mb-2 font-semibold text-[11px] text-ink-soft">Text</h3>
      <label htmlFor={textId} className="sr-only">
        Text
      </label>
      <textarea
        id={textId}
        value={layer.text}
        rows={3}
        placeholder="Type your text"
        onFocus={() => {
          typing.current = `text-${++session}`;
        }}
        onChange={(e) => {
          const v = e.target.value;
          edit((d) => void setText(d, layer.id, v), typing.current);
        }}
        onBlur={seal}
        className="w-full resize-y rounded-md bg-panel-2 px-2.5 py-2 text-[13px] text-ink leading-snug outline-none focus:ring-1 focus:ring-flare"
      />

      <div className="mt-2 flex flex-col gap-1">
        <Row label="Font">
          <select
            aria-label="Font"
            value={style.font}
            onChange={(e) => {
              const next = fontByFamily(e.target.value, project);
              if (!next) return;
              patch({
                font: next.family,
                weight: clampWeight(next, style.weight),
                italic: style.italic && next.italic,
              });
            }}
            className="h-7 min-w-0 flex-1 rounded-md bg-panel-2 px-1.5 text-ink outline-none focus:ring-1 focus:ring-flare"
          >
            {!font && <option value={style.font}>{style.font}</option>}
            {mine.length > 0 && (
              <optgroup label={YOUR_FONTS}>
                {mine.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            )}
            {FONT_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {FONTS.filter((f) => f.group === g).map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            title="Add your own font file (.ttf, .otf, .woff)"
            aria-label="Add your own font"
            onClick={() => fontInput.current?.click()}
            className="grid size-7 shrink-0 place-items-center rounded-md bg-panel-2 text-ink-soft transition-colors hover:text-ink"
          >
            <PlusIcon width={13} height={13} />
          </button>
          <input
            ref={fontInput}
            type="file"
            accept={FONT_ACCEPT}
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              const [family] = await importFonts(files);
              // Use the new font on this text straight away.
              if (family) patch({ font: family, italic: false });
            }}
          />
        </Row>
        <Row label="Weight">
          <select
            aria-label="Weight"
            value={style.weight}
            disabled={!!font && font.minWeight === font.maxWeight}
            onChange={(e) => patch({ weight: Number(e.target.value) })}
            className="h-7 min-w-0 flex-1 rounded-md bg-panel-2 px-1.5 text-ink outline-none focus:ring-1 focus:ring-flare disabled:opacity-50"
          >
            {WEIGHTS.filter(
              (w) =>
                !font ||
                (w.value >= font.minWeight && w.value <= font.maxWeight),
            ).map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
            {!WEIGHTS.some((w) => w.value === style.weight) && (
              <option value={style.weight}>{style.weight}</option>
            )}
          </select>
          <Toggle
            label="Italic"
            on={style.italic}
            disabled={!!font && !font.italic}
            onClick={() => patch({ italic: !style.italic })}
          >
            <span className="font-serif italic">I</span>
          </Toggle>
        </Row>
        <NumberField
          label="Size"
          value={style.size}
          min={4}
          max={1000}
          unit="px"
          precision={0}
          onChange={(v, g) => patch({ size: v }, g)}
          onCommit={seal}
        />
        <Row label="Color">
          <ColorInput
            label="Text color"
            value={style.color}
            onChange={(c) => patch({ color: c }, "text-color")}
            onDone={seal}
          />
          <fieldset className="ml-auto flex gap-0.5">
            <legend className="sr-only">Alignment</legend>
            {(["left", "center", "right"] as const).map((a) => (
              <Toggle
                key={a}
                label={`Align ${a}`}
                on={style.align === a}
                onClick={() => patch({ align: a })}
              >
                <AlignGlyph align={a} />
              </Toggle>
            ))}
          </fieldset>
        </Row>
        <NumberField
          label="Line"
          value={style.lineHeight}
          min={0.5}
          max={4}
          step={0.05}
          precision={2}
          unit="×"
          onChange={(v, g) => patch({ lineHeight: v }, g)}
          onCommit={seal}
        />
        <NumberField
          label="Spacing"
          value={style.letterSpacing}
          min={-50}
          max={200}
          precision={0}
          unit="px"
          onChange={(v, g) => patch({ letterSpacing: v }, g)}
          onCommit={seal}
        />
      </div>

      <Extra
        title="Outline"
        on={!!style.stroke}
        onToggle={() =>
          patch({
            stroke: style.stroke
              ? null
              : {
                  color: "#000000",
                  width: Math.max(2, Math.round(style.size * 0.06)),
                },
          })
        }
      >
        {style.stroke && (
          <>
            <Row label="Color">
              <ColorInput
                label="Outline color"
                value={style.stroke.color}
                onChange={(c) =>
                  style.stroke &&
                  patch(
                    { stroke: { ...style.stroke, color: c } },
                    "stroke-color",
                  )
                }
                onDone={seal}
              />
            </Row>
            <NumberField
              label="Width"
              value={style.stroke.width}
              min={0}
              max={100}
              precision={0}
              unit="px"
              onChange={(v, g) =>
                style.stroke &&
                patch({ stroke: { ...style.stroke, width: v } }, g)
              }
              onCommit={seal}
            />
          </>
        )}
      </Extra>

      <Extra
        title="Shadow"
        on={!!style.shadow}
        onToggle={() =>
          patch({
            shadow: style.shadow
              ? null
              : { color: "#000000", blur: 12, x: 0, y: 4 },
          })
        }
      >
        {style.shadow && (
          <>
            <Row label="Color">
              <ColorInput
                label="Shadow color"
                value={style.shadow.color}
                onChange={(c) =>
                  style.shadow &&
                  patch(
                    { shadow: { ...style.shadow, color: c } },
                    "shadow-color",
                  )
                }
                onDone={seal}
              />
            </Row>
            <NumberField
              label="Blur"
              value={style.shadow.blur}
              min={0}
              max={200}
              precision={0}
              unit="px"
              onChange={(v, g) =>
                style.shadow &&
                patch({ shadow: { ...style.shadow, blur: v } }, g)
              }
              onCommit={seal}
            />
            <NumberField
              label="Distance"
              value={style.shadow.y}
              min={-200}
              max={200}
              precision={0}
              unit="px"
              onChange={(v, g) =>
                style.shadow && patch({ shadow: { ...style.shadow, y: v } }, g)
              }
              onCommit={seal}
            />
          </>
        )}
      </Extra>

      <Extra
        title="Background"
        on={!!style.box}
        onToggle={() =>
          patch({
            box: style.box
              ? null
              : {
                  color: "#000000",
                  padding: Math.round(style.size * 0.3),
                  radius: Math.round(style.size * 0.2),
                },
          })
        }
      >
        {style.box && (
          <>
            <Row label="Color">
              <ColorInput
                label="Background color"
                value={style.box.color}
                onChange={(c) =>
                  style.box &&
                  patch({ box: { ...style.box, color: c } }, "box-color")
                }
                onDone={seal}
              />
            </Row>
            <NumberField
              label="Padding"
              value={style.box.padding}
              min={0}
              max={400}
              precision={0}
              unit="px"
              onChange={(v, g) =>
                style.box && patch({ box: { ...style.box, padding: v } }, g)
              }
              onCommit={seal}
            />
            <NumberField
              label="Corners"
              value={style.box.radius}
              min={0}
              max={400}
              precision={0}
              unit="px"
              onChange={(v, g) =>
                style.box && patch({ box: { ...style.box, radius: v } }, g)
              }
              onCommit={seal}
            />
          </>
        )}
      </Extra>
      <AnimationControls layer={layer} />
      <ApplyToTrack layer={layer} />
    </section>
  );
}

/**
 * Restyle all captions at once: give every text clip on this track this
 * clip's style, animation and placement (their words stay their own).
 */
function ApplyToTrack({ layer }: { layer: TextLayer }) {
  const project = useEditor((s) => s.project);
  const edit = useEditor((s) => s.edit);
  const toast = useEditor((s) => s.toast);
  const track = rootComposition(project).tracks.find((t) =>
    t.layers.some((l) => l.id === layer.id),
  );
  const count = track?.layers.filter((l) => l.kind === "text").length ?? 0;
  if (count < 2) return null;
  return (
    <button
      type="button"
      onClick={() => {
        let changed = 0;
        edit((d) => {
          changed = applyTextLookToTrack(d, layer.id);
        });
        toast(
          `Restyled ${changed} text clip${changed === 1 ? "" : "s"} on this track. Undo puts them back.`,
        );
      }}
      className="mt-3 h-8 w-full rounded-md bg-panel-2 text-[12px] text-ink-soft transition-colors hover:bg-raised hover:text-ink"
    >
      Apply this look to all {count} text clips on this track
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-1.5">
      <span className="w-16 shrink-0 text-ink-faint">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-7 shrink-0 place-items-center rounded-md text-[13px] transition-colors disabled:opacity-30 ${on ? "bg-ink text-bg" : "bg-panel-2 text-ink-soft hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/** An on/off group (outline, shadow, background) with its settings below. */
function Extra({
  title,
  on,
  onToggle,
  children,
}: {
  title: string;
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      <label className="flex cursor-pointer items-center justify-between">
        <span className="font-semibold text-[11px] text-ink-soft">{title}</span>
        <input
          type="checkbox"
          checked={on}
          onChange={onToggle}
          className="size-4 accent-flare"
        />
      </label>
      {on && <div className="mt-1 flex flex-col gap-1">{children}</div>}
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
  onDone,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onDone: () => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDone}
        className="size-7 cursor-pointer rounded border border-line bg-transparent"
      />
      <span className="tabular text-[11px] text-ink-faint uppercase">
        {value}
      </span>
    </span>
  );
}

function AlignGlyph({ align }: { align: "left" | "center" | "right" }) {
  const lines = [12, 8, 10];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {lines.map((w, i) => {
        const x =
          align === "left" ? 1 : align === "right" ? 13 - w : (14 - w) / 2;
        return (
          <rect
            key={w}
            x={x}
            y={2.5 + i * 3.5}
            width={w}
            height="1.5"
            rx=".75"
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

const ANIMATION_LABELS: Record<string, string> = {
  fade: "Fade",
  pop: "Pop",
  "slide-up": "Slide up",
  "slide-down": "Slide down",
  typewriter: "Typewriter",
  pulse: "Pulse",
  float: "Float",
  wiggle: "Wiggle",
};

const DEFAULT_DURATION = sec(0.5);
const DEFAULT_PERIOD = sec(1.5);

/** Ready-made in, out and loop motion for a text clip. */
function AnimationControls({ layer }: { layer: TextLayer }) {
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const a: TextAnimation = layer.animation ?? {
    in: null,
    out: null,
    loop: null,
  };
  const patch = (p: Partial<TextAnimation>, gesture?: string) =>
    edit((d) => void setTextAnimation(d, layer.id, p), gesture);

  const select = (
    label: string,
    value: string | undefined,
    kinds: readonly string[],
    onPick: (kind: string | null) => void,
  ) => (
    <select
      aria-label={`${label} animation`}
      value={value ?? ""}
      onChange={(e) => onPick(e.target.value || null)}
      className="h-7 min-w-0 flex-1 rounded-md bg-panel-2 px-1.5 text-ink outline-none focus:ring-1 focus:ring-flare"
    >
      <option value="">None</option>
      {kinds.map((k) => (
        <option key={k} value={k}>
          {ANIMATION_LABELS[k] ?? k}
        </option>
      ))}
    </select>
  );

  const seconds = (
    label: string,
    value: number,
    onChange: (v: number, g: string) => void,
  ) => (
    <NumberField
      label={label}
      value={value / US}
      min={0.1}
      max={10}
      step={0.1}
      precision={1}
      unit="s"
      onChange={(v, g) => onChange(sec(v), g)}
      onCommit={seal}
    />
  );

  return (
    <div className="mt-3">
      <h4 className="mb-1 font-semibold text-[11px] text-ink-soft">
        Animation
      </h4>
      <div className="flex flex-col gap-1">
        <Row label="In">
          {select("In", a.in?.kind, TEXT_IN_ANIMATIONS, (kind) =>
            patch({
              in: kind
                ? {
                    kind: kind as never,
                    duration: a.in?.duration ?? DEFAULT_DURATION,
                  }
                : null,
            }),
          )}
        </Row>
        {a.in &&
          seconds(
            "Length",
            a.in.duration,
            (d, g) => a.in && patch({ in: { ...a.in, duration: d } }, g),
          )}
        <Row label="Out">
          {select("Out", a.out?.kind, TEXT_OUT_ANIMATIONS, (kind) =>
            patch({
              out: kind
                ? {
                    kind: kind as never,
                    duration: a.out?.duration ?? DEFAULT_DURATION,
                  }
                : null,
            }),
          )}
        </Row>
        {a.out &&
          seconds(
            "Length",
            a.out.duration,
            (d, g) => a.out && patch({ out: { ...a.out, duration: d } }, g),
          )}
        <Row label="Loop">
          {select("Loop", a.loop?.kind, TEXT_LOOP_ANIMATIONS, (kind) =>
            patch({
              loop: kind
                ? {
                    kind: kind as never,
                    period: a.loop?.period ?? DEFAULT_PERIOD,
                  }
                : null,
            }),
          )}
        </Row>
        {a.loop &&
          seconds(
            "Cycle",
            a.loop.period,
            (d, g) => a.loop && patch({ loop: { ...a.loop, period: d } }, g),
          )}
      </div>
    </div>
  );
}
