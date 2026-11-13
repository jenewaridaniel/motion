import { type ReactNode, useEffect, useRef } from "react";
import { CloseIcon } from "./icons.tsx";

/** A panel that slides up from the bottom on small screens. */
export function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="flex max-h-[55dvh] flex-col rounded-t-2xl border-line border-t bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-line-soft border-b pr-2 pl-4">
          <h2 className="font-semibold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-raised hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
