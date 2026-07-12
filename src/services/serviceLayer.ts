import { z } from "zod";
import type { GovernedConfigValues } from "../../config/governed.js";
import { loadLocalRuntimeEnvFiles } from "../../config/localRuntimeEnv.js";
import { runtimeModels } from "../../config/models.js";
import type { RuntimeEnv } from "../../config/env.js";
import type { DecisionConfidenceThreshold } from "../../config/releaseOwnerInputs.js";
import { draftOutreach } from "../tools/actions/draftOutreach.js";
import { draftRebill } from "../tools/actions/draftRebill.js";
import { proposeHold } from "../tools/actions/proposeHold.js";
import { proposeTerms } from "../tools/actions/proposeTerms.js";
import { routeBilling } from "../tools/actions/routeBilling.js";
import { mergeEvidenceDocuments, type EvidenceDocument } from "../tools/retrieval/docs.js";
import { buildDeterministicForensicsQueryAnswer } from "../agents/query.js";
import { assessHarborContainment } from "../agents/containment.js";
import {
  assertApprovalReasonSafe,
  decideApproval,
  type ApprovalResult,
  type ProposedExternalAction
} from "./approvals.js";
import { createAuditEntry, type AuditEntry, type AuditEntryBuildOptions } from "../audit/trail.js";
import {
  buildForensicsRuleInput,
  runForensicsInvestigation,
  type ForensicsReconciliationOptions
} from "../agents/forensics.js";
import { evaluateToolPermission, type ToolPermissionMetadata } from "./permissionEngine.js";
import { buildForensicsWorkspaceQueryResponse } from "./forensicsWorkspaceQuery.js";
import { settlementRunIdForSource } from "./settlementRunIdentity.js";
import {
  buildDeductionDecision,
  CoreRuleInputSchema,
  DeductionDecisionToolInputSchema,
  evaluateCoreRule
} from "./decisionTools.js";
import { getDecisionOrThrow } from "./decisionStore.js";
import { DeductionLineSchema } from "../types/entities.js";
import type { DeductionLine, SyntheticDatasetCore } from "../types/entities.js";
import { buildHarborRiskMeshProposalContext, runRiskMeshClosedLoop } from "../agents/riskMesh.js";
import { assessHarborSentinel } from "../agents/sentinel.js";
import {
  buildCreditNegotiationApprovalAction,
  buildCreditRiskApprovalAction,
  buildCreditRiskReviewModel,
  type CreditNegotiationOrderModel,
  type CreditNegotiationSelectedDealCandidate,
  type CreditRiskRows
} from "./creditRiskModel.js";
import {
  parseCreditNegotiationDraftStructures,
  priceAgentDraftedDealStructures
} from "./creditNegotiationDrafts.js";
import type { CreditNegotiationPolicyRow } from "./creditNegotiationPolicy.js";
import { buildDealOptimizerModel, type DealOptimizerRows } from "./dealOptimizer.js";
import {
  emailSendCapabilitiesForPrincipal,
  emailStatusSecret,
  readRecoupEmailConfig,
  readResendEmailStatus,
  sendResendEmail,
  verifyApprovedEmailSendPolicy,
  type EmailFetch
} from "./emailGateway.js";
import type { EnterpriseConnectorName } from "../adapters/enterpriseReadOnly.js";
import type { SourcePort } from "../adapters/source.js";
import type {
  SapSourceEvidence,
  SupabaseSapEvidenceReader,
  SupabaseSyntheticSourceReader,
  SyntheticSourceEvidence
} from "../adapters/supabaseSyntheticSource.js";
import type {
  SapODataMetadataInput,
  SapODataReadOnlyAdapter,
  SapODataReadRequestPlan,
  SapR1SourceNeed,
  SapR1SourceNeedName
} from "../adapters/sapOData.js";
import type { OpenAiVectorStoreEvidence, OpenAiVectorStoreEvidenceReader } from "../adapters/openAiVectorStore.js";

interface ServiceTool {
  schema: z.ZodTypeAny;
  handler: (input: unknown, context: ServiceInvocationContext) => unknown;
}

export interface ServiceInvocationContext {
  actorCapabilities?: string[];
  creditRiskRows?: CreditRiskRows;
  decisionConfidenceThreshold?: DecisionConfidenceThreshold;
  governedConfig?: GovernedConfigValues;
  creditRiskAnswerScope?: {
    accountId: string;
    recordIds: string[];
  };
  dealOptimizerRows?: {
    policyRows: readonly CreditNegotiationPolicyRow[];
    simRows: DealOptimizerRows;
  };
  queryAnswerScope?: {
    recordIds: string[];
    selectedLineId: string;
  };
  r1SapMetadata?: SapODataMetadataInput;
  r1SapReadAdapter?: SapODataReadOnlyAdapter;
  reconciliation?: ForensicsReconciliationOptions;
  requireSupabaseSapEvidence?: boolean;
  requireSupabaseSyntheticEvidence?: boolean;
  sapEvidenceSource?: ServiceSapEvidenceSource;
  source?: SourcePort;
  syntheticEvidenceSource?: ServiceSyntheticEvidenceSource;
  emailFetch?: EmailFetch;
  runtimeEnv?: RuntimeEnv;
  vectorStoreEvidenceSource?: ServiceVectorStoreEvidenceSource;
  verifiedHumanPrincipal?: string;
}

export interface ServiceSapEvidenceSource {
  readEvidence(line: DeductionLine): readonly EvidenceDocument[];
}

export type ServiceSyntheticEvidenceConnectorName = Extract<EnterpriseConnectorName, "bureau" | "docs-repo" | "tpm">;

export interface ServiceSyntheticEvidenceSource {
  readEvidence(connectorName: ServiceSyntheticEvidenceConnectorName, line: DeductionLine): readonly EvidenceDocument[];
}

export interface ServiceVectorStoreEvidenceSource {
  readEvidence(line: DeductionLine): readonly EvidenceDocument[];
}

const defaultServiceSyntheticEvidenceConnectorNames = ["docs-repo", "tpm", "bureau"] as const;
const queryAnswerSapSourceLineage = {
  primarySourceLabel: "SAP OData",
  primarySourceSystem: "sap_odata",
  sourceFreshness: "snapshot",
  transportLabel: "Governed canonical snapshot",
  transportLayer: "supabase_canonical_snapshot"
} as const;
const queryAnswerCanonicalSourceLineage = {
  sourceFreshness: "snapshot",
  transportLabel: "Governed canonical snapshot",
  transportLayer: "supabase_canonical_snapshot"
} as const;

const decisionIdToolSchema = z.object({
  decisionId: z.string().min(1),
  proposedBy: z.string().min(1).optional()
});
const riskMeshCaseSchema = z.object({
  caseId: z.string().min(1)
});
const approvalDecisionToolSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(["approve", "modify", "reject"]),
  approverId: z.string().min(1).optional(),
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().min(8).max(500).optional()
  )
}).superRefine((value, context) => {
  if (value.approverId !== undefined && !value.approverId.startsWith("human:")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Client approver identity must be human-scoped.",
      path: ["approverId"]
    });
  }

  if (value.decision !== "approve" && value.reason === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason required for modify or reject decisions.",
      path: ["reason"]
    });
  }

  if (value.reason !== undefined) {
    try {
      assertApprovalReasonSafe(value.reason);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Approval reason rejected.",
        path: ["reason"]
      });
    }
  }
});
const queryAnswerToolSchema = z
  .object({
    question: z.string().min(1).max(500),
    recordIds: z.array(z.string().min(1)).min(1),
    selectedLineId: z.string().min(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.recordIds.includes(value.selectedLineId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "query.answer requires selected evidence scope including selectedLineId in recordIds.",
        path: ["recordIds"]
      });
    }
  });
const queryWorkspaceToolSchema = z
  .object({
    question: z.string().min(1).max(500),
    settlementRunId: z.string().min(1).optional()
  })
  .strict();
