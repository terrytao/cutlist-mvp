import { mortiseTenonParams } from "@/lib/joinery-geom";
import type { Spec } from "@/lib/schema";

export const runtime = "nodejs";

/** Pixel-based dimension line with arrows and label (all coords in px). */
function dimLinePx(x1:number,y1:number,x2:number,y2:number,label:string,fontPx:number,color="#555") {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx/len, uy = dy/len;
  const tick = Math.min(14, Math.max(8, len*0.06)); // arrow size in px
  const ax1x = x1 + ux*tick, ax1y = y1 + uy*tick;
  const ax2x = x2 - ux*tick, ax2y = y2 - uy*tick;

  // Offset label a bit off the line (perpendicular)
  const off = 10;
  const lx = (x1+x2)/2 - uy*off;
  const ly = (y1+y2)/2 + ux*off;

  return `
  <g stroke="${color}" fill="none" stroke-width="${Math.max(1, len*0.015)}">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
    <line x1="${x1}" y1="${y1}" x2="${ax1x + (-uy)*tick/2}" y2="${ax1y + (ux)*tick/2}" />
    <line x1="${x1}" y1="${y1}" x2="${ax1x + (uy)*tick/2}"  y2="${ax1y + (-ux)*tick/2}" />
    <line x1="${x2}" y1="${y2}" x2="${ax2x + (-uy)*tick/2}" y2="${ax2y + (ux)*tick/2}" />
    <line x1="${x2}" y1="${y2}" x2="${ax2x + (uy)*tick/2}"  y2="${ax2y + (-ux)*tick/2}" />
    <text x="${lx}" y="${ly}" font-size="${fontPx}" fill="#333" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </g>`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const host   = url.searchParams.get("host")   || undefined;   // e.g., "Leg"
    const insert = url.searchParams.get("insert") || undefined;   // e.g., "Apron - Front"
    const wpx    = Math.min(1600, Math.max(500, Number(url.searchParams.get("w") || 800)));
    const fontPx = Math.min(24, Math.max(12, Number(url.searchParams.get("font") || 16)));
    const showTitle = url.searchParams.get("title") !== "0";

    const spec = JSON.parse(raw) as Spec;
    const g = mortiseTenonParams(spec, host, insert);
    const units = g.units;
    const label = (v:number) => `${v}${units === "mm" ? " mm" : " in"}`;

    // ==== LAYOUT IN UNITS (in/mm) ====
    const padU   = units === "mm" ? 6 : 0.25;        // padding inside face (units)
    const legT   = Math.max(g.host.section.t, 0.75); // assume at least 3/4" or 19mm for readability
    const faceU  = Math.max(legT, g.mortise.width + padU*2, g.mortise.height + padU*2);
    const marginU= faceU * 0.35;
    const titleU = showTitle ? faceU * 0.20 : faceU * 0.08;
    const footU  = faceU * 0.18;

    const viewW_U = faceU + marginU*2;
    const viewH_U = titleU + faceU + footU;

    // ==== SCALE TO PIXELS ====
    const s = wpx / viewW_U;                 // px per unit
    const hpx = Math.round(s * viewH_U);

    // Convert units -> px helper
    const ux = (u:number) => u * s;

    // Face rect (px)
    const fx = ux((viewW_U - faceU)/2);
    const fy = ux(titleU);
    const fw = ux(faceU);
    const fh = ux(faceU);

    // Mortise rect (px), centered
    const mx = fx + ux((faceU - g.mortise.width)/2);
    const my = fy + ux((faceU - g.mortise.height)/2);
    const mw = ux(g.mortise.width);
    const mh = ux(g.mortise.height);

    // Dim offsets (px)
    const offW = Math.min(ux(padU*0.9), Math.max(18, fw*0.12)); // left of mortise
    const offH = Math.min(ux(padU*0.9), Math.max(18, fh*0.12)); // below mortise

    // Axis/stroke thickness in px
    const faceStroke = Math.max(1, fw*0.012);
    const mortStroke = Math.max(1.2, fw*0.015);
    const axisStroke = Math.max(0.8, fw*0.008);

    // Title y in px
    const titleY = Math.max(fontPx + 6, ux(titleU * 0.6));

    // Build SVG (pixel viewBox so text sizes are true px)
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${wpx} ${hpx}"
     width="${wpx}" height="${hpx}"
     preserveAspectRatio="xMidYMid meet">
  <style>
    .face { fill:#fafafa; stroke:#999; }
    .mort { fill:#e6f0ff; stroke:#2563eb; }
    .axis { stroke:#e2e2e2; }
    .lbl  { font-size:${fontPx}px; fill:#111; font-weight:600; }
    .tiny { font-size:${Math.max(12, fontPx-2)}px; fill:#555; }
  </style>

  ${showTitle ? `<text class="lbl" x="${wpx/2}" y="${titleY}" text-anchor="middle">
    Mortise — ${g.host.name} ⟷ ${g.insert.name} • ${units}
  </text>` : ""}

  <!-- face -->
  <rect class="face" x="${fx}" y="${fy}" width="${fw}" height="${fh}" stroke-width="${faceStroke}" />

  <!-- center axes -->
  <line class="axis" x1="${fx + fw/2}" y1="${fy}"        x2="${fx + fw/2}" y2="${fy + fh}" stroke-width="${axisStroke}"/>
  <line class="axis" x1="${fx}"         y1="${fy + fh/2}" x2="${fx + fw}"  y2="${fy + fh/2}" stroke-width="${axisStroke}"/>

  <!-- mortise -->
  <rect class="mort" x="${mx}" y="${my}" width="${mw}" height="${mh}" stroke-width="${mortStroke}"/>

  <!-- width dim (below) -->
  ${dimLinePx(mx, my + mh + offH, mx + mw, my + mh + offH, label(g.mortise.width), fontPx)}

  <!-- height dim (left) -->
  ${dimLinePx(mx - offW, my, mx - offW, my + mh, label(g.mortise.height), fontPx)}

  <!-- depth note (bottom-right corner of face) -->
  <text class="tiny" x="${fx + fw}" y="${fy + fh + Math.max(14, fontPx)}" text-anchor="end">
    Depth: ${label(g.mortise.depth)}  •  Tenon: ${label(g.tenon.thickness)} × ${label(g.tenon.length)}
  </text>
</svg>`;

    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }
    });
  } catch (e:any) {
    return new Response(`Plate error: ${e?.message || e}`, { status: 400 });
  }
}
