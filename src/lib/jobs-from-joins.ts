import type { ProductionSpecT } from '@/lib/prod-schema';

type Units = 'mm'|'in';
type CamJob = {
  type: 'RABBET'|'DADO'|'GROOVE';
  label?: string;
  host: { name?: string; width: number; length: number };
  // common
  width: number; depth: number; offset?: number; axis?: 'X'|'Y';
  // rabbet
  edge?: 'N'|'S'|'E'|'W';
};

export function jobsFromProductionSpec(ps: ProductionSpecT): { units: Units; jobs: CamJob[] } {
  const units = (ps.units || 'mm') as Units;
  const byId = new Map(ps.cutlist.map(p => [p.id, p]));
  const jobs: CamJob[] = [];

  for (const j of ps.joins) {
    const host = byId.get(j.hostPartId);
    if (!host) continue;
    const host2d = { name: host.name, width: host.width, length: host.length };

    if (j.type === 'RABBET' && j.width && j.depth) {
      jobs.push({ type: 'RABBET', label: `${host.name}`, host: host2d, width: j.width, depth: j.depth, edge: j.hostEdge });
      continue;
    }
    if (j.type === 'DADO' && j.width && j.depth) {
      jobs.push({ type: 'DADO', label: `${host.name}`, host: host2d, width: j.width, depth: j.depth, offset: j.offset, axis: j.axis || 'X' });
      continue;
    }
    if (j.type === 'GROOVE' && j.width && j.depth) {
      jobs.push({ type: 'GROOVE', label: `${host.name}`, host: host2d, width: j.width, depth: j.depth, offset: j.offset, axis: j.axis || 'X' });
      continue;
    }
    // Mortise/tenon CAM not emitted here; render with plates/CSG for now
  }
  return { units, jobs };
}