const creditRiskAnswerToolSchema = z
  .object({
    accountId: z.string().min(1),
    question: z.string().min(1).max(500),
    recordIds: z.array(z.string().min(1)).min(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.recordIds.includes(value.accountId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "credit_risk.answer requires selected account scope including accountId in recordIds.",
        path: ["recordIds"]
      });
    }
  });
const creditNegotiationDraftStructureToolSchema = z
  .object({
    candidateId: z.string().min(1),
    collateralRatio: z.string().regex(/^\d+(\.\d+)?$/u),
    depositPct: z.string().regex(/^\d+(\.\d+)?$/u),
    financingSpreadBps: z.string().regex(/^\d+(\.\d+)?$/u),
    releasePct: z.string().regex(/^\d+(\.\d+)?$/u),
    trancheCount: z.number().int().min(1)
  })
  .strict();
const creditNegotiationDraftStructuresToolSchema = z
  .object({
    accountId: z.string().min(1),
    orderId: z.string().min(1),
    recordIds: z.array(z.string().min(1)).min(1),
    structures: z.array(creditNegotiationDraftStructureToolSchema).min(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.recordIds.includes(value.accountId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "credit_negotiation.draft_structures requires selected account scope including accountId in recordIds.",
        path: ["recordIds"]
      });
    }
    if (!value.recordIds.includes(value.orderId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "credit_negotiation.draft_structures requires selected order scope including orderId in recordIds.",
        path: ["recordIds"]
      });
    }
  });
const emailRecipientGroupSchema = z.enum(["billing", "recovery"]);
const emailSendApprovedToolSchema = z
  .object({
    actionId: z.string().min(1),
    body: z.string().min(1).max(20_000),
    lineId: z.string().min(1),
    recipientGroup: emailRecipientGroupSchema,
    subject: z.string().min(1).max(300)
  })
  .strict();
const emailStatusToolSchema = z
  .object({
    actionId: z.string().min(1),
    lineId: z.string().min(1),
    providerEmailId: z.string().min(1),
    recipientGroup: emailRecipientGroupSchema,
    statusToken: z.string().min(1)
  })
  .strict();
const r1BusinessPartnerSchema = z.string().regex(/^USCU_[A-Z0-9]+$/u);
const r1BillingDocumentSchema = z.string().regex(/^9000\d{4}$/u);
const r1SourceReadToolSchema = z.discriminatedUnion("need", [
  z.object({ need: z.literal("invoice"), billingDocument: r1BillingDocumentSchema }).strict(),
  z.object({ need: z.literal("sales-order"), salesOrder: z.string().regex(/^\d{4}$/u) }).strict(),
  z
    .object({ need: z.literal("credit-account-dso"), businessPartner: r1BusinessPartnerSchema, creditSegment: z.string().regex(/^\d+$/u) })
    .strict(),
  z.object({ need: z.literal("credit-exposure"), businessPartner: r1BusinessPartnerSchema }).strict(),
  z.object({ need: z.literal("dispute-case"), disputeCaseId: z.string().regex(/^FIN-DISP-\d+$/u) }).strict(),
  z.object({ need: z.literal("accrual-cap"), accrualObject: z.string().regex(/^PM_[A-Z]+_\d{2}$/u) }).strict(),
  z.object({ need: z.literal("outbound-delivery"), deliveryRef: z.string().min(1) }).strict(),
  z
    .object({ need: z.literal("credit-memo"), billingDocument: r1BillingDocumentSchema, disputeCaseId: z.string().regex(/^FIN-DISP-\d+$/u).optional() })
    .strict(),
  z.object({ need: z.literal("carrier-damage"), customerId: r1BusinessPartnerSchema, invoiceRef: r1BillingDocumentSchema.optional() }).strict(),
  z.object({ need: z.literal("payment-history"), customerId: r1BusinessPartnerSchema }).strict()
]);

export function assertR1SourceReadInput(input: unknown): void {
  r1SourceReadToolSchema.parse(input);
}
export interface PreparedApprovalDecision {
  action: ProposedExternalAction;
  approval: ApprovalResult;
}

export const serviceToolMetadata = {
  "actions.draftOutreach": { riskClass: "communication", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.draftRebill": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.proposeHold": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.proposeTerms": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.routeBilling": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "agent_tool_containment_intent_position": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "agent_tool_sentinel_position": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "approvals.decide": { riskClass: "approval_gate", sideEffectClass: "write_supabase_required", visibility: "internal" },
  "audit.read": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "core.evaluateRule": { riskClass: "compute_only", sideEffectClass: "none", visibility: "internal" },
  "core.riskMeshClosedLoop": { riskClass: "compute_only", sideEffectClass: "none", visibility: "internal" },
  "credit_negotiation.draft_structures": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "credit_risk.answer": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "decisions.deductionVerdict": { riskClass: "decision", sideEffectClass: "write_local", visibility: "internal" },
  "email.sendApproved": { riskClass: "communication", sideEffectClass: "external_correspondence", visibility: "mcp" },
  "email.status": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "query.answer": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "query.workspace": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.bureau": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.docs": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.sap": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.tpm": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "sources.r1Read": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" }
} satisfies Record<string, ToolPermissionMetadata>;

export const serviceTools = {
  "actions.draftOutreach": {
    schema: decisionIdToolSchema,
    handler: (input) => {
      const parsed = decisionIdToolSchema.parse(input);
      const actionInput =
        parsed.proposedBy === undefined
          ? { decision: getDecisionOrThrow(parsed.decisionId) }
          : { decision: getDecisionOrThrow(parsed.decisionId), proposedBy: parsed.proposedBy };
      return draftOutreach({
        ...actionInput
      });
    }
  },
  "actions.draftRebill": {
    schema: decisionIdToolSchema,
    handler: (input) => {
      const parsed = decisionIdToolSchema.parse(input);
      const actionInput =
        parsed.proposedBy === undefined
          ? { decision: getDecisionOrThrow(parsed.decisionId) }
          : { decision: getDecisionOrThrow(parsed.decisionId), proposedBy: parsed.proposedBy };
      return draftRebill({
        ...actionInput
      });
    }
  },
  "actions.proposeHold": {
    schema: riskMeshCaseSchema,
    handler: (input, context) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const governedConfig = readGovernedConfig(context);
      assertConfiguredRiskMeshCaseId(parsed.caseId, governedConfig);
      const proposalContext = buildHarborRiskMeshProposalContext({ governedConfig, source: readSourcePort(context) });
      return proposeHold(proposalContext.holdProposalInput);
    }
  },
  "actions.proposeTerms": {
    schema: riskMeshCaseSchema,
    handler: (input, context) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const governedConfig = readGovernedConfig(context);
      assertConfiguredRiskMeshCaseId(parsed.caseId, governedConfig);
      const proposalContext = buildHarborRiskMeshProposalContext({ governedConfig, source: readSourcePort(context) });
      return proposeTerms(proposalContext.termsProposalInput);
    }
  },
  "actions.routeBilling": {
    schema: decisionIdToolSchema,
    handler: (input) => {
      const parsed = decisionIdToolSchema.parse(input);
      const actionInput =
        parsed.proposedBy === undefined
          ? { decision: getDecisionOrThrow(parsed.decisionId) }
          : { decision: getDecisionOrThrow(parsed.decisionId), proposedBy: parsed.proposedBy };
      return routeBilling({
        ...actionInput
      });
    }
  },
  "agent_tool_containment_intent_position": {
    schema: riskMeshCaseSchema,
    handler: (input, context) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const governedConfig = readGovernedConfig(context);
      assertConfiguredRiskMeshCaseId(parsed.caseId, governedConfig);
      const caseConfig = governedConfig.riskMeshCases.harbor;
      return assessHarborContainment(
        {
          customerId: caseConfig.customerId,
          intentLabel: caseConfig.containmentIntentLabel
        },
        readSourcePort(context)
      );
    }
  },
  "agent_tool_sentinel_position": {
    schema: riskMeshCaseSchema,
    handler: (input, context) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const governedConfig = readGovernedConfig(context);
      assertConfiguredRiskMeshCaseId(parsed.caseId, governedConfig);
      const caseConfig = governedConfig.riskMeshCases.harbor;
      return assessHarborSentinel({
        customerId: caseConfig.customerId,
        rDriftTrigger: governedConfig.rDriftTrigger,
        rScoreWeights: governedConfig.rScoreWeights
      }, readSourcePort(context));
    }
  },
  "approvals.decide": {
    schema: approvalDecisionToolSchema,
    handler: (input, context) => {
      prepareApprovalDecision(input, context);
      throw new Error("Supabase approval persistence required for approvals.decide.");
    }
  },
  "audit.read": {
    schema: riskMeshCaseSchema,
    handler: (input, context) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const governedConfig = readGovernedConfig(context);
      assertConfiguredRiskMeshCaseId(parsed.caseId, governedConfig);
      const run = runRiskMeshClosedLoop({ governedConfig, source: readSourcePort(context) });
      return {
        caseId: parsed.caseId,
        auditEntries: run.auditEntries,
        auditTrailValid: run.auditTrailValid
      };
    }
  },
  "core.evaluateRule": {
    schema: CoreRuleInputSchema,
    handler: (input) => evaluateCoreRule(input)
  },
  "core.riskMeshClosedLoop": {
    schema: riskMeshCaseSchema,
    handler: (input, context) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const governedConfig = readGovernedConfig(context);
      assertConfiguredRiskMeshCaseId(parsed.caseId, governedConfig);
      return runRiskMeshClosedLoop({ governedConfig, source: readSourcePort(context) });
    }
  },
  "decisions.deductionVerdict": {
    schema: DeductionDecisionToolInputSchema,
    handler: (input) => buildDeductionDecision(input)
  },
  "email.sendApproved": {
    schema: emailSendApprovedToolSchema,
    handler: (input, context) => sendApprovedEmail(emailSendApprovedToolSchema.parse(input), context)
  },
  "email.status": {
    schema: emailStatusToolSchema,
    handler: (input, context) => readEmailStatus(emailStatusToolSchema.parse(input), context)
  },
  "query.answer": {
    schema: queryAnswerToolSchema,
    handler: (input, context) => answerSourceBackedSelectedEvidenceQuery(input, context)
  },
  "query.workspace": {
    schema: queryWorkspaceToolSchema,
    handler: (input, context) => answerSourceBackedWorkspaceQuery(input, context)
  },
  "credit_risk.answer": {
    schema: creditRiskAnswerToolSchema,
    handler: (input, context) => answerSourceBackedCreditRiskQuery(input, context)
  },
  "credit_negotiation.draft_structures": {
    schema: creditNegotiationDraftStructuresToolSchema,
    handler: (input, context) => priceSourceBackedCreditNegotiationDrafts(input, context)
  },
  "retrieval.docs": {
    schema: DeductionLineSchema,
    handler: (input, context) => {
      const line = DeductionLineSchema.parse(input);
      return retrieveDocsEvidence(context, line);
    }
  },
  "retrieval.bureau": {
    schema: DeductionLineSchema,
    handler: (input, context) => {
      const line = DeductionLineSchema.parse(input);
      return retrieveSyntheticEvidenceOrThrow(context, "retrieval.bureau", "bureau", line);
    }
  },
  "retrieval.sap": {
    schema: DeductionLineSchema,
    handler: (input, context) => {
      const line = DeductionLineSchema.parse(input);
      return retrieveSapEvidenceOrThrow(context, line);
    }
  },
  "retrieval.tpm": {
    schema: DeductionLineSchema,
    handler: (input, context) => {
      const line = DeductionLineSchema.parse(input);
      return retrieveSyntheticEvidenceOrThrow(context, "retrieval.tpm", "tpm", line);
    }
  },
  "sources.r1Read": {
    schema: r1SourceReadToolSchema,
    handler: (input, context) => readR1Source(r1SourceReadToolSchema.parse(input), context)
  }
} satisfies Record<string, ServiceTool>;

