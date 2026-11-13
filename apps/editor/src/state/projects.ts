/**
 * The projects kept on this device: open, new, duplicate, rename, delete,
 * and moving a project in and out as one .motion file.
 */
import {
  createProject,
  duplicateProject,
  type Project,
  parseProject,
  projectFromTemplate,
  reidProject,
  renameProject,
} from "@motion/core";
import { readZip, writeZip } from "../lib/zip.ts";
import { adoptNewProject, adoptStoredProject, flushSave } from "./autosave.ts";
import {
  canSave,
  deleteProject,
  listProjects,
  loadMedia,
  loadProjectRecord,
  putProject,
  saveMedia,
  setCurrentProject,
} from "./storage.ts";
import { useEditor } from "./store.ts";

const FORMAT = "motion-project";
const FILE_VERSION = 1;
export const PROJECT_FILE_EXT = ".motion";
export const isProjectFile = (f: File) =>
  f.name.toLowerCase().endsWith(PROJECT_FILE_EXT);

/** What's inside a .motion file, besides the media and fonts. */
interface Manifest {
  format: typeof FORMAT;
  version: number;
  project: unknown;
  /** Original file name and type for each stored file, by asset or font id. */
  files: Record<string, { name: string; type: string }>;
}

const toast = (text: string, tone?: "info" | "error") =>
  useEditor.getState().toast(text, tone);

/** True (and says why) when this tab may not change stored projects. */
function blocked(): boolean {
  if (canSave()) return false;
  toast(
    "Motion is open in another tab. Use that tab to manage projects.",
    "error",
  );
  return true;
}

async function storedProject(id: string): Promise<Project | null> {
  if (id === useEditor.getState().project.id) {
    await flushSave();
    return useEditor.getState().project;
  }
  const rec = await loadProjectRecord(id);
  const parsed = rec ? parseProject(rec.project) : null;
  return parsed?.ok ? parsed.project : null;
}

export async function openProject(id: string): Promise<boolean> {
  if (id === useEditor.getState().project.id) return true;
  if (blocked()) return false;
  await flushSave();
  const rec = await loadProjectRecord(id);
  if (!rec) {
    toast("That project is no longer here.", "error");
    return false;
  }
  const problem = await adoptStoredProject(rec.project, rec.savedAt);
  if (problem) {
    toast(`Couldn't open this project because ${problem}.`, "error");
    return false;
  }
  await setCurrentProject(id);
  return true;
}

export async function newProject(): Promise<void> {
  if (blocked()) return;
  await adoptNewProject(createProject());
}

/** Start a new project from a template, and switch to it. */
export async function newProjectFromTemplate(id: string): Promise<void> {
  if (blocked()) return;
  const project = projectFromTemplate(id);
  if (!project) return;
  await adoptNewProject(project);
}

export async function duplicateProjectById(id: string): Promise<void> {
  if (blocked()) return;
  const p = await storedProject(id);
  if (!p) {
    toast("This project can't be copied because it can't be opened.", "error");
    return;
  }
  const names = (await listProjects()).map((s) => s.name);
  const copy = duplicateProject(p, names);
  await putProject(copy);
  toast(`Made a copy: ${copy.name}.`);
}

export async function renameProjectById(
  id: string,
  name: string,
): Promise<void> {
  if (blocked()) return;
  const { project, edit } = useEditor.getState();
  if (id === project.id) {
    edit((d) => renameProject(d, name));
    await flushSave();
    return;
  }
  const p = await storedProject(id);
  if (!p) return;
  const renamed = structuredClone(p);
  renameProject(renamed, name);
  await putProject(renamed);
}

/**
 * Delete a project and the files only it used. If it's the open project,
 * open the most recent other one (or a new one) first.
 */
export async function deleteProjectById(id: string): Promise<void> {
  if (blocked()) return;
  if (id === useEditor.getState().project.id) {
    const other = (await listProjects()).find((s) => s.id !== id && s.ok);
    if (!other || !(await openProject(other.id))) await newProject();
  }
  await deleteProject(id);
}

// ---------------------------------------------------------------- .motion files

