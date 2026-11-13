"use client";

import Image from "next/image";
import { useRef } from "react";
import { ARCHES } from "@/lib/content";
import { gsap, useGSAP } from "@/lib/gsap";
import { Chapter } from "./brand";

const LETTERS = Array.from("UNLOCKED", (ch, i) => ({ ch, id: `${ch}${i}` }));
// Staggered drop for each arch on large screens, so the row reads as a rhythm, not a grid.
const DROPS = ["lg:mt-0", "lg:mt-28", "lg:mt-10", "lg:mt-36", "lg:mt-16"];

export function Unlocked() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-letter]",
          { yPercent: 105 },
          {
            yPercent: 0,
            stagger: 0.045,
            duration: 1.2,
            ease: "expo.out",
            scrollTrigger: { trigger: "[data-giant]", start: "top 85%" },
          },
        );
        gsap.fromTo(
          "[data-arch]",
          { y: 140, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            stagger: 0.09,
            duration: 1.4,
            ease: "expo.out",
            scrollTrigger: { trigger: "[data-arches]", start: "top 88%" },
          },
        );
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="relative overflow-hidden pt-8 pb-[clamp(6rem,12vw,11rem)]"
    >
      <div className="mx-auto max-w-[88rem] px-5 md:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <Chapter tc="00:16">Unlocked</Chapter>
          <p className="max-w-[34ch] text-lg leading-relaxed text-ink-soft md:text-right">
            Nothing sits behind a paywall. Every one of these is yours from the
            first click.
          </p>
        </div>
      </div>

      <h2
        data-giant
        aria-label="Unlocked"
        className="mt-6 flex justify-center overflow-hidden text-[clamp(2.25rem,13.2vw,15rem)] leading-[0.82] font-extrabold tracking-[-0.03em] text-wine select-none font-wide"
      >
        {LETTERS.map(({ ch, id }) => (
          <span
            key={id}
            data-letter
            aria-hidden="true"
            className="inline-block"
          >
            {ch}
          </span>
        ))}
      </h2>

      <ul
        data-arches
        className="relative z-10 mt-2 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] md:px-10 lg:mx-auto lg:-mt-[7vw] lg:grid lg:max-w-[88rem] lg:snap-none lg:grid-cols-5 lg:gap-6 lg:overflow-visible"
      >
        {ARCHES.map((a, i) => (
          <li
            key={a.label}
            data-reveal
            data-arch
            className={`w-[64vw] max-w-[17rem] shrink-0 snap-center sm:w-[40vw] lg:w-auto lg:max-w-none ${DROPS[i]}`}
          >
            <div className="overflow-hidden rounded-t-full rounded-b-[1.75rem] bg-wine-deep ring-[6px] ring-paper shadow-[0_30px_60px_-34px_oklch(0.25_0.08_358/0.7)]">
              <Image
                src={a.src}
                alt={a.alt}
                width={760}
                height={1040}
                className="aspect-[3/4] w-full object-cover transition-transform duration-700 ease-out-expo hover:scale-[1.04]"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <span className="pt-[0.2em] text-sm font-medium text-ink-soft tabular-nums">
                0{i + 1}
              </span>
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink font-semiwide">
                  {a.label}
                </h3>
                <p className="mt-1 leading-snug text-ink-soft">{a.line}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
