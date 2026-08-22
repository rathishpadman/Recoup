import type { CashAllocationReceipt } from "../core/cashApplication/allocate.js";
import type { LiveDeductionCase, WorkflowEvent, WorkflowRun } from "../types/workflow.js";

/**
 * Live-case read model for Maya and Agent Operations.
 *
 * The projection is derived entirely from the durable event log and the case
 * row. Nothing is computed here that the backend did not already decide, and no
 * money is recalculated: amounts are carried through as the formatted strings
 * the allocation produced, so the cockpit cannot disagree with the receipt.
 *
 * Live cases are a separate surface from the S1-S8 gold set. This model has no
 * scenario id, reads no gold storage and changes no gold total.
 */

export interface LiveCaseSummary {
  caseId: string;
  runId: string;
  origin: "live_cash_application";
  customerId: string;
  shortPaymentAmount: string;
  currency: string;
  validatedReason: "DEP";
  status: string;
  provenanceMode: LiveDeductionCase["provenanceMode"];
  /** True whenever the cited receipt did not come from an authoritative source. */
  rehearsalOnly: boolean;
  citedRecordCount: number;
  createdAt: string;
}

export interface AgentOperationsRow {
  runId: string;
  specialist: string;
  state: string;
  phase: string;
  lastEventType: WorkflowEvent["eventType"];
  lastEventAt: string;
  caseId: string | undefined;
  provenanceMode: WorkflowRun["provenanceMode"];
  blocked: boolean;
}

const NON_AUTHORITATIVE_SOURCE_MARKERS = ["rehearsal", "synthetic", "demo"];

export function isRehearsalOnly(receiptSourceSystem: string): boolean {
  const lower = receiptSourceSystem.toLowerCase();
  return NON_AUTHORITATIVE_SOURCE_MARKERS.some((marker) => lower.includes(marker));
}

export function projectLiveCase(input: {
  liveCase: LiveDeductionCase;
  receiptSourceSystem: string;
}): LiveCaseSummary {
  const { liveCase, receiptSourceSystem } = input;

  return {
    caseId: liveCase.caseId,
    runId: liveCase.runId,
    origin: liveCase.origin,
    customerId: liveCase.customerId,
    // Carried through, never recomputed. The cockpit performs no arithmetic.
    shortPaymentAmount: liveCase.shortPaymentAmount,
    currency: liveCase.currency,
    validatedReason: liveCase.validatedReason,
    status: liveCase.status,
    provenanceMode: liveCase.provenanceMode,
    rehearsalOnly: isRehearsalOnly(receiptSourceSystem),
    citedRecordCount: liveCase.recordIds.length,
    createdAt: liveCase.createdAt
  };
}

const BLOCKING_EVENT_TYPES = new Set<WorkflowEvent["eventType"]>([
  "phase_blocked",
  "error",
  "run_cancelled"
]);

/**
 * Agent Operations rows are derived from events, never from an agent asserting
 * its own status. A specialist that crashed without emitting an event shows its
 * last real event rather than a hopeful "running".
 */
export function projectAgentOperations(input: {
  run: WorkflowRun;
  events: WorkflowEvent[];
}): AgentOperationsRow | undefined {
  const { run, events } = input;
  const runEvents = events.filter((event) => event.runId === run.runId);
  const last = runEvents.at(-1);

  if (last === undefined) {
    return undefined;
  }

  return {
    runId: run.runId,
    specialist: last.specialist ?? "cash_application",
    state: run.state,
    phase: run.currentPhase,
    lastEventType: last.eventType,
    lastEventAt: last.occurredAt,
    caseId: run.caseId,
    provenanceMode: run.provenanceMode,
    blocked: BLOCKING_EVENT_TYPES.has(last.eventType)
  };
}

export function projectAllocationForDisplay(allocation: CashAllocationReceipt): {
  allocationId: string;
  applied: string;
  deduction: string;
  unapplied: string;
  reconciliationStatus: string;
  policyVersion: string;
  assumedPolicy: boolean;
} {
  return {
    allocationId: allocation.allocationId,
    applied: allocation.totalAppliedAmount,
    deduction: allocation.totalDeductionAmount,
    unapplied: allocation.totalUnappliedAmount,
    reconciliationStatus: allocation.reconciliationStatus,
    policyVersion: allocation.policyVersion,
    // Surfaced so a reviewer sees the caveat next to the number, not in a doc.
    assumedPolicy: allocation.policyVersion.includes("ASSUMED")
  };
}