export type ServiceToolName = keyof typeof serviceTools;

export function invokeServiceTool(name: string, input: unknown, context: ServiceInvocationContext = {}): unknown {
  if (!isServiceToolName(name)) {
    throw new Error("Tool is not whitelisted.");
  }

  const tool = serviceTools[name];
  return tool.handler(tool.schema.parse(input), context);
}

export function prepareApprovalDecision(input: unknown, context: ServiceInvocationContext = {}): PreparedApprovalDecision {
  const parsed = approvalDecisionToolSchema.parse(input);
  const approverId = readVerifiedHumanPrincipal(context);
  const action = findPendingAction(parsed.actionId, context);
  return {
    action,
    approval: decideApproval(action, {
      approverId,
      decision: parsed.decision,
      ...(parsed.reason === undefined ? {} : { reason: parsed.reason })
    })
  };
}

export function buildPreparedApprovalAuditEntry(
  prepared: PreparedApprovalDecision,
  options: AuditEntryBuildOptions
): AuditEntry {
  return createAuditEntry(buildPreparedApprovalAuditInput(prepared), options);
}

export async function buildSupabaseServiceSyntheticEvidenceSource(input: {
  connectorNames?: readonly ServiceSyntheticEvidenceConnectorName[];
  reader: SupabaseSyntheticSourceReader;
  settlementRun: SyntheticDatasetCore;
}): Promise<ServiceSyntheticEvidenceSource> {
  const connectorNames = input.connectorNames ?? defaultServiceSyntheticEvidenceConnectorNames;
  const documentsByConnectorAndLine = new Map<string, EvidenceDocument[]>();

  if (input.reader.readEvidenceBatch !== undefined) {
    await Promise.all(
      connectorNames.map(async (connectorName) => {
        const evidenceByLineId = await input.reader.readEvidenceBatch?.(connectorName, input.settlementRun.deductionLines);
        if (evidenceByLineId === undefined) {
          throw new Error("Supabase synthetic batch reader is unavailable.");
        }
        for (const line of input.settlementRun.deductionLines) {
          const evidence = evidenceByLineId.get(line.lineId) ?? [];
          documentsByConnectorAndLine.set(
            syntheticEvidenceKey(connectorName, line.lineId),
            dedupeEvidenceDocuments(evidence.map(toEvidenceDocument))
          );
        }
      })
    );
  } else {
    for (const line of input.settlementRun.deductionLines) {
      await Promise.all(
        connectorNames.map(async (connectorName) => {
          const evidence = await input.reader.readEvidence(connectorName, line);
          documentsByConnectorAndLine.set(
            syntheticEvidenceKey(connectorName, line.lineId),
            dedupeEvidenceDocuments(evidence.map(toEvidenceDocument))
          );
        })
      );
    }
  }

  return {
    readEvidence(connectorName, line) {
      return [...(documentsByConnectorAndLine.get(syntheticEvidenceKey(connectorName, line.lineId)) ?? [])];
    }
  };
}

export async function buildSupabaseServiceSapEvidenceSource(input: {
  reader: SupabaseSapEvidenceReader;
  settlementRun: SyntheticDatasetCore;
}): Promise<ServiceSapEvidenceSource> {
  const documentsByLineId = new Map<string, EvidenceDocument[]>();

  if (input.reader.readEvidenceBatch !== undefined) {
    const evidenceByLineId = await input.reader.readEvidenceBatch(input.settlementRun.deductionLines);
    for (const line of input.settlementRun.deductionLines) {
      const evidence = evidenceByLineId.get(line.lineId) ?? [];
      documentsByLineId.set(line.lineId, dedupeEvidenceDocuments(evidence.map(toSapEvidenceDocument)));
    }
  } else {
    for (const line of input.settlementRun.deductionLines) {
      const evidence = await input.reader.readEvidence(line);
      documentsByLineId.set(line.lineId, dedupeEvidenceDocuments(evidence.map(toSapEvidenceDocument)));
    }
  }

  return {
    readEvidence(line) {
      return [...(documentsByLineId.get(line.lineId) ?? [])];
    }
  };
}

