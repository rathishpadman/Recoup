import { z } from "zod";
import { MoneySchema } from "./money.js";

export const DeductionVerdictSchema = z.enum(["valid", "invalid", "partial"]);
export const DeductionRoutingSchema = z.enum(["billing", "recovery"]);

export const CustomerSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  profile: z.string().min(1)
});

export const DeductionLineSchema = z.object({
  lineId: z.string().min(1),
  scenarioId: z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]),
  customerId: z.string().min(1),
  scenarioType: z.string().min(1),
  amount: MoneySchema,
  verdict: DeductionVerdictSchema,
  routing: DeductionRoutingSchema,
  recordIds: z.array(z.string().min(1)).min(1),
  ruleId: z.string().min(1),
  period: z.string().min(1),
  eventId: z.string().regex(/^[a-f0-9]{64}$/)
});

export const SyntheticDatasetSchema = z.object({
  seed: z.literal(42),
  customers: z.array(CustomerSchema),
  deductionLines: z.array(DeductionLineSchema)
});

export type Customer = z.infer<typeof CustomerSchema>;
export type DeductionLine = z.infer<typeof DeductionLineSchema>;
export type DeductionVerdict = z.infer<typeof DeductionVerdictSchema>;
export type DeductionRouting = z.infer<typeof DeductionRoutingSchema>;
export type SyntheticDatasetCore = z.infer<typeof SyntheticDatasetSchema>;
