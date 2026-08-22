import type { CashAllocationPolicy } from "../../../config/cashAllocationPolicy.js";
import {
  satisfiesAllocationPrecondition,
  type CashReceipt
} from "../../types/cashApplication.js";

/**
 * Deterministic match core, from Technical Design 5.1.
 *
 * The core receives no provider, ERP, database client or agent object: every
 * input is a canonical value, and the approved allocation policy arrives as an
 * argument rather than being read from anywhere. An absent policy is a reportable outcome
 * (`policy_missing`), never a reason to assume a default.
 */

export interface CandidateInvoice {
  invoiceRecordId: string;
  invoiceReference: string;
  balance: string;
  currency: string;
}

export interface RemittanceAdviceLineInput {
  lineId: string;
  invoiceReference: string;
  instructedAmount: string;
  claimedDeductionAmount: string;
  claimedReasonCode?: string;
  claimedReasonTextSanitized?: string;
  sourceRecordIds: string[];
}

export interface RemittanceAdviceInput {
  remittanceId: string;
  inboundMessageId: string;
  customerReference: string;
  legalEntityReference: string;
  paymentReference: string;
  currency: string;
  instructedPaymentAmount: string;
  mapperVersion: string;
  lines: RemittanceAdviceLineInput[];
  sourceRecordIds: string[];
  provenanceMode: "live" | "replay" | "synthetic";
}

export type CashMatchReason =
  | "cash_receipt_missing"
  | "cash_receipt_unsettled"
  | "cash_receipt_stale"
  | "customer_ambiguous"
  | "legal_entity_mismatch"
  | "currency_mismatch"
  | "invoice_ambiguous"
  | "amount_mismatch"
  | "policy_missing"
  | "source_unavailable";

export type CashMatchResult =
  | {
      status: "matched";
      receiptId: string;
      invoiceRecordIds: string[];
      policyVersion: string;
      recordIds: string[];
    }
  | { status: "review" | "blocked"; reason: CashMatchReason; recordIds: string[] };

export interface MatchCashReceiptInput {
  advice: RemittanceAdviceInput;
  receipt: CashReceipt | undefined;
  invoices: CandidateInvoice[];
  policy: CashAllocationPolicy | undefined;
}

function normalizeReference(value: string): string {
  return value.trim().toLowerCase();
}

function referencesMatch(
  left: string,
  right: string,
  rule: CashAllocationPolicy["paymentReferenceMatchRule"]
): boolean {
  return rule === "exact" ? left === right : normalizeReference(left) === normalizeReference(right);
}

export function matchCashReceipt(input: MatchCashReceiptInput): CashMatchResult {
  const { advice, receipt, invoices, policy } = input;
  const adviceRecordIds = advice.sourceRecordIds;

  // Step 0. Policy is an input. Without it there is no approved rule for
  // reference matching, cardinality, ordering or FX, so no match may be claimed.
  if (policy === undefined) {
    return { status: "review", reason: "policy_missing", recordIds: adviceRecordIds };
  }

  // Step 1. Verify receipt status and freshness before anything else reads it.
  if (receipt === undefined) {
    return { status: "blocked", reason: "cash_receipt_missing", recordIds: adviceRecordIds };
  }

  const receiptRecordIds = [...adviceRecordIds, ...receipt.recordIds];

  if (receipt.settlementStatus !== "settled") {
    return { status: "blocked", reason: "cash_receipt_unsettled", recordIds: receiptRecordIds };
  }

  if (!satisfiesAllocationPrecondition(receipt)) {
    return { status: "blocked", reason: "cash_receipt_stale", recordIds: receiptRecordIds };
  }

  // Step 2. Payment reference, under the approved rule only.
  //
  // The Technical Design 4.6 reason enum has no payment_reference_mismatch arm.
  // A receipt whose payment reference does not match was not a receipt for this
  // remittance, so cash_receipt_missing is the honest reading; amount_mismatch
  // would assert something about amounts that was never compared. Raised as a
  // spec gap rather than resolved by picking a convenient label.
  if (
    !referencesMatch(advice.paymentReference, receipt.paymentReference, policy.paymentReferenceMatchRule)
  ) {
    return { status: "blocked", reason: "cash_receipt_missing", recordIds: receiptRecordIds };
  }

  // Step 3. Unique customer and legal entity.
  if (advice.customerReference !== receipt.customerReference) {
    return { status: "blocked", reason: "customer_ambiguous", recordIds: receiptRecordIds };
  }

  if (advice.legalEntityReference !== receipt.legalEntityReference) {
    return { status: "blocked", reason: "legal_entity_mismatch", recordIds: receiptRecordIds };
  }

  // Step 4. Currency and FX policy. reject_cross_currency is the only rule that
  // can be applied without an approved rate source.
  if (advice.currency !== receipt.currency) {
    return { status: "blocked", reason: "currency_mismatch", recordIds: receiptRecordIds };
  }

  const foreignInvoice = invoices.some((invoice) => invoice.currency !== receipt.currency);
  if (foreignInvoice && policy.fx === "reject_cross_currency") {
    return { status: "blocked", reason: "currency_mismatch", recordIds: receiptRecordIds };
  }

  // Step 5. Resolve invoice candidates under approved cardinality and ordering.
  const resolved: CandidateInvoice[] = [];
  for (const line of advice.lines) {
    const candidates = invoices.filter(
      (invoice) => invoice.invoiceReference === line.invoiceReference
    );

    const [candidate, ...extraCandidates] = candidates;

    if (candidate === undefined || extraCandidates.length > 0) {
      return { status: "review", reason: "invoice_ambiguous", recordIds: receiptRecordIds };
    }

    resolved.push(candidate);
  }

  if (policy.cardinality === "one_to_one" && resolved.length > 1) {
    return { status: "review", reason: "invoice_ambiguous", recordIds: receiptRecordIds };
  }

  const orderedInvoiceRecordIds = orderInvoices(resolved, policy).map(
    (invoice) => invoice.invoiceRecordId
  );

  // Step 6. Cited records travel with the result.
  return {
    status: "matched",
    receiptId: receipt.receiptId,
    invoiceRecordIds: orderedInvoiceRecordIds,
    policyVersion: policy.policyVersion,
    recordIds: receiptRecordIds
  };
}

function orderInvoices(
  invoices: CandidateInvoice[],
  policy: CashAllocationPolicy
): CandidateInvoice[] {
  if (policy.invoiceOrdering === "remittance_line_order") {
    return invoices;
  }

  if (policy.invoiceOrdering === "largest_balance_first") {
    return [...invoices].sort((left, right) => right.balance.localeCompare(left.balance));
  }

  // oldest_due_date_first needs a due date the canonical candidate does not
  // carry yet; ordering is left as received rather than guessed.
  return invoices;
}
