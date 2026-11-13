import { projectDuration, renameProject } from "@motion/core";
import { useEffect, useState } from "react";
import type { SaveStatus } from "../state/storage.ts";
import { useEditor } from "../state/store.ts";
import { ExportIcon, Mark } from "./icons.tsx";

const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? "/";

export function TopBar() {
  const name = useEditor((s) => s.project.name);
  const empty = useEditor((s) => projectDuration(s.project) === 0);
  const edit = useEditor((s) => s.edit);
  const setExportOpen = useEditor((s) => s.setExportOpen);
  const setProjectsOpen = useEditor((s) => s.setProjectsOpen);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-line border-b bg-panel px-2 sm:gap-3 sm:px-3">
      <a
        href={LANDING_URL}
        className="flex items-center gap-2 rounded-md pr-2"
        title="Motion home"
      >
        <Mark className="size-6 rounded-[6px]" />
        <span className="font-semibold font-semiwide text-[14px] text-ink max-sm:hidden">
          motion
        </span>
      </a>
      <div className="h-5 w-px bg-line" />
      <button
        type="button"
        title="Your projects"
        aria-label="Your projects"
        onClick={() => setProjectsOpen(true)}
        className="grid size-8 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
      </button>
      <input
        aria-label="Project name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => edit((d) => renameProject(d, draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-8 w-56 min-w-0 max-sm:flex-1 rounded-md bg-transparent px-2 text-ink-soft outline-none transition-colors hover:bg-panel-2 focus:bg-panel-2 focus:text-ink"
      />
      <SaveIndicator />
      <span className="ml-auto hidden text-[11px] text-ink-faint lg:block">
        Nothing is uploaded. Your files stay on this device.
      </span>
      <button
        type="button"
        disabled={empty}
        onClick={() => setExportOpen(true)}
        className="flex h-8 items-center gap-2 rounded-full bg-flare px-4 font-semibold text-flare-ink transition-colors hover:bg-ink disabled:opacity-40 disabled:hover:bg-flare max-md:ml-auto"
      >
        <ExportIcon width={14} height={14} />
        Export
      </button>
    </header>
  );
}

const SAVE_TEXT: Record<SaveStatus["kind"], string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved on this device",
  error: "Not saved",
  blocked: "Open in another tab: not saving",
  unavailable: "Can't save in this window",
};

function SaveIndicator() {
  const save = useEditor((s) => s.save);
  const text = SAVE_TEXT[save.kind];
  if (!text) return null;
  const problem =
    save.kind === "error" ||
    save.kind === "blocked" ||
    save.kind === "unavailable";
  const title =
    save.kind === "error"
      ? save.message
      : save.kind === "blocked"
        ? "Motion is already open in another tab. Close this one and keep working there, so the two don't overwrite each other."
        : save.kind === "unavailable"
          ? "This browser window has no storage (for example, some private windows). Your work will be lost when you close it."
          : save.kind === "saved"
            ? `Last saved ${new Date(save.at).toLocaleTimeString()}`
            : undefined;
  return (
    <output
      title={title}
      className={`flex shrink-0 items-center gap-1.5 text-[11px] ${problem ? "text-danger" : "text-ink-faint"}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${problem ? "bg-danger" : save.kind === "saving" ? "animate-pulse bg-ink-faint" : "bg-clip-audio"}`}
      />
      <span className="max-sm:sr-only">{text}</span>
    </output>
  );
}
