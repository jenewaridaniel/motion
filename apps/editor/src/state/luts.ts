/**
 * LUT files (.cube) the user adds. Parsed tables live here, by id, for the
 * preview and export; the files themselves are stored like media.
 */
import {
  addLut,
  type CubeLut,
  type LutAsset,
  newId,
  parseCube,
} from "@motion/core";
import { loadMedia, saveMedia } from "./storage.ts";
import { useEditor } from "./store.ts";

export const isLutFile = (f: File) => /\.cube$/i.test(f.name);

const tables = new Map<string, CubeLut>();

/** Parsed LUTs by id. Read-only for drawing. */
export const lutTables: ReadonlyMap<string, CubeLut> = tables;

/** Add .cube files to the project. Returns the ids added. */
export async function importLuts(
  files: File[],
  { forClip = false }: { forClip?: boolean } = {},
): Promise<string[]> {
  const { toast } = useEditor.getState();
  const added: string[] = [];
  let fresh = 0;
  for (const file of files) {
    let table: CubeLut;
    try {
      table = parseCube(await file.text());
    } catch (err) {
      toast(
        `${file.name}: ${err instanceof Error ? err.message : "isn't a LUT we can read."}`,
        "error",
      );
      continue;
    }
    // The same file as a project LUT that failed to load: reconnect it, so
    // the clips using it work again (instead of adding a second copy).
    const missing = Object.values(useEditor.getState().project.luts ?? {}).find(
      (l) => l.fileName === file.name && !tables.has(l.id),
    );
    if (missing) {
      tables.set(missing.id, table);
      void saveMedia(missing.id, missing.name, file);
      useEditor.getState().mediaChanged();
      toast(`Reconnected ${missing.name}.`);
      added.push(missing.id);
      continue;
    }
    const lut: LutAsset = {
      id: newId(),
      name: table.title || file.name.replace(/\.cube$/i, ""),
      fileName: file.name,
    };
    tables.set(lut.id, table);
    // Same as media and fonts: storage reports its own failures.
    void saveMedia(lut.id, lut.name, file);
    useEditor.getState().edit((d) => void addLut(d, lut));
    added.push(lut.id);
    fresh++;
  }
  if (fresh > 0) {
    useEditor.getState().mediaChanged();
    // From a clip's LUT menu it's applied straight away; say where to find it otherwise.
    toast(
      forClip
        ? `Added the LUT.`
        : `Added ${fresh} LUT${fresh > 1 ? "s" : ""}. Choose it in a clip's Color section.`,
    );
  }
  return added;
}

/** Load a project's stored LUTs. Returns the names of any that are missing. */
export async function restoreLuts(luts: LutAsset[]): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    luts.map(async (l) => {
      if (tables.has(l.id)) return;
      try {
        const file = await loadMedia(l.id);
        if (!file) throw new Error("not stored");
        tables.set(l.id, parseCube(await file.text()));
      } catch (err) {
        console.warn("[motion] restore LUT", l.name, err);
        missing.push(l.name);
      }
    }),
  );
  return missing;
}
