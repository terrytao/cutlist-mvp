// src/app/dev/photo3d/page.tsx
'use client';

import React, { useState } from 'react';
import FurniturePreview3DPro from '@/components/FurniturePreview3DPro';

type Spec = {
  units: 'mm' | 'in';
  assembly: { type: string; overall: { W: number; D: number; H: number } };
  bench?: { slats?: number; slatThickness?: number; gap?: number };
};

function normalizeSpecUnits(spec: Spec): Spec {
  if ((spec?.units || 'mm').toLowerCase() === 'in') {
    const k = 25.4;
    const o = spec.assembly.overall;
    return {
      ...spec,
      units: 'mm',
      assembly: {
        ...spec.assembly,
        overall: { W: Math.round(o.W * k), D: Math.round(o.D * k), H: Math.round(o.H * k) }
      }
    };
  }
  return spec;
}

const PRESETS: Record<string, Spec> = {
  coffeeTable: {
    units: 'in',
    assembly: { type: 'coffee table', overall: { W: 48, D: 24, H: 18 } }
  },
  gardenBench: {
    units: 'in',
    assembly: { type: 'garden bench', overall: { W: 60, D: 12, H: 18 } },
    bench: { slats: 8, slatThickness: 18, gap: 6 }
  }
};

export default function Photo3DPage() {
  const [text, setText] = useState(JSON.stringify(PRESETS.gardenBench, null, 2));
  const [spec, setSpec] = useState<Spec | null>(null);
  const [err, setErr] = useState('');
  const [topMap, setTopMap] = useState('');
  const [topRough, setTopRough] = useState('');
  const [topNormal, setTopNormal] = useState('');
  const [legMap, setLegMap] = useState('');

  const onPreset = (key: keyof typeof PRESETS) => {
    setText(JSON.stringify(PRESETS[key], null, 2));
    setSpec(null);
    setErr('');
  };

  const onRender = () => {
    setErr('');
    try {
      const s = JSON.parse(text);
      if (!s?.assembly?.overall) throw new Error('Missing assembly.overall');
      setSpec(normalizeSpecUnits(s));
    } catch (e: any) {
      setSpec(null);
      setErr(e?.message || String(e));
    }
  };

  // Build wood material props for the PRO viewer (optional)
  const woodTop = (topMap || topRough || topNormal)
    ? { map: topMap || undefined, roughnessMap: topRough || undefined, normalMap: topNormal || undefined }
    : undefined;
  const woodLeg = (legMap)
    ? { map: legMap }
    : undefined;

  return (
    <div style={{ maxWidth: 1100, margin: '32px auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Photo-like 3D Preview (PBR, free)</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button onClick={() => onPreset('gardenBench')}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc' }}>
          Preset: Garden Bench
        </button>
        <button onClick={() => onPreset('coffeeTable')}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc' }}>
          Preset: Coffee Table
        </button>
      </div>

      <label style={{ fontSize: 12, color: '#555' }}>Spec JSON (supports "mm" or "in")</label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={12}
        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 10, fontFamily: 'monospace' }}
      />

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Optional wood textures (Top)</div>
          <input value={topMap} onChange={e => setTopMap(e.target.value)} placeholder="top: baseColor URL"
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8, marginBottom: 6 }} />
          <input value={topRough} onChange={e => setTopRough(e.target.value)} placeholder="top: roughness URL"
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8, marginBottom: 6 }} />
          <input value={topNormal} onChange={e => setTopNormal(e.target.value)} placeholder="top: normal URL"
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Optional wood textures (Legs/Aprons)</div>
          <input value={legMap} onChange={e => setLegMap(e.target.value)} placeholder="legs/aprons: baseColor URL"
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button onClick={onRender}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ccc', background: '#111', color: '#fff' }}>
          Render 3D
        </button>
        {err && <span style={{ color: '#b00020' }}>{err}</span>}
      </div>

      {spec && (
        <div style={{ marginTop: 16 }}>
          <FurniturePreview3DPro spec={spec} woodTop={woodTop as any} woodLeg={woodLeg as any} />
        </div>
      )}

      <p style={{ marginTop: 16, color: '#666', fontSize: 12 }}>
        Tip: You can rotate, zoom, and download PNG. To make it even more “photoreal”, provide wood texture URLs above.
      </p>
    </div>
  );
}
