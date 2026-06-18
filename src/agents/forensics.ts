import { runtimeModels } from "../../config/models.js";
import { SyntheticSource } from "../adapters/synthetic.js";
import type { RuleFinding, RuleInput } from "../core/rules/index.js";
import { redactPiiForModelContext } from "../guardrails/input/pii.js";
import { s4AgentBoundary } from "./agentRuntime.js";
import { invokeServiceTool, type ServiceToolName } from "../services/serviceLayer.js";
import { clearDecisionStore, registerDecision } from "../services/decisionStore.js";
import { money } from "../types/money.js";
import type { DeductionLine, DeductionRouting, DeductionVerdict } from "../types/entities.js";
import type { RuleId } from "../core/rules/types.js";
import type { RouteBillingAction } from "../tools/actions/routeBilling.js";
import type { EvidenceDocument } from "../tools/retrieval/docs.js";
import { draftRecovery } from "./recoveryDrafter.js";
import type { DraftRebillAction } from "../tools/actions/draftRebill.js";

export type ForensicsTraceEvent =
  | { type: "finding"; payload: { source: "tool" | "agent"; lineId: string; ruleId: RuleId; recordIds: string[] } }
  | { type: "verdict"; payload: { lineId: string; verdict: DeductionVerdict; routing: DeductionRouting } }
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
    computedDeltaAmount: ReturnType<typeof money>;
    amountSource: "core-rule-delta";
  };
  evidenceDocumentIds: string[];
  evidenceDocuments: EvidenceDocument[];
  producedBy: "agent:forensics-investigator";
  modelId: typeof runtimeModels.reasoning;
  confidence: "blocked: decision-confidence-threshold unset";
}

export interface ForensicsRun {
  decisions: DeductionDecision[];
  actions: Array<RouteBillingAction | DraftRebillAction>;
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
  analystContext?: string;
}

export function runForensicsInvestigation(options: RunForensicsInvestigationOptions = {}): ForensicsRun {
  const source = new SyntheticSource({ seed: 42 });
  const dataset = source.loadSettlementRun();
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

  const decisions = dataset.deductionLines.map((line) => {
    const evidenceDocuments = retrieveEvidenceDocuments(line, trace);
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
      producedBy: "agent:forensics-investigator",
      modelId: runtimeModels.reasoning
    }) as DeductionDecision;
    registerDecision(decision);
    trace.push({
      type: "verdict",
      payload: {
        lineId: decision.lineId,
        verdict: decision.verdict,
        routing: decision.routing
      }
    });

    return decision;
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

  return {
    decisions,
    actions,
    recoveryDecisions: decisions.map((decision) => ({
      lineId: decision.lineId,
      pursueRecovery: decision.routing === "recovery"
    })),
    openDependencies: [
      "decision-confidence-threshold",
      "run-control-token-budget",
      "run-control-step-budget",
      "run-control-retry-cap"
    ],
    agentBoundary: s4AgentBoundary,
    trace
  };
}

function retrieveEvidenceDocuments(line: DeductionLine, trace: ForensicsTraceEvent[]): EvidenceDocument[] {
  return [
    ...(invokeTracedTool(trace, "retrieval.sap", line) as EvidenceDocument[]),
    ...(invokeTracedTool(trace, "retrieval.docs", line) as EvidenceDocument[]),
    ...(invokeTracedTool(trace, "retrieval.tpm", line) as EvidenceDocument[])
  ];
}

function invokeTracedTool(trace: ForensicsTraceEvent[], toolName: ServiceToolName, input: unknown): unknown {
  trace.push({
    type: "status",
    payload: {
      kind: "service-tool",
      toolName
    }
  });

  return invokeServiceTool(toolName, input);
}

function buildRuleInput(line: DeductionLine, ruleId: RuleId): RuleInput {
  const base = {
    lineId: line.lineId,
    period: line.period,
    recordIds: line.recordIds,
    claimedAmount: line.amount
  };

  switch (ruleId) {
    case "damage-evidence-valid":
      return {
        ...base,
        ruleId,
        damagedGoodsAmount: line.amount,
        salvageCreditAmount: money("0.00"),
        photoEvidenceReceived: true,
        carrierReportReceived: true
      };
    case "promo-not-captured":
      return {
        ...base,
        ruleId,
        approvedPromoAccrual: line.amount,
        capturedPromoCredit: money("0.00"),
        approvedPromoExists: true,
        invoiceBilledAtList: true
      };
    case "shortage-pod-mismatch":
      return {
        ...base,
        ruleId,
        allowedShortageAmount: money("0.00"),
        claimedShortage: true,
        podSignedFullDelivery: true
      };
    case "otif-fine-valid":
      return {
        ...base,
        ruleId,
        allowedFineAmount: line.amount,
        contractSlaAllowsFine: true,
        slaBreachConfirmed: true
      };
    case "otif-timestamp-mismatch":
      return {
        ...base,
        ruleId,
        allowedFineAmount: money("0.00"),
        otifFineAssessed: true,
        podTimestampOnTime: true
      };
    case "pricing-below-contract":
      return {
        ...base,
        ruleId,
        contractedUnitPrice: line.amount,
        deliveredQuantity: "1",
        actualPaidAmount: money("0.00"),
        deductedBelowContractPrice: true,
        contractPriceAvailable: true
      };
    case "promo-overclaim":
      return {
        ...base,
        ruleId,
        claimedAllowance: line.amount,
        approvedAccrual: money("0.00"),
        approvedAccrualExceeded: true
      };
    case "duplicate-credit":
      return {
        ...base,
        ruleId,
        priorCreditAmount: line.amount,
        alreadyCredited: true
      };
  }
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
