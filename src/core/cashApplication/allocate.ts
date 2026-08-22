import { Decimal } from "decimal.js";

import type { CashAllocationPolicy } from "../../../config/cashAllocationPolicy.js";
import {
  decimalToMoneyString,
  type CashReceipt,
  type CurrencyScalePolicy
} from "../../types/cashApplication.js";
import type { CandidateInvoice, RemittanceAdviceInput } from "./match.js";

/**
 * Deterministic allocation core, from Technical Design 5.2.
 *
 * Every monetary operand is a Decimal, and the single formatter applies scale
 * and rounding from policy once, at the boundary. The function returns an
 * immutable allocation receipt: it does not write to any ERP and does not
 * represent a posting.
 *
 * Two identities hold on every allocated result:
 *
 *   receipt amount = total applied + total explicit deduction + total unapplied
 *   invoice balance before = applied + explicit deduction + balance after
 */

export interface CashAllocationLine {
  allocationLineId: string;
  remittanceLineId: string;
  invoiceRecordId: string;
  invoiceBalanceBefore: string;
  appliedAmount: string;
  explicitDeductionAmount: string;
  invoiceBalanceAfterInternalAllocation: string;
  recordIds: string[];
}

export interface CashAllocationReceipt {
  allocationId: string;
  receiptId: string;
  remittanceId: string;
  currency: string;
  receiptAmount: string;
  totalAppliedAmount: string;
  totalDeductionAmount: string;
  totalUnappliedAmount: string;
  reconciliationStatus: "balanced" | "imbalanced";
  policyVersion: string;
  calculationVersion: string;
  lines: CashAllocationLine[];
  recordIds: string[];
}

export type AllocateCashReceiptResult =
  | { status: "allocated"; receipt: CashAllocationReceipt }
  | { status: "contract_gap"; reason: string };

export interface AllocateCashReceiptInput {
  advice: RemittanceAdviceInput;
  receipt: CashReceipt;
  invoices: CandidateInvoice[];
  policy: CashAllocationPolicy | undefined;
}

function contractGap(reason: string): AllocateCashReceiptResult {
  return { status: "contract_gap", reason };
}

export function allocateCashReceipt(
  input: AllocateCashReceiptInput
): AllocateCashReceiptResult {
  const { advice, receipt, invoices, policy } = input;

  // Missing policy returns Contract gap. It does not default to zero or a
  // hard-coded tolerance.
  if (policy === undefined) {
    return contractGap("no approved allocation policy");
  }

  const scale: CurrencyScalePolicy = {
    currencyScale: policy.currencyScale,
    rounding: policy.rounding
  };

  const invoiceByReference = new Map(
    invoices.map((invoice) => [invoice.invoiceReference, invoice])
  );

  const lines: CashAllocationLine[] = [];
  let totalApplied = new Decimal(0);
  let totalDeduction = new Decimal(0);
  const citedRecordIds = new Set<string>([...advice.sourceRecordIds, ...receipt.recordIds]);

  for (const line of advice.lines) {
    const invoice = invoiceByReference.get(line.invoiceReference);

    if (invoice === undefined) {
      return contractGap(`no candidate invoice for reference ${line.invoiceReference}`);
    }

    if (invoice.currency !== receipt.currency && policy.fx === "reject_cross_currency") {
      return contractGap("no approved FX policy for a cross-currency allocation");
    }

    const balanceBefore = new Decimal(invoice.balance);
    const applied = new Decimal(line.instructedAmount);
    const deduction = new Decimal(line.claimedDeductionAmount);

    // The per-invoice identity defines the remaining balance, so it holds by
    // construction rather than being asserted afterwards.
    const balanceAfter = balanceBefore.minus(applied).minus(deduction);

    totalApplied = totalApplied.plus(applied);
    totalDeduction = totalDeduction.plus(deduction);

    for (const recordId of line.sourceRecordIds) {
      citedRecordIds.add(recordId);
    }
    citedRecordIds.add(invoice.invoiceRecordId);

    lines.push({
      allocationLineId: `ALLOC-${advice.remittanceId}-${line.lineId}`,
      remittanceLineId: line.lineId,
      invoiceRecordId: invoice.invoiceRecordId,
      invoiceBalanceBefore: decimalToMoneyString(balanceBefore, scale),
      appliedAmount: decimalToMoneyString(applied, scale),
      explicitDeductionAmount: decimalToMoneyString(deduction, scale),
      invoiceBalanceAfterInternalAllocation: decimalToMoneyString(balanceAfter, scale),
      recordIds: [...line.sourceRecordIds, invoice.invoiceRecordId]
    });
  }

  if (lines.length === 0) {
    return contractGap("remittance advice carried no allocatable line");
  }

  const receiptAmount = new Decimal(receipt.amountReceived);

  // Unapplied is the remainder of the receipt identity, so the identity holds
  // by construction and the interesting question is whether the remainder is
  // acceptable under policy.
  const unapplied = receiptAmount.minus(totalApplied).minus(totalDeduction);
  const tolerance = new Decimal(policy.amountTolerance);

  const reconciliationStatus = classifyReconciliation({ unapplied, tolerance, policy });

  return {
    status: "allocated",
    receipt: {
      allocationId: `ALLOC-${advice.remittanceId}-${receipt.receiptId}`,
      receiptId: receipt.receiptId,
      remittanceId: advice.remittanceId,
      currency: receipt.currency,
      receiptAmount: decimalToMoneyString(receiptAmount, scale),
      totalAppliedAmount: decimalToMoneyString(totalApplied, scale),
      totalDeductionAmount: decimalToMoneyString(totalDeduction, scale),
      totalUnappliedAmount: decimalToMoneyString(unapplied, scale),
      reconciliationStatus,
      policyVersion: policy.policyVersion,
      calculationVersion: policy.calculationVersion,
      lines,
      recordIds: [...citedRecordIds]
    }
  };
}

function classifyReconciliation(input: {
  unapplied: Decimal;
  tolerance: Decimal;
  policy: CashAllocationPolicy;
}): "balanced" | "imbalanced" {
  const { unapplied, tolerance, policy } = input;

  // The remittance claimed more than the receipt actually carried. Nothing in
  // policy can make that balanced.
  if (unapplied.isNegative()) {
    return "imbalanced";
  }

  if (unapplied.lessThanOrEqualTo(tolerance)) {
    return "balanced";
  }

  // Money left over beyond tolerance is an overpayment, and only an approved
  // unapplied-credit treatment may absorb it without a human.
  return policy.overpayment === "unapplied_credit" ? "balanced" : "imbalanced";
}
