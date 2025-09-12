// src/app/api/spec/production/route.ts
import OpenAI from "openai";
import { ProductionSpec, type ProductionSpecT } from "@/lib/prod-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(ps: ProductionSpecT): ProductionSpecT {
  const out = JSON.parse(JSON.stringify(ps)) as ProductionSpecT;
  out.version = "v1"; out.units = "mm";
  const r=(n:number)=>Math.round(n);
  out.overall.W=r(out.overall.W); out.overall.D=r(out.overall.D); out.overall.H=r(out.overall.H);
  out.cutlist = out.cutlist.map(p=>({...p, thickness:r(p.thickness), length:r(p.length), width:r(p.width)}));
  out.joins = out.joins.map(j=>({...j,
    width: j.width!=null?r(j.width):j.width,
    depth: j.depth!=null?r(j.depth):j.depth,
    offset:j.offset!=null?r(j.offset):j.offset,
    mt: j.mt?{...j.mt, tenonThickness:r(j.mt.tenonThickness), tenonLength:r(j.mt.tenonLength),
              shoulder:r(j.mt.shoulder??0), haunch:r(j.mt.haunch??0)}:undefined}));
  return out;
}

function dynamicFallback(prompt?: string): ProductionSpecT {
  const p = (prompt || '').toLowerCase();
  // Type guess
  const type = p.includes('bench') ? 'bench'
    : p.includes('desk') ? 'desk'
    : p.includes('nightstand') ? 'nightstand'
    : p.includes('end table') ? 'end_table'
    : p.includes('coffee') ? 'coffee_table'
    : p.includes('table') ? 'table'
    : 'project';

  // Dimension parsing: try WxDxH first (e.g., 24x12x18 or 24" x 12" x 18")
  const mmPerIn = 25.4;
  let Wmm = 610, Dmm = 610, Hmm = 457;
  const m1 = p.match(/(\d+(?:\.\d+)?)\s*["']?\s*[x×]\s*(\d+(?:\.\d+)?)\s*["']?\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if (m1) {
    const W = parseFloat(m1[1]);
    const D = parseFloat(m1[2]);
    const H = parseFloat(m1[3]);
    // assume inches if quotes or if typical inchy sizes
    const inches = /"|inch|in\b/.test(p) || (W <= 120 && D <= 120 && H <= 120);
    const k = inches ? mmPerIn : 1;
    Wmm = Math.round(W * k);
    Dmm = Math.round(D * k);
    Hmm = Math.round(H * k);
  } else {
    // Try separate mentions like 24w 12d 18h
    const w2 = p.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|mm)?\s*w\b/);
    const d2 = p.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|mm)?\s*d\b/);
    const h2 = p.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|mm)?\s*h\b/);
    const inches = /"|inch|in\b/.test(p);
    const k = inches ? mmPerIn : 1;
    if (w2) Wmm = Math.round(parseFloat(w2[1]) * k);
    if (d2) Dmm = Math.round(parseFloat(d2[1]) * k);
    if (h2) Hmm = Math.round(parseFloat(h2[1]) * k);
  }

  // Basic proportions
  const top = 18, leg = 50, apn = 18;
  const apronW = Math.max(70, Math.round(Hmm * 0.18));

  const spec: ProductionSpecT = {
    version: 'v1', units: 'mm',
    metadata: { type, title: `${type.replace(/_/g,' ')} (${Wmm}×${Dmm}×${Hmm})` },
    overall: { W: Wmm, D: Dmm, H: Hmm },
    materials: [ { name:'Plywood', thickness: top }, { name:'Pine', thickness: leg } ],
    tolerances: { fitSnug:-0.10, fitStandard:0, fitLoose:0.20 },
    cutlist: [
      { id:'top', name:'Top', material:'Plywood', thickness: top, length: Dmm, width: Wmm, qty:1 },
      { id:'leg-fl', name:'Leg - Front Left',  material:'Pine', thickness: leg, length: Hmm-top, width: leg, qty:1 },
      { id:'leg-fr', name:'Leg - Front Right', material:'Pine', thickness: leg, length: Hmm-top, width: leg, qty:1 },
      { id:'leg-bl', name:'Leg - Back Left',   material:'Pine', thickness: leg, length: Hmm-top, width: leg, qty:1 },
      { id:'leg-br', name:'Leg - Back Right',  material:'Pine', thickness: leg, length: Hmm-top, width: leg, qty:1 },
      { id:'apron-f', name:'Apron - Front', material:'Pine', thickness: apn, length: Math.max(1, Wmm-2*leg), width: apronW, qty:1 },
      { id:'apron-b', name:'Apron - Back',  material:'Pine', thickness: apn, length: Math.max(1, Wmm-2*leg), width: apronW, qty:1 },
      { id:'apron-l', name:'Apron - Left',  material:'Pine', thickness: apn, length: Math.max(1, Dmm-2*leg), width: apronW, qty:1 },
      { id:'apron-r', name:'Apron - Right', material:'Pine', thickness: apn, length: Math.max(1, Dmm-2*leg), width: apronW, qty:1 },
    ],
    joins: [
      { type:'MORTISE_TENON', hostPartId:'leg-fl', hostEdge:'E', insertPartId:'apron-f', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-fr', hostEdge:'W', insertPartId:'apron-f', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-bl', hostEdge:'E', insertPartId:'apron-b', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-br', hostEdge:'W', insertPartId:'apron-b', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-fl', hostEdge:'N', insertPartId:'apron-l', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-bl', hostEdge:'S', insertPartId:'apron-l', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-fr', hostEdge:'N', insertPartId:'apron-r', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
      { type:'MORTISE_TENON', hostPartId:'leg-br', hostEdge:'S', insertPartId:'apron-r', width: apronW, depth: 20, fit:'standard', mt:{ tenonThickness:6, tenonLength:18, shoulder:3, haunch:0 } },
    ],
  };
  return spec;
}

