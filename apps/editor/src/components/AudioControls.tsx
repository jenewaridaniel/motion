import {
  type Asset,
  extractAudio,
  MAX_AUDIO_FADE,
  type MediaLayer,
  rootComposition,
  setAudioFade,
  US,
} from "@motion/core";
import { useEditor } from "../state/store.ts";
import { NumberField } from "./NumberField.tsx";

/** Sound fades and "extract audio" for a clip with sound. */
export function AudioControls({
  layer,
  asset,
}: {
  layer: MediaLayer;
  asset: Asset;
}) {
  const project = useEditor((s) => s.project);
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const toast = useEditor((s) => s.toast);
  const select = useEditor((s) => s.select);
  const onVisualTrack = rootComposition(project).tracks.some(
    (t) => t.kind === "visual" && t.layers.some((l) => l.id === layer.id),
  );
  const fadeField = (edge: "in" | "out", label: string) => (
    <NumberField
      label={label}
      value={(layer.fade?.[edge] ?? 0) / US}
      min={0}
      max={MAX_AUDIO_FADE / US}
      step={0.1}
      precision={1}
      unit="s"
      onChange={(v, g) =>
        edit((d) => void setAudioFade(d, layer.id, edge, Math.round(v * US)), g)
      }
      onCommit={seal}
      trailing={<span className="size-7 shrink-0" />}
    />
  );

  return (
    <>
      {fadeField("in", "Fade in")}
      {fadeField("out", "Fade out")}
      {asset.kind === "video" && onVisualTrack && (
        <button
          type="button"
          onClick={() => {
            let id: string | null = null;
            edit((d) => {
              id = extractAudio(d, layer.id);
            });
            if (id) {
              select(id);
              toast(
                "The sound is now its own clip on an audio track. The video clip is muted.",
              );
            } else {
              toast(
                "This clip's sound is already off, so there's nothing to extract.",
              );
            }
          }}
          className="mt-2 h-7 w-full rounded-md bg-panel-2 text-[12px] text-ink-soft transition-colors hover:bg-raised hover:text-ink"
        >
          Extract audio
        </button>
      )}
    </>
  );
}
