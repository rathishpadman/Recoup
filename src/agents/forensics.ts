import { runtimeModels } from "../../config/models.js";
import type { GovernedConfigValues } from "../../config/governed.js";
import type { DecisionConfidenceThreshold } from "../../config/releaseOwnerInputs.js";
import type { SourcePort } from "../adapters/source.js";
import type { RuleFinding, RuleInput } from "../core/rules/index.js";
import { redactPiiForModelContext } from "../guardrails/input/pii.js";
import { assertFinalAgentOutput } from "../guardrails/output/final.js";
import { s4AgentBoundary } from "./agentRuntime.js";
import { invokeServiceTool, type ServiceInvocationContext, type ServiceToolName } from "../services/serviceLayer.js";
import { clearDecisionStore, registerDecision } from "../services/decisionStore.js";
import { CoreRuleInputSchema } from "../types/decision.js";
import type { DecisionConfidence } from "../types/decision.js";
import type { DeductionLine, DeductionRouting, DeductionVerdict } from "../types/entities.js";
import type { Money } from "../types/money.js";
import type { RuleId } from "../core/rules/types.js";
import { writeAgentHandoffPacket, writeSessionState, writeTransactionState } from "../memory/session.js";
import type { MemoryStore } from "../memory/store.js";
import {
  createAgentHookAuditReceipt,
  deterministicForensicsHookAuditBasis,
  type AgentHookAuditReceipt
} from "../services/conductor.js";
import type { RouteBillingAction } from "../tools/actions/routeBilling.js";
import { mergeEvidenceDocuments, type EvidenceDocument } from "../tools/retrieval/docs.js";
import { draftRecovery } from "./recoveryDrafter.js";
import type { DraftRebillAction } from "../tools/actions/draftRebill.js";
import { createAgentHandoffPacket } from "./messages.js";
import {
  assessCrestlineM6Containment,
  createCrestlineM6ContainmentReviewAction,
  toContainmentDecision,
  type ContainmentDecision,
  type ContainmentReviewAction,
  type CrestlineM6ContainmentAssessment
} from "./containment.js";

export type ForensicsTraceEvent =
  | { type: "finding"; payload: { source: "tool" | "agent"; lineId: string; ruleId: RuleId; recordIds: string[] } }
  | {
      type: "verdict";
      payload: {
        lineId: string;
        verdict: DeductionVerdict;
        routing: DeductionRouting;
        recordIds: string[];
        deterministicBasis: {
          ruleId: RuleId;
          computedDeltaAmount: string;
          amountSource: "core-rule-delta";
        };
      };
    }
  | {
      type: "status";
      payload: {
        kind: "agent-boundary" | "handoff" | "model-context" | "model-text-delta" | "service-tool";
        from?: string;
        to?: string;
        text?: string;
        toolName?: ServiceToolName;
      };
    };

export interface DeductionDecision {
  decisionId: string;
  lineId: string;
  verdict: DeductionVerdict;
  routing: DeductionRouting;
  recordIds: string[];
  basis: string;
  deterministicBasis: {
    ruleId: RuleId;
    computedDeltaAmount: Money;
    amountSource: "core-rule-delta";
  };
  evidenceDocumentIds: string[];
  evidenceDocuments: EvidenceDocument[];
  producedBy: "agent:forensics-investigator";
  modelId: typeof runtimeModels.reasoning;
  confidence: DecisionConfidence;
}

export interface ForensicsRun {
  agentHookReceipts: AgentHookAuditReceipt[];
  decisions: DeductionDecision[];
  actions: Array<RouteBillingAction | DraftRebillAction>;
  containmentActions: ContainmentReviewAction[];
  containmentCandidates: CrestlineM6ContainmentAssessment[];
  containmentDecisions: ContainmentDecision[];
  recoveryDecisions: RecoveryDecision[];
  openDependencies: string[];
  agentBoundary: typeof s4AgentBoundary;
  trace: ForensicsTraceEvent[];
}

export interface RecoveryDecision {
  lineId: string;
  pursueRecovery: boolean;
}

export interface RunForensicsInvestigationOptions {
  agentHookRecordIds?: string[];
  analystContext?: string;
  decisionConfidenceThreshold?: DecisionConfidenceThreshold;
  governedConfig: GovernedConfigValues;
  memoryStore?: MemoryStore;
  serviceContext?: ServiceInvocationContext;
  sessionId?: string;
  source: SourcePort;
}

