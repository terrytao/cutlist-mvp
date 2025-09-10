// src/app/api/plates/from-spec/route.ts
import { ProductionSpec } from "@/lib/prod-schema";
import { platesFromProductionSpec } from "@/lib/plates-from-joins";
import { PlatePack } from "@/lib/plate-schema";
import { buildPlateUrl } from "@/lib/plateUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { spec } = await req.json();
    const ps = ProductionSpec.parse(spec);
    const pack = platesFromProductionSpec(ps);

    // Add plate URLs for rabbet/dado/groove (mortise/tenon URL only if you have that route)
    const withUrls = pack.plates.map((p) => {
      let url: string | null = null;
      if (p.kind === "RABBET") url = buildPlateUrl("rabbet", { units: pack.units, host: p.host, insert: p.insert, rabbet: p.rabbet });
      if (p.kind === "DADO")   url = buildPlateUrl("dado",   { units: pack.units, host: p.host, insert: p.insert, dado: p.dado });
      if (p.kind === "GROOVE") url = buildPlateUrl("groove", { units: pack.units, host: p.host, insert: p.insert, groove: p.groove });
      // if you have a mortise route, build that here
      return { ...p, url };
    });

    return new Response(JSON.stringify({ units: pack.units, plates: withUrls }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 400 });
  }
}

