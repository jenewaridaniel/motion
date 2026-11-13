import { addOverlay, appendAsset, formatSeconds } from "@motion/core";
import { SOUND_EFFECTS } from "@motion/media";
import { useRef } from "react";
import { ACCEPT, hasMedia, importFiles } from "../state/media.ts";
import { addSoundEffect, previewSoundEffect } from "../state/sounds.ts";
import { useEditor } from "../state/store.ts";
import {
  ImageIcon,
  LayersIcon,
  MusicIcon,
  PlayIcon,
  PlusIcon,
  VideoIcon,
} from "./icons.tsx";

export function MediaBin({ inSheet = false }: { inSheet?: boolean }) {
  const assets = useEditor((s) => s.project.assets);
  // Re-render when a missing file is reconnected (hasMedia changes).
  useEditor((s) => s.mediaVersion);
  const importing = useEditor((s) => s.importing);
  const edit = useEditor((s) => s.edit);
  const input = useRef<HTMLInputElement>(null);
  const list = Object.values(assets);

  return (
    <aside
      aria-label="Media"
      className={
        inSheet
          ? "flex min-h-64 flex-col bg-panel"
          : "flex w-64 shrink-0 flex-col border-line border-r bg-panel"
      }
    >
      <div className="flex items-center justify-between border-line-soft border-b px-4 py-3">
        <h2 className="font-semibold text-ink">Media</h2>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-7 items-center gap-1.5 rounded-full bg-wine px-3 font-semibold text-[12px] text-ink transition-colors hover:bg-wine-hi"
        >
          <PlusIcon width={13} height={13} />
          Import
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-0.5 p-2">
          {list.map((a) => {
            const Icon =
              a.kind === "image"
                ? ImageIcon
                : a.kind === "audio"
                  ? MusicIcon
                  : VideoIcon;
            return (
              <li
                key={a.id}
                className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-panel-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded bg-raised text-ink-soft">
                  <Icon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{a.name}</span>
                  {hasMedia(a.id) ? (
                    <span className="tabular block text-[11px] text-ink-faint">
                      {a.kind === "image" ? "Photo" : formatSeconds(a.duration)}
                      {a.width > 0 && ` · ${a.width}×${a.height}`}
                    </span>
                  ) : (
                    <span className="block text-[11px] text-danger">
                      File missing. Import it again.
                    </span>
                  )}
                </span>
                <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                  <button
                    type="button"
                    title="Add to timeline"
                    aria-label={`Add ${a.name} to timeline`}
                    onClick={() => {
                      const { playhead } = useEditor.getState();
                      edit((d) => void appendAsset(d, a.id, playhead));
                    }}
                    className="grid size-7 place-items-center rounded text-ink-soft hover:bg-raised hover:text-ink"
                  >
                    <PlusIcon width={14} height={14} />
                  </button>
                  {a.kind !== "audio" && (
                    <button
                      type="button"
                      title="Add as overlay at playhead"
                      aria-label={`Add ${a.name} as an overlay`}
                      onClick={() => {
                        const { playhead } = useEditor.getState();
                        edit((d) => void addOverlay(d, a.id, playhead));
                      }}
                      className="grid size-7 place-items-center rounded text-ink-soft hover:bg-raised hover:text-ink"
                    >
                      <LayersIcon width={14} height={14} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {importing > 0 && (
            <li className="flex items-center gap-2.5 px-2 py-2 text-ink-faint">
              <span className="size-8 animate-pulse rounded bg-raised" />
              Reading {importing} file{importing > 1 ? "s" : ""}…
            </li>
          )}
          {list.length === 0 && importing === 0 && (
            <li className="px-2 py-6 text-center text-ink-faint leading-relaxed">
              Import videos, photos, music or captions (.srt).
              <br />
              Files stay on your device.
            </li>
          )}
        </ul>
        <SoundEffects />
      </div>
    </aside>
  );
}

/** Built-in sound effects: listen, then add at the playhead. */
function SoundEffects() {
  return (
    <section
      aria-label="Sound effects"
      className="border-line-soft border-t p-2"
    >
      <h3 className="px-2 pt-1 pb-1.5 font-semibold text-[11px] text-ink-soft">
        Sound effects
      </h3>
      <ul className="flex flex-col gap-0.5">
        {SOUND_EFFECTS.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2 hover:bg-panel-2"
          >
            <span className="min-w-0 flex-1 truncate text-ink">{e.name}</span>
            <span className="tabular text-[11px] text-ink-faint">
              {e.duration.toFixed(1)}s
            </span>
            <button
              type="button"
              title="Listen"
              aria-label={`Listen to ${e.name}`}
              onClick={() => void previewSoundEffect(e.id)}
              className="grid size-7 place-items-center rounded text-ink-soft hover:bg-raised hover:text-ink"
            >
              <PlayIcon width={12} height={12} />
            </button>
            <button
              type="button"
              title="Add at the playhead"
              aria-label={`Add ${e.name} at the playhead`}
              onClick={() => void addSoundEffect(e.id)}
              className="grid size-7 place-items-center rounded text-ink-soft hover:bg-raised hover:text-ink"
            >
              <PlusIcon width={14} height={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
