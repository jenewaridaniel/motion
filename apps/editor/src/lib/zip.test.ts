import { describe, expect, it } from "vitest";
import { crc32, readZip, writeZip } from "./zip.ts";

const text = (s: string) => new Blob([s]);

describe("crc32", () => {
  it("matches known values", async () => {
    expect(await crc32(text(""))).toBe(0);
    expect(await crc32(text("123456789"))).toBe(0xcbf43926);
    expect(
      await crc32(text("The quick brown fox jumps over the lazy dog")),
    ).toBe(0x414fa339);
  });

  it("gives the same answer when read in small chunks", async () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 31) % 251);
    expect(await crc32(new Blob([big]), 4096)).toBe(
      await crc32(new Blob([big])),
    );
  });
});

describe("zip", () => {
  it("round-trips names and contents, including UTF-8 names", async () => {
    const zip = await writeZip([
      { name: "project.json", data: text('{"a":1}') },
      {
        name: "media/clip één.mp4",
        data: new Blob([new Uint8Array([0, 1, 2, 255])]),
      },
      { name: "empty.txt", data: text("") },
    ]);
    const entries = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual([
      "project.json",
      "media/clip één.mp4",
      "empty.txt",
    ]);
    expect(await entries[0]!.data.text()).toBe('{"a":1}');
    expect([...new Uint8Array(await entries[1]!.data.arrayBuffer())]).toEqual([
      0, 1, 2, 255,
    ]);
    expect(entries[2]!.data.size).toBe(0);
  });

  it("refers to the original data instead of copying it", async () => {
    const payload = new Blob([new Uint8Array(1_000_000)]);
    const zip = await writeZip([{ name: "big.bin", data: payload }]);
    // Headers are small: the archive is the payload plus a little.
    expect(zip.size - payload.size).toBeLessThan(200);
  });

  it("refuses something that isn't a zip", async () => {
    await expect(readZip(text("definitely not a zip file"))).rejects.toThrow(
      /not a Motion project file/i,
    );
  });

  it("refuses an entry that's compressed (only stored entries are written by Motion)", async () => {
    const zip = await writeZip([{ name: "a.txt", data: text("hello") }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    bytes[8] = 8; // local header: method = deflate
    // Central directory copy too.
    const cd = bytes.length - 22 - (46 + "a.txt".length);
    bytes[cd + 10] = 8;
    await expect(readZip(new Blob([bytes]))).rejects.toThrow(/compressed/i);
  });
});

describe("zip64", () => {
  it("round-trips when sizes and offsets use the 64-bit format", async () => {
    // A tiny threshold forces the ZIP64 path that real 4 GB+ files take.
    const zip = await writeZip(
      [
        { name: "a.bin", data: new Blob([new Uint8Array(100).fill(7)]) },
        { name: "b.bin", data: new Blob([new Uint8Array(50).fill(9)]) },
      ],
      { zip64Above: 10 },
    );
    const entries = await readZip(zip);
    expect(entries.map((e) => [e.name, e.data.size])).toEqual([
      ["a.bin", 100],
      ["b.bin", 50],
    ]);
    expect(new Uint8Array(await entries[1]!.data.arrayBuffer())[0]).toBe(9);
  });
});
