import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ALL_TOOLS_DATA_TABLE_NAMES,
  type SupabaseToolDataSchemaProbe
} from "../../src/adapters/connectorRegistry.js";
import {
  buildAgentGraphModel,
  buildConnectorReadinessModel,
  buildCfoSummaryCockpitModel,
  buildCreditCockpitModel,
  buildForensicsCockpitModel,
  buildForensicsSseEvents,
  buildLoginModel,
  buildMemorySummaryModel,
  buildTraceModel
} from "../../src/services/cockpitModel.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import type { MemoryRecord } from "../../src/memory/schema.js";
import { ToolStatusRail } from "../../cockpit/app/premium-components.tsx";

const realAuditEntryHashPattern = /^[a-f0-9]{64}$/u;

describe("S5 Forensics cockpit model", () => {
  it("builds login personas from the canonical deterministic demo profiles", () => {
    const model = buildLoginModel();

    expect(model.surface).toBe("login");
    expect(model.personas.map((persona) => persona.loginId)).toEqual(["Maya", "david", "CFO"]);
    expect(model.personas.map((persona) => persona.role)).toEqual(["maya", "david", "cfo"]);
    expect(model.personas.map((persona) => persona.displayName)).toEqual(["Maya Patel", "David Kim", "CFO"]);
    expect(model.personas.map((persona) => persona.defaultRoute)).toEqual(["/forensics", "/credit", "/cfo"]);
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
    const model = buildForensicsCockpitModel();

    expect(model.surface).toBe("forensics-analyst");
    expect(model.worklist).toHaveLength(8);
    expect(model.kpiStrip).toHaveLength(6);
    expect(model.worklist.every((item) => item.lineCount >= 1)).toBe(true);
    expect(model.worklist.every((item) => Number.parseInt(item.evidenceScoreLabel, 10) > 0)).toBe(true);
    expect(model.worklist.every((item) => item.queueLabel.length > 0)).toBe(true);
    expect(model.selected.evidencePack.documents.length).toBeGreaterThan(0);
    expect(model.selected.draft.status).toBe("pending_human");
    expect(model.selected.draft.actionLabel).toBe("Recovery draft staged");
    expect(model.selected.approvalActions.map((action) => action.decision)).toEqual(["approve", "modify", "reject"]);
    expect(model.multimodalDock.policyLabel).toBe("voice/text citation parity");
    expect(model.multimodalDock.subAgents.map((agent) => agent.name)).toEqual(["POD-Retriever", "Contract-Reader", "TPM-Matcher"]);
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

  it("surfaces Crestline M6 as a risk-review-only containment read model", () => {
    const model = buildForensicsCockpitModel();
    const credit = buildCreditCockpitModel();

    expect(model.containmentPanel).toMatchObject({
      actionPostureLabel: "No hold or freeze action staged",
      customerId: "CUST-CRESTLINE",
      customerLabel: "Crestline Grocery",
      intentLabel: "gaming",
      postureLabel: "HITL risk review only",
      statusLabel: "M6 containment candidate"
    });
    expect(model.containmentPanel.recordIds).toEqual(
      expect.arrayContaining(["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"])
    );
    expect(model.containmentPanel.behavioralEvidenceIds).toEqual(
      expect.arrayContaining(["TPM-CONTRACT-1", "POD-SIGNED-1", "PRICE-CLAUSE-1"])
    );
    expect(model.containmentPanel.basisRows).toContainEqual({
      label: "Gaming gate",
      value: "owner-ratified-day-1-seed-present"
    });
    expect(model.containmentPanel.handoff).toMatchObject({
      label: "David / Risk Mesh reference",
      status: "review-only handoff"
    });
    expect(model.actionInbox.every((action) => action.actionType !== "propose-hold")).toBe(true);
    expect(credit.negotiation.timeline.some((item) => item.message.includes("Crestline M6"))).toBe(true);
  });

  it("formats money from service Decimal values, not cockpit arithmetic", () => {
    const model = buildForensicsCockpitModel();

    expect(model.recoveryTracker.totalExposure).toBe("$112,400.00");
    expect(model.recoveryTracker.projectedRecovery).toBe("$79,800.00");
    expect(model.recoveryTracker.projectedBilling).toBe("$32,600.00");
    expect(model.worklist.every((item) => item.amount.startsWith("$"))).toBe(true);
  });

  it("exposes an SSE envelope sequence with finding, verdict, and status events", () => {
    const events = buildForensicsSseEvents();
    const eventTypes = events.map((event) => event.type as string);

    expect(eventTypes.includes("finding")).toBe(true);
    expect(eventTypes.includes("verdict")).toBe(true);
    expect(eventTypes.includes("status")).toBe(true);
    expect(eventTypes.includes("eval")).toBe(false);
    expect(events.every((event) => "payload" in event)).toBe(true);
  });

  it("builds the David credit and arbitration read model without activating expert-owned constants", () => {
    const model = buildCreditCockpitModel();
    const riskRun = runRiskMeshClosedLoop();
    const arbitrationEntry = riskRun.auditEntries.find((entry) => entry.entryType === "arbitration.blocked");
    const chainHeadEntry = riskRun.auditEntries.at(-1);
    if (arbitrationEntry === undefined || chainHeadEntry === undefined) {
      throw new Error("Risk Mesh run must expose arbitration and chain-head audit entries.");
    }

    expect(model.surface).toBe("credit-arbitration");
    expect(model.customerId).toBe("CUST-HARBOR");
    expect(model.account).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      customerLabel: "Harbor",
      orderAmount: "$640,000.00",
      orderId: "ORDER-HARBOR-640K",
      posture: "Human approval required"
    });
    expect(model.sentinel.reason).toBe("verify-runtime-config-loader-required");
    expect(model.sentinel.displayReason).toBe("Bureau lien alert");
    expect(model.sentinel.signals).toContainEqual({ label: "Lien signal", value: "observed" });
    expect(model.sentinel.alertDetail).toContain("UCC-1 filing detected");
    expect(model.actionQueue.map((item) => item.item)).toContain("Bureau lien alert");
    expect(model.actionQueue).toHaveLength(5);
    expect(model.partialHold.releaseRatioPercent).toBe("55%");
    expect(model.partialHold.proposedReleaseAmount).toBe("$352,000.00");
    expect(model.partialHold.criteria.map((criterion) => criterion.label)).toContain("Order exposure");
    expect(model.arbitration.status).toBe("blocked");
    expect(model.arbitration.reason).toBe("verify-prod-calibration-required");
    expect(model.arbitration.displayReason).toBe("Production calibration proof required");
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
    expect(model.negotiation.nodes.map((node) => node.functionName)).toEqual([
      "credit",
      "fulfillment",
      "billing",
      "collections"
    ]);
    expect(model.negotiation.nodes.map((node) => node.displayName)).toEqual([
      "Credit",
      "Fulfillment",
      "Billing",
      "Collections"
    ]);
    expect(model.negotiation.nodes.every((node) => node.recordIds.length > 0)).toBe(true);
  });

  it("exposes David command-centre rows from the canonical credit read model", () => {
    const model = buildCreditCockpitModel();
    const urgentCount = model.actionQueue.filter((item) => item.priority === "P1").length;
    const firstCriterion = model.partialHold.criteria[0];
    if (firstCriterion === undefined) {
      throw new Error("Credit command centre requires at least one partial-hold criterion.");
    }

    expect(model.commandCenter.statusRail).toEqual([
      {
        detail: model.account.posture,
        label: "Harbor",
        tone: "blocked",
        value: "review"
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
      detail: `20% weight; ${firstCriterion.contribution} impact`,
      label: firstCriterion.label,
      score: firstCriterion.score,
      tone: "blocked"
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

  it("owns David credit route display labels in the canonical read model", () => {
    const model = buildCreditCockpitModel();

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
    const model = buildCfoSummaryCockpitModel();
    const riskRun = runRiskMeshClosedLoop();
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
    expect(model.readoutStatusLabels).toEqual(["Read-only", "Draft actions only", "6 open proofs"]);
    expect(model.boardMetrics).toHaveLength(8);
    expect(model.boardMetrics).toContainEqual({
      label: "External action posture",
      support: "HITL gate required",
      supportLabel: "human approval gate required",
      value: "Draft-only"
    });
    expect(model.reportMetadata).toEqual([
      { label: "Board pack", value: "Recoup v2 executive readout", valueLabel: "Recoup v2 executive readout" },
      { label: "Dataset", value: "Synthetic seed 42", valueLabel: "Deterministic demo dataset" },
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
      "SYNTHETIC-SEED-42",
      "CUST-HARBOR",
      "ORDER-HARBOR-640K",
      "LEDGER-6-PARTIAL-HOLD"
    ]);
    expect(model.dependencies.map((dependency) => dependency.label)).toContain("Production calibration proof");
    expect(model.dependencies.every((dependency) => dependency.status === "Open proof")).toBe(true);
    expect(model.dependencies.map((dependency) => dependency.owner)).toEqual([
      "Finance proof owner",
      "Platform proof owner",
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
      dataBasis: "synthetic seed 42 plus deterministic read models",
      dataBasisLabel: "Deterministic demo dataset plus governed read models",
      sourceSystems: ["SAP OData", "Contract Repo", "TPM", "Risk Mesh", "Audit Trail"],
      sourceSystemCountLabel: "5 source systems",
      source: "deterministic_read_model",
      sourceLabel: "Deterministic Read Model"
    });
    expect(datasetHash).toMatch(/^[a-f0-9]{12}$/u);
    expect(reportHash).toMatch(/^[a-f0-9]{12}$/u);
    expect(model.provenance.auditHash).toMatch(realAuditEntryHashPattern);
    expect(model.openDependencies).toContain("verify-prod-calibration");
    expect(model.openDependencies).toContain("verify-runtime-config-loader");
    expect(model.openDependencies).toContain("verify-embeddings-model-id");
    expect(model.openDependencies).toContain("verify-codex-build-model-id");
    expect(model.openDependencies).toContain("verify-sap-sandbox-instance");
    expect(model.openDependencies).toContain("verify-v3-live-non-sap-contracts");
    expect(model.openDependencies).not.toContain("r-score-weights");
    expect(model.openDependencies).not.toContain("r-drift-threshold");
    expect(model.openDependencies).not.toContain("gaming-thresholds");
  });

  it("owns CFO executive display labels in the read model", () => {
    const model = buildCfoSummaryCockpitModel();
    const riskRun = runRiskMeshClosedLoop();

    expect(model.reportMetadata).toContainEqual({
      label: "Dataset",
      value: "Synthetic seed 42",
      valueLabel: "Deterministic demo dataset"
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
      support: "4 record IDs",
      supportLabel: "4 citations",
      value: "Cited"
    });
    expect(model.auditPosture.evidenceRows).toContainEqual({
      basis: "computed recovery deltas",
      basisLabel: "Computed recovery deltas",
      label: "Recovery draft queue",
      recordCountLabel: "1 citation",
      recordIds: ["SYNTHETIC-SEED-42"],
      state: "13 drafts"
    });
    expect(model.auditPosture.evidenceRows).toContainEqual({
      basis: riskRun.arbitration.reason,
      basisLabel: "Calibration proof required",
      label: "Risk Mesh arbitration",
      recordCountLabel: `${String(riskRun.arbitration.recordIds.length)} citations`,
      recordIds: riskRun.arbitration.recordIds,
      state: "Calibration proof open"
    });
    expect(model.auditPosture.recordCountLabel).toBe("4 citations");
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
      dataBasis: "synthetic seed 42 plus deterministic read models",
      dataBasisLabel: "Deterministic demo dataset plus governed read models",
      source: "deterministic_read_model",
      sourceLabel: "Deterministic Read Model",
      sourceSystemCountLabel: "5 source systems"
    });
    expect(model.assurance).toEqual({
      basis: "hash-chain verification",
      label: "Assurance",
      recordIds: model.auditPosture.recordIds,
      statusLabel: "Audit verified"
    });
  });

  it("builds trace, memory, and agent graph read models", () => {
    const trace = buildTraceModel();
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
    expect(buildMemorySummaryModel().records.some((record) => record.category === "agent_handoff_packets")).toBe(true);
    expect(buildAgentGraphModel().edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
  });

  it("labels deterministic fallback and persisted memory provenance in the memory read model", () => {
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
      provenance: "deterministic_demo_memory",
      sourceMode: "deterministic_demo_fallback"
    });
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

  it("derives trace audit rows from deterministic Risk Mesh audit entries", () => {
    const riskRun = runRiskMeshClosedLoop();
    const trace = buildTraceModel();
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
        "arbitration.blocked",
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
    const model = buildConnectorReadinessModel(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

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
      stateLabel: "Synthetic",
      statusTone: "synthetic"
    });
    const sap = model.connectors.find((connector) => connector.name === "sap-odata");
    const tpm = model.connectors.find((connector) => connector.name === "tpm");

    expect(sap?.missingCredentialEnvNames).toContain("SAP_ODATA_USERID");
    expect(sap?.status).toBe("blocked_credentials_required");
    expect(tpm?.sourceTableName).toBe("recoup_src_tpm");
    expect(tpm?.liveContractStatus).toBe("deferred_verify_v3");
    expect(tpm?.status).toBe("blocked_schema_required");
  });

  it("does not render blocked SAP source readiness as schema-ready", () => {
    const model = buildConnectorReadinessModel([]);
    const markup = renderToStaticMarkup(createElement(ToolStatusRail, { connectors: model }));

    expect(markup).toContain("SAP OData");
    expect(markup).toContain("Needs setup");
    expect(markup).toContain("Input required");
    expect(markup).not.toContain("Schema checked");
  });

  it("builds connector readiness read model with synthetic-ready non-SAP source labels after probe proof", () => {
    const model = buildConnectorReadinessModel(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], allTablesAvailableProbe());
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
