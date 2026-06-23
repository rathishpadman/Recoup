import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import {
  createSupabaseRiskObservationSnapshotReader,
  type SupabaseRiskObservationSourceConfig
} from "../../src/adapters/supabaseSyntheticSource.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { assessHarborSentinel, assessSentinelFromSourceSnapshot } from "../../src/agents/sentinel.js";
import type { SourceRiskObservationSnapshot } from "../../src/adapters/source.js";

const sentinelConfig = {
  customerId: day1GovernedConfigSeed.values.riskMeshCases.harbor.customerId,
  rDriftTrigger: day1GovernedConfigSeed.values.rDriftTrigger,
  rScoreWeights: day1GovernedConfigSeed.values.rScoreWeights
};
const harborRiskObservationSource = day1GovernedConfigSeed.values.riskMeshCases.harbor.riskObservationSource;

function harborRiskCaseSource(
  input: Pick<SupabaseRiskObservationSourceConfig, "baselinePaymentRefs" | "currentPaymentRef" | "sourceCustomerId">
): SupabaseRiskObservationSourceConfig {
  return {
    ...input,
    criticalAlertSeverity: harborRiskObservationSource.criticalAlertSeverity,
    criticalAlertType: harborRiskObservationSource.criticalAlertType,
    citedDeductionVerdicts: [...harborRiskObservationSource.citedDeductionVerdicts]
  };
}

