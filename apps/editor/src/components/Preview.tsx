import {
  formatTimecode,
  frameTime,
  projectDuration,
  rootComposition,
} from "@motion/core";
import { useEffect, useRef, useState } from "react";
import { engine } from "../lib/engine.ts";
import { useEditor } from "../state/store.ts";
import { PauseIcon, PlayIcon, StepIcon } from "./icons.tsx";

export function Preview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const compW = useEditor((s) => rootComposition(s.project).width);
  const compH = useEditor((s) => rootComposition(s.project).height);
  const empty = useEditor((s) => projectDuration(s.project) === 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(engine.attach(canvas));
    return () => engine.detach();
  }, []);

  // Fit the canvas to the panel, keeping the composition's shape.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const s = Math.min(width / compW, height / compH);
      setBox({ w: Math.floor(compW * s), h: Math.floor(compH * s) });
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [compW, compH]);

  // Backing store: CSS size × device pixels, never above the composition size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = Math.min(dpr, compW / box.w);
    canvas.width = Math.max(1, Math.round(box.w * k));
    canvas.height = Math.max(1, Math.round(box.h * k));
    engine.request();
  }, [box, compW]);

  return (
    <section
      aria-label="Preview"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg"
    >
      <div ref={wrapRef} className="relative min-h-0 flex-1 p-4 [contain:size]">
        <div className="absolute inset-4 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            style={{ width: box.w, height: box.h }}
            className="rounded-sm shadow-[0_0_0_1px_var(--color-line-soft)]"
          />
          {error && (
            <p className="absolute max-w-sm rounded-lg bg-panel p-4 text-center text-ink-soft">
              {error}
            </p>
          )}
          {empty && !error && (
            <p className="pointer-events-none absolute max-w-[22ch] text-center text-ink-faint">
              Your video shows up here.
            </p>
          )}
        </div>
      </div>
      <Transport />
    </section>
  );
}

function Transport() {
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const fps = useEditor((s) => rootComposition(s.project).fps);
  const duration = useEditor((s) => projectDuration(s.project));
  const step = (dir: 1 | -1) => {
    engine.pause();
    engine.seek(playhead + dir * frameTime(1, fps));
  };

  return (
    <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-line-soft border-t px-3">
      <span className="tabular w-24 text-right text-ink">
        {formatTimecode(playhead, fps)}
      </span>
      <div className="mx-3 flex items-center gap-1">
        <IconButton label="Previous frame (←)" onClick={() => step(-1)}>
          <StepIcon dir="back" />
        </IconButton>
        <button
          type="button"
          aria-label={playing ? "Pause (Space)" : "Play (Space)"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          disabled={duration === 0}
          onClick={() => engine.toggle()}
          className="grid size-9 place-items-center rounded-full bg-ink text-bg transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <IconButton label="Next frame (→)" onClick={() => step(1)}>
          <StepIcon dir="forward" />
        </IconButton>
      </div>
      <span className="tabular w-24 text-ink-faint">
        {formatTimecode(duration, fps)}
      </span>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md transition-colors hover:bg-raised disabled:opacity-35 disabled:hover:bg-transparent ${active ? "text-flare" : "text-ink-soft hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
