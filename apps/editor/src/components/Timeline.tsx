import {
  type Asset,
  addText,
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
  transitionLength,
  trimLayer,
  trimStartToDuration,
  US,
} from "@motion/core";
import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { engine } from "../lib/engine.ts";
import { DEFAULT_FONT } from "../lib/fonts.ts";
import {
  LONG_PRESS_MS,
  momentumStep,
  pinchZoom,
  scrollToKeep,
  TOUCH_SLOP_PX,
} from "../lib/gestures.ts";
import { useCompact } from "../lib/useCompact.ts";
import { ACCEPT, importFiles } from "../state/media.ts";
import { MAX_ZOOM, MIN_ZOOM, useEditor } from "../state/store.ts";
import { toggleVoiceover, useVoiceover } from "../state/voiceover.ts";
import { ClipVisuals } from "./ClipVisuals.tsx";
import {
  EyeIcon,
  ImageIcon,
  LayersIcon,
  MicIcon,
  MusicIcon,
  PlusIcon,
  RedoIcon,
  SpeakerIcon,
  SplitIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
  VideoIcon,
  ZoomFitIcon,
} from "./icons.tsx";
import { IconButton } from "./Preview.tsx";
import { TRANSITION_LABELS } from "./TransitionControl.tsx";

/** Width of the track names column. Narrow on small screens. */
const HeaderCtx = createContext(120);

/** Lets a clip stop the timeline's touch panning when it is picked up. */
const GestureCtx = createContext<{ cancelPan: () => void }>({
  cancelPan: () => {},
});

/** setPointerCapture, ignoring pointers the browser doesn't track. */
function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Not an active pointer (e.g. a synthetic event); nothing to capture.
  }
}
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

