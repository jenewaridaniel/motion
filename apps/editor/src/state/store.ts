import {
  createProject,
  History,
  type Id,
  type Micros,
  type Project,
  projectDuration,
  rootComposition,
  snapToFrame,
} from "@motion/core";
import { create } from "zustand";
import type { SaveStatus } from "./storage.ts";

/** Undo history lives outside React state; only the project snapshot goes in the store. */
export const history = new History();

export interface Toast {
  id: number;
  tone: "info" | "error";
  text: string;
}

interface EditorState {
  project: Project;
  canUndo: boolean;
  canRedo: boolean;
  selection: Id | null;
  playhead: Micros;
  playing: boolean;
  /** Timeline zoom. */
  pxPerSec: number;
  importing: number;
  toasts: Toast[];
  exportOpen: boolean;
  /** True while the last project is being loaded on start. */
  restoring: boolean;
  save: SaveStatus;
  /** Bumps when a file is opened outside an edit (reconnecting a missing file). */
  mediaVersion: number;

  /** Apply an edit. Pass the same `mergeKey` for every step of one gesture. */
  edit: (recipe: (draft: Project) => void, mergeKey?: string) => void;
  /** End the current gesture so the next edit is its own undo step. */
  seal: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: Id | null) => void;
  setPlayhead: (t: Micros) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (pxPerSec: number) => void;
  setImporting: (delta: number) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  setExportOpen: (open: boolean) => void;
  setRestoring: (restoring: boolean) => void;
  setSave: (save: SaveStatus) => void;
  mediaChanged: () => void;
  /** Replace the whole project (on restore). Clears undo history and selection. */
  loadProject: (project: Project) => void;
}

let toastId = 0;

export const MIN_ZOOM = 8;
export const MAX_ZOOM = 600;

/** State after a project change. Pulls the playhead back if the timeline got shorter. */
function synced(project: Project, playhead: Micros) {
  return {
    project,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    playhead: Math.min(playhead, projectDuration(project)),
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  project: createProject(),
  canUndo: false,
  canRedo: false,
  selection: null,
  playhead: 0,
  playing: false,
  pxPerSec: 60,
  importing: 0,
  toasts: [],
  exportOpen: false,
  restoring: true,
  save: { kind: "idle" },
  mediaVersion: 0,

  edit: (recipe, mergeKey) => {
    const next = history.apply(get().project, recipe, mergeKey);
    if (next !== get().project) set(synced(next, get().playhead));
  },
  seal: () => history.seal(),
  undo: () => set(synced(history.undo(get().project), get().playhead)),
  redo: () => set(synced(history.redo(get().project), get().playhead)),
  select: (selection) => set({ selection }),
  setPlayhead: (t) => {
    const { project } = get();
    const max = projectDuration(project);
    const fps = rootComposition(project).fps;
    set({ playhead: Math.min(Math.max(0, snapToFrame(t, fps)), max) });
  },
  setPlaying: (playing) => set({ playing }),
  setZoom: (pxPerSec) =>
    set({ pxPerSec: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerSec)) }),
  setImporting: (delta) => set((s) => ({ importing: s.importing + delta })),
  toast: (text, tone = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, text }] }));
    setTimeout(() => get().dismissToast(id), tone === "error" ? 8000 : 4000);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setRestoring: (restoring) => set({ restoring }),
  setSave: (save) => set({ save }),
  mediaChanged: () => set((s) => ({ mediaVersion: s.mediaVersion + 1 })),
  loadProject: (project) => {
    history.clear();
    set({ ...synced(project, 0), selection: null, playhead: 0 });
  },
}));

/**
 * Selected layer, if it still exists. Returns the stored object itself, never
 * a new wrapper: Zustand re-renders whenever a selector's result changes
 * identity, so a fresh object each time would loop forever.
 */
export function useSelectedLayer() {
  return useEditor((s) => {
    if (!s.selection) return null;
    for (const t of rootComposition(s.project).tracks) {
      const l = t.layers.find((x) => x.id === s.selection);
      if (l) return l;
    }
    return null;
  });
}
