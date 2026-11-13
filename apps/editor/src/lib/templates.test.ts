import { TEMPLATES } from "@motion/core";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "./fonts.generated.ts";

describe("templates", () => {
  it("only use fonts that come with the editor", () => {
    const bundled = new Set(BUNDLED_FONTS.map((f) => f.family));
    for (const t of TEMPLATES) {
      for (const font of t.fonts)
        expect(bundled.has(font), `${t.id}: ${font}`).toBe(true);
    }
  });
});
