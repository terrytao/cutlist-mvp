import { hasEntitlement } from "@/lib/trial";

export const runtime = "nodejs";

type PartIn = { part: string; qty: number; length: number; width: number };
type SpecIn = { units?: "in" | "mm"; cut_list: PartIn[] };

function expand(parts: PartIn[]) {
  const out: { name: string; w: number; h: number }[] = [];
  for (const p of parts) for (let i = 0; i < p.qty; i++) out.push({ name: p.part, w: +p.width, h: +p.length });
  return out;
}

// simple shelf-packer (same as SVG route’s style)
function pack(items: ReturnType<typeof expand>, sheetW: number, sheetH: number, gap: number) {
  let x = gap, y = gap, rowH = 0, sheet = 1;
  const placed: { name: string; x: number; y: number; w: number; h: number; sheet: number }[] = [];
  for (const it of items) {
    if (it.w > sheetW || it.h > sheetH) throw new Error(`Part "${it.name}" too large for sheet (${it.w}×${it.h}).`);
    if (x + it.w + gap > sheetW) { x = gap; y += rowH + gap; rowH = 0; }
    if (y + it.h + gap > sheetH) { sheet++; x = gap; y = gap; rowH = 0; }
    placed.push({ name: it.name, x, y, w: it.w, h: it.h, sheet });
    x += it.w + gap; rowH = Math.max(rowH, it.h);
  }
  return placed;
}

function fmt(n: number, units: "in"|"mm") {
  // modest precision to keep files readable
  const d = units === "mm" ? 3 : 4;
  return n.toFixed(d).replace(/0+$/,'').replace(/\.$/,'');
}

export async function GET(req: Request) {
  try {
    // require payment/entitlement
    const entitled = await hasEntitlement(req);
    if (!entitled) {
      return new Response(JSON.stringify({ error: "Payment required", code: "PAYWALL" }), { status: 402 });
    }

    // read params
    const url = new URL(req.url);
    const raw = url.searchParams.get("spec");
    if (!raw) return new Response("Missing ?spec", { status: 400 });

    const spec = JSON.parse(raw) as SpecIn;
    const units: "in"|"mm" = spec?.units === "mm" ? "mm" : "in";
    // sheet size like SVG preview (4×8 ft in, 1220×2440 mm)
    const sheetW = units === "mm" ? 1220 : 48;
    const sheetH = units === "mm" ? 2440 : 96;
    const gap    = units === "mm" ? 5 : 0.25;

    // user-tunable motion params (defaults per units)
    const feed   = Number(url.searchParams.get("feed")   ?? (units === "mm" ? 1200 : 60));   // XY feed
    const plunge = Number(url.searchParams.get("plunge") ?? (units === "mm" ? 300  : 15));   // Z feed
    const safeZ  = Number(url.searchParams.get("safe")   ?? (units === "mm" ? 6    : 0.25)); // clearance
    const cutZ   = Number(url.searchParams.get("cut")    ?? (units === "mm" ? -6   : -0.25));// depth

    const parts = expand(spec.cut_list || []);
    const placed = pack(parts, sheetW, sheetH, gap);
    const sheets = placed.length ? Math.max(...placed.map(p => p.sheet)) : 1;

    // header
    const lines: string[] = [];
    lines.push(`(Cut-List GCODE export)`);
    lines.push(`(Units: ${units}, feed:${feed}, plunge:${plunge}, safeZ:${safeZ}, cutZ:${cutZ})`);
    lines.push(units === "mm" ? "G21 (mm)" : "G20 (in)");
    lines.push("G90 (absolute)");
    lines.push("G17 (XY plane)");
    lines.push(`G0 Z${fmt(safeZ, units)} (safe height)`);

    // generate perimeter rectangle for each part, by sheet
    for (let s = 1; s <= sheets; s++) {
      lines.push(`(--- SHEET ${s} ---)`);
      for (const p of placed.filter(p => p.sheet === s)) {
        const x0 = p.x, y0 = p.y;
        const x1 = p.x + p.w, y1 = p.y + p.h;
        lines.push(`(Part: ${p.name}  ${fmt(p.w,units)} x ${fmt(p.h,units)}  @ ${fmt(x0,units)},${fmt(y0,units)})`);
        // move rapid above first corner
        lines.push(`G0 X${fmt(x0,units)} Y${fmt(y0,units)}`);
        // plunge
        lines.push(`G1 Z${fmt(cutZ, units)} F${fmt(plunge, units)}`);
        // clockwise rectangle
        lines.push(`G1 X${fmt(x1,units)} Y${fmt(y0,units)} F${fmt(feed, units)}`);
        lines.push(`G1 X${fmt(x1,units)} Y${fmt(y1,units)}`);
        lines.push(`G1 X${fmt(x0,units)} Y${fmt(y1,units)}`);
        lines.push(`G1 X${fmt(x0,units)} Y${fmt(y0,units)}`);
        // retract
        lines.push(`G0 Z${fmt(safeZ, units)}`);
      }
    }

    lines.push(`M2`);
    const gcode = lines.join("\n");

    return new Response(gcode, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": 'attachment; filename="cutlist.nc"',
        "Cache-Control": "no-store"
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "gcode export failed" }), { status: 400 });
  }
}
