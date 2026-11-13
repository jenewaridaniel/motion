import { describe, expect, it } from "vitest";
import {
  addShape,
  addText,
  setAspect,
  setShapeKind,
  setShapeSize,
  setShapeStyle,
  splitLayer,
} from "./edit.ts";
import { evaluateFrame } from "./evaluate.ts";
import { History } from "./history.ts";
import { apply } from "./matrix.ts";
import {
  createProject,
  type Project,
  rootComposition,
  type ShapeLayer,
} from "./model.ts";
import { parseProject } from "./serialize.ts";
import {
  type PathCommand,
  SHAPE_KINDS,
  SHAPES,
  STICKERS,
  shapePath,
  shapePathToSvg,
} from "./shapes.ts";
import { sec } from "./time.ts";

const points = (path: PathCommand[]) =>
  path.flatMap((c) => {
    const nums = c.slice(1) as number[];
    const out: [number, number][] = [];
    for (let i = 0; i < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
    return out;
  });

describe("shape outlines", () => {
  it("every shape is a closed outline that stays inside its box", () => {
    for (const kind of SHAPE_KINDS) {
      for (const [w, h] of [
        [200, 100],
        [80, 300],
      ] as const) {
        const path = shapePath(kind, w, h, 30);
        expect(path[0]?.[0], kind).toBe("M");
        expect(path.at(-1)?.[0], kind).toBe("Z");
        for (const [x, y] of points(path)) {
          expect(Math.abs(x), kind).toBeLessThanOrEqual(w / 2 + 1e-9);
          expect(Math.abs(y), kind).toBeLessThanOrEqual(h / 2 + 1e-9);
        }
        // Reaches (close to) both sides of the box, so it isn't tiny.
        const xs = points(path).map((p) => p[0]);
        expect(Math.max(...xs) - Math.min(...xs), kind).toBeGreaterThan(
          w * 0.6,
        );
      }
    }
  });

  it("rounds rectangle corners, never more than half the side", () => {
    const square = shapePath("rect", 100, 100, 0);
    expect(square.some((c) => c[0] === "Q")).toBe(false);
    const round = shapePath("rect", 100, 40, 500);
    expect(round.filter((c) => c[0] === "Q")).toHaveLength(4);
    // Radius capped at 20 (half the height): the top edge starts at x = -30.
    expect(round[0]).toEqual(["M", -30, -20]);
  });

  it("converts to SVG", () => {
    expect(shapePathToSvg(shapePath("triangle", 10, 10))).toBe(
      "M0 -5 L5 5 L-5 5 Z",
    );
  });
});

function setup() {
  const h = new History();
  let textId = "";
  const p = h.apply(createProject(), (d) => {
    textId = addText(d, 0) ?? "";
  });
  return { h, p, textId };
}

const shapes = (p: Project) =>
  rootComposition(p)
    .tracks.flatMap((t) => t.layers)
    .filter((l): l is ShapeLayer => l.kind === "shape");

describe("adding shapes and stickers", () => {
  it("adds in the middle of the canvas, sized from the short side", () => {
    const { h, p: p0 } = setup();
    const heart = STICKERS.find((s) => s.id === "heart")!;
    const p = h.apply(p0, (d) => void addShape(d, heart, sec(1)));
    const [s] = shapes(p);
    const comp = rootComposition(p);
    const short = Math.min(comp.width, comp.height);
    expect(s!.start).toBe(sec(1));
    expect(s!.size).toEqual([
      Math.round(heart.size[0] * short),
      Math.round(heart.size[1] * short),
    ]);
    expect(s!.style).toEqual(heart.style);
    expect(s!.name).toBe("Heart");
    const draw = evaluateFrame(p, sec(2)).find((d) => d.layerId === s!.id)!;
    expect(draw.source).toEqual({
      kind: "shape",
      shape: "heart",
      size: s!.size,
      style: heart.style,
    });
    expect(apply(draw.matrix, 0, 0)).toEqual([comp.width / 2, comp.height / 2]);
  });

  it("goes under text, so captions stay on top", () => {
    const { h, p: p0, textId } = setup();
    const p = h.apply(p0, (d) => void addShape(d, SHAPES[0]!, 0));
    const ids = evaluateFrame(p, sec(1)).map((d) => d.layerId);
    // Draw order is bottom to top: the shape first, the text after.
    expect(ids.indexOf(shapes(p)[0]!.id)).toBeLessThan(ids.indexOf(textId));
  });

  it("shares a graphics track when there's room, and stacks when not", () => {
    const { h, p: p0 } = setup();
    let p = h.apply(p0, (d) => {
      addShape(d, SHAPES[0]!, 0);
      addShape(d, SHAPES[1]!, sec(5));
      addShape(d, SHAPES[2]!, sec(1));
    });
    const tracks = rootComposition(p).tracks.filter(
      (t) => t.name === "Graphics",
    );
    expect(tracks.map((t) => t.layers.length)).toEqual([1, 2]);
    // Splitting a shape keeps both halves identical in look.
    const id = shapes(p).find((s) => s.start === sec(5))!.id;
    p = h.apply(p, (d) => void splitLayer(d, id, sec(6)));
    const halves = shapes(p).filter((s) => s.shape === SHAPES[1]!.shape);
    expect(halves).toHaveLength(2);
    expect(halves[0]!.style).toEqual(halves[1]!.style);
  });

  it("style, size and kind can be changed, and undone", () => {
    const { h, p: p0 } = setup();
    let p = h.apply(p0, (d) => void addShape(d, SHAPES[0]!, 0));
    const id = shapes(p)[0]!.id;
    p = h.apply(p, (d) => {
      setShapeStyle(d, id, {
        fill: "#ff0000",
        stroke: { color: "#000000", width: -5 },
      });
      setShapeSize(d, id, [300.4, 0]);
      setShapeKind(d, id, "star");
    });
    const s = shapes(p)[0]!;
    expect(s.style.fill).toBe("#ff0000");
    expect(s.style.stroke).toEqual({ color: "#000000", width: 0 });
    expect(s.size).toEqual([300, 1]);
    expect(s.shape).toBe("star");
    expect(shapes(h.undo(p))[0]!.shape).toBe("rect");
  });

  it("keeps its place on the canvas when the shape of the canvas changes", () => {
    const { h, p: p0 } = setup();
    let p = h.apply(p0, (d) => void addShape(d, SHAPES[0]!, 0));
    p = h.apply(p, (d) => void setAspect(d, "16:9"));
    const comp = rootComposition(p);
    expect(shapes(p)[0]!.transform.position.value).toEqual([
      comp.width / 2,
      comp.height / 2,
    ]);
  });

  it("are saved and checked on load", () => {
    const { h, p: p0 } = setup();
    const p = h.apply(p0, (d) => {
      for (const s of [...SHAPES, ...STICKERS]) addShape(d, s, 0);
    });
    const r = parseProject(structuredClone(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);
    const bad = structuredClone(p);
    (shapes(bad)[0] as unknown as { shape: string }).shape = "blob";
    expect(parseProject(bad).ok).toBe(false);
    const badFill = structuredClone(p);
    (shapes(badFill)[0]!.style as { fill: unknown }).fill = "red";
    expect(parseProject(badFill).ok).toBe(false);
  });
});
