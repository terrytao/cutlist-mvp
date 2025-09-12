import { z } from "zod";

const EdgeSide = z.enum(["front","back","left","right"]);

export const PartSchema = z.object({
  part: z.string().min(1),
  qty: z.number().int().positive(),
  material: z.string().min(1),
  thickness: z.number().positive(),
  length: z.number().positive(),
  width: z.number().positive(),
  grain: z.enum(["length","width"]).nullable()
});

export const EdgeBandSchema = z.object({
  part: z.string().min(1),
  sides: z.array(EdgeSide).min(1),
  overhang: z.number().nullable()
});

export const JoinerySchema = z.object({
  type: z.string().min(1),
  depth: z.number().nullable(),
  at_parts: z.array(z.string().min(1)).min(1)
});

/** NEW: high-level concept the LLM returns; we use this to compute joinery deterministically */
export const ConceptSchema = z.object({
  archetype: z.enum(["leg_apron_stretcher", "panel_carcass"]).default("leg_apron_stretcher"),
  overall: z.object({ W: z.number().positive(), D: z.number().positive(), H: z.number().positive() }),
  leg_type: z.enum(["square","tapered","turned"]).nullable().default("square"),
  apron_height_class: z.enum(["short","medium","tall"]).nullable().default("medium"),
  shelf: z.boolean().nullable().default(null)
}).optional();

export const SpecSchema = z.object({
  project: z.string().min(1),
  units: z.enum(["in","mm"]).default("in"),
  tolerances: z.object({ kerf: z.number().nonnegative().default(0.125) }),
  cut_list: z.array(PartSchema).min(1),
  notes: z.string().nullable(),
  edge_banding: z.array(EdgeBandSchema).default([]),
  joinery: z.array(JoinerySchema).default([]),
  /** NEW */
  concept: ConceptSchema
});

export type Spec = z.infer<typeof SpecSchema>;
export type Part = z.infer<typeof PartSchema>;

// ---- CAM request types (lightweight) ----
export type Units = 'mm' | 'in';
export type EdgeId = 'N' | 'S' | 'E' | 'W';
export type Tooling = {
  endmillDiameter: number;
  stepdown: number;
  stepover: number; // 0..1 as fraction of diameter
  feedXY: number;
  feedZ: number;
  safeZ: number;
};
export type CamJob = {
  type: 'RABBET' | 'DADO' | 'GROOVE';
  label?: string;
  host: { name: string; length: number; width: number };
  edge?: EdgeId;        // for RABBET
  axis?: 'X' | 'Y';     // for DADO/GROOVE
  width: number;
  depth: number;
  offset?: number;
};
export type CamRequest = {
  units: Units;
  tooling: Tooling;
  jobs: CamJob[];
};
