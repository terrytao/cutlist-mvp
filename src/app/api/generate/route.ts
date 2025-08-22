import OpenAI from "openai";
import { SpecSchema, type Spec } from "../../../lib/schema";
import { applyKerfToList, applyEdgeBandingToList, applyDadoOffsets } from "../../../lib/allowances";

export const runtime = "nodejs";

let client: OpenAI | null = null;

// Strict JSON Schema — every listed property is required.
// Optional fields are modeled as required-but-nullable.
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
          type: { type: "string" }, // e.g., "dado", "rabbet"
          depth:{ anyOf: [ { type: "number", minimum: 0 }, { type: "null" } ] },
          at_parts: { type: "array", items: { type: "string" }, minItems: 1 }
        }
      }
    }
  }
} as const;

export async function POST(req: Request) {
  try {
    const { prompt, units = "in" } = await req.json();

    // Fallback mock if no key
    if (!process.env.OPENAI_API_KEY?.trim()) {
      const demo: Spec = {
        project: "Demo project",
        units,
        tolerances: { kerf: units === "mm" ? 3 : 0.125 },
        cut_list: [
          { part: "Top", qty: 1, material: "solid maple", thickness: 0.75, length: 20, width: 16, grain: "length" },
          { part: "Side Panel", qty: 2, material: "plywood", thickness: 0.75, length: 24, width: 16, grain: "length" },
          { part: "Shelf", qty: 1, material: "plywood", thickness: 0.75, length: 18.5, width: 14.5, grain: "width" }
        ],
        notes: null,
        edge_banding: [{ part: "Top", sides: ["front","left","right"], overhang: null }],
        joinery: [{ type: "dado", depth: 0.25, at_parts: ["Side Panel","Shelf"] }]
      };

      const kerf = demo.tolerances.kerf;
      const ebDefault = demo.units === "mm" ? 1 : 1/16;
      let parts = applyEdgeBandingToList(demo.cut_list as any, demo.edge_banding as any, ebDefault);
      parts = applyDadoOffsets(parts, demo.joinery as any, demo.units);
      parts = applyKerfToList(parts, kerf);
      const adjusted: Spec = { ...demo, cut_list: parts, notes: (demo.notes ?? "") + ` (kerf +${kerf} ${demo.units}, EB default ${ebDefault} ${demo.units})` };

      return new Response(JSON.stringify({ source: "mock", spec: SpecSchema.parse(adjusted) }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      text: {
        format: {
          type: "json_schema",
          name: "Spec",
          strict: true,
          schema: SpecJsonSchema
        }
      },
      input: [
        { role: "system", content: "You are a woodworking estimator. Return ONLY JSON matching the provided schema." },
        { role: "user", content: String(prompt || "Nightstand 24h x 16w x 20l, 3/4\" birch ply carcass, solid top. Edge band top on 3 sides. Dados for shelf 1/4\".") }
      ],
      temperature: 0
    });

    // Validate model output
    const raw = SpecSchema.parse(JSON.parse(resp.output_text));

    // Apply allowances in order: edge band → dado → kerf
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
    if (e?.status === 429) {
      return new Response(JSON.stringify({
        source: "mock",
        warning: "LLM disabled due to 429 (quota/rate-limit). Using demo output.",
        spec: SpecSchema.parse({
          project: "Demo project",
          units: "in",
          tolerances: { kerf: 0.125 },
          cut_list: [
            { part: "Top", qty: 1, material: "solid maple", thickness: 0.75, length: 20, width: 16, grain: "length" },
            { part: "Side Panel", qty: 2, material: "plywood", thickness: 0.75, length: 24, width: 16, grain: "length" },
            { part: "Shelf", qty: 1, material: "plywood", thickness: 0.75, length: 18.5, width: 14.5, grain: "width" }
          ],
          notes: "(mock due to 429)",
          edge_banding: [],
          joinery: []
        })
      }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: e?.message || "Bad request" }), { status: 400 });
  }
}
