import { dadoParams } from "@/lib/joinery-geom";
import type { Spec } from "@/lib/schema";

export const runtime = "nodejs";

/** Pixel-based dim line with arrow caps + high-contrast label */
function dimLinePx(x1:number,y1:number,x2:number,y2:number,label:string,fontPx:number,color="#555") {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx/len, uy = dy/len;
  const tick = Math.min(18, Math.max(10, len*0.08));
  const ax1x = x1 + ux*tick, ax1y = y1 + uy*tick;
  const ax2x = x2 - ux*tick, ax2y = y2 - uy*tick;

  // place label slightly off the line
  const off = 12;
  const lx = (x1+x2)/2 - uy*off;
  const ly = (y1+y2)/2 + ux*off;

  return `
  <g stroke="${color}" fill="none" stroke-width="${Math.max(1.25, len*0.02)}">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
    <line x1="${x1}" y1="${y1}" x2="${ax1x + (-uy)*tick/2}" y2="${ax1y + (ux)*tick/2}" />
    <line x1="${x1}" y1="${y1}" x2="${ax1x + (uy)*tick/2}"  y2="${ax1y + (-ux)*tick/2}" />
    <line x1="${x2}" y1="${y2}" x2="${ax2x + (-uy)*tick/2}" y2="${ax2y + (ux)*tick/2}" />
    <line x1="${x2}" y1="${y2}" x2="${ax2x + (uy)*tick/2}"  y2="${ax2y + (-ux)*tick/2}" />
  </g>
  <text x="${lx}" y="${ly}" font-size="${fontPx}" text-anchor="middle" dominant-baseline="middle"
        fill="#111" stroke="#fff" stroke-width="${Math.max(2.5, fontPx*0.22)}" paint-order="stroke">
    ${label}
  </text>`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    // host = Side Panel (by default), insert = Shelf/Bottom/Back (first found) unless provided
    const host   = url.searchParams.get("host")   || undefined;
    const insert = url.searchParams.get("insert") || undefined;

    // pixel knobs
    const wpx    = Math.min(1400, Math.max(480, Number(url.searchParams.get("w")    || 800)));
    const fontPx = Math.min(28,   Math.max(12,  Number(url.searchParams.get("font") || 18)));
    const showTitle = url.searchParams.get("title") !== "0";

    const spec = JSON.parse(raw) as Spec;
    const g = dadoParams(spec, host, insert);
    const units = g.units;
    const labelU = (v:number) => `${v}${units === "mm" ? " mm" : " in"}`;

    // Board cross-section layout (pixel space)
    const padPx   = 24;
    const boardW  = Math.max(600, wpx - padPx*2);      // board shown wide
    const boardH  = Math.max(120, Math.min(180, Math.round(fontPx * 6.5))); // readable height
    const titleH  = showTitle ? Math.max(36, fontPx + 12) : Math.max(10, fontPx/2);
    const footerH = Math.max(30, fontPx + 6);

    const viewW = wpx;
    const viewH = titleH + boardH + footerH;

    // Groove sizing in pixels, proportional to host thickness so depth visual makes sense
    // Scale based on host thickness (units) -> boardH * 0.7 visual area
    const unitsToPx = (boardH * 0.7) / Math.max( (g.host.thickness as number), 1 );
    const grooveDepthPx = Math.max(10, (g.dado.depth as number) * unitsToPx);
    const grooveWidthPx = Math.max(24, Math.min(boardW * 0.5, (g.dado.width as number) * unitsToPx));

    // Board rect (x,y,w,h) in px
    const bx = (viewW - boardW)/2;
    const by = titleH;
    const bh = boardH;
    const bw = boardW;

    // Groove rectangle: centered horizontally, cut from top face down by depth
    const gx = bx + (bw - grooveWidthPx)/2;
    const gy = by; // at top face
    const gw = grooveWidthPx;
    const gh = grooveDepthPx;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${viewW} ${viewH}"
     width="${viewW}" height="${viewH}"
     preserveAspectRatio="xMidYMid meet">
  <style>
    .board { fill:#fafafa; stroke:#999; stroke-width:1.5; }
    .groove{ fill:#e6f0ff; stroke:#2563eb; stroke-width:2; }
    .axis  { stroke:#e2e2e2; stroke-width:1; }
    .lbl   { font-size:${fontPx}px; fill:#111; font-weight:700; }
    .tiny  { font-size:${Math.max(13, fontPx-3)}px; fill:#333; }
  </style>

  ${showTitle ? `<text class="lbl" x="${viewW/2}" y="${Math.max(fontPx+8, titleH*0.65)}" text-anchor="middle">
    Dado — ${g.host.name} ⟷ ${g.insert.name} • ${units}
  </text>` : ""}

  <!-- Board cross-section -->
  <rect class="board" x="${bx}" y="${by}" width="${bw}" height="${bh}" />

  <!-- Groove (from top face) -->
  <rect class="groove" x="${gx}" y="${gy}" width="${gw}" height="${gh}" />

  <!-- Width dim (below groove) -->
  ${dimLinePx(gx, gy + gh + 28, gx + gw, gy + gh + 28, "Width: " + labelU(g.dado.width as number), fontPx)}

  <!-- Depth dim (left of groove) -->
  ${dimLinePx(gx - 28, gy, gx - 28, gy + gh, "Depth: " + labelU(g.dado.depth as number), fontPx)}

  <!-- Footer note -->
  <text class="tiny" x="${bx + bw}" y="${by + bh + Math.max(18, fontPx)}" text-anchor="end">
    Host thickness: ${labelU(g.host.thickness as number)}  •  Insert thickness: ${labelU(g.insert.thickness as number)}
  </text>
</svg>`;

    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  } catch (e:any) {
    const msg = (e && (e as any).message) ? (e as any).message : String(e);
    return new Response("Dado plate error: " + msg, { status: 400 });
  }
}
