/**
 * Everything Motion keeps on this device, in IndexedDB:
 * - `projects`: the project, keyed by project id.
 * - `media`: each imported file, keyed by asset id.
 * - `meta`: which project to open next time.
 *
 * Files are stored as the original File objects. Nothing leaves the device.
 * IndexedDB rather than OPFS: it stores files in every browser we target,
 * including older Safari, with one API for both projects and media.
 */
import {
  type Project,
  type ProjectSummary,
  projectSummary,
} from "@motion/core";
import { useEditor } from "./store.ts";

const DB_NAME = "motion";
const DB_VERSION = 1;
const STORES = ["projects", "media", "meta"] as const;
type Store = (typeof STORES)[number];

export interface ProjectRecord {
  project: Project;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the app opened in another tab: let it upgrade.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("Couldn't open storage"));
    req.onblocked = () =>
      reject(new Error("Storage is blocked by another tab"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Run `fn` in a transaction and resolve once it is safely written. */
async function write(
  stores: Store[],
  fn: (tx: IDBTransaction) => void,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite", { durability: "strict" });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Couldn't save"));
    tx.onabort = () => reject(tx.error ?? new Error("Saving was cancelled"));
    fn(tx);
  });
}

async function read<T>(store: Store, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("Couldn't read"));
  });
}

// ---------------------------------------------------------------- save status

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  /** Another tab is editing, so this one doesn't save (it would overwrite). */
  | { kind: "blocked" }
  /** This browser mode has no storage (some private windows). */
  | { kind: "unavailable" };

const state = {
  projectSaving: false,
  pendingMedia: 0,
  projectError: null as string | null,
  /** Assets whose files couldn't be stored, by name. */
  unsavedMedia: new Map<string, string>(),
  lastSavedAt: 0,
  blocked: false,
  unavailable: false,
};

function publish() {
  let save: SaveStatus;
  if (state.unavailable) save = { kind: "unavailable" };
  else if (state.blocked) save = { kind: "blocked" };
  else if (state.projectError)
    save = { kind: "error", message: state.projectError };
  else if (state.unsavedMedia.size > 0) {
    const names = [...state.unsavedMedia.values()];
    save = {
      kind: "error",
      message: `${names.join(", ")} couldn't be stored on this device, so ${names.length > 1 ? "they" : "it"} won't come back after a reload.`,
    };
  } else if (state.projectSaving || state.pendingMedia > 0)
    save = { kind: "saving" };
  else if (state.lastSavedAt) save = { kind: "saved", at: state.lastSavedAt };
  else save = { kind: "idle" };
  useEditor.getState().setSave(save);
}

function describe(err: unknown): string {
  if (err instanceof DOMException && err.name === "QuotaExceededError") {
    return "This device is out of space for Motion.";
  }
  return err instanceof Error ? err.message : "Couldn't save.";
}

export const canSave = () => !state.blocked && !state.unavailable;

/** True while an imported file is still being copied into storage. */
export const hasPendingMedia = () => state.pendingMedia > 0;

/** Show the project as saved at `at` (after restoring it from storage). */
export function markSaved(at: number) {
  state.lastSavedAt = at;
  publish();
}

export function setBlocked(blocked: boolean) {
  state.blocked = blocked;
  publish();
}

export function setUnavailable() {
  state.unavailable = true;
  publish();
}

// ---------------------------------------------------------------- projects

const CURRENT = "currentProjectId";

/** Returns whether the project reached storage. */
export async function saveProject(project: Project): Promise<boolean> {
  if (!canSave()) return false;
  state.projectSaving = true;
  publish();
  try {
    await write(["projects", "meta"], (tx) => {
      const record: ProjectRecord = { project, savedAt: Date.now() };
      tx.objectStore("projects").put(record, project.id);
      tx.objectStore("meta").put(project.id, CURRENT);
    });
    state.projectError = null;
    state.lastSavedAt = Date.now();
    return true;
  } catch (err) {
    console.error("[motion] save project", err);
    state.projectError = describe(err);
    return false;
  } finally {
    state.projectSaving = false;
    publish();
  }
}

/** The project to open on start, as stored (not yet checked). */
export async function loadCurrentProject(): Promise<{
  project: unknown;
  savedAt: number;
} | null> {
  const id = await read<string>("meta", CURRENT);
  if (!id) return null;
  const record = await read<Partial<ProjectRecord>>("projects", id);
  if (!record) return null;
  return {
    project: record.project ?? null,
    savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
  };
}

/** A stored project as saved (not yet checked), or null if there is none. */
export async function loadProjectRecord(
  id: string,
): Promise<{ project: unknown; savedAt: number } | null> {
  const record = await read<Partial<ProjectRecord>>("projects", id);
  if (!record) return null;
  return {
    project: record.project ?? null,
    savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
  };
}

/**
 * Store a project without making it the one that opens next (a duplicate,
 * or a project file being opened). Throws if it can't be stored.
 */
