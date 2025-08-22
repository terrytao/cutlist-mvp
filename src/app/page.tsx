"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type GenResp = { images: string[] };
type SpecResp = { source: "llm" | "mock"; spec: any; usage?: any; error?: string };
type JoinImg = { title: string; src: string };
type JoinResp = { images: JoinImg[]; error?: string };

export default function Home() {
  const [prompt, setPrompt] = useState(
    'Square end table, Shaker/Arts&Crafts style. 24"W x 24"D x 16"H. 1" solid top with small overhang; 1.75" square legs; 3.5" tall aprons; lower stretchers. Mortise & tenon.'
  );
  const [units, setUnits] = useState<"in" | "mm">("in");
  const [count, setCount] = useState(6);

  const [imgs, setImgs] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());

  const [spec, setSpec] = useState<any>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingImgs, setLoadingImgs] = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);

  // SVG visibility is now explicit; selecting images won't show SVG automatically
  const [showSvg, setShowSvg] = useState(false);

  // Joinery views
  const [joinCount, setJoinCount] = useState(3);
  const [joinImgs, setJoinImgs] = useState<JoinImg[]>([]);
  const [loadingJoin, setLoadingJoin] = useState(false);

  // Force-fresh SVG load
  const [svgNonce, setSvgNonce] = useState(0);

  const svgUrl = useMemo(() => {
    if (!spec || !showSvg) return null;
    const encoded = encodeURIComponent(JSON.stringify(spec));
    return `/api/export/svg?spec=${encoded}&w=1200&joins=1&labelbg=1&fsmin=9&fsmax=12&t=${svgNonce}`;
  }, [spec, showSvg, svgNonce]);

  function toggle(i: number) {
    setSel(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function selectAll() { setSel(new Set(imgs.map((_, i) => i))); }
  function clearSel() { setSel(new Set()); }

  async function genImages() {
    try {
      setError(null);
      setSpec(null);
      setShowSvg(false);
      setImgs([]);
      setJoinImgs([]);
      setSel(new Set());
      setLoadingImgs(true);

      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count })
      });
      const data: GenResp = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Image generation failed");
      setImgs(data.images);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingImgs(false);
    }
  }

  // Full cut-list + SVG (manual step)
  async function genSpecFromSelection() {
    if (sel.size === 0) { setError("Pick one or more images first."); return; }
    try {
      setError(null);
      setLoadingSpec(true);
      const imageDataUrls = Array.from(sel).map(i => imgs[i]).slice(0, 8);
      const body = { prompt, units, imageDataUrls };
      const res = await fetch("/api/spec-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data: SpecResp = await res.json();
      if (!res.ok) throw new Error(data?.error || "Spec generation failed");
      setSpec(data.spec);
      setSrc(data.source || null);
      setShowSvg(true);
      setSvgNonce(n => n + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSpec(false);
    }
  }

  // Auto-generate joinery views whenever selection changes (debounced)
  const autoJoinReq = useRef(0);
  useEffect(() => {
    if (sel.size === 0) {
      setJoinImgs([]);
      return;
    }
    const reqId = ++autoJoinReq.current;
    const timer = setTimeout(async () => {
      // Build spec from selected images (but don't show SVG yet)
      try {
        setError(null);
        setLoadingJoin(true);
        const imageDataUrls = Array.from(sel).map(i => imgs[i]).slice(0, 8);
        const body = { prompt, units, imageDataUrls };
        const res = await fetch("/api/spec-from-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data: SpecResp = await res.json();
        if (reqId !== autoJoinReq.current) return; // stale
        if (!res.ok) throw new Error(data?.error || "Spec generation failed");

        setSpec(data.spec);
        setSrc(data.source || null);
        setShowSvg(false); // do not show SVG yet

        // Now get joinery views for this spec
        const jres = await fetch("/api/joinery-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: data.spec, count: joinCount })
        });
        const jdat: JoinResp = await jres.json();
        if (reqId !== autoJoinReq.current) return; // stale
        if (!jres.ok) throw new Error(jdat?.error || "Joinery generation failed");

        setJoinImgs(jdat.images || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        if (reqId === autoJoinReq.current) setLoadingJoin(false);
      }
    }, 600); // debounce
    return () => clearTimeout(timer);
  }, [sel, imgs, prompt, units, joinCount]);

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "1rem" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Cut-List Builder (Prompt → Pictures → Pick → Joinery → Cut List + SVG)</h1>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr auto auto" }}>
        <textarea
          rows={4}
          style={{ width: "100%", padding: 10 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#444" }}>Units</label>
          <select value={units} onChange={(e) => setUnits(e.target.value as any)} style={{ padding: 8 }}>
            <option value="in">inches</option>
            <option value="mm">millimeters</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#444" }}># pictures</label>
          <input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            style={{ width: 90, padding: 8 }}
          />
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={genImages} disabled={loadingImgs} style={{ padding: "8px 14px" }}>
          {loadingImgs ? "Generating pictures..." : "Generate pictures"}
        </button>
        <button onClick={genSpecFromSelection} disabled={loadingSpec || sel.size === 0} style={{ padding: "8px 14px" }}>
          {loadingSpec ? "Generating cut list..." : "Use selected → Cut list + SVG"}
        </button>
        <button onClick={() => setSvgNonce(n => n + 1)} style={{ padding: "8px 10px" }}>
          Refresh preview
        </button>
        {imgs.length > 0 && (
          <>
            <button onClick={selectAll} style={{ padding: "8px 10px" }}>Select all</button>
            <button onClick={clearSel} style={{ padding: "8px 10px" }}>Clear</button>
            <span style={{ alignSelf: "center", fontSize: 12, color: "#555" }}>
              Selected: {sel.size} / {imgs.length} (max used: 8)
            </span>
          </>
        )}
      </div>

      {error && <div style={{ color: "crimson", marginTop: 8 }}>{error}</div>}

      {imgs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {imgs.map((srcImg, i) => {
              const checked = sel.has(i);
              return (
                <label key={i}
                  onClick={() => toggle(i)}
                  style={{
                    position: "relative",
                    border: checked ? "3px solid #0ea5e9" : "1px solid #ddd",
                    borderRadius: 8,
                    overflow: "hidden",
                    cursor: "pointer",
                    background: "#fff"
                  }}>
                  <img src={srcImg} alt={`Option ${i+1}`} style={{ width: "100%", display: "block" }} />
                  <div style={{ padding: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(i)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span style={{ fontSize: 12 }}>Use this</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-generated joinery views (triggered by selection) */}
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

      {/* Spec JSON (always updated by selection), SVG only when requested */}
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

          {svgUrl && (
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
