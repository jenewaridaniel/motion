import {
  type Asset,
  deleteLayer,
  formatSeconds,
  type Id,
  type Layer,
  layerEnd,
  liftToOverlay,
  type Micros,
  moveLayer,
  projectDuration,
  rootComposition,
  splitLayer,
  type Track,
  trimLayer,
  trimStartToDuration,
  US,
} from "@motion/core";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { engine } from "../lib/engine.ts";
import { ACCEPT, importFiles } from "../state/media.ts";
import { useEditor } from "../state/store.ts";
import {
  EyeIcon,
  ImageIcon,
  LayersIcon,
  MusicIcon,
  PlusIcon,
  RedoIcon,
  SpeakerIcon,
  SplitIcon,
  TrashIcon,
  UndoIcon,
  VideoIcon,
  ZoomFitIcon,
} from "./icons.tsx";
import { IconButton } from "./Preview.tsx";

const HEADER = 120;
const RULER = 28;
const SNAP_PX = 8;

function trackHeight(t: Track) {
  if (t.kind === "audio") return 40;
  return t.magnetic ? 60 : 48;
}

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

let gestureId = 0;

/** Split the selected clip, or whatever clip is under the playhead on the main track. */
export function splitAtPlayhead() {
  const s = useEditor.getState();
  const comp = rootComposition(s.project);
  let target: Id | null = s.selection;
  const inRange = (l: Layer) =>
    s.playhead > l.start && s.playhead < layerEnd(l);
  const all = comp.tracks.flatMap((t) => t.layers);
  if (!target || !all.some((l) => l.id === target && inRange(l))) {
    const main = comp.tracks.find((t) => t.magnetic);
    target = main?.layers.find(inRange)?.id ?? null;
  }
  if (!target) return;
  const id = target;
  let right: Id | null = null;
  s.edit((d) => {
    right = splitLayer(d, id, s.playhead);
  });
  // Like CapCut: keep working on the part after the cut.
  if (right) s.select(right);
}

export function deleteSelection() {
  const s = useEditor.getState();
  const id = s.selection;
  if (!id) return;
  s.edit((d) => {
    deleteLayer(d, id);
  });
  s.select(null);
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const pps = useEditor((s) => s.pxPerSec);
  const selection = useEditor((s) => s.selection);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const { undo, redo, setZoom, edit, select } = useEditor.getState();
  const comp = rootComposition(project);
  const duration = projectDuration(project);
  const scroller = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanesW = Math.max(viewW - HEADER, ((duration * 1.15) / US + 5) * pps);

  const fit = useCallback(() => {
    if (duration <= 0) return;
    setZoom((viewW - HEADER - 48) / (duration / US));
  }, [duration, viewW, setZoom]);

  // Ctrl/Cmd + wheel zooms around the pointer; plain wheel scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER;
      const { pxPerSec } = useEditor.getState();
      const t = (el.scrollLeft + x) / pxPerSec;
      zoomAnchor.current = { t, x };
      setZoom(pxPerSec * Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scroller.current;
    if (!a || !el) return;
    el.scrollLeft = a.t * pps - a.x;
    zoomAnchor.current = null;
  }, [pps]);

  // Keep the playhead in view while playing.
  useEffect(
    () =>
      useEditor.subscribe((s) => {
        const el = scroller.current;
        if (!el || !s.playing) return;
        const x = (s.playhead / US) * s.pxPerSec;
        const visible = el.clientWidth - HEADER;
        if (x > el.scrollLeft + visible - 40 || x < el.scrollLeft) {
          el.scrollLeft = Math.max(0, x - 80);
        }
      }),
    [],
  );

  const hasContent = comp.tracks.some((t) => t.layers.length > 0);
  const selectedTrack = comp.tracks.find((t) =>
    t.layers.some((l) => l.id === selection),
  );

  return (
    <section
      aria-label="Timeline"
      className="flex h-[38vh] min-h-56 shrink-0 flex-col border-line border-t bg-panel"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-line-soft border-b px-2">
        <IconButton label="Undo (⌘Z)" onClick={undo} disabled={!canUndo}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" onClick={redo} disabled={!canRedo}>
          <RedoIcon />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-line" />
        <IconButton
          label="Split at playhead (S)"
          onClick={splitAtPlayhead}
          disabled={!hasContent}
        >
          <SplitIcon />
        </IconButton>
        <IconButton
          label="Delete (⌫)"
          onClick={deleteSelection}
          disabled={!selection}
        >
          <TrashIcon />
        </IconButton>
        <IconButton
          label="Move to an overlay track"
          disabled={!selection || selectedTrack?.kind !== "visual"}
          onClick={() => {
            const id = selection;
            if (id) edit((d) => void liftToOverlay(d, id));
          }}
        >
          <LayersIcon />
        </IconButton>
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            label="Fit timeline"
            onClick={fit}
            disabled={duration === 0}
          >
            <ZoomFitIcon />
          </IconButton>
          <input
            type="range"
            aria-label="Timeline zoom"
            min={Math.log(8)}
            max={Math.log(600)}
            step={0.01}
            value={Math.log(pps)}
            onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
            className="w-28 accent-flare"
          />
        </div>
      </div>

      <div
        ref={scroller}
        className="scroll-thin relative min-h-0 flex-1 overflow-auto"
      >
        <div className="relative" style={{ width: HEADER + lanesW }}>
          <Ruler pps={pps} width={lanesW} />
          {hasContent ? (
            comp.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                assets={project.assets}
                pps={pps}
                width={lanesW}
                selection={selection}
                onSelect={select}
              />
            ))
          ) : (
            <EmptyLanes />
          )}
          <Playhead />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ruler