export async function buildOpenAiVectorStoreEvidenceSource(input: {
  reader: OpenAiVectorStoreEvidenceReader;
  settlementRun: SyntheticDatasetCore;
}): Promise<ServiceVectorStoreEvidenceSource> {
  const documentsByLineId = new Map<string, EvidenceDocument[]>();

  await Promise.all(
    input.settlementRun.deductionLines.map(async (line) => {
      try {
        const evidence = await input.reader.searchEvidence(line);
        documentsByLineId.set(
          line.lineId,
          dedupeEvidenceDocuments(evidence.flatMap(toVectorStoreEvidenceDocument))
        );
      } catch {
        documentsByLineId.set(line.lineId, []);
      }
    })
  );

  return {
    readEvidence(line) {
      return [...(documentsByLineId.get(line.lineId) ?? [])];
    }
  };
}

function buildPreparedApprovalAuditInput(prepared: PreparedApprovalDecision) {
  return {
    entryType: "approval.decision",
    payload: {
      actionId: prepared.approval.actionId,
      approverId: prepared.approval.approverId,
      decision: prepared.approval.decision,
      ...(prepared.approval.reason === undefined ? {} : { reason: prepared.approval.reason }),
      status: prepared.approval.status
    },
    recordIds: [prepared.approval.actionId, ...prepared.action.recordIds]
  };
}

function isServiceToolName(name: string): name is ServiceToolName {
  return Object.prototype.hasOwnProperty.call(serviceTools, name);
}

function findPendingAction(actionId: string, context: ServiceInvocationContext): ProposedExternalAction {
  if (actionId.startsWith("credit-v2:negotiation:")) {
    const match = /^credit-v2:negotiation:([^:]+):r([1-9]\d*)$/u.exec(actionId);
    if (match === null) {
      throw new Error("Action not found.");
    }

    const orderId = match[1];
    const roundValue = match[2];
    if (orderId === undefined || roundValue === undefined) {
      throw new Error("Action not found.");
    }

    const round = Number.parseInt(roundValue, 10);
    const rows = readCreditRiskRows(context);
    const model = buildCreditRiskReviewModel(rows);
    const account = model.accounts.find((entry) => entry.negotiationOrders.some((order) => order.orderId === orderId));
    const order = account?.negotiationOrders.find((entry) => entry.orderId === orderId);
    if (account !== undefined && order !== undefined) {
      if (context.dealOptimizerRows === undefined && requiresCurrentRoundCounterOffer(order, round)) {
        throw new Error(`Credit negotiation approval requires a priced counter-offer for current round ${order.currentRound.actionId}.`);
      }
      const selectedCandidate =
        context.dealOptimizerRows === undefined
          ? undefined
          : selectNegotiationApprovalCandidate(
              order,
              round,
              buildDealOptimizerModel({
                creditRiskRows: rows,
                orderId,
                policyRows: context.dealOptimizerRows.policyRows,
                seed: 42,
                simRows: scopeDealOptimizerRowsForApproval(order, round, context.dealOptimizerRows.simRows)
              }).rankedCandidates
            );
      return buildCreditNegotiationApprovalAction(account, order, round, selectedCandidate);
    }

    throw new Error("Action not found.");
  }

  if (actionId.startsWith("credit-v2:")) {
    const rows = readCreditRiskRows(context);
    const account = buildCreditRiskReviewModel(rows).accounts.find((entry) => entry.packet.actionId === actionId);
    if (account !== undefined) {
      return buildCreditRiskApprovalAction(account);
    }

    throw new Error("Action not found.");
  }

  const governedConfig = readGovernedConfig(context);
  const source = readSourcePort(context);
  const forensicsRun = runForensicsInvestigation({
    ...(context.decisionConfidenceThreshold === undefined
      ? {}
      : { decisionConfidenceThreshold: context.decisionConfidenceThreshold }),
    governedConfig,
    ...(context.reconciliation === undefined ? {} : { reconciliation: context.reconciliation }),
    serviceContext: context,
    source
  });
  const forensicsAction = forensicsRun.actions.find((action) => action.actionId === actionId);
  if (forensicsAction !== undefined) {
    return forensicsAction;
  }

  const containmentAction = forensicsRun.containmentActions.find((action) => action.actionId === actionId);
  if (containmentAction !== undefined) {
    return containmentAction;
  }

  const riskRun = runRiskMeshClosedLoop({ governedConfig, source });
  const riskAction = [riskRun.holdAction, riskRun.termsAction].find((action) => action.actionId === actionId);
  if (riskAction !== undefined) {
    return riskAction;
  }

  throw new Error("Action not found.");
}

function selectNegotiationApprovalCandidate(
  order: CreditNegotiationOrderModel,
  round: number,
  rankedCandidates: readonly CreditNegotiationSelectedDealCandidate[]
): CreditNegotiationSelectedDealCandidate | undefined {
  if (requiresCurrentRoundCounterOffer(order, round)) {
    const counterCandidate = rankedCandidates.find((candidate) => candidate.candidateId.startsWith("counter-offer:"));
    if (counterCandidate === undefined) {
      throw new Error(`Credit negotiation approval requires a priced counter-offer for current round ${order.currentRound.actionId}.`);
    }
    return counterCandidate;
  }

  return rankedCandidates[0];
}

function scopeDealOptimizerRowsForApproval(
  order: CreditNegotiationOrderModel,
  round: number,
  simRows: DealOptimizerRows
): DealOptimizerRows {
  if (!requiresCurrentRoundCounterOffer(order, round)) {
    return simRows;
  }

  return {
    ...simRows,
    counterOffers: (simRows.counterOffers ?? []).filter(
      (counterOffer) => counterOffer.orderId === order.orderId && counterOffer.roundId === order.currentRound.actionId
    )
  };
}

function requiresCurrentRoundCounterOffer(order: CreditNegotiationOrderModel, round: number): order is CreditNegotiationOrderModel & {
  currentRound: NonNullable<CreditNegotiationOrderModel["currentRound"]>;
} {
  return order.currentRound?.status === "countered" && round === order.nextRound;
}

