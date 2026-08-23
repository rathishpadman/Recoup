import type { SupabaseSyntheticSourceFetch } from "../adapters/supabaseSyntheticSource.js";
import {
  LiveDeductionCaseSchema,
  WorkflowEventSchema,
  WorkflowRunSchema,
  type LiveDeductionCase,
  type WorkflowEvent,
  type WorkflowRun
} from "../types/workflow.js";
import type { AppendEventInput, WorkflowRepository } from "./workflowRepository.js";

/**
 * Supabase-backed workflow repository.
 *
 * Implements the same port as the in-memory one, so the pipeline and the run
 * orchestrator are unchanged by the switch. Persistence lives here and nowhere
 * else.
 *
 * The append-only guarantee is enforced by the database: the runtime role holds
 * INSERT and SELECT on `recoup_workflow_events` and nothing more. This module
 * correspondingly issues no PATCH or DELETE against that table, so a mistake
 * here would be refused by Postgres rather than silently rewriting history.
 *
 * `cursor_id` is a database identity column, which is what makes the cursor
 * monotonic across runs and processes. The in-memory implementation can only
 * approximate that within a single process.
 */

export interface SupabaseWorkflowRepositoryOptions {
  url: string;
  serviceRoleKey: string;
  fetcher?: SupabaseSyntheticSourceFetch;
}

interface WorkflowEventRow {
  cursor_id: number;
  event_id: string;
  run_id: string;
  run_sequence: number;
  correlation_id: string;
  case_id: string | null;
  event_type: string;
  phase: string;
  specialist: string | null;
  status: string;
  safe_summary: string;
  record_ids: string[];
  deterministic_basis_ref: string | null;
  provenance_mode: string;
  occurred_at: string;
}

function headers(serviceRoleKey: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

/**
 * PostgREST reports failures as `{ message, code, details, hint }`. Only the
 * message is surfaced: details and hint can echo row values, which may carry
 * customer references.
 */
function readPostgrestMessage(body: string): string | undefined {
  if (body.length === 0) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(body);

    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const { message } = parsed;
      return typeof message === "string" ? message : undefined;
    }
  } catch {
    // A non-JSON body is not a PostgREST error shape; the status alone stands.
  }

  return undefined;
}

function toEvent(row: WorkflowEventRow): WorkflowEvent {
  return WorkflowEventSchema.parse({
    schemaVersion: "1",
    eventId: row.event_id,
    cursor: String(row.cursor_id),
    runSequence: row.run_sequence,
    runId: row.run_id,
    correlationId: row.correlation_id,
    ...(row.case_id === null ? {} : { caseId: row.case_id }),
    eventType: row.event_type,
    phase: row.phase,
    ...(row.specialist === null ? {} : { specialist: row.specialist }),
    status: row.status,
    safeSummary: row.safe_summary,
    recordIds: row.record_ids,
    ...(row.deterministic_basis_ref === null
      ? {}
      : { deterministicBasisRef: row.deterministic_basis_ref }),
    provenanceMode: row.provenance_mode,
    occurredAt: row.occurred_at
  });
}

