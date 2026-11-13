import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

/**
 * The mark: a lowercase "m" whose middle stroke is a coral playhead.
 * Same artwork as app/icon.svg and public/brand/motion-mark.svg.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={className}>
      <rect width="64" height="64" rx="15" fill="var(--color-wine-deep)" />
      <path
        d="M17 50V32.5a7.5 7.5 0 0 1 15 0M32 32.5a7.5 7.5 0 0 1 15 0V50"
        fill="none"
        stroke="var(--color-on-wine)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 22v28"
        stroke="var(--color-flare)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M26 9.5h12v4.5l-6 6-6-6z"
        fill="var(--color-flare)"
        stroke="var(--color-flare)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Lockup for navigation: mark plus the name. The playhead appears once, in the mark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.4em] ${className}`}>
      <Mark className="size-[1.45em] shrink-0" />
      <span className="font-semibold tracking-[-0.04em] font-semiwide">
        motion
      </span>
      <span className="sr-only">{SITE.name}</span>
    </span>
  );
}

/** Expressive wordmark: the playhead stands in for the "i". Used large, in the footer. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-semibold tracking-[-0.04em] font-semiwide ${className}`}
    >
      mot
      <svg
        aria-hidden="true"
        viewBox="0 0 10 28"
        className="mx-[0.015em] h-[0.92em] w-[0.33em] self-center fill-flare"
      >
        <path d="M0 0h10v5L5 9 0 5z" />
        <rect x="4" y="8" width="2" height="20" rx="1" />
      </svg>
      on
      <span className="sr-only">{SITE.name}</span>
    </span>
  );
}

/** Chapter marker: the page's section label system, styled as a timeline marker. */
export function Chapter({
  tc,
  children,
  tone = "paper",
}: {
  tc: string;
  children: ReactNode;
  tone?: "paper" | "wine";
}) {
  const soft = tone === "wine" ? "text-on-wine-soft" : "text-ink-soft";
  return (
    <p className="flex items-center gap-3 text-sm font-medium">
      <svg
        aria-hidden="true"
        viewBox="0 0 10 12"
        className="h-3 w-2.5 fill-flare"
      >
        <path d="M0 0h10v7l-5 5-5-5z" />
      </svg>
      <span className={`tabular-nums ${soft}`}>{tc}</span>
      <span className={`h-px w-8 bg-current opacity-25 ${soft}`} />
      <span>{children}</span>
    </p>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-4 ${className}`}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function PrimaryLink({
  href,
  children,
  tone = "wine",
}: {
  href: string;
  children: ReactNode;
  tone?: "wine" | "flare";
}) {
  const colors =
    tone === "flare"
      ? "bg-flare text-wine-ink hover:bg-on-wine"
      : "bg-wine text-on-wine hover:bg-wine-deep";
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-3 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold transition-colors duration-300 ${colors}`}
    >
      {children}
      <Arrow className="transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
    </a>
  );
}
