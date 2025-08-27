export const runtime = "nodejs";
export async function GET(req: Request) {
  const hasKey = Boolean(process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN);
  // If Redis isn't configured, pretend the cap is huge so UI still renders a badge.
  // The real enforcement is in the API routes that call consumeTrial().
  if (!hasKey) {
    return new Response(JSON.stringify({
      clientId: "no-redis",
      usedCents: 0,
      capCents: Number(process.env.TRIAL_CENTS_CAP ?? 20),
      remainingCents: Number(process.env.TRIAL_CENTS_CAP ?? 20),
      ttlSec: null
    }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  // Use the same helper as APIs (lightweight inline version to avoid import)
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") || "";
  const id = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + ua))
    .then(buf => Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,24));

  const url = process.env.UPSTASH_REDIS_URL!;
  const token = process.env.UPSTASH_REDIS_TOKEN!;
  const r = await fetch(`${url}/get/trial:${id}`, { headers: { Authorization: `Bearer ${token}` }});
  const usedStr = await r.text();
  const usedRaw = usedStr && usedStr !== "null" ? Number(usedStr) : 0;
  const cap = Number(process.env.TRIAL_CENTS_CAP ?? 20);
  return new Response(JSON.stringify({
    clientId: id,
    usedCents: usedRaw,
    capCents: cap,
    remainingCents: Math.max(0, cap - usedRaw),
    ttlSec: null
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }});
}
