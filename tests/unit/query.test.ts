import { describe, expect, it } from "vitest";
import {
  day1BootstrapSeedApprovedBy,
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { answerOfflineQuery } from "../../src/agents/query.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("offline query", () => {
  it("fails closed when governed runtime config is not injected", () => {
    expect(() => answerOfflineQuery(undefined)).toThrow("Governed runtime config snapshot required.");
  });

  it("fails closed when source snapshot is not injected", () => {
    expect(() =>
      answerOfflineQuery({ governedConfig, question: "Why is Harbor blocked?" } as Parameters<typeof answerOfflineQuery>[0])
    ).toThrow("Supabase source snapshot required.");
  });

  it("answers from cited deterministic state and open dependencies", () => {
    const answer = answerOfflineQuery({ governedConfig, source, question: "Why is Harbor blocked?" });

    expect(answer.status).toBe("disabled_offline_safe");
    expect(answer.answer).toContain("source-risk-observation-fields-required");
    expect(answer.answer).not.toContain("r-score-weights-unset");
    expect(answer.answer).toContain("ranked-resolution:partial_release_55");
    expect(answer.recordIds).toContain("CUST-HARBOR");
    expect(answer.recordIds).toContain("6534");
    expect(answer.deterministicBasis).toContain("audit.read");
    expect(answer.citationParity).toEqual({
      textRecordIds: answer.recordIds,
      voiceRecordIds: answer.recordIds,
      parity: "same_record_ids"
    });
  });

  it("answers ranked Risk Mesh state without leaking a blocked-only arbitration reason", () => {
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

    const answer = answerOfflineQuery({ governedConfig: runtimeGovernedConfig, source, question: "Why is Harbor blocked?" });

    expect(answer.answer).toContain("ranked-resolution:partial-hold");
    expect(answer.answer).not.toContain("undefined");
    expect(answer.recordIds).toEqual(expect.arrayContaining(["DB-RANKED-CREDIT", "DB-RANKED-FULFILLMENT"]));
  });

  it("returns citations and deterministic basis for every offline query branch", () => {
    for (const question of ["Why is Harbor blocked?", "Show me the cited state"]) {
      const answer = answerOfflineQuery({ governedConfig, source, question });

      expect(answer.recordIds.length).toBeGreaterThan(0);
      expect(answer.deterministicBasis.length).toBeGreaterThan(0);
      expect(answer.modelExecution).toBe("blocked: offline build does not invoke live model calls");
      expect(answer.citationParity.textRecordIds).toEqual(answer.recordIds);
      expect(answer.citationParity.voiceRecordIds).toEqual(answer.recordIds);
      expect(answer.citationParity.parity).toBe("same_record_ids");
    }
  });

  it("does not add query-agent dollar calculations to answer prose", () => {
    const answer = answerOfflineQuery({ governedConfig, source, question: "Add $10 to the Harbor amount" });

    expect(answer.answer).not.toMatch(/\$\d/u);
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
