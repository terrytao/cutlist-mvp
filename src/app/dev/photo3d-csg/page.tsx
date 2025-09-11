'use client';

import React, { useState } from 'react';
import FurniturePreview3DCSG from '@/components/FurniturePreview3DCSG';

const EX_SPEC = {
  units: "in",
  assembly: { type: "coffee table", overall: { W: 48, D: 24, H: 18 } }
};

const EX_JOINS = [
  { "type":"MORTISE_TENON", "hostPartId":"leg-fl", "hostEdge":"E", "width": 80, "mt": { "tenonThickness": 6, "tenonLength": 18 } },
  { "type":"MORTISE_TENON", "hostPartId":"leg-fr", "hostEdge":"W", "width": 80, "mt": { "tenonThickness": 6, "tenonLength": 18 } },
  { "type":"DADO", "axis":"X", "offset": 300, "width": 18, "depth": 6 },
  { "type":"RABBET", "hostEdge":"N", "width": 12, "depth": 6 }
];

function toMM(spec:any){
  if ((spec?.units||'mm').toLowerCase()==='in') {
    const k=25.4, o=spec.assembly?.overall||{};
    return { ...spec, units:'mm', assembly:{ ...(spec.assembly||{}), overall:{ W:Math.round(o.W*k), D:Math.round(o.D*k), H:Math.round(o.H*k) } } };
  }
  return spec;
}

export default function Photo3DCSGPage(){
  const [specText, setSpecText] = useState(JSON.stringify(EX_SPEC, null, 2));
  const [joinsText, setJoinsText] = useState(JSON.stringify(EX_JOINS, null, 2));
  const [spec, setSpec] = useState<any|null>(null);
  const [joins, setJoins] = useState<any[]|null>(null);
  const [err, setErr] = useState('');

  const onRender = () => {
    setErr('');
    try {
      const s = JSON.parse(specText);
      const j = JSON.parse(joinsText);
      if (!s?.assembly?.overall) throw new Error('Missing assembly.overall');
      setSpec(toMM(s));
      setJoins(j);
    } catch(e:any){ setErr(e?.message||String(e)); setSpec(null); setJoins(null); }
  };

  return (
    <div style={{ maxWidth:1100, margin:'32px auto', padding:16 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>3D “Actual Cuts” (CSG) — Mortises/Dados/Rabbets</h1>

      <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr 1fr' }}>
        <div>
          <div style={{ fontWeight:600, marginBottom:6 }}>Spec JSON</div>
          <textarea value={specText} onChange={e=>setSpecText(e.target.value)} rows={12}
            style={{ width:'100%', padding:12, border:'1px solid #ddd', borderRadius:10, fontFamily:'monospace' }}/>
        </div>
        <div>
          <div style={{ fontWeight:600, marginBottom:6 }}>Joins JSON</div>
          <textarea value={joinsText} onChange={e=>setJoinsText(e.target.value)} rows={12}
            style={{ width:'100%', padding:12, border:'1px solid #ddd', borderRadius:10, fontFamily:'monospace' }}/>
        </div>
      </div>

      <div style={{ marginTop:12, display:'flex', gap:12 }}>
        <button onClick={onRender} style={{ padding:'10px 14px', borderRadius:12, border:'1px solid #ccc', background:'#111', color:'#fff' }}>
          Render CSG
        </button>
        {err && <span style={{ color:'#b00020' }}>{err}</span>}
      </div>

      {spec && joins && (
        <div style={{ marginTop:16 }}>
          <FurniturePreview3DCSG spec={spec} joins={joins} />
        </div>
      )}
      <p style={{ marginTop:8, color:'#666', fontSize:12 }}>
        Tip: change <code>hostPartId / hostEdge</code> on M/T, or <code>width/depth/offset</code> on dado/rabbet and re-render.
      </p>
    </div>
  );
}

