import { describe, expect, it } from "vitest";
import {
  day1BootstrapSeedApprovedBy,
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("I-21 arbitration auditability", () => {
  it("audits Risk Mesh positions, supplied Day-1 weights, and owner-supplied ranked resolution", () => {
    const run = runRiskMeshClosedLoop({ governedConfig, source });
    const arbitrationEntry = run.auditEntries.find((entry) => entry.entryType === "arbitration.ranked");

    expect(arbitrationEntry).toBeDefined();
    expect(arbitrationEntry?.payload).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      resolution: "partial_release_55",
      status: "ranked",
      weightsUsed: {
        billing: 0.15,
        collections: 0.2,
        credit: 0.35,
        fulfillment: 0.3
      }
    });
    expect(arbitrationEntry?.payload).toMatchObject({ weightsUsed: governedConfig.arbitrationWeights });
    const rankedOptions = arbitrationEntry?.payload["rankedOptions"];
    if (!Array.isArray(rankedOptions)) {
      throw new Error("Ranked arbitration audit payload must include ranked options.");
    }
    expect(rankedOptions).toContainEqual(
      expect.objectContaining({
        optionId: "partial_release_55",
        weightedValue: "0.7575"
      })
    );
    expect(arbitrationEntry?.recordIds).toContain("6534");
    expect(run.auditTrailValid).toBe(true);
  });

  it("audits ranked Risk Mesh options, supplied Day-1 weights, and ranked resolution", () => {
    const runtimeGovernedConfig = parseActiveGovernedConfigRows(
      buildSupabaseGovernedConfigRows({
        harbor: {
          ...governedConfig.riskMeshCases.harbor,
          arbitrationPositions: [
            {
              functionName: "credit",
              optionId: "partial-hold",
              optionValue: "100.00",
              position: "Owner-supplied credit value for controlled release.",
              recordIds: ["CUST-HARBOR", "6534", "DB-RANKED-CREDIT"]
            },
            {
              functionName: "fulfillment",
              optionId: "ship-now",
              optionValue: "80.00",
              position: "Owner-supplied fulfillment value for immediate shipment.",
              recordIds: ["6534", "DB-RANKED-FULFILLMENT"]
            },
            {
              functionName: "billing",
              optionId: "revised-terms",
              optionValue: "120.00",
              position: "Owner-supplied billing value for revised terms.",
              recordIds: ["CUST-HARBOR", "DB-RANKED-BILLING"]
            },
            {
              functionName: "collections",
              optionId: "sentinel-checkpoint",
              optionValue: "70.00",
              position: "Owner-supplied collections value for checkpoint handling.",
              recordIds: ["CUST-HARBOR", "DB-RANKED-COLLECTIONS"]
            }
          ]
        }
      })
    ).values;

    const run = runRiskMeshClosedLoop({ governedConfig: runtimeGovernedConfig, source });
    const arbitrationEntry = run.auditEntries.find((entry) => entry.entryType === "arbitration.ranked");

    expect(arbitrationEntry).toBeDefined();
    expect(arbitrationEntry?.payload).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      resolution: "partial-hold",
      status: "ranked",
      weightsUsed: runtimeGovernedConfig.arbitrationWeights
    });
    const rankedOptions = arbitrationEntry?.payload["rankedOptions"];
    if (!Array.isArray(rankedOptions)) {
      throw new Error("Ranked arbitration audit payload must include ranked options.");
    }
    expect(rankedOptions).toContainEqual(
      expect.objectContaining({
        optionId: "partial-hold",
        recordIds: ["CUST-HARBOR", "6534", "DB-RANKED-CREDIT"],
        weightedValue: "35.0000"
      })
    );
    expect(arbitrationEntry?.recordIds).toEqual(
      expect.arrayContaining(["DB-RANKED-CREDIT", "DB-RANKED-FULFILLMENT", "DB-RANKED-BILLING", "DB-RANKED-COLLECTIONS"])
    );
    expect(run.auditTrailValid).toBe(true);
  });
});

function buildSupabaseGovernedConfigRows(riskMeshCases: Record<string, unknown>): unknown[] {
  const rows = governedConfigSeedRows.filter((row) => row.key !== "risk_mesh_cases");
  return [
    ...rows.map((row) => ({
      active: row.active,
      approved_by: row.approvedBy,
      config_hash: row.configHash,
      config_version: row.configVersion,
      effective_from: row.effectiveFrom,
      key: row.key,
      value_json: row.valueJson
    })),
    buildSupabaseConfigRow("risk_mesh_cases", riskMeshCases)
  ];
}

function buildSupabaseConfigRow(key: string, valueJson: Record<string, unknown>): unknown {
  return {
    active: true,
    approved_by: day1BootstrapSeedApprovedBy,
    config_hash: sha256CanonicalJson(valueJson),
    config_version: 1,
    effective_from: "2026-06-20T00:00:00.000Z",
    key,
    value_json: valueJson
  };
}