function answerSourceBackedSelectedEvidenceQuery(input: unknown, context: ServiceInvocationContext): unknown {
  const parsed = queryAnswerToolSchema.parse(input);
  assertQueryAnswerWithinSelectedScope(parsed, context.queryAnswerScope);
  readGovernedConfig(context);
  const source = readSourcePort(context);
  const settlementRun = source.loadSettlementRun();
  const selectedLine = settlementRun.deductionLines.find((line) => line.lineId === parsed.selectedLineId);
  if (selectedLine === undefined) {
    throw new Error("query.answer selectedLineId was not found in the canonical source snapshot.");
  }
  const selectedWorkItemGroupId = queryAnswerWorkItemGroupIdFromLineId(selectedLine.lineId);
  const selectedScenarioLines = settlementRun.deductionLines.filter(
    (candidateLine) => queryAnswerWorkItemGroupIdFromLineId(candidateLine.lineId) === selectedWorkItemGroupId
  );

  const selectedEvidence = retrieveQueryAnswerSelectedEvidence(context, selectedLine, parsed.recordIds);
  const selectedSourceEvidence = dedupeEvidenceDocuments([
    ...selectedEvidence,
    ...retrieveQueryAnswerSelectedSourceEvidence(context, selectedLine, parsed.recordIds)
  ]);
  const sapEvidence = retrieveQueryAnswerSapEvidenceOrThrow(context, selectedLine, parsed.recordIds, {
    allowUnavailableWhenSelectedEvidencePresent: selectedSourceEvidence.length > 0
  });
  const finding = evaluateCoreRule(buildForensicsRuleInput(selectedLine, context.reconciliation));
  const selectedDecision = buildDeductionDecision({
    evidenceDocuments: mergeEvidenceDocuments(selectedLine, selectedSourceEvidence, sapEvidence),
    finding,
    lineId: selectedLine.lineId,
    modelId: runtimeModels.reasoning,
    producedBy: "agent:forensics-investigator",
    ruleId: finding.ruleId,
    ...(context.decisionConfidenceThreshold === undefined
      ? {}
      : { decisionConfidenceThreshold: { threshold: context.decisionConfidenceThreshold.threshold } })
  });
  const selectedScenarioEvidence = dedupeEvidenceDocuments(
    selectedScenarioLines.flatMap((line) => [
      ...retrieveQueryAnswerSelectedEvidence(context, line, parsed.recordIds),
      ...retrieveQueryAnswerSelectedSourceEvidence(context, line, parsed.recordIds),
      ...retrieveQueryAnswerSapEvidenceOrThrow(context, line, parsed.recordIds, {
        allowUnavailableWhenSelectedEvidencePresent: true
      })
    ])
  );
  assertQueryAnswerRecordIdsAreSupported(parsed.recordIds, {
    findingRecordIds: finding.recordIds,
    selectedDecision,
    selectedEvidenceDocuments: selectedScenarioEvidence,
    selectedLines: selectedScenarioLines
  });

  return {
    answer: buildDeterministicForensicsQueryAnswer({
      basis: selectedDecision.basis,
      citationRecordIds: parsed.recordIds,
      question: parsed.question,
      routing: selectedDecision.routing,
      selectedLineId: selectedDecision.lineId,
      verdict: selectedDecision.verdict
    }),
    citationParity: {
      parity: "same_record_ids",
      textRecordIds: [...parsed.recordIds],
      voiceRecordIds: [...parsed.recordIds]
    },
    deterministicBasis:
      "query.answer selectedLineId + selected evidence recordIds + deterministic forensics decision; live Realtime narration stays scoped to the selected cockpit evidence packet.",
    recordIds: [...parsed.recordIds],
    sourceReadStatus: "source_backed_selected_scope",
    status: "source_backed_selected_scope",
    sourceReads: {
      canonicalModel: "EvidenceDocument",
      ...(sapEvidence.length === 0
        ? (selectedSourceEvidence.length === 0 ? {} : queryAnswerCanonicalSourceLineage)
        : queryAnswerSapSourceLineage),
      sapEvidence: sapEvidence.map(canonicalEvidenceSummary),
      selectedEvidence: selectedScenarioEvidence,
      selectedLineId: selectedLine.lineId,
      selectedRecordIds: [...parsed.recordIds]
    }
  };
}

function assertQueryAnswerRecordIdsAreSupported(
  requestedRecordIds: readonly string[],
  input: {
    findingRecordIds: readonly string[];
    selectedDecision: {
      decisionId: string;
      evidenceDocumentIds: readonly string[];
      lineId: string;
      recordIds: readonly string[];
    };
    selectedEvidenceDocuments: readonly EvidenceDocument[];
    selectedLines: readonly DeductionLine[];
  }
): void {
  const evidenceDocuments = dedupeEvidenceDocuments(input.selectedEvidenceDocuments);
  const supportedRecordIds = new Set(dedupeStringValues([
    ...input.selectedLines.flatMap((line) => [line.lineId, ...line.recordIds]),
    ...input.findingRecordIds,
    input.selectedDecision.lineId,
    input.selectedDecision.decisionId,
    ...input.selectedDecision.recordIds,
    ...input.selectedDecision.evidenceDocumentIds,
    ...evidenceDocuments.flatMap((document) => [
      document.documentId,
      ...document.recordIds,
      ...(document.freshnessRecordIds ?? [])
    ])
  ]));

  if (requestedRecordIds.some((recordId) => !supportedRecordIds.has(recordId))) {
    throw new Error("query.answer recordIds are not fully supported by the selected evidence scope.");
  }
}

function queryAnswerWorkItemGroupIdFromLineId(lineId: string): string {
  return lineId.match(/^(S[1-8])-/u)?.[1] ?? lineId;
}

function answerSourceBackedWorkspaceQuery(input: unknown, context: ServiceInvocationContext): unknown {
  const parsed = queryWorkspaceToolSchema.parse(input);
  const source = readSourcePort(context);
  const settlementRunId = parsed.settlementRunId ?? settlementRunIdForSource(source.loadSettlementRun());
  const response = buildForensicsWorkspaceQueryResponse({
    governedConfig: readGovernedConfig(context),
    question: parsed.question,
    ...(context.reconciliation === undefined ? {} : { reconciliation: context.reconciliation }),
    serviceContext: context,
    settlementRunId,
    source
  });
  if (response.answer === undefined) {
    throw new Error("query.workspace could not produce a cited workspace answer.");
  }

  return {
    answer: response.answer,
    citations: response.citations,
    deterministicBasis: response.deterministicBasis,
    sourceReadStatus: response.sourceReadStatus,
    sourceReads: response.sourceReads
  };
}

function answerSourceBackedCreditRiskQuery(input: unknown, context: ServiceInvocationContext): unknown {
  const parsed = creditRiskAnswerToolSchema.parse(input);
  assertCreditRiskAnswerWithinSelectedScope(parsed, context.creditRiskAnswerScope);
  if (context.creditRiskRows === undefined) {
    throw new Error("credit_risk.answer requires credit risk source rows.");
  }

  const model = buildCreditRiskReviewModel(context.creditRiskRows);
  const account = model.accounts.find((candidate) => candidate.accountId === parsed.accountId);
  if (account === undefined) {
    throw new Error("credit_risk.answer accountId was not found in the credit risk source snapshot.");
  }

  const allowedRecordIds = new Set([
    account.accountId,
    ...account.recordIds,
    ...account.evidenceDocuments.flatMap((document) => [document.documentId, ...document.recordIds])
  ]);
  if (
    !parsed.recordIds.includes(account.accountId) ||
    parsed.recordIds.some((recordId) => !allowedRecordIds.has(recordId))
  ) {
    throw new Error("credit_risk.answer input is outside the selected account evidence scope.");
  }

  const selectedEvidence = account.evidenceDocuments
    .filter((document) =>
      parsed.recordIds.includes(document.documentId) ||
      document.recordIds.some((recordId) => parsed.recordIds.includes(recordId))
    )
    .map((document) => ({
      documentId: document.documentId,
      documentType: document.documentType,
      recordIds: dedupeStringValues([account.accountId, document.documentId, ...document.recordIds]),
      source: document.synthetic ? "supabase_synthetic" : "supabase",
      summary: document.title
    }));

  if (selectedEvidence.length === 0) {
    throw new Error("credit_risk.answer selected account evidence documents are unavailable.");
  }

  return {
    answer: "Selected David credit risk evidence scope read from governed backend rows.",
    sourceReadStatus: "source_backed_selected_scope",
    sourceReads: {
      canonicalModel: "CreditRiskEvidenceDocument",
      primarySourceLabel: "Supabase credit evidence documents",
      primarySourceSystem: "supabase",
      selectedAccountId: account.accountId,
      selectedEvidence,
      selectedRecordIds: [...parsed.recordIds],
      sourceFreshness: "snapshot",
      transportLabel: "Governed credit risk read-model",
      transportLayer: "supabase_credit_risk"
    }
  };
}

