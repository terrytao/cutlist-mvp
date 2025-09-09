// src/app/dev/oneclick/page.tsx
'use client';

import React, { useRef, useState } from 'react';
import PlatePreview from '@/components/PlatePreview';
import { buildPlateUrl } from '@/lib/plateUrl';

type Spec = {
  units: 'mm' | 'in';
  materials: { name: string; thickness: number }[];
  assembly: {
    type: string;
    overall: { W: number; D: number; H: number };
    joinery_policy: { shelves?: 'dado'|'screw'|'none'; back?: 'rabbet'|'groove'|'none'; fits?: 'snug'|'standard'|'loose' };
  };
};

const mm = (v:number)=>v;
const pick = <T,>(arr:T[], f:(x:T)=>boolean, fallback:T)=>arr.find(f) ?? fallback;

function planJoineryFromSpec(spec: Spec){
  const { W, D, H } = spec.assembly.overall;
  const mats = spec.materials || [];
  const sideThk = pick(mats, m => m.thickness >= 15 && m.thickness <= 22, {name:'Plywood', thickness:18}).thickness;
  const backThk = pick(mats, m => m.thickness <= 6.5, {name:'Back', thickness:6}).thickness;
  const shelfThk = pick(mats, m => m.thickness >= 15 && m.thickness <= 22, {name:'Shelf', thickness:18}).thickness;

  const sideHost = { name:'Side Panel', thickness: sideThk, length: mm(H), width: mm(D) };

  const plates: Array<{ kind:'rabbet'|'dado'|'groove', spec:any, host?:string, insert?:string }> = [];
  const jobs: any[] = [];

  if (spec.assembly.joinery_policy.back === 'rabbet') {
    const rabWidth = Math.min(12, Math.round(D * 0.05));
    const rabDepth = Math.min(Math.round(sideThk * 0.6), backThk);
    plates.push({ kind:'rabbet', spec:{ units:'mm', host:{ name:'Side Panel', thickness: sideThk }, insert:{ name:'Back Panel', thickness: backThk }, rabbet:{ width: rabWidth, depth: rabDepth } } });
    jobs.push({ type:'RABBET', edge:'N', host: sideHost, width: rabWidth, depth: rabDepth, label:'Back Rabbet (top edge)' });
  } else if (spec.assembly.joinery_policy.back === 'groove') {
    const grooveW = Math.min(backThk, 6.35);
    const grooveD = Math.min(Math.round(sideThk * 0.5), backThk);
    const offsetY = Math.round(H * 0.5);
    plates.push({ kind:'groove', spec:{ units:'mm', host:{ name:'Side Panel', thickness: sideThk, length:H, width:D }, groove:{ axis:'X', width: grooveW, depth: grooveD, offset: offsetY } } });
    jobs.push({ type:'GROOVE', axis:'X', host: sideHost, offset: offsetY, width: grooveW, depth: grooveD, label:'Back Groove (center)' });
  }

  if (spec.assembly.joinery_policy.shelves === 'dado') {
    const shelfOffset = Math.round(H * 0.5);
    const dadoW = shelfThk;
    const dadoD = Math.min(Math.round(sideThk * 0.35), 8);
    plates.push({ kind:'dado', spec:{ units:'mm', host:{ name:'Side Panel', thickness: sideThk, length:H, width:D }, insert:{ name:'Shelf', thickness:shelfThk }, dado:{ axis:'X', width:dadoW, depth:dadoD, offset:shelfOffset } } });
    jobs.push({ type:'DADO', axis:'X', host: sideHost, offset: shelfOffset, width: dadoW, depth: dadoD, label:'Shelf Dado (mid)' });
  }

  return { plates, jobs, toolDefaults:{ units:'mm', tooling:{ endmillDiameter:6.35, stepdown:2, stepover:0.5, feedXY:900, feedZ:300, safeZ:8 } } };
}

