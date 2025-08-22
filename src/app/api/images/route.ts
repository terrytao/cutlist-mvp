import OpenAI from "openai";
export const runtime = "nodejs";

let client: OpenAI | null = null;

function buildPrompt(base?: string, refine?: string, negative?: string, style?: string) {
  const parts = [];
  if (base) parts.push(base.trim());
  if (refine) parts.push(`Refinements: ${refine.trim()}`);
  if (negative) parts.push(`Avoid: ${negative.trim()}`);
  if (style) parts.push(`Visual style: ${style.trim()}`);
  const text = parts.join(". ").replace(/\.\s*$/,"");
  return text.length ? text + "." : "Woodworking table, clean product render.";
}

export async function POST(req: Request) {
  try {
    const { prompt, refine, negative, style, count = 3, size = "1024x1024" } = await req.json();
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const n = Math.max(1, Math.min(8, Number(count) || 4));
    const fullPrompt = buildPrompt(prompt, refine, negative, style);

    const resp = await client.images.generate({
      model: "gpt-image-1",
      prompt: fullPrompt,
      n,
      size: (["1024x1024","1024x1536","1536x1024","auto"] as const).includes(size) ? size : "1024x1024"
    });

    const images = resp.data.map(d => `data:image/png;base64,${d.b64_json}`);
    return new Response(JSON.stringify({ images, usedPrompt: fullPrompt }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "image generation failed" }), { status: 400 });
  }
}
