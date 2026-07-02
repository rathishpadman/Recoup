import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";
import {
  createSupabaseReconciliationReceiptRepository,
  type ReconciliationReceiptRepositorySupabaseFetch
} from "../../src/services/reconciliationReceipts.js";
import {
  CanonicalEvidenceDocumentSchema,
  evidenceContentHash,
  type CanonicalEvidenceDocument
} from "../../src/types/evidence.js";

describe("evidence-derived reconciliation engine", () => {
  it("derives every S1-S8 reconciliation rule from canonical evidence documents", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const expectedRules: Array<[string, string, string[]]> = [
      ["S1-L1", "damage-evidence-valid", ["EVD-CARRIER-REPORT-S1-L1", "EVD-CARRIER-PHOTO-S1-L1", "EVD-REMIT-S1-L1"]],
      ["S2-L1", "promo-not-captured", ["EVD-TPM-PROMO-S2-L1", "EVD-TPM-ACCRUAL-S2-L1", "EVD-REMIT-S2-L1"]],
      ["S3-L1", "shortage-pod-mismatch", ["EVD-POD-S3-L1", "EVD-REMIT-S3-L1"]],
      ["S4-L1", "otif-fine-valid", ["EVD-CONTRACT-SLA-S4-L1", "EVD-POD-S4-L1", "EVD-REMIT-S4-L1"]],
      ["S5-L1", "otif-timestamp-mismatch", ["EVD-CONTRACT-SLA-S5-L1", "EVD-POD-S5-L1", "EVD-REMIT-S5-L1"]],
      [
        "S6-L1",
        "pricing-below-contract",
        ["EVD-CUSTOMER-PO-S6-L1", "EVD-CONTRACT-PRICING-S6-L1", "EVD-SAP-INVOICE-S6-L1", "EVD-REMIT-S6-L1"]
      ],
      [
        "S7-L1",
        "promo-overclaim",
        [
          "EVD-TPM-PROMO-S7-L1",
          "EVD-TPM-ACCRUAL-S7-L1",
          "EVD-BUREAU-S7-L1",
          "EVD-PAYMENT-HISTORY-S7-L1",
          "EVD-REMIT-S7-L1"
        ]
      ],
      ["S8-L1", "duplicate-credit", ["EVD-SAP-CREDIT-MEMO-S8-L1", "EVD-REMIT-S8-L1"]]
    ];

    for (const [lineId, ruleId, evidenceIds] of expectedRules) {
      const receipt = reconcileDeductionClaim({
        claim: claimByLine(dataset, lineId),
        documents: dataset.documents
      });

      expect(receipt).toEqual(
        expect.objectContaining({
          claimId: `CLAIM-${lineId}`,
          lineId,
          receiptId: `RECON-${lineId}`,
          ruleId
        })
      );
      expect(receipt.evidenceIds).toEqual(expect.arrayContaining(evidenceIds));
      expect(receipt.derivedRuleInput).toEqual(expect.objectContaining({ lineId, ruleId }));
      expectStringArrayContaining(receipt.deterministicBasis["comparedEvidenceIds"], evidenceIds);
      expectStringArray(receipt.deterministicBasis["sourceDocumentTypes"]);
      expectNumber(receipt.confidenceFactors["evidenceCount"]);
      expectRecord(receipt.confidenceFactors["provenanceByEvidenceId"]);
      expectStringArray(receipt.confidenceFactors["sourceSystems"]);
      expect(receipt.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("fails closed when required POD evidence is missing for a shortage claim", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });

    expect(() =>
      reconcileDeductionClaim({
        claim: claimByLine(dataset, "S3-L1"),
        documents: dataset.documents.filter((document) => document.evidenceId !== "EVD-POD-S3-L1")
      })
    ).toThrow("Missing required pod evidence for S3-L1.");
  });

  it("changes behavior when the source POD field changes", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const mutatedDocuments = dataset.documents.map((document) =>
      document.evidenceId === "EVD-POD-S3-L1"
        ? withPayload(document, {
            ...document.payload,
            podSignedFullDelivery: false
          })
        : document
    );

    expect(() =>
      reconcileDeductionClaim({
        claim: claimByLine(dataset, "S3-L1"),
        documents: mutatedDocuments
      })
    ).toThrow("Unable to derive reconciliation rule for S3-L1 from evidence documents.");
  });

  it("fails closed when pricing evidence lacks the SAP invoice comparison", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });

    expect(() =>
      reconcileDeductionClaim({
        claim: claimByLine(dataset, "S6-L1"),
        documents: dataset.documents.filter((document) => document.evidenceId !== "EVD-SAP-INVOICE-S6-L1")
      })
    ).toThrow("Missing required sap_invoice evidence for S6-L1.");
  });

  it("fails closed when gaming-promo evidence lacks cross-line risk context", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });

    expect(() =>
      reconcileDeductionClaim({
        claim: claimByLine(dataset, "S7-L1"),
        documents: dataset.documents.filter((document) => document.evidenceId !== "EVD-PAYMENT-HISTORY-S7-L1")
      })
    ).toThrow("Missing required payment_history evidence for S7-L1.");

    expect(() =>
      reconcileDeductionClaim({
        claim: claimByLine(dataset, "S7-L1"),
        documents: dataset.documents.filter((document) => document.evidenceId !== "EVD-BUREAU-S7-L1")
      })
    ).toThrow("Missing required bureau_alert evidence for S7-L1.");
  });

  it("does not contain runtime references to seeded scenario labels", () => {
    const source = readFileSync("src/services/reconciliationEngine.ts", "utf8");

    expect(source).not.toMatch(/\bscenario_id\b/u);
    expect(source).not.toMatch(/\bscenarioId\b/u);
    expect(source).not.toMatch(/\bgold_scenario_id\b/u);
    expect(source).not.toMatch(/\bgoldScenarioId\b/u);
  });
});

