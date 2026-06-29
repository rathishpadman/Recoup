import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  day1BootstrapSeedApprovedBy,
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import {
  ALL_TOOLS_DATA_TABLE_NAMES,
  buildConnectorReadiness,
  type SupabaseToolDataSchemaProbe
} from "../../src/adapters/connectorRegistry.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import {
  buildAgentGraphModel,
  buildConnectorReadinessModel,
  buildCfoSummaryCockpitModel,
  buildCreditCockpitModel,
  buildForensicsCockpitModel,
  buildForensicsWorkItemDetailCockpitModel,
  buildForensicsSseEvents,
  buildLoginModel,
  buildMemorySummaryModel,
  buildTraceModel
} from "../../src/services/cockpitModel.js";
import { buildSourceHealthFromConnectorReadiness } from "../../src/services/sourceHealth.js";
import type {
  ServiceInvocationContext,
  ServiceSapEvidenceSource,
  ServiceSyntheticEvidenceSource
} from "../../src/services/serviceLayer.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import type { MemoryRecord } from "../../src/memory/schema.js";
import { retrieveBureau } from "../../src/tools/retrieval/bureau.js";
import { retrieveDocs } from "../../src/tools/retrieval/docs.js";
import { retrieveTpm } from "../../src/tools/retrieval/tpm.js";
import { ToolStatusRail } from "../../cockpit/app/premium-components.tsx";
import {
  beginWorkItemDetailRequest,
  cancelWorkItemDetailRequest,
  isCurrentWorkItemDetailRequest
} from "../../cockpit/components/maya/work-item-detail-request-gate.js";

const realAuditEntryHashPattern = /^[a-f0-9]{64}$/u;
const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const fixtureSyntheticEvidenceSource: ServiceSyntheticEvidenceSource = {
  readEvidence(connectorName, line) {
    if (connectorName === "bureau") {
      return retrieveBureau(line);
    }
    if (connectorName === "docs-repo") {
      return retrieveDocs(line);
    }

    return retrieveTpm(line);
  }
};
const fixtureSapEvidenceSource: ServiceSapEvidenceSource = {
  readEvidence(line) {
    return line.recordIds
      .filter((recordId) => recordId.startsWith("INV-"))
      .map((recordId) => ({
        documentId: `SAP-${recordId}`,
        documentType: "invoice",
        recordIds: [line.lineId, recordId, `SAP-${recordId}`],
        source: "sap",
        summary: `Supabase SAP source row for ${recordId}.`
      }));
  }
};
const fixtureServiceContext: ServiceInvocationContext = {
  governedConfig,
  requireSupabaseSapEvidence: true,
  requireSupabaseSyntheticEvidence: true,
  sapEvidenceSource: fixtureSapEvidenceSource,
  source,
  syntheticEvidenceSource: fixtureSyntheticEvidenceSource
};
const sourceOptions = { riskObservationSource: source, serviceContext: fixtureServiceContext, settlementSource: source } as const;

function approvalMemoryRecord(actionId: string, lineId: string, auditHashFill: string): MemoryRecord {
  return {
    category: "approval_records",
    createdAt: new Date(0).toISOString(),
    id: `approval:${actionId}`,
    payload: {
      actionId,
      approverId: "human:maya-lead",
      auditEntryHash: auditHashFill.repeat(64),
      decision: "approve",
      status: "human_decided"
    },
    recordIds: [actionId, lineId],
    scope: `approval:${actionId}`,
    trustLevel: "trusted"
  };
}

