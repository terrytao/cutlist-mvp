import { mortiseTenonParams } from "@/lib/joinery-geom";
import type { Spec } from "@/lib/schema";

export const runtime = "nodejs";

// simple dim line
function dimLine(x1:number,y1:number,x2:number,y2:number,label:string,units:"in"|"mm") {
  const tsize = units === "mm" ? 6 : 6; // px
  return `
  <g stroke="#555" fill="none" stroke-width="0.6">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
    <text x="${(x1+x2)/2}" y="${(y1+y2)/2 - 2}" font-size="${tsize}" fill="#333" text-anchor="middle">${label}</text>
  </g>`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const host = url.searchParams.get("host") || undefined;    // e.g., Leg
    const insert = url.searchParams.get("insert") || undefined; // e.g., Apron - Front
    const wpx = Math.min(1600, Math.max(600, Number(url.searchParams.get("w") || 1000))); // px width

    const spec = JSON.parse(raw) as Spec;
    const g = mortiseTenonParams(spec, host, insert);
    const units = g.units;

    // Plate coordinate system — square leg face centered
    const face = g.host.section.t;   // leg section thickness (units)
    const margin = face * 0.4;
    const viewW = face + margin * 2;
    const viewH = face + margin * 2;
    const sx = wpx / viewW;          // px per unit
    const hpx = Math.round(sx * viewH);

    // mortise centered on face
    const mx = (viewW - g.mortise.width)/2;
    const my = (viewH - g.mortise.height)/2;

    const label = (v:number) => `${v}${units === "mm" ? " mm" : " in"}`;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" width="${wpx}" height="${hpx}" preserveAspectRatio="xMidYMid meet">
  <style>
    .face{ fill:#fafafa; stroke:#aaa; stroke-width:0.6; }
    .mortise{ fill:#e7f0ff; stroke:#2563eb; stroke-width:0.8; }
    .axis { stroke:#ddd; stroke-width:0.4; }
    .title{ font-size:${units==="mm"?7:7}px; fill:#333; }
    .note { font-size:${units==="mm"?6:6}px; fill:#666; }
  </style>

  <!-- leg face square -->
  <rect class="face" x="${margin}" y="${margin}" width="${face}" height="${face}" />
  <!-- center axes -->
  <line class="axis" x1="${viewW/2}" y1="${margin}" x2="${viewW/2}" y2="${viewH - margin}"/>
  <line class="axis" x1="${margin}" y1="${viewH/2}" x2="${viewW - margin}" y2="${viewH/2}"/>

  <!-- mortise rectangle (centered) -->
  <rect class="mortise" x="${mx}" y="${my}" width="${g.mortise.width}" height="${g.mortise.height}" />

  <!-- dims: mortise width -->
  ${dimLine(mx, my + g.mortise.height + (margin*0.3), mx + g.mortise.width, my + g.mortise.height + (margin*0.3), label(g.mortise.width), units)}

  <!-- dims: mortise height -->
  ${dimLine(mx - (margin*0.3), my, mx - (margin*0.3), my + g.mortise.height, label(g.mortise.height), units)}

  <!-- title & notes -->
  <text class="title" x="${margin}" y="${margin - 0.25*margin}">Mortise plate — Host: ${g.host.name} · Insert: ${g.insert.name}</text>
  <text class="note" x="${margin}" y="${viewH - 0.2*margin}">
    tenon thk: ${label(g.tenon.thickness)} · tenon len: ${label(g.tenon.length)} · fit: ${g.notes.fit}
  </text>
</svg>`;

    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }
    });
  } catch (e: any) {
    return new Response(`Plate error: ${e?.message || e}`, { status: 400 });
  }
}