function priceSourceBackedCreditNegotiationDrafts(input: unknown, context: ServiceInvocationContext): unknown {
  const parsed = creditNegotiationDraftStructuresToolSchema.parse(input);
  assertCreditNegotiationDraftsWithinSelectedScope(parsed, context.creditRiskAnswerScope);
  const creditRiskRows = readCreditRiskRows(context);
  const dealRows = readDealOptimizerRows(context);
  const order = dealRows.simRows.orders.find((candidate) => candidate.orderId === parsed.orderId);
  if (order === undefined) {
    throw new Error("credit_negotiation.draft_structures order was not found in governed negotiation source rows.");
  }
  if (order.accountId !== parsed.accountId) {
    throw new Error("credit_negotiation.draft_structures order is outside the selected David account scope.");
  }

  const scopedAccountRecordIds =
    context.creditRiskAnswerScope?.accountId === parsed.accountId ? context.creditRiskAnswerScope.recordIds : [];
  const allowedRecordIds = new Set([parsed.accountId, parsed.orderId, ...order.sourceRecordIds, ...scopedAccountRecordIds]);
  if (parsed.recordIds.some((recordId) => !allowedRecordIds.has(recordId))) {
    throw new Error("credit_negotiation.draft_structures input is outside the selected order evidence scope.");
  }

  const drafts = parseCreditNegotiationDraftStructures({ structures: parsed.structures });
  const model = priceAgentDraftedDealStructures({
    creditRiskRows,
    drafts,
    orderId: parsed.orderId,
    policyRows: dealRows.policyRows,
    seed: 42,
    simRows: dealRows.simRows
  });
  const selectedRecordIds = dedupeStringValues([
    parsed.accountId,
    parsed.orderId,
    ...parsed.recordIds,
    ...order.sourceRecordIds,
    ...model.sourceRecordIds
  ]);

  return {
    model,
    sourceReadStatus: "source_backed_selected_scope",
    sourceReads: {
      canonicalModel: "CreditNegotiationDraftDealModel",
      primarySourceLabel: "Supabase credit negotiation simulated feeds",
      primarySourceSystem: "supabase",
      selectedEvidence: [
        {
          documentId: parsed.orderId,
          recordIds: selectedRecordIds
        }
      ],
      selectedRecordIds,
      sourceFreshness: "snapshot",
      transportLabel: "Governed credit negotiation simulated feeds",
      transportLayer: "supabase_credit_negotiation"
    }
  };
}

function assertQueryAnswerWithinSelectedScope(
  input: { recordIds: readonly string[]; selectedLineId: string },
  scope: ServiceInvocationContext["queryAnswerScope"]
): void {
  if (scope === undefined) {
    return;
  }

  const inputRecordIds = dedupeStringValues(input.recordIds);
  const scopeRecordIds = dedupeStringValues(scope.recordIds);
  const selectedSubsetScope =
    inputRecordIds.includes(scope.selectedLineId) &&
    inputRecordIds.some((recordId) => recordId !== scope.selectedLineId) &&
    inputRecordIds.every((recordId) => scopeRecordIds.includes(recordId));

  if (input.selectedLineId !== scope.selectedLineId || !selectedSubsetScope) {
    throw new Error("query.answer input is outside the selected evidence scope.");
  }
}

function assertCreditRiskAnswerWithinSelectedScope(
  input: { accountId: string; recordIds: readonly string[] },
  scope: ServiceInvocationContext["creditRiskAnswerScope"]
): void {
  if (scope === undefined) {
    return;
  }

  const inputRecordIds = dedupeStringValues(input.recordIds);
  const scopeRecordIds = dedupeStringValues(scope.recordIds);
  const selectedAccountScope =
    inputRecordIds.includes(scope.accountId) &&
    inputRecordIds.some((recordId) => recordId !== scope.accountId) &&
    inputRecordIds.every((recordId) => scopeRecordIds.includes(recordId));

  if (input.accountId !== scope.accountId || !selectedAccountScope) {
    throw new Error("credit_risk.answer input is outside the selected account evidence scope.");
  }
}

function assertCreditNegotiationDraftsWithinSelectedScope(
  input: { accountId: string; orderId: string; recordIds: readonly string[] },
  scope: ServiceInvocationContext["creditRiskAnswerScope"]
): void {
  if (scope === undefined || scope.accountId !== input.accountId) {
    throw new Error("credit_negotiation.draft_structures input is outside the selected account evidence scope.");
  }
  if (!input.recordIds.includes(input.accountId) || !input.recordIds.includes(input.orderId)) {
    throw new Error("credit_negotiation.draft_structures input is outside the selected order evidence scope.");
  }
}

function dedupeStringValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function canonicalEvidenceSummary(document: EvidenceDocument): EvidenceDocument {
  return {
    documentId: document.documentId,
    documentType: document.documentType,
    recordIds: [...document.recordIds],
    source: document.source,
    summary: document.summary
  };
}

function retrieveQueryAnswerSelectedEvidence(
  context: ServiceInvocationContext,
  line: DeductionLine,
  selectedRecordIds: readonly string[]
): EvidenceDocument[] {
  const reconciliation = context.reconciliation;
  if (reconciliation?.evidenceDataset === undefined || reconciliation.receipts === undefined) {
    return [];
  }

  const receipt = reconciliation.receipts.find((candidate) => candidate.lineId === line.lineId);
  if (receipt === undefined) {
    return [];
  }

  const selectedIds = new Set(dedupeStringValues([line.lineId, ...selectedRecordIds, receipt.receiptId]));
  const receiptEvidenceIds = new Set(receipt.evidenceIds);
  const linkedRecordIdsByEvidenceId = new Map<string, Set<string>>();
  for (const link of reconciliation.evidenceDataset.links) {
    if (!linkedRecordIdsByEvidenceId.has(link.evidenceId)) {
      linkedRecordIdsByEvidenceId.set(link.evidenceId, new Set<string>());
    }
    linkedRecordIdsByEvidenceId.get(link.evidenceId)?.add(link.recordId);
  }

  return reconciliation.evidenceDataset.documents
    .filter((document) => receiptEvidenceIds.has(document.evidenceId))
    .filter((document) => {
      const linkedRecordIds = linkedRecordIdsByEvidenceId.get(document.evidenceId);
      return (
        selectedIds.has(document.evidenceId) ||
        selectedIds.has(document.sourceRecordId) ||
        [...(linkedRecordIds ?? [])].some((recordId) => selectedIds.has(recordId))
      );
    })
    .map((document) => {
      const linkedRecordIds = linkedRecordIdsByEvidenceId.get(document.evidenceId);
      return {
        documentId: document.evidenceId,
        documentType: queryAnswerEvidenceDocumentType(document.documentType),
        recordIds: dedupeStringValues([
          line.lineId,
          receipt.receiptId,
          document.evidenceId,
          document.sourceRecordId,
          ...(linkedRecordIds === undefined ? [] : [...linkedRecordIds])
        ]),
        source: document.provenance === "sap_odata" || document.sourceSystem === "sap_odata" ? "sap" : "supabase",
        summary: `${document.documentType} evidence from ${document.sourceSystem}.`
      };
    });
}

function queryAnswerEvidenceDocumentType(
  documentType:
    | "bureau_alert"
    | "carrier_damage_report"
    | "carrier_photo"
    | "contract_pricing"
    | "contract_sla"
    | "customer_po"
    | "edi_812"
    | "payment_history"
    | "pod"
    | "remittance_advice"
    | "sap_credit_memo"
    | "sap_invoice"
    | "tpm_accrual"
    | "tpm_promo"
): EvidenceDocument["documentType"] {
  switch (documentType) {
    case "pod":
      return "POD";
    case "sap_invoice":
    case "customer_po":
      return "invoice";
    case "sap_credit_memo":
      return "credit-memo";
    case "contract_pricing":
    case "contract_sla":
      return "contract";
    case "tpm_accrual":
    case "tpm_promo":
      return "trade-promo";
    case "carrier_damage_report":
    case "carrier_photo":
      return "carrier-report";
    case "remittance_advice":
    case "payment_history":
      return "remittance-advice";
    case "edi_812":
      return "edi-remittance";
    case "bureau_alert":
      return "bureau-signal";
  }
}

