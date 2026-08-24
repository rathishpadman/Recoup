import {
  WorkflowEventSchema,
  WorkflowRunSchema,
  type LiveDeductionCase,
  type WorkflowEvent,
  type WorkflowRun
} from "../types/workflow.js";
import type { CashAllocationReceipt } from "../core/cashApplication/allocate.js";

/**
 * Workflow repository port and an in-memory implementation.
 *
 * The event log is append-only: there is no update or delete on the port, so a
 * caller has no way to rewrite history even by mistake. The run row is a
 * projection that may be replaced, which is the split Technical Design 7.2
 * describes between the coordination record and the event history.
 *
 * Persistence to Supabase is Phase 2 and needs D-10. This implementation gives
 * the pipeline somewhere real to write in the meantime, and the port is what a
 * database-backed version will implement.
 */

export interface AppendEventInput {
  runId: string;
  event: Omit<WorkflowEvent, "cursor" | "runSequence" | "schemaVersion">;
}

/**
 * One deduction waiting for a person, in the shape the work list reads.
 *
 * Money stays a string end to end. The column behind it is numeric, and the
 * last time a numeric column was read without casting, 250.00 arrived as 250.
 */
export interface DeductionClaim {
  claimId: string;
  lineId: string;
  customerId: string;
  invoiceRef: string;
  claimAmount: string;
  reasonCode: string;
  remittanceEvidenceId: string;
  recordIds: string[];
  createdAt: string;
  /** Never set from a live run: a scenario id on a live surface is banned. */
  goldScenarioId?: string;
}
export interface WorkflowRepository {
  createRun(run: WorkflowRun): Promise<WorkflowRun>;
  getRun(runId: string): Promise<WorkflowRun | undefined>;
  /**
   * Every run, including one that has emitted no event yet. Without this a
   * run that was accepted but has not started is invisible to the operations
   * view, and accepted work silently disappearing is worse than showing it
   * as queued.
   */
  listRuns(): Promise<WorkflowRun[]>;
  updateRunState(input: {
    runId: string;
    state: string;
    currentPhase: string;
    caseId?: string;
    terminalAt?: string;
  }): Promise<WorkflowRun>;
  appendEvent(input: AppendEventInput): Promise<WorkflowEvent>;
  listEvents(runId: string): Promise<WorkflowEvent[]>;
  readEventsSince(cursor: string, limit?: number): Promise<WorkflowEvent[]>;
  /**
   * Append-only: a live case carries a foreign key to its allocation, so the
   * allocation must exist before the case does.
   */
  insertAllocation(allocation: CashAllocationReceipt): Promise<CashAllocationReceipt>;
  listAllocations(): Promise<CashAllocationReceipt[]>;
  upsertCase(liveCase: LiveDeductionCase): Promise<LiveDeductionCase>;
  getCase(caseId: string): Promise<LiveDeductionCase | undefined>;
  listCases(): Promise<LiveDeductionCase[]>;
  /**
   * The handover a person actually sees. A case alone reaches only the
   * operations screen; the deduction work list is built from claims, so a run
   * that wrote no claim announced a handover that never happened.
   */
  insertDeductionClaim(claim: DeductionClaim): Promise<DeductionClaim>;
  listDeductionClaims(): Promise<DeductionClaim[]>;
}

export function createInMemoryWorkflowRepository(options?: {
  now?: () => Date;
}): WorkflowRepository {
  const now = options?.now ?? (() => new Date());
  const runs = new Map<string, WorkflowRun>();
  const events: WorkflowEvent[] = [];
  const allocations = new Map<string, CashAllocationReceipt>();
  const cases = new Map<string, LiveDeductionCase>();
  const claims = new Map<string, DeductionClaim>();
  let cursor = 0;

  function runSequenceFor(runId: string): number {
    return events.filter((event) => event.runId === runId).length + 1;
  }

  return {
    createRun(run) {
      const parsed = WorkflowRunSchema.parse(run);
      if (runs.has(parsed.runId)) {
        // The run command key is deterministic, so a replay reaches here rather
        // than creating a second run for the same inbox item.
        return Promise.resolve(runs.get(parsed.runId) as WorkflowRun);
      }
      runs.set(parsed.runId, parsed);
      return Promise.resolve(parsed);
    },

    getRun(runId) {
      return Promise.resolve(runs.get(runId));
    },

    updateRunState(input) {
      const existing = runs.get(input.runId);
      if (existing === undefined) {
        return Promise.reject(new Error(`unknown run ${input.runId}`));
      }

      const updated = WorkflowRunSchema.parse({
        ...existing,
        state: input.state,
        currentPhase: input.currentPhase,
        ...(input.caseId === undefined ? {} : { caseId: input.caseId }),
        ...(input.terminalAt === undefined ? {} : { terminalAt: input.terminalAt }),
        updatedAt: now().toISOString()
      });

      runs.set(updated.runId, updated);
      return Promise.resolve(updated);
    },

    appendEvent(input) {
      cursor += 1;
      const event = WorkflowEventSchema.parse({
        ...input.event,
        schemaVersion: "1",
        cursor: String(cursor),
        runSequence: runSequenceFor(input.runId),
        runId: input.runId
      });
      events.push(event);
      return Promise.resolve(event);
    },

    listEvents(runId) {
      return Promise.resolve(events.filter((event) => event.runId === runId));
    },

    readEventsSince(fromCursor, limit = 100) {
      const after = Number(fromCursor);
      return Promise.resolve(
        events.filter((event) => Number(event.cursor) > after).slice(0, limit)
      );
    },

    insertAllocation(allocation) {
      allocations.set(allocation.allocationId, allocation);
      return Promise.resolve(allocation);
    },

    listAllocations() {
      return Promise.resolve([...allocations.values()]);
    },

    upsertCase(liveCase) {
      // The case command key is derived from allocation, line and reason, so an
      // idempotent replay overwrites the same row rather than adding a case.
      cases.set(liveCase.caseId, liveCase);
      return Promise.resolve(liveCase);
    },

    getCase(caseId) {
      return Promise.resolve(cases.get(caseId));
    },

    listRuns() {
      return Promise.resolve([...runs.values()]);
    },

    listCases() {
      return Promise.resolve([...cases.values()]);
    },

    insertDeductionClaim(claim) {
      claims.set(claim.claimId, claim);
      return Promise.resolve(claim);
    },

    listDeductionClaims() {
      return Promise.resolve([...claims.values()]);
    }
  };
}
