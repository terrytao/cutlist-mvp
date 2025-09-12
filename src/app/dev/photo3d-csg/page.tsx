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
const SPEC_COFFEE = `{
  "units": "in",
  "assembly": { "type": "coffee table", "overall": { "W": 24, "D": 24, "H": 18 } }
}`;
const SPEC_BENCH = `{
  "units": "in",
  "assembly": { "type": "garden bench", "overall": { "W": 60, "D": 12, "H": 18 } },
  "bench": { "slats": 8, "slatThickness": 18, "gap": 6 }
}`;
const JOINS_MT = `[
  { "type": "MORTISE_TENON", "hostPartId": "leg-fl", "hostEdge": "E", "width": 3.0,
    "mt": { "tenonThickness": 0.25, "tenonLength": 0.75, "shoulder": 0.125 } }
]`;
const JOINS_PANEL = `[
  { "type": "DADO", "axis": "X", "offset": 12, "width": 0.75, "depth": 0.25 },
  { "type": "GROOVE", "axis": "Y", "offset": 8, "width": 0.25, "depth": 0.25 }
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
  const [effects, setEffects] = useState(true);
  const [species, setSpecies] = useState<'pine'|'maple'|'oak'|'walnut'|'plywood'>('maple');
  const pricePerBF: Record<'pine'|'maple'|'oak'|'walnut'|'plywood', number> = { pine: 5, maple: 8, oak: 9, walnut: 14, plywood: 6 };
  const mmToIn = (mm: number) => mm / 25.4;
  const clamp = (v:number, lo:number, hi:number)=> Math.max(lo, Math.min(hi, v));
  const deriveParamsMM = (spec:any) => {
    const W = Number(spec?.assembly?.overall?.W||600);
    const D = Number(spec?.assembly?.overall?.D||600);
    const H = Number(spec?.assembly?.overall?.H||450);
    const topThk = clamp(H*0.05, 18, 40);
    const legThk = clamp(Math.min(W,D)*0.07, 40, 70);
    const apronH = clamp(H*0.18, 70, 110);
    return { W, D, H, topThk, legThk, apronH };
  };
  const computeParts = (spec:any) => {
    const { W, D, H, topThk, legThk, apronH } = deriveParamsMM(spec);
    const parts = [
      { name: 'Top', length: W, width: D, thickness: topThk, qty: 1, kind:'top' },
      { name: 'Leg', length: H - topThk, width: legThk, thickness: legThk, qty: 4, kind:'leg' },
      { name: 'Apron - Front', length: W - 2*legThk, width: apronH, thickness: legThk, qty: 1, kind:'apron' },
      { name: 'Apron - Back',  length: W - 2*legThk, width: apronH, thickness: legThk, qty: 1, kind:'apron' },
      { name: 'Apron - Left',  length: D - 2*legThk, width: apronH, thickness: legThk, qty: 1, kind:'apron' },
      { name: 'Apron - Right', length: D - 2*legThk, width: apronH, thickness: legThk, qty: 1, kind:'apron' },
    ];
    return parts.map(p=>({ ...p, length: Math.max(1, Math.round(p.length)), width: Math.max(1, Math.round(p.width)), thickness: Math.max(1, Math.round(p.thickness)) }));
  };
  const estimateCostUSD = (parts:any[]) => {
    const pbf = pricePerBF[species];
    return parts.map(p=>{
      const L = mmToIn(p.length), W = mmToIn(p.width), T = mmToIn(p.thickness);
      const bf = (T*W*L)/144;
      const unitCost = bf * pbf;
      return { ...p, unitCost, totalCost: unitCost * p.qty };
    });
  };
  const fmtDims = (p:any) => {
    const Lmm=p.length, Wmm=p.width, Tmm=p.thickness;
    const Lin=mmToIn(Lmm), Win=mmToIn(Wmm), Tin=mmToIn(Tmm);
    return `${Lmm}×${Wmm}×${Tmm} mm (${Lin.toFixed(2)}×${Win.toFixed(2)}×${Tin.toFixed(2)} in)`;
  };
  const PartThumb = ({kind}:{kind:'top'|'leg'|'apron'}) => {
    const fill = kind==='top' ? '#E9E2D3' : kind==='leg' ? '#D7C7AA' : '#E4D7BF';
    return (<svg width={44} height={28} viewBox="0 0 44 28" className="rounded border border-gray-300 bg-white"><rect x="4" y="6" width="36" height="16" rx="3" fill={fill} stroke="#c7bda8" /></svg>);
  };

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
        <a href="/dev" className="text-xs underline decoration-dotted text-gray-600 dark:text-gray-300">Dev index</a>
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

      <div className="flex items-center gap-3 flex-wrap">
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
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500">Spec presets:</span>
          <button
            onClick={() => setSpecText(SPEC_COFFEE)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-2.5 py-1.5 text-xs"
          >
            Coffee
          </button>
          <button
            onClick={() => setSpecText(SPEC_BENCH)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-2.5 py-1.5 text-xs"
          >
            Bench
          </button>
          <span className="text-xs text-gray-500 ml-3">Joins presets:</span>
          <button
            onClick={() => setJoinsText(JOINS_MT)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-2.5 py-1.5 text-xs"
          >
            M/T
          </button>
          <button
            onClick={() => setJoinsText(JOINS_PANEL)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-2.5 py-1.5 text-xs"
          >
            Dados/Groove
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          Species:
          <select className="rounded border bg-white dark:bg-gray-950 px-2 py-1 text-xs" value={species} onChange={(e)=>setSpecies(e.target.value as any)}>
            <option value="pine">Pine ($5/bf)</option>
            <option value="maple">Maple ($8/bf)</option>
            <option value="oak">Oak ($9/bf)</option>
            <option value="walnut">Walnut ($14/bf)</option>
            <option value="plywood">Plywood ($6/bf)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={effects} onChange={(e)=>setEffects(e.target.checked)} /> Effects
        </label>
      </div>

      {specObj && joinsObj && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="mb-2 text-sm text-gray-600 dark:text-gray-300">Interactive — rotate/zoom; use the Download PNG button above canvas.</div>
            <FurniturePreview3DCSG spec={specObj} joins={joinsObj} />
            {showPro && <div className="mt-3"><FurniturePreview3DPro spec={specObj} enableEffects={effects} /></div>}
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Parts list</div>
              <div className="text-xs text-gray-500">Units: mm (with in)</div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2">Part</th>
                  <th className="py-2">Photo</th>
                  <th className="py-2">Measure</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2 text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {estimateCostUSD(computeParts(specObj)).map((p:any, i:number)=> (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-2">{p.name}</td>
                    <td className="py-2 pr-2"><PartThumb kind={p.kind} /></td>
                    <td className="py-2 pr-2">{fmtDims(p)}</td>
                    <td className="py-2 pr-2">{p.qty}</td>
                    <td className="py-2 pl-2 text-right">${p.totalCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                  <td colSpan={4} className="py-2">Estimated total</td>
                  <td className="py-2 text-right">${estimateCostUSD(computeParts(specObj)).reduce((s:any,p:any)=>s+p.totalCost,0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-2 text-xs text-gray-500">Pricing is approximate using the selected species ($/bf). Live vendor pricing can be integrated later.</div>
          </div>
        </section>
      )}
    </main>
  );
}
