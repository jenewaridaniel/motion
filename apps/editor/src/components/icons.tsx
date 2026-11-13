import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" stroke="none" />
  </Svg>
);
export const PauseIcon = (p: P) => (
  <Svg {...p}>
    <rect
      x="4"
      y="3"
      width="2.6"
      height="10"
      rx=".6"
      fill="currentColor"
      stroke="none"
    />
    <rect
      x="9.4"
      y="3"
      width="2.6"
      height="10"
      rx=".6"
      fill="currentColor"
      stroke="none"
    />
  </Svg>
);
export const SplitIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.5v13M3 4.5h3v7H3M13 4.5h-3v7h3" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
  </Svg>
);
export const UndoIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 3 2 6l3 3M2.5 6H10a3.5 3.5 0 0 1 0 7H7" />
  </Svg>
);
export const RedoIcon = (p: P) => (
  <Svg {...p}>
    <path d="m11 3 3 3-3 3M13.5 6H6a3.5 3.5 0 0 0 0 7h3" />
  </Svg>
);
export const LayersIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 2 2 5.2l6 3.2 6-3.2zM2 8.2l6 3.2 6-3.2M2 11l6 3.2L14 11" />
  </Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const EyeIcon = ({ off, ...p }: P & { off?: boolean }) => (
  <Svg {...p}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
    {off && <path d="m2.5 2.5 11 11" />}
  </Svg>
);
export const SpeakerIcon = ({ off, ...p }: P & { off?: boolean }) => (
  <Svg {...p}>
    <path d="M2.5 6h2.5L8.5 3v10L5 10H2.5z" />
    {off ? (
      <path d="m11 6 3.5 4M14.5 6 11 10" />
    ) : (
      <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" />
    )}
  </Svg>
);
export const ExportIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 10V2M5 5l3-3 3 3M2.5 9.5v4h11v-4" />
  </Svg>
);
export const VideoIcon = (p: P) => (
  <Svg {...p}>
    <rect x="1.5" y="3.5" width="9" height="9" rx="1.5" />
    <path d="m10.5 7 4-2.5v7l-4-2.5" />
  </Svg>
);
export const ImageIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <circle cx="5.8" cy="6.2" r="1.2" />
    <path d="m2.5 12 3.8-3.6 2.6 2.4 2-1.8 2.6 2.4" />
  </Svg>
);
export const MusicIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 12V3.5l7-1.5V10.5" />
    <circle cx="4.2" cy="12" r="1.8" />
    <circle cx="11.2" cy="10.5" r="1.8" />
  </Svg>
);
export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="5.5" y="1.75" width="5" height="8" rx="2.5" />
    <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
  </Svg>
);
export const TextIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 4V2.5h10V4M8 2.5v11M6 13.5h4" />
  </Svg>
);
export const ZoomFitIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </Svg>
);
export const StepIcon = ({ dir, ...p }: P & { dir: "back" | "forward" }) => (
  <Svg {...p} style={dir === "back" ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M4 3.5v9L10.5 8z" fill="currentColor" stroke="none" />
    <path d="M12.5 3.5v9" />
  </Svg>
);

/** Keyframe toggle. Filled: keyframe here. Ring: animated elsewhere. Faint: static. */
export function Diamond({
  state,
  ...p
}: P & { state: "on" | "animated" | "off" }) {
  return (
    <Svg {...p} viewBox="0 0 16 16">
      <path
        d="M8 2.5 13.5 8 8 13.5 2.5 8z"
        fill={state === "on" ? "currentColor" : "none"}
        opacity={state === "off" ? 0.55 : 1}
      />
    </Svg>
  );
}

/** The Motion mark: an "m" with a coral playhead as its middle stroke. */
export function Mark({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon.svg`}
      alt=""
      width={24}
      height={24}
      className={className}
    />
  );
}
