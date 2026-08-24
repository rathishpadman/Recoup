import { Decimal } from "decimal.js";

import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import type { CashReceiptSource } from "../adapters/cashReceipt.js";
import type { CandidateInvoice, RemittanceAdviceInput } from "../core/cashApplication/match.js";
import {
  LiveDeductionCaseSchema,
  deriveCaseCommandKey,
  deriveRunCommandKey,
  type LiveDeductionCase,
  type WorkflowEventType
} from "../types/workflow.js";
import { runCashApplication } from "./cashApplicationPipeline.js";
import type { WorkflowRepository } from "./workflowRepository.js";

/**
 * Durable cash application run.
 *
 * The pipeline computes; this module records. Every phase transition writes an
 * append-only event before the run row moves, so the history explains the
 * projection rather than the other way round, and a rebuilt projection cannot
 * disagree with what happened.
 *
 * A run reaching Ready creates one LiveDeductionCase. Its identity is derived
 * from allocation, remittance line and validated reason, so replaying the same
 * inbound message reproduces the same case instead of creating a second one.
 */

export interface StartCashApplicationRunInput {
  advice: RemittanceAdviceInput;
  invoices: CandidateInvoice[];
  env: RuntimeEnv;
  repository: WorkflowRepository;
  source?: CashReceiptSource;
  now?: () => Date;
}

export interface CashApplicationRunOutcome {
  runId: string;
  state: string;
  caseId: string | undefined;
  liveCase: LiveDeductionCase | undefined;
}

const TRIGGER_BY_PROVENANCE = {
  live: "live_email",
  replay: "replay_email",
  synthetic: "synthetic_email"
} as const;


/** The first invoice an allocation touched, for the activity trail. */
function firstAllocatedInvoice(allocation: { lines: { invoiceRecordId: string }[] }): string {
  return allocation.lines[0]?.invoiceRecordId ?? "the invoice";
}

/**
 * Why a run is holding, said in terms of the money rather than the state
 * machine. "run halted: awaiting_receipt" tells a reviewer nothing about their
 * payment; the reason code is still on the event for anyone who needs it.
 */
function holdSummary(status: string, reason: string): string {
  if (status === "awaiting_receipt") {
    return "Waiting: the money has not been confirmed as received yet";
  }

  if (reason.includes("currency") || reason.includes("fx")) {
    return "Stopped: paid in a different currency and no approved conversion exists";
  }

  return `Stopped: ${reason.replace(/_/gu, " ")}`;
}

/**
 * What a refusal says on the screen.
 *
 * Written for the person who has to do something about it, and derived only
 * from the reason code. The diagnostic detail can quote the filename or the
 * scanner verdict; this cannot, because the attachment was refused before
 * anything read it and nothing from inside it has been cleared for display.
 */
const REFUSAL_SUMMARY: Record<string, string> = {
  attachment_unsupported: "Stopped: the attached file is not in a format we accept",
  attachment_unsafe: "Stopped: the attachment failed a security check",
  attachment_quarantined: "Stopped: the attachment was quarantined by the security check",
  scan_unavailable: "Stopped: the security check could not run, so the file was not opened",
  mapping_failed: "Stopped: the file was accepted but could not be read as a payment note"
};

/**
 * Whether a refusal is work for a person or just a request we declined.
 *
 * The difference matters more than it looks. A customer email whose
 * attachment could not be processed is a real payment note that somebody
 * needs to see. A request with a bad signature, addressed to the wrong
 * mailbox, or replayed is not — it may not be from a customer at all.
 * Opening a run for those would let anyone who can reach the endpoint fill
 * the operations board with rows, turning a safety feature into a way to
 * bury real work.
 *
 * The list is therefore exactly the content family: the file arrived, and we
 * could not use it.
 */
export function refusalNeedsAPerson(reason: string): boolean {
  return Object.hasOwn(REFUSAL_SUMMARY, reason);
}

export interface RecordRefusedIntakeInput {
  repository: WorkflowRepository;
  /** The inbound message, so a retry of the same email reuses its run. */
  messageId: string;
  reason: string;
  /**
   * Diagnostic, for the caller’s own logs. Deliberately not persisted: the
   * ledger renders the event status, and this string is allowed to quote the
   * filename or the scanner verdict, so storing it puts unscanned content one
   * render away from the screen.
   */
  detail?: string;
  provenanceMode: RemittanceAdviceInput["provenanceMode"];
  now?: () => Date;
}

/**
 * AC-05: a refused payment note enters Review with a visible safe blocker.
 *
 * It used to enter nothing. Intake refused the file, the caller received a
 * 422 and the operations screen showed no trace, so a customer’s note could
 * be turned away with nobody aware it had arrived. Safe, and invisible;
 * invisible is the half that fails the requirement.
 *
 * The run carries no allocation, case or handoff. Nothing was parsed, so
 * there is nothing to say about the contents beyond the fact of the refusal.
 */
