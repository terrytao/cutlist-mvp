import OpenAI from "openai";
import { SpecSchema, type Spec } from "../../../lib/schema";
import { applyKerfToList, applyEdgeBandingToList, applyDadoOffsets } from "../../../lib/allowances";
import { computeJoinery } from "../../../lib/compute";

export const runtime = "nodejs";
let client: OpenAI | null = null;

/** Strict JSON Schema for structured outputs (includes concept; joinery is strict) */
const SpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["project","units","tolerances","cut_list","notes","edge_banding","joinery","concept"],
  properties: {
    project: { type: "string" },
    units: { type: "string", enum: ["in","mm"] },
    tolerances: {
      type: "object",
      additionalProperties: false,
      required: ["kerf"],
      properties: { kerf: { type: "number", minimum: 0 } }
    },
    cut_list: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
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
        type: "object",
        additionalProperties: false,
        required: ["part","sides","overhang"],
        properties: {
          part: { type: "string" },
          sides: { type: "array", items: { type: "string", enum: ["front","back","left","right"] }, minItems: 1 },
          overhang: { anyOf: [ { type: "number", minimum: 0 }, { type: "null" } ] }
        }
      }
    },
    /** STRICT joinery item (we override values later, but model must validate) */
    joinery: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type","depth","at_parts"],
        properties: {
          type: { type: "string" },
          depth: { anyOf: [ { type: "number", minimum: 0 }, { type: "null" } ] },
          at_parts: { type: "array", items: { type: "string" }, minItems: 1 }
        }
      }
    },
    /** High-level design concept used for deterministic joinery */
    concept: {
      type: "object",
      additionalProperties: false,
      required: ["archetype","overall","leg_type","apron_height_class","shelf"],
      properties: {
        archetype: { type: "string", enum: ["leg_apron_stretcher","panel_carcass"] },
        overall: {
          type: "object",
          additionalProperties: false,
          required: ["W","D","H"],
          properties: {
            W: { type: "number", minimum: 0 },
            D: { type: "number", minimum: 0 },
            H: { type: "number", minimum: 0 }
          }
        },
        leg_type: { anyOf: [ { type: "string", enum: ["square","tapered","turned"] }, { type: "null" } ] },
        apron_height_class: { anyOf: [ { type: "string", enum: ["short","medium","tall"] }, { type: "null" } ] },
        shelf: { anyOf: [ { type: "boolean" }, { type: "null" } ] }
      }
    }
  }
} as const;

export async function POST(req: Request) {
  try {
    const { prompt, imageDataUrl, units = "in" } = await req.json();

    if (!imageDataUrl) {
      return new Response(JSON.stringify({ error: "imageDataUrl required" }), { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      text: {
        format: { type: "json_schema", name: "Spec", strict: true, schema: SpecJsonSchema }
      },
      input: [
        { role: "system", content:
          `You are a woodworking estimator. Return ONLY JSON matching the schema.
           Use canonical names when possible: "Leg", "Apron - Front/Back/Left/Right", optional "Stretcher - Front/Back/Left/Right",
           "Shelf", "Side Panel", "Back Panel", "Bottom", "Top" or "Solid Top".
           Always include "concept" with archetype + overall W/D/H + leg_type + apron_height_class + shelf.` },
        { role: "user", content: [
          { type: "input_text", text: `Units=${units}. ${prompt}` },
          { type: "input_image", image_url: imageDataUrl , detail: "low"}
        ] }
      ],
      temperature: 0
    });

    // Parse & validate model output
    const raw: Spec = SpecSchema.parse(JSON.parse(resp.output_text));

    // Deterministic joinery: override any model-provided joinery with our rules
    const withJoinery = computeJoinery(raw);

    // Allowances: edge-banding -> dado offsets -> kerf
    const ebDefault = withJoinery.units === "mm" ? 1 : 1/16;
    const kerf = Number.isFinite(withJoinery.tolerances?.kerf)
      ? (withJoinery.tolerances!.kerf as number)
      : (withJoinery.units === "mm" ? 3 : 0.125);

    let parts = applyEdgeBandingToList(withJoinery.cut_list as any, withJoinery.edge_banding as any, ebDefault);
    parts = applyDadoOffsets(parts, withJoinery.joinery as any, withJoinery.units);
    parts = applyKerfToList(parts, kerf);

    const adjusted: Spec = { ...withJoinery, cut_list: parts, notes: (withJoinery.notes ?? "") };
    const validated = SpecSchema.parse(adjusted);

    return new Response(JSON.stringify({ source: "llm", spec: validated, usage: resp.usage }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed to generate spec from image" }), { status: 400 });
  }
}
