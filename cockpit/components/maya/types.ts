import type {
  ConnectorReadinessCockpitModel,
  ForensicsCockpitModel,
  ForensicsWorkItemDetailCockpitModel
} from "../../app/cockpit-data.ts";
import type { DemoSession } from "../../app/demo-auth.ts";

export interface MayaForensicsSurfaceProps {
  businessFreshness: MayaForensicsBusinessFreshness;
  connectors: ConnectorReadinessCockpitModel;
  model: ForensicsCockpitModel;
  modelVersion: number;
  onRefreshSources: () => void;
  refreshError?: string;
  refreshStatus: "error" | "idle" | "refreshing";
  session: DemoSession;
}

export interface MayaForensicsBusinessFreshness {
  cacheStatus?: string;
  message?: string;
  receiptHash?: string;
  sourceHash?: string;
  status: "connected" | "degraded" | "loading";
  updatedAtIso?: string;
}

export type MayaSurfaceSection = "overview" | "worklist" | "cases" | "evidence" | "approvals";

export interface ApprovalGateResponse {
  actionId: string;
  approverId?: string;
  auditEntryHash: string;
  decision: "approve" | "modify" | "reject";
  reason?: string;
  recordIds?: string[];
  status?: "human_decided";
}

export type QueryEvidenceBackendResponse = import("../../app/cockpit-data.ts").ForensicsQueryResponse;
export type QueryEvidenceResponse = import("../../app/cockpit-data.ts").ForensicsQueryUiResponse;
export type MayaActionInboxItem = ForensicsCockpitModel["actionInbox"][number];
export type MayaApprovalAction = ForensicsCockpitModel["selected"]["approvalActions"][number];
export type MayaConnector = ConnectorReadinessCockpitModel["connectors"][number];
export type MayaEvidenceDocument = ForensicsCockpitModel["selected"]["evidencePack"]["documents"][number];
export type MayaEvidencePack = ForensicsCockpitModel["selected"]["evidencePack"];
export type MayaJourneyItem = ForensicsCockpitModel["mayaJourney"][number];
export type MayaKpiItem = ForensicsCockpitModel["kpiStrip"][number];
export type MayaMultimodalDock = ForensicsCockpitModel["multimodalDock"];

export interface MayaQueryPromptDockContract extends Omit<MayaMultimodalDock, "promptSuggestions"> {
  promptSuggestions?: MayaMultimodalDock["promptSuggestions"];
}

export type MayaRecoveryTracker = ForensicsCockpitModel["recoveryTracker"];
export type MayaSelectedCase = ForensicsCockpitModel["selected"];
export type MayaWorkItemDetail = ForensicsWorkItemDetailCockpitModel;
export type MayaSourceTile = ConnectorReadinessCockpitModel["sourceTiles"][number];
export type MayaSubAgent = ForensicsCockpitModel["multimodalDock"]["subAgents"][number];
export type MayaWorklistItem = ForensicsCockpitModel["worklist"][number];
