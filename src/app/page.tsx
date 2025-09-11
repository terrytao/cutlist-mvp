"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

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
  const isDev = process.env.NODE_ENV !== "production";
  const env = process.env.NODE_ENV || "development";
  const envLabel = env.toUpperCase();
  const envBadgeClass = env === "production"
    ? "bg-red-50 border-red-200 text-red-700"
    : env === "test"
      ? "bg-indigo-50 border-indigo-200 text-indigo-700"
      : "bg-blue-50 border-blue-200 text-blue-700";
  // Flow
  const [basePrompt, setBasePrompt] = useState('Square end table, Shaker/Arts&Crafts style. 24"W x 24"D x 16"H. Mortise & tenon.');
  const [refineText, setRefineText] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [idx, setIdx] = useState(0);
  const [style, setStyle] = useState("Product render (clean, neutral light)");
  const [imgSize, setImgSize] = useState<"1024x1024"|"1024x1536"|"1536x1024"|"auto">("1024x1024");
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
  const svgUrl = useMemo(() => {
    if (!spec || !showSvg) return null;
    const encoded = encodeURIComponent(JSON.stringify(spec));
    return `/api/export/svg?spec=${encoded}&w=1200&joins=1&labelbg=1&fsmin=9&fsmax=12&t=${svgNonce}`;
  }, [spec, showSvg, svgNonce]);

  // Trial badge + entitlement
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [entitled, setEntitled] = useState(false);

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
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 backdrop-blur border-b border-gray-200/60 dark:border-gray-800/60 bg-white/70 dark:bg-black/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-black dark:bg-white" />
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
        {/* Step 1 */}
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

        {/* Step 2 */}
        {rounds.length > 0 && (
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

        {/* Step 3 */}
        {rounds.length > 0 && (
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

        {/* Step 4 */}
        {current.selected !== null && (
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

        {/* Step 5 */}
        {rounds.length > 0 && (
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
        src={svgUrl}
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
