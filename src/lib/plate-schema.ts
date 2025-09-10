import { z } from "zod";

/** Canonical units */
export const Units = z.enum(["mm", "in"]);
export type UnitsT = z.infer<typeof Units>;

/** Plate kinds your app supports */
export const PlateKind = z.enum(["RABBET", "DADO", "GROOVE", "MORTISE_TENON"]);
export type PlateKindT = z.infer<typeof PlateKind>;

/** Minimal 2D host part info (what the joint is cut into) */
export const Host2D = z.object({
  name: z.string(),
  thickness: z.number().positive(),
  length: z.number().positive().optional(), // Y, needed for offset-aware plates
  width: z.number().positive().optional(),  // X
});
export type Host2DT = z.infer<typeof Host2D>;

/** Insert (the mating part that fits into the feature) */
export const Insert = z.object({
  name: z.string(),
  thickness: z.number().positive(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
});
export type InsertT = z.infer<typeof Insert>;

/** Rabbet plate */
export const RabbetPlate = z.object({
  kind: z.literal("RABBET"),
  host: Host2D,
  insert: Insert,
  rabbet: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
});
export type RabbetPlateT = z.infer<typeof RabbetPlate>;

/** Dado plate */
export const DadoPlate = z.object({
  kind: z.literal("DADO"),
  host: Host2D,
  insert: Insert.optional(),
  dado: z.object({
    axis: z.enum(["X", "Y"]).default("X"),
    width: z.number().positive(),
    depth: z.number().positive(),
    offset: z.number().optional(), // distance from a reference edge/face
  }),
});
export type DadoPlateT = z.infer<typeof DadoPlate>;

/** Groove plate */
export const GroovePlate = z.object({
  kind: z.literal("GROOVE"),
  host: Host2D,
  insert: Insert.optional(),
  groove: z.object({
    axis: z.enum(["X", "Y"]).default("X"),
    width: z.number().positive(),
    depth: z.number().positive(),
    offset: z.number().optional(),
  }),
});
export type GroovePlateT = z.infer<typeof GroovePlate>;

/** Mortise & Tenon plate */
export const MortiseTenonPlate = z.object({
  kind: z.literal("MORTISE_TENON"),
  host: Host2D,  // mortise host (e.g., Leg)
  insert: Insert, // tenon part (e.g., Apron)
  mt: z.object({
    tenonThickness: z.number().positive(), // ≈ 1/3 apron thickness by convention
    tenonLength: z.number().positive(),    // into mortise (Z)
    shoulder: z.number().nonnegative().default(0),
    haunch: z.number().nonnegative().default(0),
    mortiseDepth: z.number().positive().optional(), // if you want to spell it out
  }),
  // Optional placement hints on host
  hostEdge: z.enum(["N", "S", "E", "W"]).optional(),
  offset: z.number().optional(),
  width: z.number().positive().optional(), // joint width along the edge (often apron height)
});
export type MortiseTenonPlateT = z.infer<typeof MortiseTenonPlate>;

/** Union of all plates */
export const PlateSpec = z.union([RabbetPlate, DadoPlate, GroovePlate, MortiseTenonPlate]);
export type PlateSpecT = z.infer<typeof PlateSpec>;

/** A pack of plates produced for a build */
export const PlatePack = z.object({
  version: z.literal("v1").default("v1"),
  units: Units.default("mm"),
  plates: z.array(PlateSpec),
});
export type PlatePackT = z.infer<typeof PlatePack>;

/* ---------- (Optional) Type guards for convenience ---------- */
export function isRabbet(p: PlateSpecT): p is RabbetPlateT { return p.kind === "RABBET"; }
export function isDado(p: PlateSpecT): p is DadoPlateT { return p.kind === "DADO"; }
export function isGroove(p: PlateSpecT): p is GroovePlateT { return p.kind === "GROOVE"; }
export function isMT(p: PlateSpecT): p is MortiseTenonPlateT { return p.kind === "MORTISE_TENON"; }
