// src/app/dev/oneclick/page.tsx
'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import PlatePreview from '@/components/PlatePreview';
import { buildPlateUrl } from '@/lib/plateUrl';

// Optional (if you created it). Safe dynamic import: if missing, it renders nothing.
const JoineryHero = dynamic(
  async () => {
    try { return (await import('@/components/JoineryHero')).default; }
    catch { return () => null as any; }
  },
  { ssr: false }
);

type Spec = {
  units: 'mm' | 'in';
  materials: { name: string; thickness: number }[];
  assembly: {
    type: string;
    overall: { W: number; D: number; H: number };
    joinery_policy: {
      shelves?: 'dado' | 'screw' | 'none';
      back?: 'rabbet' | 'groove' | 'none';
      fits?: 'snug' | 'standard' | 'loose';
    };
  };
};

const mm = (v: number) => v;
const pick = <T,>(arr: T[], f: (x: T) => boolean, fallback: T) => arr.find(f) ?? fallback;

function planJoineryFromSpec(spec: Spec) {
  const { D, H } = spec.assembly.overall;
  const mats = spec.materials || [];
  const sideThk = pick(mats, m => m.thickness >= 15 && m.thickness <= 22, { name: 'Plywood', thickness: 18 }).thickness;
  const backThk = pick(mats, m => m.thickness <= 6.5, { name: 'Back', thickness: 6 }).thickness;
  const shelfThk = pick(mats, m => m.thickness >= 15 && m.thickness <= 22, { name: 'Shelf', thickness: 18 }).thickness;

  const sideHost = { name: 'Side Panel', thickness: sideThk, length: mm(H), width: mm(D) };

  const plates: Array<{ kind: 'rabbet' | 'dado' | 'groove'; spec: any; host?: string; insert?: string }> = [];
  const jobs: any[] = [];

  if (spec.assembly.joinery_policy.back === 'rabbet') {
    const rabWidth = Math.min(12, Math.round(D * 0.05));
    const rabDepth = Math.min(Math.round(sideThk * 0.6), backThk);
    plates.push({
      kind: 'rabbet',
      spec: { units: 'mm', host: { name: 'Side Panel', thickness: sideThk }, insert: { name: 'Back Panel', thickness: backThk }, rabbet: { width: rabWidth, depth: rabDepth } }
    });
    jobs.push({ type: 'RABBET', edge: 'N', host: sideHost, width: rabWidth, depth: rabDepth, label: 'Back Rabbet (top)' });
  } else if (spec.assembly.joinery_policy.back === 'groove') {
    const grooveW = Math.min(backThk, 6.35);
    const grooveD = Math.min(Math.round(sideThk * 0.5), backThk);
    const offsetY = Math.round(H * 0.5);
    plates.push({
      kind: 'groove',
      spec: { units: 'mm', host: { name: 'Side Panel', thickness: sideThk, length: H, width: D }, groove: { axis: 'X', width: grooveW, depth: grooveD, offset: offsetY } }
    });
    jobs.push({ type: 'GROOVE', axis: 'X', host: sideHost, offset: offsetY, width: grooveW, depth: grooveD, label: 'Back Groove (center)' });
  }

  if (spec.assembly.joinery_policy.shelves === 'dado') {
    const shelfOffset = Math.round(H * 0.5);
    const dadoW = shelfThk;
    const dadoD = Math.min(Math.round(sideThk * 0.35), 8);
    plates.push({
      kind: 'dado',
      spec: { units: 'mm', host: { name: 'Side Panel', thickness: sideThk, length: H, width: D }, insert: { name: 'Shelf', thickness: shelfThk }, dado: { axis: 'X', width: dadoW, depth: dadoD, offset: shelfOffset } }
    });
    jobs.push({ type: 'DADO', axis: 'X', host: sideHost, offset: shelfOffset, width: dadoW, depth: dadoD, label: 'Shelf Dado (mid)' });
  }

  return {
    plates,
    jobs,
    toolDefaults: {
      units: 'mm',
      tooling: { endmillDiameter: 6.35, stepdown: 2, stepover: 0.5, feedXY: 900, feedZ: 300, safeZ: 8 }
    }
  };
}

