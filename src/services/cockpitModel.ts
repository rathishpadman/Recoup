import {
  buildConnectorReadiness,
  type ConnectorReadiness,
  type SupabaseToolDataSchemaProbe
} from "../adapters/connectorRegistry.js";
import { buildSyntheticDataset } from "../adapters/syntheticData.js";
import { recoupAgentRoster } from "../agents/agentRuntime.js";
import { runForensicsInvestigation, type ForensicsTraceEvent } from "../agents/forensics.js";
import { recoupHandoffGraph } from "../agents/handoffGraph.js";
import { runRiskMeshClosedLoop } from "../agents/riskMesh.js";
import { memoryCategories, type MemoryCategory, type MemoryRecord } from "../memory/schema.js";
import type { Money } from "../types/money.js";

export type ApprovalAction = "approve" | "modify" | "reject";
export type ForensicsSseEvent = ForensicsTraceEvent;

export interface ForensicsCockpitModel {
  surface: "forensics-analyst";
  worklist: WorklistItem[];
  selected: {
    lineId: string;
    evidencePack: {
      recordIds: string[];
      documents: Array<{ documentId: string; documentType: string; summary: string }>;
    };
    draft: {
      actionId: string;
      actionType: string;
      status: "pending_human";
      amount: string;
      basis: string;
    };
    approvalActions: ApprovalAction[];
  };
  actionInbox: Array<{
    actionId: string;
    actionType: string;
    lineId: string;
    amount: string;
    status: "pending_human";
    basis: string;
  }>;
  recoveryTracker: {
    totalExposure: string;
    projectedRecovery: string;
    projectedBilling: string;
    recoveryLines: number;
    billingLines: number;
  };
  retrievalStatus: Array<{ source: string; status: "ready"; count: number }>;
  whatChanged: string;
  aiInsight: string;
}

export interface WorklistItem {
  lineId: string;
  customerId: string;
  scenarioId: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  routing: string;
  confidence: string;
}

export interface CreditCockpitModel {
  surface: "credit-arbitration";
  customerId: string;
  sentinel: {
    status: string;
    reason: string;
    recordIds: string[];
  };
  arbitration: {
    status: string;
    reason: string;
    recordIds: string[];
  };
  partialHold: {
    compositeScore: string;
    releaseRatioPercent: string;
    proposedReleaseAmount: string;
    proposedBackOrderAmount: string;
    basis: string;
  };
  termProposal: {
    terms: string;
    status: "pending_human";
    basis: string;
  };
  approvalInbox: Array<{
    actionId: string;
    actionType: "propose-hold" | "propose-terms";
    status: "pending_human";
    basis: string;
  }>;
  audit: {
    entries: number;
    valid: boolean;
  };
}

export interface CfoSummaryCockpitModel {
  surface: "cfo-summary";
  metrics: Array<{ label: string; value: string }>;
  whatChanged: string;
  aiInsight: string;
  openDependencies: string[];
}

export interface TraceCockpitModel {
  surface: "trace";
  events: Array<{
    id: string;
    label: string;
    kind: "tool" | "handoff" | "audit" | "permission";
    status: string;
    recordIds: string[];
    deterministicBasis: string;
  }>;
}

export interface MemorySummaryCockpitModel {
  surface: "memory";
  categories: MemoryCategory[];
  records: Array<{
    id: string;
    category: MemoryCategory;
    trustLevel: "trusted" | "semi_trusted" | "untrusted";
    scope: string;
    recordIds: string[];
  }>;
}

export interface AgentGraphCockpitModel {
  surface: "agents";
  agents: Array<{
    name: string;
    capability: string;
    modelExecution: string;
  }>;
  edges: typeof recoupHandoffGraph;
}

export interface ConnectorReadinessCockpitModel {
  surface: "connector-readiness";
  connectors: ConnectorReadiness[];
}

