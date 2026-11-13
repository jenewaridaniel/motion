export type Clip = { src: string; alt: string; length: string };

// Vertical "clips" for the hero reel. Photos: Unsplash (see public/media/CREDITS.txt).
export const CLIPS: Clip[] = [
  {
    src: "/media/clip-surf.webp",
    alt: "Surfer carving through a turquoise barrel",
    length: "00:07",
  },
  {
    src: "/media/clip-crowd.webp",
    alt: "Fan mid-cheer in a packed concert crowd",
    length: "00:05",
  },
  {
    src: "/media/clip-teal.webp",
    alt: "Woman in striped trousers posing against a teal wall",
    length: "00:09",
  },
  {
    src: "/media/clip-cyclists.webp",
    alt: "Road cyclists sprinting shoulder to shoulder",
    length: "00:06",
  },
  {
    src: "/media/clip-denim.webp",
    alt: "Laughing woman in a denim jacket against a blue door",
    length: "00:04",
  },
  {
    src: "/media/clip-smoke.webp",
    alt: "Hand raised through stage smoke at a show",
    length: "00:08",
  },
  {
    src: "/media/clip-yellow.webp",
    alt: "Woman in a yellow tracksuit by a basketball hoop",
    length: "00:05",
  },
  {
    src: "/media/clip-friends.webp",
    alt: "Four friends arm in arm looking out over a city",
    length: "00:10",
  },
  {
    src: "/media/clip-volley.webp",
    alt: "Volleyball player celebrating a point",
    length: "00:03",
  },
  {
    src: "/media/clip-street.webp",
    alt: "Woman in a wine-red coat and sunglasses with shopping bags",
    length: "00:06",
  },
  {
    src: "/media/clip-swim.webp",
    alt: "Swimmer surging up mid-butterfly stroke",
    length: "00:04",
  },
  {
    src: "/media/clip-dancers.webp",
    alt: "Dancers casting long shadows on a warm-lit floor",
    length: "00:09",
  },
  {
    src: "/media/clip-summit.webp",
    alt: "Photographer framing a shot above the clouds",
    length: "00:07",
  },
];

export const ARCHES = [
  {
    src: "/media/arch-timeline.webp",
    alt: "An editing timeline glowing on a monitor",
    label: "Timeline",
    line: "Multi-track editing with magnetic snapping and ripple delete.",
  },
  {
    src: "/media/arch-color.webp",
    alt: "Portrait washed in magenta and teal light",
    label: "Color",
    line: "Curves, HSL and your own LUTs.",
  },
  {
    src: "/media/arch-text.webp",
    alt: "Neon sign on brick that reads: you are what you listen to",
    label: "Text",
    line: "Animated titles, outlines and SRT subtitles.",
  },
  {
    src: "/media/arch-audio.webp",
    alt: "Chrome vintage microphone under warm stage lights",
    label: "Audio",
    line: "Voiceover, fades, volume keyframes and sound effects.",
  },
  {
    src: "/media/arch-effects.webp",
    alt: "Confetti and colored beams above a concert crowd",
    label: "Effects",
    line: "Transitions, masks, blend modes and green screen.",
  },
] as const;

export type TrackClip = { name: string; l: number; w: number };
export type Track = {
  id: string;
  name: string;
  hue: number;
  clips: TrackClip[];
};

// The toolkit, laid out as an editing timeline. `l` and `w` are percentages of the lane.
export const TRACKS: Track[] = [
  {
    id: "V1",
    name: "Video",
    hue: 350,
    clips: [
      { name: "Split", l: 0, w: 8 },
      { name: "Trim", l: 9, w: 8 },
      { name: "Ripple delete", l: 18, w: 14 },
      { name: "Speed curves", l: 33, w: 14 },
      { name: "Reverse", l: 48, w: 10 },
      { name: "Freeze frame", l: 59, w: 13 },
      { name: "Picture in picture", l: 73, w: 17 },
      { name: "Crop", l: 91, w: 9 },
    ],
  },
  {
    id: "T1",
    name: "Text",
    hue: 32,
    clips: [
      { name: "Titles", l: 3, w: 10 },
      { name: "Text animations", l: 14, w: 18 },
      { name: "Outlines & shadows", l: 33, w: 19 },
      { name: "SRT subtitles", l: 53, w: 15 },
      { name: "Stickers", l: 69, w: 11 },
      { name: "Shapes", l: 81, w: 10 },
    ],
  },
  {
    id: "FX",
    name: "Effects",
    hue: 305,
    clips: [
      { name: "Transitions", l: 0, w: 14 },
      { name: "Masks", l: 15, w: 9 },
      { name: "Chroma key", l: 25, w: 13 },
      { name: "Blend modes", l: 39, w: 14 },
      { name: "Blur", l: 54, w: 8 },
      { name: "Glitch", l: 63, w: 9 },
      { name: "Keyframes", l: 73, w: 13 },
      { name: "Shake", l: 87, w: 9 },
    ],
  },
  {
    id: "C1",
    name: "Color",
    hue: 70,
    clips: [
      { name: "Exposure", l: 5, w: 12 },
      { name: "Contrast", l: 18, w: 12 },
      { name: "Saturation", l: 31, w: 13 },
      { name: "HSL", l: 45, w: 8 },
      { name: "Curves", l: 54, w: 11 },
      { name: "LUT import", l: 66, w: 14 },
      { name: "Filters", l: 81, w: 13 },
    ],
  },
  {
    id: "A1",
    name: "Audio",
    hue: 165,
    clips: [
      { name: "Voiceover", l: 0, w: 14 },
      { name: "Volume keyframes", l: 15, w: 20 },
      { name: "Fades", l: 36, w: 10 },
      { name: "Sound effects", l: 47, w: 16 },
      { name: "Extract audio", l: 64, w: 16 },
      { name: "Markers", l: 81, w: 12 },
    ],
  },
  {
    id: "P",
    name: "Project",
    hue: 250,
    clips: [
      { name: "9:16 to 16:9 canvas", l: 2, w: 21 },
      { name: "Templates", l: 24, w: 13 },
      { name: "Undo history", l: 38, w: 15 },
      { name: "Autosave", l: 54, w: 12 },
      { name: "Works offline", l: 67, w: 15 },
      { name: "4K60 export", l: 83, w: 17 },
    ],
  },
];

export const FAQS = [
  {
    q: "Is it really free?",
    a: "Yes. Every feature and every export, with no trial and no tiers. Motion runs on your own device, so there are no render servers to pay for.",
  },
  {
    q: "Will my videos have a watermark?",
    a: "Never. What you export is a clean file that belongs to you.",
  },
  {
    q: "Do my videos get uploaded anywhere?",
    a: "No. Your footage stays on your device. Editing, rendering and exporting all happen inside your browser.",
  },
  {
    q: "Can my phone export in 4K?",
    a: "It depends on the phone's hardware. Recent flagships usually can. If yours can't finish a 4K export reliably, Motion offers the highest quality it can, usually 1080p.",
  },
  {
    q: "What about ProRes?",
    a: "ProRes export is planned for desktop browsers. It will be slower than MP4, because browsers have no built-in ProRes encoder, so Motion brings its own.",
  },
  {
    q: "Which browsers work?",
    a: "Recent versions of Chrome, Edge, Safari and Firefox, on phones, tablets, laptops and desktops.",
  },
] as const;
