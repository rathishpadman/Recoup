import { describe, expect, it } from "vitest";
import type { SapSourceEvidence, SyntheticSourceEvidence } from "../../src/adapters/supabaseSyntheticSource.js";
import {
  buildSupabaseServiceSapEvidenceSource,
  buildSupabaseServiceSyntheticEvidenceSource,
  type ServiceSyntheticEvidenceConnectorName
} from "../../src/services/serviceLayer.js";
import type { DeductionLine, SyntheticDatasetCore } from "../../src/types/entities.js";
import { money } from "../../src/types/money.js";

describe("service-layer Supabase evidence source builders", () => {
  it("bounds synthetic evidence reads to one deduction line while preserving per-line connector parallelism", async () => {
    const settlementRun = buildSettlementRun(2);
    const connectorNames = ["docs-repo", "tpm", "bureau"] as const;
    let activeReads = 0;
    let maxActiveReads = 0;

    const source = await buildSupabaseServiceSyntheticEvidenceSource({
      connectorNames,
      reader: {
        async readEvidence(connectorName, line) {
          const serviceConnectorName = readServiceSyntheticConnectorName(connectorName);
          activeReads += 1;
          maxActiveReads = Math.max(maxActiveReads, activeReads);
          await Promise.resolve();
          activeReads -= 1;

          return buildSyntheticEvidence(serviceConnectorName, line);
        }
      },
      settlementRun
    });

    expect(maxActiveReads).toBe(connectorNames.length);
    for (const line of settlementRun.deductionLines) {
      for (const connectorName of connectorNames) {
        expect(source.readEvidence(connectorName, line)).toEqual([expectedSyntheticDocument(connectorName, line)]);
      }
    }
  });

  it("uses a source-derived synthetic batch reader when available", async () => {
    const settlementRun = buildSettlementRun(3);
    const connectorNames = ["docs-repo", "tpm", "bureau"] as const;
    const batchCalls: string[] = [];

    const source = await buildSupabaseServiceSyntheticEvidenceSource({
      connectorNames,
      reader: {
        readEvidence() {
          return Promise.reject(new Error("Per-line synthetic reads should not run when a batch reader is available."));
        },
        readEvidenceBatch(connectorName, lines) {
          const serviceConnectorName = readServiceSyntheticConnectorName(connectorName);
          batchCalls.push(`${serviceConnectorName}:${lines.map((line) => line.lineId).join(",")}`);

          return Promise.resolve(new Map(
            lines.map((line) => [line.lineId, buildSyntheticEvidence(serviceConnectorName, line)])
          ));
        }
      },
      settlementRun
    });

    expect(batchCalls).toEqual([
      "docs-repo:S1-L1,S2-L1,S3-L1",
      "tpm:S1-L1,S2-L1,S3-L1",
      "bureau:S1-L1,S2-L1,S3-L1"
    ]);
    for (const line of settlementRun.deductionLines) {
      for (const connectorName of connectorNames) {
        expect(source.readEvidence(connectorName, line)).toEqual([expectedSyntheticDocument(connectorName, line)]);
      }
    }
  });

  it("bounds SAP evidence reads to one active deduction line", async () => {
    const settlementRun = buildSettlementRun(3);
    let activeReads = 0;
    let maxActiveReads = 0;

    const source = await buildSupabaseServiceSapEvidenceSource({
      reader: {
        async readEvidence(line) {
          activeReads += 1;
          maxActiveReads = Math.max(maxActiveReads, activeReads);
          await Promise.resolve();
          activeReads -= 1;

          return buildSapEvidence(line);
        }
      },
      settlementRun
    });

    expect(maxActiveReads).toBe(1);
    for (const line of settlementRun.deductionLines) {
      expect(source.readEvidence(line)).toEqual([expectedSapDocument(line)]);
    }
  });

  it("uses a source-derived SAP batch reader when available", async () => {
    const settlementRun = buildSettlementRun(3);
    const batchCalls: string[] = [];

    const source = await buildSupabaseServiceSapEvidenceSource({
      reader: {
        readEvidence() {
          return Promise.reject(new Error("Per-line SAP reads should not run when a batch reader is available."));
        },
        readEvidenceBatch(lines) {
          batchCalls.push(lines.map((line) => line.lineId).join(","));

          return Promise.resolve(new Map(lines.map((line) => [line.lineId, buildSapEvidence(line)])));
        }
      },
      settlementRun
    });

    expect(batchCalls).toEqual(["S1-L1,S2-L1,S3-L1"]);
    for (const line of settlementRun.deductionLines) {
      expect(source.readEvidence(line)).toEqual([expectedSapDocument(line)]);
    }
  });
});

