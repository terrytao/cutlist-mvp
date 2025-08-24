export const runtime = "nodejs";
export async function GET() {
  const has = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  return new Response(JSON.stringify({ hasOpenAIKey: has }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
