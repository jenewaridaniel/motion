import { formatSeconds, type ProjectSummary } from "@motion/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteProjectById,
  duplicateProjectById,
  newProject,
  openProject,
  openProjectFile,
  PROJECT_FILE_EXT,
  renameProjectById,
  saveProjectFile,
} from "../state/projects.ts";
import { listProjects } from "../state/storage.ts";
import { useEditor } from "../state/store.ts";
import { PlusIcon } from "./icons.tsx";

function ago(t: number): string {
  if (!t) return "never saved";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

function shape(w: number, h: number): string {
  if (!w || !h) return "";
  const r = w / h;
  if (Math.abs(r - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(r - 16 / 9) < 0.02) return "16:9";
  if (Math.abs(r - 1) < 0.02) return "1:1";
  if (Math.abs(r - 4 / 5) < 0.02) return "4:5";
  return `${w}×${h}`;
}

/** Every project on this device, with what you can do to each. */
export function ProjectsPanel({ onDone }: { onDone: () => void }) {
  const currentId = useEditor((s) => s.project.id);
  const currentName = useEditor((s) => s.project.name);
  const [rows, setRows] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listProjects());
    } catch {
      setRows([]);
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh when the open project or its name changes
  useEffect(() => {
    void refresh();
  }, [refresh, currentId, currentName]);

  const run = async (fn: () => Promise<unknown>, close = false) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("[motion] projects", err);
      useEditor
        .getState()
        .toast(
          err instanceof Error ? err.message : "That didn't work.",
          "error",
        );
    } finally {
      setBusy(false);
      await refresh();
      if (close) onDone();
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap gap-2 border-line-soft border-b px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(newProject, true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-flare px-4 font-semibold text-flare-ink transition-colors hover:bg-ink disabled:opacity-50"
        >
          <PlusIcon width={14} height={14} />
          New project
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="h-9 rounded-full bg-raised px-4 font-semibold text-ink transition-colors hover:bg-line disabled:opacity-50"
        >
          Open project file…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={PROJECT_FILE_EXT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f)
              void run(
                async () => (await openProjectFile(f)) || undefined,
                true,
              );
          }}
        />
      </div>

      <ul aria-label="Projects" className="flex flex-col">
        {rows === null && (
          <li className="px-4 py-6 text-ink-faint">Loading…</li>
        )}
        {rows?.map((p) => {
          const current = p.id === currentId;
          return (
            <li
              key={p.id}
              className="flex flex-col gap-2 border-line-soft border-b px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {renaming === p.id ? (
                    <input
                      // biome-ignore lint/a11y/noAutofocus: the user just asked to rename
                      autoFocus
                      aria-label="Project name"
                      defaultValue={p.name}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenaming(null);
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        const v = e.currentTarget.value;
                        setRenaming(null);
                        if (v.trim() && v !== p.name)
                          void run(() => renameProjectById(p.id, v));
                      }}
                      className="h-8 w-full rounded-md bg-panel-2 px-2 text-ink outline-none focus:ring-1 focus:ring-flare"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !p.ok}
                      onClick={() => run(() => openProject(p.id), true)}
                      className="block max-w-full truncate text-left font-semibold text-ink hover:text-flare disabled:hover:text-ink"
                    >
                      {p.name}
                    </button>
                  )}
                  <p className="tabular mt-0.5 text-[11px] text-ink-faint">
                    {p.ok
                      ? `${ago(p.savedAt)} · ${formatSeconds(p.duration)} · ${shape(p.width, p.height)} · ${p.clips} clip${p.clips === 1 ? "" : "s"}`
                      : `Can't be opened: ${p.problem ?? "unknown problem"}`}
                  </p>
                </div>
                {current && (
                  <span className="shrink-0 rounded-full bg-wine px-2 py-0.5 font-semibold text-[10px] text-ink">
                    Open
                  </span>
                )}
              </div>

              {confirmDelete === p.id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 p-2.5">
                  <p className="min-w-0 flex-1 text-[12px] text-ink">
                    Delete “{p.name}” from this device? Media no other project
                    uses is deleted too. This can't be undone.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmDelete(null);
                      void run(() => deleteProjectById(p.id));
                    }}
                    className="h-8 rounded-full bg-danger px-3 font-semibold text-[12px] text-flare-ink"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="h-8 rounded-full bg-raised px-3 font-semibold text-[12px] text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <Action
                    label="Rename"
                    disabled={busy || !p.ok}
                    onClick={() => setRenaming(p.id)}
                  />
                  <Action
                    label="Duplicate"
                    disabled={busy || !p.ok}
                    onClick={() => run(() => duplicateProjectById(p.id))}
                  />
                  <Action
                    label="Save as file"
                    disabled={busy || !p.ok}
                    onClick={() => run(() => saveProjectFile(p.id, p.name))}
                  />
                  <Action
                    label="Delete"
                    danger
                    disabled={busy}
                    onClick={() => setConfirmDelete(p.id)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-3 text-[11px] text-ink-faint leading-relaxed">
        Projects are stored in this browser on this device. Use “Save as file”
        to keep a backup or move a project to another device.
      </p>
    </div>
  );
}

function Action({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-8 rounded-md px-2.5 text-[12px] transition-colors hover:bg-raised disabled:opacity-35 ${danger ? "text-danger" : "text-ink-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );
}
