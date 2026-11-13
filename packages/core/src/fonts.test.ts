import { describe, expect, it } from "vitest";
import { addFont } from "./edit.ts";
import { History } from "./history.ts";
import { createProject } from "./model.ts";
import { parseProject } from "./serialize.ts";

describe("uploaded fonts", () => {
  it("are listed in the project and saved with it", () => {
    const h = new History();
    const p = h.apply(
      createProject(),
      (d) =>
        void addFont(d, {
          id: "f1",
          family: "My Brand Sans",
          fileName: "brand.otf",
        }),
    );
    expect(p.fonts).toEqual({
      f1: { id: "f1", family: "My Brand Sans", fileName: "brand.otf" },
    });
    const r = parseProject(structuredClone(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.fonts).toEqual(p.fonts);
  });

  it("loads projects saved before fonts existed", () => {
    const p = structuredClone(createProject()) as { fonts?: unknown };
    delete p.fonts;
    expect(parseProject(p).ok).toBe(true);
  });

  it("refuses a broken font entry", () => {
    const p = structuredClone(createProject()) as { fonts?: unknown };
    p.fonts = { f1: { id: "f1", family: 42 } };
    expect(parseProject(p).ok).toBe(false);
  });

  it("is one undo step", () => {
    const h = new History();
    const p0 = createProject();
    const p = h.apply(
      p0,
      (d) => void addFont(d, { id: "f1", family: "X", fileName: "x.ttf" }),
    );
    expect(h.undo(p).fonts ?? {}).toEqual({});
  });
});
