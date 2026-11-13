# Design

Visual system for Motion's landing page (`apps/landing`). Tokens live in `apps/landing/app/globals.css`. The editor app will get its own product-register pass and will borrow the palette and type, not the layout.

## Theme

Warm and light. Scene: a creator on a phone at lunch, or on a laptop in a bright room, deciding in a few seconds whether this free editor is legit. Light blush paper, with deep wine sections for drama.

**Aesthetic lane:** a video agency's editorial warmth (the inspo) crossed with the language of an editing timeline: playheads, timecodes, clips and tracks. The page should feel like footage being cut, not like a magazine.

## Color

Strategy: **Committed.** Wine carries the brand across large surfaces (toolkit, finale, giant type), on blush paper, with one hot accent.

| Token | OKLCH | Role |
|---|---|---|
| `paper` | 0.972 0.014 345 | Page background (blush) |
| `paper-2` | 0.942 0.024 345 | Alternate section background |
| `line` | 0.875 0.032 348 | Hairlines on paper |
| `ink` | 0.215 0.035 355 | Primary text |
| `ink-soft` | 0.45 0.035 355 | Secondary text |
| `wine` | 0.37 0.13 3 | Brand: buttons, italic accents, giant type |
| `wine-deep` | 0.235 0.08 358 | Drenched sections |
| `wine-ink` | 0.19 0.06 358 | Panels inside wine sections, text on flare |
| `wine-line` | 0.36 0.07 358 | Hairlines on wine |
| `on-wine` / `on-wine-soft` | 0.955 / 0.80 | Text on wine |
| `flare` | 0.73 0.185 33 | Energy accent: playheads, markers, CTA on wine. Never body text on paper. |

Timeline track colors share L 0.52 and C 0.1, and vary only by hue (350, 32, 305, 70, 165, 250).

No pure black or white. Every neutral is tinted toward the wine hue.

## Typography

- **Archivo** (variable, `wght` and `wdth`): all sans. The width axis is the kinetic voice. `font-semiwide` (112%) for headlines, `font-wide` (125%) for giant display words and spec numbers.
- **Bodoni Moda Italic** (`opsz` 96): accent words only, always in `wine` (or `flare` on wine). Never a whole paragraph.
- Headline pattern: line one in Archivo semibold, line two (the payoff) in Bodoni italic.
- Scale: fluid `clamp()`. Hero about 9rem max, section h2 about 4.75 to 5.75rem, body 1.125rem. Tight negative tracking on display sizes. `tabular-nums` on every timecode and number.

## Signature components

- **Clip reel:** vertical 9:16 cards bent around a cylinder, drifting past a fixed coral playhead with a live timecode. Each card's progress bar fills as it crosses the playhead. Draggable.
- **Chapter marker:** the section label system. A coral marker glyph, a timecode, a hairline and a sentence-case name. Not uppercase.
- **Giant word:** a full-width Archivo Wide word (UNLOCKED) that letters rise into, with arch-topped photo cards overlapping it on desktop.
- **Arch cards:** `rounded-t-full` photos with a 6px paper ring, dropped at staggered heights.
- **Toolkit timeline:** real tracks and clips. On desktop a scroll-scrubbed playhead lights clips as it crosses them. On phones the clips wrap per track.
- **Logo system:**
  - *Mark:* a lowercase "m" on a wine-deep rounded square, with a coral playhead as its middle stroke. It's built on a 64-unit grid with 7-unit strokes so it holds up at 16px. It's used for the favicon, app icon and nav. Files: `apps/landing/app/icon.svg`, `favicon.ico` (16/32/48), `apple-icon.png` (180, full-bleed) and `public/brand/` (SVG, 512 and 1024 PNG).
  - *Lockup:* mark plus "motion" in Archivo semibold. Used in the nav. The playhead appears once per lockup.
  - *Expressive wordmark:* "motion" with the playhead replacing the "i". Used large, as in the footer.
  - Hex values for files that can't use OKLCH: wine-deep `#39081e`, on-wine `#f9ecf3`, flare `#ff7356`.
- **Buttons:** fully rounded pills. Wine on paper, flare on wine. The arrow nudges right on hover.

## Layout

- Container max `88rem`, gutters `1.25rem` (mobile) and `2.5rem` (md+).
- 12-column grids with asymmetric splits (7/5, 5/6). Avoid centred stacks except the manifesto and the reel.
- Section padding varies, with `clamp()` between 5.5rem and 12rem, for rhythm.

## Motion

- GSAP and ScrollTrigger. Ease `expo.out` for entrances, linear for scrubbed effects. No bounce.
- Hero: word-by-word mask reveal, then the reel rises.
- Manifesto: words brighten as you scroll, and the flanking photos drift and rotate.
- Every effect is wrapped in `gsap.matchMedia` for `prefers-reduced-motion`. With reduced motion, content shows in its final state, the reel stops drifting and the timeline playhead rests at 41%.

## Imagery

Real photography (Unsplash) of people moving, performing and creating, in vertical crops. No logos or legible names. Credits are in `apps/landing/public/media/CREDITS.txt`.
