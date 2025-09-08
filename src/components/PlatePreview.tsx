// src/components/PlatePreview.tsx
'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { buildPlateUrl, type PlateKind } from '@/lib/plateUrl';

export default function PlatePreview({
  kind,
  spec,
  title = true,
  w = 900,
  font = 18,
  host,
  insert,
  className,
}: {
  kind: PlateKind;
  spec: any;
  title?: boolean;
  w?: number;
  font?: number;
  host?: string;
  insert?: string;
  className?: string;
}) {
  const url = useMemo(
    () => buildPlateUrl(kind, spec, { title, w, font, host, insert }),
    [kind, spec, title, w, font, host, insert]
  );

  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [detail, setDetail] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setState('loading'); setDetail('');
    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          const text = await res.text();
          if (!cancelled) {
            setState('error');
            setDetail(`${res.status} ${res.statusText}\n${text}`);
          }
          return;
        }
        // quick content-type sanity check
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.includes('image/svg+xml')) {
          const text = await res.text();
          if (!cancelled) {
            setState('error');
            setDetail(`Unexpected content-type: ${ctype}\n${text.slice(0, 500)}`);
          }
          return;
        }
        if (!cancelled) setState('ok');
      } catch (e: any) {
        if (!cancelled) {
          setState('error');
          setDetail(String(e?.message ?? e));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className={className} style={{ border: '1px solid #eee', borderRadius: 12, padding: 8 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
        <code>{url}</code>
      </div>
      {state === 'loading' && <div style={{ color: '#666' }}>Loading…</div>}
      {state === 'ok' && (
        <img
          src={url}
          alt={`${kind} plate`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      )}
      {state === 'error' && (
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#b00020', background: '#fff5f5', padding: 10, borderRadius: 8 }}>
{detail || 'Failed to load'}
        </pre>
      )}
    </div>
  );
}
