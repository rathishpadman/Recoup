import { money, type Money } from "../types/money.js";
import { createEventId } from "../types/variance.js";
import { SyntheticDatasetSchema, type Customer, type DeductionLine, type DeductionRouting, type DeductionVerdict } from "../types/entities.js";

interface BuildSyntheticDatasetInput {
  seed: 42;
}

interface ScenarioSpec {
  scenarioId: DeductionLine["scenarioId"];
  customerId: string;
  scenarioType: string;
  lineAmounts: string[];
  verdict: DeductionVerdict;
  routing: DeductionRouting;
  ruleId: string;
  evidencePrefix: string;
}

export interface SyntheticDataset extends ReturnType<typeof toParsedDataset> {
  zeroMoney: Money;
  rollup: {
    totalLines: number;
    totalAmount: Money;
    validLines: number;
    validAmount: Money;
    recoveryLines: number;
    recoveryAmount: Money;
  };
  manifest: {
    seed: 42;
    scenarioIds: string[];
    lineIds: string[];
    eventIds: string[];
  };
}

const customers: Customer[] = [
  {
    customerId: "CUST-GREENLEAF",
    name: "Greenleaf Naturals",
    profile: "Regional wholesaler"
  },
  {
    customerId: "CUST-CRESTLINE",
    name: "Crestline Grocery",
    profile: "Strategic retailer"
  },
  {
    customerId: "CUST-VALUMART",
    name: "ValuMart Club",
    profile: "Club channel"
  },
  {
    customerId: "CUST-HARBOR",
    name: "Harbor Foods",
    profile: "Foodservice distributor"
  }
];

const scenarioSpecs: ScenarioSpec[] = [
  {
    scenarioId: "S1",
    customerId: "CUST-GREENLEAF",
    scenarioType: "Damaged product, evidence received",
    lineAmounts: ["2700.00", "2800.00", "2700.00"],
    verdict: "valid",
    routing: "billing",
    ruleId: "damage-evidence-valid",
    evidencePrefix: "PHOTO-CARRIER"
  },
  {
    scenarioId: "S2",
    customerId: "CUST-CRESTLINE",
    scenarioType: "Valid promo billed at list",
    lineAmounts: ["7300.00", "7300.00"],
    verdict: "valid",
    routing: "billing",
    ruleId: "promo-not-captured",
    evidencePrefix: "TPM-CONTRACT"
  },
  {
    scenarioId: "S3",
    customerId: "CUST-CRESTLINE",
    scenarioType: "Shortage claim with full signed POD",
    lineAmounts: ["5300.00", "5300.00", "5350.00", "5350.00"],
    verdict: "invalid",
    routing: "recovery",
    ruleId: "shortage-pod-mismatch",
    evidencePrefix: "POD-SIGNED"
  },
  {
    scenarioId: "S4",
    customerId: "CUST-VALUMART",
    scenarioType: "OTIF compliance fine valid per contract",
    lineAmounts: ["4900.00", "4900.00"],
    verdict: "valid",
    routing: "billing",
    ruleId: "otif-fine-valid",
    evidencePrefix: "SLA-CONTRACT"
  },
  {
    scenarioId: "S5",
    customerId: "CUST-VALUMART",
    scenarioType: "OTIF fine contradicted by 3PL POD timestamp",
    lineAmounts: ["4200.00", "4250.00", "4250.00"],
    verdict: "invalid",
    routing: "recovery",
    ruleId: "otif-timestamp-mismatch",
    evidencePrefix: "POD-TIMESTAMP"
  },
  {
    scenarioId: "S6",
    customerId: "CUST-CRESTLINE",
    scenarioType: "Pricing chargeback below contracted price",
    lineAmounts: ["9200.00", "9200.00"],
    verdict: "invalid",
    routing: "recovery",
    ruleId: "pricing-below-contract",
    evidencePrefix: "PRICE-CLAUSE"
  },
  {
    scenarioId: "S7",
    customerId: "CUST-HARBOR",
    scenarioType: "Promo overclaim above approved TPM accrual",
    lineAmounts: ["7900.00", "8000.00"],
    verdict: "partial",
    routing: "recovery",
    ruleId: "promo-overclaim",
    evidencePrefix: "TPM-ACCRUAL"
  },
  {
    scenarioId: "S8",
    customerId: "CUST-HARBOR",
    scenarioType: "Duplicate already-credited deduction",
    lineAmounts: ["5750.00", "5750.00"],
    verdict: "invalid",
    routing: "recovery",
    ruleId: "duplicate-credit",
    evidencePrefix: "CREDIT-MEMO"
  }
];

