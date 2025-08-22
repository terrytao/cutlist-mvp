import type { Spec } from "./schema";

/** inches↔mm helpers */
const IN_TO_MM = 25.4;
const toUnits = (units: "in"|"mm", vIn: number) => units === "mm" ? Math.round(vIn * IN_TO_MM * 1000)/1000 : vIn;

/** Pick apron nominal height from class (inches) */
function apronHeightFromClass(cls: string | null | undefined): number {
  if (!cls) return 3.5;
  if (cls === "short") return 2.5;
  if (cls === "tall") return 4.5;
  return 3.5;
}

/** Normalized name test helpers */
const isLeg = (s:string)=>/(^|\s|-)leg(s)?($|\s|-)*/i.test(s);
const isApron = (s:string)=>/apron/i.test(s);
const isStretcher = (s:string)=>/stretcher/i.test(s);
const isSidePanel = (s:string)=>/side( panel)?/i.test(s);
const isShelf = (s:string)=>/shelf/i.test(s);
const isBottom = (s:string)=>/bottom/i.test(s);
const isBack = (s:string)=>/(^| )back( panel)?/i.test(s);

/** Map parts by canonical buckets */
function bucketParts(spec: Spec) {
  const byName = new Map<string, typeof spec.cut_list[number]>();
  for (const p of spec.cut_list) byName.set(p.part, p);

  const legs = spec.cut_list.filter(p => isLeg(p.part));
  const aprons = spec.cut_list.filter(p => isApron(p.part));
  const stretchers = spec.cut_list.filter(p => isStretcher(p.part));
  const sides = spec.cut_list.filter(p => isSidePanel(p.part));
  const shelves = spec.cut_list.filter(p => isShelf(p.part));
  const bottoms = spec.cut_list.filter(p => isBottom(p.part));
  const backs = spec.cut_list.filter(p => isBack(p.part));

  return { byName, legs, aprons, stretchers, sides, shelves, bottoms, backs };
}

/**
 * Compute deterministic joinery list from concept + parts.
 * - Mortise & tenon between legs and aprons/stretchers
 * - Dados for shelf/bottom into side panels
 * Returns a new Spec (does not mutate input).
 */
export function computeJoinery(spec: Spec): Spec {
  const units = spec.units;
  const c = spec.concept;
  const { legs, aprons, stretchers, sides, shelves, bottoms, backs } = bucketParts(spec);

  const j: { type: string; depth: number|null; at_parts: string[] }[] = [];

  // Mortise & tenon for leg+apron archetype
  if (!c || c.archetype === "leg_apron_stretcher") {
    const apronHeightIn = apronHeightFromClass(c?.apron_height_class);
    const mortTenonDepthIn = 0.5; // 1/2" into leg
    const mtDepth = toUnits(units, mortTenonDepthIn);

    if (legs.length && (aprons.length || stretchers.length)) {
      const apronNames = aprons.map(p => p.part);
      const stretcherNames = stretchers.map(p => p.part);
      // Attach aprons to legs
      if (apronNames.length) {
        j.push({ type: "mortise_tenon", depth: mtDepth, at_parts: [...legs.map(p=>p.part), ...apronNames] });
      }
      // Attach stretchers to legs (if present)
      if (stretcherNames.length) {
        j.push({ type: "mortise_tenon", depth: mtDepth, at_parts: [...legs.map(p=>p.part), ...stretcherNames] });
      }
    }
  }

  // Dados for shelf/bottom/back into side panels (panel carcass or hybrid)
  const dadoDepthIn = 0.25; // 1/4"
  const dadoDepth = toUnits(units, dadoDepthIn);
  if (sides.length) {
    if (shelves.length) {
      j.push({ type: "dado", depth: dadoDepth, at_parts: [...sides.map(p=>p.part), ...shelves.map(p=>p.part)] });
    }
    if (bottoms.length) {
      j.push({ type: "dado", depth: dadoDepth, at_parts: [...sides.map(p=>p.part), ...bottoms.map(p=>p.part)] });
    }
    if (backs.length) {
      j.push({ type: "dado", depth: dadoDepth, at_parts: [...sides.map(p=>p.part), ...backs.map(p=>p.part)] });
    }
  }

  return { ...spec, joinery: j };
}
