// src/lib/prod-schema.ts
import { z } from "zod";

/** Enums */
export const Units = z.enum(["mm","in"]);
export const EdgeId = z.enum(["N","S","E","W"]); // host edge (origin at BL)
export const JoinType = z.enum(["MORTISE_TENON","RABBET","DADO","GROOVE"]);

/** Cut list part */
export const Part = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  material: z.string().default("Plywood"),
  thickness: z.number().positive(),
  length: z.number().positive(), // Y
  width: z.number().positive(),  // X
  qty: z.number().int().positive().default(1),
  notes: z.string().optional()
});

/** Mortise/Tenon details */
export const MortiseTenon = z.object({
  tenonThickness: z.number().positive(),
  tenonLength: z.number().positive(),
  shoulder: z.number().nonnegative().default(0),
  haunch: z.number().nonnegative().default(0)
});

/** Join (one operation) */
export const Join = z.object({
  type: JoinType,
  hostPartId: z.string().min(1),
  hostEdge: EdgeId.optional(),
  insertPartId: z.string().min(1).optional(),
  axis: z.enum(["X","Y"]).optional(),
  offset: z.number().optional(),
  length: z.number().optional(),
  width: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  fit: z.enum(["snug","standard","loose"]).optional(),
  mt: MortiseTenon.optional()
});

/** Top-level production spec (cutlist + joins) */
export const ProductionSpec = z.object({
  version: z.literal("v1").default("v1"),
  units: Units.default("mm"),
  metadata: z.object({
    type: z.string().default("project"),
    title: z.string().default("Untitled build")
  }).default({ type: "project", title: "Untitled build" }),
  overall: z.object({ W: z.number().positive(), D: z.number().positive(), H: z.number().positive() }),
  materials: z.array(z.object({ name: z.string(), thickness: z.number().positive() })).default([]),
  tolerances: z.object({
    fitSnug: z.number().default(-0.10),
    fitStandard: z.number().default(0.0),
    fitLoose: z.number().default(0.20)
  }).default({ fitSnug: -0.10, fitStandard: 0, fitLoose: 0.20 }),
  cutlist: z.array(Part).min(1),
  joins: z.array(Join).default([])
});

export type ProductionSpecT = z.infer<typeof ProductionSpec>;
export { Units as UnitsEnum, EdgeId as EdgeIdEnum, JoinType as JoinTypeEnum };
