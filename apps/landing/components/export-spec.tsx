import Image from "next/image";
import { Chapter } from "./brand";

const SPECS = [
  { k: "Resolution", v: "Up to 3840 × 2160, at up to 60fps" },
  {
    k: "Formats",
    v: "MP4 with H.264 or HEVC. ProRes is coming to desktop browsers.",
  },
  { k: "Watermark", v: "None. Not now, not on long videos, not ever." },
  { k: "Uploads", v: "None. Your device renders every frame." },
];

export function ExportSpec() {
  return (
    <section id="export" className="scroll-mt-24 py-[clamp(6rem,13vw,12rem)]">
      <div className="mx-auto grid max-w-[88rem] gap-14 px-5 md:px-10 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <Chapter tc="00:41">Export</Chapter>
          <h2 className="mt-6 max-w-[16ch] text-[clamp(2.4rem,5vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-ink font-semiwide">
            Export in 4K at 60.{" "}
            <span className="serif-em text-[1.06em] text-wine">
              Keep every pixel.
            </span>
          </h2>

          <p
            aria-hidden="true"
            className="mt-12 text-[clamp(3.2rem,9.4vw,9rem)] leading-[0.85] font-extrabold tracking-[-0.04em] text-wine tabular-nums font-wide"
          >
            2160p<span className="text-flare">60</span>
          </p>

          <dl className="mt-12 border-b border-line">
            {SPECS.map((s) => (
              <div
                key={s.k}
                className="grid gap-1 border-t border-line py-5 sm:grid-cols-[10rem_1fr] sm:gap-6"
              >
                <dt className="text-sm font-medium text-ink-soft">{s.k}</dt>
                <dd className="text-lg leading-snug text-ink">{s.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
            4K needs a device with a hardware video encoder. Most recent
            laptops, desktops and flagship phones have one, and Motion picks the
            best quality your device can finish.
          </p>
        </div>

        <div className="lg:col-span-5 lg:pt-28">
          <figure className="relative lg:sticky lg:top-28">
            <Image
              src="/media/export-projector.webp"
              alt="Film projector throwing a beam of light through haze"
              width={1400}
              height={1400}
              className="aspect-[4/5] w-full rounded-[2rem] object-cover"
            />
            <figcaption className="absolute bottom-5 left-5 rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink">
              Rendered on your device
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
