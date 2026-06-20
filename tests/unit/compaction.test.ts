import { describe, expect, it } from "vitest";
import { compactMemoryRecords } from "../../src/memory/compaction.js";
import type { MemoryRecord } from "../../src/memory/schema.js";

describe("memory compaction", () => {
  it("preserves objective, approvals, record IDs, artifacts, and next step", () => {
    const records: MemoryRecord[] = [
      {
        id: "approval-1",
        category: "approval_records",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { actionId: "propose-hold:ORDER-HARBOR-640K", status: "pending_human" },
        recordIds: ["ORDER-HARBOR-640K"],
        createdAt: "2026-06-19T00:00:00.000Z"
      }
    ];

    expect(
      compactMemoryRecords({
        objective: "Finish S7 architecture hardening",
        records,
        scope: "case:ARB-HARBOR-ORDER-640K",
        nextStep: "render trace viewer"
      })
    ).toEqual({
      category: "compaction_summaries",
      trustLevel: "trusted",
      scope: "case:ARB-HARBOR-ORDER-640K",
      payload: {
        objective: "Finish S7 architecture hardening",
        preservedCategories: ["approval_records"],
        nextStep: "render trace viewer"
      },
      recordIds: ["ORDER-HARBOR-640K"]
    });
  });

  it("does not promote semi-trusted or untrusted memory to trusted compaction", () => {
    const records: MemoryRecord[] = [
      {
        id: "connector-1",
        category: "connector_state",
        trustLevel: "semi_trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { source: "sap-sandbox-staged" },
        recordIds: ["CUST-HARBOR"],
        createdAt: "2026-06-19T00:00:00.000Z"
      },
      {
        id: "artifact-1",
        category: "artifact_refs",
        trustLevel: "untrusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { source: "user-upload" },
        recordIds: ["DOC-HARBOR-1"],
        createdAt: "2026-06-19T00:00:00.000Z"
      }
    ];

    expect(
      compactMemoryRecords({
        objective: "Preserve guarded memory",
        records,
        scope: "case:ARB-HARBOR-ORDER-640K",
        nextStep: "review evidence"
      }).trustLevel
    ).toBe("untrusted");
  });
});
