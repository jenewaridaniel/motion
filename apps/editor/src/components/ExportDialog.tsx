import {
  formatSeconds,
  projectDuration,
  rootComposition,
  US,
} from "@motion/core";
import type { StreamTargetChunk } from "@motion/media";
import {
  canExport,
  type ExportCodec,
  type ExportDestination,
  type ExportQuality,
  exportProject,
  exportSize,
} from "@motion/media";
import { useEffect, useMemo, useRef, useState } from "react";
import { engine } from "../lib/engine.ts";
import { getHandle } from "../state/media.ts";
import { useEditor } from "../state/store.ts";
import { CloseIcon } from "./icons.tsx";

const RESOLUTIONS = [
  { short: 720, label: "720p" },
  { short: 1080, label: "1080p" },
  { short: 1440, label: "2K" },
  { short: 2160, label: "4K" },
] as const;

const FPS = [24, 25, 30, 50, 60] as const;

const CODECS: { id: ExportCodec; label: string; hint: string }[] = [
  { id: "avc", label: "H.264", hint: "Plays everywhere" },
  { id: "hevc", label: "HEVC", hint: "Smaller file" },
];

const QUALITIES: { id: ExportQuality; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
];

type Phase =
  | { kind: "setup" }
  | {
      kind: "running";
      progress: number;
      frame: number;
      total: number;
      started: number;
    }
  | {
      kind: "done";
      notes: string[];
      savedTo: string | null;
      url: string | null;
      filename: string;
    }
  | { kind: "error"; message: string };

interface SavePicker {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    name: string;
    createWritable: () => Promise<WritableStream<StreamTargetChunk>>;
  }>;
}

