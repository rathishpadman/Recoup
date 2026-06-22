const apiBaseUrl = process.env.RECOUP_API_URL ?? "http://127.0.0.1:4317";

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
    approvalActions: Array<{
      decision: "approve" | "modify" | "reject";
      label: string;
      requiresReason: boolean;
    }>;
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
  };
  actionInbox: Array<{
    actionId: string;
    actionLabel: string;
    actionType: string;
    lineId: string;
    amount: string;
    basis?: string;
    status?: "pending_human";
    statusLabel?: string;
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
  retrievalStatus: Array<{ source: string; count: number; status?: string }>;
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
    kind: string;
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
  categories: string[];
  provenance: "deterministic_demo_memory" | "persisted_runtime_memory";
  records: Array<{
    id: string;
    category: string;
    trustLevel: string;
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
  edges: Array<{
    from: string;
    to: string;
    mode: string;
  }>;
}

export interface ConnectorReadinessCockpitModel {
  surface: "connector-readiness";
  lastRefreshedLabel: string;
  sourceTiles: Array<{
    detail: string;
    key: string;
    label: string;
    mark: string;
    modeLabel: string;
    proofItems: string[];
    stateLabel: string;
    statusTone: "ready" | "synthetic" | "blocked";
    summary: string;
  }>;
  connectors: Array<{
    name: string;
    status: string;
    allowedOperations: string[];
    missingCredentialEnvNames: string[];
    missingSourceContractInputs: string[];
    proof: {
      credentialsConfigured: boolean;
      externalWritesAllowed: boolean;
      schemaValidated: boolean;
      sourceContractConfigured: boolean;
    };
    requiredInputs: string[];
    reason: string;
    liveContractStatus?: string;
    sourceContractMode?: "live_source_contract" | "synthetic_static_table";
    sourceMode?: "live" | "synthetic_static_table";
    sourceTableName?: string;
    toolDataTableNames?: string[];
  }>;
}

export interface WorklistItem {
  lineId: string;
  lineCount: number;
  lineIds: string[];
  customerId?: string;
  customerLabel: string;
  routing?: string;
  routingLabel: string;
  scenarioId?: string;
  scenarioLabel: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  verdictLabel: string;
  confidence: string;
  confidenceLabel: string;
  evidenceScoreLabel: string;
  evidenceLabel: string;
  queueLabel: string;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Cockpit model failed for ${path}: ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

export async function fetchForensicsModel(): Promise<ForensicsCockpitModel> {
  return fetchJson<ForensicsCockpitModel>("/forensics");
}

export async function fetchLoginModel(): Promise<LoginCockpitModel> {
  return fetchJson<LoginCockpitModel>("/login");
}

export async function fetchCreditModel(): Promise<CreditCockpitModel> {
  return fetchJson<CreditCockpitModel>("/credit");
}

export async function fetchCfoModel(): Promise<CfoSummaryCockpitModel> {
  return fetchJson<CfoSummaryCockpitModel>("/cfo");
}

export async function fetchTraceModel(): Promise<TraceCockpitModel> {
  return fetchJson<TraceCockpitModel>("/trace");
}

export async function fetchMemoryModel(): Promise<MemorySummaryCockpitModel> {
  return fetchJson<MemorySummaryCockpitModel>("/memory");
}

export async function fetchAgentGraphModel(): Promise<AgentGraphCockpitModel> {
  return fetchJson<AgentGraphCockpitModel>("/agents");
}

export async function fetchConnectorReadinessModel(): Promise<ConnectorReadinessCockpitModel> {
  return fetchJson<ConnectorReadinessCockpitModel>("/connectors");
}
