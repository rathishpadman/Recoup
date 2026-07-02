import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset, type RealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { assertRealEvidenceReadiness, buildRealEvidenceReadinessReport } from "../../src/services/evidenceReadiness.js";

describe("real evidence materializer", () => {
  it("creates the minimum canonical evidence set for all 20 deduction line items", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });

    expect(dataset.claims).toHaveLength(20);
    expect(dataset.documents).toHaveLength(114);

    const crossSurface = ["bureau_alert", "payment_history"];
    const expectedByLine: Array<[string, string[]]> = [
      ["S1-L1", ["sap_invoice", "remittance_advice", "carrier_damage_report", "carrier_photo", ...crossSurface]],
      ["S2-L1", ["sap_invoice", "remittance_advice", "tpm_promo", "tpm_accrual", ...crossSurface]],
      ["S3-L1", ["sap_invoice", "remittance_advice", "pod", ...crossSurface]],
      ["S4-L1", ["sap_invoice", "remittance_advice", "contract_sla", "pod", ...crossSurface]],
      ["S5-L1", ["sap_invoice", "remittance_advice", "contract_sla", "pod", ...crossSurface]],
      ["S6-L1", ["sap_invoice", "remittance_advice", "customer_po", "contract_pricing", ...crossSurface]],
      ["S7-L1", ["sap_invoice", "remittance_advice", "tpm_promo", "tpm_accrual", ...crossSurface]],
      ["S8-L1", ["sap_invoice", "sap_credit_memo", "remittance_advice", ...crossSurface]]
    ];

    for (const [lineId, expectedTypes] of expectedByLine) {
      expect(documentTypesForLine(dataset, lineId)).toEqual(new Set(expectedTypes));
    }

    for (const claim of dataset.claims) {
      expect([...documentTypesForLine(dataset, claim.lineId)]).toEqual(
        expect.arrayContaining(["sap_invoice", "remittance_advice", "bureau_alert", "payment_history"])
      );
      expect(claim).not.toHaveProperty("scenarioId");
      expect(claim).not.toHaveProperty("scenario_id");
    }

    expect(dataset.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: "sap_invoice",
          evidenceId: "EVD-SAP-INVOICE-S3-L1",
          provenance: "source_generated",
          sourceSystem: "sap_odata",
          storageUri: "supabase://recoup_evidence_documents/EVD-SAP-INVOICE-S3-L1"
        }),
        expect.objectContaining({
          documentType: "remittance_advice",
          evidenceId: "EVD-REMIT-S3-L1",
          provenance: "source_generated",
          sourceSystem: "remittance",
          storageUri: "supabase://recoup_evidence_documents/EVD-REMIT-S3-L1"
        }),
        expect.objectContaining({
          documentType: "pod",
          evidenceId: "EVD-POD-S3-L1",
          provenance: "source_generated",
          sourceSystem: "three_pl",
          storageUri: "supabase://recoup_evidence_documents/EVD-POD-S3-L1"
        })
      ])
    );
  });

  it("fails closed when real evidence readiness counts or required IDs drift", () => {
    expect(buildRealEvidenceReadinessReport("2026-06-18T00:00:00.000Z")).toEqual({
      claims: 20,
      documents: 114,
      frontendMediaProof: "not_checked",
      missingEvidenceIds: [],
      proofScope: "local_materialized_dataset",
      requiredEvidenceIdsPresent: true,
      supabasePersistence: "not_checked"
    });

    expect(() => {
      assertRealEvidenceReadiness({
        claims: 20,
        documents: 113,
        frontendMediaProof: "not_checked",
        missingEvidenceIds: ["EVD-POD-S3-L1"],
        proofScope: "local_materialized_dataset",
        requiredEvidenceIdsPresent: false,
        supabasePersistence: "not_checked"
      });
    }).toThrow("Real evidence readiness failed");
  });

  it("does not let production target verification pass with local-only materializer proof", () => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npmCommand, ["run", "verify:real-evidence", "--", "--target=production"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "definitely-wrong-production-project-ref"
      },
      shell: process.platform === "win32",
      timeout: 15_000
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain('"target":"production"');
    expect(output).not.toContain("local_materialized_dataset");
  }, 20_000);
});

function documentTypesForLine(dataset: RealEvidenceDataset, lineId: string): Set<string> {
  const evidenceIds = new Set(
    dataset.links
      .filter((link) => link.recordRole === "deduction_line" && link.recordId === lineId)
      .map((link) => link.evidenceId)
  );

  return new Set(
    dataset.documents.filter((document) => evidenceIds.has(document.evidenceId)).map((document) => document.documentType)
  );
}
