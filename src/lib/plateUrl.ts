export type PlateKind = 'rabbet' | 'dado' | 'groove' | 'mortise';

/**
 * Builds a correct plate URL. We let URLSearchParams handle encoding of JSON,
 * so we DON'T double-encode spec (no manual encodeURIComponent on top).
 */
export function buildPlateUrl(
  kind: PlateKind,
  spec: any,
  opts?: { title?: boolean; w?: number; font?: number; host?: string; insert?: string }
) {
  const params = new URLSearchParams();
  params.set('title', (opts?.title ?? true) ? '1' : '0');
  params.set('w', String(opts?.w ?? 900));
  params.set('font', String(opts?.font ?? 18));
  params.set('spec', JSON.stringify(spec)); // let URLSearchParams encode it
  if (opts?.host) params.set('host', opts.host);
  if (opts?.insert) params.set('insert', opts.insert);
  return `/api/export/joint/${kind}?` + params.toString();
}
