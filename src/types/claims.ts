import { z } from "zod";
import { MoneySchema } from "./money.js";
import { EvidenceIdSchema } from "./evidence.js";

export const GoldScenarioIdSchema = z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);

export const DeductionClaimSchema = z
  .object({
    claimAmount: MoneySchema,
    claimId: z.string().min(1),
    customerId: z.string().min(1),
    goldScenarioId: GoldScenarioIdSchema.nullable().optional(),
    invoiceRef: z.string().min(1),
    lineId: z.string().min(1),
    reasonCode: z.string().min(1),
    recordIds: z.array(z.string().min(1)).min(1),
    remittanceEvidenceId: EvidenceIdSchema
  })
  .strict();

export type GoldScenarioId = z.infer<typeof GoldScenarioIdSchema>;
export type DeductionClaim = z.infer<typeof DeductionClaimSchema>;