/** Add a text clip at the playhead and select it, ready to type. */
export function addTextAtPlayhead() {
  const s = useEditor.getState();
  let id: Id | null = null;
  s.edit((d) => {
    id = addText(d, s.playhead, {
      style: { font: DEFAULT_FONT.family, weight: 800 },
    });
  });
  if (id) s.select(id);
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

/** `fill`: take all the space given (side-by-side layout) instead of a set height. */
export function Timeline({ fill = false }: { fill?: boolean }) {
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
  const compact = useCompact();
  const HEADER = compact ? 52 : 120;
  // Read inside long-lived listeners, which would otherwise see a stale width.
  const headerRef = useRef(HEADER);
  headerRef.current = HEADER;

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
  }, [duration, viewW, setZoom, HEADER]);

  // Ctrl/Cmd + wheel zooms around the pointer; plain wheel scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - headerRef.current;
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
    el.scrollLeft = scrollToKeep(a.t, a.x, pps);
    zoomAnchor.current = null;
  }, [pps]);

  // Keep the playhead in view while playing.
  useEffect(
    () =>
      useEditor.subscribe((s) => {
        const el = scroller.current;
        if (!el || !s.playing) return;
        const x = (s.playhead / US) * s.pxPerSec;
        const visible = el.clientWidth - headerRef.current;
        if (x > el.scrollLeft + visible - 40 || x < el.scrollLeft) {
          el.scrollLeft = Math.max(0, x - 80);
        }
      }),
    [],
  );

  // ---- touch: swipe to scroll (with momentum), pinch to zoom, tap to deselect
  const touch = useRef({
    points: new Map<number, { x: number; y: number }>(),
    mode: "none" as "none" | "pan" | "pinch",
    last: { x: 0, y: 0, t: 0 },
    speed: 0,
    moved: 0,
    tapOnLane: false,
    pinch: { distance: 0, zoom: 0, t: 0, x: 0 },
  });
  const momentum = useRef(0);
  const cancelPan = useCallback(() => {
    touch.current.mode = "none";
  }, []);
  const gestures = useMemo(() => ({ cancelPan }), [cancelPan]);

  const onTouchDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    cancelAnimationFrame(momentum.current);
    const st = touch.current;
    st.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.points.size === 1) {
      st.mode = "pan";
      st.last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      st.speed = 0;
      st.moved = 0;
      st.tapOnLane = (e.target as HTMLElement).dataset.trackId !== undefined;
    } else if (st.points.size === 2) {
      const el = scroller.current;
      const [a, b] = [...st.points.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      if (!el) return;
      const x =
        (a.x + b.x) / 2 - el.getBoundingClientRect().left - headerRef.current;
      const { pxPerSec } = useEditor.getState();
      st.mode = "pinch";
      st.pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: pxPerSec,
        t: (el.scrollLeft + x) / pxPerSec,
        x,
      };
    }
  };

  const onTouchMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = touch.current;
    if (e.pointerType !== "touch" || !st.points.has(e.pointerId)) return;
    st.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = scroller.current;
    if (!el) return;
    if (st.mode === "pan" && st.points.size === 1) {
      const dx = e.clientX - st.last.x;
      const dy = e.clientY - st.last.y;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;
      st.moved += Math.abs(dx) + Math.abs(dy);
      const dt = Math.max(1, e.timeStamp - st.last.t);
      // Smooth the speed a little so the release isn't jumpy.
      st.speed = 0.6 * (-dx / dt) + 0.4 * st.speed;
      st.last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    } else if (st.mode === "pinch" && st.points.size === 2) {
      const [a, b] = [...st.points.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const zoom = pinchZoom(
        st.pinch.zoom,
        st.pinch.distance,
        Math.hypot(a.x - b.x, a.y - b.y),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      zoomAnchor.current = { t: st.pinch.t, x: st.pinch.x };
      setZoom(zoom);
    }
  };

  const onTouchUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = touch.current;
    if (e.pointerType !== "touch" || !st.points.delete(e.pointerId)) return;
    const el = scroller.current;
    if (st.points.size === 1) {
      // One finger left after a pinch: carry on scrolling from where it is.
      const [p] = [...st.points.values()] as [{ x: number; y: number }];
      st.mode = "pan";
      st.last = { x: p.x, y: p.y, t: e.timeStamp };
      st.speed = 0;
      return;
    }
    if (st.points.size > 0) return;
    if (st.mode === "pan" && st.moved <= TOUCH_SLOP_PX && st.tapOnLane) {
      select(null);
    } else if (st.mode === "pan" && el) {
      let speed = st.speed;
      let prev = performance.now();
      const glide = (now: number) => {
        const step = momentumStep(speed, now - prev);
        prev = now;
        if (!step) return;
        speed = step.v;
        el.scrollLeft += step.dx;
        momentum.current = requestAnimationFrame(glide);
      };
      momentum.current = requestAnimationFrame(glide);
    }
    st.mode = "none";
  };

  const hasContent = comp.tracks.some((t) => t.layers.length > 0);
  const selectedTrack = comp.tracks.find((t) =>
    t.layers.some((l) => l.id === selection),
  );

  return (
    <section
      aria-label="Timeline"
      className={`flex flex-col bg-panel ${fill ? "min-h-0 min-w-0 flex-1" : `shrink-0 border-line border-t ${compact ? "h-[34dvh] min-h-44" : "h-[38vh] min-h-56"}`}`}
    >
      {!compact && (
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
          <div className="mx-1 h-5 w-px bg-line" />
          <button
            type="button"
            onClick={addTextAtPlayhead}
            title="Add text at the playhead"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-semibold text-[12px] text-ink-soft transition-colors hover:bg-raised hover:text-ink"
          >
            <TextIcon width={14} height={14} />
            Text
          </button>
          <RecordButton />
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
      )}

      <div
        ref={scroller}
        className="scroll-thin relative min-h-0 flex-1 touch-none overflow-auto"
        onPointerDown={onTouchDown}
        onPointerMove={onTouchMove}
        onPointerUp={onTouchUp}
        onPointerCancel={onTouchUp}
      >
        <HeaderCtx.Provider value={HEADER}>
          <GestureCtx.Provider value={gestures}>
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
          </GestureCtx.Provider>
        </HeaderCtx.Provider>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ruler

function Ruler({ pps, width }: { pps: number; width: number }) {
  const HEADER = useContext(HeaderCtx);
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
          // Scrubbing, not scrolling: keep the timeline's touch pan out of it.
          e.stopPropagation();
          capture(e.currentTarget, e.pointerId);
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
  const HEADER = useContext(HeaderCtx);
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
  const HEADER = useContext(HeaderCtx);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex">
      <div
        className="sticky left-0 shrink-0 bg-panel"
        style={{ width: HEADER }}
      />
      <div
        className="sticky flex h-32 flex-1 items-center justify-center p-4"
        style={{ left: HEADER, maxWidth: `calc(100vw - ${HEADER}px)` }}
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
  const HEADER = useContext(HeaderCtx);
  // Narrow header (small screens): buttons only, stacked.
  const narrow = HEADER < 100;
  const h = trackHeight(track);
  return (
    <div className="flex border-line-soft border-b" style={{ height: h }}>
      <div
        className={`sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-line-soft border-r bg-panel ${narrow ? "flex-col justify-center px-1" : "pr-1 pl-3"}`}
        style={{ width: HEADER }}
        title={narrow ? track.name : undefined}
      >
        {!narrow && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            {track.name}
          </span>
        )}
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
        {/* Text has no sound, so a track of only text gets no mute button. */}
        {!track.layers.every((l) => l.kind === "text") && (
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
        )}
      </div>
      <div
        className="relative"
        data-track-id={track.id}
        data-track-kind={track.kind}
        data-track-magnetic={track.magnetic}
        style={{ width }}
        onPointerDown={(e) => {
          // Touch deselects on a tap instead (see the timeline), so a swipe
          // that starts on empty space doesn't lose the selection.
          if (e.pointerType !== "touch" && e.target === e.currentTarget) {
            onSelect(null);
          }
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
        {track.magnetic &&
          track.layers.map((layer, i) => {
            const prev = track.layers[i - 1];
            const tr = layer.transition;
            if (!tr || !prev) return null;
            const len = transitionLength(tr, prev, layer);
            return (
              <button
                key={`tr-${layer.id}`}
                type="button"
                title={`${TRANSITION_LABELS[tr.kind]} (${(len / US).toFixed(1)} s)`}
                aria-label={`${TRANSITION_LABELS[tr.kind]} transition`}
                onClick={() => onSelect(layer.id)}
                className="absolute bottom-0.5 z-[3] grid h-3.5 -translate-x-1/2 place-items-center rounded-sm bg-ink/85 text-bg hover:bg-ink"
                style={{
                  left: (layer.start / US) * pps,
                  width: Math.max(14, (len / US) * pps),
                }}
              >
                <svg
                  width="10"
                  height="8"
                  viewBox="0 0 10 8"
                  aria-hidden="true"
                >
                  <path
                    d="M0 0 L5 4 L0 8 Z M10 0 L5 4 L10 8 Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            );
          })}
      </div>
    </div>
  );
}

/** Dark wedges over a clip's sound fades: silent at the outer edge. */
function FadeShapes({
  fade,
  duration,
  pps,
}: {
  fade: { in: Micros; out: Micros };
  duration: Micros;
  pps: number;
}) {
  // Same shrink-to-fit rule as the sound (core's collectAudioSegments).
  let fi = Math.min(fade.in, duration);
  let fo = Math.min(fade.out, duration);
  if (fi + fo > duration) {
    const k = duration / (fi + fo);
    fi *= k;
    fo *= k;
  }
  const w = (duration / US) * pps;
  const a = (fi / US) * pps;
  const b = w - (fo / US) * pps;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full"
      width={w}
      preserveAspectRatio="none"
      viewBox={`0 0 ${Math.max(1, w)} 100`}
    >
      {a > 0 && <path d={`M0 0 L${a} 0 L0 100 Z`} fill="rgba(0,0,0,0.45)" />}
      {b < w && (
        <path d={`M${b} 0 L${w} 0 L${w} 100 Z`} fill="rgba(0,0,0,0.45)" />
      )}
      {a > 0 && (
        <path
          d={`M0 100 L${a} 0`}
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      )}
      {b < w && (
        <path
          d={`M${b} 0 L${w} 100`}
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      )}
    </svg>
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
  const { cancelPan } = useContext(GestureCtx);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  /** Picked up by a long press (touch). */
  const [lifted, setLifted] = useState(false);
  const left = (layer.start / US) * pps;
  const w = Math.max(4, (layer.duration / US) * pps);

  const color =
    layer.kind === "text"
      ? "bg-clip-title"
      : track.kind === "audio"
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

  const startGesture = (kind: "move" | "start" | "end", x: number) => {
    select(layer.id);
    const key = `clip-${++gestureId}`;
    const targets = snapTargets(layer.id);
    gesture.current =
      kind === "move"
        ? {
            kind: "move",
            x0: x,
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
            x0: x,
            t0: kind === "start" ? layer.start : layerEnd(layer),
            dur0: layer.duration,
            key,
            targets,
          };
  };

  const onDown = (e: ReactPointerEvent, kind: "move" | "start" | "end") => {
    if (e.button !== 0) return;
    if (e.pointerType === "touch" && (kind === "move" || !selected)) {
      // Touch: a tap selects, a hold picks the clip up, a drag scrolls the
      // timeline (the timeline handles that). Handles only trim once the
      // clip is selected, so a swipe can't trim by accident.
      if (kind !== "move" || press.current) return; // the clip body handles it
      const x = e.clientX;
      press.current = {
        x,
        y: e.clientY,
        timer: window.setTimeout(() => {
          press.current = null;
          cancelPan();
          navigator.vibrate?.(10);
          setLifted(true);
          startGesture("move", x);
        }, LONG_PRESS_MS),
      };
      return;
    }
    e.stopPropagation();
    capture(e.currentTarget, e.pointerId);
    startGesture(kind, e.clientX);
  };

  const onMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TOUCH_SLOP_PX) {
        // It's a swipe: let the timeline scroll.
        clearTimeout(p.timer);
        press.current = null;
      }
      return;
    }
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
    const p = press.current;
    if (p) {
      // A tap.
      clearTimeout(p.timer);
      press.current = null;
      select(layer.id);
      return;
    }
    setLifted(false);
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
    layer.kind === "text"
      ? TextIcon
      : asset?.kind === "image"
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
      className={`group absolute top-1 bottom-1 cursor-grab touch-none select-none overflow-hidden rounded-md ${color} ${selected ? "z-10 ring-2 ring-ink" : "ring-1 ring-black/25 hover:brightness-110"} ${track.hidden ? "opacity-40" : ""} ${dropping ? "opacity-60 outline-2 outline-flare outline-dashed" : ""} ${lifted ? "z-20 scale-y-110 shadow-xl shadow-black/50" : ""}`}
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
      {layer.kind === "media" && asset && (
        <ClipVisuals
          layer={layer}
          asset={asset}
          width={w}
          height={trackHeight(track) - 8}
          pxPerSec={pps}
        />
      )}
      {layer.kind === "media" && layer.fade && (
        <FadeShapes fade={layer.fade} duration={layer.duration} pps={pps} />
      )}
      <div className="pointer-events-none relative flex h-full items-start gap-1.5 px-2.5 pt-1.5 text-[11px] text-ink">
        <Icon
          width={12}
          height={12}
          className="mt-px shrink-0 opacity-80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
        />
        <span className="truncate font-medium [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
          {layer.name}
        </span>
        {speed && (
          <span className="tabular shrink-0 rounded bg-black/25 px-1 text-[10px]">
            {speed}
          </span>
        )}
      </div>
      <span className="tabular pointer-events-none absolute bottom-1 left-2.5 text-[10px] text-ink/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
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
          className={`absolute top-0 bottom-0 w-2.5 cursor-ew-resize touch-none pointer-coarse:w-5 ${edge === "start" ? "left-0" : "right-0"} ${selected ? "bg-ink/90" : "bg-transparent group-hover:bg-ink/40"}`}
          onPointerDown={(e) => onDown(e, edge)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      ))}
    </div>
  );
}

/** Record a voiceover from the microphone, starting at the playhead. */
function RecordButton() {
  const recording = useVoiceover((s) => s.recording);
  const since = useVoiceover((s) => s.since);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [recording]);
  const secs = recording ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  return (
    <button
      type="button"
      onClick={toggleVoiceover}
      title={
        recording ? "Stop recording" : "Record a voiceover at the playhead"
      }
      aria-pressed={recording}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 font-semibold text-[12px] transition-colors ${recording ? "bg-danger/20 text-danger" : "text-ink-soft hover:bg-raised hover:text-ink"}`}
    >
      {recording ? (
        <span className="size-2.5 animate-pulse rounded-full bg-danger" />
      ) : (
        <MicIcon width={14} height={14} />
      )}
      {recording
        ? `Stop ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
        : "Voiceover"}
    </button>
  );
}
