export const runtime = "edge";

type EdgeSide = "front" | "back" | "left" | "right";
type PartIn = { part: string; qty: number; length: number; width: number; thickness?: number; material?: string; grain?: string | null };
type EBand = { part: string; sides: EdgeSide[]; overhang?: number | null };
type Join = { type: string; depth: number | null; at_parts: string[] };
type SpecIn = {
  units?: "in" | "mm";
  cut_list: PartIn[];
  edge_banding?: EBand[];
  joinery?: Join[];
  project?: string;
};

function expand(parts: PartIn[]) {
  const out: { idx: number; part: string; w: number; h: number; t?: number; m?: string; grain?: string | null }[] = [];
  let k = 0;
  for (const p of parts) {
    const w = +p.width, h = +p.length;
    for (let i = 0; i < p.qty; i++) {
      out.push({ idx: k++, part: p.part, w, h, t: p.thickness, m: p.material, grain: p.grain ?? null });
    }
  }
  return out;
}

function pack(items: ReturnType<typeof expand>, sheetW: number, sheetH: number, gap: number) {
  let x = gap, y = gap, rowH = 0, sheet = 1;
  const placed: Array<{
    id: string; name: string; x: number; y: number; w: number; h: number; sheet: number; grain?: string | null; t?: number; m?: string;
  }> = [];
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  for (const it of items) {
    if (it.w > sheetW || it.h > sheetH) throw new Error(`Part "${it.part}" too large for sheet (${it.w}×${it.h}).`);
    if (x + it.w + gap > sheetW) { x = gap; y += rowH + gap; rowH = 0; }
    if (y + it.h + gap > sheetH) { sheet++; x = gap; y = gap; rowH = 0; }
    const id = `part-${slug(it.part)}-${it.idx}`;
    placed.push({ id, name: it.part, x, y, w: it.w, h: it.h, sheet, grain: it.grain ?? null, t: it.t, m: it.m });
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
  }
  return placed;
}

