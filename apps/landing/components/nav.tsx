"use client";

import { useState } from "react";
import { NAV_LINKS, SITE } from "@/lib/site";
import { Logo } from "./brand";

export function Nav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 md:top-5">
      <nav
        aria-label="Main"
        className="flex w-full max-w-3xl items-center justify-between gap-4 rounded-full bg-paper py-2 pr-2 pl-5 shadow-[0_10px_30px_-18px_oklch(0.3_0.08_358/0.45)] ring-1 ring-line"
      >
        <a
          href="#top"
          className="text-[1.3rem] text-ink"
          aria-label={`${SITE.name} home`}
        >
          <Logo />
        </a>
        <ul className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-wine">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href={SITE.editorUrl}
          className="hidden rounded-full bg-wine px-4 py-2.5 text-sm font-semibold text-on-wine transition-colors hover:bg-wine-deep md:inline-flex"
        >
          Start editing
        </a>
        <div className="relative md:hidden">
          <button
            type="button"
            aria-label={
              isMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-ink transition-colors hover:bg-paper-2"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className={`size-5 ${isMenuOpen ? "hidden" : ""}`}
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className={`size-5 ${isMenuOpen ? "" : "hidden"}`}
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
          <div
            id="mobile-nav"
            hidden={!isMenuOpen}
            className="absolute right-0 top-[calc(100%+0.75rem)] w-60 rounded-3xl bg-paper p-4 shadow-[0_10px_30px_-18px_oklch(0.3_0.08_358/0.45)] ring-1 ring-line"
          >
            <ul className="space-y-1 text-sm font-medium text-ink-soft">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-paper-2 hover:text-wine"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={SITE.editorUrl}
              onClick={() => setIsMenuOpen(false)}
              className="mt-3 flex justify-center rounded-full bg-wine px-4 py-2.5 text-sm font-semibold text-on-wine transition-colors hover:bg-wine-deep"
            >
              Start editing
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
