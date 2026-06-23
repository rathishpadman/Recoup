import type { ConnectorReadinessCockpitModel, ForensicsCockpitModel } from "../../app/cockpit-data.ts";
import type { DemoSession } from "../../app/demo-auth.ts";
import type { RealtimeBrowserSessionSnapshot } from "../../app/realtime-browser-session.ts";

export interface MayaForensicsSurfaceProps {
  connectors: ConnectorReadinessCockpitModel;
  model: ForensicsCockpitModel;
  session: DemoSession;
}

export interface ApprovalGateResponse {
  auditEntryHash: string;
  decision: "approve" | "modify" | "reject";
}

export type QueryEvidenceResponse = RealtimeBrowserSessionSnapshot;
export type MayaActionInboxItem = ForensicsCockpitModel["actionInbox"][number];
export type MayaApprovalAction = ForensicsCockpitModel["selected"]["approvalActions"][number];
export type MayaConnector = ConnectorReadinessCockpitModel["connectors"][number];
export type MayaEvidenceDocument = ForensicsCockpitModel["selected"]["evidencePack"]["documents"][number];
export type MayaEvidencePack = ForensicsCockpitModel["selected"]["evidencePack"];
export type MayaJourneyItem = ForensicsCockpitModel["mayaJourney"][number];
export type MayaKpiItem = ForensicsCockpitModel["kpiStrip"][number];
export type MayaMultimodalDock = ForensicsCockpitModel["multimodalDock"];
export type MayaSelectedCase = ForensicsCockpitModel["selected"];
export type MayaSourceTile = ConnectorReadinessCockpitModel["sourceTiles"][number];
export type MayaSubAgent = ForensicsCockpitModel["multimodalDock"]["subAgents"][number];
export type MayaWorklistItem = ForensicsCockpitModel["worklist"][number];
