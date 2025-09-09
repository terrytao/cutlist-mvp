import { detectProviders } from "@/lib/providers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const info = detectProviders();
  return new Response(JSON.stringify(info, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}
