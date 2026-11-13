import { Mark } from "./icons.tsx";

/** Shown instead of the editor when the browser lacks something essential. */
export function Unsupported({ missing }: { missing: string[] }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-10 text-ink">
      <div className="flex max-w-md flex-col gap-4">
        <Mark className="size-10" />
        <h1 className="font-semibold text-[22px] leading-tight">
          This browser can't run Motion yet
        </h1>
        <p className="text-ink-soft leading-relaxed">
          Motion edits video right in your browser, so it needs a few modern
          features this browser doesn't have:
        </p>
        <ul className="list-disc pl-5 text-ink-soft leading-relaxed">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="text-ink-soft leading-relaxed">
          Please open Motion in the latest{" "}
          <strong className="text-ink">Chrome</strong>,{" "}
          <strong className="text-ink">Edge</strong>,{" "}
          <strong className="text-ink">Safari</strong> (version 17 or newer) or{" "}
          <strong className="text-ink">Firefox</strong>. On a phone, update the
          system or the browser app. Your projects stay on this device and
          nothing is lost.
        </p>
      </div>
    </main>
  );
}
