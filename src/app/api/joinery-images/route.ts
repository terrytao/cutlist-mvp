import OpenAI from "openai";
export const runtime = "nodejs";

let client: OpenAI | null = null;

/* retry helper for 429/5xx */
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

/* tiny parallel mapper with limited concurrency */
async function pMap<I, O>(items: I[], fn: (x: I, i: number) => Promise<O>, concurrency = 2): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

type Spec = {
  project?: string;
  units?: "in" | "mm";
  joinery?: { type: string; depth: number | null; at_parts: string[] }[];
};

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
    const oc: OpenAI = client; // non-null local

    const s: Spec | null = spec ? (typeof spec === "string" ? JSON.parse(spec) : spec) : null;
    const sizeOpt = sanitizeSize(size);
    const n = Math.max(1, Math.min(3, Number(count) || 2));

    /* Build 2–3 prompts. If spec is present, we can include a hint; otherwise, use generic labels */
    const prompts: { title: string; prompt: string }[] = [];
    const project = s?.project || "Wood table";
    const baseStyle = (style && String(style).trim().length) ? String(style) : "clean white background, engineering line art, subtle shading, centered";

    prompts.push({
      title: "Exploded view",
      prompt: `Exploded view of ${project}, showing top, legs, aprons, stretchers, shelf if any. Mortise & tenon indicated. ${baseStyle}`
    });
    prompts.push({
      title: "Mortise & Tenon detail",
      prompt: `Close-up of mortise-and-tenon between leg and apron. Label mortise, tenon, shoulder. ${baseStyle}`
    });
    if (n >= 2) {
      prompts.push({
        title: "Dado or corner detail",
        prompt: `Section/corner detail: dado receiving shelf OR leg-apron corner with pegged tenon. Label parts and grain. ${baseStyle}`
      });
    }
    const sel = prompts.slice(0, n);

    /* Render images in parallel (client guaranteed non-null via oc) */
    const images = await pMap(sel, async (p) => {
      const resp = await withRetry(
        () => oc.images.generate({ model: "gpt-image-1", prompt: p.prompt, n: 1, size: sizeOpt }),
        4, 300, 4000
      );

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
