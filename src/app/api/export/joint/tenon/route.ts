// simplified tenon plate (as previously shared)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Add near the top of the file
function parseSpecParam(raw: string) {
  // Trim stray quotes users might paste around the value
  const t = raw.trim().replace(/^'+|'+$/g, "").replace(/^"+|"+$/g, "");
  // Try plain JSON first
  try { return JSON.parse(t); } catch {}
  // Then try URL-decoded JSON
  try { return JSON.parse(decodeURIComponent(t)); } catch {}
  // Last resort: show the first chars to debug
  throw new Error(`Bad ?spec; starts with: ${t.slice(0, 40)}`);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const spec = parseSpecParam(raw) as any; // { units, insert, mt, width? }
    const units = spec.units ?? "mm";
    const labelU = (v:number) => `${v}${units==="mm"?" mm":" in"}`;
    const wpx = Math.min(1400, Math.max(480, Number(url.searchParams.get("w")||900)));
    const fontPx = Math.min(28, Math.max(12, Number(url.searchParams.get("font")||18)));
    const showTitle = url.searchParams.get("title") !== "0";
    const boardH = Math.max(180, Math.round(fontPx*8.5));
    const boardW = Math.max(320, Math.round(fontPx*16));
    const titleH = showTitle ? Math.max(36, fontPx+12) : Math.max(10, fontPx/2);
    const footerH= Math.max(30, fontPx+6);
    const bx = (wpx - boardW)/2, by = titleH;
    const railThk = Math.max(1, spec.insert?.thickness ?? 18);
    const railH   = Math.max(30, spec.width ?? spec.insert?.width ?? 80);
    const unitsToPxT = (boardH * 0.55) / Math.max(railThk, 1);
    const unitsToPxH = (boardW * 0.65) / Math.max(railH,   1);
    const railThkPx = Math.max(26, Math.min(boardH*0.55, railThk * unitsToPxT));
    const railHPx   = Math.max(120, Math.min(boardW*0.8,  railH   * unitsToPxH));
    const rx = bx + (boardW - railHPx)/2, ry = by + (boardH - railThkPx)/2;

    const tThk = spec.mt?.tenonThickness ?? 6;
    const tLen = spec.mt?.tenonLength ?? 18;
    const shoulder = spec.mt?.shoulder ?? 0;
    const haunch = spec.mt?.haunch ?? 0;

    const tThkPx = Math.max(10, Math.min(railThkPx*0.95, tThk * unitsToPxT));
    const tLenPx = Math.max(14, Math.min(boardW*0.45,    tLen * unitsToPxT));
    const shoulderPx = Math.max(0, Math.min(railHPx*0.2, shoulder * unitsToPxT));
    const haunchPx = haunch > 0 ? Math.max(6, Math.min(railThkPx*0.4, haunch * unitsToPxT)) : 0;

    const tY = ry + (railThkPx - tThkPx)/2;
    const shoulderX = rx + railHPx - shoulderPx;
    const tenonX = shoulderX, tenonW = tLenPx;

    const dim = (x1:number,y1:number,x2:number,y2:number,label:string) => {
      const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1, ux=dx/len, uy=dy/len, tick=Math.min(18,Math.max(10,len*0.08));
      const ax1x = x1 + ux*tick, ax1y = y1 + uy*tick, ax2x = x2 - ux*tick, ax2y = y2 - uy*tick;
      const off=12, lx=(x1+x2)/2 - uy*off, ly=(y1+y2)/2 + ux*off;
      return `
      <g stroke="#555" fill="none" stroke-width="${Math.max(1.2,len*0.02)}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
        <line x1="${x1}" y1="${y1}" x2="${ax1x-uy*tick/2}" y2="${ax1y+ux*tick/2}"/>
        <line x1="${x2}" y1="${y2}" x2="${ax2x+uy*tick/2}" y2="${ax2y-ux*tick/2}"/>
      </g>
      <text x="${lx}" y="${ly}" font-size="${fontPx}" text-anchor="middle" dominant-baseline="middle"
        fill="#111" stroke="#fff" stroke-width="${Math.max(2.5,fontPx*0.22)}" paint-order="stroke">${label}</text>`;
    };

    const titleText = `Tenon — ${spec.insert?.name ?? "Insert"} (${units})`;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wpx} ${titleH+boardH+footerH}" width="${wpx}" height="${titleH+boardH+footerH}">
  <style>
    .rail{fill:#fafafa;stroke:#999;stroke-width:1.5;}
    .tenon{fill:#ffece6;stroke:#e11d48;stroke-width:2;}
    .shoulder{stroke:#9aa3ac;stroke-dasharray:5 4;}
    .lbl{font-size:${fontPx}px;fill:#111;font-weight:700;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial;}
    .tiny{font-size:${Math.max(13,fontPx-3)}px;fill:#333;}
  </style>
  ${showTitle?`<text class="lbl" x="${wpx/2}" y="${Math.max(fontPx+8,titleH*0.65)}" text-anchor="middle">${titleText}</text>`:""}

  <rect class="rail" x="${rx}" y="${ry}" width="${railHPx}" height="${railThkPx}" />
  <line x1="${shoulderX}" y1="${ry-8}" x2="${shoulderX}" y2="${ry+railThkPx+8}" class="shoulder" />
  <rect class="tenon" x="${tenonX}" y="${tY}" width="${tenonW}" height="${tThkPx}" />
  ${haunchPx>0?`<rect class="tenon" x="${tenonX}" y="${ry}" width="${Math.min(tenonW*0.65, Math.max(16, haunchPx*1.2))}" height="${haunchPx}" />`:""}

  ${dim(tenonX, tY + tThkPx + 28, tenonX + tenonW, tY + tThkPx + 28, "Tenon length: " + labelU(tLen))}
  ${dim(tenonX - 28, tY, tenonX - 28, tY + tThkPx, "Tenon thickness: " + labelU(tThk))}
  ${shoulder>0? dim(shoulderX - shoulderPx, ry - 24, shoulderX, ry - 24, "Shoulder: " + labelU(shoulder)) : ""}

  <text class="tiny" x="${bx + boardW}" y="${by + boardH + Math.max(18, fontPx)}" text-anchor="end">
    Rail: ${labelU(railH)} × ${labelU(railThk)}  •  Haunch: ${labelU(haunch)}
  </text>
</svg>`;
    return new Response(svg, { headers: { "Content-Type":"image/svg+xml","Cache-Control":"no-store" } });
  } catch (e:any) {
    return new Response("Tenon plate error: "+(e?.message ?? String(e)), { status: 400 });
  }
}
