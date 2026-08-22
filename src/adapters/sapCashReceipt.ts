import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import {
  CashReceiptLookupResultSchema,
  type CashReceiptLookupResult,
  type CashReceiptQuery,
  type CashReceiptSource
} from "./cashReceipt.js";
import { CashReceiptSchema } from "../types/cashApplication.js";
import { createSapODataConnectionFromEnv } from "./sapOData.js";

/**
 * Read-only SAP OData CashReceipt adapter.
 *
 * D-02 is unratified: the configured sandbox returned HTTP 401 to GET-only
 * discovery, so no cleared-item entity, key set or settlement semantics have
 * been proven. This adapter therefore exists but refuses to guess. Until the
 * approved service, entity set and property mapping are supplied it returns
 * `contract_gap`, which is the fail-closed path rather than a stub that
 * pretends to work.
 *
 * The mapping fields below are structural only. Nothing here asserts which SAP
 * entity is authoritative; that decision belongs to Treasury and Architecture.
 *
 * Reuse is deliberate and bounded: the read-only client, connection resolution
 * and metadata plumbing come from sapOData.ts. No mutation path is introduced,
 * and I-26 (no production ERP mutation) is preserved.
 */

export interface SapCashReceiptMapping {
  /** Approved Gateway service, e.g. a cleared-item or payment-advice service. */
  serviceName: string;
  /** Approved entity set within that service. */
  entitySet: string;
  /** Property carrying the payment reference. */
  paymentReferenceProperty: string;
  /** Property carrying the customer reference. */
  customerReferenceProperty: string;
  /** Property carrying the legal entity or company code. */
  legalEntityProperty: string;
  /** Property carrying the received amount. */
  amountProperty: string;
  /** Property carrying the currency code. */
  currencyProperty: string;
  /** Property whose value proves the item is settled or cleared. */
  settlementStatusProperty: string;
  /** Value of settlementStatusProperty that means settled. */
  settledValue: string;
  /** Property carrying the value date. */
  valueDateProperty: string;
  /** Property carrying the source observation timestamp. */
  observedAtProperty: string;
  /** Approved freshness policy identifier. */
  freshnessPolicyVersion: string;
  /** Maximum age in seconds before a receipt is stale. */
  freshnessMaxAgeSeconds: number;
}

export interface SapCashReceiptSourceOptions {
  env: RuntimeEnv;
  /**
   * Supplied only once D-02 is signed. Absent means the approved entity and
   * property mapping is unknown, which is a contract gap and not an outage.
   */
  mapping?: SapCashReceiptMapping;
  /** Injected for tests; production resolves from the read-only client. */
  fetchEntity?: (input: {
    serviceName: string;
    entitySet: string;
    filter: Record<string, string>;
  }) => Promise<Record<string, unknown>[]>;
  now?: () => Date;
}

function gap(reason: string): CashReceiptLookupResult {
  return CashReceiptLookupResultSchema.parse({ status: "contract_gap", reason });
}

function readString(row: Record<string, unknown>, property: string): string | undefined {
  const value = row[property];
  return typeof value === "string" ? value : undefined;
}

export function createSapCashReceiptSource(
  options: SapCashReceiptSourceOptions
): CashReceiptSource {
  const { env, mapping, fetchEntity } = options;
  const now = options.now ?? (() => new Date());

  return {
    async findReceipt(query: CashReceiptQuery): Promise<CashReceiptLookupResult> {
      // D-02 unratified: no approved entity or property mapping exists.
      if (mapping === undefined) {
        return gap("no approved SAP CashReceipt entity or property mapping (D-02 open)");
      }

      const connection = createSapODataConnectionFromEnv(env);

      if (connection === undefined && fetchEntity === undefined) {
        return CashReceiptLookupResultSchema.parse({
          status: "source_unavailable",
          reason: "SAP OData connection is not configured"
        });
      }

      if (fetchEntity === undefined) {
        // A configured connection without a proven read path is still a gap:
        // the approved bounded fixture read has not happened.
        return gap("SAP read path is not proven; one approved fixture read is required");
      }

      let rows: Record<string, unknown>[];

      try {
        rows = await fetchEntity({
          serviceName: mapping.serviceName,
          entitySet: mapping.entitySet,
          filter: {
            [mapping.paymentReferenceProperty]: query.paymentReference,
            [mapping.customerReferenceProperty]: query.customerReference,
            [mapping.legalEntityProperty]: query.legalEntityReference
          }
        });
      } catch {
        // An outage is never a zero result.
        return CashReceiptLookupResultSchema.parse({
          status: "source_unavailable",
          reason: "SAP read failed"
        });
      }

      const [row, ...extra] = rows;

      if (row === undefined) {
        return CashReceiptLookupResultSchema.parse({ status: "not_found" });
      }

      if (extra.length > 0) {
        return CashReceiptLookupResultSchema.parse({
          status: "ambiguous",
          reason: "more than one SAP item matches the query scope"
        });
      }

      const settlement = readString(row, mapping.settlementStatusProperty);

      if (settlement !== mapping.settledValue) {
        return CashReceiptLookupResultSchema.parse({
          status: "pending",
          reason: "SAP item is not in the approved settled state"
        });
      }

      const observedAt = readString(row, mapping.observedAtProperty);
      const amount = readString(row, mapping.amountProperty);
      const currency = readString(row, mapping.currencyProperty);
      const valueDate = readString(row, mapping.valueDateProperty);

      if (
        observedAt === undefined ||
        amount === undefined ||
        currency === undefined ||
        valueDate === undefined
      ) {
        return gap("SAP row is missing an approved required property");
      }

      const retrievedAt = now();
      const ageSeconds = (retrievedAt.getTime() - new Date(observedAt).getTime()) / 1000;

      if (ageSeconds > mapping.freshnessMaxAgeSeconds) {
        return CashReceiptLookupResultSchema.parse({
          status: "stale",
          reason: "SAP item is older than the approved freshness window"
        });
      }

      const receipt = CashReceiptSchema.parse({
        receiptId: `SAP-${query.paymentReference}`,
        sourceSystem: "sap-odata",
        sourceRecordId: `${mapping.entitySet}:${query.paymentReference}`,
        paymentReference: query.paymentReference,
        customerReference: query.customerReference,
        legalEntityReference: query.legalEntityReference,
        amountReceived: amount,
        currency,
        settlementStatus: "settled",
        valueDate,
        observedAt,
        retrievedAt: retrievedAt.toISOString(),
        freshnessPolicyVersion: mapping.freshnessPolicyVersion,
        freshnessStatus: "fresh",
        recordIds: [`${mapping.entitySet}:${query.paymentReference}`]
      });

      return CashReceiptLookupResultSchema.parse({ status: "settled", receipt });
    }
  };
}