async function sendApprovedEmail(
  input: z.infer<typeof emailSendApprovedToolSchema>,
  context: ServiceInvocationContext
): Promise<unknown> {
  const humanPrincipal = readVerifiedHumanPrincipal(context);
  const runtimeEnv = readEmailRuntimeEnv(context);
  const serverCapabilities = emailSendCapabilitiesForPrincipal(runtimeEnv, humanPrincipal);
  const callerCapabilities = context.actorCapabilities ?? [];
  const actorCapabilities =
    serverCapabilities.includes("send_email") && callerCapabilities.includes("send_email") ? ["read", "send_email"] : ["read"];
  const permission = evaluateToolPermission(serviceToolMetadata["email.sendApproved"], {
    actorCapabilities,
    actorId: humanPrincipal
  });
  if (permission.decision === "deny") {
    throw new Error(permission.reason ?? "Email send is not permitted.");
  }

  const configResult = readRecoupEmailConfig(runtimeEnv);
  if (!configResult.ok) {
    throw new Error(`Email service is not configured: ${configResult.missing.join(", ")}.`);
  }

  const detail = await fetchApprovedEmailDetail({
    context,
    humanPrincipal,
    lineId: input.lineId,
    runtimeEnv
  });
  const policyCheck = verifyApprovedEmailSendPolicy(detail, input);
  if (!policyCheck.ok) {
    throw new Error(policyCheck.error);
  }

  return sendResendEmail({
    config: configResult.config,
    draft: input,
    fetchImpl: context.emailFetch,
    principal: humanPrincipal,
    statusSecret: emailStatusSecret(runtimeEnv, configResult.config)
  });
}

async function readEmailStatus(input: z.infer<typeof emailStatusToolSchema>, context: ServiceInvocationContext): Promise<unknown> {
  const humanPrincipal = readVerifiedHumanPrincipalForEmailStatus(context);
  const runtimeEnv = readEmailRuntimeEnv(context);
  const configResult = readRecoupEmailConfig(runtimeEnv);
  if (!configResult.ok) {
    throw new Error(`Email service is not configured: ${configResult.missing.join(", ")}.`);
  }

  return readResendEmailStatus({
    actionId: input.actionId,
    config: configResult.config,
    fetchImpl: context.emailFetch,
    lineId: input.lineId,
    principal: humanPrincipal,
    providerEmailId: input.providerEmailId,
    recipientGroup: input.recipientGroup,
    statusSecret: emailStatusSecret(runtimeEnv, configResult.config),
    statusToken: input.statusToken
  });
}

async function fetchApprovedEmailDetail(input: {
  context: ServiceInvocationContext;
  humanPrincipal: string;
  lineId: string;
  runtimeEnv: RuntimeEnv;
}): Promise<unknown> {
  const authToken = input.runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (authToken === undefined || authToken.length === 0) {
    throw new Error("Verified human cockpit auth required for email send.");
  }

  const fetchImpl = input.context.emailFetch ?? fetch;
  const baseUrl = input.runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const response = await fetchImpl(`${baseUrl}/forensics/work-items/${encodeURIComponent(input.lineId)}`, {
    headers: {
      accept: "application/json",
      "x-recoup-human-principal": input.humanPrincipal,
      "x-recoup-human-token": authToken
    },
    method: "GET"
  });
  if (!response.ok) {
    throw new Error("Approved case detail unavailable.");
  }

  return response.json();
}

function readEmailRuntimeEnv(context: ServiceInvocationContext): RuntimeEnv {
  return context.runtimeEnv ?? loadLocalRuntimeEnvFiles();
}

function readVerifiedHumanPrincipal(context: ServiceInvocationContext): string {
  const principal = context.verifiedHumanPrincipal?.trim();
  if (principal === undefined || !principal.startsWith("human:")) {
    throw new Error("Verified human service context required.");
  }

  return principal;
}

function readVerifiedHumanPrincipalForEmailStatus(context: ServiceInvocationContext): string {
  try {
    return readVerifiedHumanPrincipal(context);
  } catch {
    throw new Error("Verified human cockpit auth required for email status.");
  }
}

function readGovernedConfig(context: ServiceInvocationContext): GovernedConfigValues {
  if (context.governedConfig === undefined) {
    throw new Error("Governed runtime config snapshot required.");
  }

  return context.governedConfig;
}

function readCreditRiskRows(context: ServiceInvocationContext): CreditRiskRows {
  if (context.creditRiskRows === undefined) {
    throw new Error("Credit risk source snapshot required.");
  }

  return context.creditRiskRows;
}

function readDealOptimizerRows(context: ServiceInvocationContext): NonNullable<ServiceInvocationContext["dealOptimizerRows"]> {
  if (context.dealOptimizerRows === undefined) {
    throw new Error("Credit negotiation source snapshot required.");
  }

  return context.dealOptimizerRows;
}

function readSourcePort(context: ServiceInvocationContext): SourcePort {
  if (context.source === undefined) {
    throw new Error("Supabase source snapshot required.");
  }

  return context.source;
}

function retrieveSyntheticEvidenceOrThrow(
  context: ServiceInvocationContext,
  toolName: "retrieval.bureau" | "retrieval.docs" | "retrieval.tpm",
  connectorName: ServiceSyntheticEvidenceConnectorName,
  line: DeductionLine
): EvidenceDocument[] {
  if (context.syntheticEvidenceSource !== undefined) {
    return [...context.syntheticEvidenceSource.readEvidence(connectorName, line)];
  }

  throw new Error(`Supabase synthetic evidence source required for ${toolName}.`);
}

function retrieveSapEvidenceOrThrow(
  context: ServiceInvocationContext,
  line: DeductionLine
): EvidenceDocument[] {
  if (context.sapEvidenceSource !== undefined) {
    return [...context.sapEvidenceSource.readEvidence(line)];
  }

  throw new Error("Supabase SAP evidence source required for retrieval.sap.");
}

function retrieveVectorStoreEvidence(context: ServiceInvocationContext, line: DeductionLine): EvidenceDocument[] {
  if (context.vectorStoreEvidenceSource === undefined) {
    return [];
  }

  return [...context.vectorStoreEvidenceSource.readEvidence(line)];
}

function retrieveDocsEvidence(context: ServiceInvocationContext, line: DeductionLine): EvidenceDocument[] {
  const structuredEvidence = retrieveSyntheticEvidenceOrThrow(context, "retrieval.docs", "docs-repo", line);
  const vectorEvidence = retrieveVectorStoreEvidence(context, line);
  if (vectorEvidence.length === 0) {
    return structuredEvidence;
  }

  const structuredDocumentIds = new Set(structuredEvidence.map((document) => document.documentId));
  const groundedVectorEvidence = mergeEvidenceDocuments(line, vectorEvidence).filter(
    (document) => !structuredDocumentIds.has(document.documentId)
  );

  return [...structuredEvidence, ...groundedVectorEvidence];
}

function retrieveQueryAnswerSelectedSourceEvidence(
  context: ServiceInvocationContext,
  line: DeductionLine,
  selectedRecordIds: readonly string[]
): EvidenceDocument[] {
  const selectedIds = new Set(dedupeStringValues([line.lineId, ...selectedRecordIds]));
  const documents: EvidenceDocument[] = [];
  if (context.syntheticEvidenceSource !== undefined) {
    for (const connectorName of defaultServiceSyntheticEvidenceConnectorNames) {
      documents.push(...context.syntheticEvidenceSource.readEvidence(connectorName, line));
    }
  }
  documents.push(...retrieveVectorStoreEvidence(context, line));

  return dedupeEvidenceDocuments(
    documents.filter((document) => {
      if (selectedIds.has(document.documentId)) {
        return true;
      }
      return document.recordIds.some((recordId) => recordId !== line.lineId && selectedIds.has(recordId));
    })
  );
}

function retrieveQueryAnswerSapEvidenceOrThrow(
  context: ServiceInvocationContext,
  line: DeductionLine,
  selectedRecordIds: readonly string[],
  options: { allowUnavailableWhenSelectedEvidencePresent?: boolean } = {}
): EvidenceDocument[] {
  if (context.sapEvidenceSource === undefined) {
    if (context.requireSupabaseSapEvidence === true && options.allowUnavailableWhenSelectedEvidencePresent !== true) {
      throw new Error("Supabase SAP evidence source required for query.answer.");
    }

    return [];
  }

  const selectedIds = new Set(dedupeStringValues([line.lineId, ...selectedRecordIds]));
  const evidence = [...context.sapEvidenceSource.readEvidence(line)].filter(
    (document) =>
      selectedIds.has(document.documentId) ||
      document.recordIds.some((recordId) => recordId !== line.lineId && selectedIds.has(recordId))
  );
  if (
    context.requireSupabaseSapEvidence === true &&
    evidence.length === 0 &&
    options.allowUnavailableWhenSelectedEvidencePresent !== true
  ) {
    throw new Error("Supabase SAP evidence rows required for query.answer.");
  }

  return evidence;
}

