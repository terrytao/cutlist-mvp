import OpenAI from "openai";
import { consumeTrial } from "@/lib/trial";
export const runtime = "nodejs";

let client: OpenAI | null = null;

function buildPrompt(base?: string, refine?: string, negative?: string, style?: string) {
  const parts: string[] = [];
  if (base) parts.push(base.trim());
  if (refine) parts.push(`Refinements: ${refine.trim()}`);
  if (negative) parts.push(`Avoid: ${negative.trim()}`);
  if (style) parts.push(`Visual style: ${style.trim()}`);
  const text = parts.join(". ").replace(/\.\s*$/, "");
  return text.length ? text + "." : "Woodworking table, clean product render.";
}
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

export async function POST(req: Request) {
  try {
    const { prompt, refine, negative, style, count = 1, size = "1024x1024" } = await req.json();
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const n = Math.max(1, Math.min(8, Number(count) || 1));
    const fullPrompt = buildPrompt(prompt, refine, negative, style);
    const allowedSizes: ImageSize[] = ["1024x1024", "1024x1536", "1536x1024", "auto"];
    const sizeOpt: ImageSize = (allowedSizes as readonly string[]).includes(size) ? (size as ImageSize) : "1024x1024";

    // Trial: ~2 cents per image
    const pre = await consumeTrial(req, n * 2);
    if (!pre.allowed) {
      return new Response(JSON.stringify({ error: "Free preview limit reached. Please sign in or purchase export to continue.", code: "TRIAL_CAP", remainingCents: pre.remainingCents }), { status: 402 });
    }

    const resp = await client.images.generate({ model: "gpt-image-1", prompt: fullPrompt, n, size: sizeOpt });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    if (!list.length) throw new Error("OpenAI returned no images.");
    const images = list.map((d: any, i: number) => {
      const b64 = d?.b64_json as string | undefined;
      if (!b64) throw new Error(`Image ${i} missing b64_json`);
      return `data:image/png;base64,${b64}`;
    });
    return new Response(JSON.stringify({ images, usedPrompt: fullPrompt }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "image generation failed" }), { status: 400 });
  }
}
