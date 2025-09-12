import type { Units } from "./schema";
import type { ProductionSpecT } from "@/lib/prod-schema";

/** Derive mortise/tenon plate parameters from a production spec and optional host/insert names. */
export function mortiseTenonParams(spec: ProductionSpecT, hostName?: string, insertName?: string) {
  const units = (spec.units || 'mm') as Units;
  const byId = new Map(spec.cutlist.map(p => [p.id, p]));
  const matches = spec.joins.filter(j => j.type === 'MORTISE_TENON' && j.insertPartId && byId.has(j.hostPartId) && byId.has(j.insertPartId));
  if (!matches.length) throw new Error('No mortise/tenon join found in spec');
  let j = matches[0];
  if (hostName || insertName) {
    const norm = (s?: string) => (s || '').toLowerCase();
    const wantH = norm(hostName); const wantI = norm(insertName);
    const best = matches.find(m => {
      const h = byId.get(m.hostPartId)!; const i = byId.get(m.insertPartId!)!;
      const okH = !wantH || norm(h.name).includes(wantH);
      const okI = !wantI || norm(i.name).includes(wantI);
      return okH && okI;
    });
    if (best) j = best;
  }
  const host = byId.get(j.hostPartId)!;
  const insert = byId.get(j.insertPartId!)!;
  if (!j.mt) throw new Error('Missing mt fields on mortise/tenon join');
  const tenon = { thickness: j.mt.tenonThickness, length: j.mt.tenonLength };
  const mortise = {
    width: j.width ?? (insert.width ?? 60),
    height: j.mt.tenonThickness,
    depth: j.depth ?? j.mt.tenonLength,
  };
  return {
    units,
    host: { name: host.name, section: { t: host.thickness } },
    insert: { name: insert.name },
    mortise,
    tenon,
    hostEdge: j.hostEdge,
  } as const;
}
