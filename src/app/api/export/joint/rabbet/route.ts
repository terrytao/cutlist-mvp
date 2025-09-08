import type { Spec } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dimLinePx(x1:number,y1:number,x2:number,y2:number,label:string,fontPx:number,color="#555") {
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1, ux=dx/len, uy=dy/len;
  const tick = Math.min(18, Math.max(10, len*0.08));
  const ax1x = x1 + ux*tick, ax1y = y1 + uy*tick;
  const ax2x = x2 - ux*tick, ax2y = y2 - uy*tick;
  const off=12, lx=(x1+x2)/2 - uy*off, ly=(y1+y2)/2 + ux*off;
  return `
  <g stroke="${color}" fill="none" stroke-width="${Math.max(1.2,len*0.02)}">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
    <line x1="${x1}" y1="${y1}" x2="${ax1x+(-uy)*tick/2}" y2="${ax1y+(ux)*tick/2}"/>
    <line x1="${x1}" y1="${y1}" x2="${ax1x+(uy)*tick/2}"  y2="${ax1y+(-ux)*tick/2}"/>
    <line x1="${x2}" y1="${y2}" x2="${ax2x+(-uy)*tick/2}" y2="${ax2y+(ux)*tick/2}"/>
    <line x1="${x2}" y1="${y2}" x2="${ax2x+(uy)*tick/2}"  y2="${ax2y+(-ux)*tick/2}"/>
  </g>
  <text x="${lx}" y="${ly}" font-size="${fontPx}" text-anchor="middle" dominant-baseline="middle"
        fill="#111" stroke="#fff" stroke-width="${Math.max(2.5, fontPx*0.22)}" paint-order="stroke">${label}</text>`;
}

// Local fallback in case the module import fails or lacks the export
function localRabbetParams(spec: any) {
  const units = spec?.units === "in" ? "in" : "mm";
  const host = { name: spec?.host?.name ?? "Host", thickness: Number(spec?.host?.thickness ?? 18) };
  const insert = { name: spec?.insert?.name ?? "Insert", thickness: Number(spec?.insert?.thickness ?? 6) };
  const width = Number(spec?.rabbet?.width ?? insert.thickness);
  const depth = Number(spec?.rabbet?.depth ?? Math.min(host.thickness * 0.6, insert.thickness));
  if (!(host.thickness > 0 && insert.thickness > 0 && width > 0 && depth > 0)) {
    throw new Error("Invalid spec numbers");
  }
  if (depth >= host.thickness * 0.8) throw new Error("Rabbet depth too large relative to host thickness");
  return { units, host, insert, rabbet: { width, depth } };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const wpx    = Math.min(1400, Math.max(480, Number(url.searchParams.get("w")    || 800)));
    const fontPx = Math.min(28,   Math.max(12,  Number(url.searchParams.get("font") || 18)));
    const showTitle = url.searchParams.get("title") !== "0";

    const spec = JSON.parse(raw) as Spec;

    // Dynamic import + tolerant export resolution
    let rp: any;
    try {
      const mod = await import("@/lib/joinery-geom");
      rp = (mod as any).rabbetParams ?? (mod as any).default?.rabbetParams;
      if (typeof rp !== "function") {
        console.warn("joinery-geom module keys:", Object.keys(mod), "default keys:", Object.keys((mod as any).default || {}));
        rp = undefined;
      }
    } catch (e) {
      console.warn("Dynamic import failed, using local fallback:", e);
      rp = undefined;
    }

    const g = rp ? rp(spec) : localRabbetParams(spec);
    const units = g.units as "mm" | "in";
    const labelU = (v:number) => `${v}${units === "mm" ? " mm" : " in"}`;

    // Layout
    const boardH = Math.max(140, Math.round(fontPx*7));
    const boardW = Math.max(240, Math.round(fontPx*13));
    const titleH = showTitle ? Math.max(36, fontPx+12) : Math.max(10, fontPx/2);
    const footerH= Math.max(30, fontPx+6);
    const viewW = wpx, viewH = titleH + boardH + footerH;

    const bx = (viewW - boardW)/2, by = titleH;
    const bw = boardW, bh = boardH;

    // Scale + geometry
    const unitsToPx = (boardH * 0.7) / Math.max(g.host.thickness, 1);
    const rw = Math.max(24, Math.min(boardW*0.5, g.rabbet.width * unitsToPx));
    const rd = Math.max(12, Math.min(boardH*0.5, g.rabbet.depth * unitsToPx));
    const gx = bx + bw - rw, gy = by + bh - rd;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" width="${viewW}" height="${viewH}">
  <style>
    .board { fill:#fafafa; stroke:#999; stroke-width:1.5; }
    .cut   { fill:#e6f0ff; stroke:#2563eb; stroke-width:2; }
    .lbl   { font-size:${fontPx}px; fill:#111; font-weight:700; }
    .tiny  { font-size:${Math.max(13, fontPx-3)}px; fill:#333; }
  </style>
  ${showTitle ? `<text class="lbl" x="${viewW/2}" y="${Math.max(fontPx+8, titleH*0.65)}" text-anchor="middle">
    Rabbet — ${g.host.name} for ${g.insert.name} • ${units}
  </text>` : ""}

  <rect class="board" x="${bx}" y="${by}" width="${bw}" height="${bh}" />
  <rect class="cut" x="${gx}" y="${gy}" width="${rw}" height="${rd}" />

  ${dimLinePx(gx, gy + rd + 26, gx + rw, gy + rd + 26, "Width: " + labelU(g.rabbet.width), fontPx)}
  ${dimLinePx(gx - 26, gy, gx - 26, gy + rd, "Depth: " + labelU(g.rabbet.depth), fontPx)}

  <text class="tiny" x="${bx + bw}" y="${by + bh + Math.max(18, fontPx)}" text-anchor="end">
    Host thickness: ${labelU(g.host.thickness)}  •  Insert thickness: ${labelU(g.insert.thickness)}
  </text>
</svg>`;

    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  } catch (e:any) {
    const msg = e?.message ?? String(e);
    return new Response("Rabbet plate error: " + msg, { status: 400 });
  }
}
