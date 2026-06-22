import { createHash } from "node:crypto";
import type { AuditEntry } from "../audit/trail.js";
import {
  buildConnectorReadiness,
  type ConnectorReadiness,
  type SupabaseToolDataSchemaProbe
} from "../adapters/connectorRegistry.js";
import { buildSyntheticDataset } from "../adapters/syntheticData.js";
import { recoupAgentRoster } from "../agents/agentRuntime.js";
import { assessCrestlineM6Containment, type CrestlineM6ContainmentAssessment } from "../agents/containment.js";
import { runForensicsInvestigation, type DeductionDecision, type ForensicsTraceEvent } from "../agents/forensics.js";
import { recoupHandoffGraph } from "../agents/handoffGraph.js";
import { buildHarborRiskMeshProposalContext, runRiskMeshClosedLoop } from "../agents/riskMesh.js";
import { memoryCategories, type MemoryCategory, type MemoryRecord } from "../memory/schema.js";
import type { Money } from "../types/money.js";
import { cockpitDemoProfiles } from "../../config/cockpitDemoProfiles.js";

export type ApprovalAction = "approve" | "modify" | "reject";
export type ForensicsSseEvent = ForensicsTraceEvent;

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

export interface ForensicsCockpitModel {
  surface: "forensics-analyst";
  kpiStrip: Array<{
    label: string;
    support: string;
    value: string;
  }>;
  worklist: WorklistItem[];
  selected: {
    lineId: string;
    evidencePack: {
      recordIds: string[];
      documents: Array<{
        citationId: string;
        description: string;
        documentId: string;
        documentType: string;
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
    };
    approvalActions: Array<{
      decision: ApprovalAction;
      label: string;
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
  }>;
  multimodalDock: {
    languageLabel: string;
    modeOptions: string[];
    policyLabel: string;
    promptPlaceholder: string;
    transcript: {
      english: string;
      native: string;
    };
    subAgents: Array<{
      artifacts: string;
      keyArtifact: string;
      name: string;
      query: string;
      source: string;
      statusLabel: string;
    }>;
  };
  mayaJourney: Array<{
    label: string;
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
  };
  retrievalStatus: Array<{ source: string; status: "ready"; count: number }>;
  containmentPanel: {
    actionPostureLabel: string;
    behavioralEvidenceIds: string[];
    basisRows: Array<{ label: string; value: string }>;
    componentReadoutLabel: string;
    customerId: string;
    customerLabel: string;
    handoff: {
      label: string;
      recordIds: string[];
      status: string;
      target: string;
    };
    intentLabel: string;
    postureLabel: string;
    recordIds: string[];
    recordStripLabel: string;
    statusLabel: string;
  };
  whatChanged: string;
  aiInsight: string;
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
  confidence: string;
  confidenceLabel: string;
  evidenceScoreLabel: string;
  evidenceLabel: string;
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
  provenance: "deterministic_demo_memory" | "persisted_runtime_memory";
  records: Array<{
    id: string;
    category: MemoryCategory;
    trustLevel: "trusted" | "semi_trusted" | "untrusted";
    scope: string;
    recordIds: string[];
  }>;
  sourceMode: "deterministic_demo_fallback" | "runtime_persisted";
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
  lastRefreshedLabel: string;
  sourceTiles: SourceReadinessTile[];
}

export interface SourceReadinessTile {
  detail: string;
  key: string;
  label: string;
  mark: string;
  modeLabel: string;
  proofItems: string[];
  stateLabel: string;
  statusTone: "ready" | "synthetic" | "blocked";
  summary: string;
}

export function buildForensicsCockpitModel(): ForensicsCockpitModel {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const run = runForensicsInvestigation();
  const containmentCandidate = run.containmentCandidates[0];
  if (containmentCandidate === undefined) {
    throw new Error("Forensics cockpit requires the Crestline M6 containment candidate.");
  }
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
    kpiStrip: [
      { label: "Open scenarios", value: String(dataset.manifest.scenarioIds.length), support: `${String(dataset.rollup.totalLines)} lines collapsed` },
      { label: "Exposure", value: formatMoney(dataset.rollup.totalAmount), support: "USD" },
      { label: "Recovery queue", value: formatMoney(dataset.rollup.recoveryAmount), support: `${String(dataset.rollup.recoveryLines)} drafts` },
      { label: "Billing protection", value: formatMoney(dataset.rollup.validAmount), support: `${String(dataset.rollup.validLines)} route-to-Billing drafts` },
      { label: "Pending decisions", value: String(run.actions.length), support: "HITL required" },
      { label: "Evidence sources", value: String(3), support: "SAP, Docs, TPM" }
    ],
    worklist: buildScenarioWorklist(dataset, run.decisions),
    selected: {
      lineId: selectedDecision.lineId,
      evidencePack: {
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
        basis: selectedAction.basis
      },
      approvalActions: [
        { decision: "approve", label: "Approve draft", requiresReason: false },
        { decision: "modify", label: "Modify", requiresReason: true },
        { decision: "reject", label: "Reject", requiresReason: true }
      ]
    },
    actionInbox: run.actions.map((action) => ({
      actionId: action.actionId,
      actionLabel: actionLabel(action.actionType),
      actionType: action.actionType,
      lineId: action.lineId,
      amount: formatMoney(action.proposedAmount),
      status: action.status,
      statusLabel: statusLabel(action.status),
      basis: action.basis
    })),
    multimodalDock: {
      languageLabel: "Spanish ready",
      modeOptions: ["Type", "Talk"],
      policyLabel: "voice/text citation parity",
      promptPlaceholder: "Ask why this deduction is invalid, with cited evidence only.",
      transcript: {
        native: "¿Por qué es inválida esta deducción?",
        english: "Why is this deduction invalid? Answer from the cited POD and invoice records only."
      },
      subAgents: buildMultimodalSubAgents(selectedDecision)
    },
    mayaJourney: [
      {
        label: "Ingest",
        recordIds: ["SYNTHETIC-SEED-42"],
        status: "complete",
        timestamp: "08:15"
      },
      {
        label: "POD retrieval",
        recordIds: selectedDecision.recordIds.filter((recordId) => recordId.startsWith("POD-")),
        status: "complete",
        timestamp: "08:18"
      },
      {
        label: "Contract read",
        recordIds: selectedDecision.recordIds.filter((recordId) => recordId.startsWith("INV-")),
        status: "complete",
        timestamp: "08:21"
      },
      {
        label: "TPM match",
        recordIds: selectedDecision.evidenceDocuments
          .filter((document) => document.source === "tpm")
          .map((document) => document.documentId),
        status: "complete",
        timestamp: "08:24"
      },
      {
        label: "Assemble",
        recordIds: selectedDecision.recordIds,
        status: "complete",
        timestamp: "08:27"
      },
      {
        label: "Scored",
        recordIds: selectedDecision.recordIds,
        status: "pending human",
        timestamp: "08:29"
      }
    ],
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
    containmentPanel: buildContainmentPanel(containmentCandidate, dataset.customers),
    whatChanged: "13 recovery drafts and 7 Billing prevention drafts are staged for human review.",
    aiInsight: "Every proposed amount is bound to a deterministic decision delta; live model execution remains blocked in the offline harness."
  };
}

export function buildCreditCockpitModel(): CreditCockpitModel {
  const run = runRiskMeshClosedLoop();
  const context = buildHarborRiskMeshProposalContext();
  const crestlineM6 = assessCrestlineM6Containment();
  const weights = run.arbitration.deterministicBasis.weightSource;
  const signals = run.sentinel.deterministicBasis.observedSignals;
  const auditHashes = riskMeshAuditHashes(run.auditEntries);
  const arbitrationDisplayReason = "Production calibration proof required";
  const accountCore = {
    availableCreditLabel: "Pending ERP",
    caseId: run.arbitration.caseId,
    creditProgram: "Global standard",
    customerLabel: labelFromRecordId(run.customerId),
    dso90Label: `${String(signals.currentDsoDays)} days`,
    hqRegion: "Houston, TX / NA",
    industry: "Maritime services",
    legalEntity: "Harbor Holdings LLC",
    limitLabel: "Pending ERP",
    openArLabel: "Pending ERP",
    orderAmount: formatMoney(context.orderAmount),
    orderId: context.holdProposalInput.orderId,
    ownerLabel: "David Kim",
    posture: "Human approval required",
    terms: run.termsAction.terms
  };
  const sentinelFilingId = "UCC-1-HARBOR-PENDING";
  const sentinelFiledLabel = "Filed: pending proof";
  const sentinelSecuredPartyLabel = "Secured party: proof required";
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
  const actionQueue: CreditCockpitModel["actionQueue"] = [
    {
      account: "Harbor",
      age: "00h 42m",
      item: "Bureau lien alert",
      nextStep: "Review lien",
      priority: "P1",
      status: "New"
    },
    {
      account: "Harbor",
      age: "01h 15m",
      item: "Partial-hold recommended",
      nextStep: "Review & send",
      priority: "P1",
      status: "Action required"
    },
    {
      account: "Harbor",
      age: "02h 10m",
      item: "DSO drift alert",
      nextStep: "View DSO",
      priority: "P2",
      status: "Investigate"
    },
    {
      account: "Harbor",
      age: "04h 02m",
      item: "Order exposure update",
      nextStep: "Review exposure",
      priority: "P3",
      status: "Advisory"
    },
    {
      account: "Harbor",
      age: "06h 33m",
      item: "Policy exception",
      nextStep: "Review exception",
      priority: "P3",
      status: "Advisory"
    }
  ];

  const model = {
    surface: "credit-arbitration",
    customerId: run.customerId,
    readoutStatusLabels: ["Draft-only", account.posture, `${String(run.auditEntries.length)} audit entries`],
    account,
    sentinel: {
      status: run.sentinel.status,
      reason: run.sentinel.reason,
      displayReason: "Bureau lien alert",
      alertDetail: "UCC-1 filing detected and priority review required before any release.",
      filedLabel: sentinelFiledLabel,
      filingId: sentinelFilingId,
      detailRows: [
        { label: "Filing ID", value: sentinelFilingId },
        { label: "Filed", value: sentinelFiledLabel },
        { label: "Secured party", value: sentinelSecuredPartyLabel }
      ],
      recordStripLabel: "Sentinel alert record IDs",
      securedPartyLabel: sentinelSecuredPartyLabel,
      signals: [
        { label: "DSO drift", value: `${String(signals.baselineDsoDays)} -> ${String(signals.currentDsoDays)} days` },
        { label: "Dispute signal", value: "observed" },
        { label: "Lien signal", value: "observed" }
      ],
      recordIds: run.sentinel.recordIds
    },
    arbitration: {
      status: run.arbitration.status,
      reason: run.arbitration.reason,
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
          message: "Crestline M6 containment readout linked for Risk Mesh review only",
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

export function buildCfoSummaryCockpitModel(): CfoSummaryCockpitModel {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const riskRun = runRiskMeshClosedLoop();
  const dependencies = cfoOpenDependencies.map((dependencyId) => dependencyView(dependencyId));
  const auditHash = riskMeshAuditHashes(riskRun.auditEntries).chainHeadHash;
  const auditRecordIds = [
    "SYNTHETIC-SEED-42",
    "CUST-HARBOR",
    "ORDER-HARBOR-640K",
    "LEDGER-6-PARTIAL-HOLD"
  ];
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
    { label: "Evidence sources", value: "3", support: "SAP, Docs, TPM" },
    { label: "Open proof dependencies", value: String(dependencies.length), support: "Owner proof required" },
    { label: "DSO / CEI", value: "Live input pending", support: "No ERP write-back" },
    { label: "Autonomy posture", value: "Governed", support: "No autonomous external action" }
  ].map((metric) => ({
    ...metric,
    supportLabel: cfoExecutiveMetadataValue("Metric support", metric.support)
  }));
  const reportMetadata = [
    { label: "Board pack", value: "Recoup v2 executive readout" },
    { label: "Dataset", value: `Synthetic seed ${String(dataset.manifest.seed)}` },
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
      recordIds: ["SYNTHETIC-SEED-42"],
      state: `${String(dataset.rollup.recoveryLines)} drafts`
    },
    {
      basis: "valid deductions routed as draft-only Billing recommendations",
      label: "Billing prevention queue",
      recordIds: ["SYNTHETIC-SEED-42"],
      state: `${String(dataset.rollup.validLines)} drafts`
    },
    {
      basis: riskRun.arbitration.reason,
      label: "Risk Mesh arbitration",
      recordIds: riskRun.arbitration.recordIds,
      state: "Calibration proof open"
    },
    {
      basis: "hash-chain verification",
      label: "Audit trail integrity",
      recordIds: ["LEDGER-6-PARTIAL-HOLD"],
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
  const sourceSystems = ["SAP OData", "Contract Repo", "TPM", "Risk Mesh", "Audit Trail"];

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
      dataBasis: "synthetic seed 42 plus deterministic read models",
      dataBasisLabel: cfoExecutiveMetadataValue("Data basis", "synthetic seed 42 plus deterministic read models"),
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

export function buildForensicsSseEvents(): ForensicsSseEvent[] {
  const run = runForensicsInvestigation();

  return run.trace;
}

export function buildLoginModel(): LoginCockpitModel {
  return {
    surface: "login",
    personas: cockpitDemoProfiles.map((profile) => ({
      allowedRouteCount: profile.allowedRoutes.length,
      allowedRoutes: [...profile.allowedRoutes],
      defaultRoute: profile.defaultRoute,
      displayName: profile.displayName,
      loginId: profile.loginId,
      persona: profile.persona,
      provenance: "deterministic_demo_profile",
      role: profile.role,
      sourceMode: "deterministic_demo_profile",
      workspace: profile.workspace
    }))
  };
}

export function buildTraceModel(): TraceCockpitModel {
  const riskRun = runRiskMeshClosedLoop();

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
  records?: MemoryRecord[],
  options?: { backend: "sqlite" | "supabase" }
): MemorySummaryCockpitModel {
  const metadata =
    options === undefined
      ? {
          backend: "in_memory_fallback" as const,
          provenance: "deterministic_demo_memory" as const,
          sourceMode: "deterministic_demo_fallback" as const
        }
      : {
          backend: options.backend,
          provenance: "persisted_runtime_memory" as const,
          sourceMode: "runtime_persisted" as const
        };

  if (records !== undefined) {
    return {
      ...metadata,
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
    ...metadata,
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
  const connectors = buildConnectorReadiness([], availableCredentialEnvNames, toolDataSchemaProbe);

  return {
    surface: "connector-readiness",
    connectors,
    lastRefreshedLabel: "Refreshed 08:24 AM",
    sourceTiles: buildSourceReadinessTiles(connectors)
  };
}

function buildScenarioWorklist(
  dataset: ReturnType<typeof buildSyntheticDataset>,
  decisions: DeductionDecision[]
): WorklistItem[] {
  const decisionsByLineId = new Map(decisions.map((decision) => [decision.lineId, decision]));
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
      confidence: firstDecision.confidence,
      confidenceLabel: confidenceLabel(firstDecision.confidence),
      evidenceScoreLabel: String(recordIds.length),
      evidenceLabel: `${String(recordIds.length)} artifacts`,
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
  customers: ReturnType<typeof buildSyntheticDataset>["customers"]
): ForensicsCockpitModel["containmentPanel"] {
  const customer = customers.find((item) => item.customerId === candidate.customerId);
  const components = candidate.deterministicBasis.rScoreComponents;

  return {
    actionPostureLabel: "No hold or freeze action staged",
    behavioralEvidenceIds: candidate.behavioralEvidenceIds,
    basisRows: [
      { label: "Gaming gate", value: candidate.deterministicBasis.gamingThresholds },
      { label: "Invalid shortage lines", value: String(components.invalidShortageLineCount) },
      { label: "Invalid pricing lines", value: String(components.invalidPricingLineCount) },
      { label: "Promo correlation", value: String(components.promoCorrelationCount) },
      { label: "Configured window", value: `${String(components.windowDays)} days` }
    ],
    componentReadoutLabel: "Day-1 deterministic component readout; production R-score/R-drift remains out of scope.",
    customerId: candidate.customerId,
    customerLabel: customer?.name ?? labelFromRecordId(candidate.customerId),
    handoff: {
      label: "David / Risk Mesh reference",
      recordIds: candidate.recordIds,
      status: "review-only handoff",
      target: "Risk Mesh"
    },
    intentLabel: candidate.intentLabel,
    postureLabel: "HITL risk review only",
    recordIds: candidate.recordIds,
    recordStripLabel: "M6 containment record IDs",
    statusLabel: "M6 containment candidate"
  };
}

function evidenceDocumentView(document: DeductionDecision["evidenceDocuments"][number], index: number) {
  return {
    citationId: citationId(document.source, index),
    description: document.summary,
    documentId: document.documentId,
    documentType: document.documentType,
    relevance: index === 0 ? "Primary" : "Supporting",
    sourceLabel: evidenceSourceLabels[document.source],
    summary: document.summary,
    verifiedLabel: "Verified"
  };
}

function buildMultimodalSubAgents(selectedDecision: DeductionDecision): ForensicsCockpitModel["multimodalDock"]["subAgents"] {
  const documents = selectedDecision.evidenceDocuments;
  const podDocuments = documents.filter((document) => document.documentType === "POD");
  const sapDocuments = documents.filter((document) => document.source === "sap");
  const contractDocuments = documents.filter((document) => document.documentType === "contract");
  const tpmDocuments = documents.filter((document) => document.source === "tpm");

  return [
    {
      name: "POD-Retriever",
      source: "3PL POD",
      query: "signed delivery proof",
      artifacts: String(podDocuments.length),
      keyArtifact: podDocuments[0]?.documentId ?? "No POD returned",
      statusLabel: podDocuments.length > 0 ? "Completed" : "No match"
    },
    {
      name: "Contract-Reader",
      source: "Contract Repo",
      query: "allowance and exception terms",
      artifacts: String(contractDocuments.length),
      keyArtifact: contractDocuments[0]?.documentId ?? sapDocuments[0]?.documentId ?? "No contract required",
      statusLabel: contractDocuments.length > 0 || sapDocuments.length > 0 ? "Completed" : "No match"
    },
    {
      name: "TPM-Matcher",
      source: "TPM",
      query: "promotion and accrual match",
      artifacts: String(tpmDocuments.length),
      keyArtifact: tpmDocuments[0]?.documentId ?? "No TPM artifact required",
      statusLabel: tpmDocuments.length > 0 ? "Completed" : "Not applicable"
    }
  ];
}

function buildSourceReadinessTiles(connectors: ConnectorReadiness[]): SourceReadinessTile[] {
  const connectorsByName = new Map(connectors.map((connector) => [connector.name, connector]));
  const sourceTileOrder = [
    sourceTileFromConnector(requiredConnector(connectorsByName, "sap-odata")),
    sourceTileFromConnector(requiredConnector(connectorsByName, "tpm")),
    podSourceTile(),
    sourceTileFromConnector(requiredConnector(connectorsByName, "bureau")),
    remittanceEdiTile(requiredConnector(connectorsByName, "remittance"), requiredConnector(connectorsByName, "edi-remittance")),
    sourceTileFromConnector(requiredConnector(connectorsByName, "docs-repo")),
    {
      detail: "Public tool facade filters draft actions behind HITL and audit policy.",
      key: "mcp",
      label: "MCP",
      mark: "M",
      modeLabel: "Read-only tools",
      proofItems: ["tools filtered", "draft-only actions", "no ERP write-back"],
      stateLabel: "Connected",
      statusTone: "ready",
      summary: "Draft tools gated"
    } satisfies SourceReadinessTile
  ];

  return sourceTileOrder;
}

function sourceTileFromConnector(connector: ConnectorReadiness): SourceReadinessTile {
  const display = connectorDisplay[connector.name];
  const missingCount = connector.missingCredentialEnvNames.length + connector.missingSourceContractInputs.length;
  const statusTone: SourceReadinessTile["statusTone"] =
    connector.status === "ready_synthetic" ? "synthetic" : connector.status === "ready" ? "ready" : "blocked";

  return {
    detail: connector.reason,
    key: display.key,
    label: display.label,
    mark: display.mark,
    modeLabel: connector.sourceMode === "synthetic_static_table" ? "Synthetic table" : "Live read",
    proofItems: [
      "read-only",
      "external writes blocked",
      missingCount === 0 ? "inputs present" : `${String(missingCount)} inputs open`
    ],
    stateLabel: statusTone === "blocked" ? "Setup" : statusTone === "synthetic" ? "Synthetic" : "Connected",
    statusTone,
    summary: connector.status === "ready_synthetic" ? "Schema verified" : connector.status === "ready" ? "Connected" : "Input required"
  };
}

function remittanceEdiTile(remittance: ConnectorReadiness, edi: ConnectorReadiness): SourceReadinessTile {
  const remittanceTile = sourceTileFromConnector(remittance);
  const ediTile = sourceTileFromConnector(edi);
  const statusTone: SourceReadinessTile["statusTone"] =
    remittanceTile.statusTone === "blocked" || ediTile.statusTone === "blocked"
      ? "blocked"
      : remittanceTile.statusTone === "synthetic" || ediTile.statusTone === "synthetic"
        ? "synthetic"
        : "ready";

  return {
    detail: `${remittance.reason} ${edi.reason}`,
    key: "remittance-edi",
    label: "Remittance / EDI",
    mark: "R",
    modeLabel: statusTone === "ready" ? "Live read" : "Synthetic table",
    proofItems: uniqueStrings([...remittanceTile.proofItems, ...ediTile.proofItems]),
    stateLabel: statusTone === "blocked" ? "Setup" : statusTone === "synthetic" ? "Synthetic" : "Connected",
    statusTone,
    summary: statusTone === "blocked" ? "Input required" : "Payment advice verified"
  };
}

function podSourceTile(): SourceReadinessTile {
  return {
    detail: "POD artifacts are available from the governed synthetic document set until the live 3PL contract is approved.",
    key: "pod-3pl",
    label: "3PL POD",
    mark: "P",
    modeLabel: "Synthetic evidence",
    proofItems: ["read-only", "external writes blocked", "synthetic labelled"],
    stateLabel: "Synthetic",
    statusTone: "synthetic",
    summary: "Signed delivery proof"
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
  docs: "Contract Repo",
  sap: "SAP OData",
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
  "verify-runtime-config-loader",
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
  "verify-runtime-config-loader": {
    impact: "Blocks live model execution",
    label: "Runtime config loader",
    owner: "Platform proof owner"
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

  if (lowerValue.includes("synthetic seed 42 plus")) {
    return "Deterministic demo dataset plus governed read models";
  }

  if (label === "Dataset" || lowerValue.includes("synthetic seed")) {
    return "Deterministic demo dataset";
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

function confidenceLabel(confidence: string): string {
  return confidence.toLowerCase().includes("threshold") ? "Threshold required" : confidence;
}

function operationalValue(value: string): string {
  return value === "Pending ERP" ? "Scoped source" : value;
}

function citationId(source: DeductionDecision["evidenceDocuments"][number]["source"], index: number): string {
  const prefix = source === "sap" ? "S" : source === "tpm" ? "T" : "P";

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

function riskMeshAuditHashes(auditEntries: AuditEntry[]) {
  const arbitrationEntry = auditEntries.find((entry) => entry.entryType === "arbitration.blocked");
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