export default function OneClick() {
  const [prompt, setPrompt] = useState('2x4 feet coffee table with mortise/tenon, back in rabbets');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [plan, setPlan] = useState<ReturnType<typeof planJoineryFromSpec> | null>(null);
  const once = useRef(false);

  const onGenerate = async () => {
    if (!once.current) once.current = true;
    setLoading(true); setSpec(null); setPlan(null); setDebug(null);
    try {
      const res = await fetch('/api/spec', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ prompt, imageUrl: imageUrl || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Spec failed');
      setSpec(data.spec);
      setDebug(data._debug || null);
      setPlan(planJoineryFromSpec(data.spec));
    } catch (e:any) {
      alert(e.message || String(e));
    } finally {
      setLoading(false);
      setTimeout(()=>{ once.current=false; }, 100);
    }
  };

  const onDownloadGcode = async () => {
    if (!plan) return;
    const payload = { units: plan.toolDefaults.units, tooling: plan.toolDefaults.tooling, jobs: plan.jobs };
    const res = await fetch('/api/cam/toolpaths', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const text = await res.text();
    if (!res.ok) { alert(text); return; }
    const blob = new Blob([text], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'joinery.nc'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  };

  const onDownloadZip = async () => {
    if (!plan || !spec) return;
    const origin = window.location.origin;
    const plateUrls = plan.plates.map(p => origin + buildPlateUrl(p.kind, p.spec, { title: true, w: 1000, font: 18, host: p.host, insert: p.insert }));
    const payload = {
      spec,
      units: plan.toolDefaults.units,
      tooling: plan.toolDefaults.tooling,
      jobs: plan.jobs,
      plateUrls,
      filename: 'cutlist-package'
    };
    const res = await fetch('/api/export/package', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const blob = await res.blob();
    if (!res.ok) { const t = await blob.text(); alert(t); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'cutlist-package.zip';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '32px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>One-Click: Prompt → Spec → Plates → G-code</h1>

      <div style={{ display:'grid', gap:12 }}>
        <label style={{ fontSize: 12, color:'#555' }}>Prompt</label>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3}
          style={{ width:'100%', padding:12, border:'1px solid #ddd', borderRadius:10 }} />
        <label style={{ fontSize: 12, color:'#555' }}>Optional image URL (kept off by default for cost)</label>
        <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)}
          placeholder="https://…" style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:10 }} />
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <button disabled={loading} onClick={onGenerate}
            style={{ padding:'10px 14px', borderRadius:12, border:'1px solid #ccc', background:'#111', color:'#fff' }}>
            {loading ? 'Generating…' : 'Generate spec & plates'}
          </button>
          <button disabled={!plan} onClick={onDownloadGcode}
            style={{ padding:'10px 14px', borderRadius:12, border:'1px solid #ccc', background: plan ? '#0a7' : '#ccc', color:'#fff' }}>
            Download G-code (.nc)
          </button>
          <button disabled={!plan || !spec} onClick={onDownloadZip}
            style={{ padding:'10px 14px', borderRadius:12, border:'1px solid #ccc', background: (plan && spec) ? '#07a' : '#ccc', color:'#fff' }}>
            Download ZIP (plates + G-code + cutlist)
          </button>
        </div>
      </div>

      {spec && (
        <div style={{ marginTop:24, padding:16, border:'1px solid #eee', borderRadius:12 }}>
          <h2 style={{ fontSize:18, marginBottom:8 }}>Spec</h2>
          <pre style={{ whiteSpace:'pre-wrap', fontSize:12, margin:0 }}>{JSON.stringify(spec, null, 2)}</pre>
          {debug && (
            <details style={{ marginTop:12 }}>
              <summary>Debug (model & usage)</summary>
              <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>{JSON.stringify(debug, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {plan && plan.plates.length > 0 && (
        <div style={{ marginTop:24 }}>
          <h2 style={{ fontSize:18, marginBottom:8 }}>Joinery Plates</h2>
          <div style={{ display:'grid', gap:16, gridTemplateColumns:'1fr', maxWidth: 900 }}>
            {plan.plates.map((p, i)=>(
              <div key={i}>
                <h3 style={{ fontSize:16, margin:'8px 0' }}>{p.kind.toUpperCase()}</h3>
                <PlatePreview kind={p.kind} spec={p.spec} host={p.host} insert={p.insert} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
