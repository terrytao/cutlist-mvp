import type { RabbetSpec, DadoSpec, GrooveSpec, Units } from "./schema";

function asNum(n: unknown, name: string) {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error(`${name} must be a finite number`);
  return v;
}
function assertPos(n: number, name: string) {
  if (!(n > 0)) throw new Error(`${name} must be > 0`);
}

export function rabbetParams(spec: RabbetSpec, _hostId?: string, _insertId?: string) {
  const units: Units = (spec.units ?? "mm") as Units;
  const host = { name: spec.host?.name ?? "Host", thickness: asNum(spec.host?.thickness, "host.thickness") };
  const insert = { name: spec.insert?.name ?? "Insert", thickness: asNum(spec.insert?.thickness, "insert.thickness") };
  const width = asNum(spec.rabbet?.width, "rabbet.width");
  const depth = asNum(spec.rabbet?.depth, "rabbet.depth");

  assertPos(host.thickness, "host.thickness");
  assertPos(insert.thickness, "insert.thickness");
  assertPos(width, "rabbet.width");
  assertPos(depth, "rabbet.depth");
  if (depth >= host.thickness * 0.8) throw new Error("Rabbet depth too large relative to host thickness");

  return { units, host, insert, rabbet: { width, depth } };
}

export function dadoParams(spec: DadoSpec) {
  const units: Units = (spec.units ?? "mm") as Units;
  const host = {
    name: spec.host?.name ?? "Host",
    thickness: asNum(spec.host?.thickness, "host.thickness"),
    length: spec.host?.length ? asNum(spec.host.length, "host.length") : undefined,
    width:  spec.host?.width  ? asNum(spec.host.width,  "host.width")  : undefined,
  };
  assertPos(host.thickness, "host.thickness");

  const autoWidth = spec.insert?.thickness ? asNum(spec.insert.thickness, "insert.thickness") : undefined;
  const width = asNum(spec.dado?.width ?? (autoWidth ?? 0), "dado.width");
  const depth = asNum(spec.dado?.depth, "dado.depth");
  const offset = spec.dado?.offset != null ? asNum(spec.dado.offset, "dado.offset") : undefined;
  const axis = (spec.dado?.axis ?? "X") as "X" | "Y";

  assertPos(width, "dado.width");
  assertPos(depth, "dado.depth");
  if (depth >= host.thickness * 0.8) throw new Error("Dado depth too large relative to host thickness");

  return { units, host, insert: spec.insert, dado: { width, depth, offset, axis } };
}

export function grooveParams(spec: GrooveSpec) {
  const units: Units = (spec.units ?? "mm") as Units;
  const host = {
    name: spec.host?.name ?? "Host",
    thickness: asNum(spec.host?.thickness, "host.thickness"),
    length: spec.host?.length ? asNum(spec.host.length, "host.length") : undefined,
    width:  spec.host?.width  ? asNum(spec.host.width,  "host.width")  : undefined,
  };
  assertPos(host.thickness, "host.thickness");

  const autoWidth = spec.insert?.thickness ? asNum(spec.insert.thickness, "insert.thickness") : undefined;
  const width = asNum(spec.groove?.width ?? (autoWidth ?? 0), "groove.width");
  const depth = asNum(spec.groove?.depth, "groove.depth");
  const offset = spec.groove?.offset != null ? asNum(spec.groove.offset, "groove.offset") : undefined;
  const axis = (spec.groove?.axis ?? "X") as "X" | "Y";

  assertPos(width, "groove.width");
  assertPos(depth, "groove.depth");
  if (depth >= host.thickness * 0.8) throw new Error("Groove depth too large relative to host thickness");

  return { units, host, insert: spec.insert, groove: { width, depth, offset, axis } };
}

export default { rabbetParams, dadoParams, grooveParams };
