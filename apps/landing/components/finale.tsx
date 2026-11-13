import { SITE } from "@/lib/site";
import { PrimaryLink, Wordmark } from "./brand";

export function Finale() {
  return (
    <footer
      id="start"
      className="scroll-mt-24 overflow-hidden bg-wine-deep text-on-wine"
    >
      <div className="mx-auto max-w-[88rem] px-5 pt-[clamp(6rem,12vw,11rem)] md:px-10">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-[14ch] text-[clamp(2.6rem,6vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.035em] font-semiwide">
            Your next edit is{" "}
            <span className="serif-em text-[1.06em] text-flare">
              one click away.
            </span>
          </h2>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <PrimaryLink href={SITE.editorUrl} tone="flare">
              Open {SITE.name}
            </PrimaryLink>
            <p className="text-sm text-on-wine-soft">
              Free forever. No account to start.
            </p>
          </div>
        </div>

        <div className="mt-[clamp(4rem,9vw,8rem)] flex flex-col gap-3 border-t border-wine-line py-6 text-sm text-on-wine-soft sm:flex-row sm:justify-between">
          <p>© 2026 {SITE.name}. Made for everyone.</p>
          <p>Photography from Unsplash.</p>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="-mb-[0.22em] text-center text-[clamp(6rem,30vw,30rem)] leading-[0.9] text-wine select-none"
      >
        <Wordmark />
      </p>
    </footer>
  );
}
