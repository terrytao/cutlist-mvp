"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
const FurniturePreview3DPro = dynamic(() => import("@/components/FurniturePreview3DPro"), {
  ssr: false,
  loading: () => <div className="text-xs text-gray-500">Loading furniture preview…</div>
});
const FurniturePreview3D = dynamic(() => import("@/components/FurniturePreview3D"), {
  ssr: false,
  loading: () => <div className="text-xs text-gray-500">Loading furniture preview…</div>
});
const FurniturePreview3DCSG = dynamic(() => import("@/components/FurniturePreview3DCSG"), {
  ssr: false,
  loading: () => <div className="text-xs text-gray-500">Loading joinery preview…</div>
});
import PlatePreview from "@/components/PlatePreview";
import { buildPlateUrl } from "@/lib/plateUrl";
import { jobsFromProductionSpec } from "@/lib/jobs-from-joins";
import { platesFromProductionSpec } from "@/lib/plates-from-joins";

/* Types */
type GenResp = { images: string[]; usedPrompt?: string };
type SpecResp = { source: "llm" | "mock"; spec: any; usage?: any; error?: string };
type JoinImg = { title: string; src: string };
type JoinResp = { images: JoinImg[]; error?: string };
type Round = { images: string[]; selected: number | null; note?: string };
type TrialStatus = { clientId: string; usedCents: number; capCents: number; remainingCents: number; ttlSec: number | null };

