import { describe, expect, it } from "vitest";
import { createAuditTrail } from "../../src/audit/trail.js";

describe("I-9 approval audit trail", () => {
  it("hashes approval entries with previous-hash continuity and detects tampering", () => {
    const trail = createAuditTrail();
    const first = trail.append({
      entryType: "approval.decision",
      payload: {
        actionId: "draft-rebill:S3-L1",
        approverId: "human:maya-lead",
        decision: "approve"
      },
      recordIds: ["draft-rebill:S3-L1", "S3-L1"]
    });
    const second = trail.append({
      entryType: "approval.decision",
      payload: {
        actionId: "route-billing:S1-L1",
        approverId: "human:maya-lead",
        decision: "reject"
      },
      recordIds: ["route-billing:S1-L1", "S1-L1"]
    });

    expect(first.previousHash).toBe("GENESIS");
    expect(second.previousHash).toBe(first.entryHash);
    expect(first.entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(trail.verify()).toBe(true);

    first.payload = { ...first.payload, decision: "modify" };

    expect(trail.verify()).toBe(false);
  });
});