function Ruler({ pps, width }: { pps: number; width: number }) {
  const major = TICK_STEPS.find((s) => s * pps >= 72) ?? 600;
  const minor = major / (major >= 1 && major % 5 === 0 ? 5 : 2);
  const labels = useMemo(() => {
    const out: number[] = [];
    for (let s = 0; s * pps < width; s += major) out.push(s);
    return out;
  }, [major, pps, width]);

  // Memoised so the playhead (which changes every frame) doesn't re-render them.
  const labelEls = useMemo(
    () =>
      labels.map((s) => (
        <span
          key={s}
          className="tabular pointer-events-none absolute top-0 h-full border-line border-l pt-1 pl-1 text-[10px] text-ink-faint"
          style={{ left: s * pps }}
        >
          {formatSeconds(s * US).replace(/\.0$/, "")}
        </span>
      )),
    [labels, pps],
  );
  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => projectDuration(s.project));

  const scrubbing = useRef(false);
  const toTime = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return ((e.clientX - rect.left) / pps) * US;
  };

  return (
    <div className="sticky top-0 z-20 flex" style={{ height: RULER }}>
      <div
        className="sticky left-0 z-10 shrink-0 border-line-soft border-r border-b bg-panel"
        style={{ width: HEADER }}
      />
      <div
        role="slider"
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={duration / US}
        aria-valuenow={playhead / US}
        aria-valuetext={formatSeconds(playhead)}
        tabIndex={-1}
        className="relative cursor-text touch-none border-line-soft border-b bg-panel"
        style={{
          width,
          backgroundImage:
            "linear-gradient(to right, var(--color-line) 1px, transparent 1px)",
          backgroundSize: `${minor * pps}px 6px`,
          backgroundRepeat: "repeat-x",
          backgroundPosition: "0 100%",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubbing.current = true;
          engine.pause();
          engine.seek(toTime(e));
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) engine.seek(toTime(e));
        }}
        onPointerUp={() => {
          scrubbing.current = false;
        }}
      >
        {labelEls}
      </div>
    </div>
  );
}

function Playhead() {
  const playhead = useEditor((s) => s.playhead);
  const pps = useEditor((s) => s.pxPerSec);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-flare"
      style={{ left: HEADER + (playhead / US) * pps }}
    >
      <div className="sticky top-0 -ml-[5px] h-3 w-[11px] bg-flare [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]" />
    </div>
  );
}

function EmptyLanes() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex">
      <div
        className="sticky left-0 shrink-0 bg-panel"
        style={{ width: HEADER }}
      />
      <div
        className="sticky left-[120px] flex h-32 flex-1 items-center justify-center p-4"
        style={{ maxWidth: "calc(100vw - 120px)" }}
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-full w-full max-w-xl items-center justify-center gap-2 rounded-lg border border-line border-dashed text-ink-soft transition-colors hover:border-flare hover:text-ink"
        >
          <PlusIcon />
          Drop videos, photos or music here, or click to import
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tracks and clips

