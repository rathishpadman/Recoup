import { createHash } from "node:crypto";
import type { GovernedConfigValues } from "../../config/governed.js";
import type { AuditEntry } from "../audit/trail.js";
import {
  buildConnectorReadiness,
  type ConnectorReadiness,
  type SupabaseToolDataSchemaProbe
} from "../adapters/connectorRegistry.js";
import type { SourceHealthResult } from "./sourceHealth.js";
import type { SourcePort } from "../adapters/source.js";
import { recoupAgentRoster } from "../agents/agentRuntime.js";
import { assessCrestlineM6Containment, type CrestlineM6ContainmentAssessment } from "../agents/containment.js";
import { runForensicsInvestigation, type DeductionDecision, type ForensicsTraceEvent } from "../agents/forensics.js";
import { recoupHandoffGraph } from "../agents/handoffGraph.js";
import { buildHarborRiskMeshProposalContext, runRiskMeshClosedLoop } from "../agents/riskMesh.js";
import { serviceToolMetadata, type ServiceInvocationContext } from "./serviceLayer.js";
import { memoryCategories, type MemoryCategory, type MemoryRecord } from "../memory/schema.js";
import type { DeductionLine, SyntheticDatasetCore } from "../types/entities.js";
import { money, type Money } from "../types/money.js";
import { buildCockpitDemoLoginPersonas } from "../../config/cockpitDemoProfiles.js";
import { assertBusinessProvenance, type MayaFieldProvenance } from "./mayaDataProvenance.js";
import type { McpReadinessStatus } from "./mcpHealth.js";

export type ApprovalAction = "approve" | "modify" | "reject";
export type ApprovalLifecycleStatus = "pending_human" | "human_decided";
export type ForensicsSseEvent = ForensicsTraceEvent;

export interface CockpitModelGovernanceOptions {
  approvalRecordSource?: ApprovalRecordSourceMetadata | undefined;
  approvalRecords?: readonly MemoryRecord[] | undefined;
  governedConfig: GovernedConfigValues;
  riskObservationSource?: SourcePort | undefined;
  serviceContext?: ServiceInvocationContext | undefined;
  settlementSource?: SourcePort | undefined;
}

export interface ApprovalRecordSourceMetadata {
  sourceKind: "derived_backend" | "supabase";
  sourceName: string;
}

interface SettlementDataset extends SyntheticDatasetCore {
  manifest: {
    eventIds: string[];
    lineIds: string[];
    scenarioIds: Array<DeductionLine["scenarioId"]>;
    seed: 42;
  };
  rollup: {
    billingLines: number;
    recoveryAmount: Money;
    recoveryLines: number;
    totalAmount: Money;
    totalLines: number;
    validAmount: Money;
    validLines: number;
  };
  zeroMoney: Money;
}

export interface LoginCockpitModel {
  surface: "login";
  personas: Array<{
    allowedRouteCount: number;
    allowedRoutes: string[];
    defaultRoute: string;
    displayName: string;
    loginId: string;
    persona: string;
    provenance: "deterministic_demo_profile";
    role: string;
    sourceMode: "deterministic_demo_profile";
    workspace: string;
  }>;
}

export interface ApprovalEligibilityCockpitModel {
  available: boolean;
  provenance: MayaFieldProvenance;
  statusLabel: string;
}

export interface ForensicsCockpitModel {
  surface: "forensics-analyst";
  kpiStrip: Array<{
    label: string;
    provenance: MayaFieldProvenance;
    support: string;
    value: string;
  }>;
  worklist: WorklistItem[];
  selected: {
    lineId: string;
    approvalEligibility: ApprovalEligibilityCockpitModel;
    evidencePack: {
      provenance: MayaFieldProvenance;
      recordIds: string[];
      documents: Array<{
        citationId: string;
        description: string;
        documentId: string;
        documentType: string;
        provenance: MayaFieldProvenance;
        relevance: string;
        sourceLabel: string;
        summary: string;
        verifiedLabel: string;
      }>;
    };
    draft: {
      actionId: string;
      actionLabel: string;
      actionType: string;
      status: "pending_human";
      statusLabel: string;
      amount: string;
      basis: string;
      approvalEligibility: ApprovalEligibilityCockpitModel;
      provenance: MayaFieldProvenance;
    };
    approvalActions: Array<{
      decision: ApprovalAction;
      label: string;
      provenance: MayaFieldProvenance;
      requiresReason: boolean;
    }>;
  };
  actionInbox: Array<{
    actionId: string;
    actionLabel: string;
    actionType: string;
    lineId: string;
    amount: string;
    status: "pending_human";
    statusLabel: string;
    basis: string;
    provenance: MayaFieldProvenance;
  }>;
  multimodalDock: {
    languageLabel: string;
    modeOptions: string[];
    policyLabel: string;
    promptPlaceholder: string;
    promptSuggestions: Array<{
      label: string;
      provenance: MayaFieldProvenance;
      question: string;
      recordIds: string[];
    }>;
    transcript: {
      english: string;
      native: string;
    };
    provenance: MayaFieldProvenance;
    subAgents: Array<{
      artifacts: string;
      keyArtifact: string;
      name: string;
      provenance: MayaFieldProvenance;
      query: string;
      source: string;
      statusLabel: string;
    }>;
  };
  mayaJourney: Array<{
    label: string;
    provenance: MayaFieldProvenance;
    recordIds: string[];
    status: string;
    timestamp: string;
  }>;
  recoveryTracker: {
    totalExposure: string;
    projectedRecovery: string;
    projectedBilling: string;
    recoveryLines: number;
    billingLines: number;
    provenance: MayaFieldProvenance;
  };
  retrievalStatus: Array<{ source: string; status: "ready"; count: number; provenance: MayaFieldProvenance }>;
  containmentPanel: {
    actionPostureLabel: string;
    behavioralEvidenceIds: string[];
    basisRows: Array<{ label: string; value: string; provenance: MayaFieldProvenance }>;
    componentReadoutLabel: string;
    customerId: string;
    customerLabel: string;
    handoff: {
      label: string;
      recordIds: string[];
      status: string;
      target: string;
      provenance: MayaFieldProvenance;
    };
    intentLabel: string;
    postureLabel: string;
    provenance: MayaFieldProvenance;
    recordIds: string[];
    recordStripLabel: string;
    statusLabel: string;
  };
  whatChanged: string;
  aiInsight: string;
}

export interface ForensicsWorkItemDetailCockpitModel {
  surface: "forensics-work-item-detail";
  lineId: string;
  workItem: WorklistItem;
  selected: ForensicsCockpitModel["selected"];
  recommendedAction: ForensicsCockpitModel["actionInbox"][number];
  recoveryDraft: ForensicsCockpitModel["selected"]["draft"];
  approvalState: {
    actions: ForensicsCockpitModel["selected"]["approvalActions"];
    provenance: MayaFieldProvenance;
    status: ApprovalLifecycleStatus;
    statusLabel: string;
  };
  auditState: {
    provenance: MayaFieldProvenance;
    recordIds: string[];
    status: ApprovalLifecycleStatus;
    statusLabel: string;
  };
  approvalReceipt?: ApprovalAuditReceipt;
  actionInbox: ForensicsCockpitModel["actionInbox"];
  multimodalDock: ForensicsCockpitModel["multimodalDock"];
  mayaJourney: ForensicsCockpitModel["mayaJourney"];
  retrievalStatus: ForensicsCockpitModel["retrievalStatus"];
}

export class ForensicsWorkItemNotFoundError extends Error {
  readonly lineId: string;

  constructor(lineId: string) {
    super(`Forensics work item not found: ${lineId}.`);
    this.name = "ForensicsWorkItemNotFoundError";
    this.lineId = lineId;
  }
}

export interface WorklistItem {
  lineId: string;
  lineCount: number;
  lineIds: string[];
  customerId: string;
  customerLabel: string;
  scenarioId: string;
  scenarioLabel: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  verdictLabel: string;
  routing: string;
  routingLabel: string;
  recommendedActionLabel: string;
  confidence: string;
  confidenceLabel: string;
  evidenceScoreLabel: string;
  evidenceLabel: string;
  provenance: MayaFieldProvenance;
  approvalStatus: ApprovalLifecycleStatus;
  approvalStatusLabel: string;
  queueLabel: string;
}

export type CreditCommandTone = "blocked" | "healthy" | "pending" | "warning";

export interface CreditCommandCenterModel {
  statusRail: Array<{
    detail: string;
    label: string;
    tone: CreditCommandTone;
    value: string;
  }>;
  stats: Array<{
    label: string;
    note: string;
    tone: CreditCommandTone;
    unit?: string;
    value: string;
  }>;
  exposureRows: Array<{
    action: string;
    exposure: string;
    portfolio: string;
    signal: string;
    state: string;
    tone: CreditCommandTone;
  }>;
  feedRows: Array<{
    detail: string;
    event: string;
    state: string;
    time: string;
    tone: CreditCommandTone;
  }>;
  signalRows: Array<{
    detail: string;
    label: string;
    score: string;
    tone: CreditCommandTone;
  }>;
  auditRows: Array<{
    label: string;
    state: string;
    value: string;
  }>;
  marketTape: Array<{
    label: string;
    tone: CreditCommandTone;
    value: string;
  }>;
}

export interface CreditCockpitModel {
  surface: "credit-arbitration";
  customerId: string;
  readoutStatusLabels: string[];
  account: {
    availableCreditLabel: string;
    caseId: string;
    creditProgram: string;
    customerLabel: string;
    detailRows: Array<{ label: string; value: string }>;
    dso90Label: string;
    hqRegion: string;
    industry: string;
    legalEntity: string;
    limitLabel: string;
    openArLabel: string;
    orderAmount: string;
    orderId: string;
    ownerLabel: string;
    posture: string;
    summaryRows: Array<{ label: string; value: string }>;
    terms: string;
  };
  sentinel: {
    status: string;
    reason: string;
    displayReason: string;
    alertDetail: string;
    filedLabel: string;
    filingId: string;
    detailRows: Array<{ label: string; value: string }>;
    recordStripLabel: string;
    securedPartyLabel: string;
    recordIds: string[];
    signals: Array<{ label: string; value: string }>;
  };
  arbitration: {
    status: string;
    reason: string;
    displayReason: string;
    recordIds: string[];
  };
  partialHold: {
    compositeScore: string;
    releaseRatioPercent: string;
    proposedReleaseAmount: string;
    proposedBackOrderAmount: string;
    basis: string;
    scoreReadout: {
      ariaLabel: string;
      basisLabel: string;
      label: string;
      summaryLabel: string;
      stateLabel: string;
      value: string;
    };
    releaseReadout: {
      ariaLabel: string;
      label: string;
      supportLabel: string;
      value: string;
    };
    splitRows: Array<{ label: string; value: string }>;
    ledgerRows: Array<{
      left: { label: string; value: string };
      right: { label: string; value: string };
    }>;
    criteriaAriaLabel: string;
    criteriaHeaders: string[];
    criteria: Array<{
      contribution: string;
      label: string;
      score: string;
      weight: string;
    }>;
  };
  termProposal: {
    terms: string;
    status: "pending_human";
    statusLabel: string;
    basis: string;
    commandLabels: string[];
    gateSummaryLabel: string;
    packetRows: Array<{ label: string; value: string }>;
    readyStateLabel: string;
    summaryLabel: string;
  };
  approvalInbox: Array<{
    actionId: string;
    actionType: "propose-hold" | "propose-terms";
    actionLabel: string;
    status: "pending_human";
    statusLabel: string;
    basis: string;
    recordIds: string[];
    recordStripLabel: string;
  }>;
  commandCenter: CreditCommandCenterModel;
  actionQueue: Array<{
    account: string;
    age: string;
    item: string;
    nextStep: string;
    priority: string;
    status: string;
  }>;
  actionQueueSummaryLabel: string;
  audit: {
    arbitrationHash: string;
    chainHeadHash: string;
    entries: number;
    entryHashes: string[];
    valid: boolean;
  };
  negotiation: {
    provenance: "deterministic_read_model";
    nodes: Array<{
      functionName: string;
      displayName: string;
      position: string;
      weight: string;
      confidenceBand: string;
      recordIds: string[];
    }>;
    timeline: Array<{
      message: string;
      recordIds: string[];
    }>;
  };
}

export interface CfoSummaryCockpitModel {
  surface: "cfo-summary";
  metrics: Array<{ label: string; value: string }>;
  readoutStatusLabels: string[];
  boardMetrics: Array<{
    label: string;
    support: string;
    supportLabel: string;
    value: string;
  }>;
  reportMetadata: Array<{
    label: string;
    value: string;
    valueLabel: string;
  }>;
  auditPosture: {
    summary: {
      status: string;
      support: string;
      supportLabel: string;
    };
    controls: Array<{
      label: string;
      support: string;
      supportLabel: string;
      value: string;
    }>;
    evidenceRows: Array<{
      basis: string;
      basisLabel: string;
      label: string;
      recordCountLabel: string;
      recordIds: string[];
      state: string;
    }>;
    recordCountLabel: string;
    recordIds: string[];
  };
  dependencies: Array<{
    dependencyId: string;
    impact: string;
    label: string;
    owner: string;
    status: string;
    timing: string;
  }>;
  changeLedger: Array<{
    label: string;
    posture: string;
    postureLabel: string;
    support: string;
    supportLabel: string;
    value: string;
  }>;
  insightReadout: {
    basis: string;
    basisLabel: string;
    posture: string;
    title: string;
  };
  provenance: {
    actionPosture: string;
    auditHash: string;
    dataBasis: string;
    dataBasisLabel: string;
    datasetHash: string;
    reportHash: string;
    sourceSystems: string[];
    sourceSystemCountLabel: string;
    source: "deterministic_read_model";
    sourceLabel: string;
  };
  assurance: {
    basis: string;
    label: string;
    recordIds: string[];
    statusLabel: string;
  };
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
    provenance: "deterministic_read_model" | "deterministic_demo_audit" | "precomputed_demo";
    recordIds: string[];
    deterministicBasis: string;
    entryType: string;
    entryHash: string;
    previousHash: string;
    sequence: number;
    sourceMode: "deterministic_demo_audit";
  }>;
}