describe("S5 Forensics cockpit model", () => {
  it("fails closed when governed runtime config is not injected into read-model builders", () => {
    expect(() => buildForensicsCockpitModel(undefined)).toThrow("Governed runtime config snapshot required.");
    expect(() => buildCreditCockpitModel(undefined)).toThrow("Governed runtime config snapshot required.");
    expect(() => buildCfoSummaryCockpitModel(undefined)).toThrow("Governed runtime config snapshot required.");
    expect(() => buildTraceModel(undefined)).toThrow("Governed runtime config snapshot required.");
  });

  it("builds login personas from the canonical deterministic demo profiles", () => {
    const model = buildLoginModel();

    expect(model.surface).toBe("login");
    expect(model.personas.map((persona) => persona.loginId)).toEqual(["Maya", "david", "CFO"]);
    expect(model.personas.map((persona) => persona.role)).toEqual(["maya", "david", "cfo"]);
    expect(model.personas.map((persona) => persona.displayName)).toEqual(["Maya Patel", "David Kim", "CFO"]);
    expect(model.personas.map((persona) => persona.defaultRoute)).toEqual(["/forensics/shadcn", "/credit", "/cfo"]);
    expect(model.personas.map((persona) => persona.allowedRouteCount)).toEqual([2, 1, 5]);
    expect(new Set(model.personas.map((persona) => persona.sourceMode))).toEqual(new Set(["deterministic_demo_profile"]));
    expect(model.personas.find((persona) => persona.loginId === "Maya")).toMatchObject({
      persona: "Forensics analyst",
      workspace: "Deduction recovery workbench"
    });
    expect(model.personas.find((persona) => persona.loginId === "david")).toMatchObject({
      persona: "Credit lead",
      workspace: "Risk Mesh arbitration queue"
    });
    expect(model.personas.find((persona) => persona.loginId === "CFO")?.allowedRoutes).toEqual([
      "/cfo",
      "/governance/agents",
      "/governance/connectors",
      "/governance/memory",
      "/governance/trace"
    ]);
  });

  it("builds a pre-triaged 8-card worklist with evidence, draft, and approval actions", () => {
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions });

    expect(model.surface).toBe("forensics-analyst");
    expect(model.worklist).toHaveLength(8);
    expect(model.kpiStrip).toHaveLength(6);
    expect(model.worklist.every((item) => item.lineCount >= 1)).toBe(true);
    expect(model.worklist.every((item) => Number.parseInt(item.evidenceScoreLabel, 10) > 0)).toBe(true);
    expect(model.worklist.every((item) => item.queueLabel.length > 0)).toBe(true);
    expect(model.worklist.every((item) => item.recommendedActionLabel.trim().length > 0)).toBe(true);
    expect(model.worklist.every((item) => item.recommendedActionLabel === item.routingLabel)).toBe(true);
    expect(model.worklist.every((item) => item.recommendedActionLabel !== item.routing)).toBe(true);
    const expectedEvidenceSourceLabels = [
      ...new Set(model.selected.evidencePack.documents.map((document) => document.sourceLabel))
    ];
    const evidenceSourcesKpi = model.kpiStrip.find((item) => item.label === "Evidence sources");
    expect(evidenceSourcesKpi).toEqual(expect.objectContaining({
      label: "Evidence sources",
      value: String(expectedEvidenceSourceLabels.length),
      support: expectedEvidenceSourceLabels.join(", ")
    }));
    expect(evidenceSourcesKpi?.provenance.sourceKind).toBe("derived_backend");
    expect(typeof evidenceSourcesKpi?.provenance.deterministicBasis).toBe("string");
    expect(Array.isArray(evidenceSourcesKpi?.provenance.recordIds)).toBe(true);
    expect(evidenceSourcesKpi?.provenance.recordIds.length).toBeGreaterThan(0);
    expect(model.selected.evidencePack.documents.length).toBeGreaterThan(0);
    expect(model.selected.evidencePack.documents.every((document) => /^[BPRST]\d+$/u.test(document.citationId))).toBe(true);
    expect(model.selected.draft.status).toBe("pending_human");
    expect(model.selected.draft.actionLabel).toBe("Recovery draft staged");
    expect(model.selected).toMatchObject({
      approvalEligibility: {
        available: true,
        statusLabel: "Ready for human approval"
      }
    });
    expect(model.selected.approvalActions.map((action) => action.decision)).toEqual(["approve", "modify", "reject"]);
    expect(model.multimodalDock.policyLabel).toBe("voice/text citation parity");
    expect(model.retrievalStatus.map((status) => status.source)).toEqual(expectedEvidenceSourceLabels);
    expect(model.multimodalDock.subAgents.map((agent) => agent.name)).toEqual([
      "POD-Retriever",
      "Contract-Reader",
      "TPM-Matcher"
    ]);
    expect(model.multimodalDock.subAgents.every((agent) => agent.provenance.sourceKind === "agent_trace")).toBe(true);
    expect(model.mayaJourney.map((step) => step.label)).toEqual([
      "Ingest",
      "POD retrieval",
      "Contract read",
      "TPM match",
      "Assemble",
      "Scored"
    ]);
    expect(model.actionInbox.some((action) => action.actionType === "draft-rebill")).toBe(true);
    expect(model.actionInbox.some((action) => action.actionType === "route-billing")).toBe(true);
    expect(model.recoveryTracker.recoveryLines).toBe(13);
    expect(model.recoveryTracker.billingLines).toBe(7);
  });

  it("keeps Maya worklist row clicks as local selection before explicit backend detail open", () => {
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const handleSelectStart = surface.indexOf("const handleSelectWorklistItem");
    const handleSelectEnd = surface.indexOf("const handleReturnToWorklist", handleSelectStart);
    const handleSelectSource = surface.slice(handleSelectStart, handleSelectEnd);
    const worklistSectionStart = surface.indexOf("function renderWorklistSection");
    const worklistSectionEnd = surface.indexOf("function renderCasesSection", worklistSectionStart);
    const worklistSectionSource = surface.slice(worklistSectionStart, worklistSectionEnd);
    const beatTwelveStart = surface.indexOf("<BeatTwelveReturnedWorklist");
    const beatTwelveEnd = surface.indexOf("selectedItem={returnedWorklistItem}", beatTwelveStart);
    const beatTwelveSource = surface.slice(beatTwelveStart, beatTwelveEnd);

    expect(handleSelectSource).toContain("setSelectedWorklistItem(item);");
    expect(handleSelectSource).toContain("setOpenedCaseWorklistItem(undefined);");
    expect(handleSelectSource).toContain("setOpenedCaseDetail(undefined);");
    expect(handleSelectSource).toContain("setWorkItemDetailLoadState(undefined);");
    expect(handleSelectSource).not.toContain("void openInvestigationForItem(item);");
    expect(worklistSectionSource).toContain('data-testid="maya-local-row-action-open"');
    expect(worklistSectionSource).toContain("void openInvestigationForItem(visibleSelectedWorklistItem);");
    expect(beatTwelveSource).toContain("void openInvestigationForItem(item);");
    expect(beatTwelveSource).not.toContain("setSelectedWorklistItem(item)");
    expect(beatTwelveSource).not.toContain("setReturnContextLineId(item.lineId)");
  });

  it("keeps the Maya work-item detail client fetch on the same-origin Next proxy", () => {
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");

    expect(surface).toContain('"/api/forensics/work-items/');
    expect(surface).not.toContain("fetchForensicsWorkItemDetail } from \"../../app/cockpit-data.ts\"");
    expect(surface).not.toContain("CockpitDataFetchError");
    expect(surface).not.toContain("RECOUP_API_URL");
    expect(surface).not.toContain("http://127.0.0.1:4317");
  });

  it("invalidates stale Maya work-item detail requests when returning to the worklist", () => {
    const requestGate = { current: 0 };
    const staleRequestId = beginWorkItemDetailRequest(requestGate);

    expect(isCurrentWorkItemDetailRequest(requestGate, staleRequestId)).toBe(true);

    cancelWorkItemDetailRequest(requestGate);

    expect(requestGate.current).toBe(staleRequestId + 1);
    expect(isCurrentWorkItemDetailRequest(requestGate, staleRequestId)).toBe(false);
    expect(isCurrentWorkItemDetailRequest(requestGate, beginWorkItemDetailRequest(requestGate))).toBe(true);
  });

  it("surfaces Crestline M6 as a risk-review-only containment read model", () => {
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions });
    const credit = buildCreditCockpitModel({ governedConfig, ...sourceOptions });

    expect(model.containmentPanel).toMatchObject({
      actionPostureLabel: "No hold or freeze action staged",
      customerId: "CUST-CRESTLINE",
      customerLabel: "Crestline Grocery",
      intentLabel: "gaming",
      postureLabel: "HITL risk review only",
      statusLabel: "Gaming-gate review candidate"
    });
    expect(model.containmentPanel.recordIds).toEqual(
      expect.arrayContaining(["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"])
    );
    expect(model.containmentPanel.behavioralEvidenceIds).toEqual(
      expect.arrayContaining(["TPM-CONTRACT-1", "POD-SIGNED-1", "PRICE-CLAUSE-1"])
    );
    expect(model.containmentPanel.basisRows).toContainEqual(expect.objectContaining({
      label: "Gaming gate",
      value: "governed-config-snapshot"
    }));
    expect(
      model.containmentPanel.basisRows.every(
        (row) => row.provenance.sourceKind === "derived_backend" && row.provenance.recordIds.length > 0
      )
    ).toBe(true);
    expect(model.containmentPanel.handoff).toMatchObject({
      label: "David / Risk Mesh reference",
      status: "review-only handoff"
    });
    expect(model.actionInbox.every((action) => action.actionType !== "propose-hold")).toBe(true);
    expect(credit.negotiation.timeline.some((item) => item.message.includes("CUST-CRESTLINE"))).toBe(true);
  });

  it("formats money from service Decimal values, not cockpit arithmetic", () => {
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions });

    expect(model.recoveryTracker.totalExposure).toBe("$112,400.00");
    expect(model.recoveryTracker.projectedRecovery).toBe("$79,800.00");
    expect(model.recoveryTracker.projectedBilling).toBe("$32,600.00");
    expect(model.worklist.every((item) => item.amount.startsWith("$"))).toBe(true);
  });

  it("exposes an SSE envelope sequence with finding, verdict, and status events", () => {
    const events = buildForensicsSseEvents({ governedConfig, ...sourceOptions });
    const eventTypes = events.map((event) => event.type as string);

    expect(eventTypes.includes("finding")).toBe(true);
    expect(eventTypes.includes("verdict")).toBe(true);
    expect(eventTypes.includes("status")).toBe(true);
    expect(eventTypes.includes("eval")).toBe(false);
    expect(events.every((event) => "payload" in event)).toBe(true);
  });

  it("builds the David credit and arbitration read model from owner-supplied governed values", () => {
    const model = buildCreditCockpitModel({ governedConfig, ...sourceOptions });
    const riskRun = runRiskMeshClosedLoop({ governedConfig, source });
    const arbitrationEntry = riskRun.auditEntries.find((entry) => entry.entryType === "arbitration.ranked");
    const chainHeadEntry = riskRun.auditEntries.at(-1);
    if (arbitrationEntry === undefined || chainHeadEntry === undefined) {
      throw new Error("Risk Mesh run must expose arbitration and chain-head audit entries.");
    }

    expect(model.surface).toBe("credit-arbitration");
    expect(model.customerId).toBe("CUST-HARBOR");
    expect(model.account).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      customerLabel: "Harbor",
      orderAmount: "$640,010.00",
      orderId: "6534",
      posture: "Human approval required"
    });
    expect(model.sentinel.reason).toBe("source-risk-observation-fields-required");
    expect(model.sentinel.displayReason).toBe("Bureau lien alert");
    expect(model.sentinel.signals).toContainEqual({ label: "Lien signal", value: "observed" });
    expect(model.sentinel.alertDetail).toContain("UCC-1 filing detected");
    expect(model.actionQueue.map((item) => item.item)).toContain("Bureau lien alert");
    expect(model.actionQueue).toHaveLength(5);
    expect(model.partialHold.releaseRatioPercent).toBe("55%");
    expect(model.partialHold.proposedReleaseAmount).toBe("$352,005.50");
    expect(model.partialHold.criteria.map((criterion) => criterion.label)).toContain("Order exposure");
    expect(model.arbitration.status).toBe("ranked");
    expect(model.arbitration.reason).toBe("ranked-resolution:partial_release_55");
    expect(model.arbitration.displayReason).toBe("Ranked resolution: partial_release_55");
    expect(model.termProposal.status).toBe("pending_human");
    expect(model.termProposal.statusLabel).toBe("Awaiting David approval");
    expect(model.approvalInbox.some((item) => item.actionType === "propose-hold")).toBe(true);
    expect(model.approvalInbox.every((item) => item.statusLabel === "Awaiting David approval")).toBe(true);
    expect(model.approvalInbox.every((item) => item.recordIds.length > 0)).toBe(true);
    expect(model.approvalInbox.find((item) => item.actionType === "propose-hold")?.recordIds).toEqual(
      riskRun.holdAction.recordIds
    );
    expect(model.approvalInbox.find((item) => item.actionType === "propose-terms")?.recordIds).toEqual(
      riskRun.termsAction.recordIds
    );
    expect(model.audit.entries).toBe(riskRun.auditEntries.length);
    expect(model.audit.valid).toBe(riskRun.auditTrailValid);
    expect(model.audit.chainHeadHash).toBe(chainHeadEntry.entryHash);
    expect(model.audit.arbitrationHash).toBe(arbitrationEntry.entryHash);
    expect(model.audit.entryHashes).toEqual(riskRun.auditEntries.map((entry) => entry.entryHash));
    expect(model.audit.entryHashes.every((entryHash) => realAuditEntryHashPattern.test(entryHash))).toBe(true);
    expect(model.negotiation.provenance).toBe("deterministic_read_model");
    expect(model.negotiation.nodes).toHaveLength(governedConfig.riskMeshCases.harbor.arbitrationPositions.length);
    expect(new Set(model.negotiation.nodes.map((node) => node.functionName))).toEqual(
      new Set(["billing", "collections", "credit", "fulfillment"])
    );
    expect(new Set(model.negotiation.nodes.map((node) => node.displayName))).toEqual(
      new Set(["Billing", "Collections", "Credit", "Fulfillment"])
    );
    expect(model.negotiation.nodes.every((node) => node.recordIds.length > 0)).toBe(true);
  });

  it("renders ranked Risk Mesh arbitration from runtime governed option values", () => {
    const runtimeGovernedConfig = parseActiveGovernedConfigRows(
      buildSupabaseGovernedConfigRows({
        harbor: {
          ...governedConfig.riskMeshCases.harbor,
          arbitrationPositions: [
            {
              functionName: "credit",
              optionId: "partial-hold",
              optionValue: "100.00",
              position: "Owner-supplied credit value for controlled release.",
              recordIds: ["CUST-HARBOR", "6534", "DB-RANKED-CREDIT"]
            },
            {
              functionName: "fulfillment",
              optionId: "ship-now",
              optionValue: "80.00",
              position: "Owner-supplied fulfillment value for immediate shipment.",
              recordIds: ["6534", "DB-RANKED-FULFILLMENT"]
            },
            {
              functionName: "billing",
              optionId: "revised-terms",
              optionValue: "120.00",
              position: "Owner-supplied billing value for revised terms.",
              recordIds: ["CUST-HARBOR", "DB-RANKED-BILLING"]
            },
            {
              functionName: "collections",
              optionId: "sentinel-checkpoint",
              optionValue: "70.00",
              position: "Owner-supplied collections value for checkpoint handling.",
              recordIds: ["CUST-HARBOR", "DB-RANKED-COLLECTIONS"]
            }
          ]
        }
      })
    ).values;
    const riskRun = runRiskMeshClosedLoop({ governedConfig: runtimeGovernedConfig, source });
    const arbitrationEntry = riskRun.auditEntries.find((entry) => entry.entryType === "arbitration.ranked");
    if (arbitrationEntry === undefined) {
      throw new Error("Ranked Risk Mesh run must expose a ranked arbitration audit entry.");
    }

    const model = buildCreditCockpitModel({ governedConfig: runtimeGovernedConfig, ...sourceOptions });

    expect(model.arbitration.status).toBe("ranked");
    expect(model.arbitration.reason).toBe("ranked-resolution:partial-hold");
    expect(model.arbitration.displayReason).toBe("Ranked resolution: partial hold");
    expect(model.audit.arbitrationHash).toBe(arbitrationEntry.entryHash);
    expect(model.commandCenter.statusRail[0]).toMatchObject({ label: "Harbor", tone: "healthy", value: "ok" });
    expect(model.commandCenter.auditRows).toContainEqual({
      label: "Arbitration basis",
      state: "clear",
      value: `${String(model.arbitration.recordIds.length)} records`
    });
  });

  it("exposes David command-centre rows from the canonical credit read model", () => {
    const model = buildCreditCockpitModel({ governedConfig, ...sourceOptions });
    const urgentCount = model.actionQueue.filter((item) => item.priority === "P1").length;
    const firstCriterion = model.partialHold.criteria[0];
    if (firstCriterion === undefined) {
      throw new Error("Credit command centre requires at least one partial-hold criterion.");
    }

    expect(model.commandCenter.statusRail).toEqual([
      {
        detail: model.account.posture,
        label: "Harbor",
        tone: "healthy",
        value: "ok"
      },
      {
        detail: model.sentinel.alertDetail,
        label: "Sentinel",
        tone: "blocked",
        value: "alert"
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
        tone: "healthy",
        value: "valid"
      },
      {
        detail: "D5 portfolio-wide signal remains limited to the current deterministic read-model scope.",
        label: "Signal",
        tone: "pending",
        value: "scoped"
      }
    ]);
    expect(model.commandCenter.stats).toContainEqual({
      label: "Order exposure",
      note: model.account.orderId,
      tone: "healthy",
      unit: "USD",
      value: model.account.orderAmount
    });
    expect(model.commandCenter.stats).toContainEqual({
      label: "Risk Mesh alerts",
      note: `${String(urgentCount)} P1 items`,
      tone: "blocked",
      value: String(model.actionQueue.length)
    });
    expect(model.commandCenter.exposureRows[0]).toEqual({
      action: model.partialHold.proposedReleaseAmount,
      exposure: model.account.orderAmount,
      portfolio: model.account.customerLabel,
      signal: model.partialHold.releaseRatioPercent,
      state: model.termProposal.statusLabel,
      tone: "warning"
    });
    expect(model.commandCenter.feedRows[0]).toEqual({
      detail: model.sentinel.alertDetail,
      event: model.sentinel.displayReason,
      state: model.sentinel.status,
      time: model.actionQueue[0]?.age,
      tone: "blocked"
    });
    expect(model.commandCenter.signalRows).toHaveLength(model.partialHold.criteria.length);
    expect(model.commandCenter.signalRows[0]).toMatchObject({
      detail: `${weightLabel(firstCriterion.weight)} weight; ${firstCriterion.contribution} impact`,
      label: firstCriterion.label,
      score: firstCriterion.score,
      tone: Number(firstCriterion.score) >= 50 ? "warning" : "blocked"
    });
    expect(model.commandCenter.auditRows).toContainEqual({
      label: "External writes",
      state: "blocked",
      value: "0"
    });
    expect(model.commandCenter.marketTape).toContainEqual({
      label: "Back-order queue",
      tone: "pending",
      value: model.partialHold.proposedBackOrderAmount
    });
  });

  it("loads David account, Sentinel, and queue business display values from Supabase-backed risk_mesh_cases", () => {
    const runtimeGovernedConfig = parseActiveGovernedConfigRows(
      buildSupabaseGovernedConfigRows({
        harbor: {
          ...governedConfig.riskMeshCases.harbor,
          accountReadout: {
            availableCreditLabel: "DB available",
            creditProgram: "DB program",
            hqRegion: "DB region",
            industry: "DB industry",
            legalEntity: "DB Harbor LLC",
            limitLabel: "DB limit",
            openArLabel: "DB open AR",
            ownerLabel: "DB David",
            posture: "DB human gate"
          },
          actionQueue: [
            {
              account: "DB Harbor",
              age: "09h 00m",
              item: "DB queue item",
              nextStep: "DB next step",
              priority: "P0",
              status: "DB status"
            }
          ],
          sentinelDisplay: {
            alertDetail: "DB alert detail",
            displayReason: "DB display reason",
            filedLabel: "DB filed label",
            filingId: "DB-FILING-1",
            recordStripLabel: "DB Sentinel records",
            securedPartyLabel: "DB secured party"
          }
        }
      })
    ).values;

    const model = buildCreditCockpitModel({ governedConfig: runtimeGovernedConfig, ...sourceOptions });

    expect(model.account).toMatchObject({
      availableCreditLabel: "DB available",
      creditProgram: "DB program",
      hqRegion: "DB region",
      industry: "DB industry",
      legalEntity: "DB Harbor LLC",
      limitLabel: "DB limit",
      openArLabel: "DB open AR",
      ownerLabel: "DB David",
      posture: "DB human gate"
    });
    expect(model.sentinel).toMatchObject({
      alertDetail: "DB alert detail",
      displayReason: "DB display reason",
      filedLabel: "DB filed label",
      filingId: "DB-FILING-1",
      recordStripLabel: "DB Sentinel records",
      securedPartyLabel: "DB secured party"
    });
    expect(model.sentinel.detailRows).toContainEqual({ label: "Secured party", value: "DB secured party" });
    expect(model.actionQueue).toEqual([
      {
        account: "DB Harbor",
        age: "09h 00m",
        item: "DB queue item",
        nextStep: "DB next step",
        priority: "P0",
        status: "DB status"
      }
    ]);
    expect(model.actionQueueSummaryLabel).toBe("1 governed items");
  });

  it("owns David credit route display labels in the canonical read model", () => {
    const model = buildCreditCockpitModel({ governedConfig, ...sourceOptions });

    expect(model.readoutStatusLabels).toEqual([
      "Draft-only",
      model.account.posture,
      `${String(model.audit.entries)} audit entries`
    ]);
    expect(model.account.detailRows).toEqual([
      { label: "Account ID", value: model.customerId },
      { label: "Legal entity", value: model.account.legalEntity },
      { label: "Industry", value: model.account.industry },
      { label: "HQ / region", value: model.account.hqRegion },
      { label: "Credit program", value: model.account.creditProgram },
      { label: "Owner", value: model.account.ownerLabel },
      { label: "Order", value: model.account.orderId },
      { label: "Case", value: model.account.caseId },
      { label: "Credit terms", value: model.account.terms }
    ]);
    expect(model.account.summaryRows).toEqual([
      { label: "limit", value: model.account.limitLabel },
      { label: "order exposure", value: model.account.orderAmount },
      { label: "open AR", value: model.account.openArLabel },
      { label: "DSO (90D)", value: model.account.dso90Label },
      { label: "available credit", value: model.account.availableCreditLabel },
      { label: model.partialHold.scoreReadout.summaryLabel, value: model.partialHold.scoreReadout.value },
      { label: model.partialHold.releaseReadout.label, value: model.partialHold.releaseReadout.value },
      { label: "audit state", value: model.audit.valid ? "Valid" : "Blocked" },
      { label: model.termProposal.gateSummaryLabel, value: model.termProposal.statusLabel },
      { label: "arbitration", value: model.arbitration.displayReason }
    ]);
    expect(model.sentinel.detailRows).toEqual([
      { label: "Filing ID", value: model.sentinel.filingId },
      { label: "Filed", value: model.sentinel.filedLabel },
      { label: "Secured party", value: model.sentinel.securedPartyLabel }
    ]);
    expect(model.sentinel.recordStripLabel).toBe("Sentinel alert record IDs");
    expect(model.approvalInbox.every((item) => item.recordStripLabel === `${item.actionLabel} record IDs`)).toBe(true);
    expect(model.actionQueueSummaryLabel).toBe(`${String(model.actionQueue.length)} governed items`);
    expect(model.partialHold.scoreReadout).toEqual({
      ariaLabel: "Composite partial hold score",
      basisLabel: model.partialHold.basis,
      label: "composite",
      summaryLabel: "composite score",
      stateLabel: model.arbitration.displayReason,
      value: model.partialHold.compositeScore
    });
    expect(model.partialHold.releaseReadout).toEqual({
      ariaLabel: "Deterministic release path",
      label: "release path",
      supportLabel: "Human approval gate",
      value: model.partialHold.releaseRatioPercent
    });
    expect(model.partialHold.splitRows).toEqual([
      { label: "release staged", value: model.partialHold.proposedReleaseAmount },
      { label: "back-order queue", value: model.partialHold.proposedBackOrderAmount }
    ]);
    expect(model.partialHold.ledgerRows).toEqual([
      {
        left: { label: "Composite score", value: model.partialHold.compositeScore },
        right: { label: "Release ratio", value: model.partialHold.releaseRatioPercent }
      },
      {
        left: { label: "Proposed release", value: model.partialHold.proposedReleaseAmount },
        right: { label: "Back-order hold", value: model.partialHold.proposedBackOrderAmount }
      },
      {
        left: { label: "Terms gate", value: model.termProposal.statusLabel },
        right: { label: "State", value: model.arbitration.displayReason }
      }
    ]);
    expect(model.partialHold.criteriaHeaders).toEqual(["Criterion", "Weight", "Score", "Weighted"]);
    expect(model.termProposal.summaryLabel).toBe("Draft-only recommendations waiting for David.");
    expect(model.termProposal.readyStateLabel).toBe("Ready to act");
    expect(model.termProposal.gateSummaryLabel).toBe("terms gate");
    expect(model.termProposal.packetRows).toEqual([
      { label: "Recommended terms", value: model.termProposal.terms },
      { label: "Conditions precedent", value: model.termProposal.statusLabel },
      { label: "Risk mitigants", value: model.arbitration.displayReason }
    ]);
    expect(model.termProposal.commandLabels).toEqual(["Simulate alternatives", "Send action packet"]);
  });

  it("builds the CFO summary read model from deterministic read models", () => {
    const model = buildCfoSummaryCockpitModel({ governedConfig, ...sourceOptions });
    const riskRun = runRiskMeshClosedLoop({ governedConfig, source });
    const chainHeadEntry = riskRun.auditEntries.at(-1);
    if (chainHeadEntry === undefined) {
      throw new Error("Risk Mesh run must expose a chain-head audit entry.");
    }

    expect(model.surface).toBe("cfo-summary");
    expect(model.metrics).toEqual([
      { label: "Gross-to-net", value: "$112,400.00 gross scope" },
      { label: "Margin protected", value: "$32,600.00 draft-only" },
      { label: "DSO / CEI", value: "requires live ERP inputs" },
      { label: "Leakage position", value: "$79,800.00 recovery queue" }
    ]);
    expect(model.readoutStatusLabels).toEqual(["Read-only", "Draft actions only", "5 open proofs"]);
    expect(model.boardMetrics).toHaveLength(8);
    expect(model.boardMetrics).toContainEqual({
      label: "External action posture",
      support: "HITL gate required",
      supportLabel: "human approval gate required",
      value: "Draft-only"
    });
    expect(model.reportMetadata).toEqual([
      { label: "Board pack", value: "Recoup v2 executive readout", valueLabel: "Recoup v2 executive readout" },
      { label: "Dataset", value: "Supabase recoup_deduction_lines", valueLabel: "Supabase settlement source" },
      { label: "Currency", value: "USD", valueLabel: "USD" },
      { label: "Mode", value: "Read-only board draft", valueLabel: "Read-only board draft" }
    ]);
    expect(model.auditPosture.summary.status).toBe("Governed");
    expect(model.auditPosture.summary.support).toBe("No external actions can dispatch without HITL approval.");
    expect(model.auditPosture.controls).toContainEqual({
      label: "External writes",
      support: "HITL gate",
      supportLabel: "human approval gate",
      value: "Blocked"
    });
    expect(model.auditPosture.evidenceRows.map((row) => row.label)).toEqual([
      "Recovery draft queue",
      "Billing prevention queue",
      "Risk Mesh arbitration",
      "Audit trail integrity"
    ]);
    expect(model.auditPosture.recordIds).toEqual([
      "recoup_deduction_lines",
      "S1-L1",
      "CUST-HARBOR",
      "6534",
      "USCU_S04",
      "LEDGER-6-PARTIAL-HOLD"
    ]);
    expect(model.dependencies.map((dependency) => dependency.label)).toContain("Production calibration proof");
    expect(model.dependencies.every((dependency) => dependency.status === "Open proof")).toBe(true);
    expect(model.dependencies.map((dependency) => dependency.owner)).toEqual([
      "Finance proof owner",
      "AI provenance owner",
      "Build provenance owner",
      "SAP integration owner",
      "Source contract owner"
    ]);
    expect(model.changeLedger.map((row) => row.label)).toEqual([
      "Recovery drafts",
      "Billing prevention drafts",
      "Open proof dependencies",
      "External writes"
    ]);
    expect(model.insightReadout).toEqual({
      basis: "computed deltas, dependency ledger, and HITL action posture",
      basisLabel: "computed deltas, dependency ledger, and human approval action posture",
      posture: "Informational only",
      title: "Deterministic evidence spine is ready; live proof remains gated"
    });
    const { datasetHash, reportHash, ...provenanceWithoutHashes } = model.provenance;
    expect(provenanceWithoutHashes).toEqual({
      actionPosture: "no autonomous external action",
      auditHash: chainHeadEntry.entryHash,
      dataBasis: "Supabase settlement source rows plus governed read models",
      dataBasisLabel: "Supabase settlement source rows plus governed read models",
      sourceSystems: ["SAP OData", "Contract Repo", "TPM", "Bureau", "Risk Mesh", "Audit Trail"],
      sourceSystemCountLabel: "6 source systems",
      source: "deterministic_read_model",
      sourceLabel: "Deterministic Read Model"
    });
    expect(datasetHash).toMatch(/^[a-f0-9]{12}$/u);
    expect(reportHash).toMatch(/^[a-f0-9]{12}$/u);
    expect(model.provenance.auditHash).toMatch(realAuditEntryHashPattern);
    expect(model.openDependencies).toContain("verify-prod-calibration");
    expect(model.openDependencies).toContain("verify-embeddings-model-id");
    expect(model.openDependencies).toContain("verify-codex-build-model-id");
    expect(model.openDependencies).toContain("verify-sap-sandbox-instance");
    expect(model.openDependencies).toContain("verify-v3-live-non-sap-contracts");
    expect(model.openDependencies).not.toContain("verify-runtime-config-loader");
    expect(model.openDependencies).not.toContain("r-score-weights");
    expect(model.openDependencies).not.toContain("r-drift-threshold");
    expect(model.openDependencies).not.toContain("gaming-thresholds");
  });

  it("owns CFO executive display labels in the read model", () => {
    const model = buildCfoSummaryCockpitModel({ governedConfig, ...sourceOptions });
    const riskRun = runRiskMeshClosedLoop({ governedConfig, source });
    const expectedRecoveryRecordIds = source
      .loadSettlementRun()
      .deductionLines.filter((line) => line.routing === "recovery")
      .slice(0, 3)
      .map((line) => line.lineId);
    expect(model.reportMetadata).toContainEqual({
      label: "Dataset",
      value: "Supabase recoup_deduction_lines",
      valueLabel: "Supabase settlement source"
    });
    expect(model.boardMetrics).toContainEqual({
      label: "External action posture",
      support: "HITL gate required",
      supportLabel: "human approval gate required",
      value: "Draft-only"
    });
    expect(model.auditPosture.summary).toEqual({
      status: "Governed",
      support: "No external actions can dispatch without HITL approval.",
      supportLabel: "No external actions can dispatch without human approval."
    });
    expect(model.auditPosture.controls).toContainEqual({
      label: "Evidence spine",
      support: "6 record IDs",
      supportLabel: "6 citations",
      value: "Cited"
    });
    expect(model.auditPosture.evidenceRows).toContainEqual({
      basis: "computed recovery deltas",
      basisLabel: "Computed recovery deltas",
      label: "Recovery draft queue",
      recordCountLabel: "3 citations",
      recordIds: expectedRecoveryRecordIds,
      state: "13 drafts"
    });
    expect(model.auditPosture.evidenceRows).toContainEqual({
      basis: "ranked-resolution:partial_release_55",
      basisLabel: "ranked-resolution:partial_release_55",
      label: "Risk Mesh arbitration",
      recordCountLabel: `${String(riskRun.arbitration.recordIds.length)} citations`,
      recordIds: riskRun.arbitration.recordIds,
      state: "Ranked resolution recorded"
    });
    expect(model.auditPosture.recordCountLabel).toBe("6 citations");
    expect(model.changeLedger).toContainEqual({
      label: "External writes",
      posture: "Blocked by HITL",
      postureLabel: "Blocked by human approval",
      support: "No ERP write-back",
      supportLabel: "No ERP write-back",
      value: "0"
    });
    expect(model.insightReadout).toEqual({
      basis: "computed deltas, dependency ledger, and HITL action posture",
      basisLabel: "computed deltas, dependency ledger, and human approval action posture",
      posture: "Informational only",
      title: "Deterministic evidence spine is ready; live proof remains gated"
    });
    expect(model.provenance).toMatchObject({
      dataBasis: "Supabase settlement source rows plus governed read models",
      dataBasisLabel: "Supabase settlement source rows plus governed read models",
      source: "deterministic_read_model",
      sourceLabel: "Deterministic Read Model",
      sourceSystemCountLabel: "6 source systems"
    });
    expect(model.assurance).toEqual({
      basis: "hash-chain verification",
      label: "Assurance",
      recordIds: model.auditPosture.recordIds,
      statusLabel: "Audit verified"
    });
  });

  it("builds trace, memory, and agent graph read models", () => {
    const trace = buildTraceModel({ governedConfig, ...sourceOptions });
    const firstTraceEvent = trace.events[0];
    if (firstTraceEvent === undefined) {
      throw new Error("Trace model must expose at least one event.");
    }

    expect(firstTraceEvent.recordIds).toContain("CUST-HARBOR");
    expect(firstTraceEvent.deterministicBasis).toContain("runRiskMeshClosedLoop.auditEntries");
    expect(firstTraceEvent.provenance).toBe("deterministic_demo_audit");
    expect(trace.events.every((event) => event.kind === "audit")).toBe(true);
    expect(new Set(trace.events.map((event) => event.sourceMode))).toEqual(new Set(["deterministic_demo_audit"]));
    expect(buildMemorySummaryModel().categories).toContain("approval_records");
    expect(buildMemorySummaryModel().records).toEqual([]);
    expect(buildAgentGraphModel().edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
  });

  it("rehydrates a trusted approval receipt into the matching Maya work-item detail", () => {
    const approvalRecord: MemoryRecord = {
      category: "approval_records",
      createdAt: new Date(0).toISOString(),
      id: "approval:route-billing:S1-L1",
      payload: {
        actionId: "route-billing:S1-L1",
        approverId: "human:maya-lead",
        auditEntryHash: "b".repeat(64),
        decision: "approve",
        status: "human_decided"
      },
      recordIds: ["route-billing:S1-L1", "S1-L1", "POD-SIGNED-1"],
      scope: "approval:route-billing:S1-L1",
      trustLevel: "trusted"
    };
    const detail = buildForensicsWorkItemDetailCockpitModel(
      { governedConfig, ...sourceOptions, approvalRecords: [approvalRecord] },
      "S1-L1"
    ) as ReturnType<typeof buildForensicsWorkItemDetailCockpitModel> & {
      approvalReceipt?: {
        actionId: string;
        approverId: string;
        auditEntryHash: string;
        decision: string;
        recordIds: string[];
        status: string;
      };
    };

    expect(detail.approvalState.status).toBe("human_decided");
    expect(detail.approvalState.statusLabel).toBe("Human decision recorded");
    expect(detail.auditState.status).toBe("human_decided");
    expect(detail.auditState.statusLabel).toBe("Audit receipt committed");
    expect(detail.auditState.recordIds).toEqual(expect.arrayContaining(["route-billing:S1-L1", "S1-L1"]));
    expect(detail.approvalReceipt).toEqual({
      actionId: "route-billing:S1-L1",
      approverId: "human:maya-lead",
      auditEntryHash: "b".repeat(64),
      decision: "approve",
      recordIds: ["route-billing:S1-L1", "S1-L1", "POD-SIGNED-1"],
      status: "human_decided"
    });
  });

  it("marks Maya approval eligible when backend evidence and HITL action state are complete", () => {
    const detail = buildForensicsWorkItemDetailCockpitModel({ governedConfig, ...sourceOptions }, "S1-L1");

    expect(detail.selected.approvalEligibility).toMatchObject({
      available: true,
      statusLabel: "Ready for human approval"
    });
    expect(detail.recoveryDraft.approvalEligibility).toMatchObject({
      available: true,
      statusLabel: "Ready for human approval"
    });
    expect(detail.selected.approvalEligibility.provenance).toMatchObject({
      sourceKind: "derived_backend",
      sourceName: "Forensics evidence review eligibility"
    });
    expect(detail.selected.approvalEligibility.provenance.deterministicBasis).toContain(
      "requiresHumanApproval true; status pending_human; dispatchedExternally false"
    );
    expect(detail.selected.approvalEligibility.provenance.deterministicBasis).toContain("evidenceDocuments");
  });

  it("keeps Maya approval ineligible after a trusted human decision receipt is already committed", () => {
    const approvalRecord: MemoryRecord = {
      category: "approval_records",
      createdAt: new Date(0).toISOString(),
      id: "approval:route-billing:S1-L1",
      payload: {
        actionId: "route-billing:S1-L1",
        approverId: "human:maya-lead",
        auditEntryHash: "f".repeat(64),
        decision: "approve",
        status: "human_decided"
      },
      recordIds: ["route-billing:S1-L1", "S1-L1"],
      scope: "approval:route-billing:S1-L1",
      trustLevel: "trusted"
    };
    const detail = buildForensicsWorkItemDetailCockpitModel(
      { governedConfig, ...sourceOptions, approvalRecords: [approvalRecord] },
      "S1-L1"
    );

    expect(detail.approvalState.status).toBe("human_decided");
    expect(detail.selected.approvalEligibility).toMatchObject({
      available: false,
      statusLabel: "Human decision recorded"
    });
    expect(detail.selected.approvalEligibility.provenance.deterministicBasis).toContain(
      "approval_records receipt route-billing:S1-L1 is already committed"
    );
  });

  it("keeps Maya work-item detail pending when approval receipts are malformed or for another action", () => {
    const baseRecord: MemoryRecord = {
      category: "approval_records",
      createdAt: new Date(0).toISOString(),
      id: "approval:route-billing:S1-L1",
      payload: {
        actionId: "route-billing:S1-L1",
        approverId: "human:maya-lead",
        auditEntryHash: "c".repeat(64),
        decision: "approve",
        status: "human_decided"
      },
      recordIds: ["route-billing:S1-L1", "S1-L1"],
      scope: "approval:route-billing:S1-L1",
      trustLevel: "trusted"
    };
    const detail = buildForensicsWorkItemDetailCockpitModel(
      {
        governedConfig,
        ...sourceOptions,
        approvalRecords: [
          { ...baseRecord, id: "approval:bad-hash", payload: { ...baseRecord.payload, auditEntryHash: "not-a-hash" } },
          {
            ...baseRecord,
            id: "approval:other-action",
            payload: { ...baseRecord.payload, actionId: "draft-rebill:S3-L1" },
            recordIds: ["draft-rebill:S3-L1", "S3-L1"],
            scope: "approval:draft-rebill:S3-L1"
          },
          {
            ...baseRecord,
            id: "approval:wrong-id",
            payload: { ...baseRecord.payload },
            scope: "approval:route-billing:S1-L1"
          },
          {
            ...baseRecord,
            id: "approval:route-billing:S1-L1",
            payload: { ...baseRecord.payload },
            scope: "approval:wrong-scope"
          }
        ]
      },
      "S1-L1"
    ) as ReturnType<typeof buildForensicsWorkItemDetailCockpitModel> & { approvalReceipt?: unknown };

    expect(detail.approvalState.status).toBe("pending_human");
    expect(detail.auditState.statusLabel).toBe("Awaiting human approval");
    expect(detail.approvalReceipt).toBeUndefined();
  });

  it("marks only fully decided grouped worklist rows with backend approval decision receipts", () => {
    const approvalRecords = [
      approvalMemoryRecord("route-billing:S1-L1", "S1-L1", "d"),
      approvalMemoryRecord("route-billing:S1-L2", "S1-L2", "e"),
      approvalMemoryRecord("route-billing:S1-L3", "S1-L3", "f")
    ];
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions, approvalRecords });

    expect(model.worklist.find((item) => item.lineId === "S1-L1")).toMatchObject({
      approvalStatus: "human_decided",
      approvalStatusLabel: "Human decision recorded"
    });
    expect(model.worklist.find((item) => item.lineId === "S2-L1")).toMatchObject({
      approvalStatus: "pending_human",
      approvalStatusLabel: "Awaiting reviewer"
    });
  });

  it("keeps a grouped worklist row pending when only one sibling line has a backend approval decision receipt", () => {
    const approvalRecord = approvalMemoryRecord("route-billing:S1-L2", "S1-L2", "e");
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions, approvalRecords: [approvalRecord] });

    expect(model.worklist.find((item) => item.lineId === "S1-L1")).toMatchObject({
      approvalStatus: "pending_human",
      approvalStatusLabel: "Awaiting reviewer"
    });
  });

  it("labels empty fallback and persisted memory provenance in the memory read model", () => {
    const fallback = buildMemorySummaryModel();
    const persistedRecord: MemoryRecord = {
      category: "approval_records",
      createdAt: new Date(0).toISOString(),
      id: "approval:demo-action",
      payload: { actionId: "demo-action", status: "human_decided" },
      recordIds: ["demo-action"],
      scope: "approval:demo-action",
      trustLevel: "trusted"
    };
    const buildWithMeta = buildMemorySummaryModel as (
      records: MemoryRecord[],
      meta: { backend: "sqlite" }
    ) => ReturnType<typeof buildMemorySummaryModel>;
    const persisted = buildWithMeta([persistedRecord], { backend: "sqlite" });

    expect(fallback).toMatchObject({
      backend: "in_memory_fallback",
      provenance: "empty_runtime_memory",
      sourceMode: "runtime_empty"
    });
    expect(fallback.records).toEqual([]);
    expect(persisted).toMatchObject({
      backend: "sqlite",
      provenance: "persisted_runtime_memory",
      sourceMode: "runtime_persisted"
    });
    expect(persisted.records).toEqual([
      {
        category: "approval_records",
        id: "approval:demo-action",
        recordIds: ["demo-action"],
        scope: "approval:demo-action",
        trustLevel: "trusted"
      }
    ]);
  });

  it("projects persisted approval records into sanitized audit receipts", () => {
    const approvalRecord: MemoryRecord = {
      category: "approval_records",
      createdAt: new Date(0).toISOString(),
      id: "approval:route-billing:S1-L2",
      payload: {
        actionId: "route-billing:S1-L2",
        approverId: "human:maya-lead",
        auditEntryHash: "a".repeat(64),
        decision: "approve",
        reason: "Supporting POD was validated before approving the draft.",
        status: "human_decided"
      },
      recordIds: ["route-billing:S1-L2", "S1-L2"],
      scope: "approval:route-billing:S1-L2",
      trustLevel: "trusted"
    };
    const nonApprovalRecord: MemoryRecord = {
      category: "session_state",
      createdAt: new Date(0).toISOString(),
      id: "session:demo",
      payload: { arbitraryPayload: "not exposed" },
      recordIds: ["session:demo"],
      scope: "session:demo",
      trustLevel: "trusted"
    };
    const model = buildMemorySummaryModel([approvalRecord, nonApprovalRecord], { backend: "sqlite" });

    expect(model.approvalAuditReceipts).toEqual([
      {
        actionId: "route-billing:S1-L2",
        approverId: "human:maya-lead",
        auditEntryHash: "a".repeat(64),
        decision: "approve",
        reason: "Supporting POD was validated before approving the draft.",
        recordIds: ["route-billing:S1-L2", "S1-L2"],
        status: "human_decided"
      }
    ]);
    expect(JSON.stringify(model.approvalAuditReceipts)).not.toContain("arbitraryPayload");
  });

  it("filters malformed persisted approval records out of audit receipts", () => {
    const baseRecord: MemoryRecord = {
      category: "approval_records",
      createdAt: new Date(0).toISOString(),
      id: "approval:route-billing:S1-L2",
      payload: {
        actionId: "route-billing:S1-L2",
        approverId: "human:maya-lead",
        auditEntryHash: "a".repeat(64),
        decision: "approve",
        status: "human_decided"
      },
      recordIds: ["route-billing:S1-L2", "S1-L2"],
      scope: "approval:route-billing:S1-L2",
      trustLevel: "trusted"
    };
    const malformedRecords: MemoryRecord[] = [
      { ...baseRecord, id: "approval:untrusted", trustLevel: "semi_trusted" },
      { ...baseRecord, id: "approval:system", payload: { ...baseRecord.payload, approverId: "agent:forensics" } },
      { ...baseRecord, id: "approval:bad-hash", payload: { ...baseRecord.payload, auditEntryHash: "not-a-hash" } },
      { ...baseRecord, id: "approval:bad-decision", payload: { ...baseRecord.payload, decision: "dispatch" } },
      { ...baseRecord, id: "approval:bad-status", payload: { ...baseRecord.payload, status: "pending_human" } },
      { ...baseRecord, id: "approval:missing-action-record", recordIds: ["S1-L2"] }
    ];

    const model = buildMemorySummaryModel(malformedRecords, { backend: "sqlite" });

    expect(model.approvalAuditReceipts).toEqual([]);
  });

  it("derives trace audit rows from deterministic Risk Mesh audit entries", () => {
    const riskRun = runRiskMeshClosedLoop({ governedConfig, source });
    const trace = buildTraceModel({ governedConfig, ...sourceOptions });
    const auditTraceEvents = trace.events.filter(
      (
        event
      ): event is typeof event & {
        entryHash: string;
        entryType: string;
        previousHash: string;
        sequence: number;
        sourceMode: string;
      } => "entryHash" in event && "entryType" in event && "sequence" in event && "sourceMode" in event
    );

    expect(auditTraceEvents).toHaveLength(riskRun.auditEntries.length);
    expect(auditTraceEvents.map((event) => event.entryType)).toEqual(
      riskRun.auditEntries.map((entry) => entry.entryType)
    );
    expect(auditTraceEvents.map((event) => event.entryType)).toEqual(
      expect.arrayContaining([
        "sentinel.blocked-risk",
        "arbitration.ranked",
        "partial-hold.proposed",
        "terms.proposed"
      ])
    );

    for (const sourceEntry of riskRun.auditEntries) {
      const traceEvent = auditTraceEvents.find((event) => event.entryType === sourceEntry.entryType);
      if (traceEvent === undefined) {
        throw new Error(`Missing trace audit event for ${sourceEntry.entryType}.`);
      }

      expect(traceEvent.entryHash).toMatch(realAuditEntryHashPattern);
      expect(traceEvent.entryHash).toBe(sourceEntry.entryHash);
      expect(traceEvent.previousHash).toBe(sourceEntry.previousHash);
      expect(traceEvent.sequence).toBe(sourceEntry.sequence);
      expect(traceEvent.sourceMode).toBe("deterministic_demo_audit");
      expect(traceEvent.sourceMode).not.toMatch(/live|production|stream/iu);
      expect(traceEvent.provenance).not.toMatch(/live|production|stream/iu);
      expect(traceEvent.recordIds).toEqual(sourceEntry.recordIds);
    }
  });

  it("builds connector readiness read model with schema-required non-SAP source labels until probed", () => {
    const availableEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const model = buildConnectorReadinessModel(
      availableEnvNames,
      undefined,
      sourceHealthForConnectorModel(availableEnvNames)
    );

    expect(model.surface).toBe("connector-readiness");
    expect(model.connectors.map((connector) => connector.name).sort()).toEqual([
      "bureau",
      "docs-repo",
      "edi-remittance",
      "remittance",
      "sap-odata",
      "tpm"
    ]);
    expect(model.connectors.every((connector) => connector.allowedOperations.join(",") === "read")).toBe(true);
    expect(model.connectors.map((connector) => connector.proof.externalWritesAllowed)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false
    ]);
    expect(model.sourceTiles.map((source) => source.label)).toEqual([
      "SAP OData",
      "TPM",
      "3PL POD",
      "Bureau",
      "Remittance / EDI",
      "Contract Repo",
      "MCP"
    ]);
    expect(model.sourceTiles.find((source) => source.label === "3PL POD")).toMatchObject({
      stateLabel: "Status unavailable",
      statusTone: "blocked"
    });
    expect(model.sourceTiles.find((source) => source.label === "MCP")).toMatchObject({
      stateLabel: "Status unavailable",
      statusTone: "blocked",
      summary: "Status unavailable"
    });
    const sap = model.connectors.find((connector) => connector.name === "sap-odata");
    const tpm = model.connectors.find((connector) => connector.name === "tpm");

    expect(sap?.missingCredentialEnvNames).toContain("SAP_ODATA_USERID");
    expect(sap?.status).toBe("blocked_credentials_required");
    expect(tpm?.sourceTableName).toBe("recoup_src_tpm");
    expect(tpm?.liveContractStatus).toBe("deferred_verify_v3");
    expect(tpm?.status).toBe("blocked_schema_required");
  });

  it("uses MCP health state for the MCP source readiness tile", () => {
    const availableEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const model = buildConnectorReadinessModel(
      availableEnvNames,
      undefined,
      sourceHealthForConnectorModel(availableEnvNames),
      {
        authConfigured: true,
        checkedAtIso: "2026-06-24T10:31:00.000Z",
        endpoint: "/mcp",
        healthUrl: "http://127.0.0.1:4318/healthz",
        latencyMs: 12,
        sessionMode: "stateful",
        status: "connected",
        transport: "StreamableHTTPServerTransport"
      }
    );
    const mcp = model.sourceTiles.find((sourceTile) => sourceTile.label === "MCP");

    expect(mcp).toMatchObject({
      checkedAtIso: "2026-06-24T10:31:00.000Z",
      detail: "MCP health reachable at /mcp with StreamableHTTPServerTransport/stateful.",
      modeLabel: "Read-only tools",
      stateLabel: "Connected",
      statusTone: "ready",
      summary: "Read-only tools gated"
    });
    expect(mcp?.proofItems).toEqual(expect.arrayContaining(["mcp healthz reachable", "auth configured", "no ERP write-back"]));
  });

  it("requires backend source health when building connector readiness tiles", () => {
    const buildWithoutSourceHealth = buildConnectorReadinessModel as unknown as (
      availableCredentialEnvNames: readonly string[]
    ) => unknown;

    expect(() => buildWithoutSourceHealth(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])).toThrow(
      "Connector readiness model requires backend source health."
    );
  });

  it("does not render blocked SAP source readiness as schema-ready", () => {
    const model = buildConnectorReadinessModel([], undefined, sourceHealthForConnectorModel([]));
    const markup = renderToStaticMarkup(createElement(ToolStatusRail, { connectors: model }));

    expect(markup).toContain("SAP OData");
    expect(markup).toContain("Needs setup");
    expect(markup).toContain("Status unavailable");
    expect(markup).not.toContain("Schema checked");
  });

  it("renders proxy-backed ToolStatusRail mode labels without calling them live", () => {
    const availableEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const toolDataSchemaProbe = allTablesAvailableProbe();
    const model = buildConnectorReadinessModel(
      availableEnvNames,
      toolDataSchemaProbe,
      sourceHealthForConnectorModel(availableEnvNames, toolDataSchemaProbe)
    );
    const proxyTile = model.sourceTiles.find((sourceTile) => sourceTile.modeLabel === "Proxy - Supabase");
    if (proxyTile === undefined) {
      throw new Error("Expected a proxy-backed source tile.");
    }
    const proxyOnlyModel = {
      ...model,
      sourceTiles: [
        proxyTile,
        {
          ...proxyTile,
          detail: "Proxy source unavailable.",
          key: "proxy-unavailable",
          stateLabel: "Setup",
          statusTone: "blocked" as const,
          summary: "Input required"
        }
      ]
    };
    const markup = renderToStaticMarkup(createElement(ToolStatusRail, { connectors: proxyOnlyModel }));

    expect(markup).toContain("Proxy - Supabase");
    expect(markup).not.toContain("Live source");
  });

  it("labels configured SAP with a failed live probe instead of generic setup", () => {
    const availableEnvNames = [
      "SAP_ODATA_BASE_URL",
      "SAP_ODATA_CLIENT",
      "SAP_ODATA_USERID",
      "SAP_ODATA_CLIENT_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ];
    const sourceHealth = sourceHealthForConnectorModel(availableEnvNames).map((health) =>
      health.sourceName === "sap-odata"
        ? {
            ...health,
            lastError: "fetch failed",
            proofItems: ["read-only metadata probe", "external writes blocked", "source probe failed"],
            sourceMode: "unavailable" as const,
            status: "blocked" as const
          }
        : health
    );
    const model = buildConnectorReadinessModel(availableEnvNames, undefined, sourceHealth);
    const sap = model.sourceTiles.find((source) => source.label === "SAP OData");
    if (sap === undefined) {
      throw new Error("Expected SAP source readiness tile.");
    }
    const markup = renderToStaticMarkup(createElement(ToolStatusRail, { connectors: { ...model, sourceTiles: [sap] } }));

    expect(sap).toMatchObject({
      detail: "fetch failed",
      modeLabel: "Unavailable",
      stateLabel: "Probe failed",
      statusTone: "blocked",
      summary: "Live probe failed"
    });
    expect(markup).toContain("Unavailable");
    expect(markup).not.toContain("Live source");
  });

  it("labels stale source-health snapshots as refresh overdue instead of connected", () => {
    const availableEnvNames = [
      "SAP_ODATA_BASE_URL",
      "SAP_ODATA_CLIENT",
      "SAP_ODATA_USERID",
      "SAP_ODATA_CLIENT_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ];
    const sourceHealth = sourceHealthForConnectorModel(availableEnvNames).map((health) =>
      health.sourceName === "sap-odata"
        ? {
            ...health,
            proofItems: [
              "read-only metadata probe",
              "credentials present",
              "external writes blocked",
              "supabase source-health snapshot",
              "source-health refresh overdue"
            ],
            recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001", "recoup_source_health_snapshots:sap-odata"],
            sourceMode: "live" as const,
            status: "connected" as const
          }
        : health
    );
    const model = buildConnectorReadinessModel(availableEnvNames, undefined, sourceHealth);
    const sap = model.sourceTiles.find((source) => source.label === "SAP OData");

    expect(sap).toMatchObject({
      modeLabel: "Live read",
      stateLabel: "Refresh overdue",
      statusTone: "blocked",
      summary: "Refresh overdue"
    });
  });

  it("labels missing source-health snapshots as status unavailable", () => {
    const sourceHealth = sourceHealthForConnectorModel(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).map((health) =>
      health.sourceName === "sap-odata"
        ? {
            ...health,
            lastError: "Source health status unavailable until the background refresh stores a snapshot.",
            proofItems: ["source-health status unavailable", "external writes blocked"],
            recordIds: ["sap-odata", "recoup_source_health_snapshots:sap-odata"],
            sourceMode: "unavailable" as const,
            status: "blocked" as const
          }
        : health
    );
    const model = buildConnectorReadinessModel(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], undefined, sourceHealth);
    const sap = model.sourceTiles.find((source) => source.label === "SAP OData");

    expect(sap).toMatchObject({
      modeLabel: "Unavailable",
      stateLabel: "Status unavailable",
      statusTone: "blocked",
      summary: "Status unavailable"
    });
  });

  it("renders MCP source tile from saved source-health snapshot when no live MCP probe is provided", () => {
    const availableEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const sourceHealth = [
      ...sourceHealthForConnectorModel(availableEnvNames),
      {
        checkedAtIso: "2026-06-24T10:31:00.000Z",
        latencyMs: 11,
        proofItems: ["mcp healthz reachable", "auth configured", "supabase source-health snapshot"],
        recordIds: ["mcp", "recoup_source_health_snapshots:mcp"],
        sourceMode: "live" as const,
        sourceName: "mcp",
        status: "connected" as const
      }
    ];
    const model = buildConnectorReadinessModel(availableEnvNames, undefined, sourceHealth);
    const mcp = model.sourceTiles.find((sourceTile) => sourceTile.label === "MCP");

    expect(mcp).toMatchObject({
      checkedAtIso: "2026-06-24T10:31:00.000Z",
      detail: "MCP status loaded from saved source-health snapshot.",
      modeLabel: "Read-only tools",
      stateLabel: "Connected",
      statusTone: "ready",
      summary: "Read-only tools gated"
    });
    expect(mcp?.proofItems).toEqual(expect.arrayContaining(["mcp healthz reachable", "auth configured"]));
    expect(mcp?.provenance.recordIds).toContain("recoup_source_health_snapshots:mcp");
  });

  it("names Supabase source-health snapshot provenance for cached SAP readiness", () => {
    const availableEnvNames = [
      "SAP_ODATA_BASE_URL",
      "SAP_ODATA_CLIENT",
      "SAP_ODATA_USERID",
      "SAP_ODATA_CLIENT_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ];
    const sourceHealth = sourceHealthForConnectorModel(availableEnvNames).map((health) =>
      health.sourceName === "sap-odata"
        ? {
            ...health,
            proofItems: [
              "read-only metadata probe",
              "credentials present",
              "external writes blocked",
              "supabase source-health snapshot"
            ],
            recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001", "recoup_source_health_snapshots:sap-odata"],
            sourceMode: "live" as const,
            status: "connected" as const
          }
        : health
    );
    const model = buildConnectorReadinessModel(availableEnvNames, undefined, sourceHealth);
    const sap = model.sourceTiles.find((source) => source.label === "SAP OData");

    expect(sap).toMatchObject({
      modeLabel: "Live read",
      stateLabel: "Connected",
      statusTone: "ready"
    });
    expect(sap?.provenance.deterministicBasis).toContain("supabase source-health snapshot");
    expect(sap?.provenance.recordIds).toContain("recoup_source_health_snapshots:sap-odata");
  });


  it("builds connector readiness read model with synthetic-ready non-SAP source labels after probe proof", () => {
    const availableEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const toolDataSchemaProbe = allTablesAvailableProbe();
    const model = buildConnectorReadinessModel(
      availableEnvNames,
      toolDataSchemaProbe,
      sourceHealthForConnectorModel(availableEnvNames, toolDataSchemaProbe)
    );
    const syntheticConnectors = model.connectors.filter((connector) => connector.name !== "sap-odata");

    expect(syntheticConnectors).toHaveLength(5);
    expect(syntheticConnectors.every((connector) => connector.sourceMode === "synthetic_static_table")).toBe(true);
    expect(syntheticConnectors.every((connector) => connector.proof.schemaValidated)).toBe(true);
    expect(syntheticConnectors.every((connector) => connector.status === "ready_synthetic")).toBe(true);
    expect(syntheticConnectors.some((connector) => connector.status === "ready")).toBe(false);
    expect(syntheticConnectors.find((connector) => connector.name === "tpm")).toMatchObject({
      sourceTableName: "recoup_src_tpm",
      status: "ready_synthetic",
      toolDataTableNames: ["customers", "payments", "promotions", "contracts"]
    });
    expect(
      model.sourceTiles
        .filter((sourceTile) => sourceTile.modeLabel === "Proxy - Supabase")
        .map((sourceTile) => ({ stateLabel: sourceTile.stateLabel, statusTone: sourceTile.statusTone }))
    ).toEqual([
      { stateLabel: "Proxy - Supabase", statusTone: "ready" },
      { stateLabel: "Proxy - Supabase", statusTone: "ready" },
      { stateLabel: "Proxy - Supabase", statusTone: "ready" },
      { stateLabel: "Proxy - Supabase", statusTone: "ready" },
      { stateLabel: "Proxy - Supabase", statusTone: "ready" }
    ]);
  });
});

