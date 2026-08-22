import type { SupabaseSyntheticSourceFetch } from "./supabaseSyntheticSource.js";
import {
  CashReceiptLookupResultSchema,
  type CashReceiptLookupResult,
  type CashReceiptQuery,
  type CashReceiptSource
} from "./cashReceipt.js";
import { CashReceiptSchema } from "../types/cashApplication.js";

/**
 * Supabase-backed CashReceipt source.
 *
 * Reads settled receipts from `recoup_cash_receipts` rather than from in-memory
 * fixtures, so a run resolves against durable state and survives a restart.
 *
 * This does **not** make the receipts authoritative. Rows carry their own
 * `source_system`, and a row written by the rehearsal seed is still rehearsal
 * data. D-02 remains open: the authoritative settlement source is the one that
 * proves cash actually arrived, and this table only records what some upstream
 * source claimed. `isAuthoritativeSourceSystem` is the single place that
 * judgement lives, so the caller never has to infer it from a string.
 */

const NON_AUTHORITATIVE_MARKERS = ["rehearsal", "synthetic", "demo", "seed"];

export function isAuthoritativeSourceSystem(sourceSystem: string): boolean {
  const lower = sourceSystem.toLowerCase();
  return !NON_AUTHORITATIVE_MARKERS.some((marker) => lower.includes(marker));
}

export interface SupabaseCashReceiptSourceOptions {
  url: string;
  serviceRoleKey: string;
  fetcher?: SupabaseSyntheticSourceFetch;
  now?: () => Date;
  /**
   * Rows older than this are reported `stale` rather than `settled`. D-15 owns
   * the real freshness target; this is supplied so the adapter never invents one.
   */
  freshnessMaxAgeSeconds: number;
  freshnessPolicyVersion: string;
}

interface CashReceiptRow {
  receipt_id: string;
  source_system: string;
  source_record_id: string;
  payment_reference: string;
  customer_reference: string;
  legal_entity_reference: string;
  amount_received: string | number;
  currency: string;
  settlement_status: string;
  value_date: string;
  observed_at: string;
  retrieved_at: string;
  freshness_policy_version: string;
  freshness_status: string;
  record_ids: string[];
}

function headers(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

/** PostgREST renders `numeric` as a string or a number depending on driver. */
function toMoneyString(value: string | number): string {
  return typeof value === "string" ? value : value.toFixed(2);
}

export function createSupabaseCashReceiptSource(
  options: SupabaseCashReceiptSourceOptions
): CashReceiptSource {
  const {
    url,
    serviceRoleKey,
    fetcher = fetch,
    freshnessMaxAgeSeconds,
    freshnessPolicyVersion
  } = options;
  const now = options.now ?? (() => new Date());
  const rest = `${url.replace(/\/$/u, "")}/rest/v1`;

  return {
    async findReceipt(query: CashReceiptQuery): Promise<CashReceiptLookupResult> {
      const search = new URLSearchParams({
        select: "*",
        payment_reference: `eq.${query.paymentReference}`,
        customer_reference: `eq.${query.customerReference}`,
        legal_entity_reference: `eq.${query.legalEntityReference}`
      });

      let rows: CashReceiptRow[];

      try {
        const response = await fetcher(`${rest}/recoup_cash_receipts?${search.toString()}`, {
          headers: headers(serviceRoleKey)
        });

        if (!response.ok) {
          // A read failure is an outage, never a statement that the customer
          // has not paid.
          return CashReceiptLookupResultSchema.parse({
            status: "source_unavailable",
            reason: `receipt read failed: ${String(response.status)}`
          });
        }

        rows = (await response.json()) as CashReceiptRow[];
      } catch {
        return CashReceiptLookupResultSchema.parse({
          status: "source_unavailable",
          reason: "receipt read threw"
        });
      }

      const [row, ...extra] = rows;

      if (row === undefined) {
        return CashReceiptLookupResultSchema.parse({ status: "not_found" });
      }

      if (extra.length > 0) {
        return CashReceiptLookupResultSchema.parse({
          status: "ambiguous",
          reason: "more than one receipt matches the query scope"
        });
      }

      if (row.settlement_status !== "settled") {
        return CashReceiptLookupResultSchema.parse({
          status: "pending",
          reason: `receipt settlement status is ${row.settlement_status}`
        });
      }

      if (row.currency !== query.currency) {
        return CashReceiptLookupResultSchema.parse({
          status: "contract_gap",
          reason: "no approved FX policy for a cross-currency receipt"
        });
      }

      // Freshness is evaluated at read time rather than trusted from the row,
      // because a stored freshness_status ages the moment it is written.
      const retrievedAt = now();
      const ageSeconds = (retrievedAt.getTime() - new Date(row.observed_at).getTime()) / 1000;

      if (ageSeconds > freshnessMaxAgeSeconds) {
        return CashReceiptLookupResultSchema.parse({
          status: "stale",
          reason: "receipt is older than the approved freshness window"
        });
      }

      const receipt = CashReceiptSchema.parse({
        receiptId: row.receipt_id,
        sourceSystem: row.source_system,
        sourceRecordId: row.source_record_id,
        paymentReference: row.payment_reference,
        customerReference: row.customer_reference,
        legalEntityReference: row.legal_entity_reference,
        amountReceived: toMoneyString(row.amount_received),
        currency: row.currency,
        settlementStatus: "settled",
        valueDate: row.value_date,
        observedAt: row.observed_at,
        retrievedAt: retrievedAt.toISOString(),
        freshnessPolicyVersion,
        freshnessStatus: "fresh",
        recordIds: row.record_ids
      });

      return CashReceiptLookupResultSchema.parse({ status: "settled", receipt });
    }
  };
}