export interface MemorySummaryCockpitModel {
  surface: "memory";
  backend: "in_memory_fallback" | "sqlite" | "supabase";
  categories: MemoryCategory[];
  provenance: "empty_runtime_memory" | "persisted_runtime_memory";
  approvalAuditReceipts: ApprovalAuditReceipt[];
  records: Array<{
    id: string;
    category: MemoryCategory;
    trustLevel: "trusted" | "semi_trusted" | "untrusted";
    scope: string;
    recordIds: string[];
  }>;
  sourceMode: "runtime_empty" | "runtime_persisted";
}

export interface ApprovalAuditReceipt {
  actionId: string;
  approverId: string;
  auditEntryHash: string;
  decision: ApprovalAction;
  reason?: string;
  recordIds: string[];
  status: "human_decided";
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
  checkedAtIso: string;
  connectors: ConnectorReadiness[];
  lastRefreshedLabel: string;
  provenance: MayaFieldProvenance;
  sourceHealth: SourceHealthResult[];
  sourceTiles: SourceReadinessTile[];
}

export interface SourceReadinessTile {
  checkedAtIso: string;
  detail: string;
  key: string;
  label: string;
  mark: string;
  modeLabel: string;
  proofItems: string[];
  provenance: MayaFieldProvenance;
  stateLabel: string;
  statusTone: "ready" | "synthetic" | "blocked";
  summary: string;
}

export function buildForensicsCockpitModel(options: CockpitModelGovernanceOptions | undefined): ForensicsCockpitModel {
  const governedConfig = readGovernedCockpitConfig(options);
  const settlementSource = readSettlementSource(options);
  const serviceContext = readForensicsServiceContext(options);
  const approvalRecordSource = readApprovalRecordSource(options);
  const dataset = buildSettlementDataset(settlementSource);
  const run = runForensicsInvestigation({ governedConfig, serviceContext, source: settlementSource });
  const containmentCandidate = run.containmentCandidates[0];
  if (containmentCandidate === undefined) {
    throw new Error("Forensics cockpit requires a governed containment review candidate.");
  }
  const selectedDecision = run.decisions.find((decision) => decision.routing === "recovery");
  if (selectedDecision === undefined) {
    throw new Error("Forensics cockpit requires at least one recovery decision.");
  }

  const selectedAction = run.actions.find((action) => action.lineId === selectedDecision.lineId);
  if (selectedAction === undefined) {
    throw new Error(`Missing action for selected line ${selectedDecision.lineId}.`);
  }
  const settlementRecordIds = dataset.manifest.lineIds;
  const recoveryRecordIds = dataset.deductionLines.filter((line) => line.routing === "recovery").map((line) => line.lineId);
  const billingRecordIds = dataset.deductionLines.filter((line) => line.routing === "billing").map((line) => line.lineId);
  const actionRecordIds = uniqueStrings(run.actions.flatMap((action) => action.recordIds));
  const retrievalStatus = buildRetrievalStatusRows(selectedDecision.evidenceDocuments);
  const evidenceSourceRecordIds = uniqueStrings(
    selectedDecision.evidenceDocuments.flatMap((document) => document.recordIds)
  );

  return {
    surface: "forensics-analyst",
    kpiStrip: [
      {
        label: "Open scenarios",
        value: String(dataset.manifest.scenarioIds.length),
        support: `${String(dataset.rollup.totalLines)} lines collapsed`,
        provenance: businessProvenance("kpiStrip.openScenarios", {
          sourceKind: "derived_backend",
          sourceName: "Settlement rollup read model",
          recordIds: settlementRecordIds,
          deterministicBasis: "unique scenarioId count from buildSettlementDataset settlement source rows"
        })
      },
      {
        label: "Exposure",
        value: formatMoney(dataset.rollup.totalAmount),
        support: "USD",
        provenance: businessProvenance("kpiStrip.exposure", {
          sourceKind: "derived_backend",
          sourceName: "Settlement rollup read model",
          recordIds: settlementRecordIds,
          deterministicBasis: "sum of Supabase settlement source deduction line amounts in buildSettlementDataset"
        })
      },
      {
        label: "Recovery queue",
        value: formatMoney(dataset.rollup.recoveryAmount),
        support: `${String(dataset.rollup.recoveryLines)} drafts`,
        provenance: businessProvenance("kpiStrip.recoveryQueue", {
          sourceKind: "derived_backend",
          sourceName: "Forensics recovery action read model",
          recordIds: recoveryRecordIds,
          deterministicBasis: "sum of source lines routed recovery by runForensicsInvestigation decisions"
        })
      },
      {
        label: "Billing protection",
        value: formatMoney(dataset.rollup.validAmount),
        support: `${String(dataset.rollup.validLines)} route-to-Billing drafts`,
        provenance: businessProvenance("kpiStrip.billingProtection", {
          sourceKind: "derived_backend",
          sourceName: "Forensics Billing prevention read model",
          recordIds: billingRecordIds,
          deterministicBasis: "sum of source lines routed billing by runForensicsInvestigation decisions"
        })
      },
      {
        label: "Pending decisions",
        value: String(run.actions.length),
        support: "HITL required",
        provenance: businessProvenance("kpiStrip.pendingDecisions", {
          sourceKind: "derived_backend",
          sourceName: "HITL action queue read model",
          recordIds: actionRecordIds,
          deterministicBasis: "runForensicsInvestigation actions filtered to pending_human draft actions"
        })
      },
      {
        label: "Evidence sources",
        value: String(retrievalStatus.length),
        support: retrievalStatus.map((row) => row.source).join(", "),
        provenance: businessProvenance("kpiStrip.evidenceSources", {
          sourceKind: "derived_backend",
          sourceName: "Selected evidence source rollup",
          recordIds: evidenceSourceRecordIds,
          deterministicBasis: "unique source labels from selected decision evidenceDocuments returned by runForensicsInvestigation"
        })
      }
    ],
    worklist: buildScenarioWorklist(dataset, run.decisions, run.actions, options?.approvalRecords),
    selected: buildSelectedForensicsCase(
      selectedDecision,
      selectedAction,
      findApprovalReceipt(options?.approvalRecords ?? [], selectedAction.actionId),
      approvalRecordSource
    ),
    actionInbox: buildForensicsActionInbox(run.actions),
    multimodalDock: {
      languageLabel: "Spanish ready",
      modeOptions: ["Type", "Talk"],
      policyLabel: "voice/text citation parity",
      promptPlaceholder: "Ask why this deduction is invalid, with cited evidence only.",
      promptSuggestions: buildQueryPromptSuggestions(selectedDecision, run.trace),
      transcript: {
        native: "¿Por qué es inválida esta deducción?",
        english: "Why is this deduction invalid? Answer from the cited POD and invoice records only."
      },
      provenance: businessProvenance("multimodalDock", {
        sourceKind: "agent_trace",
        sourceName: "Forensics trace context read model",
        recordIds: selectedDecision.recordIds,
        deterministicBasis: "runForensicsInvestigation trace rows grouped for cited voice/text query context"
      }),
      subAgents: buildTraceContextRows(selectedDecision, run.trace)
    },
    mayaJourney: [
      {
        label: "Ingest",
        recordIds: dataset.deductionLines.slice(0, 3).map((line) => line.lineId),
        status: "complete",
        timestamp: journeyStepLabel(0, 6),
        provenance: journeyProvenance(
          "Ingest",
          dataset.deductionLines.slice(0, 3).map((line) => line.lineId),
          "settlement source ingestion order"
        )
      },
      {
        label: "POD retrieval",
        recordIds: selectedDecision.recordIds.filter((recordId) => recordId.startsWith("POD-")),
        status: "complete",
        timestamp: journeyStepLabel(1, 6),
        provenance: journeyProvenance(
          "POD retrieval",
          selectedDecision.recordIds.filter((recordId) => recordId.startsWith("POD-")),
          "retrieval.docs evidence document records",
          selectedDecision.recordIds
        )
      },
      {
        label: "Contract read",
        recordIds: selectedDecision.recordIds.filter((recordId) => recordId.startsWith("INV-")),
        status: "complete",
        timestamp: journeyStepLabel(2, 6),
        provenance: journeyProvenance(
          "Contract read",
          selectedDecision.recordIds.filter((recordId) => recordId.startsWith("INV-")),
          "SAP invoice and contract evidence records",
          selectedDecision.recordIds
        )
      },
      {
        label: "TPM match",
        recordIds: selectedDecision.evidenceDocuments
          .filter((document) => document.source === "tpm")
          .map((document) => document.documentId),
        status: "complete",
        timestamp: journeyStepLabel(3, 6),
        provenance: journeyProvenance(
          "TPM match",
          selectedDecision.evidenceDocuments
            .filter((document) => document.source === "tpm")
            .map((document) => document.documentId),
          "retrieval.tpm evidence document records",
          selectedDecision.recordIds
        )
      },
      {
        label: "Assemble",
        recordIds: selectedDecision.recordIds,
        status: "complete",
        timestamp: journeyStepLabel(4, 6),
        provenance: journeyProvenance("Assemble", selectedDecision.recordIds, "selected decision evidence pack assembly")
      },
      {
        label: "Scored",
        recordIds: selectedDecision.recordIds,
        status: "pending human",
        timestamp: journeyStepLabel(5, 6),
        provenance: journeyProvenance("Scored", selectedDecision.recordIds, "deduction verdict and routing decision basis")
      }
    ],
    recoveryTracker: {
      totalExposure: formatMoney(dataset.rollup.totalAmount),
      projectedRecovery: formatMoney(dataset.rollup.recoveryAmount),
      projectedBilling: formatMoney(dataset.rollup.validAmount),
      recoveryLines: dataset.rollup.recoveryLines,
      billingLines: dataset.rollup.validLines,
      provenance: businessProvenance("recoveryTracker", {
        sourceKind: "derived_backend",
        sourceName: "Settlement recovery rollup read model",
        recordIds: settlementRecordIds,
        deterministicBasis: "buildSettlementDataset rollups from Supabase settlement source rows"
      })
    },
    retrievalStatus,
    containmentPanel: buildContainmentPanel(containmentCandidate, dataset.customers),
    whatChanged: `${String(dataset.rollup.recoveryLines)} recovery drafts and ${String(dataset.rollup.validLines)} Billing prevention drafts are staged for human review.`,
    aiInsight: "Every proposed amount is bound to a deterministic decision delta; live model execution remains blocked in the offline harness."
  };
}

export function buildForensicsWorkItemDetailCockpitModel(
  options: CockpitModelGovernanceOptions | undefined,
  lineId: string
): ForensicsWorkItemDetailCockpitModel {
  const governedConfig = readGovernedCockpitConfig(options);
  const settlementSource = readSettlementSource(options);
  const serviceContext = readForensicsServiceContext(options);
  const approvalRecordSource = readApprovalRecordSource(options);
  const dataset = buildSettlementDataset(settlementSource);
  const line = dataset.deductionLines.find((candidate) => candidate.lineId === lineId);
  if (line === undefined) {
    throw new ForensicsWorkItemNotFoundError(lineId);
  }

  const run = runForensicsInvestigation({ governedConfig, serviceContext, source: settlementSource });
  const selectedDecision = run.decisions.find((decision) => decision.lineId === lineId);
  if (selectedDecision === undefined) {
    throw new Error(`Missing Forensics decision for requested line ${lineId}.`);
  }
  if (selectedDecision.evidenceDocuments.length === 0) {
    throw new Error(`Missing evidence pack for requested line ${lineId}.`);
  }

  const selectedAction = run.actions.find((action) => action.lineId === lineId);
  if (selectedAction === undefined) {
    throw new Error(`Missing action for requested line ${lineId}.`);
  }

  const workItem = buildScenarioWorklist(dataset, run.decisions, run.actions, options?.approvalRecords).find((item) =>
    item.lineIds.includes(lineId)
  );
  if (workItem === undefined) {
    throw new Error(`Missing worklist item for requested line ${lineId}.`);
  }

  const approvalReceipt = findApprovalReceipt(options?.approvalRecords ?? [], selectedAction.actionId);
  const selected = buildSelectedForensicsCase(selectedDecision, selectedAction, approvalReceipt, approvalRecordSource);
  const actionInbox = buildForensicsActionInbox(run.actions);
  const recommendedAction = actionInbox.find((action) => action.lineId === lineId);
  if (recommendedAction === undefined) {
    throw new Error(`Missing recommended action for requested line ${lineId}.`);
  }
  const approvalStateRecordIds = approvalReceipt?.recordIds ?? selectedAction.recordIds;
  const approvalStateStatus = approvalReceipt?.status ?? selectedAction.status;

  return {
    surface: "forensics-work-item-detail",
    lineId,
    workItem,
    selected,
    recommendedAction,
    recoveryDraft: selected.draft,
    approvalState: {
      actions: selected.approvalActions,
      provenance: businessProvenance("workItemDetail.approvalState", {
        sourceKind: approvalReceipt === undefined ? "derived_backend" : approvalRecordSource.sourceKind,
        sourceName: approvalReceipt === undefined ? "Forensics HITL approval state" : approvalRecordSource.sourceName,
        recordIds: approvalStateRecordIds,
        deterministicBasis:
          approvalReceipt === undefined
            ? `action ${selectedAction.actionId} status ${selectedAction.status}; requiresHumanApproval ${String(selectedAction.requiresHumanApproval)}`
            : `approval_records receipt ${approvalReceipt.actionId} status ${approvalReceipt.status}; decision ${approvalReceipt.decision}; auditEntryHash ${approvalReceipt.auditEntryHash}`
      }),
      status: approvalStateStatus,
      statusLabel: approvalReceipt === undefined ? selected.draft.statusLabel : "Human decision recorded"
    },
    auditState: {
      provenance: businessProvenance("workItemDetail.auditState", {
        sourceKind: approvalReceipt === undefined ? "derived_backend" : approvalRecordSource.sourceKind,
        sourceName: approvalReceipt === undefined ? "Forensics draft audit state" : approvalRecordSource.sourceName,
        recordIds: approvalStateRecordIds,
        deterministicBasis:
          approvalReceipt === undefined
            ? `action ${selectedAction.actionId} dispatchedExternally ${String(selectedAction.dispatchedExternally)}; audit remains pending until human approval`
            : `approval_records receipt ${approvalReceipt.actionId} is committed with status ${approvalReceipt.status}; approval finality does not imply dispatch, ERP write-back, Billing routing, recovery execution, queue completion, or case closure`
      }),
      recordIds: approvalStateRecordIds,
      status: approvalStateStatus,
      statusLabel: approvalReceipt === undefined ? "Awaiting human approval" : "Audit receipt committed"
    },
    ...(approvalReceipt === undefined ? {} : { approvalReceipt }),
    actionInbox,
    multimodalDock: buildSelectedMultimodalDock(selectedDecision, run.trace),
    mayaJourney: buildSelectedMayaJourney(dataset, selectedDecision),
    retrievalStatus: buildRetrievalStatusRows(selectedDecision.evidenceDocuments)
  };
}

