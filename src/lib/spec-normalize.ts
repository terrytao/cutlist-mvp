// src/lib/spec-normalize.ts
// Normalize a parsed spec into canonical, deterministic values so plates/G-code are stable.

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function round(v: number) { return Math.round(v); }

export function normalizeSpec(input: any, prompt = ""): any {
  // deep copy to avoid mutating caller
  const out = JSON.parse(JSON.stringify(input || {}));

  // units -> always 'mm' for CAM stability
  out.units = "mm";

  // ensure required trees exist
  out.assembly = out.assembly ?? {};
  out.assembly.overall = out.assembly.overall ?? {};
  out.assembly.joinery_policy = out.assembly.joinery_policy ?? {};

  // type -> canonical casing
  if (typeof out.assembly.type === "string") {
    out.assembly.type = out.assembly.type.trim().toLowerCase();
  } else {
    out.assembly.type = /\bcoffee\s*table\b/i.test(prompt) ? "coffee table" : "project";
  }

  // dimensions -> clamp & round
  const W = Number(out.assembly.overall.W ?? 1220); // ~48"
  const D = Number(out.assembly.overall.D ?? 610);  // ~24"
  let H  = Number(out.assembly.overall.H ?? NaN);
  if (!Number.isFinite(H)) {
    H = /\bcoffee\s*table\b/i.test(prompt) ? 457 : 750; // coffee table ~18" else ~29.5"
  }

  out.assembly.overall.W = round(clamp(W, 50, 4000));
  out.assembly.overall.D = round(clamp(D, 50, 4000));
  out.assembly.overall.H = round(clamp(H, 50, 2000));

  // joinery fits default
  out.assembly.joinery_policy.fits = out.assembly.joinery_policy.fits ?? "standard";

  // materials -> stable ordering
  if (!Array.isArray(out.materials)) out.materials = [];
  out.materials = out.materials
    .map((m: any) => ({ name: String(m?.name ?? "Material"), thickness: Number(m?.thickness ?? 18) }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return out;
}
