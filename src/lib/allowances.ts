import { z } from "zod";
import { PartSchema } from "./schema";

export type Part = z.infer<typeof PartSchema>;
type EdgeSide = "front" | "back" | "left" | "right";

export function applyKerf(p: Part, kerf: number): Part {
  return { ...p, length: p.length + kerf, width: p.width + kerf };
}
export function applyKerfToList(list: Part[], kerf: number): Part[] {
  return list.map(p => applyKerf(p, kerf));
}

export function edgeBandOverhang(p: Part, sides: EdgeSide[], overhang: number): Part {
  let { length, width } = p;
  if (sides.includes("front")) length += overhang;
  if (sides.includes("back"))  length += overhang;
  if (sides.includes("left"))  width  += overhang;
  if (sides.includes("right")) width  += overhang;
  return { ...p, length, width };
}
export function applyEdgeBandingToList(
  list: Part[],
  eb: { part: string; sides: EdgeSide[]; overhang: number | null }[],
  defaultOverhang: number
): Part[] {
  return list.map(p => {
    const entries = eb.filter(e => e.part === p.part);
    if (!entries.length) return p;
    return entries.reduce(
      (acc, e) => edgeBandOverhang(acc, e.sides, e.overhang ?? defaultOverhang),
      p
    );
  });
}

/** Heuristic dado offsets:
 *  - shelves/bottoms fitting between left/right sides → shrink width by 2×depth
 *  - back panel → shrink width by 2×depth (fits into side dados)
 *  This is a simple demo; refine with explicit targets/orientation later.
 */
export function applyDadoOffsets(
  list: Part[],
  joinery: { type: string; depth: number | null; at_parts: string[] }[],
  units: "in" | "mm"
): Part[] {
  const depthDefault = units === "mm" ? 6 : 0.25; // 6mm or 1/4"
  return list.map(p => {
    const out = { ...p };
    for (const j of joinery) {
      if (!j.type.toLowerCase().includes("dado")) continue;
      const d = j.depth ?? depthDefault;
      if (/(shelf|bottom)/i.test(p.part) && j.at_parts.some(n => /side/i.test(n))) {
        out.width = Math.max(0, out.width - 2 * d);
      }
      if (/back/i.test(p.part)) {
        out.width = Math.max(0, out.width - 2 * d);
      }
    }
    return out;
  });
}
