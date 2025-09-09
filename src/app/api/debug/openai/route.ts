export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const k = process.env.OPENAI_API_KEY || "";
  return new Response(JSON.stringify({
    hasKey: !!k,
    length: k.length,
    startsWith: k.slice(0,3),
    endsWith: k.slice(-3)
  }, null, 2), { headers: { "Content-Type": "application/json" } });
}
