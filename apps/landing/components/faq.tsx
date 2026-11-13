import { FAQS } from "@/lib/content";
import { Chapter } from "./brand";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 py-[clamp(6rem,12vw,11rem)]">
      <div className="mx-auto grid max-w-[88rem] gap-10 px-5 md:px-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <Chapter tc="01:12">FAQ</Chapter>
            <h2 className="mt-6 text-[clamp(2.4rem,4.6vw,4.25rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-ink font-semiwide">
              Fair{" "}
              <span className="serif-em text-[1.06em] text-wine">
                questions.
              </span>
            </h2>
          </div>
        </div>

        <div className="lg:col-span-7 lg:col-start-6">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group border-t border-line last:border-b"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[clamp(1.15rem,1.8vw,1.45rem)] font-semibold tracking-[-0.02em] text-ink transition-colors hover:text-wine [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden="true"
                  className="relative size-4 shrink-0 text-wine transition-transform duration-500 ease-out-expo group-open:rotate-45"
                >
                  <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded bg-current" />
                  <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded bg-current" />
                </span>
              </summary>
              <p className="max-w-[60ch] pb-7 text-lg leading-relaxed text-ink-soft">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