export function buildForensicsCockpitModel(): ForensicsCockpitModel {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const run = runForensicsInvestigation();
  const selectedDecision = run.decisions.find((decision) => decision.routing === "recovery");
  if (selectedDecision === undefined) {
    throw new Error("Forensics cockpit requires at least one recovery decision.");
  }

  const selectedAction = run.actions.find((action) => action.lineId === selectedDecision.lineId);
  if (selectedAction === undefined) {
    throw new Error(`Missing action for selected line ${selectedDecision.lineId}.`);
  }

  return {
    surface: "forensics-analyst",
    worklist: run.decisions.slice(0, 8).map((decision) => {
      const line = dataset.deductionLines.find((candidate) => candidate.lineId === decision.lineId);
      if (line === undefined) {
        throw new Error(`Missing line ${decision.lineId}.`);
      }

      return {
        lineId: decision.lineId,
        customerId: line.customerId,
        scenarioId: line.scenarioId,
        scenarioType: line.scenarioType,
        amount: formatMoney(line.amount),
        verdict: decision.verdict,
        routing: decision.routing,
        confidence: decision.confidence
      };
    }),
    selected: {
      lineId: selectedDecision.lineId,
      evidencePack: {
        recordIds: selectedDecision.recordIds,
        documents: selectedDecision.evidenceDocuments.map((document) => ({
          documentId: document.documentId,
          documentType: document.documentType,
          summary: document.summary
        }))
      },
      draft: {
        actionId: selectedAction.actionId,
        actionType: selectedAction.actionType,
        status: selectedAction.status,
        amount: formatMoney(selectedAction.proposedAmount),
        basis: selectedAction.basis
      },
      approvalActions: ["approve", "modify", "reject"]
    },
    actionInbox: run.actions.map((action) => ({
      actionId: action.actionId,
      actionType: action.actionType,
      lineId: action.lineId,
      amount: formatMoney(action.proposedAmount),
      status: action.status,
      basis: action.basis
    })),
    recoveryTracker: {
      totalExposure: formatMoney(dataset.rollup.totalAmount),
      projectedRecovery: formatMoney(dataset.rollup.recoveryAmount),
      projectedBilling: formatMoney(dataset.rollup.validAmount),
      recoveryLines: dataset.rollup.recoveryLines,
      billingLines: dataset.rollup.validLines
    },
    retrievalStatus: [
      { source: "SAP", status: "ready", count: run.trace.filter((event) => event.type === "status" && event.payload.toolName === "retrieval.sap").length },
      { source: "Docs", status: "ready", count: run.trace.filter((event) => event.type === "status" && event.payload.toolName === "retrieval.docs").length },
      { source: "TPM", status: "ready", count: run.trace.filter((event) => event.type === "status" && event.payload.toolName === "retrieval.tpm").length }
    ],
    whatChanged: "13 recovery drafts and 7 Billing prevention drafts are staged for human review.",
    aiInsight: "Every proposed amount is bound to a deterministic decision delta; live model execution remains blocked in the offline harness."
  };
}

export function buildCreditCockpitModel(): CreditCockpitModel {
  const run = runRiskMeshClosedLoop();

  return {
    surface: "credit-arbitration",
    customerId: run.customerId,
    sentinel: {
      status: run.sentinel.status,
      reason: run.sentinel.reason,
      recordIds: run.sentinel.recordIds
    },
    arbitration: {
      status: run.arbitration.status,
      reason: run.arbitration.reason,
      recordIds: run.arbitration.recordIds
    },
    partialHold: {
      compositeScore: run.partialHold.compositeScore.toFixed(2),
      releaseRatioPercent: `${run.partialHold.releaseRatioPercent.toFixed(0)}%`,
      proposedReleaseAmount: formatMoney(run.holdAction.proposedReleaseAmount),
      proposedBackOrderAmount: formatMoney(run.holdAction.proposedBackOrderAmount),
      basis: run.holdAction.basis
    },
    termProposal: {
      terms: run.termsAction.terms,
      status: run.termsAction.status,
      basis: run.termsAction.basis
    },
    approvalInbox: [
      {
        actionId: run.holdAction.actionId,
        actionType: run.holdAction.actionType,
        status: run.holdAction.status,
        basis: run.holdAction.basis
      },
      {
        actionId: run.termsAction.actionId,
        actionType: run.termsAction.actionType,
        status: run.termsAction.status,
        basis: run.termsAction.basis
      }
    ],
    audit: {
      entries: run.auditEntries.length,
      valid: run.auditTrailValid
    }
  };
}

