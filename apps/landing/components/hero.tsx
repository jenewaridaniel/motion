"use client";

import { Fragment, useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { SITE } from "@/lib/site";
import { PrimaryLink } from "./brand";
import { ClipReel } from "./clip-reel";

function Line({ words, serif = false }: { words: string[]; serif?: boolean }) {
  return (
    <span className="block">
      {words.map((w, i) => (
        <Fragment key={w}>
          <span className="-mb-[0.12em] -ml-[0.1em] inline-block overflow-hidden pr-[0.08em] pb-[0.12em] pl-[0.1em] align-bottom">
            <span
              data-reveal
              data-hero-word
              className={`inline-block ${serif ? "serif-em text-[1.08em] leading-[0.85] text-wine" : ""}`}
            >
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          defaults: { ease: "expo.out", duration: 1.3 },
        });
        tl.fromTo(
          "[data-hero-kicker]",
          { y: 14, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.9 },
          0.1,
        )
          .fromTo(
            "[data-hero-word]",
            { yPercent: 115, autoAlpha: 1 },
            { yPercent: 0, stagger: 0.07 },
            0.15,
          )
          .fromTo(
            "[data-hero-fade]",
            { y: 22, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, stagger: 0.1, duration: 1.1 },
            0.55,
          )
          .fromTo(
            "[data-hero-reel]",
            { y: 90, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 1.8 },
            0.45,
          );
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="top" className="relative pt-28 pb-10 md:pt-36">
      <div className="mx-auto max-w-[88rem] px-5 md:px-10">
        <p
          data-reveal
          data-hero-kicker
          className="flex items-center gap-2.5 text-sm font-medium text-ink-soft"
        >
          <span className="size-2.5 rounded-full bg-flare motion-safe:animate-pulse" />
          Free video editor, right in your browser
        </p>

        <h1 className="mt-6 text-[clamp(3.1rem,8.6vw,9rem)] leading-[0.9] font-semibold tracking-[-0.04em] text-ink font-semiwide">
          <Line words={["Every", "pro", "tool."]} />
          <Line words={["Zero", "watermark."]} serif />
        </h1>

        <div className="mt-10 grid gap-8 md:mt-12 md:grid-cols-12 md:items-end">
          <p
            data-reveal
            data-hero-fade
            className="max-w-[40ch] text-lg leading-relaxed text-ink-soft md:col-span-5"
          >
            Cut, color, caption and export in 4K at 60fps. No subscription, no
            logo stamped on your work, and nothing to download from an app
            store.
          </p>
          <div
            data-reveal
            data-hero-fade
            className="flex flex-wrap items-center gap-x-6 gap-y-3 md:col-span-6 md:col-start-7 md:justify-end"
          >
            <PrimaryLink href={SITE.editorUrl}>Start editing free</PrimaryLink>
            <a
              href="#toolkit"
              className="text-[0.95rem] font-semibold text-wine underline decoration-wine/30 decoration-2 underline-offset-[6px] transition-colors hover:decoration-wine"
            >
              See every tool
            </a>
          </div>
        </div>
      </div>

      <div data-reveal data-hero-reel className="mt-10 md:mt-14">
        <ClipReel />
      </div>
    </section>
  );
}
