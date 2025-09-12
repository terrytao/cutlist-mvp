import { mortiseTenonParams } from "@/lib/joinery-geom";
import type { ProductionSpecT } from "@/lib/prod-schema";

export const runtime = "nodejs";

/** Pixel-based dim line with arrow caps + high-contrast label (stroke halo) */
function dimLinePx(
  x1:number,y1:number,x2:number,y2:number,
  label:string, fontPx:number, labelOffsetPx:number, color="#555"
) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx/len, uy = dy/len;
  const tick = Math.min(18, Math.max(10, len*0.08)); // arrow size
  const ax1x = x1 + ux*tick, ax1y = y1 + uy*tick;
  const ax2x = x2 - ux*tick, ax2y = y2 - uy*tick;

  // label position slightly off the line (perpendicular)
  const lx = (x1+x2)/2 - uy*labelOffsetPx;
  const ly = (y1+y2)/2 + ux*labelOffsetPx;

  return `
  <g stroke="${color}" fill="none" stroke-width="${Math.max(1.25, len*0.02)}">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
    <!-- arrow caps -->
    <line x1="${x1}" y1="${y1}" x2="${ax1x + (-uy)*tick/2}" y2="${ax1y + (ux)*tick/2}" />
    <line x1="${x1}" y1="${y1}" x2="${ax1x + (uy)*tick/2}"  y2="${ax1y + (-ux)*tick/2}" />
    <line x1="${x2}" y1="${y2}" x2="${ax2x + (-uy)*tick/2}" y2="${ax2y + (ux)*tick/2}" />
    <line x1="${x2}" y1="${y2}" x2="${ax2x + (uy)*tick/2}"  y2="${ax2y + (-ux)*tick/2}" />
  </g>
  <!-- high-contrast label: white stroke halo + dark fill -->
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

    const host   = url.searchParams.get("host")   || undefined;   // e.g., "Leg"
    const insert = url.searchParams.get("insert") || undefined;   // e.g., "Apron - Front"
    const wpx    = Math.min(1600, Math.max(500, Number(url.searchParams.get("w")    || 800)));
    const fontPx = Math.min(28,   Math.max(12,  Number(url.searchParams.get("font") || 18)));
    const offPxQ = Number(url.searchParams.get("off") || "24");   // label offset in px (both dims)
    const showTitle = url.searchParams.get("title") !== "0";

    const spec = JSON.parse(raw) as ProductionSpecT;
    const g = mortiseTenonParams(spec, host, insert);
    const units = g.units;
    const labelU = (v:number) => `${v}${units === "mm" ? " mm" : " in"}`;

    // ---- Layout in units (auto-fit) ----
    const padU   = units === "mm" ? 6 : 0.25;
    const legT   = Math.max(g.host.section.t, units === "mm" ? 19 : 0.75);
    const faceU  = Math.max(legT, g.mortise.width + padU*2, g.mortise.height + padU*2);
    const marginU= faceU * 0.35;
    const titleU = showTitle ? faceU * 0.22 : faceU * 0.08;
    const footU  = faceU * 0.18;

    const viewW_U = faceU + marginU*2;
    const viewH_U = titleU + faceU + footU;

    // ---- scale to pixels ----
    const s = wpx / viewW_U;        // px per unit
    const hpx = Math.round(s * viewH_U);
    const ux = (u:number) => u * s;

    // face rect (px)
    const fx = ux((viewW_U - faceU)/2);
    const fy = ux(titleU);
    const fw = ux(faceU);
    const fh = ux(faceU);

    // mortise rect (px)
    const mx = fx + ux((faceU - g.mortise.width)/2);
    const my = fy + ux((faceU - g.mortise.height)/2);
    const mw = ux(g.mortise.width);
    const mh = ux(g.mortise.height);

    // dim offsets (px) — push labels further for clarity
    const offW = Math.max(offPxQ, fw * 0.18);   // left of mortise
    const offH = Math.max(offPxQ, fh * 0.18);   // below mortise

    // strokes in px
    const faceStroke = Math.max(1.2, fw*0.012);
    const mortStroke = Math.max(1.6, fw*0.015);
    const axisStroke = Math.max(1.0, fw*0.010);

    const titleY = Math.max(fontPx + 8, ux(titleU * 0.60));

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${wpx} ${hpx}"
     width="${wpx}" height="${hpx}"
     preserveAspectRatio="xMidYMid meet">
  <style>
    .face { fill:#fafafa; stroke:#999; }
    .mort { fill:#e6f0ff; stroke:#2563eb; }
    .axis { stroke:#e2e2e2; }
    .lbl  { font-size:${fontPx}px; fill:#111; font-weight:700; }
    .tiny { font-size:${Math.max(13, fontPx-3)}px; fill:#333; }
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
  ${dimLinePx(mx, my + mh + offH, mx + mw, my + mh + offH, labelU(g.mortise.width), fontPx, Math.max(16, offPxQ*0.75))}

  <!-- height dim (left) -->
  ${dimLinePx(mx - offW, my, mx - offW, my + mh, labelU(g.mortise.height), fontPx, Math.max(16, offPxQ*0.75))}

  <!-- depth note -->
  <text class="tiny" x="${fx + fw}" y="${fy + fh + Math.max(18, fontPx)}" text-anchor="end">
    Depth: ${labelU(g.mortise.depth)} • Tenon: ${labelU(g.tenon.thickness)} × ${labelU(g.tenon.length)}
  </text>
</svg>`;

    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }
    });
  } catch (e:any) {
    const msg = (e && (e as any).message) ? (e as any).message : String(e);
    return new Response("Plate error: " + msg, { status: 400 });
  }
}
