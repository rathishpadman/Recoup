import { Decimal } from "decimal.js";
import { z } from "zod";

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP
});

export const MoneySchema = z.preprocess((value) => {
  if (value instanceof Decimal) {
    return value;
  }

  if (typeof value === "string") {
    return new Decimal(value);
  }

  throw new Error("Money must be provided as a Decimal or decimal string");
}, z.instanceof(Decimal));

export type Money = z.infer<typeof MoneySchema>;

export function money(value: string | Decimal): Money {
  return MoneySchema.parse(value);
}
