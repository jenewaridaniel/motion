import {
  applyPatches,
  enablePatches,
  type Patch,
  produceWithPatches,
} from "immer";
import type { Project } from "./model.ts";

enablePatches();

interface Entry {
  patches: Patch[];
  inverse: Patch[];
  mergeKey?: string;
}

/**
 * Undo/redo over Immer patches. Pass the same `mergeKey` for every step of a
 * gesture (a drag, a scrub on a number) and it becomes a single undo step.
 */
export class History {
  private past: Entry[] = [];
  private future: Entry[] = [];
  /** Set after undo/redo so the next edit never merges into an older entry. */
  private sealed = false;

  constructor(private readonly limit = 300) {}

  apply(
    project: Project,
    recipe: (draft: Project) => void,
    mergeKey?: string,
  ): Project {
    const [next, patches, inverse] = produceWithPatches(project, recipe);
    if (patches.length === 0) return project;
    const last = this.past[this.past.length - 1];
    if (mergeKey && !this.sealed && last?.mergeKey === mergeKey) {
      last.patches = last.patches.concat(patches);
      last.inverse = inverse.concat(last.inverse);
    } else {
      this.past.push({ patches, inverse, mergeKey });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.sealed = false;
    return next;
  }

  /** Close the current merge group, so the next edit starts a new undo step. */
  seal(): void {
    this.sealed = true;
  }

  undo(project: Project): Project {
    const entry = this.past.pop();
    if (!entry) return project;
    this.future.push(entry);
    this.sealed = true;
    return applyPatches(project, entry.inverse);
  }

  redo(project: Project): Project {
    const entry = this.future.pop();
    if (!entry) return project;
    this.past.push(entry);
    this.sealed = true;
    return applyPatches(project, entry.patches);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
