/**
 * Built-in sound effects: preview them, and add them at the playhead.
 * Each effect becomes a normal audio file in the project the first time;
 * after that the same file is reused.
 */
import { appendAsset } from "@motion/core";
import {
  renderSoundEffect,
  SOUND_EFFECTS,
  soundEffectFile,
} from "@motion/media";
import { hasMedia, importFiles } from "./media.ts";
import { useEditor } from "./store.ts";

let previewCtx: AudioContext | null = null;
let previewing: AudioBufferSourceNode | null = null;
const rendered = new Map<string, AudioBuffer>();

/** Play an effect once, outside the timeline. Call from a click. */
export async function previewSoundEffect(id: string): Promise<void> {
  previewCtx ??= new AudioContext();
  void previewCtx.resume();
  let buf = rendered.get(id);
  if (!buf) {
    buf = await renderSoundEffect(id);
    rendered.set(id, buf);
  }
  previewing?.stop();
  const node = previewCtx.createBufferSource();
  node.buffer = buf;
  node.connect(previewCtx.destination);
  node.start();
  previewing = node;
}

/** Add an effect to the timeline at the playhead (on an audio track). */
export async function addSoundEffect(id: string): Promise<void> {
  const effect = SOUND_EFFECTS.find((e) => e.id === id);
  if (!effect) return;
  const { project, playhead, edit } = useEditor.getState();
  const existing = Object.values(project.assets).find(
    (a) => a.kind === "audio" && a.name === effect.name && hasMedia(a.id),
  );
  if (existing) {
    edit((d) => void appendAsset(d, existing.id, playhead));
    return;
  }
  await importFiles([await soundEffectFile(id)], { at: playhead });
}