export function buildSyntheticDataset(input: BuildSyntheticDatasetInput): SyntheticDataset {
  const parsed = toParsedDataset({
    seed: input.seed,
    customers,
    deductionLines: buildDeductionLines()
  });
  const rollup = computeRollup(parsed.deductionLines);

  return {
    ...parsed,
    zeroMoney: money("0.00"),
    rollup,
    manifest: {
      seed: parsed.seed,
      scenarioIds: scenarioSpecs.map((scenario) => scenario.scenarioId),
      lineIds: parsed.deductionLines.map((line) => line.lineId),
      eventIds: parsed.deductionLines.map((line) => line.eventId)
    }
  };
}

function toParsedDataset(dataset: { seed: 42; customers: Customer[]; deductionLines: DeductionLine[] }) {
  return SyntheticDatasetSchema.parse(dataset);
}

function buildDeductionLines(): DeductionLine[] {
  return scenarioSpecs.flatMap((scenario) =>
    scenario.lineAmounts.map((amount, index) => {
      const sequence = index + 1;
      const sequenceLabel = String(sequence);
      const lineId = `${scenario.scenarioId}-L${sequenceLabel}`;
      const recordIds = [
        lineId,
        `${scenario.evidencePrefix}-${sequenceLabel}`,
        `INV-${scenario.scenarioId}-${sequenceLabel}`
      ];
      const amountMoney = money(amount);
      const base = {
        lineId,
        period: "2026-06",
        recordIds,
        ruleId: scenario.ruleId,
        amount: amountMoney
      };

      return {
        lineId,
        scenarioId: scenario.scenarioId,
        customerId: scenario.customerId,
        scenarioType: scenario.scenarioType,
        amount: amountMoney,
        verdict: scenario.verdict,
        routing: scenario.routing,
        recordIds,
        ruleId: scenario.ruleId,
        period: "2026-06",
        eventId: createEventId({
          ruleId: scenario.ruleId,
          recordIds,
          period: "2026-06"
        }),
        ruleInput: buildSyntheticRuleInput(base)
      };
    })
  );
}

export function buildSyntheticRuleInput(input: {
  amount: Money;
  lineId: string;
  period: string;
  recordIds: string[];
  ruleId: string;
}): Record<string, unknown> {
  const base = {
    lineId: input.lineId,
    period: input.period,
    recordIds: input.recordIds,
    claimedAmount: input.amount.toFixed(2)
  };

  switch (input.ruleId) {
    case "damage-evidence-valid":
      return {
        ...base,
        ruleId: input.ruleId,
        damagedGoodsAmount: input.amount.toFixed(2),
        salvageCreditAmount: "0.00",
        photoEvidenceReceived: true,
        carrierReportReceived: true
      };
    case "promo-not-captured":
      return {
        ...base,
        ruleId: input.ruleId,
        approvedPromoAccrual: input.amount.toFixed(2),
        capturedPromoCredit: "0.00",
        approvedPromoExists: true,
        invoiceBilledAtList: true
      };
    case "shortage-pod-mismatch":
      return {
        ...base,
        ruleId: input.ruleId,
        allowedShortageAmount: "0.00",
        claimedShortage: true,
        podSignedFullDelivery: true
      };
    case "otif-fine-valid":
      return {
        ...base,
        ruleId: input.ruleId,
        allowedFineAmount: input.amount.toFixed(2),
        contractSlaAllowsFine: true,
        slaBreachConfirmed: true
      };
    case "otif-timestamp-mismatch":
      return {
        ...base,
        ruleId: input.ruleId,
        allowedFineAmount: "0.00",
        otifFineAssessed: true,
        podTimestampOnTime: true
      };
    case "pricing-below-contract":
      return {
        ...base,
        ruleId: input.ruleId,
        contractedUnitPrice: input.amount.toFixed(2),
        deliveredQuantity: "1",
        actualPaidAmount: "0.00",
        deductedBelowContractPrice: true,
        contractPriceAvailable: true
      };
    case "promo-overclaim":
      return {
        ...base,
        ruleId: input.ruleId,
        claimedAllowance: input.amount.toFixed(2),
        approvedAccrual: "0.00",
        approvedAccrualExceeded: true
      };
    case "duplicate-credit":
      return {
        ...base,
        ruleId: input.ruleId,
        priorCreditAmount: input.amount.toFixed(2),
        alreadyCredited: true
      };
    default:
      throw new Error(`Unknown synthetic rule input fixture: ${input.ruleId}`);
  }
}

function computeRollup(lines: DeductionLine[]): SyntheticDataset["rollup"] {
  const zero = money("0.00");
  const totalAmount = lines.reduce((total, line) => total.plus(line.amount), zero);
  const validLines = lines.filter((line) => line.routing === "billing");
  const recoveryLines = lines.filter((line) => line.routing === "recovery");

  return {
    totalLines: lines.length,
    totalAmount,
    validLines: validLines.length,
    validAmount: validLines.reduce((total, line) => total.plus(line.amount), zero),
    recoveryLines: recoveryLines.length,
    recoveryAmount: recoveryLines.reduce((total, line) => total.plus(line.amount), zero)
  };
}