export async function recordRefusedIntake(
  input: RecordRefusedIntakeInput
): Promise<CashApplicationRunOutcome> {
  const { repository, messageId, reason, provenanceMode } = input;
  const now = input.now ?? (() => new Date());
  const timestamp = now().toISOString();

  // Same identity rule as an accepted run, so re-delivering one bad email
  // updates its run instead of stacking a second row for the same message.
  const runId = `RUN-${deriveRunCommandKey(messageId).slice(0, 16)}`;
  const correlationId = `COR-${messageId}`;

  await repository.createRun({
    runId,
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: TRIGGER_BY_PROVENANCE[provenanceMode],
    triggerRecordId: messageId,
    correlationId,
    state: "Received",
    currentPhase: "intake",
    provenanceMode,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  await repository.appendEvent({
    runId,
    event: {
      specialist: "cash_application",
      eventId: `EVT-${runId}-refused-intake`,
      runId,
      correlationId,
      eventType: "phase_blocked",
      phase: "intake",
      // A safe enum. Never the attachment, its name or its contents.
      status: reason,
      safeSummary: REFUSAL_SUMMARY[reason] ?? "Stopped: the payment note could not be accepted",
      recordIds: [messageId],
      provenanceMode,
      occurredAt: timestamp
    }
  });

  await repository.updateRunState({ runId, state: "Review", currentPhase: "intake" });

  return { runId, state: "Review", caseId: undefined, liveCase: undefined };
}
export async function startCashApplicationRun(
  input: StartCashApplicationRunInput
): Promise<CashApplicationRunOutcome> {
  const { advice, invoices, env, repository } = input;
  const now = input.now ?? (() => new Date());
  const timestamp = now().toISOString();

  // Deterministic run identity: the same inbound message resolves to the same
  // run rather than starting a second one.
  const runId = `RUN-${deriveRunCommandKey(advice.inboundMessageId).slice(0, 16)}`;
  const correlationId = `COR-${advice.remittanceId}`;

  await repository.createRun({
    runId,
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: TRIGGER_BY_PROVENANCE[advice.provenanceMode],
    triggerRecordId: advice.inboundMessageId,
    correlationId,
    state: "Received",
    currentPhase: "intake",
    customerReference: advice.customerReference,
    provenanceMode: advice.provenanceMode,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  const record = async (
    eventType: WorkflowEventType,
    phase: string,
    status: string,
    safeSummary: string,
    recordIds: string[],
    caseId?: string,
    /** Who did the work. Unwritten, the projection has to guess, and it guessed. */
    specialist: string = "cash_application"
  ): Promise<void> => {
    await repository.appendEvent({
      runId,
      event: {
        specialist,
        eventId: `EVT-${runId}-${eventType}-${phase}`,
        runId,
        correlationId,
        ...(caseId === undefined ? {} : { caseId }),
        eventType,
        phase,
        status,
        safeSummary,
        recordIds,
        provenanceMode: advice.provenanceMode,
        occurredAt: now().toISOString()
      }
    });
  };

  await record(
    "run_received",
    "intake",
    "started",
    `Payment note received from ${advice.customerReference}`,
    advice.sourceRecordIds
  );
  await record(
    "phase_started",
    "validate",
    "started",
    "Checking whether the money reached the bank",
    advice.sourceRecordIds
  );

  /**
   * Past this point the run is committed and a failure has to be recorded.
   *
   * A write that throws after intake — a missing column, a foreign key, a
   * refused grant — used to leave the row at Received with no terminal event.
   * The caller reported the failure and the operations screen counted the run
   * as Queued forever: work that looks pending and never moves. That is the
   * stranding definition of done 2 forbids.
   *
   * The error is recorded and then rethrown: the operator sees blocked work,
   * and the caller still learns the run failed.
   */
  try {
    return await completeCashApplicationRun({ advice, invoices, env, repository, runId, record, now, ...(input.source === undefined ? {} : { source: input.source }) });
  } catch (error) {
    await record(
      "error",
      "validate",
      "run_failed",
      "Stopped before finishing and needs a person",
      advice.sourceRecordIds
    );
    await repository.updateRunState({ runId, state: "Review", currentPhase: "validate" });

    throw error;
  }
}

interface CompleteRunInput {
  advice: RemittanceAdviceInput;
  invoices: CandidateInvoice[];
  env: RuntimeEnv;
  repository: WorkflowRepository;
  runId: string;
  record: (
    eventType: WorkflowEventType,
    phase: string,
    status: string,
    safeSummary: string,
    recordIds: string[],
    caseId?: string
  ) => Promise<void>;
  now: () => Date;
  source?: CashReceiptSource;
}

async function completeCashApplicationRun(input: CompleteRunInput): Promise<CashApplicationRunOutcome> {
  const { advice, invoices, env, repository, runId, record, now } = input;

  const outcome = await runCashApplication({
    advice,
    invoices,
    env,
    ...(input.source === undefined ? {} : { source: input.source })
  });

  if (outcome.status !== "allocated") {
    // A run that cannot reach an allocation stops in a visible waiting or
    // blocked state. It never silently ends and never produces a case.
    const state = outcome.status === "awaiting_receipt" ? "AwaitingCashReceipt" : "Review";
    const eventType: WorkflowEventType =
      outcome.status === "awaiting_receipt" ? "phase_waiting" : "phase_blocked";

    await record(eventType, "validate", outcome.reason, holdSummary(outcome.status, outcome.reason), advice.sourceRecordIds);
    await repository.updateRunState({ runId, state, currentPhase: "validate" });

    return { runId, state, caseId: undefined, liveCase: undefined };
  }

  await record(
    "phase_completed",
    "allocate",
    outcome.allocation.reconciliationStatus,
    `Applied ${outcome.allocation.totalAppliedAmount} ${outcome.allocation.currency} to ${firstAllocatedInvoice(outcome.allocation)}`,
    outcome.allocation.recordIds
  );

  /**
   * AC-02: a payment that balances the invoice creates no deduction, no
   * Forensics run and no Maya item.
   *
   * The gate below only asks whether the reason code validated, and a reason
   * validates just as well when the amount behind it is zero — which is how a
   * fully-paid remittance raised a case for 0.00 in production. The check
   * belongs above that gate rather than inside it, because the spec is
   * explicit that full payment creates no deduction regardless of the reason
   * the customer claimed.
   *
   * The run still succeeds. Nothing was withheld, so there is nothing to
   * investigate and nothing to chase.
   */
  if (new Decimal(outcome.allocation.totalDeductionAmount).isZero()) {
    await record(
      "run_completed",
      "allocate",
      outcome.allocation.reconciliationStatus,
      "Paid in full — nothing was deducted, so there is no case to raise",
      outcome.allocation.recordIds
    );
    await repository.insertAllocation(outcome.allocation);
    await repository.updateRunState({
      runId,
      state: "Ready",
      currentPhase: "allocate",
      terminalAt: now().toISOString()
    });

    return { runId, state: "Ready", caseId: undefined, liveCase: undefined };
  }
  // A deduction only becomes a case when a validated reason supports it.
  // Everything else stays a reviewable allocation without a Forensics handoff.
  if (outcome.validatedReason.status !== "validated") {
    await record(
      "phase_blocked",
      "reason",
      outcome.validatedReason.reason,
      // The code itself is the event status, which the ledger already shows.
      "Stopped: the customer’s reason code could not be recognised",
      outcome.allocation.recordIds
    );
    await repository.updateRunState({ runId, state: "ReasonReview", currentPhase: "reason" });

    return { runId, state: "ReasonReview", caseId: undefined, liveCase: undefined };
  }

  const [firstLine] = outcome.allocation.lines;

  if (firstLine === undefined) {
    await repository.updateRunState({ runId, state: "Review", currentPhase: "allocate" });
    return { runId, state: "Review", caseId: undefined, liveCase: undefined };
  }

  const caseId = `CASE-${deriveCaseCommandKey(
    outcome.allocation.allocationId,
    firstLine.remittanceLineId,
    outcome.validatedReason.validatedReason
  ).slice(0, 16)}`;

  const liveCase = LiveDeductionCaseSchema.parse({
    caseId,
    origin: "live_cash_application",
    runId,
    customerId: advice.customerReference,
    legalEntityId: advice.legalEntityReference,
    invoiceRecordIds: outcome.allocation.lines.map((line) => line.invoiceRecordId),
    remittanceId: advice.remittanceId,
    receiptId: outcome.receipt.receiptId,
    allocationId: outcome.allocation.allocationId,
    claimedReason: outcome.validatedReason.claimedReason,
    validatedReason: outcome.validatedReason.validatedReason,
    shortPaymentAmount: outcome.allocation.totalDeductionAmount,
    currency: outcome.allocation.currency,
    status: "Ready",
    policyVersions: {
      allocation: outcome.allocation.policyVersion,
      calculation: outcome.allocation.calculationVersion,
      reason: outcome.validatedReason.policyVersion
    },
    recordIds: outcome.allocation.recordIds,
    provenanceMode: advice.provenanceMode,
    createdAt: now().toISOString()
  });

  // Before the case, which references it by foreign key.
  await repository.insertAllocation(outcome.allocation);
  await repository.upsertCase(liveCase);

  await record(
    "case_created",
    "case",
    "created",
    `Raised a case for the ${liveCase.shortPaymentAmount} ${liveCase.currency} shortfall`,
    liveCase.recordIds,
    caseId
  );
  await record(
    "maya_ready",
    "handoff",
    "ready",
    "Passed to Deduction Forensics to investigate",
    liveCase.recordIds,
    caseId
  );
  await repository.updateRunState({
    runId,
    state: "Ready",
    currentPhase: "handoff",
    caseId,
    terminalAt: now().toISOString()
  });

  return { runId, state: "Ready", caseId, liveCase };
}
