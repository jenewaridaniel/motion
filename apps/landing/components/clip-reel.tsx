"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { CLIPS } from "@/lib/content";

const FPS = 30;
const SPEED = 36; // reel drift, px per second
const MAX_ANGLE = 1.2; // radians; cards beyond this are hidden

const pad = (n: number) => String(n).padStart(2, "0");
function timecode(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * FPS);
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}

/**
 * A slowly drifting reel of vertical clips bent around a cylinder, with a
 * playhead fixed at the centre. Drag to scrub. Motion pauses off screen and
 * respects prefers-reduced-motion (no auto drift, drag still works).
 */
export function ClipReel() {
  const stageRef = useRef<HTMLDivElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const cards = Array.from(
      stage.querySelectorAll<HTMLElement>("[data-card]"),
    );
    const bars = cards.map((c) => c.querySelector<HTMLElement>("[data-bar]"));
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let gap = 0;
    let total = 0;
    let radius = 0;
    let offset = 0;
    let velocity = 0;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let prev = performance.now();
    let raf = 0;
    let lastTc = "";

    const measure = () => {
      const w = cards[0]?.offsetWidth ?? 200;
      gap = w * 1.16;
      total = gap * cards.length;
      radius = Math.min(
        Math.max(stage.offsetWidth * 0.9, w * 4.5),
        total / 2 / (MAX_ANGLE + 0.04),
      );
    };

    const render = () => {
      for (let i = 0; i < cards.length; i++) {
        const x = ((((i * gap - offset) % total) + total) % total) - total / 2;
        const theta = x / radius;
        const tx = radius * Math.sin(theta);
        const tz = radius * (Math.cos(theta) - 1);
        const card = cards[i];
        card.style.transform = `translate3d(${tx.toFixed(1)}px,0,${tz.toFixed(1)}px) rotateY(${theta.toFixed(4)}rad)`;
        card.style.opacity = String(
          Math.min(1, Math.max(0, (MAX_ANGLE - Math.abs(theta)) * 2.2)),
        );
        const played = Math.min(1, Math.max(0, 0.5 - x / gap));
        const bar = bars[i];
        if (bar) bar.style.transform = `scaleX(${played.toFixed(3)})`;
      }
      const tc = timecode((((offset % total) + total) % total) / SPEED);
      if (tc !== lastTc && tcRef.current) {
        tcRef.current.textContent = tc;
        lastTc = tc;
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!dragging) {
        if (!reduce) offset += SPEED * dt;
        offset += velocity * dt;
        velocity *= 0.04 ** dt;
        if (Math.abs(velocity) < 2) velocity = 0;
      }
      render();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (raf) return;
      prev = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      velocity = 0;
      lastX = e.clientX;
      lastT = performance.now();
      stage.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      offset -= dx;
      velocity = (-dx / Math.max(1, now - lastT)) * 1000;
      lastX = e.clientX;
      lastT = now;
    };
    const onUp = () => {
      dragging = false;
      velocity = Math.max(-2400, Math.min(2400, velocity));
    };

    measure();
    render();
    const io = new IntersectionObserver(([entry]) =>
      entry.isIntersecting ? start() : stop(),
    );
    io.observe(stage);
    const ro = new ResizeObserver(() => {
      measure();
      render();
    });
    ro.observe(stage);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="relative [--card-w:clamp(8.75rem,15vw,14.5rem)]">
      <div
        ref={stageRef}
        role="img"
        aria-label="A reel of vertical video clips drifting past a playhead. Drag to scrub."
        className="relative h-[calc(var(--card-w)*16/9+3.5rem)] cursor-grab touch-pan-y select-none [perspective:1700px] active:cursor-grabbing"
      >
        {CLIPS.map((clip, i) => (
          <figure
            key={clip.src}
            data-card
            className="absolute top-7 left-1/2 ml-[calc(var(--card-w)/-2)] aspect-[9/16] w-[var(--card-w)] overflow-hidden rounded-[1.35rem] bg-wine-deep shadow-[0_30px_60px_-30px_oklch(0.25_0.08_358/0.6)] [backface-visibility:hidden] will-change-transform"
          >
            <Image
              src={clip.src}
              alt={clip.alt}
              width={640}
              height={1138}
              draggable={false}
              loading={i < 7 ? "eager" : "lazy"}
              className="pointer-events-none size-full object-cover"
            />
            <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-linear-to-t from-wine-ink/75 to-transparent px-3 pt-10 pb-3 text-[0.7rem] font-medium text-on-wine tabular-nums">
              <span className="flex justify-between">
                <span>Clip {pad(i + 1)}</span>
                <span className="opacity-75">{clip.length}</span>
              </span>
              <span className="h-[3px] overflow-hidden rounded-full bg-on-wine/25">
                <span
                  data-bar
                  className="block h-full origin-left scale-x-0 rounded-full bg-flare"
                />
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Playhead */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center"
      >
        <span
          ref={tcRef}
          className="rounded-full bg-flare px-2.5 py-1 text-[0.7rem] font-semibold text-wine-ink tabular-nums"
        >
          00:00:00
        </span>
        <span className="w-[2px] flex-1 bg-flare" />
      </div>
    </div>
  );
}
