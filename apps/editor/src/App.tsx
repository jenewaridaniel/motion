import { frameTime, projectDuration, rootComposition, US } from "@motion/core";
import { useEffect, useState } from "react";
import { BottomBar, type SheetName } from "./components/BottomBar.tsx";
import { ExportDialog } from "./components/ExportDialog.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { MediaBin } from "./components/MediaBin.tsx";
import { Preview } from "./components/Preview.tsx";
import { Sheet } from "./components/Sheet.tsx";
import {
  deleteSelection,
  splitAtPlayhead,
  Timeline,
} from "./components/Timeline.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { engine } from "./lib/engine.ts";
import { useCompact, useShort } from "./lib/useCompact.ts";
import { importFiles } from "./state/media.ts";
import { useEditor } from "./state/store.ts";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
}

function useShortcuts() {
  useEffect(() => {
    // Whether focus is being moved with the keyboard (Tab) or the pointer.
    let tabbing = false;
    const onPointer = () => {
      tabbing = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") tabbing = true;
      const s = useEditor.getState();
      if (s.exportOpen || isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const fps = rootComposition(s.project).fps;

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod) return;

      switch (e.key) {
        case " ": {
          // A button reached with Tab keeps Space. One that was merely
          // clicked gives it up, so Space still plays after using a tool.
          const el = e.target as HTMLElement | null;
          if (el?.tagName === "BUTTON" && tabbing) return;
          e.preventDefault();
          if (el?.tagName === "BUTTON") el.blur();
          engine.toggle();
          break;
        }
        case "s":
        case "S":
          e.preventDefault();
          splitAtPlayhead();
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          deleteSelection();
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          engine.pause();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          const step = e.shiftKey ? US : frameTime(1, fps);
          engine.seek(s.playhead + dir * step);
          break;
        }
        case "Home":
          e.preventDefault();
          engine.seek(0);
          break;
        case "End":
          e.preventDefault();
          engine.seek(projectDuration(s.project));
          break;
        case "Escape":
          s.select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
}

/** Drop files anywhere on the window to import them. */
function useWindowDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (e.dataTransfer) void importFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return over;
}

function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  const dismiss = useEditor((s) => s.dismissToast);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-lg border px-4 py-3 text-left shadow-xl ${t.tone === "error" ? "border-danger/50 bg-panel text-ink" : "border-line bg-panel text-ink-soft"}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

function Restoring() {
  const restoring = useEditor((s) => s.restoring);
  if (!restoring) return null;
  return (
    <output className="fixed inset-0 z-50 grid place-items-center bg-bg/90 text-ink-soft">
      Opening your project…
    </output>
  );
}

export function App() {
  useShortcuts();
  const dropping = useWindowDrop();
  const compact = useCompact();
  const short = useShort();
  const [sheet, setSheet] = useState<SheetName | null>(null);

  return (
    <>
      {compact ? (
        <div className="flex h-dvh flex-col">
          <TopBar />
          {short ? (
            // Phone held sideways: side by side, so the video isn't squashed.
            <div className="flex min-h-0 flex-1">
              <Preview />
              <div className="flex min-w-0 flex-1 border-line border-l">
                <Timeline fill />
              </div>
            </div>
          ) : (
            <>
              <Preview />
              <Timeline />
            </>
          )}
          <BottomBar onOpen={setSheet} />
        </div>
      ) : (
        <div className="flex h-dvh flex-col">
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <MediaBin />
            <Preview />
            <Inspector />
          </div>
          <Timeline />
        </div>
      )}
      {compact && (
        <>
          <Sheet
            title="Media"
            open={sheet === "media"}
            onClose={() => setSheet(null)}
          >
            <MediaBin inSheet />
          </Sheet>
          <Sheet
            title="Edit"
            open={sheet === "edit"}
            onClose={() => setSheet(null)}
          >
            <Inspector inSheet />
          </Sheet>
        </>
      )}
      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-wine/40 backdrop-blur-[2px]">
          <p className="rounded-full bg-panel px-6 py-3 font-semibold text-ink shadow-2xl">
            Drop to add to your timeline
          </p>
        </div>
      )}
      <Restoring />
      <ExportDialog />
      <Toasts />
    </>
  );
}
