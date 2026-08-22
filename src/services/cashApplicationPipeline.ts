import { loadApprovedAllocationPolicy } from "../../config/cashAllocationPolicy.js";
import { loadApprovedReasonMap } from "../../config/cashReasonMap.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import { createRehearsalCashReceiptSource } from "../adapters/rehearsalCashReceipt.js";
import type { CashReceiptSource } from "../adapters/cashReceipt.js";
import {
  allocateCashReceipt,
  type CashAllocationReceipt
} from "../core/cashApplication/allocate.js";
import {
  matchCashReceipt,
  type CandidateInvoice,
  type CashMatchReason,
  type RemittanceAdviceInput
} from "../core/cashApplication/match.js";
import {
  validateClaimedReason,
  type ValidatedReasonResult
} from "../core/cashApplication/reason.js";
import type { CashReceipt } from "../types/cashApplication.js";

/**
 * Cash application service seam.
 *
 * The service resolves the receipt source and the approved policy, then hands
 * canonical values to the deterministic core. The core stays free of every
 * infrastructure object; this module is the only place the two meet.
 *
 * Under the deferred-live-slice election the only available source is the
 * rehearsal proxy, so a run that reaches `allocated` is a rehearsal outcome and
 * says nothing about live cash. `provenanceMode` travels with the result so no
 * caller has to infer that.
 */

export type CashApplicationOutcome =
  | {
      status: "allocated";
      receipt: CashReceipt;
      allocation: CashAllocationReceipt;
      validatedReason: ValidatedReasonResult;
      provenanceMode: RemittanceAdviceInput["provenanceMode"];
    }
  | {
      status: "awaiting_receipt" | "review" | "blocked" | "contract_gap";
      reason: string;
      provenanceMode: RemittanceAdviceInput["provenanceMode"];
    };

export interface RunCashApplicationInput {
  advice: RemittanceAdviceInput;
  invoices: CandidateInvoice[];
  env: RuntimeEnv;
  source?: CashReceiptSource;
}

export async function runCashApplication(
  input: RunCashApplicationInput
): Promise<CashApplicationOutcome> {
  const { advice, invoices, env } = input;
  const provenanceMode = advice.provenanceMode;
  const source = input.source ?? createRehearsalCashReceiptSource({ env });

  const lookup = await source.findReceipt({
    customerReference: advice.customerReference,
    legalEntityReference: advice.legalEntityReference,
    paymentReference: advice.paymentReference,
    instructedAmount: advice.instructedPaymentAmount,
    currency: advice.currency,
    asOf: new Date().toISOString()
  });

  // Anything short of a settled arm leaves the run waiting on a receipt. A
  // source outage and a genuine miss are both reported, and neither becomes an
  // allocation.
  if (lookup.status !== "settled") {
    return {
      status: "awaiting_receipt",
      reason: lookup.status,
      provenanceMode
    };
  }

  const receipt = lookup.receipt;
  const policy = loadApprovedAllocationPolicy(env);

  const match = matchCashReceipt({ advice, receipt, invoices, policy });

  if (match.status !== "matched") {
    return {
      status: match.status,
      reason: describeMatchReason(match.reason),
      provenanceMode
    };
  }

  const allocation = allocateCashReceipt({ advice, receipt, invoices, policy });

  if (allocation.status !== "allocated") {
    return { status: "contract_gap", reason: allocation.reason, provenanceMode };
  }

  // Reason validation informs routing but does not gate the allocation: the
  // money is already accounted for, and an unclassified reason is a question
  // about why the customer deducted, not about whether the cash arrived.
  const validatedReason = validateClaimedReason({
    claimedReasonCode: firstClaimedReasonCode(advice),
    claimedReasonTextSanitized: firstClaimedReasonText(advice),
    reasonMap: loadApprovedReasonMap(env),
    recordIds: allocation.receipt.recordIds
  });

  return {
    status: "allocated",
    receipt,
    allocation: allocation.receipt,
    validatedReason,
    provenanceMode
  };
}

function firstClaimedReasonCode(advice: RemittanceAdviceInput): string | undefined {
  return advice.lines.find((line) => line.claimedReasonCode !== undefined)?.claimedReasonCode;
}

function firstClaimedReasonText(advice: RemittanceAdviceInput): string | undefined {
  return advice.lines.find((line) => line.claimedReasonTextSanitized !== undefined)
    ?.claimedReasonTextSanitized;
}

function describeMatchReason(reason: CashMatchReason): string {
  return reason;
}
