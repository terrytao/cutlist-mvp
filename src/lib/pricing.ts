import { HOME_DEPOT_VENDOR, type Species } from '@/data/pricing/home-depot';
import { quoteWithSerpApi } from '@/lib/pricing-external';

export type PartKind = 'top' | 'leg' | 'apron';
export type QuotePart = {
  name: string;
  kind: PartKind;
  length: number; // mm
  width: number; // mm
  thickness: number; // mm
  qty: number;
};
export type QuoteLine = QuotePart & {
  vendorUnitUSD: number;
  vendorTotalUSD: number;
  method: 'board_foot' | 'plywood_sheet_prorated';
};
export type QuoteResp = {
  vendor: string;
  currency: 'USD';
  lines: QuoteLine[];
  subtotalUSD: number;
  note?: string;
};

const mmToIn = (mm: number) => mm / 25.4;
const sheetAreaSqIn = HOME_DEPOT_VENDOR.sheetSizeIn.W * HOME_DEPOT_VENDOR.sheetSizeIn.D;

/** Vendor quote using local Home Depot data; falls back to board-foot pricing for solid lumber. */
export function quoteWithHomeDepot(parts: QuotePart[], species: Species): QuoteResp {
  const lines: QuoteLine[] = [];
  for (const p of parts) {
    if (species === 'plywood') {
      const tmm = Math.round(p.thickness);
      const tKey = tmm >= 16 ? '18mm' : '12mm';
      const sheetPrice = HOME_DEPOT_VENDOR.plywoodSheetUSD[tKey as '18mm' | '12mm'] ?? HOME_DEPOT_VENDOR.plywoodSheetUSD['18mm'];
      const areaSqIn = mmToIn(p.length) * mmToIn(p.width);
      const fraction = areaSqIn / sheetAreaSqIn;
      const unit = sheetPrice * fraction;
      const total = unit * p.qty;
      lines.push({ ...p, vendorUnitUSD: unit, vendorTotalUSD: total, method: 'plywood_sheet_prorated' });
      continue;
    }
    const bf = (mmToIn(p.thickness) * mmToIn(p.width) * mmToIn(p.length)) / 144;
    const pbf = HOME_DEPOT_VENDOR.pricePerBF[species === 'plywood' ? 'pine' : species] ?? 8;
    const unit = bf * pbf;
    const total = unit * p.qty;
    lines.push({ ...p, vendorUnitUSD: unit, vendorTotalUSD: total, method: 'board_foot' });
  }
  const subtotalUSD = lines.reduce((s, x) => s + x.vendorTotalUSD, 0);
  return {
    vendor: HOME_DEPOT_VENDOR.name,
    currency: 'USD',
    lines,
    subtotalUSD,
    note: 'Local vendor model: solid lumber by board-foot; plywood pro-rated by 4×8 sheet.',
  };
}

/** Simple board-foot only vendor, configurable by species map. */
export function quoteWithBoardFoot(parts: QuotePart[], species: Species, pricePerBF: Record<Exclude<Species, 'plywood'>, number>): QuoteResp {
  const mmToIn = (mm: number) => mm / 25.4;
  const lines: QuoteLine[] = parts.map((p) => {
    const bf = (mmToIn(p.thickness) * mmToIn(p.width) * mmToIn(p.length)) / 144;
    const pbf = pricePerBF[species === 'plywood' ? 'pine' : species] ?? 8;
    const unit = bf * pbf;
    const total = unit * p.qty;
    return { ...p, vendorUnitUSD: unit, vendorTotalUSD: total, method: 'board_foot' };
  });
  const subtotalUSD = lines.reduce((s, x) => s + x.vendorTotalUSD, 0);
  return { vendor: 'Board-Foot Estimator', currency: 'USD', lines, subtotalUSD, note: 'Pure board-foot estimator by species.' };
}

export type PricingProvider = 'homeDepot' | 'boardFoot' | 'serpApi';
export function quote(parts: QuotePart[], species: Species, provider: PricingProvider = 'homeDepot'): QuoteResp {
  if (provider === 'boardFoot') {
    return quoteWithBoardFoot(parts, species, HOME_DEPOT_VENDOR.pricePerBF);
  }
  if (provider === 'serpApi') {
    // SerpAPI is async; we expose a sync wrapper for API route convenience
    // The API route should call quoteWithSerpApi directly when selected.
    throw new Error('serpApi provider must be called via quoteWithSerpApi (async)');
  }
  return quoteWithHomeDepot(parts, species);
}
