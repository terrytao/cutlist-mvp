'use client';

import React, { useState } from 'react';
import FurniturePreview3D from '@/components/FurniturePreview3D';

function normalizeSpec(spec:any){
  if ((spec?.units||'mm').toLowerCase()==='in') {
    const k=25.4;
    const o=spec.assembly?.overall||{};
    spec = {
      ...spec,
      units:'mm',
      assembly:{ ...(spec.assembly||{}), overall:{ W:Math.round(o.W*k), D:Math.round(o.D*k), H:Math.round(o.H*k) } }
    };
  }
  return spec;
}

export default function ThreePreviewPage(){
  const example = {
    units: "in",
    assembly: { type: "garden bench", overall: { W: 60, D: 12, H: 18 } },
    bench: { slats: 8, slatThickness: 18, gap: 6 }
  };

  const [text, setText] = useState(JSON.stringify(example, null, 2));
  const [spec, setSpec] = useState<any | null>(null);
  const [err, setErr] = useState<string>('');

  const onRender = () => {
    setErr('');
    try {
      const s = JSON.parse(text);
      if (!s?.assembly?.overall) throw new Error('Missing assembly.overall');
      setSpec(normalizeSpec(s));
    } catch(e:any) { setSpec(null); setErr(e?.message||String(e)); }
  };

  return (
    <div style={{ maxWidth:1100, margin:'32px auto', padding:16 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>Real-time 3D Preview (free)</h1>
      <p style={{ color:'#555' }}>Paste a spec JSON (mm or in). For benches, set <code>bench.slats/slatThickness/gap</code>.</p>

      <textarea value={text} onChange={e=>setText(e.target.value)} rows={12}
        style={{ width:'100%', padding:12, border:'1px solid #ddd', borderRadius:10, fontFamily:'monospace' }} />
      <div style={{ marginTop:12, display:'flex', gap:12 }}>
        <button onClick={onRender}
          style={{ padding:'10px 14px', borderRadius:12, border:'1px solid #ccc', background:'#111', color:'#fff' }}>
          Render 3D
        </button>
        {err && <span style={{ color:'#b00020' }}>{err}</span>}
      </div>

      {spec && (
        <div style={{ marginTop:16 }}>
          <FurniturePreview3D spec={spec} />
        </div>
      )}
    </div>
  );
}