describe("reconciliation receipt Supabase repository", () => {
  it("upserts derived receipts without serializing service-role secrets or seeded labels", async () => {
    const calls: Array<{ body: string; headers: Headers; method: string; url: string }> = [];
    const fetcher: ReconciliationReceiptRepositorySupabaseFetch = (url, init) => {
      calls.push({
        body: typeof init.body === "string" ? init.body : "",
        headers: new Headers(init.headers),
        method: init.method ?? "GET",
        url
      });
      return Promise.resolve(new Response(JSON.stringify([]), { headers: { "content-type": "application/json" }, status: 200 }));
    };
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const receipt = reconcileDeductionClaim({ claim: claimByLine(dataset, "S3-L1"), documents: dataset.documents });
    const repository = createSupabaseReconciliationReceiptRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    await repository.upsertReconciliationReceipts([receipt]);

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "POST /rest/v1/recoup_reconciliation_receipts"
    ]);
    expect(calls[0]?.headers.get("apikey")).toBe("supabase-service-secret");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer supabase-service-secret");
    expect(calls[0]?.body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(calls[0]?.body).not.toContain("supabase-service-secret");
    expect(calls[0]?.body).not.toContain("scenario_id");
    expect(calls[0]?.body).not.toContain("scenarioId");

    const rows = JSON.parse(calls[0]?.body ?? "[]") as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) {
      throw new Error("Expected one reconciliation receipt row.");
    }
    expect(row["claim_id"]).toBe("CLAIM-S3-L1");
    expect(row["content_hash"]).toBe(receipt.contentHash);
    expectStringArrayContaining(row["evidence_ids"], ["EVD-POD-S3-L1", "EVD-REMIT-S3-L1"]);
    expect(row["line_id"]).toBe("S3-L1");
    expect(row["receipt_id"]).toBe("RECON-S3-L1");
    expect(row["rule_id"]).toBe("shortage-pod-mismatch");
  });
});

function claimByLine(dataset: ReturnType<typeof materializeRealEvidenceDataset>, lineId: string) {
  const claim = dataset.claims.find((candidate) => candidate.lineId === lineId);
  if (claim === undefined) {
    throw new Error(`Missing claim ${lineId}`);
  }
  return claim;
}

function withPayload(document: CanonicalEvidenceDocument, payload: Record<string, unknown>): CanonicalEvidenceDocument {
  return CanonicalEvidenceDocumentSchema.parse({
    ...document,
    contentHash: evidenceContentHash(payload),
    payload
  });
}

function expectNumber(value: unknown): void {
  expect(typeof value).toBe("number");
}

function expectRecord(value: unknown): void {
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
}

function expectStringArray(value: unknown): void {
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) {
    throw new Error("Expected an array.");
  }
  expect(value.every((item) => typeof item === "string")).toBe(true);
}

function expectStringArrayContaining(value: unknown, expected: string[]): void {
  expectStringArray(value);
  if (!Array.isArray(value)) {
    throw new Error("Expected an array.");
  }
  expect(value).toEqual(expect.arrayContaining(expected));
}
