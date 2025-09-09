import OpenAI from "openai";
import { consumeTrial } from "@/lib/trial";
export const runtime = "nodejs";


// at top
const ENABLE_IMAGE_GEN = process.env.ENABLE_IMAGE_GEN === '1';

export async function POST(req: Request) {
  const body = await req.json();
  // If decorative photo isn't essential, skip it
  if (!ENABLE_IMAGE_GEN) {
    // Return only server-made SVG plate URLs (free)
    return Response.json({
      photo: null,
      plates: [
        "/api/export/joint/rabbet?...",
        "/api/export/joint/dado?...",
        "/api/export/joint/groove?..."
      ]
    });
  }

  // ...otherwise call your image provider here (paid)...
}

let client: OpenAI | null = null;

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseMs = 300, capMs = 4000): Promise<T> {
  let delay = baseMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (!(status === 429 || (status >= 500 && status < 600)) || attempt === maxAttempts) throw e;
      const wait = Math.min(capMs, delay + Math.random() * delay);
      await new Promise(r => setTimeout(r, wait));
      delay = Math.min(capMs, delay * 2);
    }
  }
  throw new Error("unreachable");
}

async function pMap<I, O>(items: I[], fn: (x: I, i: number) => Promise<O>, concurrency = 2): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++; if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

type Spec = { project?: string; units?: "in" | "mm" };

function sanitizeSize(size: any): "1024x1024" | "1024x1536" | "1536x1024" | "auto" {
  const s = String(size || "").toLowerCase();
  return (s === "1024x1024" || s === "1024x1536" || s === "1536x1024" || s === "auto") ? (s as any) : "1024x1024";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { spec, prompt, units = "in", count = 2, style, size } = body;

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400 });
    }
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const oc: OpenAI = client;

    const s: Spec | null = spec ? (typeof spec === "string" ? JSON.parse(spec) : spec) : null;
    const sizeOpt = sanitizeSize(size);
    const n = Math.max(1, Math.min(3, Number(count) || 2));
    const project = s?.project || "Wood table";
    const baseStyle = (style && String(style).trim().length) ? String(style) : "clean white background, engineering line art, subtle shading, centered";

    const prompts: { title: string; prompt: string }[] = [
      { title: "Exploded view", prompt: `Exploded view of ${project}, showing top, legs, aprons, stretchers, shelf if any. Mortise & tenon indicated. ${baseStyle}` },
      { title: "Mortise & Tenon detail", prompt: `Close-up of mortise-and-tenon between leg and apron. Label mortise, tenon, shoulder. ${baseStyle}` },
      { title: "Dado or corner detail", prompt: `Section/corner detail: dado receiving shelf OR leg-apron corner with pegged tenon. Label parts and grain. ${baseStyle}` }
    ].slice(0, n);

    // Trial: ~3 cents per joinery image
    const pre = await consumeTrial(req, n * 3);
    if (!pre.allowed) {
      return new Response(JSON.stringify({ error: "Free preview limit reached. Please sign in or purchase export to continue.", code: "TRIAL_CAP", remainingCents: pre.remainingCents }), { status: 402 });
    }

    const images = await pMap(prompts, async (p) => {
      const resp = await withRetry(() => oc.images.generate({ model: "gpt-image-1", prompt: p.prompt, n: 1, size: sizeOpt }), 4, 300, 4000);
      const list = Array.isArray((resp as any)?.data) ? (resp as any).data as Array<{ b64_json?: string }> : [];
      if (!list.length || !list[0]?.b64_json) throw new Error("OpenAI returned no image data");
      return { title: p.title, src: `data:image/png;base64,${list[0].b64_json}` };
    }, 2);

    return new Response(JSON.stringify({ images }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0, must-revalidate" }
    });
  } catch (e: any) {
    const status = e?.status ?? 400;
    return new Response(JSON.stringify({ error: e?.message || "joinery image generation failed" }), { status });
  }
}
