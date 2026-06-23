import { Decimal } from "decimal.js";
import { z } from "zod";
import { ruleIds, type RuleFinding, type RuleId } from "../core/rules/index.js";
import { money } from "./money.js";

export const DecisionMoneySchema = z.union([z.string().min(1), z.instanceof(Decimal)]).transform((value) => money(value));
export const RuleIdSchema = z.enum(ruleIds);

export const DecisionEvidenceDocumentSourceSchema = z.enum(["sap", "docs", "tpm", "bureau", "remittance", "supabase"]);
export const DecisionEvidenceDocumentTypeSchema = z.enum([
  "POD",
  "contract",
  "trade-promo",
  "carrier-report",
  "credit-memo",
  "invoice",
  "bureau-signal",
  "remittance-advice",
  "edi-remittance"
]);

export const DecisionEvidenceDocumentSchema = z.object({
  documentId: z.string().min(1),
  source: DecisionEvidenceDocumentSourceSchema,
  documentType: DecisionEvidenceDocumentTypeSchema,
  summary: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1)
});

export const DecisionRuleFindingSchema = z.object({
  ruleId: RuleIdSchema,
  recordIds: z.array(z.string().min(1)).min(1),
  deltaAmount: DecisionMoneySchema,
  basis: z.string().min(1),
  eventId: z.string().regex(/^[a-f0-9]{64}$/)
});

export const CoreRuleInputSchema = z.object({
  ruleId: RuleIdSchema,
  lineId: z.string().min(1),
  period: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  claimedAmount: DecisionMoneySchema,
  damagedGoodsAmount: DecisionMoneySchema.optional(),
  salvageCreditAmount: DecisionMoneySchema.optional(),
  photoEvidenceReceived: z.boolean().optional(),
  carrierReportReceived: z.boolean().optional(),
  approvedPromoAccrual: DecisionMoneySchema.optional(),
  capturedPromoCredit: DecisionMoneySchema.optional(),
  approvedPromoExists: z.boolean().optional(),
  invoiceBilledAtList: z.boolean().optional(),
  allowedShortageAmount: DecisionMoneySchema.optional(),
  claimedShortage: z.boolean().optional(),
  podSignedFullDelivery: z.boolean().optional(),
  allowedFineAmount: DecisionMoneySchema.optional(),
  contractSlaAllowsFine: z.boolean().optional(),
  slaBreachConfirmed: z.boolean().optional(),
  otifFineAssessed: z.boolean().optional(),
  podTimestampOnTime: z.boolean().optional(),
  contractedUnitPrice: DecisionMoneySchema.optional(),
  deliveredQuantity: z.string().min(1).optional(),
  actualPaidAmount: DecisionMoneySchema.optional(),
  deductedBelowContractPrice: z.boolean().optional(),
  contractPriceAvailable: z.boolean().optional(),
  claimedAllowance: DecisionMoneySchema.optional(),
  approvedAccrual: DecisionMoneySchema.optional(),
  approvedAccrualExceeded: z.boolean().optional(),
  priorCreditAmount: DecisionMoneySchema.optional(),
  alreadyCredited: z.boolean().optional()
});

export const DeductionDecisionToolInputSchema = z.object({
  lineId: z.string().min(1),
  ruleId: RuleIdSchema,
  finding: DecisionRuleFindingSchema,
  evidenceDocuments: z.array(DecisionEvidenceDocumentSchema),
  decisionConfidenceThreshold: z
    .object({
      threshold: z.number().min(0).max(1)
    })
    .strict()
    .optional(),
  producedBy: z.literal("agent:forensics-investigator"),
  modelId: z.string().min(1)
});

export const DecisionConfidenceAssessmentSchema = z
  .object({
    deterministicBasis: z
      .object({
        evidenceCompleteness: z.string().regex(/^\d+\.\d{4}$/),
        formula: z.literal("0.40*evidenceCompleteness + 0.30*sourceAgreement + 0.30*ruleMatchStrength"),
        ruleMatchStrength: z.string().regex(/^\d+\.\d{4}$/),
        scoreSource: z.literal("deterministic-decision-confidence"),
        sourceAgreement: z.string().regex(/^\d+\.\d{4}$/),
        thresholdSource: z.literal("recoup_config.decision_confidence_threshold")
      })
      .strict(),
    route: z.enum(["standard_draft_stage", "enhanced_human_review"]),
    score: z.string().regex(/^\d+\.\d{4}$/),
    threshold: z.string().regex(/^\d+\.\d{4}$/)
  })
  .strict();
export const DecisionConfidenceSchema = z.union([
  z.literal("blocked: decision-confidence-threshold unset"),
  DecisionConfidenceAssessmentSchema
]);

export const DeductionDecisionGuardInputSchema = z.object({
  decisionId: z.string().min(1),
  lineId: z.string().min(1),
  verdict: z.enum(["valid", "invalid", "partial"]),
  routing: z.enum(["billing", "recovery"]),
  recordIds: z.array(z.string().min(1)).min(1),
  basis: z.string().min(1),
  deterministicBasis: z.object({
    ruleId: RuleIdSchema,
    computedDeltaAmount: DecisionMoneySchema,
    amountSource: z.literal("core-rule-delta")
  }),
  evidenceDocumentIds: z.array(z.string().min(1)),
  evidenceDocuments: z.array(DecisionEvidenceDocumentSchema).optional(),
  producedBy: z.string().min(1),
  modelId: z.string().min(1),
  confidence: DecisionConfidenceSchema
});

export interface DeductionDecisionToolInput {
  lineId: string;
  ruleId: RuleId;
  finding: RuleFinding;
  evidenceDocuments: DecisionEvidenceDocument[];
  producedBy: "agent:forensics-investigator";
  modelId: string;
}

export type DecisionEvidenceDocument = z.infer<typeof DecisionEvidenceDocumentSchema>;
export type DecisionConfidenceAssessment = z.infer<typeof DecisionConfidenceAssessmentSchema>;
export type DecisionConfidence = z.infer<typeof DecisionConfidenceSchema>;
export type DeductionDecisionGuardInput = z.infer<typeof DeductionDecisionGuardInputSchema>;
export type DeductionDecisionToolOutput = DeductionDecisionGuardInput;
