import { describe, expect, it } from "vitest";
import {
  buildAgentGraphModel,
  buildConnectorReadinessModel,
  buildCfoSummaryCockpitModel,
  buildCreditCockpitModel,
  buildForensicsCockpitModel,
  buildForensicsSseEvents,
  buildMemorySummaryModel,
  buildTraceModel
} from "../../src/services/cockpitModel.js";

describe("S5 Forensics cockpit model", () => {
  it("builds a pre-triaged 8-card worklist with evidence, draft, and approval actions", () => {
    const model = buildForensicsCockpitModel();

    expect(model.surface).toBe("forensics-analyst");
    expect(model.worklist).toHaveLength(8);
    expect(model.selected.evidencePack.documents.length).toBeGreaterThan(0);
    expect(model.selected.draft.status).toBe("pending_human");
    expect(model.selected.approvalActions).toEqual(["approve", "modify", "reject"]);
    expect(model.actionInbox.some((action) => action.actionType === "draft-rebill")).toBe(true);
    expect(model.actionInbox.some((action) => action.actionType === "route-billing")).toBe(true);
    expect(model.recoveryTracker.recoveryLines).toBe(13);
    expect(model.recoveryTracker.billingLines).toBe(7);
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

    expect(model.surface).toBe("credit-arbitration");
    expect(model.customerId).toBe("CUST-HARBOR");
    expect(model.partialHold.releaseRatioPercent).toBe("55%");
    expect(model.partialHold.proposedReleaseAmount).toBe("$352,000.00");
    expect(model.arbitration.status).toBe("blocked");
    expect(model.arbitration.reason).toBe("expert-arbitration-weights-unset");
    expect(model.termProposal.status).toBe("pending_human");
    expect(model.approvalInbox.some((item) => item.actionType === "propose-hold")).toBe(true);
  });

  it("builds the CFO summary read model from deterministic read models", () => {
    const model = buildCfoSummaryCockpitModel();

    expect(model.surface).toBe("cfo-summary");
    expect(model.metrics).toEqual([
      { label: "Gross-to-net", value: "$112,400.00 gross scope" },
      { label: "Margin protected", value: "$32,600.00 draft-only" },
      { label: "DSO / CEI", value: "requires live ERP inputs" },
      { label: "Leakage position", value: "$79,800.00 recovery queue" }
    ]);
    expect(model.openDependencies).toContain("expert-arbitration-weights");
    expect(model.openDependencies).toContain("r-score-weights");
  });

  it("builds trace, memory, and agent graph read models", () => {
    const firstTraceEvent = buildTraceModel().events[0];
    if (firstTraceEvent === undefined) {
      throw new Error("Trace model must expose at least one event.");
    }

    expect(firstTraceEvent.recordIds).toContain("CUST-HARBOR");
    expect(firstTraceEvent.deterministicBasis).toContain("audit.read");
    expect(buildMemorySummaryModel().categories).toContain("approval_records");
    expect(buildMemorySummaryModel().records.some((record) => record.category === "agent_handoff_packets")).toBe(true);
    expect(buildAgentGraphModel().edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
  });

  it("builds connector readiness read model without marking absent real contracts ready", () => {
    const model = buildConnectorReadinessModel();

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
    const sap = model.connectors.find((connector) => connector.name === "sap-odata");
    const tpm = model.connectors.find((connector) => connector.name === "tpm");

    expect(sap?.missingCredentialEnvNames).toContain("SAP_ODATA_USERID");
    expect(sap?.status).toBe("blocked_credentials_required");
    expect(tpm?.missingSourceContractInputs).toContain("TPM source contract");
    expect(tpm?.status).toBe("blocked_schema_required");
  });
});
