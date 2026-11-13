import { projectDuration, renameProject } from "@motion/core";
import { useEffect, useState } from "react";
import { useEditor } from "../state/store.ts";
import { ExportIcon, Mark } from "./icons.tsx";

const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? "/";

export function TopBar() {
  const name = useEditor((s) => s.project.name);
  const empty = useEditor((s) => projectDuration(s.project) === 0);
  const edit = useEditor((s) => s.edit);
  const setExportOpen = useEditor((s) => s.setExportOpen);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-line border-b bg-panel px-3">
      <a
        href={LANDING_URL}
        className="flex items-center gap-2 rounded-md pr-2"
        title="Motion home"
      >
        <Mark className="size-6 rounded-[6px]" />
        <span className="font-semibold font-semiwide text-[14px] text-ink">
          motion
        </span>
      </a>
      <div className="h-5 w-px bg-line" />
      <input
        aria-label="Project name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => edit((d) => renameProject(d, draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-8 w-56 min-w-0 rounded-md bg-transparent px-2 text-ink-soft outline-none transition-colors hover:bg-panel-2 focus:bg-panel-2 focus:text-ink"
      />
      <span className="ml-auto hidden text-[11px] text-ink-faint md:block">
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
