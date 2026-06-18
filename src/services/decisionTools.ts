import { z } from "zod";
import { Decimal } from "decimal.js";
import type { EvidenceDocument } from "../tools/retrieval/docs.js";
import { money } from "../types/money.js";
import { evaluateRule, ruleIds, type RuleFinding, type RuleInput, type RuleId } from "../core/rules/index.js";
import type { DeductionRouting, DeductionVerdict } from "../types/entities.js";
import { assertDecisionExplainability, type DeductionDecisionGuardInput } from "../guardrails/tool/explainability.js";
import { assertDeductionEvidencePack } from "../guardrails/tool/evidencePack.js";

export interface DeductionDecisionToolInput {
  lineId: string;
  ruleId: RuleId;
  finding: RuleFinding;
  evidenceDocuments: EvidenceDocument[];
  producedBy: "agent:forensics-investigator";
  modelId: string;
}

export type DeductionDecisionToolOutput = DeductionDecisionGuardInput;

const decisionMoneySchema = z.union([z.string().min(1), z.instanceof(Decimal)]).transform((value) => money(value));
const ruleIdSchema = z.enum(ruleIds);
const evidenceDocumentSchema = z.object({
  documentId: z.string().min(1),
  source: z.enum(["sap", "docs", "tpm"]),
  documentType: z.enum(["POD", "contract", "trade-promo", "carrier-report", "credit-memo", "invoice"]),
  summary: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1)
});

const ruleFindingSchema = z.object({
  ruleId: ruleIdSchema,
  recordIds: z.array(z.string().min(1)).min(1),
  deltaAmount: decisionMoneySchema,
  basis: z.string().min(1),
  eventId: z.string().regex(/^[a-f0-9]{64}$/)
});

export const CoreRuleInputSchema = z.object({
  ruleId: ruleIdSchema,
  lineId: z.string().min(1),
  period: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  claimedAmount: decisionMoneySchema,
  damagedGoodsAmount: decisionMoneySchema.optional(),
  salvageCreditAmount: decisionMoneySchema.optional(),
  photoEvidenceReceived: z.boolean().optional(),
  carrierReportReceived: z.boolean().optional(),
  approvedPromoAccrual: decisionMoneySchema.optional(),
  capturedPromoCredit: decisionMoneySchema.optional(),
  approvedPromoExists: z.boolean().optional(),
  invoiceBilledAtList: z.boolean().optional(),
  allowedShortageAmount: decisionMoneySchema.optional(),
  claimedShortage: z.boolean().optional(),
  podSignedFullDelivery: z.boolean().optional(),
  allowedFineAmount: decisionMoneySchema.optional(),
  contractSlaAllowsFine: z.boolean().optional(),
  slaBreachConfirmed: z.boolean().optional(),
  otifFineAssessed: z.boolean().optional(),
  podTimestampOnTime: z.boolean().optional(),
  contractedUnitPrice: decisionMoneySchema.optional(),
  deliveredQuantity: z.string().min(1).optional(),
  actualPaidAmount: decisionMoneySchema.optional(),
  deductedBelowContractPrice: z.boolean().optional(),
  contractPriceAvailable: z.boolean().optional(),
  claimedAllowance: decisionMoneySchema.optional(),
  approvedAccrual: decisionMoneySchema.optional(),
  approvedAccrualExceeded: z.boolean().optional(),
  priorCreditAmount: decisionMoneySchema.optional(),
  alreadyCredited: z.boolean().optional()
});

export const DeductionDecisionToolInputSchema = z.object({
  lineId: z.string().min(1),
  ruleId: ruleIdSchema,
  finding: ruleFindingSchema,
  evidenceDocuments: z.array(evidenceDocumentSchema),
  producedBy: z.literal("agent:forensics-investigator"),
  modelId: z.string().min(1)
});

export const DeductionDecisionGuardInputSchema = z.object({
  decisionId: z.string().min(1),
  lineId: z.string().min(1),
  verdict: z.enum(["valid", "invalid", "partial"]),
  routing: z.enum(["billing", "recovery"]),
  recordIds: z.array(z.string().min(1)).min(1),
  basis: z.string().min(1),
  deterministicBasis: z.object({
    ruleId: ruleIdSchema,
    computedDeltaAmount: decisionMoneySchema,
    amountSource: z.literal("core-rule-delta")
  }),
  evidenceDocumentIds: z.array(z.string().min(1)),
  evidenceDocuments: z.array(evidenceDocumentSchema).optional(),
  producedBy: z.string().min(1),
  modelId: z.string().min(1),
  confidence: z.literal("blocked: decision-confidence-threshold unset")
});

export function evaluateCoreRule(input: unknown): RuleFinding {
  const parsed = CoreRuleInputSchema.parse(input) as RuleInput;
  const finding = evaluateRule(parsed.ruleId, parsed);
  if (finding === undefined) {
    throw new Error(`No deterministic finding for canonical line ${parsed.lineId}.`);
  }

  return finding;
}

export function buildDeductionDecision(input: unknown): DeductionDecisionToolOutput {
  const parsed = DeductionDecisionToolInputSchema.parse(input);
  const verdict = verdictForRule(parsed.ruleId);
  const decision: DeductionDecisionToolOutput = {
    decisionId: `deduction-decision:${parsed.lineId}`,
    lineId: parsed.lineId,
    verdict,
    routing: routingForVerdict(verdict),
    recordIds: parsed.finding.recordIds,
    basis: parsed.finding.basis,
    deterministicBasis: {
      ruleId: parsed.finding.ruleId,
      computedDeltaAmount: parsed.finding.deltaAmount,
      amountSource: "core-rule-delta"
    },
    evidenceDocumentIds: parsed.evidenceDocuments.map((document) => document.documentId),
    evidenceDocuments: parsed.evidenceDocuments,
    producedBy: parsed.producedBy,
    modelId: parsed.modelId,
    confidence: "blocked: decision-confidence-threshold unset"
  };

  assertDecisionExplainability(decision);
  assertDeductionEvidencePack(decision);

  return decision;
}

function verdictForRule(ruleId: RuleId): DeductionVerdict {
  switch (ruleId) {
    case "damage-evidence-valid":
    case "promo-not-captured":
    case "otif-fine-valid":
      return "valid";
    case "promo-overclaim":
      return "partial";
    case "shortage-pod-mismatch":
    case "otif-timestamp-mismatch":
    case "pricing-below-contract":
    case "duplicate-credit":
      return "invalid";
  }
}

function routingForVerdict(verdict: DeductionVerdict): DeductionRouting {
  return verdict === "valid" ? "billing" : "recovery";
}
