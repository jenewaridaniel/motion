/**
 * Minimal ZIP for .motion project files: entries are stored (not
 * compressed; video is already compressed), and the archive is built from
 * Blob references, so gigabytes of media are never copied into memory.
 * ZIP64 is used automatically when a size or offset needs it.
 */

export interface ZipEntry {
  name: string;
  data: Blob;
}

// ---------------------------------------------------------------- crc32

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 of a blob, read in chunks so big files aren't loaded at once. */
export async function crc32(
  blob: Blob,
  chunk = 4 * 1024 * 1024,
): Promise<number> {
  let c = 0xffffffff;
  for (let at = 0; at < blob.size; at += chunk) {
    const bytes = new Uint8Array(
      await blob.slice(at, at + chunk).arrayBuffer(),
    );
    for (let i = 0; i < bytes.length; i++) {
      c = (TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- write

const MAX32 = 0xffffffff;

class Bytes {
  private parts: number[] = [];
  u16(v: number) {
    this.parts.push(v & 0xff, (v >>> 8) & 0xff);
    return this;
  }
  u32(v: number) {
    this.parts.push(
      v & 0xff,
      (v >>> 8) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 24) & 0xff,
    );
    return this;
  }
  u64(v: number) {
    // Safe up to 2^53, far beyond any file.
    this.u32(v % 0x100000000);
    this.u32(Math.floor(v / 0x100000000));
    return this;
  }
  raw(b: Uint8Array) {
    for (const x of b) this.parts.push(x);
    return this;
  }
  get length() {
    return this.parts.length;
  }
  done(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.parts);
  }
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time:
      (d.getHours() << 11) |
      (d.getMinutes() << 5) |
      Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8 = 0x0800; // general-purpose flag: names are UTF-8

/**
 * Build a ZIP. `zip64Above` is only for tests: sizes and offsets at or above
 * it are written as ZIP64, as real ones above 4 GB are.
 */
export async function writeZip(
  entries: ZipEntry[],
  opts: { zip64Above?: number; date?: Date } = {},
): Promise<Blob> {
  const limit = Math.min(opts.zip64Above ?? MAX32, MAX32);
  const { time, date } = dosDateTime(opts.date ?? new Date());
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central = new Bytes();
  let offset = 0;
  let zip64Needed = false;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const size = e.data.size;
    const crc = await crc32(e.data);
    const big = size >= limit || offset >= limit;
    zip64Needed ||= big;

    // Local header. With ZIP64, sizes go in the extra field.
    const localExtra = big
      ? new Bytes().u16(0x0001).u16(16).u64(size).u64(size).done()
      : new Uint8Array();
    const local = new Bytes()
      .u32(0x04034b50)
      .u16(big ? 45 : 20)
      .u16(UTF8)
      .u16(0) // stored
      .u16(time)
      .u16(date)
      .u32(crc)
      .u32(big ? MAX32 : size)
      .u32(big ? MAX32 : size)
      .u16(name.length)
      .u16(localExtra.length)
      .raw(name)
      .raw(localExtra)
      .done();
    parts.push(local, e.data);

    const cdExtra = big
      ? new Bytes().u16(0x0001).u16(24).u64(size).u64(size).u64(offset).done()
      : new Uint8Array();
    central
      .u32(0x02014b50)
      .u16(big ? 45 : 20) // made by
      .u16(big ? 45 : 20) // needed
      .u16(UTF8)
      .u16(0)
      .u16(time)
      .u16(date)
      .u32(crc)
      .u32(big ? MAX32 : size)
      .u32(big ? MAX32 : size)
      .u16(name.length)
      .u16(cdExtra.length)
      .u16(0) // comment
      .u16(0) // disk
      .u16(0) // internal attributes
      .u32(0) // external attributes
      .u32(big ? MAX32 : offset)
      .raw(name)
      .raw(cdExtra);
    offset += local.length + size;
  }

  const cdOffset = offset;
  const cdSize = central.length;
  parts.push(central.done());
  zip64Needed ||= cdOffset >= limit || entries.length >= 0xffff;

  const tail = new Bytes();
  if (zip64Needed) {
    const z64At = cdOffset + cdSize;
    tail
      .u32(0x06064b50)
      .u64(44) // size of the rest of this record
      .u16(45)
      .u16(45)
      .u32(0)
      .u32(0)
      .u64(entries.length)
      .u64(entries.length)
      .u64(cdSize)
      .u64(cdOffset)
      // Locator
      .u32(0x07064b50)
      .u32(0)
      .u64(z64At)
      .u32(1);
  }
  tail
    .u32(0x06054b50)
    .u16(0)
    .u16(0)
    .u16(zip64Needed ? 0xffff : entries.length)
    .u16(zip64Needed ? 0xffff : entries.length)
    .u32(zip64Needed ? MAX32 : cdSize)
    .u32(zip64Needed ? MAX32 : cdOffset)
    .u16(0);
  parts.push(tail.done());
  return new Blob(parts, { type: "application/zip" });
}

// ---------------------------------------------------------------- read

const NOT_A_PROJECT = "This is not a Motion project file.";

const view = async (blob: Blob, at: number, len: number) =>
  new DataView(await blob.slice(at, at + len).arrayBuffer());

const u64 = (v: DataView, at: number) =>
  v.getUint32(at, true) + v.getUint32(at + 4, true) * 0x100000000;

/** Entries of a ZIP written by Motion. Data are slices of `blob` (no copies). */
export async function readZip(blob: Blob): Promise<ZipEntry[]> {
  // The end record is in the last 22 bytes, plus up to 64 KB of comment.
  const scanLen = Math.min(blob.size, 22 + 0xffff);
  const scanAt = blob.size - scanLen;
  const tail = await view(blob, scanAt, scanLen);
  let eocd = -1;
  for (let i = scanLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(NOT_A_PROJECT);

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  // ZIP64: the locator sits just before the end record.
  if (eocd >= 20 && tail.getUint32(eocd - 20, true) === 0x07064b50) {
    const z64At = u64(tail, eocd - 20 + 8);
    const z = await view(blob, z64At, 56);
    if (z.getUint32(0, true) !== 0x06064b50) throw new Error(NOT_A_PROJECT);
    count = u64(z, 32);
    cdSize = u64(z, 40);
    cdOffset = u64(z, 48);
  }
  if (cdOffset + cdSize > blob.size) throw new Error(NOT_A_PROJECT);

  const cd = await view(blob, cdOffset, cdSize);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error(NOT_A_PROJECT);
    const method = cd.getUint16(p + 10, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localAt = cd.getUint32(p + 42, true);
    const name = dec.decode(
      new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen),
    );
    // ZIP64 extra field: the 64-bit values that were set to 0xFFFFFFFF.
    let e = p + 46 + nameLen;
    const end = e + extraLen;
    while (e + 4 <= end) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === MAX32) {
          size = u64(cd, q + 8); // uncompressed comes first; stored = same
          q += 16;
        }
        if (localAt === MAX32) localAt = u64(cd, q);
      }
      e += 4 + len;
    }
    if (method !== 0) {
      throw new Error(
        `${name} is compressed. Motion only reads project files it saved itself.`,
      );
    }
    const local = await view(blob, localAt, 30);
    if (local.getUint32(0, true) !== 0x04034b50) throw new Error(NOT_A_PROJECT);
    const dataAt =
      localAt + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    if (dataAt + size > blob.size) throw new Error(NOT_A_PROJECT);
    out.push({ name, data: blob.slice(dataAt, dataAt + size) });
    p = end + commentLen;
  }
  return out;
}
