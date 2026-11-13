/**
 * Autosave: restores the last project on start, then saves every change.
 *
 * Saves are debounced (a drag makes many changes; one save at the end is
 * enough) and run one at a time, so an older save can never land after a
 * newer one. Only one tab saves at a time; see `claimTab`.
 */
import { type Project, parseProject } from "@motion/core";
import { restoreMedia } from "./media.ts";
import {
  canSave,
  checkStorage,
  hasPendingMedia,
  loadCurrentProject,
  markSaved,
  pruneMedia,
  saveProject,
  setBlocked,
  setUnavailable,
} from "./storage.ts";
import { useEditor } from "./store.ts";

const DEBOUNCE_MS = 400;

let lastSaved: Project | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

/** Save now if the project changed since the last save. */
export async function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // Wait for a save in progress, then save whatever is newest.
  while (running) await running;
  const { project } = useEditor.getState();
  if (project === lastSaved || !canSave()) return;
  const previous = lastSaved;
  lastSaved = project;
  running = saveProject(project)
    .then((ok) => {
      // Not saved: forget it was attempted, so the next flush tries again.
      if (!ok && lastSaved === project) lastSaved = previous;
    })
    .finally(() => {
      running = null;
    });
  await running;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushSave();
  }, DEBOUNCE_MS);
}

/**
 * Only one tab may save. Two tabs saving the same project would overwrite
 * each other's work, so a second tab opens read-only and says why.
 */
function claimTab(): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void locks.request("motion-editor", { ifAvailable: true }, (lock) => {
      resolve(!!lock);
      // Hold the lock for as long as this tab is open.
      return lock ? new Promise<void>(() => {}) : undefined;
    });
  });
}

/** Load the last project, then start saving changes. Call once on start. */
export async function startAutosave(): Promise<void> {
  const store = useEditor.getState();
  try {
    try {
      await checkStorage();
    } catch (err) {
      console.warn("[motion] storage unavailable", err);
      setUnavailable();
      return;
    }

    if (!(await claimTab())) setBlocked(true);

    let raw: Awaited<ReturnType<typeof loadCurrentProject>> = null;
    try {
      raw = await loadCurrentProject();
    } catch (err) {
      console.error("[motion] load project", err);
      store.toast(
        "Couldn't read your saved project. Starting a new one.",
        "error",
      );
    }
    if (raw !== null) {
      const parsed = parseProject(raw.project);
      if (parsed.ok) {
        const missing = await restoreMedia(
          Object.values(parsed.project.assets),
        );
        store.loadProject(parsed.project);
        lastSaved = parsed.project;
        if (raw.savedAt) markSaved(raw.savedAt);
        if (missing.length > 0) {
          store.toast(
            `${missing.join(", ")} couldn't be reopened. Import ${missing.length > 1 ? "them" : "it"} again to see ${missing.length > 1 ? "them" : "it"}.`,
            "error",
          );
        }
      } else {
        // Leave the stored copy alone: the new project gets a new id, so
        // nothing overwrites it.
        store.toast(
          `Couldn't open your last project because ${parsed.reason}. Starting a new one.`,
          "error",
        );
      }
    }

    // While still restoring, so imports are blocked: a file stored now but
    // not yet in a saved project would otherwise look unused.
    try {
      const n = await pruneMedia();
      if (n > 0) console.info(`[motion] removed ${n} unused stored file(s)`);
    } catch (err) {
      console.warn("[motion] prune media", err);
    }
  } finally {
    useEditor.getState().setRestoring(false);
  }

  if (lastSaved === null) lastSaved = useEditor.getState().project;

  useEditor.subscribe((s, prev) => {
    if (s.project !== prev.project) schedule();
  });

  // Save straight away when the tab is hidden or closed.
  const flushNow = () => void flushSave();
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  // Project edits are saved as the page closes (checked in Chrome), so they
  // don't need a warning. A large file still being copied does: it takes
  // seconds and would be lost.
  window.addEventListener("beforeunload", (e) => {
    void flushSave();
    if (hasPendingMedia()) e.preventDefault();
  });
}
