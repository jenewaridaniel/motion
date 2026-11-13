/**
 * App icons as PNG (install icons, iPhone home screen), drawn from the same
 * shapes as public/icon.svg. Run after changing the icon:
 *
 *   node scripts/gen-icons.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const hex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const BG = hex("#39081e");
const INK = hex("#f9ecf3");
const FLARE = hex("#ff7356");

// Distance from point to segment.
function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// Distance to the top half of a circle (the arches), Infinity below it.
function arch(px, py, cx, cy, r) {
  if (py > cy) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.hypot(px - cx, py - cy) - r);
}
// Inside the pointer (a pentagon), as a convex polygon test.
const POINTER = [
  [26, 9.5],
  [38, 9.5],
  [38, 14],
  [32, 20],
  [26, 14],
];
function inPointer(px, py) {
  for (let i = 0; i < POINTER.length; i++) {
    const [ax, ay] = POINTER[i];
    const [bx, by] = POINTER[(i + 1) % POINTER.length];
    if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) < 0) return false;
  }
  return true;
}
function pointerDist(px, py) {
  if (inPointer(px, py)) return 0;
  let d = Number.POSITIVE_INFINITY;
  for (let i = 0; i < POINTER.length; i++) {
    const [ax, ay] = POINTER[i];
    const [bx, by] = POINTER[(i + 1) % POINTER.length];
    d = Math.min(d, seg(px, py, ax, ay, bx, by));
  }
  return d;
}
// Rounded square of side 64, corner r: inside test.
function inRound(px, py, r) {
  const qx = Math.max(Math.abs(px - 32) - (32 - r), 0);
  const qy = Math.max(Math.abs(py - 32) - (32 - r), 0);
  return Math.hypot(qx, qy) <= r;
}

/** Colour of icon point (x, y) in 0–64 units; null = transparent. */
function shade(x, y, { maskable }) {
  if (!maskable && !inRound(x, y, 15)) return null;
  let c = BG;
  const ink =
    Math.min(
      seg(x, y, 17, 50, 17, 32.5),
      arch(x, y, 24.5, 32.5, 7.5),
      arch(x, y, 39.5, 32.5, 7.5),
      seg(x, y, 47, 32.5, 47, 50),
    ) <= 3.5;
  if (ink) c = INK;
  if (seg(x, y, 32, 22, 32, 50) <= 3.5) c = FLARE;
  if (pointerDist(x, y) <= 1) c = FLARE;
  return c;
}

function render(size, { maskable = false } = {}) {
  // Maskable icons get the full square and the drawing shrunk into the safe
  // zone (the middle 80%), since systems cut them into circles or squircles.
  const scale = maskable ? 0.72 : 1;
  const ss = 4;
  const px = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const u = ((i + (si + 0.5) / ss) / size) * 64;
          const v = ((j + (sj + 0.5) / ss) / size) * 64;
          const x = 32 + (u - 32) / scale;
          const y = 32 + (v - 32) / scale;
          const c = shade(x, y, { maskable }) ?? (maskable ? BG : null);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = ss * ss;
      const k = (j * size + i) * 4;
      // Premultiplied average back to straight alpha.
      const cover = a / 255;
      px[k] = cover ? Math.round(r / cover) : 0;
      px[k + 1] = cover ? Math.round(g / cover) : 0;
      px[k + 2] = cover ? Math.round(b / cover) : 0;
      px[k + 3] = Math.round(a / n);
    }
  }
  return png(size, size, px);
}

// ---- minimal PNG encoder (RGBA, 8-bit)
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const files = {
  "icon-192.png": render(192),
  "icon-512.png": render(512),
  "icon-maskable-512.png": render(512, { maskable: true }),
  // iPhone home screen: full square, iOS rounds the corners itself.
  "apple-touch-icon.png": render(180, { maskable: true }),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(out, name), data);
  console.log(name, data.length, "bytes");
}
