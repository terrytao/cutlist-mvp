// src/app/api/spec/route.ts
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- Schema ---------------- */
const SpecSchema = z.object({
  units: z.enum(["mm", "in"]).default("mm"),
  materials: z.array(z.object({
    name: z.string(),
    thickness: z.number().positive()
  })).default([]),
  assembly: z.object({
    type: z.string(),
    overall: z.object({
      W: z.number().positive(),
      D: z.number().positive(),
      H: z.number().positive(),
    }),
    joinery_policy: z.object({
      shelves: z.enum(["dado","screw","none"]).optional(),
      back: z.enum(["rabbet","groove","none"]).optional(),
      fits: z.enum(["snug","standard","loose"]).default("standard"),
    }).default({})
  })
});
type Spec = z.infer<typeof SpecSchema>;

/* ---------------- Small helpers ---------------- */

// Parse patterns like "2x4 feet", "2 x 4 ft", "48x24 in", etc.
function parseDimsFromPrompt(prompt: string): { Wmm?: number; Dmm?: number; Hmm?: number } {
  const p = prompt.toLowerCase().replace(/[\u00D7]/g, "x"); // × -> x
  // Try formats: "<a>x<b> ft|feet" or "<a> x <b> in|inch|inches"
  const mFt = p.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)\b/);
  const mIn = p.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\b/);

  let W_in: number | undefined;
  let D_in: number | undefined;

  if (mFt) {
    W_in = parseFloat(mFt[1]) * 12;
    D_in = parseFloat(mFt[2]) * 12;
  } else if (mIn) {
    W_in = parseFloat(mIn[1]);
    D_in = parseFloat(mIn[2]);
  }

  // Coffee table typical height ~ 17–19 in; default 18 in if not given
  let H_in: number | undefined;
  const mH = p.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\s*(?:tall|height|high)\b/);
  if (mH) H_in = parseFloat(mH[1]);
  if (!H_in) {
    if (p.includes("coffee table")) H_in = 18;
  }

  const toMM = (inches: number) => Math.round(inches * 25.4);
  return {
    Wmm: W_in ? toMM(W_in) : undefined,
    Dmm: D_in ? toMM(D_in) : undefined,
    Hmm: H_in ? toMM(H_in) : undefined,
  };
}

// Build a safe fallback spec from prompt if the model fails twice
function fallbackSpec(prompt: string): Spec {
  const { Wmm, Dmm, Hmm } = parseDimsFromPrompt(prompt);
  const W = Wmm ?? 1220;  // ~48"
  const D = Dmm ?? 610;   // ~24"
  const H = Hmm ?? 450;   // ~18"
  const type = /coffee\s*table/i.test(prompt) ? "coffee_table" : "project";

  return {
    units: "mm",
    materials: [{ name: "Birch Ply", thickness: 18 }],
    assembly: {
      type,
      overall: { W, D, H },
      joinery_policy: { fits: "standard" }
    }
  };
}

/* ---------------- Simple dev cache ---------------- */
const mem = new Map<string, Spec>();
const cacheKey = (obj: any) => JSON.stringify(obj);

/* ---------------- Route ---------------- */
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.length < 20) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid OPENAI_API_KEY. Add it to .env.local and restart the dev server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { prompt, imageUrl } = await req.json() as { prompt?: string; imageUrl?: string };
    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Missing 'prompt' in request body." }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // $0 runs when desired
    if (process.env.DRY_RUN_LLM === "1") {
      const demo = fallbackSpec(prompt);
      return new Response(JSON.stringify({ spec: demo, _debug: { dryRun: true } }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Cache
    const key = cacheKey({ prompt, imageUrl });
    if (mem.has(key)) {
      return new Response(JSON.stringify({ spec: mem.get(key), _debug: { cache: true } }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const model = process.env.SPEC_MODEL || "gpt-4o-mini";

    const system =
      "You are a woodworking/CAD assistant. Output ONLY JSON that matches the schema exactly. " +
      "If the prompt lacks height, use a reasonable default for the furniture type (e.g., coffee table ~18 inches). " +
      "Default units to 'mm'. Do not include any text outside JSON.";

    const schemaHint = `
Required JSON shape:
{
  "units": "mm|in",
  "materials": [{"name": "string", "thickness": number}],
  "assembly": {
    "type": "string",
    "overall": {"W": number, "D": number, "H": number},
    "joinery_policy": {"shelves": "dado|screw|none"?, "back": "rabbet|groove|none"?, "fits":"snug|standard|loose"}
  }
}`;

    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract a manufacturing spec for: ${prompt}\nReturn ONLY JSON.\n${schemaHint}` },
          ...(imageUrl ? [{ type: "image_url", image_url: { url: imageUrl } } as any] : [])
        ]
      }
    ];

    // ---- First attempt
    const res1 = await client.chat.completions.create({
      model, temperature: 0, messages: baseMessages,
      response_format: { type: "json_object" }, max_tokens: 800
    });

    let raw = res1.choices[0]?.message?.content ?? "{}";
    try {
      const spec = SpecSchema.parse(JSON.parse(raw));
      mem.set(key, spec);
      return new Response(JSON.stringify({
        spec, _debug: { requestedModel: model, actualModel: (res1 as any).model, usage: res1.usage, pass: 1 }
      }, null, 2), { headers: { "Content-Type": "application/json" } });
    } catch (e1: any) {
      // ---- Repair attempt (ask model to fix according to Zod error)
      const errMsg = String(e1?.message ?? e1).slice(0, 800);
      const repairMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...baseMessages,
        { role: "assistant", content: raw }, // show what it produced
        { role: "user", content: `Your JSON failed validation with this error:\n${errMsg}\nReturn ONLY corrected JSON that matches the schema.` }
      ];

      const res2 = await client.chat.completions.create({
        model, temperature: 0, messages: repairMessages,
        response_format: { type: "json_object" }, max_tokens: 800
      });

      raw = res2.choices[0]?.message?.content ?? "{}";
      try {
        const spec = SpecSchema.parse(JSON.parse(raw));
        mem.set(key, spec);
        return new Response(JSON.stringify({
          spec, _debug: { requestedModel: model, actualModel: (res2 as any).model, usage: res2.usage, pass: 2 }
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      } catch {
        // ---- Final fallback (no more spend; deterministic)
        const spec = fallbackSpec(prompt);
        mem.set(key, spec);
        return new Response(JSON.stringify({
          spec, _debug: { fallback: true, note: "Model output failed schema twice; used prompt-derived defaults." }
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }
}
