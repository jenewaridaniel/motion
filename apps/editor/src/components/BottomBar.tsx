import type { ReactNode } from "react";
import { useEditor } from "../state/store.ts";
import { toggleVoiceover, useVoiceover } from "../state/voiceover.ts";
import {
  ImageIcon,
  MicIcon,
  RedoIcon,
  SplitIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from "./icons.tsx";
import {
  addTextAtPlayhead,
  deleteSelection,
  splitAtPlayhead,
} from "./Timeline.tsx";

export type SheetName = "media" | "edit";

/**
 * The main tools on small screens, in easy reach of a thumb. Replaces the
 * keyboard shortcuts and side panels of the desktop layout.
 */
export function BottomBar({ onOpen }: { onOpen: (sheet: SheetName) => void }) {
  const selection = useEditor((s) => s.selection);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const { undo, redo } = useEditor.getState();
  const recording = useVoiceover((s) => s.recording);

  return (
    <nav
      aria-label="Tools"
      className="flex shrink-0 items-stretch justify-around border-line border-t bg-panel px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <Tool label="Media" onClick={() => onOpen("media")}>
        <ImageIcon />
      </Tool>
      <Tool
        label="Text"
        onClick={() => {
          addTextAtPlayhead();
          onOpen("edit");
        }}
      >
        <TextIcon />
      </Tool>
      <Tool
        label={selection ? "Edit" : "Canvas"}
        onClick={() => onOpen("edit")}
      >
        <EditGlyph />
      </Tool>
      <Tool
        label={recording ? "Stop" : "Voice"}
        onClick={toggleVoiceover}
        active={recording}
      >
        {recording ? (
          <span className="size-3 animate-pulse rounded-full bg-danger" />
        ) : (
          <MicIcon />
        )}
      </Tool>
      <Tool label="Split" onClick={splitAtPlayhead}>
        <SplitIcon />
      </Tool>
      <Tool label="Delete" onClick={deleteSelection} disabled={!selection}>
        <TrashIcon />
      </Tool>
      <Tool label="Undo" onClick={undo} disabled={!canUndo}>
        <UndoIcon />
      </Tool>
      <Tool label="Redo" onClick={redo} disabled={!canRedo}>
        <RedoIcon />
      </Tool>
    </nav>
  );
}

function Tool({
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[10px] transition-colors active:bg-raised disabled:opacity-35 ${active ? "text-danger" : "text-ink-soft"}`}
    >
      {children}
      {label}
    </button>
  );
}

/** Sliders: "adjust this". */
function EditGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h11M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.6" fill="var(--color-panel)" />
      <circle cx="10.5" cy="11.5" r="1.6" fill="var(--color-panel)" />
    </svg>
  );
}