export function buildCreditCockpitModel(options: CockpitModelGovernanceOptions | undefined): CreditCockpitModel {
  const governedConfig = readGovernedCockpitConfig(options);
  const riskObservationSource = readRiskObservationSource(options);
  const settlementDataset = buildSettlementDataset(readSettlementSource(options));
  const run = runRiskMeshClosedLoop({ governedConfig, source: riskObservationSource });
  const context = buildHarborRiskMeshProposalContext({ governedConfig, source: riskObservationSource });
  const crestlineM6 = assessCrestlineM6Containment({
    deductionLines: settlementDataset.deductionLines,
    gamingGate: governedConfig.gamingGate
  });
  const weights = run.arbitration.deterministicBasis.weightSource;
  const signals = run.sentinel.deterministicBasis.observedSignals;
  const auditHashes = riskMeshAuditHashes(run.auditEntries);
  const arbitrationReason = riskMeshArbitrationReason(run.arbitration);
  const arbitrationDisplayReason = riskMeshArbitrationDisplayReason(run.arbitration);
  const accountReadout = context.caseConfig.accountReadout;
  const sentinelDisplay = context.caseConfig.sentinelDisplay;
  const accountCore = {
    availableCreditLabel: accountReadout.availableCreditLabel,
    caseId: run.arbitration.caseId,
    creditProgram: accountReadout.creditProgram,
    customerLabel: labelFromRecordId(run.customerId),
    dso90Label: `${String(signals.currentDsoDays)} days`,
    hqRegion: accountReadout.hqRegion,
    industry: accountReadout.industry,
    legalEntity: accountReadout.legalEntity,
    limitLabel: accountReadout.limitLabel,
    openArLabel: accountReadout.openArLabel,
    orderAmount: formatMoney(context.orderAmount),
    orderId: context.holdProposalInput.orderId,
    ownerLabel: accountReadout.ownerLabel,
    posture: accountReadout.posture,
    terms: run.termsAction.terms
  };
  const partialHoldCore = {
    basis: run.holdAction.basis,
    compositeScore: run.partialHold.compositeScore.toFixed(2),
    proposedBackOrderAmount: formatMoney(run.holdAction.proposedBackOrderAmount),
    proposedReleaseAmount: formatMoney(run.holdAction.proposedReleaseAmount),
    releaseRatioPercent: `${run.partialHold.releaseRatioPercent.toFixed(0)}%`
  };
  const termProposalCore = {
    basis: run.termsAction.basis,
    status: run.termsAction.status,
    statusLabel: "Awaiting David approval",
    terms: run.termsAction.terms
  };
  const account = {
    ...accountCore,
    detailRows: [
      { label: "Account ID", value: run.customerId },
      { label: "Legal entity", value: accountCore.legalEntity },
      { label: "Industry", value: accountCore.industry },
      { label: "HQ / region", value: accountCore.hqRegion },
      { label: "Credit program", value: accountCore.creditProgram },
      { label: "Owner", value: accountCore.ownerLabel },
      { label: "Order", value: accountCore.orderId },
      { label: "Case", value: accountCore.caseId },
      { label: "Credit terms", value: accountCore.terms }
    ],
    summaryRows: [
      { label: "limit", value: accountCore.limitLabel },
      { label: "order exposure", value: accountCore.orderAmount },
      { label: "open AR", value: accountCore.openArLabel },
      { label: "DSO (90D)", value: accountCore.dso90Label },
      { label: "available credit", value: accountCore.availableCreditLabel },
      { label: "composite score", value: partialHoldCore.compositeScore },
      { label: "release path", value: partialHoldCore.releaseRatioPercent },
      { label: "audit state", value: run.auditTrailValid ? "Valid" : "Blocked" },
      { label: "terms gate", value: termProposalCore.statusLabel },
      { label: "arbitration", value: arbitrationDisplayReason }
    ]
  } satisfies CreditCockpitModel["account"];
  const actionQueue: CreditCockpitModel["actionQueue"] = context.caseConfig.actionQueue;

  const model = {
    surface: "credit-arbitration",
    customerId: run.customerId,
    readoutStatusLabels: ["Draft-only", account.posture, `${String(run.auditEntries.length)} audit entries`],
    account,
    sentinel: {
      status: run.sentinel.status,
      reason: run.sentinel.reason,
      displayReason: sentinelDisplay.displayReason,
      alertDetail: sentinelDisplay.alertDetail,
      filedLabel: sentinelDisplay.filedLabel,
      filingId: sentinelDisplay.filingId,
      detailRows: [
        { label: "Filing ID", value: sentinelDisplay.filingId },
        { label: "Filed", value: sentinelDisplay.filedLabel },
        { label: "Secured party", value: sentinelDisplay.securedPartyLabel }
      ],
      recordStripLabel: sentinelDisplay.recordStripLabel,
      securedPartyLabel: sentinelDisplay.securedPartyLabel,
      signals: [
        { label: "DSO drift", value: `${String(signals.baselineDsoDays)} -> ${String(signals.currentDsoDays)} days` },
        { label: "Dispute signal", value: "observed" },
        { label: "Lien signal", value: "observed" }
      ],
      recordIds: run.sentinel.recordIds
    },
    arbitration: {
      status: run.arbitration.status,
      reason: arbitrationReason,
      displayReason: arbitrationDisplayReason,
      recordIds: run.arbitration.recordIds
    },
    partialHold: {
      compositeScore: partialHoldCore.compositeScore,
      releaseRatioPercent: partialHoldCore.releaseRatioPercent,
      proposedReleaseAmount: partialHoldCore.proposedReleaseAmount,
      proposedBackOrderAmount: partialHoldCore.proposedBackOrderAmount,
      basis: partialHoldCore.basis,
      scoreReadout: {
        ariaLabel: "Composite partial hold score",
        basisLabel: partialHoldCore.basis,
        label: "composite",
        summaryLabel: "composite score",
        stateLabel: arbitrationDisplayReason,
        value: partialHoldCore.compositeScore
      },
      releaseReadout: {
        ariaLabel: "Deterministic release path",
        label: "release path",
        supportLabel: "Human approval gate",
        value: partialHoldCore.releaseRatioPercent
      },
      splitRows: [
        { label: "release staged", value: partialHoldCore.proposedReleaseAmount },
        { label: "back-order queue", value: partialHoldCore.proposedBackOrderAmount }
      ],
      ledgerRows: [
        {
          left: { label: "Composite score", value: partialHoldCore.compositeScore },
          right: { label: "Release ratio", value: partialHoldCore.releaseRatioPercent }
        },
        {
          left: { label: "Proposed release", value: partialHoldCore.proposedReleaseAmount },
          right: { label: "Back-order hold", value: partialHoldCore.proposedBackOrderAmount }
        },
        {
          left: { label: "Terms gate", value: termProposalCore.statusLabel },
          right: { label: "State", value: arbitrationDisplayReason }
        }
      ],
      criteriaAriaLabel: "Weighted partial hold criteria",
      criteriaHeaders: ["Criterion", "Weight", "Score", "Weighted"],
      criteria: Object.entries(context.partialHoldScores).map(([criterion, score]) => {
        const weight = context.partialHoldWeights[criterion as keyof typeof context.partialHoldWeights];

        return {
          contribution: new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(score * weight),
          label: partialHoldCriterionLabels[criterion as keyof typeof partialHoldCriterionLabels],
          score: String(score),
          weight: weight.toFixed(2)
        };
      })
    },
    termProposal: {
      terms: termProposalCore.terms,
      status: termProposalCore.status,
      statusLabel: termProposalCore.statusLabel,
      basis: termProposalCore.basis,
      commandLabels: ["Simulate alternatives", "Send action packet"],
      gateSummaryLabel: "terms gate",
      packetRows: [
        { label: "Recommended terms", value: termProposalCore.terms },
        { label: "Conditions precedent", value: termProposalCore.statusLabel },
        { label: "Risk mitigants", value: arbitrationDisplayReason }
      ],
      readyStateLabel: "Ready to act",
      summaryLabel: "Draft-only recommendations waiting for David."
    },
    approvalInbox: [
      {
        actionId: run.holdAction.actionId,
        actionType: run.holdAction.actionType,
        actionLabel: "Stage partial hold",
        status: run.holdAction.status,
        statusLabel: "Awaiting David approval",
        basis: run.holdAction.basis,
        recordIds: run.holdAction.recordIds,
        recordStripLabel: "Stage partial hold record IDs"
      },
      {
        actionId: run.termsAction.actionId,
        actionType: run.termsAction.actionType,
        actionLabel: "Stage revised terms",
        status: run.termsAction.status,
        statusLabel: "Awaiting David approval",
        basis: run.termsAction.basis,
        recordIds: run.termsAction.recordIds,
        recordStripLabel: "Stage revised terms record IDs"
      }
    ],
    actionQueue,
    actionQueueSummaryLabel: `${String(actionQueue.length)} governed items`,
    audit: {
      arbitrationHash: auditHashes.arbitrationHash,
      chainHeadHash: auditHashes.chainHeadHash,
      entries: run.auditEntries.length,
      entryHashes: auditHashes.entryHashes,
      valid: run.auditTrailValid
    },
    negotiation: {
      provenance: "deterministic_read_model",
      nodes: context.positions.map((position) => ({
        functionName: position.functionName,
        displayName: functionLabels[position.functionName],
        position: position.position,
        weight: weights[position.functionName].toFixed(2),
        confidenceBand: "governed",
        recordIds: position.recordIds
      })),
      timeline: [
        ...context.positions.map((position) => ({
          message: `${position.functionName} position recorded for ${position.optionId}`,
          recordIds: position.recordIds
        })),
        {
          message: `${crestlineM6.customerId} containment readout linked for Risk Mesh review only`,
          recordIds: crestlineM6.recordIds
        }
      ]
    }
  } satisfies Omit<CreditCockpitModel, "commandCenter">;

  return {
    ...model,
    commandCenter: buildCreditCommandCenter(model)
  };
}

