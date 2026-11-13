/**
 * Colour lookup tables (.cube files, as written by Resolve, Premiere and
 * most LUT packs). Only 3D LUTs: they're what "looks" are made of.
 */
import type { Id } from "./model.ts";
import type { Property } from "./property.ts";

export interface CubeLut {
  title: string;
  /** Points per side; the table has size³ colours. */
  size: number;
  /** RGB triplets, red changing fastest, then green, then blue. */
  data: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

/** A LUT file the user added to the project. The file is stored outside. */
export interface LutAsset {
  id: Id;
  name: string;
  fileName: string;
}

/** A layer's LUT and how strongly it applies (0 to 1). */
export interface LayerLut {
  id: Id;
  intensity: Property<number>;
}

/** Biggest LUT accepted: 128³ colours (common packs use 17 to 65). */
const MAX_SIZE = 128;

export function parseCube(text: string): CubeLut {
  let title = "";
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  const triple = (parts: string[], what: string): [number, number, number] => {
    const nums = parts.slice(0, 3).map(Number);
    if (nums.length !== 3 || nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`The LUT has a ${what} that isn't a number.`);
    }
    return nums as [number, number, number];
  };

  for (const raw of text.replace(/^﻿/, "").split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const word = parts[0]?.toUpperCase();
    if (word === "TITLE") {
      title = line.slice(5).trim().replace(/^"|"$/g, "");
    } else if (word === "LUT_1D_SIZE") {
      throw new Error(
        "This is a 1D LUT. Motion uses 3D LUTs (the usual kind for looks).",
      );
    } else if (word === "LUT_3D_SIZE") {
      size = Number(parts[1]);
      if (!Number.isInteger(size) || size < 2)
        throw new Error("The LUT has an invalid size.");
      if (size > MAX_SIZE)
        throw new Error(`The LUT is too big (more than ${MAX_SIZE} per side).`);
    } else if (word === "DOMAIN_MIN") {
      domainMin = triple(parts.slice(1), "domain");
    } else if (word === "DOMAIN_MAX") {
      domainMax = triple(parts.slice(1), "domain");
    } else if (word && /^[A-Z_]+$/.test(word)) {
      // Other keywords (LUT_3D_INPUT_RANGE, etc.) don't change the table.
    } else {
      values.push(...triple(parts, "colour value"));
    }
  }
  if (!size)
    throw new Error("This file has no LUT size, so it isn't a 3D LUT.");
  const expected = size * size * size;
  if (values.length / 3 !== expected) {
    throw new Error(
      `The LUT should have ${expected} colours, found ${values.length / 3}.`,
    );
  }
  return { title, size, data: new Float32Array(values), domainMin, domainMax };
}
