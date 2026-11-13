"use client";

import Image from "next/image";
import { Fragment, useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

// Segments of the manifesto; `em` segments render in the italic serif.
const TEXT: { t: string; em?: boolean }[] = [
  { t: "Most editors hand you the basics, lock the" },
  { t: "good stuff", em: true },
  {
    t: "behind a paywall, then stamp their logo on your export. Motion gives you",
  },
  { t: "every tool", em: true },
  { t: "from the first click, renders on" },
  { t: "your own device,", em: true },
  { t: "and hands back a file that is" },
  { t: "entirely yours.", em: true },
];

export function Manifesto() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-word]",
          { opacity: 0.16 },
          {
            opacity: 1,
            stagger: 0.05,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-words]",
              start: "top 78%",
              end: "bottom 50%",
              scrub: 0.5,
            },
          },
        );
        gsap.utils.toArray<HTMLElement>("[data-flank]").forEach((el, i) => {
          gsap.fromTo(
            el,
            { y: 60, rotate: i === 0 ? -14 : 12 },
            {
              y: -40,
              rotate: i === 0 ? -7 : 6,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            },
          );
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative py-[clamp(6rem,14vw,12rem)]">
      <div className="relative mx-auto max-w-[88rem] px-5 md:px-10">
        <Image
          data-flank
          src="/media/flank-laptop.webp"
          alt="Two friends laughing over a laptop at a cafe table"
          width={420}
          height={520}
          className="absolute top-0 left-[3%] hidden w-[clamp(7rem,11vw,10.5rem)] -rotate-7 rounded-xl shadow-[0_24px_50px_-24px_oklch(0.25_0.08_358/0.55)] ring-4 ring-paper lg:block"
        />
        <Image
          data-flank
          src="/media/flank-portrait.webp"
          alt="Young man with tousled hair looking into the lens"
          width={420}
          height={520}
          className="absolute right-[4%] bottom-0 hidden w-[clamp(7rem,10vw,9.5rem)] rotate-6 rounded-xl shadow-[0_24px_50px_-24px_oklch(0.25_0.08_358/0.55)] ring-4 ring-paper lg:block"
        />

        <p
          data-words
          className="mx-auto max-w-[30ch] text-center text-[clamp(1.6rem,3.4vw,3.1rem)] leading-[1.18] font-medium tracking-[-0.025em] text-ink"
        >
          {TEXT.map((seg, si) => (
            <Fragment key={seg.t}>
              {seg.t.split(" ").map((w, wi) => (
                <Fragment key={`${si}-${wi}-${w}`}>
                  <span
                    data-word
                    className={
                      seg.em ? "serif-em text-[1.06em] text-wine" : undefined
                    }
                  >
                    {w}
                  </span>{" "}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </p>
      </div>
    </section>
  );
}
