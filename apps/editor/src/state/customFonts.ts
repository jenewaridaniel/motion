/**
 * Fonts the user adds from their own files. Each is registered with the
 * browser (so preview and export can draw it) and its file is stored on the
 * device, like imported media, so it comes back after a reload.
 */
import { addFont, type FontAsset, newId } from "@motion/core";
import { FONTS } from "../lib/fonts.ts";
import { loadMedia, saveMedia } from "./storage.ts";
import { useEditor } from "./store.ts";

export const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2";
export const isFontFile = (f: File) => /\.(ttf|otf|woff2?)$/i.test(f.name);

const registered = new Set<string>();

/**
 * Register `file` with the browser as `family`. Throws if the file isn't a
 * font the browser can read, before anything is added to the project.
 */
async function register(family: string, file: File): Promise<void> {
  if (registered.has(family)) return;
  const face = new FontFace(family, await file.arrayBuffer(), {
    // One file serves every weight: no faked bold on top of a bold file.
    weight: "100 900",
    style: "normal",
  });
  await face.load();
  document.fonts.add(face);
  registered.add(family);
}

/** "Brand-Sans_Bold.otf" → "Brand Sans Bold", made unique in the project. */
function familyFor(fileName: string, taken: Set<string>): string {
  const base =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "My font";
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  return name;
}

/** Add font files to the project. Returns the families added, in order. */
export async function importFonts(files: File[]): Promise<string[]> {
  const { toast } = useEditor.getState();
  const added: string[] = [];
  for (const file of files) {
    const { project, edit } = useEditor.getState();

    // The same file as a project font that failed to load: reconnect it under
    // its existing name, so the text using it works again.
    const missing = Object.values(project.fonts ?? {}).find(
      (f) => f.fileName === file.name && !registered.has(f.family),
    );
    if (missing) {
      try {
        await register(missing.family, file);
      } catch (err) {
        console.error("[motion] font", err);
        toast(`${file.name} isn't a font this browser can read.`, "error");
        continue;
      }
      void saveMedia(missing.id, missing.family, file);
      useEditor.getState().mediaChanged();
      toast(`Reconnected ${missing.family}.`);
      continue;
    }

    const taken = new Set(
      [
        ...FONTS.map((f) => f.family),
        ...Object.values(project.fonts ?? {}).map((f) => f.family),
      ].map((f) => f.toLowerCase()),
    );
    const font: FontAsset = {
      id: newId(),
      family: familyFor(file.name, taken),
      fileName: file.name,
    };
    try {
      await register(font.family, file);
    } catch (err) {
      console.error("[motion] font", err);
      toast(`${file.name} isn't a font this browser can read.`, "error");
      continue;
    }
    void saveMedia(font.id, font.family, file);
    edit((d) => addFont(d, font));
    added.push(font.family);
  }
  if (added.length > 0) {
    toast(
      `Added ${added.join(", ")}. Pick it from the Font menu. Only use fonts you have the right to use.`,
    );
  }
  return added;
}

/** Register a restored project's fonts. Returns the families that are missing. */
export async function restoreFonts(fonts: FontAsset[]): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    fonts.map(async (f) => {
      try {
        const file = await loadMedia(f.id);
        if (!file) throw new Error("not stored");
        await register(f.family, file);
      } catch (err) {
        console.warn("[motion] restore font", f.family, err);
        missing.push(f.family);
      }
    }),
  );
  return missing;
}
