// simplified mortise plate (as previously shared)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const spec = JSON.parse(raw) as any; // { units, host, insert, mt, hostEdge?, width? }
    const units = spec.units ?? "mm";
    const labelU = (v:number) => `${v}${units==="mm"?" mm":" in"}`;

    const wpx = Math.min(1400, Math.max(480, Number(url.searchParams.get("w")||900)));
    const fontPx = Math.min(28, Math.max(12, Number(url.searchParams.get("font")||18)));
    const showTitle = url.searchParams.get("title") !== "0";
    const boardH = Math.max(160, Math.round(fontPx*8));
    const boardW = Math.max(280, Math.round(fontPx*14));
    const titleH = showTitle ? Math.max(36, fontPx+12) : Math.max(10, fontPx/2);
    const footerH= Math.max(30, fontPx+6);
    const bx = (wpx - boardW)/2, by = titleH, bw = boardW, bh = boardH;
    const unitsToPx = (boardH * 0.7) / Math.max(spec.host?.thickness || 18, 1);
    const mortDepth = spec.mt?.mortiseDepth ?? spec.mt?.tenonLength ?? 12;
    const mortWidth = spec.width ?? spec.insert?.width ?? 60;
    const mortThkPx = Math.max(12, Math.min(boardH*0.5, mortDepth * unitsToPx));
    const mortWPx   = Math.max(18, Math.min(boardW*0.65, mortWidth * unitsToPx));
    const edge = spec.hostEdge ?? "N";
    let mx=0,my=0,mw=0,mh=0;
    if (edge==="N"){ mx=bx+(bw-mortWPx)/2; my=by;               mw=mortWPx; mh=mortThkPx; }
    if (edge==="S"){ mx=bx+(bw-mortWPx)/2; my=by+bh-mortThkPx;  mw=mortWPx; mh=mortThkPx; }
    if (edge==="E"){ mx=bx+bw-mortThkPx;   my=by+(bh-mortWPx)/2;mw=mortThkPx;mh=mortWPx; }
    if (edge==="W"){ mx=bx;                 my=by+(bh-mortWPx)/2;mw=mortThkPx;mh=mortWPx; }
    const titleText = `Mortise — ${spec.host?.name ?? "Host"} for ${spec.insert?.name ?? "Insert"} (${units})`;

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

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wpx} ${titleH+boardH+footerH}" width="${wpx}" height="${titleH+boardH+footerH}">
  <style>
    .board{fill:#fafafa;stroke:#999;stroke-width:1.5;}
    .cut{fill:#ffece6;stroke:#e11d48;stroke-width:2;}
    .lbl{font-size:${fontPx}px;fill:#111;font-weight:700;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial;}
    .tiny{font-size:${Math.max(13,fontPx-3)}px;fill:#333;}
  </style>
  ${showTitle?`<text class="lbl" x="${wpx/2}" y="${Math.max(fontPx+8,titleH*0.65)}" text-anchor="middle">${titleText}</text>`:""}
  <rect class="board" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>
  <rect class="cut" x="${mx}" y="${my}" width="${mw}" height="${mh}"/>
  ${edge==="N"||edge==="S"
    ? dim(mx, my+mh+26, mx+mw, my+mh+26, "Width: "+labelU(mortWidth))
    : dim(mx-26, my, mx-26, my+mh, "Width: "+labelU(mortWidth))}
  ${edge==="N"||edge==="S"
    ? dim(mx-26, my, mx-26, my+mh, "Depth: "+labelU(mortDepth))
    : dim(mx, my+mh+26, mx+mw, my+mh+26, "Depth: "+labelU(mortDepth))}
  <text class="tiny" x="${bx+bw}" y="${by+bh+Math.max(18,fontPx)}" text-anchor="end">
    Tenon t=${labelU(spec.mt?.tenonThickness ?? 0)} • len=${labelU(spec.mt?.tenonLength ?? 0)}
  </text>
</svg>`;
    return new Response(svg, { headers: { "Content-Type":"image/svg+xml","Cache-Control":"no-store" } });
  } catch (e:any) {
    return new Response("Mortise plate error: "+(e?.message ?? String(e)), { status: 400 });
  }
}
