import { hasEntitlement } from "@/lib/trial";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const entitled = await hasEntitlement(req);
  return new Response(JSON.stringify({ entitled }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }});
}
