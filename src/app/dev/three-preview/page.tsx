'use client';

import React, { useState } from 'react';
import FurniturePreview3D from '@/components/FurniturePreview3D';
import FurniturePreview3DPro from '@/components/FurniturePreview3DPro';

function normalizeSpec(spec: any) {
  if ((spec?.units || 'mm').toLowerCase() === 'in') {
    const k = 25.4;
    const o = spec.assembly?.overall || {};
    spec = {
      ...spec,
      units: 'mm',
      assembly: { ...(spec.assembly || {}), overall: { W: Math.round(o.W * k), D: Math.round(o.D * k), H: Math.round(o.H * k) } }
    };
  }
  return spec;
}

export default function ThreePreviewPage() {
  const example = {
    units: 'in',
    assembly: { type: 'garden bench', overall: { W: 60, D: 12, H: 18 } },
    bench: { slats: 8, slatThickness: 18, gap: 6 }
  };
  const presetCoffeeTable = {
    units: 'in',
    assembly: { type: 'coffee table', overall: { W: 24, D: 24, H: 18 } }
  };
  const presetBench = {
    units: 'in',
    assembly: { type: 'garden bench', overall: { W: 60, D: 12, H: 18 } },
    bench: { slats: 8, slatThickness: 18, gap: 6 }
  };

  const [text, setText] = useState(JSON.stringify(example, null, 2));
  const [spec, setSpec] = useState<any | null>(null);
  const [err, setErr] = useState<string>('');
  const [effects, setEffects] = useState(true);
  const [species, setSpecies] = useState<'pine'|'maple'|'oak'|'walnut'|'plywood'>('maple');
  const pricePerBF: Record<'pine'|'maple'|'oak'|'walnut'|'plywood', number> = { pine: 5, maple: 8, oak: 9, walnut: 14, plywood: 6 };

  // helpers for parts + pricing
  const mmToIn = (mm: number) => mm / 25.4;
  function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); }
  function deriveParamsMM(spec:any){
    const W = Number(spec?.assembly?.overall?.W||600);
    const D = Number(spec?.assembly?.overall?.D||600);
    const H = Number(spec?.assembly?.overall?.H||450);
    const topThk = clamp(H*0.05, 18, 40);
    const legThk = clamp(Math.min(W,D)*0.07, 40, 70);
    const apronH = clamp(H*0.18, 70, 110);
    return { W, D, H, topThk, legThk, apronH };
  }
  function computeParts(spec:any){
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
  }
  function estimateCostUSD(parts:any[]){
    const pbf = pricePerBF[species];
    return parts.map(p=>{
      const L = mmToIn(p.length), W = mmToIn(p.width), T = mmToIn(p.thickness);
      const bf = (T*W*L)/144; // board feet
      const unitCost = bf * pbf;
      return { ...p, unitCost, totalCost: unitCost * p.qty };
    });
  }
  const [vendorSubtotal, setVendorSubtotal] = useState<number | null>(null);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const [provider, setProvider] = useState<'homeDepot'|'boardFoot'|'serpApi'>('homeDepot');
  const [quoteLoading, setQuoteLoading] = useState(false);
  async function getLiveQuote() {
    try {
      setQuoteLoading(true);
      if (!spec) return;
      const parts = computeParts(spec);
      const body = { parts: parts.map(p => ({ ...p })), species, provider };
      const r = await fetch('/api/pricing/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) { setVendorSubtotal(j.subtotalUSD); setVendorName(j.vendor); }
    } catch (_) {}
    finally { setQuoteLoading(false); }
  }
  function fmtDims(p:any){
    const Lmm=p.length, Wmm=p.width, Tmm=p.thickness;
    const Lin=mmToIn(Lmm), Win=mmToIn(Wmm), Tin=mmToIn(Tmm);
    return `${Lmm}×${Wmm}×${Tmm} mm (${Lin.toFixed(2)}×${Win.toFixed(2)}×${Tin.toFixed(2)} in)`;
  }
  function PartThumb({kind}:{kind:'top'|'leg'|'apron'}){
    const fill = kind==='top' ? '#E9E2D3' : kind==='leg' ? '#D7C7AA' : '#E4D7BF';
    return (
      <svg width={44} height={28} viewBox="0 0 44 28" className="rounded border border-gray-300 bg-white">
        <rect x="4" y="6" width="36" height="16" rx="3" fill={fill} stroke="#c7bda8" />
      </svg>
    );
  }

  const onRender = () => {
    setErr('');
    try {
      const s = JSON.parse(text);
      if (!s?.assembly?.overall) throw new Error('Missing assembly.overall');
      setSpec(normalizeSpec(s));
    } catch (e: any) {
      setSpec(null);
      setErr(e?.message || String(e));
    }
  };

  return (
    <main className="min-h-[calc(100vh-60px)] bg-gradient-to-b from-gray-50 to-white dark:from-black dark:to-gray-950">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Three.js Preview (free)</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Paste a Spec JSON (mm or in). For benches, set <code>bench.slats</code>, <code>bench.slatThickness</code>, <code>bench.gap</code>.
          </p>
          <a href="/dev" className="text-xs underline decoration-dotted text-gray-600 dark:text-gray-300">Dev index</a>
        </header>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm font-mono leading-5 focus:ring-2 focus:ring-black dark:focus:ring-white"
            spellCheck={false}
          />
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={onRender}
              className="inline-flex items-center justify-center rounded-lg bg-black text-white hover:bg-gray-800 px-4 py-2 text-sm"
            >
              Render 3D
            </button>
            <button
              onClick={() => { setText(JSON.stringify(example, null, 2)); setErr(''); }}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-3 py-2 text-sm"
            >
              Load sample
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Presets:</span>
              <button
                onClick={() => { setText(JSON.stringify(presetCoffeeTable, null, 2)); setErr(''); }}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-3 py-1.5 text-xs"
              >
                Coffee table
              </button>
              <button
                onClick={() => { setText(JSON.stringify(presetBench, null, 2)); setErr(''); }}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 px-3 py-1.5 text-xs"
              >
                Bench
              </button>
            </div>
            <div className="ml-auto flex items-center gap-3">
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
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </section>

        {spec && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="mb-2 text-sm text-gray-600 dark:text-gray-300">Interactive — rotate/zoom; use the Download PNG button above canvas.</div>
              <div className="w-full">
                <FurniturePreview3DPro spec={spec} enableEffects={effects} />
              </div>
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
                  {estimateCostUSD(computeParts(spec)).map((p:any, i:number)=> (
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
                    <td className="py-2 text-right">
                      ${estimateCostUSD(computeParts(spec)).reduce((s:any,p:any)=>s+p.totalCost,0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                <span>Pricing uses the selected species ($/bf). Try a local vendor quote:</span>
                <div className="flex items-center gap-2">
                  <select className="rounded border bg-white dark:bg-gray-950 px-2 py-1" value={provider} onChange={(e)=>setProvider(e.target.value as any)}>
                    <option value="homeDepot">Home Depot (local)</option>
                    <option value="boardFoot">Board‑foot only</option>
                    <option value="serpApi">Google Shopping (SerpAPI)</option>
                  </select>
                  <button onClick={getLiveQuote} disabled={!spec || quoteLoading}
                    className={`px-3 py-1.5 rounded-lg text-sm ${(!spec || quoteLoading)
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-black text-white hover:bg-gray-800'}`}
                  >{quoteLoading ? 'Getting…' : 'Get live quote'}</button>
                </div>
              </div>
              {vendorSubtotal != null && (
                <div className="mt-2 text-sm">
                  Vendor ({vendorName}): <span className="font-medium">${vendorSubtotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
