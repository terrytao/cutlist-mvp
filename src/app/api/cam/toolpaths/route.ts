// src/app/api/cam/toolpaths/route.ts
import { jobsToGcode } from "@/lib/cam";
import type { CamRequest } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as CamRequest;

    if (!payload?.jobs?.length) {
      return new Response("No jobs", { status: 400 });
    }
    if (!(payload.tooling?.endmillDiameter > 0)) {
      return new Response("tooling.endmillDiameter must be > 0", { status: 400 });
    }
    for (const j of payload.jobs) {
      if (!j.host?.length || !j.host?.width) {
        return new Response("Each job.host must include length and width for CAM.", { status: 400 });
      }
    }

    const gcode = jobsToGcode(payload);
    return new Response(gcode, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (e: any) {
    return new Response("CAM error: " + (e?.message ?? String(e)), { status: 400 });
  }
}