export default function OneClick() {
  const [prompt, setPrompt] = useState('2x4 feet coffee table with mortise/tenon, back in rabbets');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [spec, setSpec] = useState<Spec | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [plan, setPlan] = useState<ReturnType<typeof planJoineryFromSpec> | null>(null);

  const [prodSpec, setProdSpec] = useState<any | null>(null);
  const [allPlates, setAllPlates] = useState<any[] | null>(null);

  const once = useRef(false);

  const onGenerateSimple = async () => {
    setStatus('Calling /api/spec…'); setError('');
    try {
      const res = await fetch('/api/spec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageUrl: imageUrl || undefined })
      });
      const text = await res.text();
      if (!res.ok) { setError(`/api/spec ${res.status}: ${text}`); setStatus('Failed'); return; }
      const data = JSON.parse(text);
      setSpec(data.spec);
      setDebug(data._debug || null);
      setPlan(planJoineryFromSpec(data.spec));
      setStatus('Ready (simple)');
    } catch (e: any) {
      setError(String(e?.message || e)); setStatus('Failed');
    }
  };

  const onGenerateFull = async () => {
    setStatus('Calling /api/spec/production…'); setError('');
    try {
      const r1 = await fetch('/api/spec/production', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageUrl: imageUrl || undefined })
      });
      const t1 = await r1.text();
      if (!r1.ok) { setError(`/api/spec/production ${r1.status}: ${t1}`); setStatus('Failed'); return; }
      const d1 = JSON.parse(t1);
      const specFull = d1.spec;
      setProdSpec(specFull);

      setStatus('Deriving plates from full spec…');
      const r2 = await fetch('/api/plates/from-spec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: specFull })
      });
      const t2 = await r2.text();
      if (!r2.ok) { setError(`/api/plates/from-spec ${r2.status}: ${t2}`); setStatus('Failed'); return; }
      const d2 = JSON.parse(t2);
      setAllPlates(d2.plates || []);
      setStatus('Ready (full)');
    } catch (e: any) {
      setError(String(e?.message || e)); setStatus('Failed');
    }
  };

  const onDownloadGcode = async () => {
    if (!plan) return;
    setStatus('Building G-code…'); setError('');
    try {
      const payload = { units: plan.toolDefaults.units, tooling: plan.toolDefaults.tooling, jobs: plan.jobs };
      const res = await fetch('/api/cam/toolpaths', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const text = await res.text();
      if (!res.ok) { setError(text); setStatus('Failed'); return; }
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'joinery.nc';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      setStatus('G-code downloaded');
    } catch (e: any) {
      setError(String(e?.message || e)); setStatus('Failed');
    }
  };

  const onDownloadZip = async () => {
    if (!spec) return;
    setStatus('Packaging ZIP…'); setError('');
    try {
      const origin = window.location.origin;
      // Plate URLs from simple plan (free SVG)…
      const simpleUrls = plan
        ? plan.plates.map(p => origin + buildPlateUrl(p.kind, p.spec, { title: true, w: 1000, font: 18, host: (p as any).host, insert: (p as any).insert }))
        : [];
      // …plus any URLs from the full plates (rabbet/dado/groove url, and mortise url/url_tenon)
      const fullUrls = (allPlates || []).flatMap((p: any) => [p.url, p.url_tenon].filter(Boolean) as string[]);

      const payload = {
        spec,
        units: plan?.toolDefaults.units || 'mm',
        tooling: plan?.toolDefaults.tooling || { endmillDiameter: 6.35, stepdown: 2, stepover: 0.5, feedXY: 900, feedZ: 300, safeZ: 8 },
        jobs: plan?.jobs || [],
        plateUrls: [...simpleUrls, ...fullUrls],
        filename: 'cutlist-package'
      };

      const res = await fetch('/api/export/package', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const blob = await res.blob();
      if (!res.ok) { const t = await blob.text(); setError(t); setStatus('Failed'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'cutlist-package.zip';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      setStatus('ZIP downloaded');
    } catch (e: any) {
      setError(String(e?.message || e)); setStatus('Failed');
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '32px auto', padding: 16, position: 'relative', zIndex: 10 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>One-Click: Prompt → Spec → Plates → G-code</h1>

      <label style={{ fontSize: 12, color: '#555' }}>Prompt</label>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={3}
        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 10 }}
      />

      <label style={{ fontSize: 12, color: '#555', marginTop: 8, display: 'block' }}>Optional image URL (kept off by default for cost)</label>
      <input
        value={imageUrl}
        onChange={e => setImageUrl(e.target.value)}
        placeholder="https://…"
        style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 10 }}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" onClick={onGenerateSimple}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ccc', background: '#111', color: '#fff', zIndex: 10, pointerEvents: 'auto' }}>
          Generate spec & plates (simple)
        </button>

        <button type="button" onClick={onGenerateFull}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ccc', background: '#222', color: '#fff' }}>
          Generate full (cutlist + joins)
        </button>

        <button type="button" onClick={onDownloadGcode} disabled={!plan}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ccc', background: plan ? '#0a7' : '#ccc', color: '#fff' }}>
          Download G-code (.nc)
        </button>

        <button type="button" onClick={onDownloadZip} disabled={!spec}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ccc', background: spec ? '#07a' : '#ccc', color: '#fff' }}>
          Download ZIP (plates + G-code + cutlist)
        </button>
      </div>

      {status && <div style={{ marginTop: 8, color: '#333' }}>Status: {status}</div>}
      {error && <pre style={{ whiteSpace: 'pre-wrap', color: '#b00020', background: '#fff5f5', padding: 8, borderRadius: 8 }}>{error}</pre>}

      {spec && (
        <div style={{ marginTop: 24, padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Spec</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{JSON.stringify(spec, null, 2)}</pre>
          {debug && (
            <details style={{ marginTop: 12 }}>
              <summary>Debug (model & usage)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(debug, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {plan && spec && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Joinery Preview Image (free)</h2>
          <JoineryHero spec={spec as any} plates={plan.plates as any} />
        </div>
      )}

      {plan && plan.plates.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Joinery Plates (simple)</h2>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr', maxWidth: 900 }}>
            {plan.plates.map((p, i) => (
              <div key={i}>
                <h3 style={{ fontSize: 16, margin: '8px 0' }}>{p.kind.toUpperCase()}</h3>
                <PlatePreview kind={p.kind} spec={p.spec} host={(p as any).host} insert={(p as any).insert} />
              </div>
            ))}
          </div>
        </div>
      )}

      {allPlates && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>All Plates from Full Spec</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {allPlates.map((p: any, i: number) => (
              <div key={i} style={{ padding: 8, border: '1px solid #eee', borderRadius: 10 }}>
                <div style={{ fontWeight: 600 }}>{p.kind} — {p.host?.name || p.insert?.name}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                  {p.url && <img src={p.url} alt="plate" style={{ maxWidth: 420, borderRadius: 8, border: '1px solid #eee' }} />}
                  {p.url_tenon && <img src={p.url_tenon} alt="tenon plate" style={{ maxWidth: 420, borderRadius: 8, border: '1px solid #eee' }} />}
                  {!p.url && !p.url_tenon && <div style={{ color: '#777' }}>(no preview url for this plate)</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
