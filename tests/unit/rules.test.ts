import { describe, expect, it } from "vitest";
import { evaluateRule, ruleRegistry, type RuleId, type RuleInput } from "../../src/core/rules/index.js";
import { money } from "../../src/types/money.js";
import { createEventId } from "../../src/types/variance.js";

const period = "2026-06";

const expectedRuleIds = [
  "damage-evidence-valid",
  "promo-not-captured",
  "shortage-pod-mismatch",
  "otif-fine-valid",
  "otif-timestamp-mismatch",
  "pricing-below-contract",
  "promo-overclaim",
  "duplicate-credit"
] satisfies RuleId[];

interface RuleFixture {
  ruleId: RuleId;
  lineId: string;
  recordIds: string[];
  amount: string;
  basis: string;
  input: RuleInput;
}

const scenarios: Array<{
  scenarioId: string;
  ruleId: RuleId;
  evidencePrefix: string;
  amounts: string[];
  basis: string;
  inputForLine: (lineId: string, recordIds: string[], amount: string) => RuleInput;
}> = [
  {
    scenarioId: "S1",
    ruleId: "damage-evidence-valid",
    evidencePrefix: "PHOTO-CARRIER",
    amounts: ["2700.00", "2800.00", "2700.00"],
    basis: "Damage claim supported by photo evidence and carrier report.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "damage-evidence-valid",
      lineId,
      period,
      recordIds,
      claimedAmount: money("999999.00"),
      damagedGoodsAmount: money(amount),
      salvageCreditAmount: money("0.00"),
      photoEvidenceReceived: true,
      carrierReportReceived: true
    })
  },
  {
    scenarioId: "S2",
    ruleId: "promo-not-captured",
    evidencePrefix: "TPM-CONTRACT",
    amounts: ["7300.00", "7300.00"],
    basis: "Approved promotion exists and invoice was billed at list.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "promo-not-captured",
      lineId,
      period,
      recordIds,
      claimedAmount: money("999999.00"),
      approvedPromoAccrual: money(amount),
      capturedPromoCredit: money("0.00"),
      approvedPromoExists: true,
      invoiceBilledAtList: true
    })
  },
  {
    scenarioId: "S3",
    ruleId: "shortage-pod-mismatch",
    evidencePrefix: "POD-SIGNED",
    amounts: ["5300.00", "5300.00", "5350.00", "5350.00"],
    basis: "POD shows full signed delivery for the claimed shortage.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "shortage-pod-mismatch",
      lineId,
      period,
      recordIds,
      claimedAmount: money(amount),
      allowedShortageAmount: money("0.00"),
      claimedShortage: true,
      podSignedFullDelivery: true
    })
  },
  {
    scenarioId: "S4",
    ruleId: "otif-fine-valid",
    evidencePrefix: "SLA-CONTRACT",
    amounts: ["4900.00", "4900.00"],
    basis: "Contract SLA permits the OTIF fine and the breach is confirmed.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "otif-fine-valid",
      lineId,
      period,
      recordIds,
      claimedAmount: money("999999.00"),
      allowedFineAmount: money(amount),
      contractSlaAllowsFine: true,
      slaBreachConfirmed: true
    })
  },
  {
    scenarioId: "S5",
    ruleId: "otif-timestamp-mismatch",
    evidencePrefix: "POD-TIMESTAMP",
    amounts: ["4200.00", "4250.00", "4250.00"],
    basis: "3PL POD timestamp shows delivery was on time.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "otif-timestamp-mismatch",
      lineId,
      period,
      recordIds,
      claimedAmount: money(amount),
      allowedFineAmount: money("0.00"),
      otifFineAssessed: true,
      podTimestampOnTime: true
    })
  },
  {
    scenarioId: "S6",
    ruleId: "pricing-below-contract",
    evidencePrefix: "PRICE-CLAUSE",
    amounts: ["9200.00", "9200.00"],
    basis: "Deduction prices the line below the contracted price.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "pricing-below-contract",
      lineId,
      period,
      recordIds,
      claimedAmount: money("999999.00"),
      contractedUnitPrice: money(amount),
      deliveredQuantity: "1",
      actualPaidAmount: money("0.00"),
      deductedBelowContractPrice: true,
      contractPriceAvailable: true
    })
  },
  {
    scenarioId: "S7",
    ruleId: "promo-overclaim",
    evidencePrefix: "TPM-ACCRUAL",
    amounts: ["7900.00", "8000.00"],
    basis: "Claimed allowance exceeds the approved TPM accrual; overclaim is recovered in full.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "promo-overclaim",
      lineId,
      period,
      recordIds,
      claimedAmount: money("999999.00"),
      approvedAccrualExceeded: true,
      claimedAllowance: money(amount).plus(money("1100.00")),
      approvedAccrual: money("1100.00")
    })
  },
  {
    scenarioId: "S8",
    ruleId: "duplicate-credit",
    evidencePrefix: "CREDIT-MEMO",
    amounts: ["5750.00", "5750.00"],
    basis: "Deduction duplicates an already-issued credit memo.",
    inputForLine: (lineId, recordIds, amount) => ({
      ruleId: "duplicate-credit",
      lineId,
      period,
      recordIds,
      claimedAmount: money("999999.00"),
      priorCreditAmount: money(amount),
      alreadyCredited: true
    })
  }
];

