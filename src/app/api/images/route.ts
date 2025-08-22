import OpenAI from "openai";

export const runtime = "nodejs";

let client: OpenAI | null = null;

export async function POST(req: Request) {
  try {
    const { prompt, count = 4 } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const n = Math.max(1, Math.min(8, Number(count) || 4));
    const resp = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      n,
      size: "1024x1024"
    });

    const images = resp.data.map((d) => `data:image/png;base64,${d.b64_json}`);
    return new Response(JSON.stringify({ images }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = e?.message || "Image generation failed";
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }
}