describe("Sentinel source normalization", () => {
  it("loads Harbor R-drift observations from Supabase Tools_data without inventing R-score components", async () => {
    const calls: string[] = [];
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url, init) => {
        calls.push(url);
        expect(init.headers).toMatchObject({
          apikey: "supabase-service-secret",
          authorization: "Bearer supabase-service-secret"
        });

        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", customer_name: "Harbor Foods" }
          ]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000060" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "INV-HARB-003" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]));
        }
        if (tableName === "bureau_alerts") {
          return Promise.resolve(jsonResponse([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              resolved: false,
              severity: "CRITICAL"
            }
          ]));
        }
        if (tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S7", invoice_ref: "90000005", verdict: "PARTIAL" },
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
          ]));
        }

        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036", "90000060", "INV-HARB-003"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    const snapshot = await reader.loadRiskObservationSnapshot("CUST-HARBOR");

    expect(snapshot).toMatchObject({
      customerId: "CUST-HARBOR",
      observedSignals: {
        baselineDsoDays: 32,
        currentDsoDays: 51,
        disputeSpike: true,
        lienSignal: true
      },
      rDriftObservations: {
        baselineDsoDays: 32,
        currentDsoDays: 51
      },
      sourceNormalization: {
        missingFields: [
          "rScoreComponentScores.agingConcentration",
          "rScoreComponentScores.disputeRate",
          "rScoreComponentScores.dsoAdp",
          "rScoreComponentScores.overLimitFrequency"
        ],
        sourcePort: "SourcePort.loadRiskObservationSnapshot"
      }
    });
    expect(snapshot?.recordIds).toEqual(
      expect.arrayContaining(["CUST-HARBOR", "USCU_S04", "90000036", "90000085", "BUREAU-HARBOR-TAX-LIEN"])
    );
    expect(snapshot?.rScoreComponentScores).toBeUndefined();
    expect(calls.some((url) => url.includes("/rest/v1/customers"))).toBe(true);
    expect(calls.some((url) => url.includes("/rest/v1/credit_decisions"))).toBe(false);

    const assessment = assessSentinelFromSourceSnapshot(snapshot as SourceRiskObservationSnapshot, sentinelConfig);
    expect(assessment.riskDrift?.drifted).toBe(true);
    expect(assessment.riskScore).toBeUndefined();
    expect(assessment.sourceNormalization.status).toBe("blocked_missing_source_fields");
  });

  it("computes R-score when Supabase source rows supply 0-100 component scores", async () => {
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([
            {
              customer_id: "USCU_S04",
              customer_name: "Harbor Foods",
              r_score_component_scores_json: {
                agingConcentration: 40,
                disputeRate: 60,
                dsoAdp: 70,
                overLimitFrequency: 80
              }
            }
          ]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000060" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "INV-HARB-003" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]));
        }
        if (tableName === "bureau_alerts") {
          return Promise.resolve(jsonResponse([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              resolved: false,
              severity: "CRITICAL"
            }
          ]));
        }
        if (tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S7", invoice_ref: "90000005", verdict: "PARTIAL" },
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
          ]));
        }

        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036", "90000060", "INV-HARB-003"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    const snapshot = await reader.loadRiskObservationSnapshot("CUST-HARBOR");

    expect(snapshot?.rScoreComponentScores).toEqual({
      agingConcentration: 40,
      disputeRate: 60,
      dsoAdp: 70,
      overLimitFrequency: 80
    });
    expect(snapshot?.sourceNormalization.missingFields).toEqual([]);

    const assessment = assessSentinelFromSourceSnapshot(snapshot as SourceRiskObservationSnapshot, sentinelConfig);
    expect(assessment.sourceNormalization.status).toBe("computed");
    expect(assessment.riskScore?.score.toFixed(2)).toBe("63.50");
    expect(assessment.riskDrift?.drifted).toBe(true);
  });

  it("rejects malformed Supabase R-score component scores instead of coercing them into computed inputs", async () => {
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([
            {
              customer_id: "USCU_S04",
              customer_name: "Harbor Foods",
              r_score_component_scores_json: {
                agingConcentration: "40",
                disputeRate: null,
                dsoAdp: "",
                overLimitFrequency: 80
              }
            }
          ]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000060" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "INV-HARB-003" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]));
        }
        if (tableName === "bureau_alerts") {
          return Promise.resolve(jsonResponse([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              resolved: false,
              severity: "CRITICAL"
            }
          ]));
        }
        if (tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S7", invoice_ref: "90000005", verdict: "PARTIAL" },
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
          ]));
        }

        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036", "90000060", "INV-HARB-003"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(reader.loadRiskObservationSnapshot("CUST-HARBOR")).rejects.toThrow();
  });

  it("does not fabricate Supabase R-drift observations when payment rows are incomplete", async () => {
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([{ customer_id: "USCU_S04", customer_name: "Harbor Foods" }]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([{ customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }]));
        }
        if (tableName === "bureau_alerts" || tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([]));
        }
        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(reader.loadRiskObservationSnapshot("CUST-HARBOR")).resolves.toBeUndefined();
  });

  it("does not fabricate Supabase R-drift observations when the source customer row is missing", async () => {
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]));
        }
        if (tableName === "bureau_alerts") {
          return Promise.resolve(jsonResponse([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              resolved: false,
              severity: "CRITICAL"
            }
          ]));
        }
        if (tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
          ]));
        }
        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(reader.loadRiskObservationSnapshot("CUST-HARBOR")).resolves.toBeUndefined();
  });

  it("rejects malformed Supabase bureau alerts instead of defaulting them to active liens", async () => {
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([{ customer_id: "USCU_S04", customer_name: "Harbor Foods" }]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]));
        }
        if (tableName === "bureau_alerts") {
          return Promise.resolve(jsonResponse([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              severity: "CRITICAL"
            }
          ]));
        }
        if (tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
          ]));
        }
        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(reader.loadRiskObservationSnapshot("CUST-HARBOR")).rejects.toThrow();
  });

  it("does not assert a Supabase dispute spike without cited invalid or partial deduction rows", async () => {
    const reader = createSupabaseRiskObservationSnapshotReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "customers") {
          return Promise.resolve(jsonResponse([{ customer_id: "USCU_S04", customer_name: "Harbor Foods" }]));
        }
        if (tableName === "payments") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]));
        }
        if (tableName === "bureau_alerts") {
          return Promise.resolve(jsonResponse([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              resolved: false,
              severity: "CRITICAL"
            }
          ]));
        }
        if (tableName === "deductions_backlog") {
          return Promise.resolve(jsonResponse([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-VALID", invoice_ref: "90000005", verdict: "VALID" }
          ]));
        }
        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      riskCaseSources: {
        "CUST-HARBOR": harborRiskCaseSource({
          baselinePaymentRefs: ["90000036"],
          currentPaymentRef: "90000085",
          sourceCustomerId: "USCU_S04"
        })
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(reader.loadRiskObservationSnapshot("CUST-HARBOR")).resolves.toBeUndefined();
  });

  it("computes R-score and R-drift from a complete cited source snapshot", () => {
    const snapshot: SourceRiskObservationSnapshot = {
      customerId: "CUST-HARBOR",
      recordIds: ["CUST-HARBOR", "RISK-SNAPSHOT-HARBOR"],
      observedSignals: {
        baselineDsoDays: 32,
        currentDsoDays: 51,
        disputeSpike: true,
        lienSignal: true
      },
      rDriftObservations: {
        baselineDisputeRate: 0.1,
        baselineDsoDays: 32,
        baselineRiskTierRank: 1,
        cooldownDaysSinceLastReview: 31,
        currentDisputeRate: 0.16,
        currentDsoDays: 51,
        currentRiskTierRank: 2
      },
      rScoreComponentScores: {
        agingConcentration: 40,
        disputeRate: 60,
        dsoAdp: 70,
        overLimitFrequency: 80
      },
      sourceNormalization: {
        missingFields: [],
        sourcePort: "SourcePort.loadRiskObservationSnapshot"
      }
    };

    const assessment = assessSentinelFromSourceSnapshot(snapshot, sentinelConfig);

    expect(assessment.status).toBe("blocked");
    expect(assessment.recordIds).toEqual(["CUST-HARBOR", "RISK-SNAPSHOT-HARBOR"]);
    expect(assessment.sourceNormalization.status).toBe("computed");
    expect(assessment.riskScore?.score.toFixed(2)).toBe("63.50");
    expect(assessment.riskDrift?.drifted).toBe(true);
    expect(assessment.riskDrift?.deterministicBasis).toMatchObject({
      computedDsoIncreaseDays: 19,
      computedDisputeRateRelativeIncrease: "0.6000"
    });
  });

  it("computes Harbor R-drift from source DSO observations while R-score normalization stays blocked", () => {
    const assessment = assessHarborSentinel(sentinelConfig, new SyntheticSource({ seed: 42 }));

    expect(assessment.status).toBe("blocked");
    expect(assessment.reason).toBe("source-risk-observation-fields-required");
    expect(assessment.recordIds).toEqual(
      expect.arrayContaining(["CUST-HARBOR", "S7-L1", "TPM-ACCRUAL-1", "S8-L1", "CREDIT-MEMO-1"])
    );
    expect(assessment.sourceNormalization).toEqual({
      missingFields: [
        "rScoreComponentScores.agingConcentration",
        "rScoreComponentScores.disputeRate",
        "rScoreComponentScores.dsoAdp",
        "rScoreComponentScores.overLimitFrequency"
      ],
      sourcePort: "SourcePort.loadRiskObservationSnapshot",
      status: "blocked_missing_source_fields"
    });
    expect(assessment.riskScore).toBeUndefined();
    expect(assessment.riskDrift?.drifted).toBe(true);
    expect(assessment.riskDrift?.deterministicBasis).toMatchObject({
      computedDsoIncreaseDays: 19,
      computedDisputeRateRelativeIncrease: null,
      computedRiskTierDowngrade: null,
      triggered: {
        cooldownSatisfied: true,
        disputeRateRelativeIncrease: false,
        dsoIncreaseDays: true,
        riskTierDowngrade: false
      }
    });
  });

  it("rejects source snapshots without cited recordIds before producing a Sentinel assessment", () => {
    expect(() =>
      assessSentinelFromSourceSnapshot(
        {
          customerId: "CUST-HARBOR",
          recordIds: [],
          observedSignals: {
            baselineDsoDays: 32,
            currentDsoDays: 51,
            disputeSpike: true,
            lienSignal: true
          },
          sourceNormalization: {
            missingFields: [],
            sourcePort: "SourcePort.loadRiskObservationSnapshot"
          }
        },
        sentinelConfig
      )
    ).toThrow("Sentinel source snapshots require cited recordIds.");
  });

  it("fails closed when source-normalized R-score or R-drift objects are partial", () => {
    const assessment = assessSentinelFromSourceSnapshot(
      {
        customerId: "CUST-HARBOR",
        recordIds: ["CUST-HARBOR", "RISK-SNAPSHOT-HARBOR"],
        observedSignals: {
          baselineDsoDays: 32,
          currentDsoDays: 51,
          disputeSpike: true,
          lienSignal: true
        },
        rDriftObservations: {
          baselineDisputeRate: 0.1,
          baselineRiskTierRank: 1,
          cooldownDaysSinceLastReview: 31,
          currentDisputeRate: 0.16
        } as NonNullable<SourceRiskObservationSnapshot["rDriftObservations"]>,
        rScoreComponentScores: {
          agingConcentration: 40,
          disputeRate: 60,
          dsoAdp: 70
        } as NonNullable<SourceRiskObservationSnapshot["rScoreComponentScores"]>,
        sourceNormalization: {
          missingFields: [],
          sourcePort: "SourcePort.loadRiskObservationSnapshot"
        }
      },
      sentinelConfig
    );

    expect(assessment.status).toBe("blocked");
    expect(assessment.sourceNormalization).toMatchObject({
      missingFields: [
        "rScoreComponentScores.overLimitFrequency",
        "rDriftObservations.baselineDsoDays",
        "rDriftObservations.currentDsoDays",
        "rDriftObservations.currentRiskTierRank"
      ],
      status: "blocked_missing_source_fields"
    });
    expect(assessment.riskScore).toBeUndefined();
    expect(assessment.riskDrift).toBeUndefined();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
