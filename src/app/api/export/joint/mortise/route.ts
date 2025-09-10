// src/app/api/export/joint/mortise/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Units = "mm"|"in";
type Host2D = { name:string; thickness:number; length?:number; width?:number };
type Insert = { name:string; thickness:number; length?:number; width?:number };
type MT = { tenonThickness:number; tenonLength:number; shoulder?:number; haunch?:number; mortiseDepth?:number };

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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const wpx    = Math.min(1400, Math.max(480, Number(url.searchParams.get("w")    || 900)));
    const fontPx = Math.min(28,   Math.max(12,  Number(url.searchParams.get("font") || 18)));
    const showTitle = url.searchParams.get("title") !== "0";

    const spec = JSON.parse(raw) as {
      units: Units;
      host: Host2D;
      insert: Insert;
      mt: MT;
      hostEdge?: "N"|"S"|"E"|"W";
      width?: number; // mortise width along the edge (often apron height)
    };

    const units = spec.units ?? "mm";
    const labelU = (v:number) => `${v}${units === "mm" ? " mm" : " in"}`;

    // Canvas layout
    const boardH = Math.max(160, Math.round(fontPx*8));
    const boardW = Math.max(280, Math.round(fontPx*14));
    const titleH = showTitle ? Math.max(36, fontPx+12) : Math.max(10, fontPx/2);
    const footerH= Math.max(30, fontPx+6);
    const viewW = wpx, viewH = titleH + boardH + footerH;
    const bx = (viewW - boardW)/2, by = titleH;
    const bw = boardW, bh = boardH;

    // Map mm/in -> px by host thickness scale (keeps proportions nice)
    const unitsToPx = (boardH * 0.7) / Math.max(spec.host.thickness || 18, 1);

    // Mortise params
    const mortDepth = (spec.mt.mortiseDepth ?? spec.mt.tenonLength);
    const mortWidth = spec.width ?? (spec.insert.width ?? 60); // along the edge; fall back to insert width
    const mortThkPx = Math.max(12, Math.min(boardH*0.5, mortDepth * unitsToPx)); // inset (depth)
    const mortWPx   = Math.max(18, Math.min(boardW*0.65, mortWidth * unitsToPx));

    // Position mortise on chosen edge; default N (top)
    const edge = spec.hostEdge ?? "N";
    let mx=0, my=0, mw=0, mh=0;
    if (edge === "N") { // top edge inward
      mx = bx + (bw - mortWPx)/2; my = by + 0; mw = mortWPx; mh = mortThkPx;
    } else if (edge === "S") { // bottom
      mx = bx + (bw - mortWPx)/2; my = by + bh - mortThkPx; mw = mortWPx; mh = mortThkPx;
    } else if (edge === "E") { // right
      mx = bx + bw - mortThkPx; my = by + (bh - mortWPx)/2; mw = mortThkPx; mh = mortWPx;
    } else { // "W" left
      mx = bx + 0; my = by + (bh - mortWPx)/2; mw = mortThkPx; mh = mortWPx;
    }

    // Title
    const unitsLabel = (units === "mm" ? "mm" : "in");
    const titleText = `Mortise — ${spec.host.name} for ${spec.insert.name} (${unitsLabel})`;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" width="${viewW}" height="${viewH}">
  <style>
    .board { fill:#fafafa; stroke:#999; stroke-width:1.5; }
    .cut   { fill:#ffece6; stroke:#e11d48; stroke-width:2; }
    .lbl   { font-size:${fontPx}px; fill:#111; font-weight:700;
             font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial; }
    .tiny  { font-size:${Math.max(13, fontPx-3)}px; fill:#333; }
  </style>
  ${showTitle ? `<text class="lbl" x="${viewW/2}" y="${Math.max(fontPx+8, titleH*0.65)}" text-anchor="middle">${titleText}</text>` : ""}

  <!-- Host board -->
  <rect class="board" x="${bx}" y="${by}" width="${bw}" height="${bh}" />

  <!-- Mortise pocket -->
  <rect class="cut" x="${mx}" y="${my}" width="${mw}" height="${mh}" />

  <!-- Dimensions -->
  ${edge === "N" || edge === "S"
    ? dimLinePx(mx, my + mh + 26, mx + mw, my + mh + 26, "Width: " + labelU(mortWidth), fontPx)
    : dimLinePx(mx - 26, my, mx - 26, my + mh, "Width: " + labelU(mortWidth), fontPx)
  }
  ${edge === "N" || edge === "S"
    ? dimLinePx(mx - 26, my, mx - 26, my + mh, "Depth: " + labelU(mortDepth), fontPx)
    : dimLinePx(mx, my + mh + 26, mx + mw, my + mh + 26, "Depth: " + labelU(mortDepth), fontPx)
  }

  <!-- Tenon data -->
  <text class="tiny" x="${bx + bw}" y="${by + bh + Math.max(18, fontPx)}" text-anchor="end">
    Tenon t=${labelU(spec.mt.tenonThickness)} • len=${labelU(spec.mt.tenonLength)} • shoulder=${labelU(spec.mt.shoulder ?? 0)}
  </text>
</svg>`;

    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  } catch (e:any) {
    const msg = e?.message ?? String(e);
    return new Response("Mortise plate error: " + msg, { status: 400 });
  }
}
