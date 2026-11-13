import { Chapter } from "./brand";

const STEPS = [
  {
    n: "1",
    title: "Open the link",
    line: "Motion loads in your browser. No account needed to start.",
  },
  {
    n: "2",
    title: "Add it to your home screen",
    line: "One tap gives it an app icon and a full-screen window.",
  },
  {
    n: "3",
    title: "Edit anywhere, even offline",
    line: "Your projects live on your device, ready when you are.",
  },
];

export function Everywhere() {
  return (
    <section
      id="everywhere"
      className="scroll-mt-24 bg-paper-2 py-[clamp(5.5rem,11vw,10rem)]"
    >
      <div className="mx-auto grid max-w-[88rem] gap-12 px-5 md:px-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Chapter tc="00:58">Everywhere</Chapter>
          <h2 className="mt-6 text-[clamp(2.4rem,5vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-ink font-semiwide">
            No app store.{" "}
            <span className="serif-em text-[1.06em] text-wine">
              Just a link.
            </span>
          </h2>
          <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-ink-soft">
            Phone, tablet, laptop or desktop. If it runs a modern browser, it
            runs Motion.
          </p>
        </div>

        <ol className="lg:col-span-6 lg:col-start-7">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex gap-6 border-t border-line py-7 last:border-b md:gap-10"
            >
              <span className="w-[0.75em] shrink-0 text-[clamp(3rem,6vw,5rem)] leading-[0.8] font-light text-wine tabular-nums font-wide">
                {s.n}
              </span>
              <div className="pt-1">
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink md:text-2xl">
                  {s.title}
                </h3>
                <p className="mt-1.5 leading-relaxed text-ink-soft">{s.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
