export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { quote, type QuotePart, type PricingProvider } from '@/lib/pricing';
import { quoteWithSerpApi } from '@/lib/pricing-external';
import type { Species } from '@/data/pricing/home-depot';

type Body = { parts: QuotePart[]; species: Species; provider?: PricingProvider };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!Array.isArray(body?.parts) || !body.parts.length) {
      return new Response(JSON.stringify({ error: 'parts required' }), { status: 400 });
    }
    const species = (body.species || 'maple') as Species;
    const parts = body.parts.map((p) => ({
        name: String(p.name),
        kind: (p.kind || 'apron') as QuotePart['kind'],
        length: Number(p.length) || 0,
        width: Number(p.width) || 0,
        thickness: Number(p.thickness) || 0,
        qty: Math.max(1, Number(p.qty) || 1),
      }));
    const provider: PricingProvider = (body.provider || 'homeDepot');
    let res;
    if (provider === 'serpApi') {
      res = await quoteWithSerpApi(parts, species);
    } else {
      res = quote(parts, species, provider);
    }
    return new Response(JSON.stringify(res, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'quote failed' }), { status: 400 });
  }
}
