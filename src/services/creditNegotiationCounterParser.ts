import { z } from "zod";
import { Decimal } from "decimal.js";
import {
  parseActiveCreditNegotiationPolicyRows,
  type CreditNegotiationPolicyRow,
  type CreditNegotiationPolicySnapshot
} from "./creditNegotiationPolicy.ts";

const counterFieldSchema = z.enum(["collateralRatio", "depositPct", "financingSpreadBps", "outOfScope", "releasePct", "trancheCount"]);

const modelExtractionSchema = z
  .object({
    citedSpans: z.array(z.object({ field: counterFieldSchema, text: z.string().min(1) }).strict()).min(1),
    intent: z.enum(["counter_offer", "out_of_scope"])
  })
  .strict();

type CounterField = z.infer<typeof counterFieldSchema>;

interface ParseCreditNegotiationCounterOfferInput {
  modelExtraction: unknown;
  rawMessage: string;
}

export type CreditNegotiationCounterParseResult =
  | {
      citedSpans: Array<{ field: CounterField; text: string }>;
      extractedTerms: Partial<Record<Exclude<CounterField, "outOfScope">, number>>;
      intent: "counter_offer";
      status: "grammar_valid";
    }
  | {
      citedSpans?: Array<{ field: CounterField; text: string }> | undefined;
      intent?: "counter_offer" | "out_of_scope" | undefined;
      reason: string;
      status: "human_review";
    };

export function parseCreditNegotiationCounterOffer(
  input: ParseCreditNegotiationCounterOfferInput
): CreditNegotiationCounterParseResult {
  const parsed = modelExtractionSchema.safeParse(input.modelExtraction);
  if (!parsed.success) {
    return {
      reason: "Counter-offer model extraction is outside the approved schema.",
      status: "human_review"
    };
  }

  if (
    parsed.data.intent === "out_of_scope" ||
    parsed.data.citedSpans.some((span) => span.field === "outOfScope" || !input.rawMessage.includes(span.text))
  ) {
    return {
      citedSpans: parsed.data.citedSpans,
      intent: parsed.data.intent,
      reason: "Counter-offer is outside the approved negotiation grammar.",
      status: "human_review"
    };
  }

  const extractedTerms: Partial<Record<Exclude<CounterField, "outOfScope">, number>> = {};
  for (const span of parsed.data.citedSpans) {
    const field = span.field;
    if (field === "outOfScope") {
      return {
        citedSpans: parsed.data.citedSpans,
        intent: parsed.data.intent,
        reason: "Counter-offer is outside the approved negotiation grammar.",
        status: "human_review"
      };
    }

    const extracted = extractNumericValue(field, span.text);
    if (extracted === undefined) {
      return {
        citedSpans: parsed.data.citedSpans,
        intent: parsed.data.intent,
        reason: "Counter-offer cited span lacks an exact numeric value.",
        status: "human_review"
      };
    }
    extractedTerms[field] = extracted;
  }

  return {
    citedSpans: parsed.data.citedSpans,
    extractedTerms,
    intent: "counter_offer",
    status: "grammar_valid"
  };
}

export function validateCreditNegotiationCounterPolicy(
  result: CreditNegotiationCounterParseResult,
  policyRows: readonly CreditNegotiationPolicyRow[]
): CreditNegotiationCounterParseResult {
  if (result.status !== "grammar_valid") {
    return result;
  }

  const policy = parseActiveCreditNegotiationPolicyRows(policyRows);
  const violationReason = policyViolationReason(result.extractedTerms, policy);
  if (violationReason === undefined) {
    return result;
  }

  return {
    citedSpans: result.citedSpans,
    intent: result.intent,
    reason: violationReason,
    status: "human_review"
  };
}

function policyViolationReason(
  terms: Partial<Record<Exclude<CounterField, "outOfScope">, number>>,
  policy: CreditNegotiationPolicySnapshot
): string | undefined {
  if (terms.depositPct !== undefined) {
    const depositPct = decimal(terms.depositPct);
    if (depositPct.greaterThan(policy.values.max_deposit_pct)) {
      return `Counter-offer depositPct ${depositPct.toString()} exceeds policy max_deposit_pct ${policy.values.max_deposit_pct.toString()}.`;
    }
    if (depositPct.lessThan(policy.values.min_deposit_pct)) {
      return `Counter-offer depositPct ${depositPct.toString()} is below policy min_deposit_pct ${policy.values.min_deposit_pct.toString()}.`;
    }
  }

  if (terms.releasePct !== undefined) {
    const releasePct = decimal(terms.releasePct);
    if (releasePct.greaterThan(policy.values.max_release_pct)) {
      return `Counter-offer releasePct ${releasePct.toString()} exceeds policy max_release_pct ${policy.values.max_release_pct.toString()}.`;
    }
    if (releasePct.lessThan(policy.values.min_release_pct)) {
      return `Counter-offer releasePct ${releasePct.toString()} is below policy min_release_pct ${policy.values.min_release_pct.toString()}.`;
    }
  }

  if (terms.trancheCount !== undefined && terms.trancheCount > policy.values.max_tranches) {
    return `Counter-offer trancheCount ${terms.trancheCount.toString()} exceeds policy max_tranches ${policy.values.max_tranches.toString()}.`;
  }

  if (terms.collateralRatio !== undefined) {
    const collateralRatio = decimal(terms.collateralRatio);
    if (collateralRatio.greaterThan(policy.values.max_collateral_ratio)) {
      return `Counter-offer collateralRatio ${collateralRatio.toString()} exceeds policy max_collateral_ratio ${policy.values.max_collateral_ratio.toString()}.`;
    }
  }

  if (terms.financingSpreadBps !== undefined) {
    const financingSpreadBps = decimal(terms.financingSpreadBps);
    if (financingSpreadBps.greaterThan(policy.values.max_financing_spread_bps)) {
      return `Counter-offer financingSpreadBps ${financingSpreadBps.toString()} exceeds policy max_financing_spread_bps ${policy.values.max_financing_spread_bps.toString()}.`;
    }
  }

  return undefined;
}

function extractNumericValue(field: Exclude<CounterField, "outOfScope">, text: string): number | undefined {
  switch (field) {
    case "collateralRatio":
      return firstDecimal(text);
    case "depositPct":
    case "releasePct":
      return firstPercent(text);
    case "financingSpreadBps":
    case "trancheCount":
      return firstInteger(text);
  }
}

function firstPercent(text: string): number | undefined {
  const match = /\b(\d+(?:\.\d+)?)\s*%/u.exec(text);
  return match === null ? undefined : Number.parseFloat(match[1] as string);
}

function firstInteger(text: string): number | undefined {
  const match = /\b(\d+)\b/u.exec(text);
  return match === null ? undefined : Number.parseInt(match[1] as string, 10);
}

function firstDecimal(text: string): number | undefined {
  const match = /\b(\d+(?:\.\d+)?)\b/u.exec(text);
  return match === null ? undefined : Number.parseFloat(match[1] as string);
}

function decimal(value: number): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) {
    throw new Error("Credit negotiation counter terms must be finite decimals.");
  }
  return parsed;
}
