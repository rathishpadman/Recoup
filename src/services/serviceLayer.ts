import { z } from "zod";
import type { GovernedConfigValues } from "../../config/governed.js";
import type { DecisionConfidenceThreshold } from "../../config/releaseOwnerInputs.js";
import { draftOutreach } from "../tools/actions/draftOutreach.js";
import { draftRebill } from "../tools/actions/draftRebill.js";
import { proposeHold } from "../tools/actions/proposeHold.js";
import { proposeTerms } from "../tools/actions/proposeTerms.js";
import { routeBilling } from "../tools/actions/routeBilling.js";
import type { EvidenceDocument } from "../tools/retrieval/docs.js";
import { answerOfflineQuery } from "../agents/query.js";
import { assessHarborContainment } from "../agents/containment.js";
import {
  assertApprovalReasonSafe,
  decideApproval,
  type ApprovalResult,
  type ProposedExternalAction
} from "./approvals.js";
import { createAuditEntry, type AuditEntry, type AuditEntryBuildOptions } from "../audit/trail.js";
import { runForensicsInvestigation } from "../agents/forensics.js";
import type { ToolPermissionMetadata } from "./permissionEngine.js";
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

interface ServiceTool {
  schema: z.ZodTypeAny;
  handler: (input: unknown, context: ServiceInvocationContext) => unknown;
}

export interface ServiceInvocationContext {
  decisionConfidenceThreshold?: DecisionConfidenceThreshold;
  governedConfig?: GovernedConfigValues;
  queryAnswerScope?: {
    recordIds: string[];
    selectedLineId: string;
  };
  r1SapMetadata?: SapODataMetadataInput;
  r1SapReadAdapter?: SapODataReadOnlyAdapter;
  requireSupabaseSapEvidence?: boolean;
  requireSupabaseSyntheticEvidence?: boolean;
  sapEvidenceSource?: ServiceSapEvidenceSource;
  source?: SourcePort;
  syntheticEvidenceSource?: ServiceSyntheticEvidenceSource;
  verifiedHumanPrincipal?: string;
}

export interface ServiceSapEvidenceSource {
  readEvidence(line: DeductionLine): readonly EvidenceDocument[];
}

export type ServiceSyntheticEvidenceConnectorName = Extract<EnterpriseConnectorName, "bureau" | "docs-repo" | "tpm">;

export interface ServiceSyntheticEvidenceSource {
  readEvidence(connectorName: ServiceSyntheticEvidenceConnectorName, line: DeductionLine): readonly EvidenceDocument[];
}

const defaultServiceSyntheticEvidenceConnectorNames = ["docs-repo", "tpm", "bureau"] as const;

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
  "decisions.deductionVerdict": { riskClass: "decision", sideEffectClass: "write_local", visibility: "internal" },
  "query.answer": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
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
  "query.answer": {
    schema: queryAnswerToolSchema,
    handler: (input, context) => answerSourceBackedSelectedEvidenceQuery(input, context)
  },
  "retrieval.docs": {
    schema: DeductionLineSchema,
    handler: (input, context) => {
      const line = DeductionLineSchema.parse(input);
      return retrieveSyntheticEvidenceOrThrow(context, "retrieval.docs", "docs-repo", line);
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

  for (const line of input.settlementRun.deductionLines) {
    const evidence = await input.reader.readEvidence(line);
    documentsByLineId.set(line.lineId, dedupeEvidenceDocuments(evidence.map(toSapEvidenceDocument)));
  }

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
  const governedConfig = readGovernedConfig(context);
  const source = readSourcePort(context);
  const forensicsRun = runForensicsInvestigation({
    ...(context.decisionConfidenceThreshold === undefined
      ? {}
      : { decisionConfidenceThreshold: context.decisionConfidenceThreshold }),
    governedConfig,
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

function answerSourceBackedSelectedEvidenceQuery(input: unknown, context: ServiceInvocationContext): unknown {
  const parsed = queryAnswerToolSchema.parse(input);
  assertQueryAnswerWithinSelectedScope(parsed, context.queryAnswerScope);
  const governedConfig = readGovernedConfig(context);
  const source = readSourcePort(context);
  const answer = answerOfflineQuery({
    ...parsed,
    governedConfig,
    source
  });
  const settlementRun = source.loadSettlementRun();
  const selectedLine = settlementRun.deductionLines.find((line) => line.lineId === parsed.selectedLineId);
  if (selectedLine === undefined) {
    throw new Error("query.answer selectedLineId was not found in the canonical source snapshot.");
  }

  const sapEvidence = retrieveQueryAnswerSapEvidenceOrThrow(context, selectedLine);

  return {
    ...answer,
    sourceReadStatus: "source_backed_selected_scope",
    sourceReads: {
      canonicalModel: "EvidenceDocument",
      sapEvidence: sapEvidence.map(canonicalEvidenceSummary),
      selectedLineId: selectedLine.lineId,
      selectedRecordIds: [...parsed.recordIds]
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
  const sameRecordScope =
    inputRecordIds.length === scopeRecordIds.length &&
    scopeRecordIds.every((recordId) => inputRecordIds.includes(recordId));

  if (input.selectedLineId !== scope.selectedLineId || !sameRecordScope) {
    throw new Error("query.answer input is outside the selected evidence scope.");
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

function readVerifiedHumanPrincipal(context: ServiceInvocationContext): string {
  const principal = context.verifiedHumanPrincipal?.trim();
  if (principal === undefined || !principal.startsWith("human:")) {
    throw new Error("Verified human service context required.");
  }

  return principal;
}

function readGovernedConfig(context: ServiceInvocationContext): GovernedConfigValues {
  if (context.governedConfig === undefined) {
    throw new Error("Governed runtime config snapshot required.");
  }

  return context.governedConfig;
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

function retrieveQueryAnswerSapEvidenceOrThrow(
  context: ServiceInvocationContext,
  line: DeductionLine
): EvidenceDocument[] {
  if (context.sapEvidenceSource === undefined) {
    if (context.requireSupabaseSapEvidence === true) {
      throw new Error("Supabase SAP evidence source required for query.answer.");
    }

    return [];
  }

  const evidence = [...context.sapEvidenceSource.readEvidence(line)];
  if (context.requireSupabaseSapEvidence === true && evidence.length === 0) {
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
    recordIds: [...evidence.recordIds],
    source: evidence.source,
    summary: evidence.summary
  };
}

function toSapEvidenceDocument(evidence: SapSourceEvidence): EvidenceDocument {
  return {
    documentId: evidence.documentId,
    documentType: evidence.documentType,
    recordIds: [...evidence.recordIds],
    source: evidence.source,
    summary: evidence.summary
  };
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
