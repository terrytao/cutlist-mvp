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
