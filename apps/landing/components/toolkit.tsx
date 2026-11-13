"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import { TRACKS } from "@/lib/content";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { Chapter } from "./brand";

const RULER = ["00:00", "00:05", "00:10", "00:15", "00:20", "00:25", "00:30"];
const RESTING = 41; // playhead position (%) when motion is reduced
const pad = (n: number) => String(n).padStart(2, "0");
const clipColor = (hue: number) =>
  ({ "--clip": `oklch(0.52 0.1 ${hue})` }) as CSSProperties;

export function Toolkit() {
  const root = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const clips = gsap.utils.toArray<HTMLElement>("[data-clip]");
      const place = (p: number) => {
        if (headRef.current)
          headRef.current.style.transform = `translateX(${p}%)`;
        const secs = (p / 100) * 30;
        if (tcRef.current) {
          tcRef.current.textContent = `00:${pad(Math.floor(secs))}:${pad(Math.floor((secs % 1) * 30))}`;
        }
        for (const c of clips) {
          const l = Number(c.dataset.l);
          const w = Number(c.dataset.w);
          c.dataset.active = String(p >= l && p <= l + w);
        }
      };

      const mm = gsap.matchMedia();
      mm.add(
        "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
        () => {
          place(0);
          ScrollTrigger.create({
            trigger: "[data-timeline]",
            start: "top 70%",
            end: "bottom 30%",
            scrub: 0.6,
            onUpdate: (self) => place(self.progress * 100),
          });
        },
      );
      mm.add("(min-width: 768px) and (prefers-reduced-motion: reduce)", () =>
        place(RESTING),
      );
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="toolkit"
      className="scroll-mt-24 bg-wine-deep py-[clamp(5.5rem,11vw,10rem)] text-on-wine"
    >
      <div className="mx-auto max-w-[88rem] px-5 md:px-10">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Chapter tc="00:24" tone="wine">
              The toolkit
            </Chapter>
            <h2 className="mt-6 text-[clamp(2.5rem,5.6vw,5.25rem)] leading-[0.95] font-semibold tracking-[-0.035em] font-semiwide">
              The whole toolkit,{" "}
              <span className="serif-em text-[1.06em] text-flare">
                on one timeline.
              </span>
            </h2>
          </div>
          <p className="max-w-[38ch] text-lg leading-relaxed text-on-wine-soft md:col-span-4 md:col-start-9">
            Every tool you would pay for in another editor, already unlocked.
            <span className="hidden md:inline">
              {" "}
              Scroll to run the playhead across it.
            </span>
          </p>
        </div>

        <div
          data-timeline
          className="mt-14 rounded-[1.75rem] bg-wine-ink p-5 ring-1 ring-wine-line md:mt-20 md:p-7"
        >
          {/* Phones: one block per track, clips wrap */}
          <div className="space-y-6 md:hidden">
            {TRACKS.map((track) => (
              <div key={track.id}>
                <p className="flex items-baseline gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{track.id}</span>
                  <span className="text-on-wine-soft">{track.name}</span>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {track.clips.map((c) => (
                    <span
                      key={c.name}
                      style={clipColor(track.hue)}
                      className="rounded-lg bg-(--clip) px-3 py-1.5 text-[0.8rem] font-medium text-on-wine"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tablets and up: a real timeline with a scroll-driven playhead */}
          <div className="hidden grid-cols-[5.5rem_1fr] gap-x-5 md:grid">
            <div>
              <div className="h-11" />
              {TRACKS.map((track) => (
                <div
                  key={track.id}
                  className="flex h-14 flex-col justify-center border-t border-wine-line"
                >
                  <span className="text-sm font-semibold tabular-nums">
                    {track.id}
                  </span>
                  <span className="text-xs text-on-wine-soft">
                    {track.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="relative">
              <div className="h-11">
                <div className="relative h-5 text-xs font-medium text-on-wine-soft tabular-nums">
                  {RULER.map((t, i) => (
                    <span
                      key={t}
                      className="absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                      style={{ left: `${(i / (RULER.length - 1)) * 100}%` }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-2 h-2 bg-[repeating-linear-gradient(to_right,oklch(0.8_0.045_350/0.35)_0_1px,transparent_1px_calc(100%/30))]" />
              </div>

              {TRACKS.map((track) => (
                <div
                  key={track.id}
                  className="relative h-14 border-t border-wine-line"
                >
                  {track.clips.map((c) => (
                    <span
                      key={c.name}
                      data-clip
                      data-l={c.l}
                      data-w={c.w}
                      data-active="false"
                      style={{
                        ...clipColor(track.hue),
                        left: `${c.l}%`,
                        width: `calc(${c.w}% - 4px)`,
                      }}
                      className="absolute inset-y-2 flex items-center overflow-hidden rounded-lg bg-(--clip) px-3 text-[0.8rem] font-medium whitespace-nowrap text-on-wine opacity-65 ring-flare transition-[opacity,box-shadow] duration-300 data-[active=true]:opacity-100 data-[active=true]:ring-2"
                    >
                      <span className="truncate">{c.name}</span>
                    </span>
                  ))}
                </div>
              ))}

              {/* Playhead: the wrapper is lane-wide, so translateX(p%) maps to timeline position */}
              <div
                ref={headRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 will-change-transform"
              >
                <div className="absolute inset-y-0 left-0 flex -translate-x-1/2 flex-col items-center">
                  <span
                    ref={tcRef}
                    className="mt-[1.6rem] rounded-full bg-flare px-2 py-0.5 text-[0.7rem] font-semibold text-wine-ink tabular-nums"
                  >
                    00:00:00
                  </span>
                  <span className="w-[2px] flex-1 bg-flare" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