export function buildCfoSummaryCockpitModel(options: CockpitModelGovernanceOptions | undefined): CfoSummaryCockpitModel {
  const governedConfig = readGovernedCockpitConfig(options);
  const dataset = buildSettlementDataset(readSettlementSource(options));
  const riskRun = runRiskMeshClosedLoop({ governedConfig, source: readRiskObservationSource(options) });
  const dependencies = cfoOpenDependencies.map((dependencyId) => dependencyView(dependencyId));
  const auditHash = riskMeshAuditHashes(riskRun.auditEntries).chainHeadHash;
  const recoveryRecordIds = dataset.deductionLines
    .filter((line) => line.routing === "recovery")
    .slice(0, 3)
    .map((line) => line.lineId);
  const billingRecordIds = dataset.deductionLines
    .filter((line) => line.routing === "billing")
    .slice(0, 3)
    .map((line) => line.lineId);
  const caseConfig = governedConfig.riskMeshCases.harbor;
  const auditRecordIds = uniqueStrings([
    "recoup_deduction_lines",
    ...(dataset.deductionLines[0] === undefined ? [] : [dataset.deductionLines[0].lineId]),
    caseConfig.customerId,
    caseConfig.orderId,
    ...caseConfig.recordIds
  ]);
  const datasetHash = shortHash({
    eventIds: dataset.manifest.eventIds,
    lineIds: dataset.manifest.lineIds,
    seed: dataset.manifest.seed,
    totalLines: dataset.rollup.totalLines
  });
  const boardMetrics = [
    { label: "Gross scope", value: formatMoney(dataset.rollup.totalAmount), support: `${String(dataset.deductionLines.length)} deduction lines` },
    { label: "Recovery queue", value: formatMoney(dataset.rollup.recoveryAmount), support: `${String(dataset.rollup.recoveryLines)} recovery drafts` },
    { label: "Margin protected", value: formatMoney(dataset.rollup.validAmount), support: `${String(dataset.rollup.validLines)} prevention drafts` },
    { label: "External action posture", value: "Draft-only", support: "HITL gate required" },
    { label: "Evidence sources", value: "4", support: "SAP, Docs, TPM, Bureau" },
    { label: "Open proof dependencies", value: String(dependencies.length), support: "Owner proof required" },
    { label: "DSO / CEI", value: "Live input pending", support: "No ERP write-back" },
    { label: "Autonomy posture", value: "Governed", support: "No autonomous external action" }
  ].map((metric) => ({
    ...metric,
    supportLabel: cfoExecutiveMetadataValue("Metric support", metric.support)
  }));
  const reportMetadata = [
    { label: "Board pack", value: "Recoup v2 executive readout" },
    { label: "Dataset", value: "Supabase recoup_deduction_lines" },
    { label: "Currency", value: "USD" },
    { label: "Mode", value: "Read-only board draft" }
  ].map((item) => ({
    ...item,
    valueLabel: cfoExecutiveMetadataValue(item.label, item.value)
  }));
  const auditSummary = {
    status: "Governed",
    support: "No external actions can dispatch without HITL approval.",
    supportLabel: cfoExecutiveMetadataValue(
      "Audit support",
      "No external actions can dispatch without HITL approval."
    )
  };
  const auditControls = [
    { label: "External writes", value: "Blocked", support: "HITL gate" },
    { label: "Evidence spine", value: "Cited", support: `${String(auditRecordIds.length)} record IDs` },
    { label: "Runtime model execution", value: "Blocked", support: "Proof dependencies open" }
  ].map((control) => ({
    ...control,
    supportLabel: cfoExecutiveMetadataValue("Control support", control.support)
  }));
  const evidenceRows = [
    {
      basis: "computed recovery deltas",
      label: "Recovery draft queue",
      recordIds: recoveryRecordIds,
      state: `${String(dataset.rollup.recoveryLines)} drafts`
    },
    {
      basis: "valid deductions routed as draft-only Billing recommendations",
      label: "Billing prevention queue",
      recordIds: billingRecordIds,
      state: `${String(dataset.rollup.validLines)} drafts`
    },
    {
      basis: riskMeshArbitrationReason(riskRun.arbitration),
      label: "Risk Mesh arbitration",
      recordIds: riskRun.arbitration.recordIds,
      state: riskRun.arbitration.status === "blocked" ? "Calibration proof open" : "Ranked resolution recorded"
    },
    {
      basis: "hash-chain verification",
      label: "Audit trail integrity",
      recordIds: uniqueStrings(riskRun.auditEntries.flatMap((entry) => entry.recordIds)),
      state: riskRun.auditTrailValid ? `${String(riskRun.auditEntries.length)} entries valid` : "Blocked"
    }
  ].map((row) => ({
    ...row,
    basisLabel: cfoExecutiveBasis(row.basis),
    recordCountLabel: cfoRecordCountLabel(row.recordIds.length)
  }));
  const changeLedger = [
    {
      label: "Recovery drafts",
      posture: "Pending human review",
      support: formatMoney(dataset.rollup.recoveryAmount),
      value: String(dataset.rollup.recoveryLines)
    },
    {
      label: "Billing prevention drafts",
      posture: "Draft route only",
      support: formatMoney(dataset.rollup.validAmount),
      value: String(dataset.rollup.validLines)
    },
    {
      label: "Open proof dependencies",
      posture: "Blocks public proof claims",
      support: "Owner proof required",
      value: String(dependencies.length)
    },
    {
      label: "External writes",
      posture: "Blocked by HITL",
      support: "No ERP write-back",
      value: "0"
    }
  ].map((row) => ({
    ...row,
    postureLabel: cfoExecutiveMetadataValue("Posture", row.posture),
    supportLabel: cfoExecutiveMetadataValue("Support", row.support)
  }));
  const insightReadout = {
    basis: "computed deltas, dependency ledger, and HITL action posture",
    basisLabel: cfoExecutiveMetadataValue("Basis", "computed deltas, dependency ledger, and HITL action posture"),
    posture: "Informational only",
    title: "Deterministic evidence spine is ready; live proof remains gated"
  };
  const sourceSystems = ["SAP OData", "Contract Repo", "TPM", "Bureau", "Risk Mesh", "Audit Trail"];

  return {
    surface: "cfo-summary",
    metrics: [
      { label: "Gross-to-net", value: `${formatMoney(dataset.rollup.totalAmount)} gross scope` },
      { label: "Margin protected", value: `${formatMoney(dataset.rollup.validAmount)} draft-only` },
      { label: "DSO / CEI", value: "requires live ERP inputs" },
      { label: "Leakage position", value: `${formatMoney(dataset.rollup.recoveryAmount)} recovery queue` }
    ],
    readoutStatusLabels: ["Read-only", "Draft actions only", `${String(dependencies.length)} open proofs`],
    boardMetrics,
    reportMetadata,
    auditPosture: {
      summary: auditSummary,
      controls: auditControls,
      evidenceRows,
      recordCountLabel: cfoRecordCountLabel(auditRecordIds.length),
      recordIds: auditRecordIds
    },
    dependencies,
    changeLedger,
    insightReadout,
    provenance: {
      actionPosture: "no autonomous external action",
      auditHash,
      dataBasis: "Supabase settlement source rows plus governed read models",
      dataBasisLabel: cfoExecutiveMetadataValue("Data basis", "Supabase settlement source rows plus governed read models"),
      datasetHash,
      reportHash: shortHash({
        auditHash,
        boardMetricLabels: boardMetrics.map((metric) => metric.label),
        dependencyIds: cfoOpenDependencies,
        datasetHash
      }),
      sourceSystems,
      sourceSystemCountLabel: `${String(sourceSystems.length)} source systems`,
      source: "deterministic_read_model",
      sourceLabel: cfoHumanize("deterministic_read_model")
    },
    assurance: {
      basis: "hash-chain verification",
      label: "Assurance",
      recordIds: auditRecordIds,
      statusLabel: "Audit verified"
    },
    whatChanged: "Forensics, Risk Mesh, Sentinel, and Containment now land in governed human-review queues.",
    aiInsight: "Recoup demonstrates a deterministic evidence spine with live model execution blocked until runtime policy and credentials are approved.",
    openDependencies: [...cfoOpenDependencies]
  };
}

export function buildForensicsSseEvents(options: CockpitModelGovernanceOptions | undefined): ForensicsSseEvent[] {
  const run = runForensicsInvestigation({
    governedConfig: readGovernedCockpitConfig(options),
    serviceContext: readForensicsServiceContext(options),
    source: readSettlementSource(options)
  });

  return run.trace;
}

export function buildLoginModel(): LoginCockpitModel {
  return {
    surface: "login",
    personas: buildCockpitDemoLoginPersonas()
  };
}

export function buildTraceModel(options: CockpitModelGovernanceOptions | undefined): TraceCockpitModel {
  const riskRun = runRiskMeshClosedLoop({
    governedConfig: readGovernedCockpitConfig(options),
    source: readRiskObservationSource(options)
  });

  return {
    surface: "trace",
    events: riskRun.auditEntries.map((entry) => ({
      id: `trace-riskmesh-audit-${String(entry.sequence)}`,
      label: traceAuditLabel(entry.entryType),
      kind: "audit",
      status: traceAuditStatus(entry),
      provenance: "deterministic_demo_audit",
      recordIds: entry.recordIds,
      deterministicBasis: `runRiskMeshClosedLoop.auditEntries[${String(entry.sequence)}]`,
      entryType: entry.entryType,
      entryHash: entry.entryHash,
      previousHash: entry.previousHash,
      sequence: entry.sequence,
      sourceMode: "deterministic_demo_audit"
    }))
  };
}

export function buildMemorySummaryModel(
  records: MemoryRecord[] = [],
  options?: { backend: "sqlite" | "supabase" }
): MemorySummaryCockpitModel {
  const metadata =
    options === undefined
      ? {
          backend: "in_memory_fallback" as const,
          provenance: "empty_runtime_memory" as const,
          sourceMode: "runtime_empty" as const
        }
      : {
          backend: options.backend,
          provenance: "persisted_runtime_memory" as const,
          sourceMode: "runtime_persisted" as const
        };

  return {
    ...metadata,
    surface: "memory",
    categories: [...memoryCategories],
    approvalAuditReceipts: buildApprovalAuditReceipts(records),
    records: records.map((record) => ({
      id: record.id,
      category: record.category,
      trustLevel: record.trustLevel,
      scope: record.scope,
      recordIds: record.recordIds
    }))
  };
}

function buildApprovalAuditReceipts(records: readonly MemoryRecord[]): ApprovalAuditReceipt[] {
  return records.flatMap((record) => {
    const receipt = toApprovalAuditReceipt(record);
    return receipt === undefined ? [] : [receipt];
  });
}

function findApprovalReceipt(records: readonly MemoryRecord[], actionId: string): ApprovalAuditReceipt | undefined {
  return buildApprovalAuditReceipts(records).find((receipt) => receipt.actionId === actionId);
}

function approvalReceiptRecordKey(actionId: string): string {
  return `approval:${actionId}`;
}

function toApprovalAuditReceipt(record: MemoryRecord): ApprovalAuditReceipt | undefined {
  if (record.category !== "approval_records" || record.trustLevel !== "trusted") {
    return undefined;
  }

  const actionId = readPayloadString(record, "actionId");
  const approverId = readPayloadString(record, "approverId");
  const auditEntryHash = readPayloadString(record, "auditEntryHash");
  const decision = readPayloadString(record, "decision");
  const reason = readPayloadString(record, "reason");
  const status = readPayloadString(record, "status");
  const expectedApprovalRecordKey = actionId === undefined ? undefined : approvalReceiptRecordKey(actionId);

  if (
    actionId === undefined ||
    record.id !== expectedApprovalRecordKey ||
    record.scope !== expectedApprovalRecordKey ||
    approverId === undefined ||
    !approverId.startsWith("human:") ||
    auditEntryHash === undefined ||
    !/^[a-f0-9]{64}$/u.test(auditEntryHash) ||
    !isApprovalAction(decision) ||
    status !== "human_decided" ||
    !record.recordIds.includes(actionId)
  ) {
    return undefined;
  }

  return {
    actionId,
    approverId,
    auditEntryHash,
    decision,
    ...(reason === undefined ? {} : { reason }),
    recordIds: [...record.recordIds],
    status
  };
}

