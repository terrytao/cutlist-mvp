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
            <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={effects} onChange={(e)=>setEffects(e.target.checked)} /> Effects
            </label>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </section>

        {spec && (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="mb-2 text-sm text-gray-600 dark:text-gray-300">Interactive — rotate/zoom; use the Download PNG button above canvas.</div>
            <FurniturePreview3DPro spec={spec} enableEffects={effects} />
          </section>
        )}
      </div>
    </main>
  );
}
