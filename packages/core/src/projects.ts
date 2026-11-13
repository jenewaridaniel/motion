/** Helpers for the list of projects kept on the device. */
import {
  compositionDuration,
  type Id,
  newId,
  type Project,
  rootComposition,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import type { Micros } from "./time.ts";

/** A copy with its own id. Media is shared by asset id, so files aren't copied. */
export function duplicateProject(
  p: Project,
  takenNames: string[] = [],
): Project {
  const copy = structuredClone(p);
  copy.id = newId();
  copy.name = uniqueName(`${p.name} copy`, takenNames);
  return copy;
}

/** The first of `base`, `base 2`, `base 3`… not in `taken` (ignoring case). */
function uniqueName(base: string, takenNames: string[]): string {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  return name;
}

/**
 * A project from a file gets a new id, so it can't overwrite one already
 * here, and a numbered name if one with its name exists.
 */
export function reidProject(p: Project, takenNames: string[] = []): Project {
  return { ...p, id: newId(), name: uniqueName(p.name, takenNames) };
}

export interface ProjectSummary {
  id: Id;
  name: string;
  savedAt: number;
  /** False if the project can't be opened by this version. */
  ok: boolean;
  problem?: string;
  duration: Micros;
  width: number;
  height: number;
  clips: number;
}

/** What the project list shows. Never throws, even for a damaged record. */
export function projectSummary(raw: unknown, savedAt: number): ProjectSummary {
  const parsed = parseProject(raw);
  if (!parsed.ok) {
    const obj = (typeof raw === "object" && raw !== null ? raw : {}) as {
      id?: unknown;
      name?: unknown;
    };
    return {
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "Untitled project",
      savedAt,
      ok: false,
      problem: parsed.reason,
      duration: 0,
      width: 0,
      height: 0,
      clips: 0,
    };
  }
  const p = parsed.project;
  const comp = rootComposition(p);
  return {
    id: p.id,
    name: p.name,
    savedAt,
    ok: true,
    duration: compositionDuration(comp),
    width: comp.width,
    height: comp.height,
    clips: comp.tracks.reduce((n, t) => n + t.layers.length, 0),
  };
}
