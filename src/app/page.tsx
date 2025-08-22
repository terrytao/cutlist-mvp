"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type GenResp = { images: string[]; usedPrompt?: string };
type SpecResp = { source: "llm" | "mock"; spec: any; usage?: any; error?: string };
type JoinImg = { title: string; src: string };
type JoinResp = { images: JoinImg[]; error?: string };

export default function Home() {
  // Base prompt
  const [prompt, setPrompt] = useState(
    'Square end table, Shaker/Arts&Crafts style. 24"W x 24"D x 16"H. 1" solid top with small overhang; 1.75" square legs; 3.5" tall aprons; lower stretchers. Mortise & tenon.'
  );
  const [units, setUnits] = useState<"in" | "mm">("in");
  const [count, setCount] = useState(3);

  // Refine controls
  const [refine, setRefine] = useState("");
  const [negative, setNegative] = useState("");
  const [appendGallery, setAppendGallery] = useState(true);
  const [imgSize, setImgSize] = useState<"1024x1024"|"1024x1536"|"1536x1024"|"auto">("1024x1024");
  const [style, setStyle] = useState("Product render (clean, neutral light)");

  // Gallery
  const [imgs, setImgs] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());

  // Spec + SVG (manual step)
  const [spec, setSpec] = useState<any>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [showSvg, setShowSvg] = useState(false);
  const [svgNonce, setSvgNonce] = useState(0);

  // Joinery previews
  const [joinCount, setJoinCount] = useState(2);
  const [joinImgs, setJoinImgs] = useState<JoinImg[]>([]);
  const [loadingJoin, setLoadingJoin] = useState(false);

  // Busy/error
  const [loadingImgs, setLoadingImgs] = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived
  const svgUrl = useMemo(() => {
    if (!spec || !showSvg) return null;
    const encoded = encodeURIComponent(JSON.stringify(spec));
    return `/api/export/svg?spec=${encoded}&w=1200&joins=1&labelbg=1&fsmin=9&fsmax=12&t=${svgNonce}`;
  }, [spec, showSvg, svgNonce]);

  const stylePresets = [
    "Product render (clean, neutral light)",
    "Photoreal (studio softbox, shallow DOF)",
    "Blueprint (white lines on blue paper)",
    "Pencil sketch (technical, cross-hatching)",
    "Craft catalog (natural light, wood grain emphasis)"
  ];

  function toggle(i: number) {
    setSel(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function selectAll() { setSel(new Set(imgs.map((_, i) => i))); }
  function clearSel() { setSel(new Set()); }

  async function callImagesApi(body: any) {
    const res = await fetch("/api/images", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data: GenResp = await res.json();
    if (!res.ok) throw new Error((data as any)?.error || "Image generation failed");
    return data;
  }

  async function genImagesBase() {
    try {
      setError(null); setLoadingImgs(true);
      const data = await callImagesApi({ prompt, count, size: imgSize, style });
      setImgs(appendGallery ? [...data.images, ...imgs] : data.images);
      setSel(new Set()); setJoinImgs([]); setShowSvg(false);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingImgs(false); }
  }

  async function genImagesRefined() {
    try {
      setError(null); setLoadingImgs(true);
      const data = await callImagesApi({ prompt, refine, negative, count, size: imgSize, style });
      setImgs(appendGallery ? [...data.images, ...imgs] : data.images);
      setSel(new Set()); setJoinImgs([]); setShowSvg(false);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingImgs(false); }
  }

  // Per-image: "Refine like this" → analyze → prefill refine → regenerate
  async function refineLikeThis(i: number) {
    try {
      setError(null); setLoadingImgs(true);
      const imageDataUrl = imgs[i];
      const ares = await fetch("/api/analyze-image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, units })
      });
      const adat = await ares.json();
      if (!ares.ok) throw new Error(adat?.error || "Analyze failed");

      const s = adat.style || {};
      const refinedText =
        `match leg shape: ${s.leg_shape}; apron height: ${s.apron_height}; ` +
        `top edge: ${s.top_edge}; wood/species: ${s.wood}; color/tone: ${s.color_tone}; ` +
        `keywords: ${s.keywords}`;
      setRefine(refinedText);

      const data = await callImagesApi({ prompt, refine: refinedText, negative, count, size: imgSize, style });
      setImgs(appendGallery ? [...data.images, ...imgs] : data.images);
      setSel(new Set()); setJoinImgs([]); setShowSvg(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingImgs(false);
    }
  }

  // Cut list + SVG (manual when you're happy)
  async function genSpecFromSelection() {
    if (sel.size === 0) { setError("Pick one or more images first."); return; }
    try {
      setError(null); setLoadingSpec(true);
      const imageDataUrls = Array.from(sel).map(i => imgs[i]).slice(0, 8);
      const body = { prompt, units, imageDataUrls };
      const res = await fetch("/api/spec-from-image", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const data: SpecResp = await res.json();
      if (!res.ok) throw new Error(data?.error || "Spec generation failed");
      setSpec(data.spec);
      setSrc(data.source || null);
      setShowSvg(true);
      setSvgNonce(n => n + 1);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingSpec(false); }
  }

  // Auto-joinery previews on selection (FAST, skip spec for speed)
  const autoJoinReq = useRef(0);
  useEffect(() => {
    if (sel.size === 0) { setJoinImgs([]); return; }
    const reqId = ++autoJoinReq.current;
    const timer = setTimeout(async () => {
      try {
        setError(null); setLoadingJoin(true);
        const jres = await fetch("/api/joinery-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fast: true, prompt, units, count: joinCount, size: "1024x1024" })
        });
        const jdat: JoinResp = await jres.json();
        if (reqId !== autoJoinReq.current) return;
        if (!jres.ok) throw new Error(jdat?.error || "Joinery generation failed");
        setJoinImgs(jdat.images || []);
      } catch (e: any) { setError(e.message); }
      finally { if (reqId === autoJoinReq.current) setLoadingJoin(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [sel, prompt, units, joinCount]);

  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto", padding: "1rem" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Cut-List Builder — Iterate until happy</h1>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr auto auto auto auto" }}>
        <textarea rows={4} style={{ width: "100%", padding: 10 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#444" }}>Units</label>
          <select value={units} onChange={(e) => setUnits(e.target.value as any)} style={{ padding: 8 }}>
            <option value="in">inches</option><option value="mm">millimeters</option>
          </select>
          <label style={{ display: "block", marginTop: 8, fontSize: 12, color: "#444" }}>Img size</label>
          <select value={imgSize} onChange={(e)=>setImgSize(e.target.value as any)} style={{ padding: 8 }}>
            <option value="1024x1024">1024×1024</option>
            <option value="1024x1536">1024×1536</option>
            <option value="1536x1024">1536×1024</option>
            <option value="auto">auto</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#444" }}>Style</label>
          <select value={style} onChange={(e)=>setStyle(e.target.value)} style={{ padding: 8, width: 260 }}>
            {stylePresets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label style={{ display: "block", marginTop: 8, fontSize: 12, color: "#444" }}>Append to gallery</label>
          <input type="checkbox" checked={appendGallery} onChange={(e)=>setAppendGallery(e.target.checked)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#444" }}>Refine (add)</label>
          <input style={{ width: 260, padding: 8 }} value={refine} onChange={(e)=>setRefine(e.target.value)}
                 placeholder='e.g., tapered legs, walnut, beveled top' />
          <label style={{ display: "block", marginTop: 8, fontSize: 12, color: "#444" }}>Avoid</label>
          <input style={{ width: 260, padding: 8 }} value={negative} onChange={(e)=>setNegative(e.target.value)}
                 placeholder='e.g., glossy finish, metal legs' />
        </div>
        <div style={{ alignSelf: "end", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={genImagesBase} disabled={loadingImgs} style={{ padding: "8px 14px" }}>
            {loadingImgs ? "Generating..." : "Generate (base)"}
          </button>
          <button onClick={genImagesRefined} disabled={loadingImgs} style={{ padding: "8px 14px" }}>
            {loadingImgs ? "Generating..." : "Regenerate (refine)"}
          </button>
        </div>
      </div>

      {error && <div style={{ color: "crimson", marginTop: 8 }}>{error}</div>}

      {/* Concept gallery with per-image “Refine like this” */}
      {imgs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {imgs.map((srcImg, i) => {
              const checked = sel.has(i);
              return (
                <div key={i}
                  style={{
                    position: "relative", border: checked ? "3px solid #0ea5e9" : "1px solid #ddd",
                    borderRadius: 8, overflow: "hidden", background: "#fff"
                  }}>
                  <img src={srcImg} alt={`Option ${i+1}`} style={{ width: "100%", display: "block", cursor: "pointer" }}
                       onClick={() => toggle(i)} />
                  <div style={{ padding: 6, display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={checked}
                             onChange={() => toggle(i)} />
                      <span style={{ fontSize: 12 }}>Use this</span>
                    </label>
                    <button onClick={() => refineLikeThis(i)} style={{ fontSize: 12, padding: "4px 8px" }}>
                      Refine like this
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto joinery previews (fast) */}
      {loadingJoin && <div style={{ marginTop: 12, fontSize: 13, color: "#555" }}>Generating joinery views…</div>}
      {joinImgs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {joinImgs.map((im, i) => (
              <figure key={i} style={{ margin: 0, background: "#fff", border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
                <img src={im.src} alt={im.title} style={{ width: "100%", display: "block" }} />
                <figcaption style={{ padding: 8, fontSize: 12, color: "#333" }}>{im.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* Cut list + SVG (when satisfied) */}
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={genSpecFromSelection} disabled={loadingSpec || sel.size === 0} style={{ padding: "8px 14px" }}>
          {loadingSpec ? "Cut list..." : "Use selected → Cut list + SVG"}
        </button>
        <button onClick={() => setSvgNonce(n => n + 1)} style={{ padding: "8px 10px" }}>
          Refresh preview
        </button>
      </div>

      {spec && (
        <div style={{ marginTop: 16 }}>
          {src && (
            <div style={{
              display: "inline-block", padding: "4px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: src === "llm" ? "#e6ffed" : "#fffbe6",
              color: src === "llm" ? "#036635" : "#8a6d00",
              border: `1px solid ${src === "llm" ? "#7bd389" : "#ffec99"}`
            }}>
              {src === "llm" ? "Using OpenAI key ✅" : "Mock output ⚠️"}
            </div>
          )}
          <pre style={{ background: "#f6f6f6", padding: 10, marginTop: 10, overflow: "auto" }}>
            {JSON.stringify(spec, null, 2)}
          </pre>
          {showSvg && svgUrl && (
            <>
              <div style={{ marginTop: 8 }}>
                <a href={svgUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                  Open SVG in new tab
                </a>
              </div>
              <iframe
                key={svgNonce}
                src={svgUrl}
                style={{ width: "100%", height: "70vh", border: "1px solid #ddd", borderRadius: 8, marginTop: 8 }}
                title="Sheet layout"
              />
            </>
          )}
        </div>
      )}
    </main>
  );
}