function stripCodeFences(s: string) {
  // remove markdown code fences like ```json ... ```
  return s.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
}
function extractJsonBlock(s: string): string | null {
  const txt = stripCodeFences(s);
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start >= 0 && end > start) return txt.slice(start, end + 1);
  return null;
}

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, lenient, includeRaw } = await req.json() as { prompt?: string; imageUrl?: string; lenient?: boolean; includeRaw?: boolean };
    if (process.env.DRY_RUN_LLM === "1") return new Response(JSON.stringify({ spec: norm(dynamicFallback(prompt)), _debug:{dryRun:true, dynamic:true} },null,2),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    if (!process.env.OPENAI_API_KEY) return new Response(JSON.stringify({error:"Missing OPENAI_API_KEY"}),{status:500});
    if (!prompt?.trim()) return new Response(JSON.stringify({error:"Missing 'prompt' in body"}),{status:400});

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.SPEC_MODEL || "gpt-4o-mini";
    const system = "You are a woodworking CAD/CAM assistant. Output ONLY JSON matching ProductionSpec v1. Include full cutlist[] and joins[]. Defaults: units 'mm', fits 'standard'.";
    const ask:any[] = [{type:"text",text:`Produce ProductionSpec v1 for:\n${prompt}\nReturn ONLY JSON.`}];
    if (imageUrl) ask.push({type:"image_url", image_url:{url:imageUrl}});

    const r1 = await client.chat.completions.create({
      model, temperature:0, max_tokens:2000,
      messages:[{role:"system",content:system},{role:"user",content:ask as any}],
      response_format:{type:"json_object"}
    });
    let raw = r1.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = ProductionSpec.parse(JSON.parse(raw));
      const body = { spec: norm(parsed), _debug:{model:(r1 as any).model, usage:r1.usage, pass:1} } as any;
      if (includeRaw) body._raw = stripCodeFences(raw);
      return new Response(JSON.stringify(body,null,2),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    } catch {
      // Lenient attempt on first pass
      if (lenient) {
        try {
          const block = extractJsonBlock(raw);
          if (block) {
            const parsedL = ProductionSpec.parse(JSON.parse(block));
            const body = { spec: norm(parsedL), _debug:{model:(r1 as any).model, usage:r1.usage, pass:1, lenient:true} } as any;
            if (includeRaw) body._raw = stripCodeFences(block);
            return new Response(JSON.stringify(body,null,2),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
          }
        } catch {}
      }
      const r2 = await client.chat.completions.create({
        model, temperature:0, max_tokens:2000,
        messages:[
          {role:"system",content:system},
          {role:"user",content:ask as any},
          {role:"assistant",content:raw},
          {role:"user",content:`Your JSON failed validation. Return ONLY corrected JSON.`}
        ],
        response_format:{type:"json_object"}
      });
      raw = r2.choices[0]?.message?.content ?? "{}";
      try {
        const parsed2 = ProductionSpec.parse(JSON.parse(raw));
        const body = { spec: norm(parsed2), _debug:{model:(r2 as any).model, usage:r2.usage, pass:2} } as any;
        if (includeRaw) body._raw = stripCodeFences(raw);
        return new Response(JSON.stringify(body,null,2),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      } catch {
        if (lenient) {
          try {
            const block2 = extractJsonBlock(raw);
            if (block2) {
              const parsed2L = ProductionSpec.parse(JSON.parse(block2));
              const body = { spec: norm(parsed2L), _debug:{model:(r2 as any).model, usage:r2.usage, pass:2, lenient:true} } as any;
              if (includeRaw) body._raw = stripCodeFences(block2);
              return new Response(JSON.stringify(body,null,2),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
            }
          } catch {}
        }
        // Fallback with debug context
        const spec = dynamicFallback(prompt);
        const dbg = { fallback:true, dynamic:true, sample: (raw||'').slice(0,200) } as any;
        const out:any = { spec: norm(spec), _debug: dbg };
        if (includeRaw) out._raw = stripCodeFences(raw||'');
        return new Response(JSON.stringify(out,null,2),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      }
    }
  } catch (e:any) {
    return new Response(JSON.stringify({error:e?.message||String(e)}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
}