function readR1Source(
  input: z.infer<typeof r1SourceReadToolSchema>,
  context: ServiceInvocationContext
): Record<string, unknown> {
  switch (input.need) {
    case "invoice":
      return sapPrimaryR1Read(input.need, { need: input.need, billingDocument: input.billingDocument }, [input.billingDocument], context);
    case "sales-order":
      return sapPrimaryR1Read(input.need, { need: input.need, salesOrder: input.salesOrder }, [input.salesOrder], context);
    case "credit-account-dso":
      return sapPrimaryR1Read(
        input.need,
        { need: input.need, businessPartner: input.businessPartner, creditSegment: input.creditSegment },
        [input.businessPartner, input.creditSegment],
        context
      );
    case "credit-exposure":
      return sapPrimaryR1Read(input.need, { need: input.need, businessPartner: input.businessPartner }, [input.businessPartner], context);
    case "dispute-case":
      return sapPrimaryR1Read(input.need, { need: input.need, disputeCaseId: input.disputeCaseId }, [input.disputeCaseId], context);
    case "accrual-cap":
      return {
        ...sapPrimaryR1Read(input.need, { need: input.need, accrualObject: input.accrualObject }, [input.accrualObject], context),
        provenance: {
          fallback: "supabase",
          ownerInput: "R2-5",
          primary: "sap",
          sourcePolicy: "sap-primary-supabase-authoritative-fallback"
        },
        readPlan: {
          sap: readSapPlan(input.need, { need: input.need, accrualObject: input.accrualObject }, context),
          supabase: {
            authoritativeFields: ["accrual_cap"],
            filters: { promo_id: `eq.${input.accrualObject}` },
            table: "promotions"
          }
        },
        sourceMode: "sap_primary_supabase_authoritative_fallback"
      };
    case "outbound-delivery":
      return supabaseR1Read(input.need, "sap-delivery-501-supabase", "pod_records", ["delivery_ref"], [input.deliveryRef], {
        filters: { delivery_ref: `eq.${input.deliveryRef}` },
        select: ["delivery_ref", "delivery_timestamp", "signed_qty"]
      });
    case "credit-memo":
      return supabaseR1Read(input.need, "sap-g2-empty-supabase-duplicate-proof", "deductions_backlog", ["invoice_ref"], [input.billingDocument, ...(input.disputeCaseId === undefined ? [] : [input.disputeCaseId])], {
        filters: { invoice_ref: `eq.${input.billingDocument}` },
        select: ["invoice_ref", "verdict", "explanation"]
      });
    case "carrier-damage":
      return supabaseR1Read(input.need, "supabase-carrier-damage-proof", "carrier_reports", ["customer_id", "invoice_ref"], [input.customerId, ...(input.invoiceRef === undefined ? [] : [input.invoiceRef])], {
        filters: {
          customer_id: `eq.${input.customerId}`,
          ...(input.invoiceRef === undefined ? {} : { invoice_ref: `eq.${input.invoiceRef}` })
        },
        select: ["report_id", "customer_id", "invoice_ref", "damage_qty"]
      });
    case "payment-history":
      return supabaseR1Read(input.need, "supabase-payment-history", "payments", ["customer_id"], [input.customerId], {
        filters: { customer_id: `eq.${input.customerId}` },
        select: ["payment_id", "customer_id", "invoice_ref", "days_to_pay"]
      });
  }
}

function sapPrimaryR1Read(
  need: SapR1SourceNeedName,
  sourceNeed: SapR1SourceNeed,
  recordIds: string[],
  context: ServiceInvocationContext
): Record<string, unknown> {
  return {
    need,
    provenance: {
      ownerInput: "R2-5",
      primary: "sap",
      sourcePolicy: "sap-primary"
    },
    readPlan: {
      sap: readSapPlan(need, sourceNeed, context)
    },
    recordIds,
    sourceMode: "sap_primary"
  };
}

function readSapPlan(
  need: SapR1SourceNeedName,
  sourceNeed: SapR1SourceNeed,
  context: ServiceInvocationContext
): SapODataReadRequestPlan {
  if (context.r1SapMetadata === undefined || context.r1SapReadAdapter === undefined) {
    throw new Error(`R1 SAP metadata context required for source need ${need}.`);
  }

  const plan = context.r1SapReadAdapter.buildMetadataValidatedR1ReadRequestPlan(sourceNeed, context.r1SapMetadata);
  if (!plan.configured) {
    throw new Error(plan.reason);
  }

  return plan;
}

function supabaseR1Read(
  need: string,
  sourcePolicy: string,
  table: string,
  keyFields: string[],
  recordIds: string[],
  details: { filters: Record<string, string>; select: string[] }
): Record<string, unknown> {
  return {
    need,
    provenance: {
      ownerInput: "R2-5",
      primary: "supabase",
      sourcePolicy
    },
    readPlan: {
      supabase: {
        filters: details.filters,
        keyFields,
        mode: "authoritative",
        recordIds,
        select: details.select,
        table
      }
    },
    recordIds,
    sourceMode: "supabase_authoritative"
  };
}

function toEvidenceDocument(evidence: SyntheticSourceEvidence): EvidenceDocument {
  if (evidence.documentType === "correspondence") {
    throw new Error("Generic correspondence evidence cannot be used as decision evidence without a mapped proof type.");
  }

  return {
    documentId: evidence.documentId,
    documentType: evidence.documentType,
    ...(evidence.freshnessRecordIds === undefined ? {} : { freshnessRecordIds: [...evidence.freshnessRecordIds] }),
    recordIds: [...evidence.recordIds],
    source: evidence.source,
    summary: evidence.summary
  };
}

function toSapEvidenceDocument(evidence: SapSourceEvidence): EvidenceDocument {
  return {
    documentId: evidence.documentId,
    documentType: evidence.documentType,
    ...(evidence.freshnessRecordIds === undefined ? {} : { freshnessRecordIds: [...evidence.freshnessRecordIds] }),
    recordIds: [...evidence.recordIds],
    source: evidence.source,
    summary: evidence.summary
  };
}

function toVectorStoreEvidenceDocument(evidence: OpenAiVectorStoreEvidence): EvidenceDocument[] {
  if (
    evidence.documentType === "correspondence" ||
    isProviderEvidenceIdentifier(evidence.documentId) ||
    evidence.recordIds.some(isProviderEvidenceIdentifier)
  ) {
    return [];
  }

  return [
    {
      documentId: evidence.documentId,
      documentType: evidence.documentType,
      recordIds: [...evidence.recordIds],
      retrieval: {
        fileName: evidence.fileName,
        mode: "semantic-vector",
        provenance: evidence.provenance,
        score: evidence.score
      },
      source: evidence.source,
      summary: evidence.summary
    }
  ];
}

function isProviderEvidenceIdentifier(value: string): boolean {
  return /^(?:file-|vs[_-])/u.test(value);
}

function dedupeEvidenceDocuments(documents: readonly EvidenceDocument[]): EvidenceDocument[] {
  const documentsById = new Map<string, EvidenceDocument>();

  for (const document of documents) {
    if (!documentsById.has(document.documentId)) {
      documentsById.set(document.documentId, document);
    }
  }

  return [...documentsById.values()];
}

function syntheticEvidenceKey(connectorName: ServiceSyntheticEvidenceConnectorName, lineId: string): string {
  return `${connectorName}:${lineId}`;
}

function assertConfiguredRiskMeshCaseId(caseId: string, governedConfig: GovernedConfigValues): void {
  if (caseId !== governedConfig.riskMeshCases.harbor.caseId) {
    throw new Error("Risk Mesh case is not configured in the governed runtime snapshot.");
  }
}
