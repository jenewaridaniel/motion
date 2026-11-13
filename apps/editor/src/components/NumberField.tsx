import { type ReactNode, useEffect, useId, useRef, useState } from "react";

interface Props {
  label: string;
  value: number;
  /** Called continuously while scrubbing. `gesture` is stable for one drag. */
  onChange: (value: number, gesture: string) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
  /** Shown after the number. */
  unit?: string;
  /** Displayed value = value × displayScale (e.g. 100 for percent). */
  displayScale?: number;
  precision?: number;
  trailing?: ReactNode;
}

let gestureCounter = 0;

/**
 * A number you can type or scrub: drag the label left and right.
 * Shift scrubs 10× faster, Alt 10× slower.
 */
export function NumberField({
  label,
  value,
  onChange,
  onCommit,
  step = 1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  unit,
  displayScale = 1,
  precision = 1,
  trailing,
}: Props) {
  const id = useId();
  const shown = value * displayScale;
  const format = (v: number) => {
    const fixed = v.toFixed(precision);
    return precision > 0 ? fixed.replace(/\.?0+$/, "") || "0" : fixed;
  };
  const [text, setText] = useState(format(shown));
  const [focused, setFocused] = useState(false);
  const drag = useRef<{ x: number; start: number; gesture: string } | null>(
    null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: format only depends on precision
  useEffect(() => {
    if (!focused) setText(format(shown));
  }, [shown, focused]);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const commitText = () => {
    const parsed = Number.parseFloat(text);
    if (Number.isFinite(parsed)) {
      onChange(clamp(parsed / displayScale), `type-${++gestureCounter}`);
      onCommit?.();
    } else {
      setText(format(shown));
    }
  };

  return (
    <div className="flex h-7 items-center gap-1.5">
      <label
        htmlFor={id}
        className="w-16 shrink-0 cursor-ew-resize touch-none select-none text-ink-faint hover:text-ink-soft"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            start: shown,
            gesture: `scrub-${++gestureCounter}`,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          const next =
            d.start + Math.round((e.clientX - d.x) / 2) * step * mult;
          onChange(clamp(next / displayScale), d.gesture);
        }}
        onPointerUp={() => {
          if (drag.current) onCommit?.();
          drag.current = null;
        }}
      >
        {label}
      </label>
      <div className="flex h-full min-w-0 flex-1 items-center rounded-md bg-panel-2 pr-2 focus-within:ring-1 focus-within:ring-flare">
        <input
          id={id}
          inputMode="decimal"
          className="tabular h-full w-full min-w-0 bg-transparent px-2 text-ink outline-none"
          value={text}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            commitText();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              const el = e.currentTarget;
              setText(format(shown));
              setFocused(false);
              requestAnimationFrame(() => el.blur());
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const dir = e.key === "ArrowUp" ? 1 : -1;
              const mult = e.shiftKey ? 10 : 1;
              const next = clamp((shown + dir * step * mult) / displayScale);
              onChange(next, `key-${++gestureCounter}`);
              setText(format(next * displayScale));
            }
          }}
        />
        {unit && <span className="shrink-0 text-ink-faint">{unit}</span>}
      </div>
      {trailing}
    </div>
  );
}
