/**
 * The scenarios an operator can send from the screen.
 *
 * Each one names a situation worth seeing rather than a configuration: the
 * money has not arrived, the payment was reversed, the customer used a code
 * nobody recognises. The point of the list is that most of them are refusals,
 * because what the system does when something is wrong is the part worth
 * demonstrating.
 *
 * REHEARSAL DATA. Every scenario cites a rehearsal-proxy receipt and none of it
 * is authoritative settlement. D-02 is unsigned.
 */

export interface TestPaymentScenario {
  id: string;
  name: string;
  /** What a person should expect to see, in their words. */
  expectation: string;
  /** Omitted when the scenario is "the money never arrived". */
  receipt?: {
    amountReceived: string;
    currency: string;
    settlementStatus: "settled" | "pending" | "reversed";
    /** Large values exercise the staleness rule. */
    observedHoursAgo: number;
  };
  line: {
    instructedAmount: string;
    claimedDeductionAmount: string;
    claimedReasonCode: string;
    claimedReasonText: string;
  };
  currency: string;
  instructedPaymentAmount: string;
}

const SHORT_PAY = {
  instructedAmount: "1000.00",
  claimedDeductionAmount: "250.00",
  claimedReasonCode: "DMG",
  claimedReasonText: "two pallets arrived damaged"
};

export const TEST_PAYMENT_SCENARIOS: TestPaymentScenario[] = [
  {
    id: "short-payment",
    name: "Short payment",
    expectation: "Completes and raises a case for the 250.00 USD shortfall",
    receipt: { amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },
    line: SHORT_PAY,
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  },
  {
    id: "paid-in-full",
    name: "Paid in full",
    expectation: "Completes with nothing deducted, so no case is raised",
    receipt: { amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },
    line: {
      instructedAmount: "1250.00",
      claimedDeductionAmount: "0.00",
      claimedReasonCode: "DMG",
      claimedReasonText: "paid in full"
    },
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  },
  {
    id: "no-receipt",
    name: "Money has not arrived",
    expectation: "Holds. The note came before the money, so nothing is applied",
    line: SHORT_PAY,
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  },
  {
    id: "not-cleared",
    name: "Payment has not cleared",
    expectation: "Holds. Money is showing but has not cleared the bank",
    receipt: { amountReceived: "1250.00", currency: "USD", settlementStatus: "pending", observedHoursAgo: 1 },
    line: SHORT_PAY,
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  },
  {
    id: "too-old",
    name: "Confirmation is stale",
    expectation: "Holds. The confirmation is older than the freshness window",
    receipt: { amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 72 },
    line: SHORT_PAY,
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  },
  {
    id: "reversed",
    name: "Payment was reversed",
    expectation: "Holds. The money came back out again",
    receipt: { amountReceived: "1250.00", currency: "USD", settlementStatus: "reversed", observedHoursAgo: 2 },
    line: SHORT_PAY,
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  },
  {
    id: "unknown-reason",
    name: "Unknown reason code",
    expectation: "Needs attention. The reason code is not one we recognise",
    receipt: { amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },
    line: {
      ...SHORT_PAY,
      claimedReasonCode: "ZZZ-UNMAPPED",
      claimedReasonText: "reason code we do not recognise"
    },
    currency: "USD",
    instructedPaymentAmount: "1250.00"
  }
];

export function findTestPaymentScenario(id: string): TestPaymentScenario | undefined {
  return TEST_PAYMENT_SCENARIOS.find((scenario) => scenario.id === id);
}

/**
 * The canonical CSV a scenario sends.
 *
 * References are unique per send. Reusing them would be read as a duplicate
 * delivery and refused, which would make the button work exactly once.
 */
export function buildScenarioCsv(scenario: TestPaymentScenario, reference: string, customer: string): string {
  const header = [
    "remittance_id", "customer_reference", "legal_entity_reference", "payment_reference",
    "currency", "instructed_payment_amount", "line_id", "invoice_reference",
    "instructed_amount", "claimed_deduction_amount", "claimed_reason_code", "claimed_reason_text"
  ].join(",");

  const row = [
    `REM-${reference}`,
    customer,
    "LE-001",
    reference,
    scenario.currency,
    scenario.instructedPaymentAmount,
    "LINE-1",
    "INV-2026-0912",
    scenario.line.instructedAmount,
    scenario.line.claimedDeductionAmount,
    scenario.line.claimedReasonCode,
    scenario.line.claimedReasonText
  ].join(",");

  return `${header}${String.fromCharCode(10)}${row}`;
}
