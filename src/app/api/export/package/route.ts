// src/app/api/export/package/route.ts
import JSZip from "jszip";
import { jobsToGcode } from "@/lib/cam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  spec: any;
  plateUrls: string[];          // absolute URLs to your plate SVGs
  jobs: any[];                  // CamJob[]
  tooling: any;                 // Tooling
  units?: "mm" | "in";
  filename?: string;            // package name (without .zip)
};

function safeName(s: string, def = "file") {
  return String(s || def).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;

    const errors: string[] = [];
    if (!body?.spec) errors.push("missing spec");
    if (!Array.isArray(body?.plateUrls) || body.plateUrls.length === 0) errors.push("missing plateUrls");
    if (!Array.isArray(body?.jobs)) errors.push("missing jobs");
    if (!body?.tooling?.endmillDiameter) errors.push("missing tooling.endmillDiameter");
    if (errors.length) return new Response("Bad request: " + errors.join(", "), { status: 400 });

    const units: "mm" | "in" = (body.units as any) || body.spec?.units || "mm";
    const zip = new JSZip();

    // 1) spec + compact “cutlist” summary
    const cutlist = {
      units,
      overall: body.spec?.assembly?.overall ?? null,
      materials: body.spec?.materials ?? [],
      joinery_jobs: body.jobs?.map(j => ({
        type: j.type, label: j.label, host: j.host?.name, edge: j.edge, axis: j.axis,
        width: j.width, depth: j.depth, offset: j.offset
      })) ?? []
    };
    zip.file("spec.json", JSON.stringify(body.spec, null, 2));
    zip.file("cutlist.json", JSON.stringify(cutlist, null, 2));

    // 2) G-code
    const gcode = jobsToGcode({ units, tooling: body.tooling, jobs: body.jobs });
    zip.folder("gcode")!.file("joinery.nc", gcode);

    // 3) Plate SVGs
    const platesFolder = zip.folder("plates")!;
    let idx = 1;
    for (const url of body.plateUrls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const svg = await res.text();
        const u = new URL(url);
        const parts = u.pathname.split("/").filter(Boolean);
        const kind = parts[parts.indexOf("joint") + 1] || "plate";
        const name = `${String(idx).padStart(2, "0")}-${safeName(kind)}.svg`;
        platesFolder.file(name, svg);
      } catch (e: any) {
        platesFolder.file(`error-${idx}.txt`, `Failed to fetch ${url}\n${String(e?.message ?? e)}`);
      }
      idx++;
    }

    // 4) README
    const readme = [
      "# Cutlist Export",
      "",
      "- spec.json: Original structured spec.",
      "- cutlist.json: Compact summary (units, overall dims, materials, joinery jobs).",
      "- plates/: SVG drawings for each joint plate.",
      "- gcode/joinery.nc: GRBL-style toolpaths for the joinery ops.",
      "",
      "Units: mm (G21). Origin: bottom-left, top surface. SafeZ ~ 5–8 mm."
    ].join("\n");
    zip.file("README.txt", readme);

    // Build zip
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const fname = safeName(body.filename || "cutlist-package") + ".zip";
    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (e: any) {
    return new Response("Package error: " + (e?.message ?? String(e)), { status: 400 });
  }
}
