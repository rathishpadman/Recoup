import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import {
  CashReceiptLookupResultSchema,
  type CashReceiptLookupResult,
  type CashReceiptQuery,
  type CashReceiptSource
} from "./cashReceipt.js";
import { CashReceiptSchema, type CashReceipt } from "../types/cashApplication.js";

/**
 * Rehearsal CashReceipt proxy.
 *
 * Implementation specification 5.3 permits this only under the deferred
 * live-slice election, and only as an explicitly labelled rehearsal/shadow
 * capability. It is not an authoritative settlement source: AC-01 stays blocked
 * while it is the only source available, and SA-CA-01 continues to forbid an
 * allocation that cites nothing better than this.
 *
 * Two properties keep it on the right side of that line. It is unreachable
 * unless the rehearsal flag is explicitly on, and every receipt it returns is
 * stamped with a source system that cannot be mistaken for a live ERP.
 */
export const REHEARSAL_SOURCE_SYSTEM = "rehearsal-proxy";

/**
 * A plain environment flag rather than a cash_run_control value: D-13 governs
 * the run-control vocabulary and is unratified, so inventing a value there would
 * pre-empt an owner decision.
 */
const REHEARSAL_FLAG = "RECOUP_CASH_REHEARSAL_ENABLED";

const FRESHNESS_POLICY_VERSION = "rehearsal-freshness-v1";

/**
 * Deterministic rehearsal fixtures. Amounts and references are illustrative
 * demo data, not an approved D-06 fixture set; promoting them requires owner
 * ratification.
 */
interface RehearsalFixture {
  paymentReference: string;
  customerReference: string;
  legalEntityReference: string;
  amountReceived: string;
  currency: string;
  valueDate: string;
  observedAt: string;
  sourceRecordId: string;
}

const rehearsalFixtures: readonly RehearsalFixture[] = [
  {
    paymentReference: "PAY-1001",
    customerReference: "CUST-001",
    legalEntityReference: "LE-001",
    amountReceived: "1250.00",
    currency: "USD",
    valueDate: "2026-08-20",
    observedAt: "2026-08-20T10:00:00Z",
    sourceRecordId: "REHEARSAL-SRC-1001"
  },
  {
    paymentReference: "PAY-1002",
    customerReference: "CUST-002",
    legalEntityReference: "LE-001",
    amountReceived: "8400.50",
    currency: "USD",
    valueDate: "2026-08-21",
    observedAt: "2026-08-21T11:30:00Z",
    sourceRecordId: "REHEARSAL-SRC-1002"
  }
];

export interface RehearsalCashReceiptSourceOptions {
  env: RuntimeEnv;
  fixtures?: readonly RehearsalFixture[];
  now?: () => Date;
}

export function isRehearsalReceipt(receipt: Pick<CashReceipt, "sourceSystem">): boolean {
  return receipt.sourceSystem === REHEARSAL_SOURCE_SYSTEM;
}

function isRehearsalEnabled(env: RuntimeEnv): boolean {
  return env[REHEARSAL_FLAG]?.trim().toLowerCase() === "true";
}

export function createRehearsalCashReceiptSource(
  options: RehearsalCashReceiptSourceOptions
): CashReceiptSource {
  const { env, fixtures = rehearsalFixtures, now = () => new Date() } = options;

  return {
    findReceipt(input: CashReceiptQuery): Promise<CashReceiptLookupResult> {
      if (!isRehearsalEnabled(env)) {
        return Promise.resolve(
          CashReceiptLookupResultSchema.parse({
            status: "source_unavailable",
            reason: `${REHEARSAL_FLAG} is not enabled`
          })
        );
      }

      const matches = fixtures.filter(
        (fixture) =>
          fixture.paymentReference === input.paymentReference &&
          fixture.customerReference === input.customerReference &&
          fixture.legalEntityReference === input.legalEntityReference
      );

      if (matches.length === 0) {
        return Promise.resolve(
          CashReceiptLookupResultSchema.parse({ status: "not_found" })
        );
      }

      const [fixture, ...rest] = matches;

      if (rest.length > 0 || fixture === undefined) {
        return Promise.resolve(
          CashReceiptLookupResultSchema.parse({
            status: "ambiguous",
            reason: "more than one rehearsal fixture matches the query scope"
          })
        );
      }

      // Cross-currency settlement needs an approved FX contract (D-07). Reporting
      // a gap is correct; converting would be inventing a rate.
      if (fixture.currency !== input.currency) {
        return Promise.resolve(
          CashReceiptLookupResultSchema.parse({
            status: "contract_gap",
            reason: "no approved FX policy for a cross-currency rehearsal receipt"
          })
        );
      }

      const retrievedAt = now().toISOString();
      const receipt = CashReceiptSchema.parse({
        receiptId: `REHEARSAL-${fixture.paymentReference}`,
        sourceSystem: REHEARSAL_SOURCE_SYSTEM,
        sourceRecordId: fixture.sourceRecordId,
        paymentReference: fixture.paymentReference,
        customerReference: fixture.customerReference,
        legalEntityReference: fixture.legalEntityReference,
        amountReceived: fixture.amountReceived,
        currency: fixture.currency,
        settlementStatus: "settled",
        valueDate: fixture.valueDate,
        observedAt: fixture.observedAt,
        retrievedAt,
        freshnessPolicyVersion: FRESHNESS_POLICY_VERSION,
        freshnessStatus: "fresh",
        recordIds: [fixture.sourceRecordId]
      });

      return Promise.resolve(
        CashReceiptLookupResultSchema.parse({ status: "settled", receipt })
      );
    }
  };
}
