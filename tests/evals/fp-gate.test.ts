import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../datagen/generate.js";
import { evaluateRule, type RuleId, type RuleInput } from "../../src/core/rules/index.js";
import { money } from "../../src/types/money.js";

const period = "2026-06";

interface NoiseFixture {
  name: string;
  ruleId: RuleId;
  input: RuleInput;
}

const noiseFixtures: NoiseFixture[] = [
  {
    name: "shortage_with_confirmed_short_pod",
    ruleId: "shortage-pod-mismatch",
    input: {
      ruleId: "shortage-pod-mismatch",
      lineId: "NOISE-SHORTAGE-1",
      period,
      recordIds: ["NOISE-SHORTAGE-1", "POD-CONFIRMED-SHORT", "INV-NOISE-1"],
      claimedAmount: money("5300.00"),
      claimedShortage: true,
      podSignedFullDelivery: false
    }
  },
  {
    name: "otif_fine_with_late_delivery",
    ruleId: "otif-timestamp-mismatch",
    input: {
      ruleId: "otif-timestamp-mismatch",
      lineId: "NOISE-OTIF-1",
      period,
      recordIds: ["NOISE-OTIF-1", "POD-LATE", "INV-NOISE-2"],
      claimedAmount: money("4900.00"),
      otifFineAssessed: true,
      podTimestampOnTime: false
    }
  },
  {
    name: "pricing_at_contract",
    ruleId: "pricing-below-contract",
    input: {
      ruleId: "pricing-below-contract",
      lineId: "NOISE-PRICE-1",
      period,
      recordIds: ["NOISE-PRICE-1", "PRICE-CONTRACT-MATCH", "INV-NOISE-3"],
      claimedAmount: money("0.00"),
      deductedBelowContractPrice: false,
      contractPriceAvailable: true
    }
  },
  {
    name: "promo_claim_equals_accrual",
    ruleId: "promo-overclaim",
    input: {
      ruleId: "promo-overclaim",
      lineId: "NOISE-PROMO-1",
      period,
      recordIds: ["NOISE-PROMO-1", "TPM-ACCRUAL-MATCH", "INV-NOISE-4"],
      claimedAmount: money("8000.00"),
      approvedAccrualExceeded: false,
      claimedAllowance: money("8000.00"),
      approvedAccrual: money("8000.00")
    }
  },
  {
    name: "promo_invoice_already_captured",
    ruleId: "promo-not-captured",
    input: {
      ruleId: "promo-not-captured",
      lineId: "NOISE-PROMO-2",
      period,
      recordIds: ["NOISE-PROMO-2", "TPM-CAPTURED", "INV-NOISE-5"],
      claimedAmount: money("7300.00"),
      approvedPromoExists: true,
      invoiceBilledAtList: false
    }
  },
  {
    name: "duplicate_like_amount_distinct_invoice",
    ruleId: "duplicate-credit",
    input: {
      ruleId: "duplicate-credit",
      lineId: "NOISE-DUP-1",
      period,
      recordIds: ["NOISE-DUP-1", "DISTINCT-INVOICE", "INV-NOISE-6"],
      claimedAmount: money("5750.00"),
      alreadyCredited: false
    }
  },
  {
    name: "damage_evidence_absent_or_negative",
    ruleId: "damage-evidence-valid",
    input: {
      ruleId: "damage-evidence-valid",
      lineId: "NOISE-DAMAGE-1",
      period,
      recordIds: ["NOISE-DAMAGE-1", "CARRIER-NO-DAMAGE", "INV-NOISE-7"],
      claimedAmount: money("2700.00"),
      photoEvidenceReceived: false,
      carrierReportReceived: true
    }
  },
  {
    name: "otif_no_sla_fine_allowed",
    ruleId: "otif-fine-valid",
    input: {
      ruleId: "otif-fine-valid",
      lineId: "NOISE-SLA-1",
      period,
      recordIds: ["NOISE-SLA-1", "SLA-NO-FINE", "INV-NOISE-8"],
      claimedAmount: money("0.00"),
      contractSlaAllowsFine: false,
      slaBreachConfirmed: false
    }
  }
];

describe("detection false-positive gate", () => {
  it("keeps legitimate noise fixtures from firing", () => {
    const falseFires = noiseFixtures.flatMap((fixture) => {
      const finding = evaluateRule(fixture.ruleId, fixture.input);
      return finding === undefined ? [] : [fixture.name];
    });

    expect(falseFires).toEqual([]);
  });

  it("preserves canonical S1-S8 gold-set parity while testing noise separately", () => {
    const dataset = buildSyntheticDataset({ seed: 42 });

    expect(dataset.deductionLines).toHaveLength(20);
    expect(dataset.rollup.totalAmount.toFixed(2)).toBe("112400.00");
    expect(dataset.rollup.validLines).toBe(7);
    expect(dataset.rollup.validAmount.toFixed(2)).toBe("32600.00");
    expect(dataset.rollup.recoveryLines).toBe(13);
    expect(dataset.rollup.recoveryAmount.toFixed(2)).toBe("79800.00");
  });
});
