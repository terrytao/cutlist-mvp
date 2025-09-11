// src/app/api/plates/from-spec/route.ts
import { ProductionSpec } from "@/lib/prod-schema";
import { platesFromProductionSpec } from "@/lib/plates-from-joins";
import { buildPlateUrl } from "@/lib/plateUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { spec } = await req.json();
    const ps = ProductionSpec.parse(spec);
    const pack = platesFromProductionSpec(ps);

    const plates = pack.plates.map((p:any) => {
      if (p.kind === "RABBET")   return { ...p, url: buildPlateUrl("rabbet",  { units: pack.units, host: p.host, insert: p.insert, rabbet: p.rabbet }) };
      if (p.kind === "DADO")     return { ...p, url: buildPlateUrl("dado",    { units: pack.units, host: p.host, insert: p.insert, dado: p.dado }) };
      if (p.kind === "GROOVE")   return { ...p, url: buildPlateUrl("groove",  { units: pack.units, host: p.host, insert: p.insert, groove: p.groove }) };
      if (p.kind === "MORTISE_TENON") {
        const url  = buildPlateUrl("mortise", { units: pack.units, host: p.host, insert: p.insert, mt: p.mt, hostEdge: p.hostEdge, width: p.width });
        const url_tenon = buildPlateUrl("tenon",   { units: pack.units, insert: p.insert, mt: p.mt, width: p.width ?? p.insert?.width });
        return { ...p, url, url_tenon };
      }
      return { ...p, url: null };
    });

    return new Response(JSON.stringify({ units: pack.units, plates }, null, 2), { headers:{'Content-Type':'application/json'} });
  } catch (e:any) {
    return new Response(JSON.stringify({error:e?.message||String(e)}),{status:400,headers:{'Content-Type':'application/json'}});
  }
}
