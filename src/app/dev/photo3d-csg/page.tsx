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
'use client';

import React, { useState } from 'react';
import FurniturePreview3DCSG from '@/components/FurniturePreview3DCSG';
import FurniturePreview3DPro from '@/components/FurniturePreview3DPro';

const SAMPLE_SPEC = `{
  "units": "in",
  "assembly": {
    "type": "coffee table",
    "overall": { "W": 24, "D": 24, "H": 18 }
  }
}`;

const SAMPLE_JOINS = `[
  { "type": "DADO", "axis": "X", "offset": 12, "width": 0.75, "depth": 0.25 },
  { "type": "GROOVE", "axis": "Y", "offset": 8, "width": 0.25, "depth": 0.25 },
  { "type": "MORTISE_TENON", "hostPartId": "leg-fl", "hostEdge": "E", "width": 3.0,
    "mt": { "tenonThickness": 0.25, "tenonLength": 0.75, "shoulder": 0.125, "haunch": 0 } }
]`;

function toMM(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n * 25.4 : 0;
}

function convertJoinsToMM(joins: any[], units: string): any[] {
  if (!Array.isArray(joins)) return [];
  const isIn = String(units || 'mm').toLowerCase() === 'in';
  if (!isIn) return joins;
  return joins.map((j) => {
    const out = { ...j } as any;
    const numKeys = ['width', 'depth', 'offset'];
    numKeys.forEach((k) => {
      if (typeof out[k] === 'number') out[k] = toMM(out[k]);
    });
    if (out.mt) {
      const mt = { ...out.mt } as any;
      ['tenonThickness', 'tenonLength', 'shoulder', 'haunch', 'mortiseDepth'].forEach((k) => {
        if (typeof mt[k] === 'number') mt[k] = toMM(mt[k]);
      });
      out.mt = mt;
    }
    return out;
  });
}

export default function Page() {
  const [specText, setSpecText] = useState(SAMPLE_SPEC);
  const [joinsText, setJoinsText] = useState(SAMPLE_JOINS);
  const [error, setError] = useState<string | null>(null);
  const [specObj, setSpecObj] = useState<any | null>(null);
  const [joinsObj, setJoinsObj] = useState<any[] | null>(null);
  const [showPro, setShowPro] = useState(false);

  const onRender = () => {
    setError(null);
    try {
      const s = JSON.parse(specText || '{}');
      const j = JSON.parse(joinsText || '[]');
      const joinsMM = convertJoinsToMM(j, s?.units || 'mm');
      setSpecObj(s);
      setJoinsObj(joinsMM);
    } catch (e: any) {
      setError(e?.message || 'Invalid JSON');
      setSpecObj(null);
      setJoinsObj(null);
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Photo 3D (CSG) — Joinery Preview</h1>
        <p className="text-sm text-gray-500">
          Paste a Spec and Joins JSON, then render actual cut geometry. You can rotate/zoom, and use “Download PNG”.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Spec JSON</label>
          <textarea
            value={specText}
            onChange={(e) => setSpecText(e.target.value)}
            className="w-full h-56 p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 font-mono text-xs"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Joins JSON</label>
          <textarea
            value={joinsText}
            onChange={(e) => setJoinsText(e.target.value)}
            className="w-full h-56 p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 font-mono text-xs"
            spellCheck={false}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={onRender}
          className="px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 text-sm"
        >
          Render CSG
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showPro} onChange={(e) => setShowPro(e.target.checked)} />
          Show Pro visualization (no cuts)
        </label>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {specObj && joinsObj && (
        <section className="space-y-4">
          <div className="text-sm text-gray-500">
            Tip: Use mouse to rotate/zoom. Click “Download PNG” above the canvas to save a snapshot.
          </div>
          <FurniturePreview3DCSG spec={specObj} joins={joinsObj} />
          {showPro && <FurniturePreview3DPro spec={specObj} />}
        </section>
      )}
    </main>
  );
}

