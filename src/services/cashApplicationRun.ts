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
    caseId?: string
  ): Promise<void> => {
    await repository.appendEvent({
      runId,
      event: {
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

  await record("run_received", "intake", "started", "remittance advice accepted", advice.sourceRecordIds);
  await record("phase_started", "validate", "started", "resolving cash receipt", advice.sourceRecordIds);

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

    await record(eventType, "validate", outcome.reason, `run halted: ${outcome.reason}`, advice.sourceRecordIds);
    await repository.updateRunState({ runId, state, currentPhase: "validate" });

    return { runId, state, caseId: undefined, liveCase: undefined };
  }

  await record(
    "phase_completed",
    "allocate",
    outcome.allocation.reconciliationStatus,
    `allocated ${outcome.allocation.totalAppliedAmount} ${outcome.allocation.currency}`,
    outcome.allocation.recordIds
  );

  // A deduction only becomes a case when a validated reason supports it.
  // Everything else stays a reviewable allocation without a Forensics handoff.
  if (outcome.validatedReason.status !== "validated") {
    await record(
      "phase_blocked",
      "reason",
      outcome.validatedReason.reason,
      `reason not validated: ${outcome.validatedReason.reason}`,
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

  await repository.upsertCase(liveCase);
  await record("case_created", "case", "created", "live deduction case created", liveCase.recordIds, caseId);
  await record("maya_ready", "handoff", "ready", "case ready for Forensics", liveCase.recordIds, caseId);
  await repository.updateRunState({
    runId,
    state: "Ready",
    currentPhase: "handoff",
    caseId,
    terminalAt: now().toISOString()
  });

  return { runId, state: "Ready", caseId, liveCase };
}
