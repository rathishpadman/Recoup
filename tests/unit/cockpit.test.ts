import { describe, expect, it } from "vitest";
import { buildForensicsCockpitModel, buildForensicsSseEvents } from "../../src/services/cockpitModel.js";

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
});
