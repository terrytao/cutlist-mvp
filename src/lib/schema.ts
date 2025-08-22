import { z } from "zod";

const EdgeSide = z.enum(["front","back","left","right"]);

export const PartSchema = z.object({
  part: z.string().min(1),
  qty: z.number().int().positive(),
  material: z.string().min(1),
  thickness: z.number().positive(),
  length: z.number().positive(),
  width: z.number().positive(),
  grain: z.enum(["length","width"]).nullable()   // present but may be null
});

export const EdgeBandSchema = z.object({
  part: z.string().min(1),
  sides: z.array(EdgeSide).min(1),
  overhang: z.number().nullable()                 // present but may be null
});

export const JoinerySchema = z.object({
  type: z.string().min(1),                        // e.g., "dado", "rabbet"
  depth: z.number().nullable(),                   // present but may be null
  at_parts: z.array(z.string().min(1)).min(1)
});

export const SpecSchema = z.object({
  project: z.string().min(1),
  units: z.enum(["in","mm"]).default("in"),
  tolerances: z.object({ kerf: z.number().nonnegative().default(0.125) }),
  cut_list: z.array(PartSchema).min(1),
  notes: z.string().nullable(),
  edge_banding: z.array(EdgeBandSchema).default([]),
  joinery: z.array(JoinerySchema).default([])
});

export type Spec = z.infer<typeof SpecSchema>;
export type Part = z.infer<typeof PartSchema>;
