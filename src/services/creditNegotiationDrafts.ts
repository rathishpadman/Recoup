import { z } from "zod";
import {
  buildDealOptimizerModel,
  type DealOptimizerInput,
  type DealOptimizerModel,
  type DealOptimizerRows,
  type DealOptimizerCandidateStructure
} from "./dealOptimizer.js";

export type AgentDraftedDealStructure = DealOptimizerCandidateStructure;

export interface PriceAgentDraftedDealStructuresInput extends Omit<DealOptimizerInput, "simRows"> {
  drafts: readonly AgentDraftedDealStructure[];
  simRows: Omit<DealOptimizerRows, "candidateStructures"> & {
    candidateStructures?: readonly DealOptimizerCandidateStructure[] | undefined;
  };
}

const forbiddenModelDollarKeyPattern =
  /(?:amount|dollar|price|objective|objectiveValue|revenue|cost|loss|expectedDefaultLoss|holdingCost|costOfCapital|ev)$/iu;

const draftStructureSchema = z
  .object({
    candidateId: z.string().trim().min(1),
    collateralRatio: decimalTextSchema("collateralRatio"),
    depositPct: decimalTextSchema("depositPct"),
    financingSpreadBps: decimalTextSchema("financingSpreadBps"),
    releasePct: decimalTextSchema("releasePct"),
    trancheCount: z.coerce.number().int().min(1)
  })
  .strict()
  .transform(
    (value): AgentDraftedDealStructure => ({
      candidateId: value.candidateId,
      collateralRatio: value.collateralRatio,
      depositPct: value.depositPct,
      financingSpreadBps: value.financingSpreadBps,
      releasePct: value.releasePct,
      sourceRecordIds: [`credit_negotiation.draft_structures:${value.candidateId}`],
      trancheCount: value.trancheCount
    })
  );

const draftStructuresPayloadSchema = z
  .object({
    structures: z.array(draftStructureSchema).min(1)
  })
  .strict();

export function parseCreditNegotiationDraftStructures(rawModelOutput: unknown): AgentDraftedDealStructure[] {
  assertNoModelDollarFields(rawModelOutput);
  return draftStructuresPayloadSchema.parse(rawModelOutput).structures;
}

export function priceAgentDraftedDealStructures(input: PriceAgentDraftedDealStructuresInput): DealOptimizerModel {
  return buildDealOptimizerModel({
    creditRiskRows: input.creditRiskRows,
    orderId: input.orderId,
    policyRows: input.policyRows,
    seed: input.seed,
    simRows: {
      ...input.simRows,
      candidateStructures: input.drafts
    }
  });
}

function assertNoModelDollarFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoModelDollarFields(item);
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    if (typeof value === "string" && value.includes("$")) {
      throw new Error("LLM draft structures must not include dollar, cost, price, or objective fields.");
    }
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenModelDollarKeyPattern.test(key)) {
      throw new Error("LLM draft structures must not include dollar, cost, price, or objective fields.");
    }
    assertNoModelDollarFields(nested);
  }
}

function decimalTextSchema(label: string): z.ZodString {
  return z
    .string()
    .trim()
    .min(1)
    .regex(/^\d+(\.\d+)?$/u, `${label} must be a decimal string.`);
}