function buildSettlementRun(lineCount: 2 | 3): SyntheticDatasetCore {
  const deductionLines = Array.from({ length: lineCount }, (_, index) => buildLine(index + 1));

  return {
    customers: [
      {
        customerId: "CUST-SUPABASE-EVIDENCE",
        name: "Supabase Evidence Customer",
        profile: "Test customer"
      }
    ],
    deductionLines,
    seed: 42
  };
}

function buildLine(index: number): DeductionLine {
  return {
    amount: money(`${String(index)}00.00`),
    customerId: "CUST-SUPABASE-EVIDENCE",
    eventId: String(index).repeat(64),
    lineId: `S${String(index)}-L1`,
    period: "2026-06",
    recordIds: [`S${String(index)}-L1`, `INV-S${String(index)}-1`, `PROOF-S${String(index)}-1`],
    routing: "recovery",
    ruleId: "service-layer-supabase-evidence",
    scenarioId: `S${String(index)}` as DeductionLine["scenarioId"],
    scenarioType: "service-layer Supabase evidence",
    verdict: "invalid"
  };
}

function buildSyntheticEvidence(
  connectorName: ServiceSyntheticEvidenceConnectorName,
  line: DeductionLine
): SyntheticSourceEvidence[] {
  const evidence: SyntheticSourceEvidence = {
    documentId: syntheticDocumentId(connectorName, line),
    documentType: syntheticDocumentType(connectorName),
    provenance: "synthetic",
    recordIds: [line.lineId, line.recordIds[1] ?? line.lineId],
    source: syntheticDocumentSource(connectorName),
    summary: `${connectorName} evidence for ${line.lineId}.`
  };

  return [evidence, { ...evidence, summary: `Duplicate ${connectorName} evidence for ${line.lineId}.` }];
}

function expectedSyntheticDocument(connectorName: ServiceSyntheticEvidenceConnectorName, line: DeductionLine) {
  return {
    documentId: syntheticDocumentId(connectorName, line),
    documentType: syntheticDocumentType(connectorName),
    recordIds: [line.lineId, line.recordIds[1] ?? line.lineId],
    source: syntheticDocumentSource(connectorName),
    summary: `${connectorName} evidence for ${line.lineId}.`
  };
}

function syntheticDocumentId(connectorName: ServiceSyntheticEvidenceConnectorName, line: DeductionLine): string {
  return `${connectorName}-${line.lineId}-proof`;
}

function syntheticDocumentSource(connectorName: ServiceSyntheticEvidenceConnectorName): SyntheticSourceEvidence["source"] {
  if (connectorName === "docs-repo") {
    return "docs";
  }
  if (connectorName === "tpm") {
    return "tpm";
  }

  return "bureau";
}

function syntheticDocumentType(connectorName: ServiceSyntheticEvidenceConnectorName): SyntheticSourceEvidence["documentType"] {
  if (connectorName === "docs-repo") {
    return "contract";
  }
  if (connectorName === "tpm") {
    return "trade-promo";
  }

  return "bureau-signal";
}

function readServiceSyntheticConnectorName(connectorName: string): ServiceSyntheticEvidenceConnectorName {
  if (connectorName === "docs-repo" || connectorName === "tpm" || connectorName === "bureau") {
    return connectorName;
  }

  throw new Error(`Unexpected service-layer synthetic evidence connector: ${connectorName}`);
}

function buildSapEvidence(line: DeductionLine): SapSourceEvidence[] {
  const evidence: SapSourceEvidence = {
    documentId: sapDocumentId(line),
    documentType: "invoice",
    provenance: "sap-odata",
    recordIds: [line.lineId, line.recordIds[1] ?? line.lineId],
    source: "sap",
    summary: `SAP invoice evidence for ${line.lineId}.`
  };

  return [evidence, { ...evidence, summary: `Duplicate SAP invoice evidence for ${line.lineId}.` }];
}

function expectedSapDocument(line: DeductionLine) {
  return {
    documentId: sapDocumentId(line),
    documentType: "invoice",
    recordIds: [line.lineId, line.recordIds[1] ?? line.lineId],
    source: "sap",
    summary: `SAP invoice evidence for ${line.lineId}.`
  };
}

function sapDocumentId(line: DeductionLine): string {
  return `SAP-${line.lineId}-invoice`;
}