function TrackRow({
  track,
  assets,
  pps,
  width,
  selection,
  onSelect,
}: {
  track: Track;
  assets: Record<string, Asset>;
  pps: number;
  width: number;
  selection: Id | null;
  onSelect: (id: Id | null) => void;
}) {
  const edit = useEditor((s) => s.edit);
  const h = trackHeight(track);
  return (
    <div className="flex border-line-soft border-b" style={{ height: h }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-line-soft border-r bg-panel pr-1 pl-3"
        style={{ width: HEADER }}
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
          {track.name}
        </span>
        {track.kind === "visual" && (
          <button
            type="button"
            title={track.hidden ? "Show track" : "Hide track"}
            aria-label={track.hidden ? "Show track" : "Hide track"}
            aria-pressed={track.hidden}
            onClick={() =>
              edit((d) => {
                const t = rootComposition(d).tracks.find(
                  (x) => x.id === track.id,
                );
                if (t) t.hidden = !t.hidden;
              })
            }
            className="grid size-6 place-items-center rounded text-ink-faint hover:bg-raised hover:text-ink"
          >
            <EyeIcon off={track.hidden} width={14} height={14} />
          </button>
        )}
        <button
          type="button"
          title={track.muted ? "Unmute track" : "Mute track"}
          aria-label={track.muted ? "Unmute track" : "Mute track"}
          aria-pressed={track.muted}
          onClick={() =>
            edit((d) => {
              const t = rootComposition(d).tracks.find(
                (x) => x.id === track.id,
              );
              if (t) t.muted = !t.muted;
            })
          }
          className="grid size-6 place-items-center rounded text-ink-faint hover:bg-raised hover:text-ink"
        >
          <SpeakerIcon off={track.muted} width={14} height={14} />
        </button>
      </div>
      <div
        className="relative"
        data-track-id={track.id}
        data-track-kind={track.kind}
        data-track-magnetic={track.magnetic}
        style={{ width }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {track.layers.map((layer) => (
          <Clip
            key={layer.id}
            layer={layer}
            track={track}
            asset={layer.kind === "media" ? assets[layer.assetId] : undefined}
            pps={pps}
            selected={layer.id === selection}
          />
        ))}
      </div>
    </div>
  );
}

/** Times a dragged edge can snap to: zero, the playhead and other clip edges. */
function snapTargets(exclude: Id): Micros[] {
  const s = useEditor.getState();
  const out: Micros[] = [0, s.playhead];
  for (const t of rootComposition(s.project).tracks) {
    for (const l of t.layers) {
      if (l.id === exclude) continue;
      out.push(l.start, layerEnd(l));
    }
  }
  return out;
}

function snap(t: Micros, targets: Micros[], pps: number): Micros {
  const limit = (SNAP_PX / pps) * US;
  let best = t;
  let bestD = limit;
  for (const x of targets) {
    const d = Math.abs(x - t);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

type Gesture =
  | {
      kind: "move";
      x0: number;
      start0: Micros;
      dur: Micros;
      key: string;
      moved: boolean;
      targets: Micros[];
      /** Set while hovering another track; applied on release (moving tracks remounts the clip). */
      drop: { trackId: Id; start: Micros } | null;
    }
  | {
      kind: "trim";
      edge: "start" | "end";
      x0: number;
      /** Where the dragged edge started. */
      t0: Micros;
      /** The clip's duration when the drag started. */
      dur0: Micros;
      key: string;
      targets: Micros[];
    };

function Clip({
  layer,
  track,
  asset,
  pps,
  selected,
}: {
  layer: Layer;
  track: Track;
  asset: Asset | undefined;
  pps: number;
  selected: boolean;
}) {
  const { edit, seal, select } = useEditor.getState();
  const gesture = useRef<Gesture | null>(null);
  const [dropping, setDropping] = useState(false);
  const left = (layer.start / US) * pps;
  const w = Math.max(4, (layer.duration / US) * pps);

  const color =
    track.kind === "audio"
      ? "bg-clip-audio"
      : track.magnetic
        ? "bg-clip-main"
        : "bg-clip-overlay";

  const keyframeTimes = useMemo(() => {
    if (!selected) return [];
    const t = layer.transform;
    const props = [t.position, t.scale, t.rotation, t.anchor, layer.opacity];
    if (layer.kind === "media") props.push(layer.volume as never);
    const set = new Set<number>();
    for (const p of props) for (const k of p.keyframes ?? []) set.add(k.time);
    return [...set].filter((k) => k >= 0 && k <= layer.duration);
  }, [layer, selected]);

  const onDown = (e: ReactPointerEvent, kind: "move" | "start" | "end") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    select(layer.id);
    const key = `clip-${++gestureId}`;
    const targets = snapTargets(layer.id);
    gesture.current =
      kind === "move"
        ? {
            kind: "move",
            x0: e.clientX,
            start0: layer.start,
            dur: layer.duration,
            key,
            moved: false,
            targets,
            drop: null,
          }
        : {
            kind: "trim",
            edge: kind,
            x0: e.clientX,
            t0: kind === "start" ? layer.start : layerEnd(layer),
            dur0: layer.duration,
            key,
            targets,
          };
  };

  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dt = ((e.clientX - g.x0) / pps) * US;
    if (g.kind === "trim") {
      const to = snap(g.t0 + dt, g.targets, pps);
      if (g.edge === "end") {
        edit((d) => void trimLayer(d, layer.id, "end", to), g.key);
      } else {
        // By duration, not position: on the main track the clip snaps back
        // to its slot after each trim, so a position target would compound.
        const duration = g.dur0 - (to - g.t0);
        edit((d) => void trimStartToDuration(d, layer.id, duration), g.key);
      }
      return;
    }
    if (!g.moved && Math.abs(e.clientX - g.x0) < 4) return;
    g.moved = true;
    // Snap whichever edge is closer to a target.
    let start = g.start0 + dt;
    const byStart = snap(start, g.targets, pps);
    const byEnd = snap(start + g.dur, g.targets, pps) - g.dur;
    if (byStart !== start) start = byStart;
    else if (byEnd !== start) start = byEnd;
    // Allow dropping onto another track of the same kind.
    const under = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map(
        (el) =>
          (el as HTMLElement).closest?.(
            "[data-track-id]",
          ) as HTMLElement | null,
      )
      .find((el) => el && el.dataset.trackKind === track.kind);
    const toTrack = under?.dataset.trackId ?? track.id;
    const lane =
      under ??
      (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-track-id]");
    const magnetic = lane?.dataset.trackMagnetic === "true";
    // The main track orders clips by where the pointer is; free tracks place
    // the clip's start.
    const pointerT = lane
      ? ((e.clientX - lane.getBoundingClientRect().left) / pps) * US
      : start;
    const at = Math.max(0, magnetic ? pointerT : start);
    if (toTrack !== track.id) {
      g.drop = { trackId: toTrack, start: at };
      setDropping(true);
      return;
    }
    g.drop = null;
    setDropping(false);
    edit((d) => void moveLayer(d, layer.id, track.id, at), g.key);
  };

  const onUp = () => {
    const g = gesture.current;
    if (g?.kind === "move" && g.drop) {
      const { trackId, start } = g.drop;
      edit((d) => {
        if (!moveLayer(d, layer.id, trackId, start)) return;
      }, g.key);
    }
    if (g) seal();
    gesture.current = null;
    setDropping(false);
  };

  const Icon =
    asset?.kind === "image"
      ? ImageIcon
      : asset?.kind === "audio"
        ? MusicIcon
        : VideoIcon;
  const speed =
    layer.kind === "media" && layer.speed !== 1
      ? `${+layer.speed.toFixed(2)}×`
      : null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a clip holds its own trim handles, which a <button> can't contain
    <div
      role="button"
      tabIndex={0}
      aria-label={`${layer.name}, ${formatSeconds(layer.duration)}`}
      aria-pressed={selected}
      className={`group absolute top-1 bottom-1 cursor-grab touch-none select-none overflow-hidden rounded-md ${color} ${selected ? "z-10 ring-2 ring-ink" : "ring-1 ring-black/25 hover:brightness-110"} ${track.hidden ? "opacity-40" : ""} ${dropping ? "opacity-60 outline-2 outline-flare outline-dashed" : ""}`}
      style={{ left, width: w }}
      onPointerDown={(e) => onDown(e, "move")}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(layer.id);
        }
      }}
    >
      <div className="pointer-events-none flex h-full items-start gap-1.5 px-2.5 pt-1.5 text-[11px] text-ink">
        <Icon width={12} height={12} className="mt-px shrink-0 opacity-80" />
        <span className="truncate font-medium">{layer.name}</span>
        {speed && (
          <span className="tabular shrink-0 rounded bg-black/25 px-1 text-[10px]">
            {speed}
          </span>
        )}
      </div>
      <span className="tabular pointer-events-none absolute bottom-1 left-2.5 text-[10px] text-ink/70">
        {formatSeconds(layer.duration)}
      </span>
      {keyframeTimes.map((t) => (
        <span
          key={t}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 size-2 -translate-x-1/2 rotate-45 bg-flare ring-1 ring-black/40"
          style={{ left: (t / US) * pps }}
        />
      ))}
      {(["start", "end"] as const).map((edge) => (
        <div
          key={edge}
          aria-hidden="true"
          className={`absolute top-0 bottom-0 w-2.5 cursor-ew-resize touch-none ${edge === "start" ? "left-0" : "right-0"} ${selected ? "bg-ink/90" : "bg-transparent group-hover:bg-ink/40"}`}
          onPointerDown={(e) => onDown(e, edge)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      ))}
    </div>
  );
}