function fmt(n: number) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec=", { status: 400 });

    const spec = JSON.parse(raw) as SpecIn;
    const units = spec?.units === "mm" ? "mm" : "in";
    const sheetW = units === "mm" ? 1220 : 48;
    const sheetH = units === "mm" ? 2440 : 96;
    const gap    = units === "mm" ? 5 : 0.25;

    const items = expand(spec.cut_list || []);
    const placed = pack(items, sheetW, sheetH, gap);
    const sheets = placed.length ? Math.max(...placed.map(p => p.sheet)) : 1;
    const totalH = sheetH * sheets;

    const widthPx   = Math.min(Number(url.searchParams.get("w") || "1000"), 4000);
    const heightPx  = Math.round((totalH / sheetW) * widthPx);
    const pxPerUnit = widthPx / sheetW;
    const toUnits   = (px: number) => px / pxPerUnit;

    const sheetStroke = toUnits(1);
    const partStroke  = toUnits(1);
    const bandStroke  = toUnits(2);

    const fsMinPx   = Math.max(8,  Number(url.searchParams.get("fsmin")    || "10"));
    const fsMaxPx   = Math.max(fsMinPx, Number(url.searchParams.get("fsmax") || "14"));
    const marginPx  = Math.max(2,  Number(url.searchParams.get("marginpx") || "8"));
    const labelBG   = url.searchParams.get("labelbg") === "1";

    const showJoins = url.searchParams.get("joins") !== "0";
    const includeMeta = url.searchParams.get("meta") !== "0";
    const includeLayers = url.searchParams.get("layers") !== "0";

    // Edge-banding map
    const bandMap = new Map<string, Set<EdgeSide>>();
    for (const eb of (spec.edge_banding || [])) {
      const set = bandMap.get(eb.part) ?? new Set<EdgeSide>();
      for (const s of (eb.sides || [])) set.add(s);
      bandMap.set(eb.part, set);
    }

    // Joinery classification (heuristics)
    const isLeg      = (s: string) => /leg/i.test(s);
    const isSide     = (s: string) => /side/i.test(s);
    const isShelf    = (s: string) => /shelf/i.test(s);
    const isBottom   = (s: string) => /bottom/i.test(s);
    const isBack     = (s: string) => /back( panel)?/i.test(s);
    const isAprStr   = (s: string) => /(apron|stretcher)/i.test(s);

    const dadoHosts = new Set<string>();
    const dadoInserts = new Set<string>();
    const tenonEnds = new Set<string>();
    const mortiseLegs = new Set<string>();

    if (showJoins) {
      for (const j of (spec.joinery || [])) {
        const t = (j.type || "").toLowerCase();
        for (const name of (j.at_parts || [])) {
          if (/dado/.test(t)) {
            if (isSide(name)) dadoHosts.add(name);
            if (isShelf(name) || isBottom(name) || isBack(name)) dadoInserts.add(name);
          } else if (/mortise|tenon/.test(t)) {
            if (isAprStr(name)) tenonEnds.add(name);
            if (isLeg(name)) mortiseLegs.add(name);
          }
        }
      }
    }

    const svg: string[] = [];
    // include inkscape namespace for layer labels
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${sheetW} ${totalH}" width="${widthPx}" height="${heightPx}" preserveAspectRatio="xMidYMid meet">`);

    // -------- Build metadata JSON (machine-readable) ----------
    if (includeMeta) {
      const meta = {
        version: 1,
        project: spec.project || "Unnamed",
        units,
        sheet: { width: sheetW, height: sheetH, count: sheets },
        gap,
        parts: placed.map(p => ({
          id: p.id, name: p.name, sheet: p.sheet, x: p.x, y: p.y, width: p.w, height: p.h, grain: p.grain ?? null, thickness: p.t ?? null, material: p.m ?? null
        })),
        edge_banding: (spec.edge_banding || []).map(e => ({ part: e.part, sides: e.sides, overhang: e.overhang ?? null })),
        joinery: (spec.joinery || []).map(j => ({ type: j.type, depth: j.depth ?? null, at_parts: j.at_parts || [] }))
      };
      const json = JSON.stringify(meta, null, 2);
      svg.push(`<metadata id="cutlist-metadata"><![CDATA[\n${json}\n]]></metadata>`);
    }

    svg.push(`<style>
      .sheet  { fill:#fff;  stroke:#bbb; stroke-width:${sheetStroke}; }
      .part   { fill:none;  stroke:#000; stroke-width:${partStroke}; }
      .band   { stroke:#10b981; stroke-width:${bandStroke}; }
      .label  { font-family: ui-sans-serif, system-ui, Arial; }
      .join-tenon   { stroke:#2563eb; stroke-width:${toUnits(3)}; }
      .join-mortise { fill:none; stroke:#2563eb; stroke-width:${toUnits(2)}; stroke-dasharray:${toUnits(3)} ${toUnits(2)}; }
      .join-dado    { stroke:#f59e0b; stroke-width:${toUnits(3)}; stroke-dasharray:${toUnits(4)} ${toUnits(3)}; }
    </style>`);

    const bandLine = (x:number,y:number,w:number,h:number,side:EdgeSide) =>
      side === "front" ? `<line class="band" data-edge="front" x1="${x}" y1="${y}" x2="${x+w}" y2="${y}"/>` :
      side === "back"  ? `<line class="band" data-edge="back"  x1="${x}" y1="${y+h}" x2="${x+w}" y2="${y+h}"/>` :
      side === "left"  ? `<line class="band" data-edge="left"  x1="${x}" y1="${y}" x2="${x}" y2="${y+h}"/>` :
                         `<line class="band" data-edge="right" x1="${x+w}" y1="${y}" x2="${x+w}" y2="${y+h}"/>`;

    // Collect geometry for metadata-geometry block (optional consumers)
    const metaGeom: any = { tenons: [] as any[], mortises: [] as any[], dados: [] as any[] };

    for (let s = 1; s <= sheets; s++) {
      const yOff = (s - 1) * sheetH;
      svg.push(`<g id="sheet-${s}" inkscape:groupmode="layer" inkscape:label="sheet_${s}">`);
      svg.push(`<rect class="sheet" x="0" y="${0 + yOff}" width="${sheetW}" height="${sheetH}"/>`);

      // layer groups per sheet
      const layerPartsId    = `sheet-${s}-parts`;
      const layerBandsId    = `sheet-${s}-edge_banding`;
      const layerTenonId    = `sheet-${s}-join_tenon`;
      const layerMortiseId  = `sheet-${s}-join_mortise`;
      const layerDadoId     = `sheet-${s}-join_dado`;
      const layerLabelsId   = `sheet-${s}-labels`;

      if (includeLayers) {
        svg.push(`<g id="${layerPartsId}"   inkscape:groupmode="layer" inkscape:label="parts">`);
      } else {
        svg.push(`<g id="${layerPartsId}">`);
      }

      // parts outlines
      for (const p of placed.filter(p => p.sheet === s)) {
        const rx = Math.min(p.w, p.h) * 0.06;
        svg.push(`<g id="${p.id}" data-layer="parts" data-part="${p.name}" data-sheet="${s}" data-width="${p.w}" data-height="${p.h}" data-x="${p.x}" data-y="${p.y}">`);
        svg.push(`<rect class="part" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${rx}" ry="${rx}"/>`);
        svg.push(`</g>`);
      }
      svg.push(`</g>`); // end parts layer

      // edge banding layer
      svg.push(includeLayers ? `<g id="${layerBandsId}" inkscape:groupmode="layer" inkscape:label="edge_banding">` : `<g id="${layerBandsId}">`);
      for (const p of placed.filter(p => p.sheet === s)) {
        const bands = bandMap.get(p.name);
        if (bands?.size) for (const side of bands) svg.push(bandLine(p.x, p.y, p.w, p.h, side));
      }
      svg.push(`</g>`);

      // joinery layers
      svg.push(includeLayers ? `<g id="${layerTenonId}" inkscape:groupmode="layer" inkscape:label="joinery_tenon">` : `<g id="${layerTenonId}">`);
      for (const p of placed.filter(p => p.sheet === s)) {
        if (!(showJoins && (isAprStr(p.name)))) continue;
        const xL = p.x + toUnits(6), xR = p.x + p.w - toUnits(6);
        const yMid = p.y + p.h / 2;
        svg.push(`<line class="join-tenon" data-layer="joinery_tenon" data-part="${p.name}" x1="${xL}" y1="${yMid - toUnits(5)}" x2="${xL}" y2="${yMid + toUnits(5)}"/>`);
        svg.push(`<line class="join-tenon" data-layer="joinery_tenon" data-part="${p.name}" x1="${xR}" y1="${yMid - toUnits(5)}" x2="${xR}" y2="${yMid + toUnits(5)}"/>`);
        metaGeom.tenons.push({ partId: p.id, sheet: s, lines: [
          { x1: xL, y1: yMid - toUnits(5), x2: xL, y2: yMid + toUnits(5) },
          { x1: xR, y1: yMid - toUnits(5), x2: xR, y2: yMid + toUnits(5) }
        ]});
      }
      svg.push(`</g>`);

      svg.push(includeLayers ? `<g id="${layerMortiseId}" inkscape:groupmode="layer" inkscape:label="joinery_mortise">` : `<g id="${layerMortiseId}">`);
      for (const p of placed.filter(p => p.sheet === s)) {
        if (!(showJoins && isLeg(p.name))) continue;
        const cx = p.x + p.w/2, cy = p.y + p.h/2;
        const mort = toUnits(12);
        svg.push(`<rect class="join-mortise" data-layer="joinery_mortise" data-part="${p.name}" x="${cx - mort/2}" y="${cy - mort/2}" width="${mort}" height="${mort}"/>`);
        metaGeom.mortises.push({ partId: p.id, sheet: s, rect: { x: cx - mort/2, y: cy - mort/2, w: mort, h: mort }});
      }
      svg.push(`</g>`);

      svg.push(includeLayers ? `<g id="${layerDadoId}" inkscape:groupmode="layer" inkscape:label="joinery_dado">` : `<g id="${layerDadoId}">`);
      for (const p of placed.filter(p => p.sheet === s)) {
        if (!showJoins) continue;
        const yMid = p.y + p.h / 2;
        if (dadoHosts.has(p.name) || isSide(p.name)) {
          const x1 = p.x + toUnits(6), x2 = p.x + p.w - toUnits(6);
          svg.push(`<line class="join-dado" data-layer="joinery_dado" data-part="${p.name}" x1="${x1}" y1="${yMid}" x2="${x2}" y2="${yMid}"/>`);
          metaGeom.dados.push({ hostPartId: p.id, sheet: s, line: { x1, y1: yMid, x2, y2: yMid }});
        }
        if (dadoInserts.has(p.name) || isShelf(p.name) || isBottom(p.name) || isBack(p.name)) {
          const xL = p.x + toUnits(6), xR = p.x + p.w - toUnits(6);
          svg.push(`<line class="join-dado" data-layer="joinery_dado" data-part="${p.name}" x1="${xL}" y1="${yMid - toUnits(5)}" x2="${xL}" y2="${yMid + toUnits(5)}"/>`);
          svg.push(`<line class="join-dado" data-layer="joinery_dado" data-part="${p.name}" x1="${xR}" y1="${yMid - toUnits(5)}" x2="${xR}" y2="${yMid + toUnits(5)}"/>`);
          metaGeom.dados.push({ insertPartId: p.id, sheet: s, ticks: [
            { x1: xL, y1: yMid - toUnits(5), x2: xL, y2: yMid + toUnits(5) },
            { x1: xR, y1: yMid - toUnits(5), x2: xR, y2: yMid + toUnits(5) }
          ]});
        }
      }
      svg.push(`</g>`);

      // labels layer
      svg.push(includeLayers ? `<g id="${layerLabelsId}" inkscape:groupmode="layer" inkscape:label="labels">` : `<g id="${layerLabelsId}">`);
      for (const p of placed.filter(p => p.sheet === s)) {
        const name = p.name;
        const dims = `${fmt(p.w)}×${fmt(p.h)} ${units}`;
        const availWpx = p.w * pxPerUnit - 2 * marginPx;
        const availHpx = p.h * pxPerUnit - 2 * marginPx;
        if (availWpx <= 0 || availHpx <= 0) continue;
        const k = 0.58;
        const minSidePx = Math.min(p.w, p.h) * pxPerUnit;
        let fsPx = Math.max(fsMinPx, Math.min(fsMaxPx, minSidePx * 0.18));
        fsPx = Math.min(fsPx, availWpx / Math.max(1, k * Math.max(name.length, dims.length)));
        const needH = 2.1 * fsPx;
        if (availHpx < needH) {
          fsPx = Math.min(fsPx, availHpx / 2.1);
          if (fsPx < fsMinPx - 0.1) continue;
        }
        const fsUnits = toUnits(fsPx);
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        if (labelBG) {
          const padPx = 4;
          const boxW = toUnits(Math.min(availWpx, (Math.max(name.length, dims.length) * k * fsPx) + 2*padPx));
          const boxH = toUnits(2.1 * fsPx + 2*padPx);
          svg.push(`<rect data-layer="labels" x="${cx - boxW/2}" y="${cy - boxH/2}" width="${boxW}" height="${boxH}" fill="rgba(255,255,255,0.85)"/>`);
        }
        svg.push(`
          <text class="label" data-layer="labels" data-part="${p.name}" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" font-size="${fsUnits}">
            <tspan x="${cx}" dy="${-fsUnits * 0.55}">${name}</tspan>
            <tspan x="${cx}" dy="${fsUnits * 1.1}">${dims}</tspan>
          </text>
        `);
      }
      svg.push(`</g>`); // labels

      svg.push(`</g>`); // sheet group
    }

    // optional metadata geometry block (easier client parsing) as a second metadata tag
    if (includeMeta) {
      const geom = JSON.stringify({ units, geometry: metaGeom }, null, 2);
      svg.push(`<metadata id="joinery-geometry"><![CDATA[\n${geom}\n]]></metadata>`);
    }

    svg.push(`</svg>`);
    return new Response(svg.join(""), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (err: any) {
    return new Response(String(err?.message || err), { status: 400 });
  }
}
