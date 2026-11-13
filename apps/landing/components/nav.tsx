import { NAV_LINKS, SITE } from "@/lib/site";
import { Logo } from "./brand";

export function Nav() {
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
          className="rounded-full bg-wine px-4 py-2.5 text-sm font-semibold text-on-wine transition-colors hover:bg-wine-deep"
        >
          Start editing
        </a>
      </nav>
    </header>
  );
}
