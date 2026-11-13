/**
 * Templates: ready-made starting projects. Each one is built with the
 * ordinary edit functions (text, shapes, animations, background), so a
 * template is just a normal project the user then changes. None needs stock
 * media; some are made to go over the user's own video.
 */
import {
  addPlaceholder,
  addShape,
  addText,
  setAspect,
  setBackground,
  setTextAnimation,
} from "./edit.ts";
import {
  type AspectKey,
  createProject,
  type Project,
  rootComposition,
  type TextAnimation,
  type TextStyle,
} from "./model.ts";
import type { Vec2 } from "./property.ts";
import type { ShapeKind, ShapePreset, ShapeStyle } from "./shapes.ts";
import { sec } from "./time.ts";

export interface Template {
  id: string;
  name: string;
  description: string;
  aspect: AspectKey;
  /** A good moment to show as the template's picture, in seconds. */
  previewAt: number;
  /** Font families the template uses (bundled with the editor). */
  fonts: string[];
  build: (b: Builder) => void;
}

interface TextSpec {
  text: string;
  /** Seconds. */
  from: number;
  to: number;
  /** Centre, as fractions of the canvas width and height. */
  at: Vec2;
  style: Partial<TextStyle>;
  anim?: Partial<TextAnimation>;
}

interface ShapeSpec {
  name: string;
  shape: ShapeKind;
  from: number;
  to: number;
  at: Vec2;
  /** Width and height as shares of the canvas' short side. */
  size: Vec2;
  style: ShapeStyle;
}

interface SlotSpec {
  /** What goes there, e.g. "Your video". */
  label: string;
  from: number;
  to: number;
  /** On the main track (a full-length background clip). */
  main?: boolean;
  /** Centre and size as fractions of the canvas width and height. */
  at?: Vec2;
  size?: Vec2;
}

/** What a template's `build` gets: add text and shapes in canvas fractions. */
export interface Builder {
  text(spec: TextSpec): void;
  shape(spec: ShapeSpec): void;
  /** A slot for the user's own video or photo. */
  slot(spec: SlotSpec): void;
  background(color: string): void;
}

const FONT = {
  sans: "Archivo Variable",
  display: "Bebas Neue",
  heavy: "Anton",
  serif: "Playfair Display Variable",
  round: "Montserrat Variable",
};

const pop = (s = 0.35): Partial<TextAnimation> => ({
  in: { kind: "pop", duration: sec(s) },
});
const fadeInOut: Partial<TextAnimation> = {
  in: { kind: "fade", duration: sec(0.5) },
  out: { kind: "fade", duration: sec(0.4) },
};
const slideUp: Partial<TextAnimation> = {
  in: { kind: "slide-up", duration: sec(0.45) },
  out: { kind: "fade", duration: sec(0.3) },
};

