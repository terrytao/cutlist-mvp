export type Species = 'pine' | 'maple' | 'oak' | 'walnut' | 'plywood';

export const HOME_DEPOT_VENDOR = {
  name: 'Home Depot (local)',
  currency: 'USD',
  pricePerBF: {
    pine: 5,
    maple: 8,
    oak: 9,
    walnut: 14,
  } as Record<Exclude<Species, 'plywood'>, number>,
  plywoodSheetUSD: {
    '18mm': 65,
    '12mm': 52,
  },
  sheetSizeIn: { W: 96, D: 48 },
} as const;

