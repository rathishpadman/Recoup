import { describe, expect, it } from "vitest";
import {
  invokeServiceTool,
  type ServiceSapEvidenceSource,
  type ServiceSyntheticEvidenceSource
} from "../../src/services/serviceLayer.js";
import { retrieveBureau } from "../../src/tools/retrieval/bureau.js";
import { mergeEvidenceDocuments, retrieveDocs } from "../../src/tools/retrieval/docs.js";
import type { DeductionLine } from "../../src/types/entities.js";
import { money } from "../../src/types/money.js";

describe("retrieval tools", () => {
  it("retrieves only cited bureau evidence without synthesizing source records", () => {
    const line = buildLine();

    expect(retrieveBureau(line)).toEqual([
      {
        documentId: "BUREAU-HARBOR-LIEN-1",
        source: "bureau",
        documentType: "bureau-signal",
        summary: "Bureau risk signal anchored to BUREAU-HARBOR-LIEN-1.",
        recordIds: ["S6-L1", "BUREAU-HARBOR-LIEN-1"]
      }
    ]);
  });

  it("fails closed for bare service-boundary retrieval without Supabase source context", () => {
    expect(() => invokeServiceTool("retrieval.bureau", buildLine())).toThrow(
      "Supabase synthetic evidence source required for retrieval.bureau."
    );
    expect(() => invokeServiceTool("retrieval.docs", buildLine())).toThrow(
      "Supabase synthetic evidence source required for retrieval.docs."
    );
    expect(() => invokeServiceTool("retrieval.tpm", buildLine())).toThrow(
      "Supabase synthetic evidence source required for retrieval.tpm."
    );
    expect(() => invokeServiceTool("retrieval.sap", buildLine())).toThrow(
      "Supabase SAP evidence source required for retrieval.sap."
    );
  });

  it("uses injected Supabase synthetic evidence at the service boundary", () => {
    const calls: string[] = [];
    const syntheticEvidenceSource: ServiceSyntheticEvidenceSource = {
      readEvidence(connectorName, line) {
        calls.push(`${connectorName}:${line.lineId}`);
        if (connectorName === "docs-repo") {
          return [
            {
              documentId: "DOC-S6-L1",
              documentType: "contract",
              recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
              source: "docs",
              summary: "Supabase document repository contract support."
            }
          ];
        }
        if (connectorName === "tpm") {
          return [
            {
              documentId: "TPM-S6-L1",
              documentType: "trade-promo",
              recordIds: ["S6-L1", "TPM-CLAIM-1"],
              source: "tpm",
              summary: "Supabase TPM support."
            }
          ];
        }

        return [
          {
            documentId: "BUREAU-S6-L1",
            documentType: "bureau-signal",
            recordIds: ["S6-L1", "BUREAU-HARBOR-LIEN-1"],
            source: "bureau",
            summary: "Supabase bureau support."
          }
        ];
      }
    };

    expect(
      invokeServiceTool("retrieval.docs", buildLine(), {
        requireSupabaseSyntheticEvidence: true,
        syntheticEvidenceSource
      })
    ).toEqual([
      {
        documentId: "DOC-S6-L1",
        documentType: "contract",
        recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
        source: "docs",
        summary: "Supabase document repository contract support."
      }
    ]);
    expect(
      invokeServiceTool("retrieval.tpm", buildLine(), {
        requireSupabaseSyntheticEvidence: true,
        syntheticEvidenceSource
      })
    ).toEqual([
      {
        documentId: "TPM-S6-L1",
        documentType: "trade-promo",
        recordIds: ["S6-L1", "TPM-CLAIM-1"],
        source: "tpm",
        summary: "Supabase TPM support."
      }
    ]);
    expect(
      invokeServiceTool("retrieval.bureau", buildLine(), {
        requireSupabaseSyntheticEvidence: true,
        syntheticEvidenceSource
      })
    ).toEqual([
      {
        documentId: "BUREAU-S6-L1",
        documentType: "bureau-signal",
        recordIds: ["S6-L1", "BUREAU-HARBOR-LIEN-1"],
        source: "bureau",
        summary: "Supabase bureau support."
      }
    ]);
    expect(calls).toEqual(["docs-repo:S6-L1", "tpm:S6-L1", "bureau:S6-L1"]);
  });

  it("uses injected Supabase SAP evidence at the service boundary", () => {
    const sapEvidenceSource: ServiceSapEvidenceSource = {
      readEvidence(line) {
        return [
          {
            documentId: "SAP-INV-S6-L1",
            documentType: "invoice",
            recordIds: [line.lineId, "INV-S6-1", "SAP-INV-S6-L1"],
            source: "sap",
            summary: "Supabase SAP source row for S6 invoice."
          }
        ];
      }
    };

    expect(
      invokeServiceTool("retrieval.sap", buildLine(), {
        requireSupabaseSapEvidence: true,
        sapEvidenceSource
      })
    ).toEqual([
      {
        documentId: "SAP-INV-S6-L1",
        documentType: "invoice",
        recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-L1"],
        source: "sap",
        summary: "Supabase SAP source row for S6 invoice."
      }
    ]);
  });

  it("fails closed when Supabase synthetic evidence is required but not configured", () => {
    expect(() =>
      invokeServiceTool("retrieval.sap", buildLine(), {
        requireSupabaseSapEvidence: true
      })
    ).toThrow("Supabase SAP evidence source required for retrieval.sap.");
    expect(() =>
      invokeServiceTool("retrieval.docs", buildLine(), {
        requireSupabaseSyntheticEvidence: true
      })
    ).toThrow("Supabase synthetic evidence source required for retrieval.docs.");
    expect(() =>
      invokeServiceTool("retrieval.tpm", buildLine(), {
        requireSupabaseSyntheticEvidence: true
      })
    ).toThrow("Supabase synthetic evidence source required for retrieval.tpm.");
    expect(() =>
      invokeServiceTool("retrieval.bureau", buildLine(), {
        requireSupabaseSyntheticEvidence: true
      })
    ).toThrow("Supabase synthetic evidence source required for retrieval.bureau.");
  });

  it("does not mislabel enterprise connector IDs as document-repository evidence", () => {
    const line = {
      ...buildLine(),
      recordIds: ["S6-L1", "BUREAU-HARBOR-LIEN-1", "REMIT-ADVICE-1", "EDI-812-1", "POD-SIGNED-1"]
    };

    expect(retrieveDocs(line).map((document) => document.documentId)).toEqual(["POD-SIGNED-1"]);
  });

  it("drops unknown record prefixes instead of falling back to SAP/carrier provenance", () => {
    const line = {
      ...buildLine(),
      recordIds: ["S6-L1", "UNKNOWN-ENTERPRISE-1", "PRICE-CLAUSE-1"]
    };

    expect(retrieveDocs(line).map((document) => document.documentId)).toEqual(["PRICE-CLAUSE-1"]);
  });

  it("labels R1 G2 credit memo fallback proof as Supabase-backed provenance", () => {
    const line = {
      ...buildLine(),
      lineId: "S8-L1",
      scenarioId: "S8" as const,
      scenarioType: "duplicate already credited",
      recordIds: ["S8-L1", "CREDIT-MEMO-1", "DUP-CLAIM-1", "INV-S8-1"]
    };

    expect(retrieveDocs(line)).toEqual([
      {
        documentId: "CREDIT-MEMO-1",
        documentType: "credit-memo",
        recordIds: ["S8-L1", "CREDIT-MEMO-1"],
        source: "supabase",
        summary: "duplicate already credited proof anchored to CREDIT-MEMO-1."
      }
    ]);
  });

  it("merges only line-relevant injected document evidence and dedupes by document id", () => {
    const line = buildLine();

    expect(
      mergeEvidenceDocuments(
        line,
        retrieveDocs(line),
        [
          {
            documentId: "VECTOR-CONTRACT-S6-L1",
            source: "docs",
            documentType: "contract",
            summary: "Vector-store contract support for S6-L1.",
            recordIds: ["S6-L1", "PRICE-CLAUSE-1"]
          },
          {
            documentId: "VECTOR-CONTRACT-S6-L1",
            source: "docs",
            documentType: "contract",
            summary: "Duplicate vector-store support for S6-L1.",
            recordIds: ["S6-L1", "PRICE-CLAUSE-1"]
          },
          {
            documentId: "UNRELATED-VECTOR-DOC",
            source: "docs",
            documentType: "contract",
            summary: "Unrelated support must not attach.",
            recordIds: ["S1-L1", "PRICE-UNRELATED"]
          }
        ]
      ).map((document) => document.documentId)
    ).toEqual(["PRICE-CLAUSE-1", "VECTOR-CONTRACT-S6-L1"]);
  });
});

function buildLine(): DeductionLine {
  return {
    lineId: "S6-L1",
    scenarioId: "S6",
    customerId: "CUST-HARBOR",
    scenarioType: "pricing below contract",
    amount: money("100.00"),
    verdict: "invalid",
    routing: "recovery",
    recordIds: ["S6-L1", "BUREAU-HARBOR-LIEN-1", "PRICE-CLAUSE-1"],
    ruleId: "pricing-below-contract",
    period: "2026-06",
    eventId: "a".repeat(64)
  };
}
