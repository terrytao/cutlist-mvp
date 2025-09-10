// src/app/api/spec/production/route.ts
import OpenAI from "openai";
import { z } from "zod";
import { ProductionSpec, type ProductionSpecT } from "@/lib/prod-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Normalize to keep CAM deterministic (lock mm, round mm) */
function normalize(ps: ProductionSpecT, prompt: string): ProductionSpecT {
  const out = JSON.parse(JSON.stringify(ps)) as ProductionSpecT;
  out.version = "v1";
  out.units = "mm";
  const r = (n: number) => Math.round(n);
  out.overall.W = r(out.overall.W);
  out.overall.D = r(out.overall.D);
  out.overall.H = r(out.overall.H);
  out.cutlist = out.cutlist.map(p => ({
    ...p,
    thickness: r(p.thickness),
    length: r(p.length),
    width: r(p.width),
  }));
  out.joins = out.joins.map(j => ({
    ...j,
    width: j.width != null ? r(j.width) : j.width,
    depth: j.depth != null ? r(j.depth) : j.depth,
    offset: j.offset != null ? r(j.offset) : j.offset,
    mt: j.mt ? {
      ...j.mt,
      tenonThickness: r(j.mt.tenonThickness),
      tenonLength: r(j.mt.tenonLength),
      shoulder: Math.round((j.mt.shoulder ?? 0)),
      haunch: Math.round((j.mt.haunch ?? 0)),
    } : undefined
  }));
  return out;
}

/** Deterministic fallback (2×2 coffee table) for dev/dry-run */
function fallback(prompt: string): ProductionSpecT {
  const W=610, D=610, H=457, top=18, leg=50, apron=18;
  return {
    version: "v1",
    units: "mm",
    metadata: { type: "coffee_table", title: "Coffee Table 2x2" },
    overall: { W, D, H },
    materials: [{ name: "Plywood", thickness: 18 }, { name: "Pine", thickness: 50 }],
    tolerances: { fitSnug: -0.1, fitStandard: 0, fitLoose: 0.2 },
    cutlist: [
      { id:"top", name:"Top", material:"Plywood", thickness:top, length:D, width:W, qty:1 },
      { id:"leg-fl", name:"Leg - Front Left",  material:"Pine", thickness:leg, length:H-top, width:leg, qty:1 },
      { id:"leg-fr", name:"Leg - Front Right", material:"Pine", thickness:leg, length:H-top, width:leg, qty:1 },
      { id:"leg-bl", name:"Leg - Back Left",   material:"Pine", thickness:leg, length:H-top, width:leg, qty:1 },
      { id:"leg-br", name:"Leg - Back Right",  material:"Pine", thickness:leg, length:H-top, width:leg, qty:1 },
      { id:"apron-f", name:"Apron - Front", material:"Pine", thickness:apron, length:W-2*leg, width:80, qty:1 },
      { id:"apron-b", name:"Apron - Back",  material:"Pine", thickness:apron, length:W-2*leg, width:80, qty:1 },
      { id:"apron-l", name:"Apron - Left",  material:"Pine", thickness:apron, length:D-2*leg, width:80, qty:1 },
      { id:"apron-r", name:"Apron - Right", material:"Pine", thickness:apron, length:D-2*leg, width:80, qty:1 }
    ],
    joins: [
      { type:"MORTISE_TENON", hostPartId:"leg-fl", hostEdge:"E", insertPartId:"apron-f",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-fr", hostEdge:"W", insertPartId:"apron-f",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-bl", hostEdge:"E", insertPartId:"apron-b",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-br", hostEdge:"W", insertPartId:"apron-b",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-fl", hostEdge:"N", insertPartId:"apron-l",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-bl", hostEdge:"S", insertPartId:"apron-l",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-fr", hostEdge:"N", insertPartId:"apron-r",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:"MORTISE_TENON", hostPartId:"leg-br", hostEdge:"S", insertPartId:"apron-r",
        width:80, depth:20, fit:"standard", mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } }
    ]
  };
}

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl } = await req.json() as { prompt?: string; imageUrl?: string };
    if (process.env.DRY_RUN_LLM === "1") {
      const spec = normalize(fallback(prompt || ""), prompt || "");
      return new Response(JSON.stringify({ spec, _debug:{ dryRun:true } }, null, 2), {
        headers: { "Content-Type":"application/json" }
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
    }
    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Missing 'prompt' in body" }), { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.SPEC_MODEL || "gpt-4o-mini";

    const system =
      "You are a woodworking CAD/CAM assistant. Output ONLY JSON matching the ProductionSpec v1 schema. " +
      "Use canonical part names where applicable (Top, Leg - Front Left/Right, Leg - Back Left/Right, Apron - Front/Back/Left/Right). " +
      "Edges: N=top, S=bottom, E=right, W=left on the host (origin at bottom-left). " +
      "Mortise/Tenon: tenonThickness≈1/3 apron thickness, mortiseDepth≈tenonLength. " +
      "Include a full cutlist and a joins[] array referencing cutlist ids. Default units 'mm'.";

    const ask = [
      { type: "text", text:
        `Produce ProductionSpec v1 (cutlist + joins) for:\n${prompt}\nReturn ONLY JSON.` },
      ...(imageUrl ? [{ type: "image_url", image_url: { url: imageUrl } } as any] : [])
    ];

    const res1 = await client.chat.completions.create({
      model, temperature: 0, max_tokens: 2000,
      messages: [{ role:"system", content: system }, { role:"user", content: ask as any }],
      response_format: { type: "json_object" }
    });

    let raw = res1.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = ProductionSpec.parse(JSON.parse(raw));
      const spec = normalize(parsed, prompt);
      return new Response(JSON.stringify({ spec, _debug:{ model:(res1 as any).model, usage:res1.usage, pass:1 } }, null, 2),
        { headers: { "Content-Type":"application/json" } });
    } catch (e1:any) {
      const errMsg = String(e1?.message ?? e1).slice(0, 800);
      const res2 = await client.chat.completions.create({
        model, temperature: 0, max_tokens: 2000,
        messages: [
          { role:"system", content: system },
          { role:"user", content: ask as any },
          { role:"assistant", content: raw },
          { role:"user", content: `Your JSON failed validation:\n${errMsg}\nReturn ONLY corrected JSON.` }
        ],
        response_format: { type: "json_object" }
      });
      raw = res2.choices[0]?.message?.content ?? "{}";
      try {
        const parsed2 = ProductionSpec.parse(JSON.parse(raw));
        const spec = normalize(parsed2, prompt);
        return new Response(JSON.stringify({ spec, _debug:{ model:(res2 as any).model, usage:res2.usage, pass:2 } }, null, 2),
          { headers: { "Content-Type":"application/json" } });
      } catch {
        const spec = normalize(fallback(prompt), prompt);
        return new Response(JSON.stringify({ spec, _debug:{ fallback:true } }, null, 2),
          { headers: { "Content-Type":"application/json" } });
      }
    }
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 400, headers: { "Content-Type":"application/json" }
    });
  }
}
