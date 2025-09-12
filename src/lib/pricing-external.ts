import { type Species } from '@/data/pricing/home-depot';
import { type QuotePart, type QuoteResp } from '@/lib/pricing';

function parsePriceToNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/[,\s]/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}

function buildQueryForPart(p: QuotePart, species: Species): string {
  const tIn = (p.thickness / 25.4).toFixed(2);
  const wIn = (p.width / 25.4).toFixed(2);
  const lIn = Math.max(1, Math.round(p.length / 25.4));
  if (species === 'plywood') {
    // e.g., 3/4 in plywood 4x8
    const t = p.thickness >= 16 ? '3/4 in' : '1/2 in';
    return `${t} ${species} 4x8 site:homedepot.com`;
  }
  // e.g., maple 1x6 8 ft
  const nominalW = Math.max(1, Math.round(Number(wIn))); // 1,2,4,6...
  return `${species} ${nominalW} in board ${lIn} ft site:homedepot.com`;
}

export async function quoteWithSerpApi(parts: QuotePart[], species: Species): Promise<QuoteResp> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error('SERPAPI_API_KEY missing');
  }
  const lines = [] as QuoteResp['lines'];
  for (const p of parts) {
    const q = buildQueryForPart(p, species);
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_shopping');
    url.searchParams.set('q', q);
    url.searchParams.set('api_key', key);
    const r = await fetch(url.toString(), { cache: 'no-store' });
    const j: any = await r.json().catch(() => ({}));
    const first = Array.isArray(j?.shopping_results) ? j.shopping_results[0] : null;
    const price = parsePriceToNumber(first?.price) ?? 0;
    const unit = price;
    const total = unit * p.qty;
    lines.push({ ...p, vendorUnitUSD: unit, vendorTotalUSD: total, method: 'board_foot' });
  }
  const subtotalUSD = lines.reduce((s, x) => s + x.vendorTotalUSD, 0);
  return {
    vendor: 'SerpAPI (Google Shopping)',
    currency: 'USD',
    lines,
    subtotalUSD,
    note: 'Prices derived from first Google Shopping result; experimental.',
  };
}