function safeName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, "").trim() || "motion"}.mp4`;
}

export function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const project = useEditor((s) => s.project);
  const setOpen = useEditor((s) => s.setExportOpen);
  const comp = rootComposition(project);
  const [short, setShort] = useState<number>(1080);
  const [fps, setFpsState] = useState<number>(comp.fps);
  const [codec, setCodec] = useState<ExportCodec>("avc");
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [support, setSupport] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const abort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const sizes = useMemo(
    () =>
      Object.fromEntries(
        RESOLUTIONS.map((r) => [r.short, exportSize(project, r.short)]),
      ),
    [project],
  );
  const size = sizes[short] ?? exportSize(project, short);

  // Ask the browser which codec and size combinations it can encode.
  useEffect(() => {
    let live = true;
    for (const r of RESOLUTIONS) {
      const s = exportSize(project, r.short);
      for (const c of CODECS) {
        canExport(c.id, s.width, s.height).then((ok) => {
          if (live)
            setSupport((prev) => ({ ...prev, [`${c.id}@${r.short}`]: ok }));
        });
      }
    }
    return () => {
      live = false;
    };
  }, [project]);

  const supported = (c: ExportCodec, s: number) => support[`${c}@${s}`];

  // If the current pick isn't supported, step down to one that is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `supported` reads `support`, which is listed
  useEffect(() => {
    if (supported(codec, short) !== false) return;
    if (codec === "hevc" && supported("avc", short)) setCodec("avc");
    else {
      const lower = [...RESOLUTIONS]
        .reverse()
        .find((r) => r.short < short && supported(codec, r.short));
      if (lower) setShort(lower.short);
    }
  }, [support, codec, short]);

  useEffect(() => {
    panel.current?.focus();
    engine.pause();
  }, []);

  const running = phase.kind === "running";
  const close = () => {
    if (running) return;
    if (phase.kind === "done" && phase.url) URL.revokeObjectURL(phase.url);
    setOpen(false);
  };

  const start = async () => {
    const filename = safeName(project.name);
    let dest: ExportDestination = { kind: "memory" };
    let savedTo: string | null = null;
    // Must be called straight from the click, before any await.
    const picker = (window as unknown as SavePicker).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: filename,
          types: [
            { description: "MP4 video", accept: { "video/mp4": [".mp4"] } },
          ],
        });
        dest = { kind: "file", writable: await handle.createWritable() };
        savedTo = handle.name;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        dest = { kind: "memory" };
      }
    }

    const ctrl = new AbortController();
    abort.current = ctrl;
    const started = performance.now();
    setPhase({ kind: "running", progress: 0, frame: 0, total: 1, started });
    let lastPaint = 0;
    try {
      const result = await exportProject(
        project,
        getHandle,
        { width: size.width, height: size.height, fps, codec, quality },
        dest,
        (p) => {
          const now = performance.now();
          if (now - lastPaint < 100 && p.progress < 1) return;
          lastPaint = now;
          setPhase({
            kind: "running",
            progress: p.progress,
            frame: p.frame,
            total: p.totalFrames,
            started,
          });
        },
        ctrl.signal,
      );
      let url: string | null = null;
      if (result.blob) {
        url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      }
      setPhase({ kind: "done", notes: result.notes, savedTo, url, filename });
    } catch (err) {
      if (dest.kind === "file")
        await dest.writable.abort().catch(() => undefined);
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase({ kind: "setup" });
        return;
      }
      console.error("[motion] export", err);
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Export failed.",
      });
    } finally {
      abort.current = null;
    }
  };

  const duration = projectDuration(project);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        className="w-full max-w-md rounded-xl border border-line bg-panel shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-line-soft border-b px-5 py-4">
          <div>
            <h2
              id="export-title"
              className="font-semibold font-semiwide text-[16px] text-ink"
            >
              Export video
            </h2>
            <p className="tabular text-ink-faint">
              {formatSeconds(duration)} · MP4 · no watermark
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={running}
            onClick={close}
            className="grid size-8 place-items-center rounded-md text-ink-soft hover:bg-raised hover:text-ink disabled:opacity-30"
          >
            <CloseIcon />
          </button>
        </div>

        {phase.kind === "setup" && (
          <div className="flex flex-col gap-5 px-5 py-5">
            <Choice label="Resolution">
              {RESOLUTIONS.map((r) => {
                const ok = supported(codec, r.short);
                const s = sizes[r.short];
                return (
                  <Option
                    key={r.short}
                    active={short === r.short}
                    disabled={ok === false}
                    onClick={() => setShort(r.short)}
                    title={
                      ok === false
                        ? "Your device can't encode this size"
                        : `${s?.width}×${s?.height}`
                    }
                  >
                    {r.label}
                  </Option>
                );
              })}
            </Choice>
            <p className="tabular -mt-3 text-[11px] text-ink-faint">
              {size.width} × {size.height}
              {short >= 2160 && " · 4K export is fastest on recent computers"}
            </p>
            <Choice label="Frame rate">
              {FPS.map((f) => (
                <Option
                  key={f}
                  active={fps === f}
                  onClick={() => setFpsState(f)}
                >
                  {f}
                </Option>
              ))}
            </Choice>
            <Choice label="Format">
              {CODECS.map((c) => (
                <Option
                  key={c.id}
                  active={codec === c.id}
                  disabled={supported(c.id, short) === false}
                  onClick={() => setCodec(c.id)}
                  title={
                    supported(c.id, short) === false
                      ? "Not supported on this device"
                      : c.hint
                  }
                >
                  {c.label}
                  <span className="block text-[10px] font-normal opacity-70">
                    {c.hint}
                  </span>
                </Option>
              ))}
            </Choice>
            <Choice label="Quality">
              {QUALITIES.map((q) => (
                <Option
                  key={q.id}
                  active={quality === q.id}
                  onClick={() => setQuality(q.id)}
                >
                  {q.label}
                </Option>
              ))}
            </Choice>
            <button
              type="button"
              onClick={start}
              disabled={supported(codec, short) === false}
              className="mt-1 h-10 rounded-full bg-flare font-semibold text-flare-ink transition-colors hover:bg-ink disabled:opacity-40"
            >
              Export
            </button>
            <p className="-mt-2 text-center text-[11px] text-ink-faint">
              Rendered on this device. Keep this tab open until it finishes.
            </p>
          </div>
        )}

        {phase.kind === "running" && (
          <Running phase={phase} onCancel={() => abort.current?.abort()} />
        )}

        {phase.kind === "done" && (
          <div className="flex flex-col gap-3 px-5 py-6">
            <p className="font-semibold text-[15px] text-ink">
              Your video is ready.
            </p>
            <p className="text-ink-soft">
              {phase.savedTo
                ? `Saved as ${phase.savedTo}.`
                : `Downloaded as ${phase.filename}.`}
            </p>
            {phase.url && (
              <a
                href={phase.url}
                download={phase.filename}
                className="text-flare underline underline-offset-2"
              >
                Download again
              </a>
            )}
            {phase.notes.map((n) => (
              <p key={n} className="rounded-md bg-panel-2 p-3 text-ink-soft">
                {n}
              </p>
            ))}
            <button
              type="button"
              onClick={close}
              className="mt-2 h-10 rounded-full bg-raised font-semibold text-ink hover:bg-line"
            >
              Back to editing
            </button>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="flex flex-col gap-3 px-5 py-6">
            <p className="font-semibold text-[15px] text-danger">
              The export stopped.
            </p>
            <p className="text-ink-soft">{phase.message}</p>
            <button
              type="button"
              onClick={() => setPhase({ kind: "setup" })}
              className="mt-2 h-10 rounded-full bg-raised font-semibold text-ink hover:bg-line"
            >
              Change settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Running({
  phase,
  onCancel,
}: {
  phase: Extract<Phase, { kind: "running" }>;
  onCancel: () => void;
}) {
  const elapsed = (performance.now() - phase.started) / 1000;
  const eta = phase.progress > 0.02 ? elapsed / phase.progress - elapsed : null;
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <div className="flex items-baseline justify-between">
        <span className="tabular font-semibold font-semiwide text-[28px] text-ink">
          {Math.floor(phase.progress * 100)}%
        </span>
        <span className="tabular text-ink-faint">
          {eta === null
            ? "Starting…"
            : `About ${formatSeconds(eta * US).replace(/\.\d$/, "")} left`}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(phase.progress * 100)}
        aria-label="Export progress"
      >
        <div
          className="h-full bg-flare transition-[width] duration-150"
          style={{ width: `${phase.progress * 100}%` }}
        />
      </div>
      <p className="tabular text-[11px] text-ink-faint">
        Frame {phase.frame} of {phase.total}
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="h-10 rounded-full bg-raised font-semibold text-ink hover:bg-line"
      >
        Cancel
      </button>
    </div>
  );
}

function Choice({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-semibold text-[11px] text-ink-soft">
        {label}
      </legend>
      <div className="flex gap-1.5">{children}</div>
    </fieldset>
  );
}

function Option({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`tabular min-h-9 flex-1 rounded-md px-2 py-1.5 font-semibold text-[12px] transition-colors disabled:line-through disabled:opacity-35 ${active ? "bg-ink text-bg" : "bg-panel-2 text-ink-soft hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