export function createSupabaseWorkflowRepository(
  options: SupabaseWorkflowRepositoryOptions
): WorkflowRepository {
  const { url, serviceRoleKey, fetcher = fetch } = options;
  const rest = `${url.replace(/\/$/u, "")}/rest/v1`;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetcher(`${rest}${path}`, init);

    if (!response.ok) {
      // A bare status code makes an RLS or grant problem indistinguishable from
      // a schema one, so the PostgREST message is carried through. It describes
      // the failure and never contains the key, which is only ever sent in a
      // header.
      const detail = await response.text().catch(() => "");
      const message = readPostgrestMessage(detail);

      throw new Error(
        message === undefined
          ? `supabase request failed: ${String(response.status)}`
          : `supabase request failed: ${String(response.status)} ${message}`
      );
    }

    const text = await response.text();
    return text.length === 0 ? [] : (JSON.parse(text) as unknown);
  }

  return {
    async createRun(run: WorkflowRun) {
      const parsed = WorkflowRunSchema.parse(run);

      // The run id is deterministic, so a replay collides on the primary key.
      // merge-duplicates makes that a no-op rather than an error.
      await request("/recoup_workflow_runs", {
        method: "POST",
        headers: headers(serviceRoleKey, { Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify({
          run_id: parsed.runId,
          workflow_name: parsed.workflowName,
          workflow_version: parsed.workflowVersion,
          trigger_type: parsed.triggerType,
          trigger_record_id: parsed.triggerRecordId,
          correlation_id: parsed.correlationId,
          customer_reference: parsed.customerReference ?? null,
          state: parsed.state,
          current_phase: parsed.currentPhase,
          case_id: parsed.caseId ?? null,
          provenance_mode: parsed.provenanceMode,
          created_at: parsed.createdAt,
          updated_at: parsed.updatedAt,
          terminal_at: parsed.terminalAt ?? null
        })
      });

      return parsed;
    },

    async getRun(runId: string) {
      const rows = (await request(
        `/recoup_workflow_runs?run_id=eq.${encodeURIComponent(runId)}&select=*`,
        { method: "GET", headers: headers(serviceRoleKey) }
      )) as Record<string, unknown>[];

      const [row] = rows;
      if (row === undefined) return undefined;

      return mapRun(row);
    },

    async listRuns() {
      const rows = (await request("/recoup_workflow_runs?select=*", {
        method: "GET",
        headers: headers(serviceRoleKey)
      })) as Record<string, unknown>[];

      return rows.map(mapRun);
    },

    async updateRunState(input) {
      const patch: Record<string, unknown> = {
        state: input.state,
        current_phase: input.currentPhase,
        updated_at: new Date().toISOString()
      };

      if (input.caseId !== undefined) patch.case_id = input.caseId;
      if (input.terminalAt !== undefined) patch.terminal_at = input.terminalAt;

      await request(`/recoup_workflow_runs?run_id=eq.${encodeURIComponent(input.runId)}`, {
        method: "PATCH",
        headers: headers(serviceRoleKey),
        body: JSON.stringify(patch)
      });

      const updated = await this.getRun(input.runId);
      if (updated === undefined) {
        throw new Error(`unknown run ${input.runId}`);
      }
      return updated;
    },

    async appendEvent(input: AppendEventInput) {
      const existing = await this.listEvents(input.runId);

      // INSERT only. The runtime role has no UPDATE or DELETE on this table, so
      // an accidental rewrite is refused by the database, not just by this code.
      const rows = (await request("/recoup_workflow_events", {
        method: "POST",
        headers: headers(serviceRoleKey, { Prefer: "return=representation" }),
        body: JSON.stringify({
          event_id: input.event.eventId,
          run_id: input.runId,
          run_sequence: existing.length + 1,
          correlation_id: input.event.correlationId,
          case_id: input.event.caseId ?? null,
          event_type: input.event.eventType,
          phase: input.event.phase,
          specialist: input.event.specialist ?? null,
          status: input.event.status,
          safe_summary: input.event.safeSummary,
          record_ids: input.event.recordIds,
          deterministic_basis_ref: input.event.deterministicBasisRef ?? null,
          provenance_mode: input.event.provenanceMode,
          occurred_at: input.event.occurredAt
        })
      })) as WorkflowEventRow[];

      const [row] = rows;
      if (row === undefined) {
        throw new Error("event insert returned no row");
      }

      return toEvent(row);
    },

    async listEvents(runId: string) {
      const rows = (await request(
        `/recoup_workflow_events?run_id=eq.${encodeURIComponent(runId)}&select=*&order=cursor_id.asc`,
        { method: "GET", headers: headers(serviceRoleKey) }
      )) as WorkflowEventRow[];

      return rows.map(toEvent);
    },

    async readEventsSince(cursor: string, limit = 100) {
      const rows = (await request(
        `/recoup_workflow_events?cursor_id=gt.${encodeURIComponent(cursor)}&select=*&order=cursor_id.asc&limit=${String(limit)}`,
        { method: "GET", headers: headers(serviceRoleKey) }
      )) as WorkflowEventRow[];

      return rows.map(toEvent);
    },

    async upsertCase(liveCase: LiveDeductionCase) {
      const parsed = LiveDeductionCaseSchema.parse(liveCase);

      await request("/recoup_live_deduction_cases", {
        method: "POST",
        headers: headers(serviceRoleKey, { Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify({
          case_id: parsed.caseId,
          origin: parsed.origin,
          run_id: parsed.runId,
          customer_id: parsed.customerId,
          legal_entity_id: parsed.legalEntityId,
          invoice_record_ids: parsed.invoiceRecordIds,
          remittance_id: parsed.remittanceId,
          receipt_id: parsed.receiptId,
          allocation_id: parsed.allocationId,
          claimed_reason: parsed.claimedReason,
          validated_reason: parsed.validatedReason,
          short_payment_amount: parsed.shortPaymentAmount,
          currency: parsed.currency,
          status: parsed.status,
          policy_versions: parsed.policyVersions,
          record_ids: parsed.recordIds,
          provenance_mode: parsed.provenanceMode,
          created_at: parsed.createdAt
        })
      });

      return parsed;
    },

    async getCase(caseId: string) {
      const rows = (await request(
        `/recoup_live_deduction_cases?case_id=eq.${encodeURIComponent(caseId)}&select=*`,
        { method: "GET", headers: headers(serviceRoleKey) }
      )) as Record<string, unknown>[];

      const [row] = rows;
      return row === undefined ? undefined : mapCase(row);
    },

    async listCases() {
      const rows = (await request("/recoup_live_deduction_cases?select=*", {
        method: "GET",
        headers: headers(serviceRoleKey)
      })) as Record<string, unknown>[];

      return rows.map(mapCase);
    }
  };
}

function mapRun(row: Record<string, unknown>): WorkflowRun {
  return WorkflowRunSchema.parse({
    runId: row.run_id,
    workflowName: row.workflow_name,
    workflowVersion: row.workflow_version,
    triggerType: row.trigger_type,
    triggerRecordId: row.trigger_record_id,
    correlationId: row.correlation_id,
    state: row.state,
    currentPhase: row.current_phase,
    ...(row.customer_reference === null || row.customer_reference === undefined
      ? {}
      : { customerReference: row.customer_reference }),
    ...(row.case_id === null ? {} : { caseId: row.case_id }),
    provenanceMode: row.provenance_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.terminal_at === null ? {} : { terminalAt: row.terminal_at })
  });
}

function mapCase(row: Record<string, unknown>): LiveDeductionCase {
  return LiveDeductionCaseSchema.parse({
    caseId: row.case_id,
    origin: row.origin,
    runId: row.run_id,
    customerId: row.customer_id,
    legalEntityId: row.legal_entity_id,
    invoiceRecordIds: row.invoice_record_ids,
    remittanceId: row.remittance_id,
    receiptId: row.receipt_id,
    allocationId: row.allocation_id,
    claimedReason: row.claimed_reason,
    validatedReason: row.validated_reason,
    shortPaymentAmount: String(row.short_payment_amount),
    currency: row.currency,
    status: row.status,
    policyVersions: row.policy_versions,
    recordIds: row.record_ids,
    provenanceMode: row.provenance_mode,
    createdAt: row.created_at
  });
}
