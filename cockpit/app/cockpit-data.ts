const apiBaseUrl = process.env.RECOUP_API_URL ?? "http://127.0.0.1:4317";

export interface ForensicsCockpitModel {
  surface: "forensics-analyst";
  worklist: WorklistItem[];
  selected: {
    lineId: string;
    approvalActions?: string[];
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
  };
  actionInbox: Array<{
    actionId: string;
    actionType: string;
    lineId: string;
    amount: string;
    basis?: string;
    status?: "pending_human";
  }>;
  recoveryTracker: {
    totalExposure: string;
    projectedRecovery: string;
    projectedBilling: string;
    recoveryLines: number;
    billingLines: number;
  };
  retrievalStatus: Array<{ source: string; count: number; status?: string }>;
  whatChanged: string;
  aiInsight: string;
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
    actionType: string;
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
    kind: string;
    status: string;
    recordIds: string[];
    deterministicBasis: string;
  }>;
}

export interface MemorySummaryCockpitModel {
  surface: "memory";
  categories: string[];
  records: Array<{
    id: string;
    category: string;
    trustLevel: string;
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
  edges: Array<{
    from: string;
    to: string;
    mode: string;
  }>;
}

export interface ConnectorReadinessCockpitModel {
  surface: "connector-readiness";
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
    sourceTableName?: string;
    toolDataTableNames?: string[];
  }>;
}

export interface WorklistItem {
  lineId: string;
  customerId?: string;
  routing?: string;
  scenarioId?: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  confidence: string;
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