/* UI helpers */
function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary"|"ghost"|"soft" }) {
  const { variant="primary", className="", ...rest } = props;
  const base = "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  const styles = {
    primary: "bg-black text-white hover:bg-gray-800 focus:ring-black dark:bg-white dark:text-black dark:hover:bg-gray-100",
    soft: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700",
    ghost: "border border-gray-300 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800",
  }[variant];
  return <button className={`${base} ${styles} px-3 sm:px-4 py-2 ${className}`} {...rest} />;
}
function Card({children,className=""}:{children:any;className?:string}) {
  return <div className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm ${className}`}>{children}</div>;
}
function Section({title,desc,children}:{title:string;desc?:string;children:any}) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {desc && <p className="text-sm text-gray-500 mt-1">{desc}</p>}
      </div>
      {children}
    </Card>
  );
}

/* Page */
export default function Home() {
  const [isClient, setIsClient] = useState(false);
  useEffect(()=> setIsClient(true), []);
  const isDev = process.env.NODE_ENV !== "production";
  const env = process.env.NODE_ENV || "development";
  const envLabel = env.toUpperCase();
  const envBadgeClass = env === "production"
    ? "bg-red-50 border-red-200 text-red-700"
    : env === "test"
      ? "bg-indigo-50 border-indigo-200 text-indigo-700"
      : "bg-blue-50 border-blue-200 text-blue-700";
  // Flow
  const [basePrompt, setBasePrompt] = useState('');
  const [refineText, setRefineText] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [idx, setIdx] = useState(0);
  const [style, setStyle] = useState("Product render (clean, neutral light)");
  const [imgSize, setImgSize] = useState<"1024x1024"|"1024x1536"|"1536x1024"|"auto">("1024x1024");
  const [lenientJson, setLenientJson] = useState(true);
  const [units, setUnits] = useState<"in"|"mm">("in");
  const current = rounds[idx] || { images: [], selected: null };

  // Busy & error
  const [loading, setLoading] = useState<null | "gen" | "refine" | "cutlist">(null);
  const [error, setError] = useState<string | null>(null);

  // Joinery previews
  const [joinImgs, setJoinImgs] = useState<JoinImg[]>([]);
  const [loadingJoin, setLoadingJoin] = useState(false);
  const autoJoinReq = useRef(0);

  // Spec/SVG
  const [spec, setSpec] = useState<any>(null);
  const [showSvg, setShowSvg] = useState(false);
  const [svgNonce, setSvgNonce] = useState(0);
  // Production spec (structured) from LLM
  const [prodSpec, setProdSpec] = useState<any | null>(null);
  const [plateDefs, setPlateDefs] = useState<any[] | null>(null);
  const [species, setSpecies] = useState<'pine'|'maple'|'oak'|'walnut'|'plywood'>('maple');
  const [provider, setProvider] = useState<'homeDepot'|'boardFoot'|'serpApi'>('homeDepot');
  const [vendorSubtotal, setVendorSubtotal] = useState<number|null>(null);
  const [vendorName, setVendorName] = useState<string|null>(null);
  const [vendorLines, setVendorLines] = useState<any[]|null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [refineTextHome, setRefineTextHome] = useState('');
  const pricePerBF: Record<'pine'|'maple'|'oak'|'walnut'|'plywood', number> = { pine: 5, maple: 8, oak: 9, walnut: 14, plywood: 6 };
  const paletteBySpecies: Record<typeof species, { top: string; leg: string; apron: string; slat: string }> = {
    pine:   { top: '#E8D9B5', leg: '#DFC79A', apron: '#E2CFA6', slat: '#F1E4C8' },
    maple:  { top: '#DCC9A6', leg: '#CFBEA2', apron: '#D0BEA1', slat: '#E2D5BD' },
    oak:    { top: '#C9B38A', leg: '#BFA77E', apron: '#C5AE82', slat: '#D6C6A3' },
    walnut: { top: '#8E6B53', leg: '#7A5B46', apron: '#80614C', slat: '#A3856F' },
    plywood:{ top: '#D8CCB4', leg: '#C9BC9D', apron: '#D0C4A8', slat: '#E5DAC3' },
  };
  function mmToIn(mm:number){ return mm/25.4; }
  function estimateCostFromSpec(ps:any){
    if (!ps?.cutlist) return 0;
    const pbfMap = pricePerBF;
    let total = 0;
    for (const p of ps.cutlist) {
      const mat = String(p.material||'').toLowerCase();
      const sp = mat.includes('ply') ? 'plywood' : species;
      const bf = (mmToIn(p.thickness)*mmToIn(p.width)*mmToIn(p.length))/144;
      total += bf * (pbfMap[sp]||8) * (p.qty||1);
    }
    return total;
  }
  const svgUrl = useMemo(() => {
    if (!spec || !showSvg) return null;
    const encoded = encodeURIComponent(JSON.stringify(spec));
    return `/api/export/svg?spec=${encoded}&w=1200&joins=1&labelbg=1&fsmin=9&fsmax=12&t=${svgNonce}`;
  }, [spec, showSvg, svgNonce]);

  // Convert ProductionSpec -> simple preview spec
  function toPreviewSpec(ps: any) {
    if (!ps) return null;
    const units = (ps.units === "in" || ps.units === "mm") ? ps.units : "mm";
    const o = ps.overall || ps.assembly?.overall || {};
    const W = Number(o.W) || 600, D = Number(o.D) || 600, H = Number(o.H) || 450;
    const overall = { W, D, H };
    const type = ps.metadata?.type || ps.assembly?.type || "project";
    return { units, assembly: { type, overall } };
  }

  function isValidPreviewSpec(s: any) {
    try {
      if (!s?.assembly?.overall) return false;
      const { W, D, H } = s.assembly.overall;
      return [W, D, H].every((v: any) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    } catch { return false; }
  }

  function toPlatePreviews(ps: any) {
    try {
      const pack = platesFromProductionSpec(ps);
      const units = pack.units || "mm";
      const items: any[] = [];
      for (const p of pack.plates) {
        const host = p.host ? { ...p.host, length: p.host.length ?? 600, width: p.host.width ?? 300 } : undefined;
        const insert = p.insert ? { ...p.insert } : undefined;
        if (p.kind === "RABBET") {
          if (host && insert) items.push({ kind: "rabbet", spec: { units, host, insert, rabbet: p.rabbet } });
        } else if (p.kind === "DADO") {
          if (host) items.push({ kind: "dado", spec: { units, host, insert, dado: p.dado } });
        } else if (p.kind === "GROOVE") {
          if (host) items.push({ kind: "groove", spec: { units, host, insert, groove: p.groove } });
        } else if (p.kind === "MORTISE_TENON" && p.mt) {
          // Show both mortise and tenon plates
          const w = p.width ?? insert?.width ?? 80;
          if (host && insert) items.push({ kind: "mortise", spec: { units, host, insert, mt: p.mt, hostEdge: p.hostEdge, width: w } });
          if (insert) items.push({ kind: "tenon",   spec: { units, insert, mt: p.mt, width: w } });
        }
      }
      return items;
    } catch {
      return [];
    }
  }

  async function downloadZipFromSpec(ps: any) {
    try {
      setError(null);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const previews = toPlatePreviews(ps) as Array<{ kind: string; spec: any; }>;
      const plateUrls = previews.map(pd => origin + buildPlateUrl(pd.kind as any, pd.spec, { title: true, w: 1000, font: 18, host: (pd.spec as any).host?.name, insert: (pd.spec as any).insert?.name }));
      const tooling = { endmillDiameter: 6.35, stepdown: 2, stepover: 0.5, feedXY: 900, feedZ: 300, safeZ: 8 };
      const cam = jobsFromProductionSpec(ps);
      const payload = { spec: ps, units: cam.units, tooling, jobs: cam.jobs, plateUrls, filename: 'cutlist-package' };
      const res = await fetch('/api/export/package', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const blob = await res.blob();
      if (!res.ok) { const t = await blob.text(); throw new Error(t || 'ZIP failed'); }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'cutlist-package.zip';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e?.message || 'ZIP failed');
    }
  }

  // Trial badge + entitlement
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [entitled, setEntitled] = useState(false);
  const [effects, setEffects] = useState(false); // default off for stability
  const [usePro, setUsePro] = useState(false);   // Pro (photo) renderer toggle
  const [safeMode, setSafeMode] = useState(true); // Safe mode: force basic renderer

  const refreshTrial = async () => {
    try {
      const r = await fetch("/api/trial/status", { cache: "no-store" });
      if (r.ok) setTrial(await r.json());
    } catch {}
  };
  const refreshEntitled = async () => {
    try {
      const r = await fetch("/api/export/status", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); setEntitled(Boolean(j.entitled)); }
    } catch {}
  };

  useEffect(() => { refreshTrial(); refreshEntitled();
    // if returning from Stripe success
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      if (u.searchParams.get("paid") === "1") {
        setTimeout(refreshEntitled, 1500);
      }
    }
  }, []);

  // API helpers
  async function callImagesApi(body: any): Promise<GenResp> {
    const res = await fetch("/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Image generation failed");
    return data;
  }

  async function generateBase() {
    try { setError(null); setLoading("gen"); setSpec(null); setShowSvg(false);
      const data = await callImagesApi({ prompt: basePrompt, count: 1, size: imgSize, style });
      setRounds([{ images: data.images, selected: null, note: "base" }]); setIdx(0);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(null); refreshTrial(); }
  }

  // One-click: Generate Production Spec and preview (furniture + joinery)
  async function generateSpecAndPreview() {
    try {
      setError(null);
      setLoading("cutlist");
      const res = await fetch("/api/spec/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: 'no-store',
        body: JSON.stringify({ prompt: basePrompt, lenient: lenientJson, t: Date.now() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Spec generation failed");
      setProdSpec(data.spec);
      setPlateDefs(toPlatePreviews(data.spec));
      // In safe mode, prefer the stable basic preview and disable effects
      if (safeMode) { setUsePro(false); setEffects(false); }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function refineSpec() {
    if (!basePrompt.trim() || !refineTextHome.trim()) return;
    try {
      setError(null);
      setLoading('cutlist');
      const prompt = `${basePrompt}. ${refineTextHome}`;
      const res = await fetch('/api/spec/production', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ prompt, lenient: lenientJson, t: Date.now() }) });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || 'Spec generation failed');
      setProdSpec(data.spec); setPlateDefs(toPlatePreviews(data.spec)); setRefineTextHome('');
    } catch (e:any) { setError(e.message); }
    finally { setLoading(null); }
  }

  async function getLiveQuoteHome() {
    if (!prodSpec?.cutlist) return;
    try {
      setQuoteLoading(true);
      const parts = (prodSpec.cutlist as any[]).map(p => {
        const name: string = p.name || '';
        const lower = name.toLowerCase();
        const kind = lower.includes('leg') ? 'leg' : lower.includes('apron') ? 'apron' : lower.includes('top') ? 'top' : 'apron';
        return { name, kind, length: p.length, width: p.width, thickness: p.thickness, qty: p.qty || 1 };
      });
      const body = { parts, species, provider } as any;
      const r = await fetch('/api/pricing/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) { setVendorSubtotal(j.subtotalUSD); setVendorName(j.vendor); setVendorLines(Array.isArray(j.lines) ? j.lines : null); }
    } catch {}
    finally { setQuoteLoading(false); }
  }

  async function refineRound() {
    if (!rounds.length) { setError("Generate pictures first."); return; }
    const cur = rounds[idx] || { images: [], selected: null };
    if (cur.selected === null) { setError("Pick one picture to refine from."); return; }
    try { setError(null); setLoading("refine"); setSpec(null); setShowSvg(false);
      const fullPrompt = `${basePrompt}. Reference the chosen concept (materials/proportions) and apply: ${refineText}.`;
      const data = await callImagesApi({ prompt: fullPrompt, count: 1, size: imgSize, style });
      const next: Round = { images: data.images, selected: null, note: refineText || "(refine)" };
      setRounds(prev => { const arr = [...prev, next]; return arr.length > 5 ? arr.slice(arr.length - 5) : arr; });
      setIdx(i => Math.min(i + 1, 4)); setRefineText("");
    } catch (e:any) { setError(e.message); }
    finally { setLoading(null); refreshTrial(); }
  }

  async function generateCutList() {
    const cur = rounds[idx] || { images: [], selected: null };
    if (!rounds.length || cur.selected === null) { setError("Pick a final picture first."); return; }
    try { setError(null); setLoading("cutlist");
      const chosen = cur.images[cur.selected];
      const res = await fetch("/api/spec-from-image", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: basePrompt, units, imageDataUrl: chosen }) });
      const data: SpecResp = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Spec generation failed");
      setSpec(data.spec); setShowSvg(true); setSvgNonce(n => n + 1);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(null); refreshTrial(); }
  }

  // Accurate joinery previews tied to selected image
  useEffect(() => {
    if (!current.images.length || current.selected === null) { if (joinImgs.length) setJoinImgs([]); return; }
    setJoinImgs([]); const reqId = (autoJoinReq.current += 1);
    const chosenImg = current.images[current.selected];
    const acA = new AbortController(), acS = new AbortController(), acJ = new AbortController();

    const run = async () => {
      try {
        setLoadingJoin(true); setError(null);
        // analyze style (best effort)
        let styleRef = "";
        try {
          const r = await fetch("/api/analyze-image", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl: chosenImg, units, nonce: Date.now() }), cache: "no-store", signal: acA.signal });
          const j = await r.json(); if (reqId !== autoJoinReq.current) return;
          if (r.ok && j?.style) { const s = j.style;
            styleRef = `Match visual style: leg ${s.leg_shape}; apron ${s.apron_height}; edge ${s.top_edge}; wood ${s.wood}; tone ${s.color_tone}; ${s.keywords}.`; }
        } catch {}
        // spec
        const sRes = await fetch("/api/spec-from-image", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: basePrompt, units, imageDataUrl: chosenImg, nonce: Date.now() }), cache: "no-store", signal: acS.signal });
        const sDat: SpecResp = await sRes.json(); if (reqId !== autoJoinReq.current) return;
        if (!sRes.ok) throw new Error((sDat as any)?.error || "Spec generation failed (joinery)");
        // images
        const jRes = await fetch("/api/joinery-images", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: sDat.spec, count: 2, size: "1024x1024", style: styleRef, nonce: Date.now() }), cache: "no-store", signal: acJ.signal });
        const jDat: JoinResp = await jRes.json(); if (reqId !== autoJoinReq.current) return;
        if (!jRes.ok) throw new Error(jDat?.error || "Joinery generation failed");
        setJoinImgs(jDat.images || []);
      } catch (e:any) { if (e?.name !== "AbortError") setError(e?.message || "Joinery preview failed"); }
      finally { if (reqId === autoJoinReq.current) { setLoadingJoin(false); refreshTrial(); } }
    };
    const timer = setTimeout(run, 300);
    return () => { clearTimeout(timer); acA.abort(); acS.abort(); acJ.abort(); };
  }, [idx, current.selected, current.images, basePrompt, units, joinImgs.length]);

  // Stripe: start Checkout with current clientId
  async function buyExport() {
    try {
      const ts = await fetch("/api/trial/status", { cache: "no-store" }).then(r => r.json() as Promise<TrialStatus>);
      const res = await fetch("/api/pay/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: ts.clientId, returnUrl: window.location.origin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "checkout failed");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
    }
  }

  // UI badge
  const remainingDollars = trial ? (trial.remainingCents / 100).toFixed(2) : null;
  const capDollars = trial ? (trial.capCents / 100).toFixed(2) : null;
  const badgeClass = trial && trial.remainingCents > 0
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : "bg-amber-50 border-amber-200 text-amber-700";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-black dark:to-gray-950 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 backdrop-blur border-b border-gray-200/60 dark:border-gray-800/60 bg-white/70 dark:bg-black/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 ring-2 ring-white/60 dark:ring-white/10 shadow-sm" />
          <div>
            <h1 className="text-base font-bold">Cut-List Builder</h1>
            <p className="text-xs text-gray-500">Prompt → 3 concepts → refine → finalize → cut list + SVG</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${envBadgeClass}`}>
              <span className="hidden sm:inline">Env:</span>
              <span>{envLabel}</span>
            </span>
            <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${badgeClass}`} title="We cover a small preview budget so you can try. Final export is paid.">
              <span className="hidden sm:inline">Free preview left:</span>
              <span>${remainingDollars ?? "—"} / ${capDollars ?? "—"}</span>
              <button onClick={refreshTrial} className="underline decoration-dotted text-xs">refresh</button>
            </span>
            {isDev && (
              <Link href="/dev" className="text-xs underline decoration-dotted">
                Dev
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Prompt → Spec (ChatGPT) */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-100/70 dark:border-sky-900/40 bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/30 p-5 sm:p-6">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-sky-700 dark:text-sky-300">Prompt → Production Spec</div>
            <label className="text-xs text-gray-600 dark:text-gray-300">Describe your furniture</label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white"
              value={basePrompt}
              onChange={(e)=>setBasePrompt(e.target.value)}
              placeholder="e.g., Square end table, 24×24×16 in, Shaker style, mortise & tenon"
            />
            <div className="flex items-center gap-3">
              <Btn onClick={generateSpecAndPreview} disabled={loading!==null}>
                {loading==="cutlist" ? "Generating…" : "Generate spec + preview"}
              </Btn>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={lenientJson} onChange={(e)=>setLenientJson(e.target.checked)} /> Lenient JSON parse
              </label>
              <a href="/dev" className="text-sm underline decoration-dotted text-gray-600 dark:text-gray-300">Dev tools</a>
            </div>
          </div>
        </div>

        {prodSpec && (
          <Section title="Generated Spec (AI)" desc="Structured specification parsed from your prompt">
            <div className="overflow-auto max-h-[50vh] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <pre className="text-xs leading-5 whitespace-pre-wrap">{JSON.stringify(prodSpec, null, 2)}</pre>
              {(() => {
                try {
                  const dbg = (prodSpec as any)?._debug;
                  if (!dbg) return null;
                  return <div className="mt-2 text-xs text-gray-500">Debug: {JSON.stringify(dbg)}</div>;
                } catch { return null; }
              })()}
            </div>
          </Section>
        )}

        {prodSpec && (
          <Section title="Spec-driven preview" desc="Structured spec from AI, rendered locally (furniture + joinery)">
            {!isClient && <div className="text-xs text-gray-500">Preparing previews…</div>}
            {(() => { const pv = toPreviewSpec(prodSpec); const ok = isValidPreviewSpec(pv); return !ok ? (
              <div className="text-xs text-red-600">Spec missing/invalid dimensions. Try Refine or Generate again.</div>
            ) : null; })()}
            <div className="mb-3 flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={safeMode} onChange={(e)=>{ setSafeMode(e.target.checked); if (e.target.checked) { setUsePro(false); setEffects(false); } }} /> Safe mode
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={usePro && !safeMode} onChange={(e)=>setUsePro(e.target.checked)} disabled={safeMode} /> Photo preview (beta)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={effects} onChange={(e)=>setEffects(e.target.checked)} disabled={safeMode || !usePro} /> Effects
              </label>
              <label className="flex items-center gap-2">
                Species:
                <select className="rounded border bg-white dark:bg-gray-950 px-2 py-1"
                  value={species} onChange={(e)=>setSpecies(e.target.value as any)}>
                  <option value="pine">Pine ($5/bf)</option>
                  <option value="maple">Maple ($8/bf)</option>
                  <option value="oak">Oak ($9/bf)</option>
                  <option value="walnut">Walnut ($14/bf)</option>
                  <option value="plywood">Plywood ($6/bf)</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Vendor:
                <select className="rounded border bg-white dark:bg-gray-950 px-2 py-1" value={provider} onChange={(e)=>setProvider(e.target.value as any)}>
                  <option value="homeDepot">Home Depot (local)</option>
                  <option value="boardFoot">Board‑foot only</option>
                  <option value="serpApi">Google Shopping (SerpAPI)</option>
                </select>
              </label>
              <div className="ml-auto flex items-center gap-3">
                <span>Est. materials: <span className="font-medium">${prodSpec ? estimateCostFromSpec(prodSpec).toFixed(2) : '0.00'}</span></span>
                <button onClick={getLiveQuoteHome} disabled={!prodSpec || quoteLoading}
                  className={`px-3 py-1.5 rounded-lg text-xs ${(!prodSpec || quoteLoading) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800'}`}>
                  {quoteLoading ? 'Getting…' : 'Get live quote'}
                </button>
                {vendorSubtotal!=null && <span>Vendor ({vendorName}): <span className="font-medium">${vendorSubtotal.toFixed(2)}</span></span>}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Furniture preview</div>
                {isClient && (() => { const pv = toPreviewSpec(prodSpec); if (!isValidPreviewSpec(pv)) return (<div className="text-xs text-gray-500">Waiting for valid spec…</div>);
                  const wantPro = usePro && !safeMode;
                  return wantPro ? (
                    <FurniturePreview3DPro spec={pv!} enableEffects={effects} palette={paletteBySpecies[species]} onError={()=>{ setEffects(false); }} />
                  ) : (
                    <FurniturePreview3D spec={pv!} enableEffects={false} />
                  );
                })()}
              </Card>
              <Card className="p-4">
                <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Joinery preview</div>
                {isClient && (() => { const pv = toPreviewSpec(prodSpec); return isValidPreviewSpec(pv) ? (
                  <FurniturePreview3DCSG spec={pv!} joins={Array.isArray(prodSpec.joins) ? prodSpec.joins : []} />
                ) : (<div className="text-xs text-gray-500">Waiting for valid spec…</div>); })()}
              </Card>
            </div>

            {/* Parts table */}
            <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Parts list</div>
                <div className="text-xs text-gray-500">Units: mm (with in)</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2">Part</th>
                    <th className="py-2">Measure</th>
                    <th className="py-2">Qty</th>
                    <th className="py-2 text-right">Est. Cost</th>
                    {vendorLines && <th className="py-2 text-right">Vendor</th>}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(prodSpec?.cutlist) && (prodSpec!.cutlist as any[]).map((p:any, i:number) => {
                    const dims = `${p.length}×${p.width}×${p.thickness} mm (${mmToIn(p.length).toFixed(2)}×${mmToIn(p.width).toFixed(2)}×${mmToIn(p.thickness).toFixed(2)} in)`;
                    const sp = String(p.material||'').toLowerCase().includes('ply') ? 'plywood' : species;
                    const bf = (mmToIn(p.thickness)*mmToIn(p.width)*mmToIn(p.length))/144;
                    const estUnit = bf * (pricePerBF[sp as keyof typeof pricePerBF] || 8);
                    const estTotal = estUnit * (p.qty||1);
                    const vLine = vendorLines && vendorLines[i] ? vendorLines[i] : null;
                    return (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-2 pr-2">{p.name}</td>
                        <td className="py-2 pr-2">{dims}</td>
                        <td className="py-2 pr-2">{p.qty||1}</td>
                        <td className="py-2 pl-2 text-right">${estTotal.toFixed(2)}</td>
                        {vendorLines && <td className="py-2 pl-2 text-right">{vLine ? `$${Number(vLine.vendorTotalUSD||0).toFixed(2)}` : '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                    <td colSpan={3} className="py-2">Totals</td>
                    <td className="py-2 text-right">${prodSpec ? estimateCostFromSpec(prodSpec).toFixed(2) : '0.00'}</td>
                    {vendorLines && <td className="py-2 text-right">{vendorSubtotal!=null ? `$${vendorSubtotal.toFixed(2)}` : '—'}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Refine */}
            <div className="mt-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Refine spec</div>
              <div className="flex flex-col md:flex-row gap-3">
                <input className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white"
                  value={refineTextHome} onChange={(e)=>setRefineTextHome(e.target.value)} placeholder="e.g., change to walnut, tapered legs, aprons 70mm" />
                <Btn variant="ghost" onClick={refineSpec} disabled={loading!==null || !refineTextHome.trim()}>Refine spec</Btn>
                <Btn variant="soft" onClick={()=>{ setProdSpec(null); setPlateDefs(null); setVendorSubtotal(null); setVendorName(null); }}>Reset</Btn>
              </div>
            </div>
            {plateDefs && plateDefs.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Joinery plates (dimensioned)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plateDefs.slice(0, 6).map((pd, i) => (
                    <div key={i} className="">
                      <PlatePreview kind={pd.kind} spec={pd.spec} className="" />
                      <div className="mt-1 text-xs">
                         <a href="#"
                          onClick={(e)=>{ e.preventDefault(); const params = new URLSearchParams(); params.set('title','1'); params.set('w','900'); params.set('font','18'); params.set('spec', JSON.stringify(pd.spec)); const url = `/api/export/joint/${pd.kind}?` + params.toString(); window.open(url, '_blank'); }}
                          className="underline">Open raw SVG</a>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  {entitled ? (
                    <Btn variant="soft" onClick={()=> prodSpec && downloadZipFromSpec(prodSpec)}>Download package (ZIP)</Btn>
                  ) : (
                    <Btn variant="ghost" onClick={buyExport} title="Pay once to unlock downloads for this browser.">$6.99 — Buy export</Btn>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}
        {false && (
        <Section title="1) Describe your table" desc="Enter a base prompt and generate 3 concept images.">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <textarea rows={4} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white"
                value={basePrompt} onChange={e => setBasePrompt(e.target.value)} />
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Units</label>
              <select className="w-full rounded-lg border bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                value={units} onChange={e=>setUnits(e.target.value as any)}>
                <option value="in">inches</option><option value="mm">millimeters</option>
              </select>
              <label className="block text-xs text-gray-500 mt-3">Image size</label>
              <select className="w-full rounded-lg border bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                value={imgSize} onChange={e=>setImgSize(e.target.value as any)}>
                <option value="1024x1024">1024×1024</option>
                <option value="1024x1536">1024×1536</option>
                <option value="1536x1024">1536×1024</option>
                <option value="auto">auto</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Style</label>
              <select className="w-full rounded-lg border bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                value={style} onChange={e=>setStyle(e.target.value)}>
                <option>Product render (clean, neutral light)</option>
                <option>Photoreal (studio softbox, shallow DOF)</option>
                <option>Blueprint (white lines on blue)</option>
                <option>Pencil sketch (technical)</option>
                <option>Craft catalog (natural light, grain emphasis)</option>
              </select>
              <div className="pt-4">
                <Btn onClick={generateBase} disabled={loading!==null}>{loading==="gen" ? "Generating…" : "Generate (1)"}</Btn>
              </div>
            </div>
          </div>
        </Section>
        )}

        {false && rounds.length > 0 && (
          <Section title="2) Pick one concept" desc="Click a card to select. Use ◀ ▶ to review up to 5 kept rounds.">
            <div className="mb-3 flex items-center gap-2">
              <Btn variant="soft" onClick={() => { if (rounds.length>1) setIdx(i => (i - 1 + rounds.length) % rounds.length); }} disabled={rounds.length<=1}>◀ Prev</Btn>
              <div className="text-sm text-gray-500">Round {idx+1}/{rounds.length}{rounds[idx]?.note ? ` — ${rounds[idx]?.note}` : ""}</div>
              <Btn variant="soft" onClick={() => { if (rounds.length>1) setIdx(i => (i + 1) % rounds.length); }} disabled={rounds.length<=1}>Next ▶</Btn>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {current.images.map((src, i) => {
                const sel = current.selected === i;
                return (
                  <div key={i}
                    onClick={() => { if (!rounds.length) return; const copy = rounds.slice(); copy[idx] = { ...copy[idx], selected: i }; setRounds(copy); }}
                    className={`group relative overflow-hidden rounded-2xl border ${sel ? "border-sky-400 ring-2 ring-sky-200" : "border-gray-200 dark:border-gray-800"} bg-white dark:bg-gray-950 cursor-pointer`}>
                    <div className="relative w-full h-64">
                      <Image src={src} alt={`Option ${i+1}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw"/>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className={`px-2 py-1 rounded-md text-xs ${sel ? "bg-sky-600 text-white" : "bg-white/80 dark:bg-gray-900/80"}`}>
                        {sel ? "Selected" : "Pick"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {false && rounds.length > 0 && (
          <Section title="3) Refine" desc="Type extra instructions and get 3 refined images. Repeat; keeps last 5 rounds.">
            <div className="flex flex-col md:flex-row gap-3">
              <input className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white"
                value={refineText} onChange={e=>setRefineText(e.target.value)} placeholder="e.g., taper legs, walnut, beveled top, lowered apron…" />
              <Btn variant="ghost" onClick={refineRound} disabled={loading!==null || current.selected===null}>
                {loading==="refine" ? "Refining…" : "Refine (1)"}
              </Btn>
            </div>
          </Section>
        )}

        {false && current.selected !== null && (
          <Section title="4) Joinery previews" desc={`Accurate previews for Round ${idx+1}, image ${(current.selected ?? 0)+1}.`}>
            {loadingJoin && <div className="text-sm text-gray-500">Generating joinery views…</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {joinImgs.map((im, i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="relative w-full h-64">
                    <Image src={im.src} alt={im.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw"/>
                  </div>
                  <div className="p-3 text-sm text-gray-600 dark:text-gray-300">{im.title}</div>
                </Card>
              ))}
              {!joinImgs.length && !loadingJoin && <div className="text-sm text-gray-500">Select a concept above to see joinery previews.</div>}
            </div>
          </Section>
        )}

        {false && rounds.length > 0 && (
          <Section title="5) Finalize" desc="Generate a cut list from the selected concept, then pay to download your SVG/G-code.">
            <div className="flex items-center gap-2 flex-wrap">
              <Btn onClick={generateCutList} disabled={loading!==null || current.selected===null}>
                {loading==="cutlist" ? "Generating cut list…" : "Use selected → Cut list + SVG"}
              </Btn>
              {!entitled ? (
                <Btn variant="ghost" onClick={buyExport} title="Pay once to unlock downloads for this browser.">$6.99 — Buy export</Btn>
              ) : (
                <Btn variant="soft" onClick={() => {
                  if (!spec) return;
                  const encoded = encodeURIComponent(JSON.stringify(spec));
                  window.open(`/api/export/download?spec=${encoded}`, "_blank");
                }}>Download SVG</Btn>
              )}
              <Btn variant="soft" onClick={()=>setSvgNonce(n=>n+1)}>Refresh preview</Btn>
            </div>

            {spec && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4 overflow-auto">
                  <div className="mb-2 text-sm">
                    {entitled
                      ? <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-emerald-50 border-emerald-200 text-emerald-700">Export unlocked</span>
                      : <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-amber-50 border-amber-200 text-amber-700">Preview only</span>}
                  </div>
                  <pre className="text-xs leading-5">{JSON.stringify(spec, null, 2)}</pre>
<div className="mt-3 text-sm">
  <div className="font-medium mb-1">Joint details (mortise/tenon):</div>
  <div className="flex flex-wrap gap-3">
    <a className="underline" target="_blank" rel="noreferrer"
      href={`/api/export/joint/plate?spec=${encodeURIComponent(JSON.stringify(spec))}&host=Leg&insert=Apron%20-%20Front&w=1000`}>
      Apron – Front plate
    </a>
    <a className="underline" target="_blank" rel="noreferrer"
      href={`/api/export/joint/plate?spec=${encodeURIComponent(JSON.stringify(spec))}&host=Leg&insert=Apron%20-%20Back&w=1000`}>
      Apron – Back plate
    </a>
    <a className="underline" target="_blank" rel="noreferrer"
      href={`/api/export/joint/plate?spec=${encodeURIComponent(JSON.stringify(spec))}&host=Leg&insert=Apron%20-%20Left&w=1000`}>
      Apron – Left plate
    </a>
    <a className="underline" target="_blank" rel="noreferrer"
      href={`/api/export/joint/plate?spec=${encodeURIComponent(JSON.stringify(spec))}&host=Leg&insert=Apron%20-%20Right&w=1000`}>
      Apron – Right plate
    </a>
  </div>
</div>

                </Card>
                <Card className="overflow-hidden">
  {showSvg && svgUrl ? (
    <div>
      <iframe
        key={svgNonce}
        src={svgUrl || undefined}
        className="w-full h-[70vh] border-0"
        title="Sheet layout"
      />
      <div className="mt-2">
        {spec && (
          <a
            href={`/api/export/joint/plate?spec=${encodeURIComponent(JSON.stringify(spec))}&host=Leg&insert=Apron%20-%20Front&w=1000`}
            target="_blank"
            rel="noreferrer"
            className="underline text-sm"
            title="Open a detailed mortise plate (dimensioned) for Leg ⟷ Apron - Front"
          >
            Open mortise plate (Leg ⟷ Apron - Front)
          </a>
        )}
      </div>
    </div>
  ) : (
    <div className="p-6 text-sm text-gray-500">Click &quot;Use selected → Cut list + SVG&quot;.</div>
  )}
</Card>
              </div>
            )}
          </Section>
        )}
      </main>
    </div>
  );
}
