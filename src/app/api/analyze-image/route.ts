import OpenAI from "openai";
export const runtime = "nodejs";

let client: OpenAI | null = null;

const PhotoStyleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["leg_shape","apron_height","top_edge","wood","color_tone","keywords"],
  properties: {
    leg_shape: { type: "string" },       // e.g., square 1.75", tapered, turned
    apron_height: { type: "string" },    // e.g., ~3.5", slim, tall
    top_edge: { type: "string" },        // e.g., eased, chamfered, beveled
    wood: { type: "string" },            // e.g., walnut, oak, maple, painted
    color_tone: { type: "string" },      // e.g., warm medium brown, pale natural
    keywords: { type: "string" }         // comma-separated extras: shaker, mission, pegged tenons, etc.
  }
} as const;

export async function POST(req: Request) {
  try {
    const { imageDataUrl, units = "in" } = await req.json();
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!imageDataUrl) {
      return new Response(JSON.stringify({ error: "imageDataUrl required" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      text: {
        format: {
          type: "json_schema",
          name: "PhotoStyle",
          strict: true,
          schema: PhotoStyleSchema
        }
      },
      input: [
        { role: "system", content: "You are a woodworking design analyst. Return ONLY JSON." },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Analyze this furniture photo. Units: ${units}. Return concise descriptors for woodworking rendering.` },
            { type: "input_image", image_url: imageDataUrl , detail: "low"}
          ]
        }
      ],
      temperature: 0
    });

    const json = JSON.parse(resp.output_text || "{}");
    return new Response(JSON.stringify({ style: json }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "analyze failed" }), { status: 400 });
  }
}