export function buildCfoSummaryCockpitModel(): CfoSummaryCockpitModel {
  const dataset = buildSyntheticDataset({ seed: 42 });

  return {
    surface: "cfo-summary",
    metrics: [
      { label: "Gross-to-net", value: `${formatMoney(dataset.rollup.totalAmount)} gross scope` },
      { label: "Margin protected", value: `${formatMoney(dataset.rollup.validAmount)} draft-only` },
      { label: "DSO / CEI", value: "requires live ERP inputs" },
      { label: "Leakage position", value: `${formatMoney(dataset.rollup.recoveryAmount)} recovery queue` }
    ],
    whatChanged: "Forensics, Risk Mesh, Sentinel, and Containment now land in governed human-review queues.",
    aiInsight: "Recoup demonstrates a deterministic evidence spine with live model execution blocked until runtime policy and credentials are approved.",
    openDependencies: [
      "verify-prod-calibration",
      "verify-runtime-config-loader",
      "verify-embeddings-model-id",
      "verify-codex-build-model-id",
      "verify-sap-sandbox-instance",
      "verify-v3-live-non-sap-contracts"
    ]
  };
}

export function buildForensicsSseEvents(): ForensicsSseEvent[] {
  const run = runForensicsInvestigation();

  return run.trace;
}

export function buildTraceModel(): TraceCockpitModel {
  const riskRun = runRiskMeshClosedLoop();

  return {
    surface: "trace",
    events: [
      {
        id: "trace-riskmesh-harbor",
        label: "Risk Mesh arbitration staged",
        kind: "audit",
        status: riskRun.arbitration.status,
        recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K", "LEDGER-6-PARTIAL-HOLD"],
        deterministicBasis: "audit.read + core.riskMeshClosedLoop"
      },
      {
        id: "trace-forensics-recovery",
        label: "Forensics recovery handoff staged",
        kind: "handoff",
        status: "pending_human",
        recordIds: ["SYNTHETIC-SEED-42"],
        deterministicBasis: "runForensicsInvestigation trace + Recovery Drafter handoff"
      },
      {
        id: "trace-mcp-public-tools",
        label: "MCP facade exposes public read and draft tools only",
        kind: "permission",
        status: "filtered",
        recordIds: ["MCP-TOOL-FACADE"],
        deterministicBasis: "serviceToolMetadata visibility"
      }
    ]
  };
}

export function buildMemorySummaryModel(records?: MemoryRecord[]): MemorySummaryCockpitModel {
  if (records !== undefined) {
    return {
      surface: "memory",
      categories: [...memoryCategories],
      records: records.map((record) => ({
        id: record.id,
        category: record.category,
        trustLevel: record.trustLevel,
        scope: record.scope,
        recordIds: record.recordIds
      }))
    };
  }

  return {
    surface: "memory",
    categories: [...memoryCategories],
    records: [
      {
        id: "memory-session-active-case",
        category: "session_state",
        trustLevel: "trusted",
        scope: "session:demo",
        recordIds: ["ARB-HARBOR-ORDER-640K"]
      },
      {
        id: "memory-approval-harbor",
        category: "approval_records",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        recordIds: ["ORDER-HARBOR-640K", "propose-hold:ORDER-HARBOR-640K"]
      },
      {
        id: "memory-handoff-riskmesh-sentinel",
        category: "agent_handoff_packets",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K"]
      },
      {
        id: "memory-compaction-demo",
        category: "compaction_summaries",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        recordIds: ["ARB-HARBOR-ORDER-640K"]
      }
    ]
  };
}

export function buildAgentGraphModel(): AgentGraphCockpitModel {
  return {
    surface: "agents",
    agents: recoupAgentRoster.map((agent) => ({
      name: agent.name,
      capability: agent.capability,
      modelExecution: agent.modelExecution
    })),
    edges: recoupHandoffGraph
  };
}

export function buildConnectorReadinessModel(
  availableCredentialEnvNames: readonly string[] = [],
  toolDataSchemaProbe?: SupabaseToolDataSchemaProbe
): ConnectorReadinessCockpitModel {
  return {
    surface: "connector-readiness",
    connectors: buildConnectorReadiness([], availableCredentialEnvNames, toolDataSchemaProbe)
  };
}

function formatMoney(value: Money): string {
  const fixed = value.toDecimalPlaces(2).toFixed(2);
  const [whole = "0", fractional = "00"] = fixed.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `$${groupedWhole}.${fractional}`;
}
