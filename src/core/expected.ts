import { Decimal } from "decimal.js";
import type { Money } from "../types/money.js";

export type ExpectedPositionInput =
  | {
      kind: "contracted-delivery";
      contractedUnitPrice: Money;
      deliveredQuantity: string;
      actual: Money;
    }
  | {
      kind: "promo-accrual";
      approvedAccrual: Money;
      actual: Money;
    }
  | {
      kind: "contract-sla";
      allowedFine: Money;
      actual: Money;
    };

export interface ExpectedPosition {
  expected: Money;
  actual: Money;
  delta: Money;
}

export function reconstructExpectedPosition(input: ExpectedPositionInput): ExpectedPosition {
  const expected = reconstructExpected(input);

  return {
    expected,
    actual: input.actual,
    delta: input.actual.minus(expected)
  };
}

function reconstructExpected(input: ExpectedPositionInput): Money {
  switch (input.kind) {
    case "contracted-delivery":
      return input.contractedUnitPrice.times(new Decimal(input.deliveredQuantity));
    case "promo-accrual":
      return input.approvedAccrual;
    case "contract-sla":
      return input.allowedFine;
  }
}
