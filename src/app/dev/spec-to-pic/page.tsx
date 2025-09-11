// src/app/dev/spec-to-pic/page.tsx
'use client';

import React, { useMemo, useState } from 'react';
import JoineryPicture from '@/components/JoineryPicture';

function normalizeSpecUnits(spec: any) {
  // Accept "in" or "mm"; convert inches -> mm for rendering stability
  if ((spec?.units || '').toLowerCase() === 'in') {
    const IN = 25.4;
    const o = spec.assembly?.overall || {};
    return {
      ...spec,
      units: 'mm',
      assembly: {
        ...(spec.assembly || {}),
        overall: { W: Math.round(o.W*IN), D: Math.round(o.D*IN), H: Math.round(o.H*IN) }
      }
    };
  }
  return spec;
}

export default function SpecToPicPage() {
  // Example spec (your garden bench in inches)
  const example = JSON.stringify({
    units: "in",
    materials: [{ name: "wood", thickness: 25 }],
    assembly: {
      type: "garden bench",
      overall: { W: 60, D: 12, H: 18 },
      joinery_policy: { shelves: "none", back: "none", fits: "standard" }
    }
  }, null, 2);

  const [text, setText] = useState(example);
  const [parsed, setParsed] = useState<any | null>(null);
  const [error, setError] = useState<string>('');

  const onRender = () => {
    setError('');
    try {
      const spec = JSON.parse(text);
      if (!spec?.assembly?.overall) throw new Error('Missing assembly.overall');
      setParsed(normalizeSpecUnits(spec));
    } catch (e: any) {
      setParsed(null);
      setError(e?.message || String(e));
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '32px auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Spec → Picture (free)</h1>

      <p style={{ color: '#555', marginBottom: 8 }}>
        Paste your ChatGPT spec JSON below (supports <code>units: "mm"</code> or <code>"in"</code>).
      </p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={14}
        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 10, fontFamily: 'monospace' }}
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <button onClick={onRender}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ccc', background: '#111', color: '#fff' }}>
          Render picture
        </button>
        {error && <div style={{ color: '#b00020' }}>{error}</div>}
      </div>

      {parsed && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Preview</h2>
          {/* JoineryPicture uses dimensions to draw; jobs are optional */}
          <JoineryPicture spec={parsed} jobs={[]} />
        </div>
      )}
    </div>
  );
}
