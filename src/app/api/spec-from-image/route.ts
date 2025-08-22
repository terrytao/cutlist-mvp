import OpenAI from "openai";
import { SpecSchema, type Spec } from "../../../lib/schema";
import { applyKerfToList, applyEdgeBandingToList, applyDadoOffsets } from "../../../lib/allowances";

export const runtime = "nodejs";
let client: OpenAI | null = null;

// Strict JSON schema (required-but-nullable for optional fields)
const SpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["project","units","tolerances","cut_list","notes","edge_banding","joinery"],
  properties: {
    project: { type: "string" },
    units: { type: "string", enum: ["in","mm"] },
    tolerances: {
      type: "object", additionalProperties: false,
      required: ["kerf"], properties: { kerf: { type: "number", minimum: 0 } }
    },
    cut_list: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["part","qty","material","thickness","length","width","grain"],
        properties: {
          part: { type: "string" },
          qty: { type: "integer", minimum: 1 },
          material: { type: "string" },
          thickness: { type: "number", exclusiveMinimum: 0 },
          length: { type: "number", exclusiveMinimum: 0 },
          width:  { type: "number", exclusiveMinimum: 0 },
          grain:  { anyOf: [ { type: "string", enum: ["length","width"] }, { type: "null" } ] }
        }
      }
    },
    notes: { anyOf: [ { type: "string" }, { type: "null" } ] },
    edge_banding: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["part","sides","overhang"],
        properties: {
          part: { type: "string" },
          sides: { type: "array", items: { type: "string", enum: ["front","back","left","right"] }, minItems: 1 },
          overhang: { anyOf: [ { type: "number", minimum: 0 }, { type: "null" } ] }
        }
      }
    },
    joinery: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type","depth","at_parts"],
        properties: {
          type: { type: "string" },
          depth:{ anyOf: [ { type: "number", minimum: 0 }, { type: "null" } ] },
          at_parts: { type: "array", items: { type: "string" }, minItems: 1 }
        }
      }
    }
  }
} as const;

export async function POST(req: Request) {
  try {
    const { prompt, imageDataUrls, units = "in" } = await req.json();

    if (!Array.isArray(imageDataUrls) || imageDataUrls.length === 0) {
      return new Response(JSON.stringify({ error: "imageDataUrls (array) is required" }), { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const imgs = imageDataUrls.slice(0, 8); // cap at 8 to keep requests reasonable

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      text: {
        format: { type: "json_schema", name: "Spec", strict: true, schema: SpecJsonSchema }
      },
      input: [
        { role: "system", content:
          "You are a woodworking estimator. Consider ALL images together as references for ONE piece. If images conflict, pick a coherent, structurally sound design. Return ONLY JSON matching the schema."
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Units=${units}. ${prompt}` },
            ...imgs.map((u: string) => ({ type: "input_image" as const, image_url: u }))
          ]
        }
      ],
      temperature: 0
    });

    // Validate model output
    const raw = SpecSchema.parse(JSON.parse(resp.output_text));

    // Allowances: edge band → dado → kerf
    const ebDefault = raw.units === "mm" ? 1 : 1/16;
    const kerf = Number.isFinite(raw.tolerances?.kerf) ? (raw.tolerances!.kerf as number) : (raw.units === "mm" ? 3 : 0.125);
    let parts = applyEdgeBandingToList(raw.cut_list as any, raw.edge_banding as any, ebDefault);
    parts = applyDadoOffsets(parts, raw.joinery as any, raw.units);
    parts = applyKerfToList(parts, kerf);

    const adjusted: Spec = {
      ...raw,
      cut_list: parts,
      notes: (raw.notes ?? "") + ` (kerf +${kerf} ${raw.units}, EB default ${ebDefault} ${raw.units})`
    };

    return new Response(JSON.stringify({ source: "llm", spec: SpecSchema.parse(adjusted), usage: resp.usage }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed to generate spec from images" }), { status: 400 });
  }
}
