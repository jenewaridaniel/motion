import {
  type Layer,
  MAX_TRANSITION,
  MIN_TRANSITION,
  rootComposition,
  setTransition,
  setTransitionDuration,
  TRANSITION_KINDS,
  type TransitionKind,
  transitionLength,
  US,
} from "@motion/core";
import { useEditor } from "../state/store.ts";
import { NumberField } from "./NumberField.tsx";

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  dissolve: "Dissolve",
  dipBlack: "Dip to black",
  dipWhite: "Dip to white",
  slideLeft: "Slide left",
  slideRight: "Slide right",
  slideUp: "Slide up",
  slideDown: "Slide down",
  wipeLeft: "Wipe left",
  wipeRight: "Wipe right",
  zoom: "Zoom",
  blur: "Blur",
};

/**
 * The transition into a main-track clip from the clip before it. Shows
 * nothing for clips that can't have one (first clip, other tracks).
 */
export function TransitionControl({ layer }: { layer: Layer }) {
  const project = useEditor((s) => s.project);
  const edit = useEditor((s) => s.edit);
  const seal = useEditor((s) => s.seal);
  const track = rootComposition(project).tracks.find((t) =>
    t.layers.some((l) => l.id === layer.id),
  );
  if (!track?.magnetic) return null;
  const index = track.layers.findIndex((l) => l.id === layer.id);
  const prev = track.layers[index - 1];
  if (!prev) return null;
  const tr = layer.transition;
  const used = tr ? transitionLength(tr, prev, layer) : 0;

  return (
    <section className="border-line-soft border-b px-4 py-3">
      <h3 className="mb-0.5 font-semibold text-[11px] text-ink-soft">
        Transition
      </h3>
      <p className="mb-2 text-[11px] text-ink-faint">
        From the previous clip, centred on the cut.
      </p>
      <fieldset className="grid grid-cols-3 gap-1">
        <legend className="sr-only">Transition</legend>
        {([null, ...TRANSITION_KINDS] as (TransitionKind | null)[]).map(
          (kind) => {
            const active = (tr?.kind ?? null) === kind;
            return (
              <button
                key={kind ?? "none"}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  edit((d) => void setTransition(d, layer.id, kind))
                }
                className={`h-7 truncate rounded-md px-1 text-[11px] transition-colors ${active ? "bg-ink text-bg" : "bg-panel-2 text-ink-soft hover:text-ink"}`}
              >
                {kind ? TRANSITION_LABELS[kind] : "None"}
              </button>
            );
          },
        )}
      </fieldset>
      {tr && (
        <div className="mt-2">
          <NumberField
            label="Length"
            value={tr.duration / US}
            min={MIN_TRANSITION / US}
            max={MAX_TRANSITION / US}
            step={0.1}
            precision={1}
            unit="s"
            onChange={(v, g) =>
              edit(
                (d) =>
                  void setTransitionDuration(d, layer.id, Math.round(v * US)),
                g,
              )
            }
            onCommit={seal}
            trailing={<span className="size-7 shrink-0" />}
          />
          {used < tr.duration && (
            <p className="mt-1 text-[11px] text-ink-faint">
              Shortened to {(used / US).toFixed(1)} s to fit the clips.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
