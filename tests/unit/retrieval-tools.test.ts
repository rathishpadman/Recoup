import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import {
  buildOpenAiVectorStoreEvidenceSource,
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

  it("merges optional vector evidence behind retrieval.docs without changing disabled structured retrieval", async () => {
    const line = buildLine();
    const structuredDocs = [
      {
        documentId: "DOC-S6-L1",
        documentType: "contract" as const,
        recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
        source: "docs" as const,
        summary: "Supabase document repository contract support."
      }
    ];
    const syntheticEvidenceSource: ServiceSyntheticEvidenceSource = {
      readEvidence(connectorName) {
        return connectorName === "docs-repo" ? structuredDocs : [];
      }
    };
    const vectorStoreEvidenceSource = await buildOpenAiVectorStoreEvidenceSource({
      reader: {
        searchEvidence(searchLine) {
          expect(searchLine.lineId).toBe(line.lineId);
          return Promise.resolve([
            {
              documentId: "VECTOR-EVIDENCE-S6-L1",
              documentType: "contract",
              fileName: "pricing-clause.pdf",
              provenance: "openai-vector-store",
              recordIds: [line.lineId, "PRICE-CLAUSE-1"],
              score: 0.92,
              source: "docs",
              summary: "Vector recall found the pricing clause passage."
            },
            {
              documentId: "VECTOR-EVIDENCE-S6-L1-CORRESPONDENCE",
              documentType: "correspondence",
              fileName: "buyer-email.eml",
              provenance: "openai-vector-store",
              recordIds: [line.lineId, "PRICE-CLAUSE-1"],
              score: 0.74,
              source: "docs",
              summary: "Vector recall found a generic correspondence passage."
            }
          ]);
        }
      },
      settlementRun: { customers: [], deductionLines: [line], seed: 42 },
    });

    expect(
      invokeServiceTool("retrieval.docs", line, {
        requireSupabaseSyntheticEvidence: true,
        syntheticEvidenceSource
      })
    ).toEqual(structuredDocs);
    expect(
      invokeServiceTool("retrieval.docs", line, {
        requireSupabaseSyntheticEvidence: true,
        syntheticEvidenceSource,
        vectorStoreEvidenceSource
      })
    ).toEqual([
      ...structuredDocs,
      {
        documentId: "VECTOR-EVIDENCE-S6-L1",
        documentType: "contract",
        recordIds: ["S6-L1", "VECTOR-EVIDENCE-S6-L1", "PRICE-CLAUSE-1"],
        retrieval: {
          fileName: "pricing-clause.pdf",
          mode: "semantic-vector",
          provenance: "openai-vector-store",
          score: 0.92
        },
        source: "docs",
        summary: "Vector recall found the pricing clause passage."
      }
    ]);
  });

  it("hydrates OpenAI vector evidence concurrently across source-backed deduction lines", async () => {
    const lines = ["S6-L1", "S6-L2", "S6-L3"].map((lineId) => ({
      ...buildLine(),
      lineId,
      recordIds: [lineId, `PRICE-CLAUSE-${lineId}`]
    }));
    let activeSearches = 0;
    let maxActiveSearches = 0;

    const vectorStoreEvidenceSource = await buildOpenAiVectorStoreEvidenceSource({
      reader: {
        async searchEvidence(line) {
          activeSearches += 1;
          maxActiveSearches = Math.max(maxActiveSearches, activeSearches);
          await Promise.resolve();
          activeSearches -= 1;

          return [
            {
              documentId: `VECTOR-EVIDENCE-${line.lineId}`,
              documentType: "contract",
              fileName: `${line.lineId}.pdf`,
              provenance: "openai-vector-store",
              recordIds: [line.lineId, line.recordIds[1] ?? line.lineId],
              score: 0.91,
              source: "docs",
              summary: `Vector recall for ${line.lineId}.`
            }
          ];
        }
      },
      settlementRun: { customers: [], deductionLines: lines, seed: 42 },
    });

    expect(maxActiveSearches).toBe(lines.length);
    for (const line of lines) {
      expect(vectorStoreEvidenceSource.readEvidence(line)).toEqual([
        {
          documentId: `VECTOR-EVIDENCE-${line.lineId}`,
          documentType: "contract",
          recordIds: [line.lineId, line.recordIds[1]],
          retrieval: {
            fileName: `${line.lineId}.pdf`,
            mode: "semantic-vector",
            provenance: "openai-vector-store",
            score: 0.91
          },
          source: "docs",
          summary: `Vector recall for ${line.lineId}.`
        }
      ]);
    }
  });

  it("degrades retrieval.docs to structured evidence when optional vector prefetch fails", async () => {
    const line = buildLine();
    const structuredDocs = [
      {
        documentId: "DOC-S6-L1",
        documentType: "contract" as const,
        recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
        source: "docs" as const,
        summary: "Supabase document repository contract support."
      }
    ];
    const syntheticEvidenceSource: ServiceSyntheticEvidenceSource = {
      readEvidence(connectorName) {
        return connectorName === "docs-repo" ? structuredDocs : [];
      }
    };
    const vectorStoreEvidenceSource = await buildOpenAiVectorStoreEvidenceSource({
      reader: {
        searchEvidence() {
          return Promise.reject(new Error("Vector store unavailable."));
        }
      },
      settlementRun: { customers: [], deductionLines: [line], seed: 42 },
    });

    expect(
      invokeServiceTool("retrieval.docs", line, {
        requireSupabaseSyntheticEvidence: true,
        syntheticEvidenceSource,
        vectorStoreEvidenceSource
      })
    ).toEqual(structuredDocs);
  });

  it("drops provider-shaped evidence ids at the service boundary", async () => {
    const line = buildLine();
    const vectorStoreEvidenceSource = await buildOpenAiVectorStoreEvidenceSource({
      reader: {
        searchEvidence() {
          return Promise.resolve([
            {
              documentId: "file-provider-id",
              documentType: "contract",
              fileName: "pricing-clause.pdf",
              provenance: "openai-vector-store",
              recordIds: [line.lineId, "PRICE-CLAUSE-1"],
              score: 0.91,
              source: "docs",
              summary: "A provider-shaped identifier must not enter service evidence."
            },
            {
              documentId: "VECTOR-EVIDENCE-S6-L1",
              documentType: "contract",
              fileName: "pricing-clause.pdf",
              provenance: "openai-vector-store",
              recordIds: [line.lineId, "file-provider-citation"],
              score: 0.9,
              source: "docs",
              summary: "A provider-shaped citation must not enter service evidence."
            }
          ]);
        }
      },
      settlementRun: { customers: [], deductionLines: [line], seed: 42 }
    });

    expect(vectorStoreEvidenceSource.readEvidence(line)).toEqual([]);
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

  it("fails closed when query.answer requires SAP evidence but the source is missing or empty", () => {
    const queryInput = {
      question: "Why is this recoverable?",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    };
    const source = new SyntheticSource({ seed: 42 });

    expect(() =>
      invokeServiceTool("query.answer", queryInput, {
        governedConfig: day1GovernedConfigSeed.values,
        requireSupabaseSapEvidence: true,
        source
      })
    ).toThrow("Supabase SAP evidence source required for query.answer.");

    expect(() =>
      invokeServiceTool("query.answer", queryInput, {
        governedConfig: day1GovernedConfigSeed.values,
        requireSupabaseSapEvidence: true,
        sapEvidenceSource: {
          readEvidence() {
            return [];
          }
        },
        source
      })
    ).toThrow("Supabase SAP evidence rows required for query.answer.");
  });

  it("allows query.answer to use selected non-SAP source evidence when SAP rows are unavailable", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Which selected contract document supports recovery?",
      recordIds: ["S6-L1", "DOC-SELECTED-1"],
      selectedLineId: "S6-L1"
    };
    const syntheticEvidenceSource: ServiceSyntheticEvidenceSource = {
      readEvidence(connectorName, line) {
        if (connectorName !== "docs-repo") {
          return [];
        }
        return [
          {
            documentId: "DOC-S6-L1",
            documentType: "contract",
            recordIds: [line.lineId, "DOC-SELECTED-1"],
            source: "docs",
            summary: "Supabase contract source evidence for the selected line."
          }
        ];
      }
    };

    const result = invokeServiceTool("query.answer", queryInput, {
      governedConfig: day1GovernedConfigSeed.values,
      requireSupabaseSapEvidence: true,
      requireSupabaseSyntheticEvidence: true,
      sapEvidenceSource: {
        readEvidence() {
          return [];
        }
      },
      source,
      syntheticEvidenceSource
    }) as {
      sourceReads?: {
        sapEvidence?: unknown[];
        selectedEvidence?: Array<{ documentId?: string; recordIds?: string[]; source?: string }>;
        sourceFreshness?: string;
        transportLayer?: string;
      };
    };

    expect(result.sourceReads).toMatchObject({
      sapEvidence: [],
      selectedEvidence: [
        {
          documentId: "DOC-S6-L1",
          recordIds: ["S6-L1", "DOC-SELECTED-1"],
          source: "docs"
        }
      ],
      sourceFreshness: "snapshot",
      transportLayer: "supabase_canonical_snapshot"
    });
  });

  it("labels query.answer SAP evidence as primary SAP OData via the governed snapshot transport", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Why is this recoverable?",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    };
    const sapEvidenceSource: ServiceSapEvidenceSource = {
      readEvidence(line) {
        return [
          {
            documentId: "SAP-INV-S6-L1",
            documentType: "contract",
            recordIds: [line.lineId, "INV-S6-1", "SAP-INV-S6-1"],
            source: "sap",
            summary: "Supabase SAP source row for S6 invoice."
          }
        ];
      }
    };

    const result = invokeServiceTool("query.answer", queryInput, {
      governedConfig: day1GovernedConfigSeed.values,
      requireSupabaseSapEvidence: true,
      sapEvidenceSource,
      source
    });

    expect(result).toMatchObject({
      sourceReadStatus: "source_backed_selected_scope",
      sourceReads: {
        canonicalModel: "EvidenceDocument",
        primarySourceLabel: "SAP OData",
        primarySourceSystem: "sap_odata",
        selectedLineId: "S6-L1",
        selectedRecordIds: queryInput.recordIds,
        sourceFreshness: "snapshot",
        transportLabel: "Governed canonical snapshot",
        transportLayer: "supabase_canonical_snapshot"
      }
    });
    expect(result).toMatchObject({
      sourceReads: {
        sapEvidence: [
          {
            documentId: "SAP-INV-S6-L1",
            recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
            source: "sap"
          }
        ]
      }
    });
  });

  it("returns a cited source-backed selected answer instead of the legacy offline demo fallback", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Why is this recoverable?",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    };
    const result = invokeServiceTool("query.answer", queryInput, {
      governedConfig: day1GovernedConfigSeed.values,
      source,
      syntheticEvidenceSource: buildSelectedContractEvidenceSource()
    }) as Record<string, unknown>;

    expect(result).toMatchObject({
      citationParity: {
        parity: "same_record_ids",
        textRecordIds: queryInput.recordIds,
        voiceRecordIds: queryInput.recordIds
      },
      recordIds: queryInput.recordIds,
      sourceReadStatus: "source_backed_selected_scope",
      status: "source_backed_selected_scope"
    });
    expect(result.answer).toEqual(expect.stringContaining("Line S6-L1"));
    expect(JSON.stringify(result)).not.toContain("offline demo");
    expect(result).not.toHaveProperty("modelExecution");
  });

  it("does not let out-of-scope SAP evidence determine a selected-evidence answer", () => {
    const source = new SyntheticSource({ seed: 42 });

    expect(() => invokeServiceTool("query.answer", {
      question: "Why is this recoverable?",
      recordIds: ["S6-L1", "INV-S6-1"],
      selectedLineId: "S6-L1"
    }, {
      governedConfig: day1GovernedConfigSeed.values,
      requireSupabaseSapEvidence: true,
      sapEvidenceSource: {
        readEvidence(line) {
          return [{
            documentId: "UNCITED-CONTRACT-S6-L1",
            documentType: "contract",
            recordIds: [line.lineId, "PRICE-CLAUSE-1"],
            source: "sap",
            summary: "Contract evidence outside the selected citation packet."
          }];
        }
      },
      source
    })).toThrow("Supabase SAP evidence rows required for query.answer.");
  });

  it("keeps the governed-config gate on selected-evidence query answers", () => {
    const source = new SyntheticSource({ seed: 42 });

    expect(() => invokeServiceTool("query.answer", {
      question: "Why is this recoverable?",
      recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    }, {
      source,
      syntheticEvidenceSource: buildSelectedContractEvidenceSource()
    })).toThrow("Governed runtime config snapshot required.");
  });

  it("uses canonical snapshot lineage when selected non-SAP evidence supports query.answer", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Why is this recoverable?",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    };

    const result = invokeServiceTool("query.answer", queryInput, {
      governedConfig: day1GovernedConfigSeed.values,
      source,
      syntheticEvidenceSource: buildSelectedContractEvidenceSource()
    }) as {
      sourceReads?: Record<string, unknown>;
    };

    expect(result.sourceReads).toMatchObject({
      canonicalModel: "EvidenceDocument",
      sapEvidence: [],
      selectedLineId: "S6-L1",
      selectedRecordIds: queryInput.recordIds
    });
    expect(result.sourceReads).not.toHaveProperty("primarySourceLabel");
    expect(result.sourceReads).not.toHaveProperty("primarySourceSystem");
    expect(result.sourceReads).toMatchObject({
      sourceFreshness: "snapshot",
      transportLabel: "Governed canonical snapshot",
      transportLayer: "supabase_canonical_snapshot"
    });
  });

  it("allows query.answer to read a selected subset inside the Maya query scope", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Which selected document supports recovery?",
      recordIds: ["S6-L1", "INV-S6-1"],
      selectedLineId: "S6-L1"
    };
    const sapEvidenceSource: ServiceSapEvidenceSource = {
      readEvidence() {
        return [
          {
            documentId: "SAP-INV-S6-1",
            documentType: "contract",
            recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
            source: "sap",
            summary: "Supabase SAP-linked contract terms associated with INV-S6-1."
          }
        ];
      }
    };

    const result = invokeServiceTool("query.answer", queryInput, {
      governedConfig: day1GovernedConfigSeed.values,
      queryAnswerScope: {
        recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
        selectedLineId: "S6-L1"
      },
      requireSupabaseSapEvidence: true,
      sapEvidenceSource,
      source
    }) as {
      sourceReads?: { selectedRecordIds?: string[] };
    };

    expect(result.sourceReads?.selectedRecordIds).toEqual(queryInput.recordIds);
  });

  it("fails closed when the selected Maya scope contains an unsupported stale record ID", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Which selected document supports recovery?",
      recordIds: ["S6-L1", "INV-S6-1", "STALE-UNSUPPORTED-ID"],
      selectedLineId: "S6-L1"
    };
    const sapEvidenceSource: ServiceSapEvidenceSource = {
      readEvidence() {
        return [
          {
            documentId: "SAP-INV-S6-1",
            documentType: "contract",
            recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
            source: "sap",
            summary: "Supabase SAP-linked contract terms associated with INV-S6-1."
          }
        ];
      }
    };

    expect(() =>
      invokeServiceTool("query.answer", queryInput, {
        governedConfig: day1GovernedConfigSeed.values,
        queryAnswerScope: {
          recordIds: queryInput.recordIds,
          selectedLineId: queryInput.selectedLineId
        },
        requireSupabaseSapEvidence: true,
        sapEvidenceSource,
        source
      })
    ).toThrow("query.answer recordIds are not fully supported by the selected evidence scope.");
  });

  it("blocks query.answer before source reads when input is outside the selected Maya scope", () => {
    const source = new SyntheticSource({ seed: 42 });
    const queryInput = {
      question: "Can I cite this other line?",
      recordIds: ["S6-L1", "INV-S6-1"],
      selectedLineId: "S6-L1"
    };
    const sapEvidenceSource = {
      readEvidence() {
        throw new Error("SAP evidence source must not be read for out-of-scope query.answer input.");
      }
    };

    expect(() =>
      invokeServiceTool("query.answer", queryInput, {
        governedConfig: day1GovernedConfigSeed.values,
        queryAnswerScope: {
          recordIds: ["S3-L1", "INV-S3-1"],
          selectedLineId: "S3-L1"
        },
        requireSupabaseSapEvidence: true,
        sapEvidenceSource,
        source
      })
    ).toThrow("query.answer input is outside the selected evidence scope.");
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

function buildSelectedContractEvidenceSource(): ServiceSyntheticEvidenceSource {
  return {
    readEvidence(connectorName, line) {
      if (connectorName !== "docs-repo") {
        return [];
      }

      return [
        {
          documentId: "DOC-S6-L1",
          documentType: "contract",
          recordIds: [line.lineId, "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          source: "docs",
          summary: "Supabase document repository contract support for the selected line."
        }
      ];
    }
  };
}

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