type MaybePromise<T> = T | Promise<T>;

export interface RunForensicsInvestigationEvidenceSources {
  docs?: (line: DeductionLine) => MaybePromise<readonly EvidenceDocument[]>;
}

export interface RunForensicsInvestigationWithEvidenceSourcesOptions extends RunForensicsInvestigationOptions {
  evidenceSources?: RunForensicsInvestigationEvidenceSources;
}

interface ForensicsRunState {
  deductionLines: DeductionLine[];
  trace: ForensicsTraceEvent[];
}

export function runForensicsInvestigation(options: RunForensicsInvestigationOptions | undefined): ForensicsRun {
  const runOptions = requireGovernedForensicsOptions(options);
  const state = createForensicsRunState(runOptions);
  const serviceContext = createForensicsServiceContext(runOptions);
  const decisions = state.deductionLines.map((line) =>
    buildForensicsDecision(
      line,
      state.trace,
      retrieveEvidenceDocuments(line, state.trace, serviceContext),
      runOptions.decisionConfidenceThreshold
    )
  );

  return completeForensicsRun(runOptions, state, decisions);
}

export async function runForensicsInvestigationWithEvidenceSources(
  options: RunForensicsInvestigationWithEvidenceSourcesOptions | undefined
): Promise<ForensicsRun> {
  const runOptions = requireGovernedForensicsOptions(options);
  const state = createForensicsRunState(runOptions);
  const serviceContext = createForensicsServiceContext(runOptions);
  const decisions: DeductionDecision[] = [];

  for (const line of state.deductionLines) {
    const injectedDocs = runOptions.evidenceSources?.docs === undefined ? [] : await runOptions.evidenceSources.docs(line);
    decisions.push(
      buildForensicsDecision(
        line,
        state.trace,
        mergeEvidenceDocuments(line, retrieveEvidenceDocuments(line, state.trace, serviceContext), [...injectedDocs]),
        runOptions.decisionConfidenceThreshold
      )
    );
  }

  return completeForensicsRun(runOptions, state, decisions);
}

function requireGovernedForensicsOptions<T extends RunForensicsInvestigationOptions>(
  options: T | undefined
): T {
  const maybeOptions = options as Partial<RunForensicsInvestigationOptions> | undefined;
  if (maybeOptions?.governedConfig === undefined) {
    throw new Error("Governed runtime config snapshot required.");
  }
  if (maybeOptions.source === undefined) {
    throw new Error("Forensics settlement source snapshot required.");
  }

  return maybeOptions as T;
}

function createForensicsRunState(options: RunForensicsInvestigationOptions): ForensicsRunState {
  const dataset = options.source.loadSettlementRun();
  clearDecisionStore();
  const redactedContext = redactPiiForModelContext(
    options.analystContext ?? "Maya requested the settlement-run proof check for S1-S8."
  );
  const trace: ForensicsTraceEvent[] = [
    {
      type: "status",
      payload: {
        kind: "agent-boundary",
        text: s4AgentBoundary.modelExecution
      }
    },
    {
      type: "status",
      payload: {
        kind: "model-context",
        text: redactedContext
      }
    },
    {
      type: "status",
      payload: {
        kind: "model-text-delta",
        text: "Forensics Investigator is checking retrieved proof against deterministic rules."
      }
    }
  ];

  return {
    deductionLines: dataset.deductionLines,
    trace
  };
}

function createForensicsServiceContext(options: RunForensicsInvestigationOptions): ServiceInvocationContext {
  return {
    ...(options.serviceContext ?? {}),
    governedConfig: options.governedConfig,
    source: options.source
  };
}

