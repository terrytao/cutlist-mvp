import { hasEntitlement } from "@/lib/trial";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const entitled = await hasEntitlement(req);
  if (!entitled) {
    return new Response(JSON.stringify({ error: "Payment required", code: "PAYWALL" }), { status: 402 });
  }
  const url = new URL(req.url);
  const spec = url.searchParams.get("spec");
  if (!spec) return new Response("Missing ?spec", { status: 400 });

  // Fetch your own SVG route and re-emit with attachment headers
  const origin = `${url.protocol}//${url.hostname}${url.port ? ":" + url.port : ""}`;
  const svgRes = await fetch(`${origin}/api/export/svg?spec=${encodeURIComponent(spec)}`, { cache: "no-store" });
  if (!svgRes.ok) return new Response(await svgRes.text(), { status: svgRes.status });

  const svg = await svgRes.text();
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": 'attachment; filename="cutlist-layout.svg"',
      "Cache-Control": "no-store"
    }
  });
}
