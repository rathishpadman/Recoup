import { describe, expect, it } from "vitest";
import { createAuditTrail } from "../../src/audit/trail.js";

describe("I-9 hash-chain tamper detection", () => {
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

    expect(() => {
      first.payload = { ...first.payload, decision: "modify" };
    }).toThrow();
    expect(trail.verify()).toBe(true);
  });

  it("returns immutable audit entry snapshots from append and entries", () => {
    const trail = createAuditTrail();
    const payload = {
      approval: {
        decision: "approve"
      }
    };
    const recordIds = ["draft-rebill:S3-L1", "S3-L1"];
    const first = trail.append({
      entryType: "approval.decision",
      payload,
      recordIds
    });

    payload.approval.decision = "modify";
    recordIds.push("MUTATED-OUTSIDE");

    expect(trail.verify()).toBe(true);
    expect(first.payload).toEqual({
      approval: {
        decision: "approve"
      }
    });
    expect(first.recordIds).toEqual(["draft-rebill:S3-L1", "S3-L1"]);

    expect(() => {
      first.payload = { approval: { decision: "reject" } };
    }).toThrow();
    expect(() => {
      (first.payload.approval as { decision: string }).decision = "reject";
    }).toThrow();

    const [snapshot] = trail.entries();
    if (snapshot === undefined) {
      throw new Error("Expected audit entry snapshot.");
    }

    expect(() => {
      snapshot.recordIds.push("MUTATED-SNAPSHOT");
    }).toThrow();
    expect(trail.verify()).toBe(true);
  });

  it("rejects non-JSON audit payload values that JSON.stringify would hide", () => {
    const trail = createAuditTrail();
    const arrayWithExtraProperty = ["approve"] as string[] & { extra?: string };
    arrayWithExtraProperty.extra = "hidden";

    expect(() =>
      trail.append({
        entryType: "approval.decision",
        payload: {
          evidence: new Map([["decision", "approve"]])
        },
        recordIds: ["draft-rebill:S3-L1", "S3-L1"]
      })
    ).toThrow("Audit payload must be JSON-serializable.");

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        trail.append({
          entryType: "approval.decision",
          payload: {
            score: value
          },
          recordIds: ["draft-rebill:S3-L1", "S3-L1"]
        })
      ).toThrow("Audit payload must be JSON-serializable.");
    }

    expect(() =>
      trail.append({
        entryType: "approval.decision",
        payload: {
          decisions: arrayWithExtraProperty
        },
        recordIds: ["draft-rebill:S3-L1", "S3-L1"]
      })
    ).toThrow("Audit payload must be JSON-serializable.");
  });
});