function buildForensicsDecision(
  line: DeductionLine,
  trace: ForensicsTraceEvent[],
  evidenceDocuments: EvidenceDocument[],
  decisionConfidenceThreshold: DecisionConfidenceThreshold | undefined
): DeductionDecision {
  const ruleId = toRuleId(line.ruleId);
  const finding = invokeTracedTool(trace, "core.evaluateRule", buildRuleInput(line, ruleId)) as RuleFinding;
  trace.push({
    type: "finding",
    payload: {
      source: "tool",
      lineId: line.lineId,
      ruleId: finding.ruleId,
      recordIds: finding.recordIds
    }
  });

  const decision = invokeTracedTool(trace, "decisions.deductionVerdict", {
    lineId: line.lineId,
    ruleId,
    finding,
    evidenceDocuments,
    ...(decisionConfidenceThreshold === undefined
      ? {}
      : { decisionConfidenceThreshold: { threshold: decisionConfidenceThreshold.threshold } }),
    producedBy: "agent:forensics-investigator",
    modelId: runtimeModels.reasoning
  }) as DeductionDecision;
  registerDecision(decision);
  trace.push({
    type: "verdict",
    payload: {
      deterministicBasis: {
        amountSource: decision.deterministicBasis.amountSource,
        computedDeltaAmount: decision.deterministicBasis.computedDeltaAmount.toFixed(2),
        ruleId: decision.deterministicBasis.ruleId
      },
      lineId: decision.lineId,
      recordIds: decision.recordIds,
      verdict: decision.verdict,
      routing: decision.routing
    }
  });

  return decision;
}

function completeForensicsRun(
  options: RunForensicsInvestigationOptions,
  state: ForensicsRunState,
  decisions: DeductionDecision[]
): ForensicsRun {
  const trace = state.trace;
  const containmentCandidate = assessCrestlineM6Containment({
    deductionLines: state.deductionLines,
    gamingGate: options.governedConfig.gamingGate
  });
  const containmentAction = createCrestlineM6ContainmentReviewAction(containmentCandidate);
  assertFinalAgentOutput({ deductionDecisions: decisions });
  assertFinalAgentOutput({
    containmentDecisions: [containmentCandidate],
    intentDecisions: [containmentCandidate]
  });

  trace.push({
    type: "status",
    payload: {
      kind: "handoff",
      from: "agent:forensics-investigator",
      to: "agent:recovery-drafter"
    }
  });

  const actions = decisions.map((decision) =>
    decision.routing === "billing"
      ? invokeTracedTool(trace, "actions.routeBilling", {
          decisionId: decision.decisionId,
          proposedBy: "agent:forensics-investigator"
        }) as RouteBillingAction
      : draftRecovery(decision)
  );
  if (options.memoryStore !== undefined) {
    persistForensicsMemory(options.memoryStore, options.sessionId ?? "forensics-run", decisions, actions);
  }

  return {
    agentHookReceipts: buildAgentHookReceipts(options.agentHookRecordIds ?? []),
    decisions,
    actions,
    containmentActions: [containmentAction],
    containmentCandidates: [containmentCandidate],
    containmentDecisions: [toContainmentDecision(containmentCandidate)],
    recoveryDecisions: decisions.map((decision) => ({
      lineId: decision.lineId,
      pursueRecovery: decision.routing === "recovery"
    })),
    openDependencies: options.decisionConfidenceThreshold === undefined ? ["decision-confidence-threshold"] : [],
    agentBoundary: s4AgentBoundary,
    trace
  };
}

function persistForensicsMemory(
  store: MemoryStore,
  sessionId: string,
  decisions: DeductionDecision[],
  actions: Array<RouteBillingAction | DraftRebillAction>
): void {
  const citedRecordIds = uniqueRecordIds([
    ...decisions.flatMap((decision) => decision.recordIds),
    ...actions.flatMap((action) => action.recordIds)
  ]);

  writeSessionState(store, {
    sessionId,
    key: "last-forensics-run",
    value: "completed",
    recordIds: citedRecordIds
  });

  for (const decision of decisions) {
    const actionIds = actions.filter((action) => action.lineId === decision.lineId).map((action) => action.actionId);
    writeTransactionState(store, {
      transactionId: decision.lineId,
      key: "deduction-decision",
      value: {
        actionIds,
        confidence: decision.confidence,
        decisionId: decision.decisionId,
        evidenceDocumentIds: decision.evidenceDocumentIds,
        producedBy: decision.producedBy,
        routing: decision.routing,
        ruleId: decision.deterministicBasis.ruleId,
        verdict: decision.verdict
      },
      recordIds: decision.recordIds
    });
  }

  const handoffPacket = createAgentHandoffPacket({
    packetId: `forensics-recovery:${sessionId}`,
    fromAgent: "Forensics Investigator",
    toAgent: "Recovery Drafter",
    capability: "B",
    caseId: sessionId,
    recordIds: citedRecordIds,
    deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
    intent: "stage-recovery-and-billing-drafts",
    status: "created"
  });
  writeAgentHandoffPacket(store, {
    handoffId: handoffPacket.packetId,
    capability: handoffPacket.capability,
    caseId: handoffPacket.caseId,
    deterministicBasis: handoffPacket.deterministicBasis,
    fromAgent: handoffPacket.fromAgent,
    intent: handoffPacket.intent,
    toAgent: handoffPacket.toAgent,
    status: handoffPacket.status,
    summary: "Forensics completed cited decisions and staged human-review recovery or Billing drafts.",
    recordIds: handoffPacket.recordIds
  });
}