export async function putProject(project: Project): Promise<void> {
  if (!canSave())
    throw new Error("Another tab is editing, so nothing can be saved here.");
  await write(["projects"], (tx) => {
    const record: ProjectRecord = { project, savedAt: Date.now() };
    tx.objectStore("projects").put(record, project.id);
  });
}

export async function setCurrentProject(id: string): Promise<void> {
  if (!canSave()) return;
  await write(["meta"], (tx) => {
    tx.objectStore("meta").put(id, CURRENT);
  });
}

/** Every stored project, most recently saved first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDb();
  const out: ProjectSummary[] = await new Promise((resolve, reject) => {
    const rows: ProjectSummary[] = [];
    const req = db
      .transaction("projects", "readonly")
      .objectStore("projects")
      .openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) {
        resolve(rows);
        return;
      }
      const rec = c.value as Partial<ProjectRecord>;
      const summary = projectSummary(
        rec.project,
        typeof rec.savedAt === "number" ? rec.savedAt : 0,
      );
      // The key is the id, even when the record itself is damaged.
      rows.push({ ...summary, id: String(c.key) });
      c.continue();
    };
    req.onerror = () =>
      reject(req.error ?? new Error("Couldn't read projects"));
  });
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Ids a stored project uses in the media store: its media and its fonts. */
function filesOf(record: unknown): string[] {
  const p = (record as { project?: { assets?: unknown; fonts?: unknown } })
    ?.project;
  const ids: string[] = [];
  for (const list of [p?.assets, p?.fonts]) {
    if (list && typeof list === "object") ids.push(...Object.keys(list));
  }
  return ids;
}

/**
 * Delete a project for good, with the stored files that no other project
 * uses. Returns how many files were removed.
 */
export async function deleteProject(id: string): Promise<number> {
  if (!canSave())
    throw new Error("Another tab is editing, so nothing can be changed here.");
  let removed = 0;
  await write(["projects", "media", "meta"], (tx) => {
    const projects = tx.objectStore("projects");
    const getReq = projects.get(id);
    getReq.onsuccess = () => {
      const own = filesOf(getReq.result);
      const used = new Set<string>();
      const cursor = projects.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          if (String(c.key) !== id)
            for (const f of filesOf(c.value)) used.add(f);
          c.continue();
          return;
        }
        // Only now, with every other project read, remove what's unused.
        projects.delete(id);
        for (const f of own) {
          if (!used.has(f)) {
            tx.objectStore("media").delete(f);
            removed++;
          }
        }
      };
    };
  });
  return removed;
}

// ---------------------------------------------------------------- media

let askedToPersist = false;

/**
 * Store an imported file. Usually run in the background (the status shows
 * progress); returns whether it was stored, for callers that wait.
 */
export async function saveMedia(
  assetId: string,
  name: string,
  file: File,
): Promise<boolean> {
  if (!canSave()) return false;
  state.pendingMedia++;
  publish();
  try {
    await write(["media"], (tx) => {
      tx.objectStore("media").put(file, assetId);
    });
    state.unsavedMedia.delete(assetId);
    state.lastSavedAt = Date.now();
    if (!askedToPersist) {
      askedToPersist = true;
      // Ask the browser not to clear Motion's storage when space runs low.
      void navigator.storage?.persist?.().catch(() => undefined);
    }
    return true;
  } catch (err) {
    console.error("[motion] save media", err);
    state.unsavedMedia.set(assetId, name);
    useEditor.getState().toast(`${name}: ${describe(err)}`, "error");
    return false;
  } finally {
    state.pendingMedia--;
    publish();
  }
}

export async function loadMedia(assetId: string): Promise<File | null> {
  const value = await read<unknown>("media", assetId);
  return value instanceof File ? value : null;
}

/** Throws if storage can't be opened at all. */
export async function checkStorage(): Promise<void> {
  await openDb();
}

/**
 * Delete stored files that no saved project uses (left behind when an import
 * is undone). Only safe at startup, before any edit: undo history doesn't
 * survive a reload, so nothing can bring those clips back.
 */
export async function pruneMedia(): Promise<number> {
  if (!canSave()) return 0;
  const db = await openDb();
  const used = new Set<string>();
  const mediaKeys: IDBValidKey[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "media"], "readonly");
    const cursor = tx.objectStore("projects").openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      // Read asset ids even from projects that fail to load, so their files
      // are kept in case they can be recovered later.
      const project = (
        c.value as { project?: { assets?: unknown; fonts?: unknown } }
      )?.project;
      // Imported media and added font files both live in the media store.
      for (const list of [project?.assets, project?.fonts]) {
        if (list && typeof list === "object") {
          for (const id of Object.keys(list)) used.add(id);
        }
      }
      c.continue();
    };
    const keys = tx.objectStore("media").getAllKeys();
    tx.oncomplete = () => resolve(keys.result);
    tx.onerror = () => reject(tx.error);
  });
  const unused = mediaKeys.filter((k) => !used.has(String(k)));
  if (unused.length === 0) return 0;
  await write(["media"], (tx) => {
    for (const k of unused) tx.objectStore("media").delete(k);
  });
  return unused.length;
}