function safeName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, "").trim() || "Motion project"}${PROJECT_FILE_EXT}`;
}

interface SavePicker {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    name: string;
    createWritable: () => Promise<{
      write: (b: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

/**
 * Save a project, with its media and fonts, as one .motion file. Call from
 * a click: the save dialog must open before any other waiting.
 */
export async function saveProjectFile(id: string, name: string): Promise<void> {
  const picker = (window as unknown as SavePicker).showSaveFilePicker;
  let handle: Awaited<
    ReturnType<NonNullable<SavePicker["showSaveFilePicker"]>>
  > | null = null;
  if (picker) {
    try {
      handle = await picker({
        suggestedName: safeName(name),
        types: [
          {
            description: "Motion project",
            accept: { "application/zip": [PROJECT_FILE_EXT] },
          },
        ],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  const p = await storedProject(id);
  if (!p) {
    toast(
      "This project can't be saved as a file because it can't be opened.",
      "error",
    );
    return;
  }
  toast(`Preparing ${p.name}…`);
  const files: Manifest["files"] = {};
  const entries: { name: string; data: Blob }[] = [];
  const missing: string[] = [];
  const add = async (fileId: string, label: string, folder: string) => {
    const f = await loadMedia(fileId);
    if (!f) {
      missing.push(label);
      return;
    }
    files[fileId] = { name: f.name, type: f.type };
    // ASCII names (the id) so every unzip tool can extract them.
    entries.push({ name: `${folder}/${fileId}`, data: f });
  };
  for (const a of Object.values(p.assets)) await add(a.id, a.name, "media");
  for (const f of Object.values(p.fonts ?? {}))
    await add(f.id, f.family, "fonts");
  for (const l of Object.values(p.luts ?? {})) await add(l.id, l.name, "luts");

  const manifest: Manifest = {
    format: FORMAT,
    version: FILE_VERSION,
    project: p,
    files,
  };
  entries.unshift({
    name: "project.json",
    data: new Blob([JSON.stringify(manifest)], { type: "application/json" }),
  });
  const zip = await writeZip(entries);

  if (handle) {
    const out = await handle.createWritable();
    await out.write(zip);
    await out.close();
  } else {
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName(p.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  toast(
    missing.length > 0
      ? `Saved ${p.name}, but without ${missing.join(", ")} (not stored on this device).`
      : `Saved ${p.name} as a file.`,
    missing.length > 0 ? "error" : "info",
  );
}

/** Open a .motion file: store its files, then the project (as a new one). */
export async function openProjectFile(file: File): Promise<boolean> {
  if (blocked()) return false;
  let manifest: Manifest;
  let entries: { name: string; data: Blob }[];
  try {
    entries = await readZip(file);
    const json = entries.find((e) => e.name === "project.json");
    if (!json) throw new Error("This is not a Motion project file.");
    manifest = JSON.parse(await json.data.text()) as Manifest;
    if (manifest?.format !== FORMAT)
      throw new Error("This is not a Motion project file.");
    if (manifest.version > FILE_VERSION) {
      throw new Error(
        "This project file was saved by a newer version of Motion.",
      );
    }
  } catch (err) {
    toast(
      `${file.name}: ${err instanceof Error ? err.message : "couldn't be read."}`,
      "error",
    );
    return false;
  }
  const parsed = parseProject(manifest.project);
  if (!parsed.ok) {
    toast(`${file.name} can't be opened because ${parsed.reason}.`, "error");
    return false;
  }

  // Files first, so the project never points at something not stored yet.
  const failed: string[] = [];
  for (const e of entries) {
    const m = /^(media|fonts|luts)\/(.+)$/.exec(e.name);
    if (!m?.[2]) continue;
    const fileId = m[2];
    const info = manifest.files?.[fileId];
    const stored = new File([e.data], info?.name ?? fileId, {
      type: info?.type ?? "",
    });
    if (!(await saveMedia(fileId, info?.name ?? fileId, stored)))
      failed.push(info?.name ?? fileId);
  }

  const names = (await listProjects()).map((s) => s.name);
  const project = reidProject(parsed.project, names);
  try {
    await putProject(project);
  } catch (err) {
    toast(
      `Couldn't store ${project.name}: ${err instanceof Error ? err.message : ""}`,
      "error",
    );
    return false;
  }
  const opened = await openProject(project.id);
  if (opened) {
    toast(
      failed.length > 0
        ? `Opened ${project.name}, but ${failed.join(", ")} couldn't be stored on this device.`
        : `Opened ${project.name}.`,
      failed.length > 0 ? "error" : "info",
    );
  }
  return opened;
}