function uniqueRecordIds(recordIds: string[]): string[] {
  return [...new Set(recordIds)];
}

function buildAgentHookReceipts(recordIds: readonly string[]): AgentHookAuditReceipt[] {
  const citedRecordIds = uniqueRecordIds(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0));
  if (citedRecordIds.length === 0) {
    return [];
  }

  return [
    createAgentHookAuditReceipt({
      agentName: "Forensics Supervisor",
      deterministicBasis: deterministicForensicsHookAuditBasis,
      hook: "agent_start",
      recordIds: citedRecordIds
    }),
    createAgentHookAuditReceipt({
      agentName: "Forensics Query",
      deterministicBasis: deterministicForensicsHookAuditBasis,
      hook: "agent_tool_start",
      recordIds: citedRecordIds,
      toolName: "query.answer"
    }),
    createAgentHookAuditReceipt({
      agentName: "Forensics Retrieval",
      deterministicBasis: deterministicForensicsHookAuditBasis,
      hook: "agent_tool_end",
      recordIds: citedRecordIds,
      toolName: "retrieval.evidence"
    }),
    createAgentHookAuditReceipt({
      agentName: "Forensics Decision",
      deterministicBasis: deterministicForensicsHookAuditBasis,
      hook: "agent_end",
      recordIds: citedRecordIds
    })
  ];
}

function retrieveEvidenceDocuments(
  line: DeductionLine,
  trace: ForensicsTraceEvent[],
  serviceContext: ServiceInvocationContext
): EvidenceDocument[] {
  const documents = [
    ...(invokeTracedTool(trace, "retrieval.sap", line, serviceContext) as EvidenceDocument[]),
    ...(invokeTracedTool(trace, "retrieval.docs", line, serviceContext) as EvidenceDocument[]),
    ...(invokeTracedTool(trace, "retrieval.tpm", line, serviceContext) as EvidenceDocument[])
  ];
  const documentsById = new Map<string, EvidenceDocument>();

  for (const document of documents) {
    if (!documentsById.has(document.documentId)) {
      documentsById.set(document.documentId, document);
    }
  }

  return [...documentsById.values()];
}

function invokeTracedTool(
  trace: ForensicsTraceEvent[],
  toolName: ServiceToolName,
  input: unknown,
  context: ServiceInvocationContext = {}
): unknown {
  trace.push({
    type: "status",
    payload: {
      kind: "service-tool",
      toolName
    }
  });

  return invokeServiceTool(toolName, input, context);
}

function buildRuleInput(line: DeductionLine, ruleId: RuleId): RuleInput {
  if (line.ruleInput === undefined) {
    throw new Error(`Supabase rule_input_json required for ${line.lineId}.`);
  }

  const parsed = CoreRuleInputSchema.parse(line.ruleInput) as RuleInput;
  if (parsed.lineId !== line.lineId || parsed.ruleId !== ruleId || parsed.period !== line.period) {
    throw new Error(`Supabase rule_input_json does not match settlement line ${line.lineId}.`);
  }

  return parsed;
}

function toRuleId(ruleId: string): RuleId {
  switch (ruleId) {
    case "damage-evidence-valid":
    case "promo-not-captured":
    case "shortage-pod-mismatch":
    case "otif-fine-valid":
    case "otif-timestamp-mismatch":
    case "pricing-below-contract":
    case "promo-overclaim":
    case "duplicate-credit":
      return ruleId;
    default:
      throw new Error(`Unknown ruleId: ${ruleId}`);
  }
}