export const TEMPLATES: Template[] = [
  {
    id: "bold-title",
    name: "Bold title",
    description: "A big title and a line under it, for the start of a video.",
    aspect: "16:9",
    previewAt: 1.5,
    fonts: [FONT.display, FONT.sans],
    build(b) {
      b.background("#111014");
      b.slot({ label: "Your video (optional)", from: 0, to: 4, main: true });
      b.shape({
        name: "Accent bar",
        shape: "rect",
        from: 0.3,
        to: 4,
        at: [0.5, 0.64],
        size: [1.05, 0.11],
        style: { fill: "#e8365d", stroke: null, radius: 12 },
      });
      b.text({
        text: "YOUR BIG TITLE",
        from: 0,
        to: 4,
        at: [0.5, 0.44],
        style: { font: FONT.display, size: 230, color: "#ffffff", weight: 400 },
        anim: { ...pop(0.4), out: { kind: "fade", duration: sec(0.4) } },
      });
      b.text({
        text: "A short line about your video",
        from: 0.5,
        to: 4,
        at: [0.5, 0.64],
        style: { font: FONT.sans, size: 54, color: "#ffffff", weight: 600 },
        anim: fadeInOut,
      });
    },
  },
  {
    id: "quote",
    name: "Quote",
    description: "A quote on a calm background, square for feeds.",
    aspect: "1:1",
    previewAt: 2,
    fonts: [FONT.serif, FONT.sans],
    build(b) {
      b.background("#f3ede2");
      b.shape({
        name: "Sparkle",
        shape: "sparkle",
        from: 0.6,
        to: 6,
        at: [0.82, 0.2],
        size: [0.1, 0.13],
        style: { fill: "#d9952f", stroke: null, radius: 0 },
      });
      b.text({
        text: "“Simple things, done well,\nmake the best stories.”",
        from: 0,
        to: 6,
        at: [0.5, 0.45],
        style: {
          font: FONT.serif,
          size: 70,
          color: "#1c1917",
          italic: true,
          weight: 500,
          lineHeight: 1.25,
        },
        anim: fadeInOut,
      });
      b.text({
        text: "— Your name",
        from: 0.8,
        to: 6,
        at: [0.5, 0.68],
        style: { font: FONT.sans, size: 40, color: "#57534e", weight: 600 },
        anim: slideUp,
      });
    },
  },
  {
    id: "countdown",
    name: "Countdown",
    description: "3, 2, 1, Go! Each number pops in on the beat.",
    aspect: "16:9",
    previewAt: 1.5,
    fonts: [FONT.heavy],
    build(b) {
      b.background("#0b0b10");
      b.shape({
        name: "Ring",
        shape: "ellipse",
        from: 0,
        to: 3,
        at: [0.5, 0.5],
        size: [0.62, 0.62],
        style: {
          fill: null,
          stroke: { color: "#ffffff", width: 16 },
          radius: 0,
        },
      });
      ["3", "2", "1"].forEach((n, i) => {
        b.text({
          text: n,
          from: i,
          to: i + 1,
          at: [0.5, 0.5],
          style: { font: FONT.heavy, size: 340, color: "#ffffff", weight: 400 },
          anim: pop(0.3),
        });
      });
      b.text({
        text: "GO!",
        from: 3,
        to: 4.5,
        at: [0.5, 0.5],
        style: { font: FONT.heavy, size: 320, color: "#ffd400", weight: 400 },
        anim: { ...pop(0.3), loop: { kind: "pulse", period: sec(0.6) } },
      });
    },
  },
  {
    id: "lower-third",
    name: "Name label",
    description:
      "A name and role at the bottom left. Import your video and it plays underneath.",
    aspect: "16:9",
    previewAt: 2,
    fonts: [FONT.sans],
    build(b) {
      b.slot({ label: "Your video", from: 0, to: 6, main: true });
      b.shape({
        name: "Label",
        shape: "rect",
        from: 0.5,
        to: 5.5,
        at: [0.27, 0.835],
        size: [0.8, 0.2],
        style: { fill: "#111111", stroke: null, radius: 16 },
      });
      b.shape({
        name: "Accent",
        shape: "rect",
        from: 0.5,
        to: 5.5,
        at: [0.055, 0.835],
        size: [0.02, 0.2],
        style: { fill: "#e8365d", stroke: null, radius: 0 },
      });
      b.text({
        text: "Your Name",
        from: 0.6,
        to: 5.5,
        at: [0.27, 0.805],
        style: { font: FONT.sans, size: 62, color: "#ffffff", weight: 800 },
        anim: slideUp,
      });
      b.text({
        text: "Title or role",
        from: 0.8,
        to: 5.5,
        at: [0.27, 0.875],
        style: { font: FONT.sans, size: 38, color: "#d6d3d1", weight: 500 },
        anim: slideUp,
      });
    },
  },
  {
    id: "story-intro",
    name: "Story intro",
    description: "Vertical opener with a big headline and a follow button.",
    aspect: "9:16",
    previewAt: 2,
    fonts: [FONT.display, FONT.sans],
    build(b) {
      b.background("#1a1033");
      b.slot({ label: "Your video or photo", from: 0, to: 5, main: true });
      b.shape({
        name: "Gold star",
        shape: "star",
        from: 0.4,
        to: 5,
        at: [0.78, 0.2],
        size: [0.26, 0.26],
        style: {
          fill: "#ffc93c",
          stroke: { color: "#ffffff", width: 14 },
          radius: 0,
        },
      });
      b.text({
        text: "NEW\nVIDEO",
        from: 0,
        to: 5,
        at: [0.5, 0.42],
        style: {
          font: FONT.display,
          size: 300,
          color: "#ffffff",
          weight: 400,
          lineHeight: 0.95,
        },
        anim: pop(0.45),
      });
      b.shape({
        name: "Button",
        shape: "rect",
        from: 0.8,
        to: 5,
        at: [0.5, 0.78],
        size: [0.72, 0.13],
        style: { fill: "#ffd400", stroke: null, radius: 70 },
      });
      b.text({
        text: "Follow for more",
        from: 0.9,
        to: 5,
        at: [0.5, 0.78],
        style: { font: FONT.sans, size: 58, color: "#111111", weight: 800 },
        anim: slideUp,
      });
    },
  },
  {
    id: "promo",
    name: "Product promo",
    description:
      "Three quick slides: what it is, why it's good, where to get it.",
    aspect: "9:16",
    previewAt: 7,
    fonts: [FONT.round, FONT.sans],
    build(b) {
      b.background("#0e1726");
      b.slot({
        label: "Your product photo",
        from: 0,
        to: 3,
        at: [0.5, 0.33],
        size: [0.8, 0.34],
      });
      b.text({
        text: "Meet the new\nTHING",
        from: 0,
        to: 3,
        at: [0.5, 0.68],
        style: { font: FONT.round, size: 120, color: "#ffffff", weight: 800 },
        anim: { ...pop(0.4), out: { kind: "fade", duration: sec(0.3) } },
      });
      for (const [i, line] of [
        "Fast to set up",
        "Works everywhere",
        "Free to try",
      ].entries()) {
        const y = 0.36 + i * 0.12;
        b.shape({
          name: "Tick",
          shape: "check",
          from: 3 + i * 0.3,
          to: 6,
          at: [0.2, y],
          size: [0.14, 0.12],
          style: { fill: "#22c55e", stroke: null, radius: 0 },
        });
        b.text({
          text: line,
          from: 3 + i * 0.3,
          to: 6,
          at: [0.55, y],
          style: { font: FONT.sans, size: 62, color: "#ffffff", weight: 700 },
          anim: slideUp,
        });
      }
      b.shape({
        name: "Button",
        shape: "rect",
        from: 6,
        to: 9,
        at: [0.5, 0.5],
        size: [0.7, 0.14],
        style: { fill: "#22c55e", stroke: null, radius: 76 },
      });
      b.text({
        text: "Shop now",
        from: 6,
        to: 9,
        at: [0.5, 0.5],
        style: { font: FONT.round, size: 76, color: "#06240f", weight: 800 },
        anim: pop(0.35),
      });
      b.text({
        text: "yourshop.com",
        from: 6.3,
        to: 9,
        at: [0.5, 0.62],
        style: { font: FONT.sans, size: 44, color: "#cbd5e1", weight: 500 },
        anim: slideUp,
      });
    },
  },
];

/** A new project made from a template. */
export function projectFromTemplate(id: string): Project | null {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const p = createProject(t.name);
  setAspect(p, t.aspect);
  const comp = rootComposition(p);
  const where = ([fx, fy]: Vec2): Vec2 => [fx * comp.width, fy * comp.height];
  t.build({
    background: (color) => setBackground(p, color),
    text(s) {
      const id = addText(p, sec(s.from), {
        text: s.text,
        style: s.style,
        duration: sec(s.to - s.from),
        position: where(s.at),
      });
      if (id && s.anim) setTextAnimation(p, id, s.anim);
    },
    slot(s) {
      addPlaceholder(p, sec(s.from), {
        label: s.label,
        duration: sec(s.to - s.from),
        main: s.main,
        position: s.at && where(s.at),
        size: s.size && [s.size[0] * comp.width, s.size[1] * comp.height],
      });
    },
    shape(s) {
      const preset: ShapePreset = {
        id: s.name,
        name: s.name,
        shape: s.shape,
        size: s.size,
        style: s.style,
      };
      addShape(p, preset, sec(s.from), {
        duration: sec(s.to - s.from),
        position: where(s.at),
      });
    },
  });
  return p;
}
