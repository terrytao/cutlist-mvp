// src/lib/plates-from-joins.ts
import { PlatePack, type PlatePackT, type PlateSpecT } from "@/lib/plate-schema";
import { type ProductionSpecT } from "@/lib/prod-schema";

export function platesFromProductionSpec(spec: ProductionSpecT): PlatePackT {
  const out: PlatePackT = { version: "v1", units: spec.units || "mm", plates: [] };
  const byId = new Map(spec.cutlist.map(p => [p.id, p]));

  for (const j of spec.joins) {
    const host = byId.get(j.hostPartId);
    const insert = j.insertPartId ? byId.get(j.insertPartId) : undefined;
    if (!host) continue;

    const host2D = {
      name: host.name,
      thickness: host.thickness,
      length: host.length, // may be undefined; ok for rabbet
      width: host.width
    };

    if (j.type === "RABBET") {
      if (!insert) continue;
      const plate: PlateSpecT = {
        kind: "RABBET",
        host: host2D,
        insert: { name: insert.name, thickness: insert.thickness },
        rabbet: { width: j.width!, depth: j.depth! }
      };
      out.plates.push(plate);
    }

    if (j.type === "DADO") {
      const plate: PlateSpecT = {
        kind: "DADO",
        host: host2D,
        insert: insert ? { name: insert.name, thickness: insert.thickness } : undefined,
        dado: { axis: j.axis ?? "X", width: j.width!, depth: j.depth!, offset: j.offset }
      };
      out.plates.push(plate);
    }

    if (j.type === "GROOVE") {
      const plate: PlateSpecT = {
        kind: "GROOVE",
        host: host2D,
        insert: insert ? { name: insert.name, thickness: insert.thickness } : undefined,
        groove: { axis: j.axis ?? "X", width: j.width!, depth: j.depth!, offset: j.offset }
      };
      out.plates.push(plate);
    }

    if (j.type === "MORTISE_TENON") {
      if (!insert || !j.mt) continue;
      const plate: PlateSpecT = {
        kind: "MORTISE_TENON",
        host: host2D,
        insert: { name: insert.name, thickness: insert.thickness, length: insert.length, width: insert.width },
        mt: {
          tenonThickness: j.mt.tenonThickness,
          tenonLength: j.mt.tenonLength,
          shoulder: j.mt.shoulder ?? 0,
          haunch: j.mt.haunch ?? 0,
          mortiseDepth: j.depth
        },
        hostEdge: j.hostEdge,
        offset: j.offset,
        width: j.width
      };
      out.plates.push(plate);
    }
  }

  return PlatePack.parse(out);
}
