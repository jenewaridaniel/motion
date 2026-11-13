// One place for names and links, so renaming "Motion" later is a one-line change.
export const SITE = {
  name: "Motion",
  tagline: "Every pro tool. Zero watermark.",
  description:
    "A free video editor that runs in your browser. Multi-track timeline, keyframes, effects and 4K60 export, with no watermark and nothing to download from an app store.",
  // The editor app (apps/editor). In development it runs on port 5180.
  // In production set NEXT_PUBLIC_EDITOR_URL to wherever the editor is deployed.
  editorUrl:
    process.env.NEXT_PUBLIC_EDITOR_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:5180"
      : "/app/"),
} as const;

export const NAV_LINKS = [
  { href: "#toolkit", label: "Toolkit" },
  { href: "#export", label: "Export" },
  { href: "#everywhere", label: "Everywhere" },
  { href: "#faq", label: "FAQ" },
] as const;