function allTablesAvailableProbe(): SupabaseToolDataSchemaProbe {
  return {
    tableStatuses: Object.fromEntries(
      ALL_TOOLS_DATA_TABLE_NAMES.map((tableName) => [tableName, "available" as const])
    ),
    unsafeShadowActions: []
  };
}

function sourceHealthForConnectorModel(
  availableCredentialEnvNames: readonly string[],
  toolDataSchemaProbe?: SupabaseToolDataSchemaProbe
) {
  return buildSourceHealthFromConnectorReadiness(
    buildConnectorReadiness([], availableCredentialEnvNames, toolDataSchemaProbe),
    "2026-06-24T10:30:00.000Z"
  );
}

function buildSupabaseGovernedConfigRows(riskMeshCases: Record<string, unknown>): unknown[] {
  const rows = governedConfigSeedRows.filter((row) => row.key !== "risk_mesh_cases");
  return [
    ...rows.map((row) => ({
      active: row.active,
      approved_by: row.approvedBy,
      config_hash: row.configHash,
      config_version: row.configVersion,
      effective_from: row.effectiveFrom,
      key: row.key,
      value_json: row.valueJson
    })),
    {
      active: true,
      approved_by: day1BootstrapSeedApprovedBy,
      config_hash: sha256CanonicalJson(riskMeshCases),
      config_version: 1,
      effective_from: "2026-06-20T00:00:00.000Z",
      key: "risk_mesh_cases",
      value_json: riskMeshCases
    }
  ];
}

function weightLabel(weight: string): string {
  const numericWeight = Number(weight);
  if (Number.isNaN(numericWeight)) {
    return weight;
  }

  return `${String(Math.round(numericWeight * 100))}%`;
}