function readPayloadString(record: MemoryRecord, key: string): string | undefined {
  const value = record.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isApprovalAction(value: string | undefined): value is ApprovalAction {
  return value === "approve" || value === "modify" || value === "reject";
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
  availableCredentialEnvNames: readonly string[],
  toolDataSchemaProbe: SupabaseToolDataSchemaProbe | undefined,
  sourceHealthResults: readonly SourceHealthResult[],
  mcpReadiness?: McpReadinessStatus
): ConnectorReadinessCockpitModel {
  if (arguments.length < 3 || sourceHealthResults.length === 0) {
    throw new Error("Connector readiness model requires backend source health.");
  }

  const connectors = buildConnectorReadiness([], availableCredentialEnvNames, toolDataSchemaProbe);
  const checkedAtIso = mostRecentSourceHealthCheckedAt(sourceHealthResults);
  if (checkedAtIso === undefined) {
    throw new Error("Connector readiness model requires backend source health.");
  }
  const sourceHealth = [...sourceHealthResults];
  const connectorRecordIds = connectorReadinessRecordIds(connectors);
  const sourceHealthRecordIds = uniqueStrings(sourceHealth.flatMap((result) => result.recordIds));

  return {
    surface: "connector-readiness",
    checkedAtIso,
    connectors,
    lastRefreshedLabel: `${String(sourceHealth.length)} source health rows checked at ${checkedAtIso}`,
    provenance: businessProvenance("connectorReadiness", {
      sourceKind: "derived_backend",
      sourceName: "Connector readiness and source health registry",
      recordIds: uniqueStrings([...connectorRecordIds, ...sourceHealthRecordIds]),
      deterministicBasis: "buildConnectorReadiness output joined to SourceHealthResult checkedAtIso values from backend source probes"
    }),
    sourceHealth,
    sourceTiles: buildSourceReadinessTiles(connectors, sourceHealth, mcpReadiness)
  };
}

function buildScenarioWorklist(
  dataset: SettlementDataset,
  decisions: DeductionDecision[],
  actions: ReturnType<typeof runForensicsInvestigation>["actions"],
  approvalRecords: readonly MemoryRecord[] = []
): WorklistItem[] {
  const decisionsByLineId = new Map(decisions.map((decision) => [decision.lineId, decision]));
  const actionByLineId = new Map(actions.map((action) => [action.lineId, action]));
  const receiptByActionId = new Map(buildApprovalAuditReceipts(approvalRecords).map((receipt) => [receipt.actionId, receipt]));
  const customerById = new Map(dataset.customers.map((customer) => [customer.customerId, customer]));

  return dataset.manifest.scenarioIds.map((scenarioId) => {
    const lines = dataset.deductionLines.filter((line) => line.scenarioId === scenarioId);
    const firstLine = lines[0];
    if (firstLine === undefined) {
      throw new Error(`Missing scenario ${scenarioId}.`);
    }

    const scenarioDecisions = lines.map((line) => decisionsByLineId.get(line.lineId)).filter((decision): decision is DeductionDecision => decision !== undefined);
    const firstDecision = scenarioDecisions[0];
    if (firstDecision === undefined) {
      throw new Error(`Missing decision for scenario ${scenarioId}.`);
    }

    const total = lines.reduce((sum, line) => sum.plus(line.amount), dataset.zeroMoney);
    const recordIds = uniqueStrings(scenarioDecisions.flatMap((decision) => decision.recordIds));
    const customer = customerById.get(firstLine.customerId);
  const scenarioActions = lines
      .map((line) => actionByLineId.get(line.lineId))
      .filter((action): action is ReturnType<typeof runForensicsInvestigation>["actions"][number] => action !== undefined);
    const firstAction = scenarioActions[0];
    const scenarioApprovalReceipts = scenarioActions
      .map((action) => receiptByActionId.get(action.actionId))
      .filter((receipt): receipt is ApprovalAuditReceipt => receipt !== undefined);
    const allScenarioActionsDecided =
      scenarioActions.length > 0 && scenarioApprovalReceipts.length === scenarioActions.length;

    return {
      lineId: firstLine.lineId,
      lineCount: lines.length,
      lineIds: lines.map((line) => line.lineId),
      customerId: firstLine.customerId,
      customerLabel: customer?.name ?? labelFromRecordId(firstLine.customerId),
      scenarioId,
      scenarioLabel: `${scenarioId}-${String(lines.length)} lines`,
      scenarioType: firstLine.scenarioType,
      amount: formatMoney(total),
      verdict: firstDecision.verdict,
      verdictLabel: verdictLabel(firstDecision.verdict),
      routing: firstDecision.routing,
      routingLabel: routingLabel(firstDecision.routing),
      recommendedActionLabel: routingLabel(firstDecision.routing),
      confidence: confidenceDisplayValue(firstDecision.confidence),
      confidenceLabel: confidenceLabel(firstDecision.confidence),
      evidenceScoreLabel: String(recordIds.length),
      evidenceLabel: `${String(recordIds.length)} artifacts`,
      provenance: businessProvenance(`worklist.${scenarioId}`, {
        sourceKind: "derived_backend",
        sourceName: "Forensics scenario worklist read model",
        recordIds,
        deterministicBasis: `scenario ${scenarioId} grouped from settlement source lines and runForensicsInvestigation decisions`
      }),
      approvalStatus: allScenarioActionsDecided ? "human_decided" : firstAction?.status ?? "pending_human",
      approvalStatusLabel: allScenarioActionsDecided ? "Human decision recorded" : "Awaiting reviewer",
      queueLabel: firstDecision.routing === "recovery" ? "Review" : "Billing"
    };
  });
}

function buildCreditCommandCenter(model: Omit<CreditCockpitModel, "commandCenter">): CreditCommandCenterModel {
  const urgentCount = model.actionQueue.filter((item) => item.priority === "P1").length;
  const [primaryAction, secondaryAction] = model.approvalInbox;
  const [primaryQueue, secondaryQueue] = model.actionQueue;

  return {
    statusRail: [
      {
        detail: model.account.posture,
        label: "Harbor",
        tone: model.arbitration.status === "blocked" ? "blocked" : "healthy",
        value: model.arbitration.status === "blocked" ? "review" : "ok"
      },
      {
        detail: model.sentinel.alertDetail,
        label: "Sentinel",
        tone: model.sentinel.status === "blocked" ? "blocked" : "warning",
        value: model.sentinel.status === "blocked" ? "alert" : "watch"
      },
      {
        detail: "Risk Mesh positions loaded from deterministic read model.",
        label: "Mesh",
        tone: "healthy",
        value: "ready"
      },
      {
        detail: `${String(model.audit.entries)} hash-chained audit entries`,
        label: "Archive",
        tone: model.audit.valid ? "healthy" : "blocked",
        value: model.audit.valid ? "valid" : "blocked"
      },
      {
        detail: "D5 portfolio-wide signal remains limited to the current deterministic read-model scope.",
        label: "Signal",
        tone: "pending",
        value: "scoped"
      }
    ],
    stats: [
      {
        label: "Total exposure",
        note: "deterministic read-model scope",
        tone: "pending",
        unit: "USD",
        value: operationalValue(model.account.openArLabel)
      },
      {
        label: "Order exposure",
        note: model.account.orderId,
        tone: "healthy",
        unit: "USD",
        value: model.account.orderAmount
      },
      {
        label: "Active arbitrations",
        note: `${String(model.approvalInbox.length)} awaiting David approval`,
        tone: "warning",
        value: String(model.approvalInbox.length)
      },
      {
        label: "Risk Mesh alerts",
        note: `${String(urgentCount)} P1 items`,
        tone: urgentCount > 0 ? "blocked" : "healthy",
        value: String(model.actionQueue.length)
      },
      {
        label: "Audit tasks",
        note: model.audit.valid ? "hash chain valid" : "hash chain blocked",
        tone: model.audit.valid ? "healthy" : "blocked",
        value: String(model.audit.entries)
      },
      {
        label: "Signal score",
        note: model.arbitration.displayReason,
        tone: "warning",
        value: `${model.partialHold.compositeScore}/100`
      }
    ],
    exposureRows: [
      {
        action: model.partialHold.proposedReleaseAmount,
        exposure: model.account.orderAmount,
        portfolio: model.account.customerLabel,
        signal: model.partialHold.releaseRatioPercent,
        state: model.termProposal.statusLabel,
        tone: "warning"
      },
      {
        action: operationalValue(model.account.availableCreditLabel),
        exposure: operationalValue(model.account.openArLabel),
        portfolio: "Read-model exposure",
        signal: "scoped",
        state: "Deterministic source only",
        tone: "pending"
      },
      {
        action: model.partialHold.proposedBackOrderAmount,
        exposure: operationalValue(model.account.limitLabel),
        portfolio: "Back-order hold",
        signal: model.sentinel.displayReason,
        state: model.arbitration.displayReason,
        tone: model.sentinel.status === "blocked" ? "blocked" : "warning"
      }
    ],
    feedRows: [
      {
        detail: model.sentinel.alertDetail,
        event: model.sentinel.displayReason,
        state: model.sentinel.status,
        time: primaryQueue?.age ?? "scoped",
        tone: model.sentinel.status === "blocked" ? "blocked" : "warning"
      },
      {
        detail: primaryAction?.basis ?? model.partialHold.basis,
        event: primaryAction?.actionLabel ?? "Partial-hold packet",
        state: primaryAction?.statusLabel ?? model.termProposal.statusLabel,
        time: secondaryQueue?.age ?? "scoped",
        tone: "warning"
      },
      {
        detail: secondaryAction?.basis ?? model.termProposal.basis,
        event: secondaryAction?.actionLabel ?? "Terms packet",
        state: secondaryAction?.statusLabel ?? model.termProposal.statusLabel,
        time: model.actionQueue[2]?.age ?? "scoped",
        tone: "pending"
      },
      {
        detail: `${String(model.audit.entries)} entries available for reviewer inspection.`,
        event: "Audit chain verification",
        state: model.audit.valid ? "valid" : "blocked",
        time: model.actionQueue[3]?.age ?? "scoped",
        tone: model.audit.valid ? "healthy" : "blocked"
      },
      {
        detail: model.negotiation.timeline[0]?.message ?? "Risk Mesh position recorded.",
        event: "Function position recorded",
        state: "Read model",
        time: model.actionQueue[4]?.age ?? "scoped",
        tone: "healthy"
      }
    ],
    signalRows: model.partialHold.criteria.map((criterion) => ({
      detail: `${weightLabel(criterion.weight)} weight; ${criterion.contribution} impact`,
      label: criterion.label,
      score: criterion.score,
      tone: signalTone(criterion.score)
    })),
    auditRows: [
      {
        label: "HITL gate",
        state: "human decision",
        value: model.termProposal.statusLabel
      },
      {
        label: "Evidence basis",
        state: "evidence cited",
        value: `${String(model.sentinel.recordIds.length)} records`
      },
      {
        label: "Arbitration basis",
        state: model.arbitration.status === "blocked" ? "calibration block" : "clear",
        value: `${String(model.arbitration.recordIds.length)} records`
      },
      {
        label: "External writes",
        state: "blocked",
        value: "0"
      }
    ],
    marketTape: [
      {
        label: "Bureau watch",
        tone: model.sentinel.status === "blocked" ? "blocked" : "warning",
        value: model.sentinel.displayReason
      },
      {
        label: "Release path",
        tone: "warning",
        value: model.partialHold.releaseRatioPercent
      },
      {
        label: "Back-order queue",
        tone: "pending",
        value: model.partialHold.proposedBackOrderAmount
      },
      {
        label: "Terms gate",
        tone: "pending",
        value: model.termProposal.statusLabel
      },
      {
        label: "Audit chain",
        tone: model.audit.valid ? "healthy" : "blocked",
        value: `${String(model.audit.entries)} entries`
      }
    ]
  };
}

function buildContainmentPanel(
  candidate: CrestlineM6ContainmentAssessment,
  customers: SettlementDataset["customers"]
): ForensicsCockpitModel["containmentPanel"] {
  const customer = customers.find((item) => item.customerId === candidate.customerId);
  const components = candidate.deterministicBasis.rScoreComponents;

  return {
    actionPostureLabel: "No hold or freeze action staged",
    behavioralEvidenceIds: candidate.behavioralEvidenceIds,
    basisRows: [
      {
        label: "Gaming gate",
        value: candidate.deterministicBasis.gamingThresholds,
        provenance: containmentProvenance(candidate, "gamingThresholds")
      },
      {
        label: "Invalid shortage lines",
        value: String(components.invalidShortageLineCount),
        provenance: containmentProvenance(candidate, "rScoreComponents.invalidShortageLineCount")
      },
      {
        label: "Invalid pricing lines",
        value: String(components.invalidPricingLineCount),
        provenance: containmentProvenance(candidate, "rScoreComponents.invalidPricingLineCount")
      },
      {
        label: "Promo correlation",
        value: String(components.promoCorrelationCount),
        provenance: containmentProvenance(candidate, "rScoreComponents.promoCorrelationCount")
      },
      {
        label: "Configured window",
        value: `${String(components.windowDays)} days`,
        provenance: containmentProvenance(candidate, "rScoreComponents.windowDays")
      }
    ],
    componentReadoutLabel: "Day-1 deterministic component readout; production R-score/R-drift remains out of scope.",
    customerId: candidate.customerId,
    customerLabel: customer?.name ?? labelFromRecordId(candidate.customerId),
    handoff: {
      label: "David / Risk Mesh reference",
      recordIds: candidate.recordIds,
      status: "review-only handoff",
      target: "Risk Mesh",
      provenance: containmentProvenance(candidate, "risk mesh review-only handoff")
    },
    intentLabel: candidate.intentLabel,
    postureLabel: "HITL risk review only",
    provenance: containmentProvenance(candidate, "assessCrestlineM6Containment read model"),
    recordIds: candidate.recordIds,
    recordStripLabel: "Containment review record IDs",
    statusLabel: "Gaming-gate review candidate"
  };
}

function readGovernedCockpitConfig(options: CockpitModelGovernanceOptions | undefined): GovernedConfigValues {
  if (options?.governedConfig === undefined) {
    throw new Error("Governed runtime config snapshot required.");
  }

  return options.governedConfig;
}

function readSettlementSource(options: CockpitModelGovernanceOptions | undefined): SourcePort {
  if (options?.settlementSource === undefined) {
    throw new Error("Supabase settlement source snapshot required.");
  }

  return options.settlementSource;
}

function readRiskObservationSource(options: CockpitModelGovernanceOptions | undefined): SourcePort {
  if (options?.riskObservationSource === undefined) {
    throw new Error("Supabase Tools_data risk observation source snapshot required.");
  }

  return options.riskObservationSource;
}

function readForensicsServiceContext(options: CockpitModelGovernanceOptions | undefined): ServiceInvocationContext {
  if (options?.serviceContext === undefined) {
    throw new Error("Supabase synthetic evidence service context required.");
  }

  return options.serviceContext;
}

function readApprovalRecordSource(options: CockpitModelGovernanceOptions | undefined): ApprovalRecordSourceMetadata {
  return options?.approvalRecordSource ?? {
    sourceKind: "derived_backend",
    sourceName: "Runtime approval receipt memory projection"
  };
}

function buildSettlementDataset(source: SourcePort): SettlementDataset {
  const settlementRun = source.loadSettlementRun();
  const zeroMoney = money("0.00");
  const recoveryLines = settlementRun.deductionLines.filter((line) => line.routing === "recovery");
  const validLines = settlementRun.deductionLines.filter((line) => line.routing === "billing");

  return {
    ...settlementRun,
    manifest: {
      eventIds: settlementRun.deductionLines.map((line) => line.eventId),
      lineIds: settlementRun.deductionLines.map((line) => line.lineId),
      scenarioIds: uniqueStrings(settlementRun.deductionLines.map((line) => line.scenarioId)) as Array<DeductionLine["scenarioId"]>,
      seed: settlementRun.seed
    },
    rollup: {
      billingLines: validLines.length,
      recoveryAmount: recoveryLines.reduce((total, line) => total.plus(line.amount), zeroMoney),
      recoveryLines: recoveryLines.length,
      totalAmount: settlementRun.deductionLines.reduce((total, line) => total.plus(line.amount), zeroMoney),
      totalLines: settlementRun.deductionLines.length,
      validAmount: validLines.reduce((total, line) => total.plus(line.amount), zeroMoney),
      validLines: validLines.length
    },
    zeroMoney
  };
}

function businessProvenance(fieldName: string, provenance: MayaFieldProvenance): MayaFieldProvenance {
  assertBusinessProvenance(fieldName, provenance);

  return provenance;
}

function approvalControlProvenance(decision: ApprovalAction): MayaFieldProvenance {
  return businessProvenance(`approvalActions.${decision}`, {
    sourceKind: "operator_session",
    sourceName: "Maya operator approval controls",
    recordIds: [],
    deterministicBasis: `${decision} control exposes the operator-session HITL decision choice only`
  });
}

function buildSelectedForensicsCase(
  selectedDecision: DeductionDecision,
  selectedAction: ReturnType<typeof runForensicsInvestigation>["actions"][number],
  approvalReceipt: ApprovalAuditReceipt | undefined,
  approvalRecordSource: ApprovalRecordSourceMetadata
): ForensicsCockpitModel["selected"] {
  const approvalEligibility = buildApprovalEligibility(
    selectedDecision,
    selectedAction,
    approvalReceipt,
    approvalRecordSource
  );

  return {
    lineId: selectedDecision.lineId,
    approvalEligibility,
    evidencePack: {
      provenance: businessProvenance("selected.evidencePack", {
        sourceKind: "derived_backend",
        sourceName: "Forensics selected decision evidence pack",
        recordIds: selectedDecision.recordIds,
        deterministicBasis: `requested decision ${selectedDecision.decisionId} evidenceDocuments from runForensicsInvestigation`
      }),
      recordIds: selectedDecision.recordIds,
      documents: selectedDecision.evidenceDocuments.map((document, index) => evidenceDocumentView(document, index))
    },
    draft: {
      actionId: selectedAction.actionId,
      actionLabel: actionLabel(selectedAction.actionType),
      actionType: selectedAction.actionType,
      status: selectedAction.status,
      statusLabel: statusLabel(selectedAction.status),
      amount: formatMoney(selectedAction.proposedAmount),
      basis: selectedAction.basis,
      approvalEligibility,
      provenance: businessProvenance("selected.draft", {
        sourceKind: "derived_backend",
        sourceName: "Forensics draft action",
        recordIds: selectedAction.recordIds,
        deterministicBasis: `action ${selectedAction.actionId} amountSource ${selectedAction.amountSource}; ${selectedAction.basis}`
      })
    },
    approvalActions: [
      { decision: "approve", label: "Approve draft", requiresReason: false, provenance: approvalControlProvenance("approve") },
      { decision: "modify", label: "Modify", requiresReason: true, provenance: approvalControlProvenance("modify") },
      { decision: "reject", label: "Reject", requiresReason: true, provenance: approvalControlProvenance("reject") }
    ]
  };
}

function buildApprovalEligibility(
  selectedDecision: DeductionDecision,
  selectedAction: ReturnType<typeof runForensicsInvestigation>["actions"][number],
  approvalReceipt: ApprovalAuditReceipt | undefined,
  approvalRecordSource: ApprovalRecordSourceMetadata
): ApprovalEligibilityCockpitModel {
  if (approvalReceipt !== undefined) {
    return {
      available: false,
      provenance: businessProvenance("selected.approvalEligibility", {
        sourceKind: approvalRecordSource.sourceKind,
        sourceName: approvalRecordSource.sourceName,
        recordIds: approvalReceipt.recordIds,
        deterministicBasis: `approval_records receipt ${approvalReceipt.actionId} is already committed with status ${approvalReceipt.status}; duplicate human decisions are disabled; no dispatch, ERP write-back, Billing routing, recovery execution, queue completion, or case closure is inferred`
      }),
      statusLabel: "Human decision recorded"
    };
  }

  const evidenceDocumentIds = new Set(selectedDecision.evidenceDocuments.map((document) => document.documentId));
  const actionEvidenceComplete =
    selectedAction.evidenceDocumentIds.length > 0 &&
    selectedAction.evidenceDocumentIds.every((documentId) => evidenceDocumentIds.has(documentId));
  const approvalGateOpen = isPendingHumanApprovalGate(selectedAction);
  const readyForHumanApproval = approvalGateOpen && actionEvidenceComplete;

  if (readyForHumanApproval) {
    return {
      available: true,
      provenance: businessProvenance("selected.approvalEligibility", {
        sourceKind: "derived_backend",
        sourceName: "Forensics evidence review eligibility",
        recordIds: uniqueStrings([
          ...selectedAction.recordIds,
          ...selectedAction.evidenceDocumentIds,
          ...selectedDecision.evidenceDocuments.flatMap((document) => document.recordIds)
        ]),
        deterministicBasis: `action ${selectedAction.actionId} requiresHumanApproval ${String(selectedAction.requiresHumanApproval)}; status ${selectedAction.status}; dispatchedExternally ${String(selectedAction.dispatchedExternally)}; evidenceDocuments ${String(selectedDecision.evidenceDocuments.length)} cover action evidenceDocumentIds ${selectedAction.evidenceDocumentIds.join(", ")}`
      }),
      statusLabel: "Ready for human approval"
    };
  }

  return {
    available: false,
    provenance: businessProvenance("selected.approvalEligibility", {
      sourceKind: "derived_backend",
      sourceName: "Forensics approval eligibility contract",
      recordIds: selectedAction.recordIds,
      deterministicBasis: `action ${selectedAction.actionId} approval eligibility is blocked; requiresHumanApproval ${String(selectedAction.requiresHumanApproval)}; status ${selectedAction.status}; dispatchedExternally ${String(selectedAction.dispatchedExternally)}; actionEvidenceComplete ${String(actionEvidenceComplete)}`
    }),
    statusLabel: "Eligibility unavailable"
  };
}

function isPendingHumanApprovalGate(action: {
  dispatchedExternally: boolean;
  requiresHumanApproval: boolean;
  status: string;
}): boolean {
  return action.requiresHumanApproval && action.status === "pending_human" && !action.dispatchedExternally;
}

function buildForensicsActionInbox(
  actions: ReturnType<typeof runForensicsInvestigation>["actions"]
): ForensicsCockpitModel["actionInbox"] {
  return actions.map((action) => ({
    actionId: action.actionId,
    actionLabel: actionLabel(action.actionType),
    actionType: action.actionType,
    lineId: action.lineId,
    amount: formatMoney(action.proposedAmount),
    status: action.status,
    statusLabel: statusLabel(action.status),
    basis: action.basis,
    provenance: businessProvenance(`actionInbox.${action.actionId}`, {
      sourceKind: "derived_backend",
      sourceName: "Forensics HITL action queue",
      recordIds: action.recordIds,
      deterministicBasis: `runForensicsInvestigation action ${action.actionId} amountSource ${action.amountSource}`
    })
  }));
}

function buildSelectedMultimodalDock(
  selectedDecision: DeductionDecision,
  trace: ForensicsTraceEvent[]
): ForensicsCockpitModel["multimodalDock"] {
  return {
    languageLabel: "Spanish ready",
    modeOptions: ["Type", "Talk"],
    policyLabel: "voice/text citation parity",
    promptPlaceholder: "Ask why this deduction is invalid, with cited evidence only.",
    promptSuggestions: buildQueryPromptSuggestions(selectedDecision, trace),
    transcript: {
      native: "Â¿Por quÃ© es invÃ¡lida esta deducciÃ³n?",
      english: "Why is this deduction invalid? Answer from the cited POD and invoice records only."
    },
    provenance: businessProvenance("multimodalDock", {
      sourceKind: "agent_trace",
      sourceName: "Forensics trace context read model",
      recordIds: selectedDecision.recordIds,
      deterministicBasis: "runForensicsInvestigation trace rows grouped for cited voice/text query context"
    }),
    subAgents: buildTraceContextRows(selectedDecision, trace)
  };
}

function buildSelectedMayaJourney(
  dataset: SettlementDataset,
  selectedDecision: DeductionDecision
): ForensicsCockpitModel["mayaJourney"] {
  return [
    {
      label: "Ingest",
      recordIds: dataset.deductionLines.slice(0, 3).map((line) => line.lineId),
      status: "complete",
      timestamp: journeyStepLabel(0, 6),
      provenance: journeyProvenance(
        "Ingest",
        dataset.deductionLines.slice(0, 3).map((line) => line.lineId),
        "settlement source ingestion order"
      )
    },
    {
      label: "POD retrieval",
      recordIds: selectedDecision.recordIds.filter((recordId) => recordId.startsWith("POD-")),
      status: "complete",
      timestamp: journeyStepLabel(1, 6),
      provenance: journeyProvenance(
        "POD retrieval",
        selectedDecision.recordIds.filter((recordId) => recordId.startsWith("POD-")),
        "retrieval.docs evidence document records",
        selectedDecision.recordIds
      )
    },
    {
      label: "Contract read",
      recordIds: selectedDecision.recordIds.filter((recordId) => recordId.startsWith("INV-")),
      status: "complete",
      timestamp: journeyStepLabel(2, 6),
      provenance: journeyProvenance(
        "Contract read",
        selectedDecision.recordIds.filter((recordId) => recordId.startsWith("INV-")),
        "SAP invoice and contract evidence records",
        selectedDecision.recordIds
      )
    },
    {
      label: "TPM match",
      recordIds: selectedDecision.evidenceDocuments
        .filter((document) => document.source === "tpm")
        .map((document) => document.documentId),
      status: "complete",
      timestamp: journeyStepLabel(3, 6),
      provenance: journeyProvenance(
        "TPM match",
        selectedDecision.evidenceDocuments
          .filter((document) => document.source === "tpm")
          .map((document) => document.documentId),
        "retrieval.tpm evidence document records",
        selectedDecision.recordIds
      )
    },
    {
      label: "Assemble",
      recordIds: selectedDecision.recordIds,
      status: "complete",
      timestamp: journeyStepLabel(4, 6),
      provenance: journeyProvenance("Assemble", selectedDecision.recordIds, "selected decision evidence pack assembly")
    },
    {
      label: "Scored",
      recordIds: selectedDecision.recordIds,
      status: "pending human",
      timestamp: journeyStepLabel(5, 6),
      provenance: journeyProvenance("Scored", selectedDecision.recordIds, "deduction verdict and routing decision basis")
    }
  ];
}

function buildRetrievalStatusRows(
  evidenceDocuments: DeductionDecision["evidenceDocuments"]
): ForensicsCockpitModel["retrievalStatus"] {
  const documentsBySourceLabel = new Map<string, DeductionDecision["evidenceDocuments"]>();

  for (const document of evidenceDocuments) {
    const sourceLabel = evidenceSourceLabels[document.source];
    documentsBySourceLabel.set(sourceLabel, [...(documentsBySourceLabel.get(sourceLabel) ?? []), document]);
  }

  return [...documentsBySourceLabel.entries()].map(([sourceLabel, documents]) => {
    const recordIds = uniqueStrings(documents.flatMap((document) => document.recordIds));

    return {
      source: sourceLabel,
      status: "ready",
      count: documents.length,
      provenance: businessProvenance(`retrievalStatus.${sourceLabel}`, {
        sourceKind: "derived_backend",
        sourceName: `${sourceLabel} selected evidence records`,
        recordIds,
        deterministicBasis: "grouped selected decision evidenceDocuments by sourceLabel; trace status events lack row-level record IDs"
      })
    };
  });
}

function journeyProvenance(
  label: string,
  recordIds: string[],
  deterministicBasis: string,
  fallbackRecordIds: string[] = recordIds
): MayaFieldProvenance {
  return businessProvenance(`mayaJourney.${label}`, {
    sourceKind: "derived_backend",
    sourceName: "Maya forensics journey read model",
    recordIds: recordIds.length > 0 ? recordIds : fallbackRecordIds,
    deterministicBasis
  });
}

function traceContextProvenance(toolName: string, recordIds: string[]): MayaFieldProvenance {
  return businessProvenance(`multimodalDock.subAgents.${toolName}`, {
    sourceKind: "agent_trace",
    sourceName: "Forensics trace context read model",
    recordIds,
    deterministicBasis: `runForensicsInvestigation trace context grouped by ${toolName}`
  });
}

function queryPromptProvenance(
  fieldName: string,
  recordIds: string[],
  deterministicBasis: string
): MayaFieldProvenance {
  return businessProvenance(`multimodalDock.promptSuggestions.${fieldName}`, {
    sourceKind: "agent_trace",
    sourceName: "Maya query prompt read model",
    recordIds,
    deterministicBasis
  });
}

function containmentProvenance(
  candidate: CrestlineM6ContainmentAssessment,
  deterministicBasis: string
): MayaFieldProvenance {
  return businessProvenance(`containmentPanel.${deterministicBasis}`, {
    sourceKind: "derived_backend",
    sourceName: "Behavioral containment assessment read model",
    recordIds: candidate.recordIds,
    deterministicBasis
  });
}

function evidenceDocumentSourceKind(
  source: DeductionDecision["evidenceDocuments"][number]["source"]
): MayaFieldProvenance["sourceKind"] {
  if (source === "sap") {
    return "sap_odata";
  }
  if (source === "supabase") {
    return "supabase";
  }

  return "supabase";
}

function connectorReadinessRecordIds(connectors: ConnectorReadiness[]): string[] {
  return uniqueStrings(
    connectors.flatMap((connector) => [
      connector.name,
      ...connector.requiredInputs,
      ...(connector.sourceTableName === undefined ? [] : [connector.sourceTableName]),
      ...(connector.toolDataTableNames ?? [])
    ])
  );
}

function evidenceDocumentView(document: DeductionDecision["evidenceDocuments"][number], index: number) {
  return {
    citationId: citationId(document.source, index),
    description: document.summary,
    documentId: document.documentId,
    documentType: document.documentType,
    provenance: businessProvenance(`selected.evidencePack.documents.${document.documentId}`, {
      sourceKind: evidenceDocumentSourceKind(document.source),
      sourceName: evidenceSourceLabels[document.source],
      recordIds: document.recordIds,
      deterministicBasis: `evidence document ${document.documentId} returned by ${document.source} retrieval source`
    }),
    relevance: index === 0 ? "Primary" : "Supporting",
    sourceLabel: evidenceSourceLabels[document.source],
    summary: document.summary,
    verifiedLabel: "Verified"
  };
}

function buildTraceContextRows(
  selectedDecision: DeductionDecision,
  trace: ForensicsTraceEvent[]
): ForensicsCockpitModel["multimodalDock"]["subAgents"] {
  const documents = selectedDecision.evidenceDocuments;
  const podDocuments = documents.filter((document) => document.documentType === "POD");
  const sapDocuments = documents.filter((document) => document.source === "sap");
  const contractDocuments = documents.filter((document) => document.documentType === "contract");
  const tpmDocuments = documents.filter((document) => document.source === "tpm");
  const toolStatusCount = (toolName: string): number =>
    trace.filter((event) => event.type === "status" && event.payload.toolName === toolName).length;

  return [
    {
      name: "POD-Retriever",
      source: "Forensics trace",
      query: "retrieval.docs evidence context",
      artifacts: String(toolStatusCount("retrieval.docs")),
      keyArtifact: podDocuments[0]?.documentId ?? "No POD returned",
      statusLabel: podDocuments.length > 0 ? "Completed" : "No match",
      provenance: traceContextProvenance("retrieval.docs", selectedDecision.recordIds)
    },
    {
      name: "Contract-Reader",
      source: "Forensics trace",
      query: "retrieval.sap invoice context",
      artifacts: String(toolStatusCount("retrieval.sap")),
      keyArtifact: contractDocuments[0]?.documentId ?? sapDocuments[0]?.documentId ?? "No contract required",
      statusLabel: contractDocuments.length > 0 || sapDocuments.length > 0 ? "Completed" : "No match",
      provenance: traceContextProvenance("retrieval.sap", selectedDecision.recordIds)
    },
    {
      name: "TPM-Matcher",
      source: "Forensics trace",
      query: "retrieval.tpm promotion context",
      artifacts: String(toolStatusCount("retrieval.tpm")),
      keyArtifact: tpmDocuments[0]?.documentId ?? "No TPM artifact required",
      statusLabel: tpmDocuments.length > 0 ? "Completed" : "Not applicable",
      provenance: traceContextProvenance("retrieval.tpm", selectedDecision.recordIds)
    }
  ];
}

function buildQueryPromptSuggestions(
  selectedDecision: DeductionDecision,
  trace: ForensicsTraceEvent[]
): ForensicsCockpitModel["multimodalDock"]["promptSuggestions"] {
  const traceRows = buildTraceContextRows(selectedDecision, trace);
  const sourcePrompts = selectedDecision.evidenceDocuments.slice(0, 2).map((document) => {
    const sourceLabel = evidenceSourceLabels[document.source];
    const recordIds = uniqueStrings(document.recordIds.length > 0 ? document.recordIds : selectedDecision.recordIds);

    return {
      label: `${sourceLabel} evidence`,
      question: `What does the ${sourceLabel} evidence say about this selected deduction?`,
      recordIds,
      provenance: queryPromptProvenance(
        document.documentId,
        recordIds,
        `prompt derived from selected decision ${selectedDecision.decisionId} evidence document ${document.documentId}`
      )
    };
  });
  const handoffTrace = traceRows.find((row) => row.name === "Contract-Reader") ?? traceRows[0];
  const routeRecordIds = uniqueStrings(selectedDecision.recordIds);

  return [
    ...sourcePrompts,
    {
      label: handoffTrace === undefined ? "Decision basis" : `${handoffTrace.name} basis`,
      question: "Which cited records support the current route and human approval gate?",
      recordIds: routeRecordIds,
      provenance: queryPromptProvenance(
        "decision-route",
        routeRecordIds,
        `prompt derived from selected decision ${selectedDecision.decisionId} route ${selectedDecision.routing} and grouped trace context`
      )
    }
  ];
}

function buildSourceReadinessTiles(
  connectors: ConnectorReadiness[],
  sourceHealth: readonly SourceHealthResult[],
  mcpReadiness: McpReadinessStatus | undefined
): SourceReadinessTile[] {
  const connectorsByName = new Map(connectors.map((connector) => [connector.name, connector]));
  const healthBySourceName = new Map(sourceHealth.map((health) => [health.sourceName, health]));
  const checkedAtIso = mostRecentSourceHealthCheckedAt(sourceHealth) ?? new Date().toISOString();
  const sap = requiredConnector(connectorsByName, "sap-odata");
  const tpm = requiredConnector(connectorsByName, "tpm");
  const bureau = requiredConnector(connectorsByName, "bureau");
  const remittance = requiredConnector(connectorsByName, "remittance");
  const edi = requiredConnector(connectorsByName, "edi-remittance");
  const docs = requiredConnector(connectorsByName, "docs-repo");
  const sourceTileOrder = [
    sourceTileFromConnector(sap, requiredSourceHealth(healthBySourceName, sap.name)),
    sourceTileFromConnector(tpm, requiredSourceHealth(healthBySourceName, tpm.name)),
    podSourceTile(requiredSourceHealth(healthBySourceName, docs.name)),
    sourceTileFromConnector(bureau, requiredSourceHealth(healthBySourceName, bureau.name)),
    remittanceEdiTile(
      remittance,
      edi,
      requiredSourceHealth(healthBySourceName, remittance.name),
      requiredSourceHealth(healthBySourceName, edi.name)
    ),
    sourceTileFromConnector(docs, requiredSourceHealth(healthBySourceName, docs.name)),
    mcpSourceTile(checkedAtIso, mcpReadiness, healthBySourceName.get("mcp"))
  ];

  return sourceTileOrder;
}

function mcpSourceTile(
  sourceCheckedAtIso: string,
  mcpReadiness: McpReadinessStatus | undefined,
  mcpHealthSnapshot: SourceHealthResult | undefined
): SourceReadinessTile {
  if (mcpReadiness === undefined && mcpHealthSnapshot !== undefined) {
    return mcpSourceTileFromHealth(mcpHealthSnapshot);
  }

  const serviceToolRecordIds = Object.keys(serviceToolMetadata);
  if (mcpReadiness === undefined || mcpReadiness.status === "unavailable") {
    const checkedAtIso = mcpReadiness?.checkedAtIso ?? sourceCheckedAtIso;
    const detail = mcpReadiness?.lastError ?? "MCP health endpoint is not configured or has not been probed.";
    const stateLabel = mcpReadiness?.proofItems.includes("mcp health probe failed") === true
      ? "Probe failed"
      : "Status unavailable";

    return {
      checkedAtIso,
      detail,
      key: "mcp",
      label: "MCP",
      mark: "M",
      modeLabel: "Read-only tools",
      proofItems: uniqueStrings([
        ...(mcpReadiness?.proofItems ?? ["mcp health unavailable"]),
        "tools filtered",
        "draft-only actions",
        "no ERP write-back"
      ]),
      provenance: businessProvenance("sourceTiles.mcp", {
        sourceKind: "derived_backend",
        sourceName: "MCP health readiness",
        recordIds: serviceToolRecordIds,
        deterministicBasis:
          "MCP SourceReadinessTile failed closed because the MCP health endpoint was unavailable; read-only proof still comes from serviceToolMetadata visibility and sideEffectClass values"
      }),
      stateLabel,
      statusTone: "blocked",
      summary: stateLabel
    };
  }

  const healthRecordIds = uniqueStrings([
    ...serviceToolRecordIds,
    ...(mcpReadiness.endpoint === undefined ? [] : [mcpReadiness.endpoint]),
    ...(mcpReadiness.transport === undefined ? [] : [mcpReadiness.transport])
  ]);

  if (mcpReadiness.status === "blocked") {
    return {
      checkedAtIso: mcpReadiness.checkedAtIso,
      detail: mcpReadiness.lastError,
      key: "mcp",
      label: "MCP",
      mark: "M",
      modeLabel: "Read-only tools",
      proofItems: uniqueStrings([...mcpReadiness.proofItems, "tools filtered", "draft-only actions", "no ERP write-back"]),
      provenance: businessProvenance("sourceTiles.mcp", {
        sourceKind: "derived_backend",
        sourceName: "MCP health readiness",
        recordIds: healthRecordIds,
        deterministicBasis:
          "MCP SourceReadinessTile blocked from MCP health probe status and serviceToolMetadata read-only proof; no ERP write-back path is exposed"
      }),
      stateLabel: mcpReadiness.proofItems.includes("mcp health probe failed") ? "Probe failed" : "Setup",
      statusTone: "blocked",
      summary: mcpReadiness.proofItems.includes("mcp health probe failed") ? "Health probe failed" : "Health unavailable"
    };
  }

  const mcpEndpoint = mcpReadiness.endpoint ?? "unknown endpoint";
  const mcpTransport = mcpReadiness.transport ?? "unknown transport";
  const mcpSessionMode = mcpReadiness.sessionMode ?? "unknown session mode";

  return {
    checkedAtIso: mcpReadiness.checkedAtIso,
    detail: `MCP health reachable at ${mcpEndpoint} with ${mcpTransport}/${mcpSessionMode}.`,
    key: "mcp",
    label: "MCP",
    mark: "M",
    modeLabel: "Read-only tools",
    proofItems: uniqueStrings([
      "mcp healthz reachable",
      "auth configured",
      "tools filtered",
      "draft-only actions",
      "no ERP write-back"
    ]),
    provenance: businessProvenance("sourceTiles.mcp", {
      sourceKind: "derived_backend",
      sourceName: "MCP health readiness",
      recordIds: healthRecordIds,
      deterministicBasis:
        "MCP SourceReadinessTile connected only after /healthz returned authConfigured true plus endpoint/sessionMode/transport metadata; serviceToolMetadata proves read-only/draft-only visibility and no ERP write-back"
    }),
    stateLabel: "Connected",
    statusTone: "ready",
    summary: "Read-only tools gated"
  };
}

function mcpSourceTileFromHealth(health: SourceHealthResult): SourceReadinessTile {
  const serviceToolRecordIds = Object.keys(serviceToolMetadata);
  const stateLabel = sourceHealthStateLabel(health);
  const statusTone = sourceHealthStatusTone(health);
  const isConnected = health.status === "connected" && stateLabel === "Connected";

  return {
    checkedAtIso: health.checkedAtIso,
    detail: health.lastError ?? "MCP status loaded from saved source-health snapshot.",
    key: "mcp",
    label: "MCP",
    mark: "M",
    modeLabel: "Read-only tools",
    proofItems: uniqueStrings([...health.proofItems, "tools filtered", "draft-only actions", "no ERP write-back"]),
    provenance: businessProvenance("sourceTiles.mcp", {
      sourceKind: "supabase",
      sourceName: "MCP source-health snapshot",
      recordIds: uniqueStrings([...serviceToolRecordIds, ...health.recordIds]),
      deterministicBasis:
        "MCP SourceReadinessTile rendered from saved recoup_source_health_snapshots state plus serviceToolMetadata read-only/draft-only proof; no page-load MCP probe is required",
      checkedAtIso: health.checkedAtIso
    }),
    stateLabel,
    statusTone,
    summary: isConnected ? "Read-only tools gated" : sourceHealthSummary(health)
  };
}

function sourceTileFromConnector(connector: ConnectorReadiness, health: SourceHealthResult): SourceReadinessTile {
  const display = connectorDisplay[connector.name];
  const statusTone = sourceHealthStatusTone(health);

  return {
    checkedAtIso: health.checkedAtIso,
    detail: health.lastError ?? connector.reason,
    key: display.key,
    label: display.label,
    mark: display.mark,
    modeLabel: sourceHealthModeLabel(health),
    proofItems: health.proofItems,
    provenance: sourceHealthProvenance(`sourceTiles.${display.key}`, display.label, health),
    stateLabel: sourceHealthStateLabel(health),
    statusTone,
    summary: sourceHealthSummary(health)
  };
}

function remittanceEdiTile(
  remittance: ConnectorReadiness,
  edi: ConnectorReadiness,
  remittanceHealth: SourceHealthResult,
  ediHealth: SourceHealthResult
): SourceReadinessTile {
  const remittanceTile = sourceTileFromConnector(remittance, remittanceHealth);
  const ediTile = sourceTileFromConnector(edi, ediHealth);
  const statusTone: SourceReadinessTile["statusTone"] =
    remittanceTile.statusTone === "blocked" || ediTile.statusTone === "blocked"
      ? "blocked"
      : remittanceTile.statusTone === "synthetic" || ediTile.statusTone === "synthetic"
        ? "synthetic"
        : "ready";

  return {
    detail: `${remittance.reason} ${edi.reason}`,
    checkedAtIso: mostRecentSourceHealthCheckedAt([remittanceHealth, ediHealth]) ?? remittanceHealth.checkedAtIso,
    key: "remittance-edi",
    label: "Remittance / EDI",
    mark: "R",
    modeLabel: statusTone === "ready" ? "Live read" : "Proxy - Supabase",
    proofItems: uniqueStrings([...remittanceTile.proofItems, ...ediTile.proofItems]),
    provenance: businessProvenance("sourceTiles.remittance-edi", {
      sourceKind: remittanceHealth.status === "connected" && ediHealth.status === "connected" ? "supabase" : "derived_backend",
      sourceName: "Supabase remittance and EDI source health",
      recordIds: uniqueStrings([...remittanceHealth.recordIds, ...ediHealth.recordIds]),
      deterministicBasis: `merged remittance and edi-remittance SourceHealthResult statuses ${remittanceHealth.status}/${ediHealth.status} from ConnectorReadiness credential/schema probe/read-only proof flags`,
      checkedAtIso: mostRecentSourceHealthCheckedAt([remittanceHealth, ediHealth]) ?? remittanceHealth.checkedAtIso
    }),
    stateLabel: statusTone === "blocked" ? "Setup" : statusTone === "synthetic" ? "Proxy - Supabase" : "Connected",
    statusTone,
    summary: statusTone === "blocked" ? "Input required" : "Payment advice verified"
  };
}

function podSourceTile(docsHealth: SourceHealthResult): SourceReadinessTile {
  const statusTone = sourceHealthStatusTone(docsHealth);

  return {
    checkedAtIso: docsHealth.checkedAtIso,
    detail: docsHealth.lastError ?? "POD artifacts follow the governed document repository source health.",
    key: "pod-3pl",
    label: "3PL POD",
    mark: "P",
    modeLabel: docsHealth.sourceMode === "synthetic_static_table" ? "Proxy - Supabase" : sourceHealthModeLabel(docsHealth),
    proofItems: uniqueStrings([...docsHealth.proofItems, "POD evidence source"]),
    provenance: businessProvenance("sourceTiles.pod-3pl", {
      sourceKind: docsHealth.status === "connected" ? "supabase" : "derived_backend",
      sourceName: "POD document source health",
      recordIds: docsHealth.recordIds,
      deterministicBasis: `POD tile derived from docs-repo SourceHealthResult status ${docsHealth.status} from ConnectorReadiness credential/schema probe/read-only proof flags`,
      checkedAtIso: docsHealth.checkedAtIso
    }),
    stateLabel: sourceHealthStateLabel(docsHealth),
    statusTone,
    summary: sourceHealthSummary(docsHealth)
  };
}

function requiredConnector(
  connectorsByName: Map<ConnectorReadiness["name"], ConnectorReadiness>,
  name: ConnectorReadiness["name"]
): ConnectorReadiness {
  const connector = connectorsByName.get(name);
  if (connector === undefined) {
    throw new Error(`Missing connector readiness for ${name}.`);
  }

  return connector;
}

function requiredSourceHealth(
  healthBySourceName: Map<string, SourceHealthResult>,
  sourceName: ConnectorReadiness["name"]
): SourceHealthResult {
  const health = healthBySourceName.get(sourceName);
  if (health === undefined) {
    throw new Error(`Missing source health for ${sourceName}.`);
  }

  return health;
}

function sourceHealthStatusTone(health: SourceHealthResult): SourceReadinessTile["statusTone"] {
  if (health.proofItems.includes("source-health refresh overdue")) {
    return "blocked";
  }

  if (health.status !== "connected") {
    return "blocked";
  }

  return health.sourceMode === "synthetic_static_table" ? "synthetic" : "ready";
}

function sourceHealthModeLabel(health: SourceHealthResult): string {
  if (health.sourceMode === "live") {
    return "Live read";
  }

  if (health.sourceMode === "synthetic_static_table") {
    return "Proxy - Supabase";
  }

  return "Unavailable";
}

function sourceHealthStateLabel(health: SourceHealthResult): string {
  if (health.proofItems.includes("source-health refresh overdue")) {
    return "Refresh overdue";
  }

  if (health.proofItems.includes("source-health status unavailable")) {
    return "Status unavailable";
  }

  if (health.status !== "connected") {
    if (health.proofItems.includes("source probe failed")) {
      return "Probe failed";
    }

    return "Status unavailable";
  }

  return health.sourceMode === "synthetic_static_table" ? "Proxy - Supabase" : "Connected";
}

function sourceHealthSummary(health: SourceHealthResult): string {
  if (health.proofItems.includes("source-health refresh overdue")) {
    return "Refresh overdue";
  }

  if (health.proofItems.includes("source-health status unavailable")) {
    return "Status unavailable";
  }

  if (health.status === "blocked") {
    if (health.proofItems.includes("source probe failed")) {
      return "Live probe failed";
    }

    return "Status unavailable";
  }

  if (health.status === "degraded") {
    return "Probe degraded";
  }

  return health.sourceMode === "synthetic_static_table" ? "Schema verified" : "Connected";
}

function sourceHealthProvenance(
  fieldName: string,
  sourceLabel: string,
  health: SourceHealthResult
): MayaFieldProvenance {
  const snapshotBasis = health.proofItems.includes("supabase source-health snapshot")
    ? " and supabase source-health snapshot proof"
    : "";

  return businessProvenance(fieldName, {
    sourceKind: sourceHealthProvenanceKind(health),
    sourceName: `${sourceLabel} source health`,
    recordIds: health.recordIds,
    deterministicBasis: `SourceHealthResult status ${health.status} from ConnectorReadiness credential/schema probe/read-only proof flags${snapshotBasis} and sourceMode ${health.sourceMode}`,
    checkedAtIso: health.checkedAtIso
  });
}

function sourceHealthProvenanceKind(health: SourceHealthResult): MayaFieldProvenance["sourceKind"] {
  if (health.status !== "connected") {
    return "derived_backend";
  }

  if (health.sourceName === "sap-odata") {
    return "sap_odata";
  }

  if (health.sourceMode === "synthetic_static_table") {
    return "supabase";
  }

  return "derived_backend";
}

function mostRecentSourceHealthCheckedAt(sourceHealth: readonly SourceHealthResult[] | undefined): string | undefined {
  if (sourceHealth === undefined || sourceHealth.length === 0) {
    return undefined;
  }

  return sourceHealth.reduce((latest, health) => {
    return Date.parse(health.checkedAtIso) >= Date.parse(latest) ? health.checkedAtIso : latest;
  }, sourceHealth[0]?.checkedAtIso ?? "");
}

const partialHoldCriterionLabels = {
  customerStrategicValue: "Strategic value",
  dsoPaymentDrift: "Payment drift",
  orderMargin: "Order margin",
  orderValueVsExposure: "Order exposure",
  paymentPattern: "Payment pattern",
  revenueForecast: "Revenue forecast"
} as const;

const functionLabels = {
  billing: "Billing",
  collections: "Collections",
  credit: "Credit",
  fulfillment: "Fulfillment"
} as const;

const connectorDisplay: Record<ConnectorReadiness["name"], { key: string; label: string; mark: string }> = {
  bureau: { key: "bureau", label: "Bureau", mark: "B" },
  "docs-repo": { key: "contract-repo", label: "Contract Repo", mark: "C" },
  "edi-remittance": { key: "remittance-edi", label: "EDI remittance", mark: "E" },
  remittance: { key: "remittance-edi", label: "Remittance", mark: "R" },
  "sap-odata": { key: "sap-odata", label: "SAP OData", mark: "S" },
  tpm: { key: "tpm", label: "TPM", mark: "T" }
};

const evidenceSourceLabels: Record<DeductionDecision["evidenceDocuments"][number]["source"], string> = {
  bureau: "Bureau",
  docs: "Contract Repo",
  remittance: "Remittance",
  sap: "SAP OData",
  supabase: "Supabase fallback",
  tpm: "TPM"
};

const verdictLabels: Record<string, string> = {
  invalid: "Recovery",
  partial: "Partial recovery",
  valid: "Valid deduction"
};

const routingLabels: Record<string, string> = {
  billing: "Route to Billing draft",
  recovery: "Recovery draft staged"
};

const actionLabels: Record<string, string> = {
  "draft-rebill": "Recovery draft staged",
  "route-billing": "Route to Billing draft"
};

const statusLabels: Record<string, string> = {
  pending_human: "Awaiting reviewer"
};

const traceAuditLabels: Record<string, string> = {
  "arbitration.blocked": "Risk Mesh arbitration blocked",
  "partial-hold.proposed": "Partial hold proposal audited",
  "sentinel.blocked-risk": "Sentinel blocked risk recorded",
  "terms.proposed": "Terms proposal audited"
};

const cfoOpenDependencies = [
  "verify-prod-calibration",
  "verify-embeddings-model-id",
  "verify-codex-build-model-id",
  "verify-sap-sandbox-instance",
  "verify-v3-live-non-sap-contracts"
] as const;

const cfoDependencyLabels: Record<(typeof cfoOpenDependencies)[number], { impact: string; label: string; owner: string }> = {
  "verify-codex-build-model-id": {
    impact: "Pins build-time model provenance",
    label: "Build model pinning",
    owner: "Build provenance owner"
  },
  "verify-embeddings-model-id": {
    impact: "Locks retrieval embedding provenance",
    label: "Embeddings model identity",
    owner: "AI provenance owner"
  },
  "verify-prod-calibration": {
    impact: "Blocks public arbitration proof",
    label: "Production calibration proof",
    owner: "Finance proof owner"
  },
  "verify-sap-sandbox-instance": {
    impact: "Blocks live SAP read validation",
    label: "SAP sandbox read access",
    owner: "SAP integration owner"
  },
  "verify-v3-live-non-sap-contracts": {
    impact: "Blocks non-SAP source proof",
    label: "Non-SAP source contracts",
    owner: "Source contract owner"
  }
};

function dependencyView(dependencyId: (typeof cfoOpenDependencies)[number]) {
  const dependency = cfoDependencyLabels[dependencyId];

  return {
    dependencyId,
    impact: dependency.impact,
    label: dependency.label,
    owner: dependency.owner,
    status: "Open proof",
    timing: "Not scheduled"
  };
}

function cfoHumanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function cfoExecutiveBasis(value: string): string {
  if (value.includes("verify-prod-calibration")) {
    return "Calibration proof required";
  }

  if (value.includes("hash-chain")) {
    return "Hash-chain verification";
  }

  if (value.includes("draft-only")) {
    return "Draft route governance";
  }

  if (value.includes("computed recovery")) {
    return "Computed recovery deltas";
  }

  return value;
}

function cfoRecordCountLabel(count: number): string {
  return `${String(count)} ${count === 1 ? "citation" : "citations"}`;
}

function cfoExecutiveMetadataValue(label: string, value: string): string {
  const lowerValue = value.toLowerCase();

  if (lowerValue.includes("supabase settlement source rows")) {
    return "Supabase settlement source rows plus governed read models";
  }

  if (label === "Dataset" || lowerValue.includes("recoup_deduction_lines")) {
    return "Supabase settlement source";
  }

  if (value.includes("HITL")) {
    return value.replaceAll("HITL approval", "human approval").replaceAll("HITL", "human approval");
  }

  if (value.includes("record ID")) {
    return value.replaceAll("record IDs", "citations").replaceAll("record ID", "citation");
  }

  return value;
}

function actionLabel(actionType: string): string {
  return actionLabels[actionType] ?? labelFromRecordId(actionType);
}

function confidenceDisplayValue(confidence: DeductionDecision["confidence"]): string {
  return typeof confidence === "string" ? confidence : confidence.score;
}

function confidenceLabel(confidence: DeductionDecision["confidence"]): string {
  const displayValue = confidenceDisplayValue(confidence);
  return displayValue.toLowerCase().includes("threshold") ? "Threshold required" : displayValue;
}

function operationalValue(value: string): string {
  return value === "Pending ERP" ? "Scoped source" : value;
}

function citationId(source: DeductionDecision["evidenceDocuments"][number]["source"], index: number): string {
  const prefixBySource = {
    bureau: "B",
    docs: "P",
    remittance: "R",
    sap: "S",
    supabase: "U",
    tpm: "T"
  } satisfies Record<DeductionDecision["evidenceDocuments"][number]["source"], string>;
  const prefix = prefixBySource[source];

  return `${prefix}${String(index + 1)}`;
}

function routingLabel(routing: string): string {
  return routingLabels[routing] ?? labelFromRecordId(routing);
}

function statusLabel(status: string): string {
  return statusLabels[status] ?? labelFromRecordId(status);
}

function signalTone(score: string): CreditCommandTone {
  const numericScore = Number(score);
  if (Number.isNaN(numericScore)) {
    return "pending";
  }

  if (numericScore >= 70) {
    return "healthy";
  }

  if (numericScore >= 50) {
    return "warning";
  }

  return "blocked";
}

function traceAuditLabel(entryType: string): string {
  return traceAuditLabels[entryType] ?? labelFromRecordId(entryType);
}

function traceAuditStatus(entry: AuditEntry): string {
  const status = entry.payload.status;
  const resolution = entry.payload.resolution;
  if (typeof status === "string") {
    return status;
  }
  if (typeof resolution === "string") {
    return resolution;
  }

  return "recorded";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function journeyStepLabel(index: number, total: number): string {
  return `Step ${String(index + 1)}/${String(total)}`;
}

function riskMeshAuditHashes(auditEntries: AuditEntry[]) {
  const arbitrationEntry = auditEntries.find((entry) => entry.entryType === "arbitration.blocked" || entry.entryType === "arbitration.ranked");
  const chainHeadEntry = auditEntries.at(-1);
  if (arbitrationEntry === undefined || chainHeadEntry === undefined) {
    throw new Error("Risk Mesh audit trail requires arbitration and chain-head entries.");
  }

  return {
    arbitrationHash: arbitrationEntry.entryHash,
    chainHeadHash: chainHeadEntry.entryHash,
    entryHashes: auditEntries.map((entry) => entry.entryHash)
  };
}

function riskMeshArbitrationReason(arbitration: { reason?: string; resolution?: string; status: string }): string {
  if (arbitration.status === "blocked" && arbitration.reason !== undefined) {
    return arbitration.reason;
  }
  if (arbitration.status === "ranked" && arbitration.resolution !== undefined) {
    return `ranked-resolution:${arbitration.resolution}`;
  }

  return arbitration.status;
}

function riskMeshArbitrationDisplayReason(arbitration: { resolution?: string; status: string }): string {
  if (arbitration.status === "ranked" && arbitration.resolution !== undefined) {
    return `Ranked resolution: ${labelFromRecordId(arbitration.resolution)}`;
  }

  return "Production calibration proof required";
}

function verdictLabel(verdict: string): string {
  return verdictLabels[verdict] ?? labelFromRecordId(verdict);
}

function weightLabel(weight: string): string {
  const numericWeight = Number(weight);
  if (Number.isNaN(numericWeight)) {
    return weight;
  }

  return `${String(Math.round(numericWeight * 100))}%`;
}

function labelFromRecordId(recordId: string): string {
  return recordId
    .replace(/^CUST-/u, "")
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0] ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function shortHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function formatMoney(value: Money): string {
  const fixed = value.toDecimalPlaces(2).toFixed(2);
  const [whole = "0", fractional = "00"] = fixed.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `$${groupedWhole}.${fractional}`;
}
