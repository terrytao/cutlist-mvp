import type { Spec, Part } from "@/lib/schema";

/** Map apron height class → nominal apron height (inches) */
function apronHeightIn(cls: "short" | "medium" | "tall" | null | undefined) {
  if (cls === "short") return 2.5;
  if (cls === "tall") return 4.5;
  return 3.5; // medium / default
}

/** Round nicely per units (keeps table/labels tidy) */
function r(units: "in" | "mm", v: number) {
  const d = units === "mm" ? 1 : 3; // 0.1 mm or 0.001 in
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function findFirst(parts: Part[], pred: (p: Part) => boolean) {
  for (const p of parts) if (pred(p)) return p;
  return undefined;
}

function isLegName(s: string) { return /(^|\s|-)leg(s)?($|\s|-)*/i.test(s); }
function isApronName(s: string) { return /apron/i.test(s); }

/**
 * Compute mortise/tenon parameters for one Leg ⟷ Apron pair.
 * All dimensions are returned in the spec's units.
 */
export function mortiseTenonParams(spec: Spec, hostLegName?: string, insertApronName?: string) {
  const units = spec.units === "mm" ? "mm" as const : "in" as const;

  // pick parts
  const leg = hostLegName
    ? spec.cut_list.find(p => p.part === hostLegName)
    : findFirst(spec.cut_list, p => isLegName(p.part));

  const apron = insertApronName
    ? spec.cut_list.find(p => p.part === insertApronName)
    : findFirst(spec.cut_list, p => isApronName(p.part));

  if (!leg || !apron) {
    throw new Error("Could not find matching Leg and Apron parts by name. Pass ?host=...&insert=... or ensure canonical names.");
  }

  // base numbers (inches). We'll convert back to mm at the end if needed.
  const apronThkIn = spec.units === "mm" ? apron.thickness / 25.4 : apron.thickness;
  const legThkIn   = spec.units === "mm" ? leg.thickness   / 25.4 : leg.thickness;
  const apronHIn   = apronHeightIn(spec.concept?.apron_height_class ?? null);

  // HOUSE RULES (edit to taste)
  // Tenon thickness = clamp(apron_thickness / 3, 1/4" .. 3/8")
  const tenonThkIn = Math.min(0.375, Math.max(0.25, apronThkIn / 3));
  // Tenon length (into leg) = min( 1/2", 0.6 * leg_thickness )
  const tenonLenIn = Math.min(0.5, 0.6 * legThkIn);
  // Shoulder each side on height = 1/8"
  const shoulderIn = 0.125;
  // Mortise height ~ apron height minus shoulders (never < 1.5")
  const mortiseHIn = Math.max(1.5, apronHIn - 2 * shoulderIn);
  const mortiseWIn = tenonThkIn;
  const mortiseDIn = tenonLenIn;

  // Optional fit tweak (press-fit slightly undersized tenon thickness)
  const fitUndersizeIn = 0.004; // ~0.10 mm

  // convert to requested units
  const c = (inches: number) => units === "mm" ? inches * 25.4 : inches;

  return {
    units,
    host: { name: leg.part, section: { t: r(units, c(legThkIn)), note: "square section assumed" } },
    insert: { name: apron.part, thickness: r(units, c(apronThkIn)) },
    mortise: {
      width:  r(units, c(mortiseWIn)),
      height: r(units, c(mortiseHIn)),
      depth:  r(units, c(mortiseDIn))
    },
    tenon: {
      thickness: r(units, c(tenonThkIn - fitUndersizeIn)), // fit applied to tenon thickness
      length:    r(units, c(tenonLenIn)),
      width:     r(units, c(mortiseHIn)),                   // matches mortise height along apron
      shoulders: {
        top: r(units, c(shoulderIn)),
        bottom: r(units, c(shoulderIn)),
        left: r(units, c(0)),
        right: r(units, c(0))
      }
    },
    notes: {
      fit: units === "mm" ? "≈0.10 mm undersize" : "≈0.004 in undersize",
      rule: "tenon_thk = clamp(apron_thk/3, 1/4..3/8); tenon_len = min(1/2, 0.6*leg_thk)"
    }
  };
}

/** Batch stub: extend later to walk all pairs */
export function computeJoineryGeom(spec: Spec) {
  const out: Array<ReturnType<typeof mortiseTenonParams>> = [];
  try { out.push(mortiseTenonParams(spec)); } catch { /* ignore */ }
  return out;
}