function buildFixtures(): RuleFixture[] {
  return scenarios.flatMap((scenario) =>
    scenario.amounts.map((amount, amountIndex) => {
      const sequence = String(amountIndex + 1);
      const lineId = `${scenario.scenarioId}-L${sequence}`;
      const recordIds = [lineId, `${scenario.evidencePrefix}-${sequence}`, `INV-${scenario.scenarioId}-${sequence}`];

      return {
        ruleId: scenario.ruleId,
        lineId,
        recordIds,
        amount,
        basis: scenario.basis,
        input: scenario.inputForLine(lineId, recordIds, amount)
      };
    })
  );
}

describe("deduction rule registry", () => {
  it("registers every canonical S1-S8 rule id", () => {
    expect(Object.keys(ruleRegistry).sort()).toEqual([...expectedRuleIds].sort());
  });

  it.each(buildFixtures())("$lineId fires $ruleId with line amount and deterministic event id", (fixture) => {
    const finding = evaluateRule(fixture.ruleId, fixture.input);

    expect(finding).toBeDefined();
    expect(finding?.ruleId).toBe(fixture.ruleId);
    expect(finding?.recordIds).toEqual(fixture.recordIds);
    expect(finding?.deltaAmount.toFixed(2)).toBe(fixture.amount);
    expect(finding?.basis).toBe(fixture.basis);
    expect(finding?.eventId).toBe(
      createEventId({
        ruleId: fixture.ruleId,
        recordIds: fixture.recordIds,
        period
      })
    );
  });

  it("evaluates through the registered rule function", () => {
    const recordIds = ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"];
    const finding = ruleRegistry["damage-evidence-valid"]({
      ruleId: "damage-evidence-valid",
      lineId: "S1-L1",
      period,
      recordIds,
      claimedAmount: money("2700.00"),
      damagedGoodsAmount: money("2700.00"),
      salvageCreditAmount: money("0.00"),
      photoEvidenceReceived: true,
      carrierReportReceived: true
    });

    expect(finding?.eventId).toBe(
      createEventId({
        ruleId: "damage-evidence-valid",
        recordIds,
        period
      })
    );
  });

  it("returns undefined when deterministic evidence checks do not fire", () => {
    const noFireInputs: Record<RuleId, RuleInput> = {
      "damage-evidence-valid": {
        ruleId: "damage-evidence-valid",
        lineId: "S1-NO-FIRE",
        period,
        recordIds: ["S1-NO-FIRE", "PHOTO-CARRIER-NO-FIRE", "INV-S1-NO-FIRE"],
        claimedAmount: money("1.00"),
        damagedGoodsAmount: money("1.00"),
        salvageCreditAmount: money("0.00"),
        photoEvidenceReceived: true,
        carrierReportReceived: false
      },
      "promo-not-captured": {
        ruleId: "promo-not-captured",
        lineId: "S2-NO-FIRE",
        period,
        recordIds: ["S2-NO-FIRE", "TPM-CONTRACT-NO-FIRE", "INV-S2-NO-FIRE"],
        claimedAmount: money("1.00"),
        approvedPromoAccrual: money("1.00"),
        capturedPromoCredit: money("0.00"),
        approvedPromoExists: true,
        invoiceBilledAtList: false
      },
      "shortage-pod-mismatch": {
        ruleId: "shortage-pod-mismatch",
        lineId: "S3-NO-FIRE",
        period,
        recordIds: ["S3-NO-FIRE", "POD-SIGNED-NO-FIRE", "INV-S3-NO-FIRE"],
        claimedAmount: money("1.00"),
        allowedShortageAmount: money("0.00"),
        claimedShortage: true,
        podSignedFullDelivery: false
      },
      "otif-fine-valid": {
        ruleId: "otif-fine-valid",
        lineId: "S4-NO-FIRE",
        period,
        recordIds: ["S4-NO-FIRE", "SLA-CONTRACT-NO-FIRE", "INV-S4-NO-FIRE"],
        claimedAmount: money("1.00"),
        allowedFineAmount: money("1.00"),
        contractSlaAllowsFine: true,
        slaBreachConfirmed: false
      },
      "otif-timestamp-mismatch": {
        ruleId: "otif-timestamp-mismatch",
        lineId: "S5-NO-FIRE",
        period,
        recordIds: ["S5-NO-FIRE", "POD-TIMESTAMP-NO-FIRE", "INV-S5-NO-FIRE"],
        claimedAmount: money("1.00"),
        allowedFineAmount: money("0.00"),
        otifFineAssessed: true,
        podTimestampOnTime: false
      },
      "pricing-below-contract": {
        ruleId: "pricing-below-contract",
        lineId: "S6-NO-FIRE",
        period,
        recordIds: ["S6-NO-FIRE", "PRICE-CLAUSE-NO-FIRE", "INV-S6-NO-FIRE"],
        claimedAmount: money("1.00"),
        contractedUnitPrice: money("1.00"),
        deliveredQuantity: "1",
        actualPaidAmount: money("0.00"),
        deductedBelowContractPrice: true,
        contractPriceAvailable: false
      },
      "promo-overclaim": {
        ruleId: "promo-overclaim",
        lineId: "S7-NO-FIRE",
        period,
        recordIds: ["S7-NO-FIRE", "TPM-ACCRUAL-NO-FIRE", "INV-S7-NO-FIRE"],
        claimedAmount: money("1.00"),
        approvedAccrualExceeded: false,
        claimedAllowance: money("1.00"),
        approvedAccrual: money("0.00")
      },
      "duplicate-credit": {
        ruleId: "duplicate-credit",
        lineId: "S8-NO-FIRE",
        period,
        recordIds: ["S8-NO-FIRE", "CREDIT-MEMO-NO-FIRE", "INV-S8-NO-FIRE"],
        claimedAmount: money("1.00"),
        priorCreditAmount: money("1.00"),
        alreadyCredited: false
      }
    };

    for (const ruleId of expectedRuleIds) {
      expect(evaluateRule(ruleId, noFireInputs[ruleId])).toBeUndefined();
    }
  });

  it("computes promo overclaim from claimed allowance minus approved accrual", () => {
    const finding = evaluateRule("promo-overclaim", {
      ruleId: "promo-overclaim",
      lineId: "S7-L1",
      period,
      recordIds: ["S7-L1", "TPM-ACCRUAL-1", "INV-S7-1"],
      claimedAmount: money("999999.00"),
      approvedAccrualExceeded: true,
      claimedAllowance: money("9000.00"),
      approvedAccrual: money("1100.00")
    });

    expect(finding?.deltaAmount.toFixed(2)).toBe("7900.00");
  });

  it("suppresses equal or negative promo overclaims", () => {
    const base = {
      ruleId: "promo-overclaim" as const,
      lineId: "S7-NO-DELTA",
      period,
      recordIds: ["S7-NO-DELTA", "TPM-ACCRUAL-NO-DELTA", "INV-S7-NO-DELTA"],
      claimedAmount: money("999999.00"),
      approvedAccrualExceeded: true
    };

    expect(
      evaluateRule("promo-overclaim", {
        ...base,
        claimedAllowance: money("1100.00"),
        approvedAccrual: money("1100.00")
      })
    ).toBeUndefined();
    expect(
      evaluateRule("promo-overclaim", {
        ...base,
        claimedAllowance: money("1000.00"),
        approvedAccrual: money("1100.00")
      })
    ).toBeUndefined();
  });

  it("computes pricing deltas from contract price times delivered quantity minus actual paid", () => {
    const finding = evaluateRule("pricing-below-contract", {
      ruleId: "pricing-below-contract",
      lineId: "S6-L1",
      period,
      recordIds: ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1"],
      claimedAmount: money("999999.00"),
      contractedUnitPrice: money("46.00"),
      deliveredQuantity: "300",
      actualPaidAmount: money("4600.00"),
      deductedBelowContractPrice: true,
      contractPriceAvailable: true
    });

    expect(finding?.deltaAmount.toFixed(2)).toBe("9200.00");
  });

  it("suppresses exact or over-contract pricing inputs", () => {
    const base = {
      ruleId: "pricing-below-contract" as const,
      lineId: "S6-NO-DELTA",
      period,
      recordIds: ["S6-NO-DELTA", "PRICE-CLAUSE-NO-DELTA", "INV-S6-NO-DELTA"],
      claimedAmount: money("999999.00"),
      contractedUnitPrice: money("46.00"),
      deliveredQuantity: "300",
      deductedBelowContractPrice: true,
      contractPriceAvailable: true
    };

    expect(evaluateRule("pricing-below-contract", { ...base, actualPaidAmount: money("13800.00") })).toBeUndefined();
    expect(evaluateRule("pricing-below-contract", { ...base, actualPaidAmount: money("14000.00") })).toBeUndefined();
  });

  it("computes promo capture gap from approved accrual minus captured credit", () => {
    const finding = evaluateRule("promo-not-captured", {
      ruleId: "promo-not-captured",
      lineId: "S2-L1",
      period,
      recordIds: ["S2-L1", "TPM-CONTRACT-1", "INV-S2-1"],
      claimedAmount: money("999999.00"),
      approvedPromoAccrual: money("9000.00"),
      capturedPromoCredit: money("1700.00"),
      approvedPromoExists: true,
      invoiceBilledAtList: true
    });

    expect(finding?.deltaAmount.toFixed(2)).toBe("7300.00");
  });

  it("suppresses already captured promo credits", () => {
    expect(
      evaluateRule("promo-not-captured", {
        ruleId: "promo-not-captured",
        lineId: "S2-NO-DELTA",
        period,
        recordIds: ["S2-NO-DELTA", "TPM-CONTRACT-NO-DELTA", "INV-S2-NO-DELTA"],
        claimedAmount: money("999999.00"),
        approvedPromoAccrual: money("9000.00"),
        capturedPromoCredit: money("9000.00"),
        approvedPromoExists: true,
        invoiceBilledAtList: true
      })
    ).toBeUndefined();
  });

  it("computes shortage and OTIF timestamp deltas against zero allowed source amounts", () => {
    const shortage = evaluateRule("shortage-pod-mismatch", {
      ruleId: "shortage-pod-mismatch",
      lineId: "S3-L1",
      period,
      recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1"],
      claimedAmount: money("5300.00"),
      allowedShortageAmount: money("0.00"),
      claimedShortage: true,
      podSignedFullDelivery: true
    });
    const otif = evaluateRule("otif-timestamp-mismatch", {
      ruleId: "otif-timestamp-mismatch",
      lineId: "S5-L1",
      period,
      recordIds: ["S5-L1", "POD-TIMESTAMP-1", "INV-S5-1"],
      claimedAmount: money("4200.00"),
      allowedFineAmount: money("0.00"),
      otifFineAssessed: true,
      podTimestampOnTime: true
    });

    expect(shortage?.deltaAmount.toFixed(2)).toBe("5300.00");
    expect(otif?.deltaAmount.toFixed(2)).toBe("4200.00");
  });

  it("suppresses shortage and OTIF timestamp inputs without a mismatch", () => {
    expect(
      evaluateRule("shortage-pod-mismatch", {
        ruleId: "shortage-pod-mismatch",
        lineId: "S3-NO-MISMATCH",
        period,
        recordIds: ["S3-NO-MISMATCH", "POD-SIGNED-NO-MISMATCH", "INV-S3-NO-MISMATCH"],
        claimedAmount: money("5300.00"),
        allowedShortageAmount: money("0.00"),
        claimedShortage: true,
        podSignedFullDelivery: false
      })
    ).toBeUndefined();
    expect(
      evaluateRule("otif-timestamp-mismatch", {
        ruleId: "otif-timestamp-mismatch",
        lineId: "S5-NO-MISMATCH",
        period,
        recordIds: ["S5-NO-MISMATCH", "POD-TIMESTAMP-NO-MISMATCH", "INV-S5-NO-MISMATCH"],
        claimedAmount: money("4200.00"),
        allowedFineAmount: money("0.00"),
        otifFineAssessed: true,
        podTimestampOnTime: false
      })
    ).toBeUndefined();
  });
});
