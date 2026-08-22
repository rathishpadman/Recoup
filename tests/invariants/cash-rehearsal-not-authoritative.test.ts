import { describe, expect, it } from "vitest";

import {
  REHEARSAL_SOURCE_SYSTEM,
  createRehearsalCashReceiptSource,
  isRehearsalReceipt
} from "../../src/adapters/rehearsalCashReceipt.js";

/**
 * Implementation specification 5.3 permits a proxy only as an explicitly
 * labelled rehearsal/shadow capability under the deferred-live-slice election.
 * It forbids a synthetic production fallback. These assertions are the
 * difference between the two, and each one encodes a deliberate decision.
 */
const query = {
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  instructedAmount: "1250.00",
  currency: "USD",
  asOf: "2026-08-22T09:00:00Z"
};

describe("the rehearsal proxy is never an authoritative source", () => {
  it("fails closed when the rehearsal flag is absent", async () => {
    const source = createRehearsalCashReceiptSource({ env: {} });
    const result = await source.findReceipt(query);
    expect(result.status).toBe("source_unavailable");
    expect(result).not.toHaveProperty("receipt");
  });

  it("fails closed when the rehearsal flag is explicitly off", async () => {
    const source = createRehearsalCashReceiptSource({
      env: { RECOUP_CASH_REHEARSAL_ENABLED: "false" }
    });
    const result = await source.findReceipt(query);
    expect(result.status).toBe("source_unavailable");
  });

  it("stamps every receipt it returns with the rehearsal source system", async () => {
    const source = createRehearsalCashReceiptSource({
      env: { RECOUP_CASH_REHEARSAL_ENABLED: "true" }
    });
    const result = await source.findReceipt(query);
    expect(result.status).toBe("settled");
    if (result.status === "settled") {
      expect(result.receipt.sourceSystem).toBe(REHEARSAL_SOURCE_SYSTEM);
      expect(isRehearsalReceipt(result.receipt)).toBe(true);
    }
  });

  it("labels the source system unmistakably, so an audit trail cannot read as live", () => {
    expect(REHEARSAL_SOURCE_SYSTEM).toMatch(/rehearsal/u);
    expect(REHEARSAL_SOURCE_SYSTEM).not.toMatch(/^sap/iu);
  });

  it("never invents a receipt for an unknown payment reference", async () => {
    const source = createRehearsalCashReceiptSource({
      env: { RECOUP_CASH_REHEARSAL_ENABLED: "true" }
    });
    const result = await source.findReceipt({ ...query, paymentReference: "PAY-NOT-A-FIXTURE" });
    expect(result.status).toBe("not_found");
    expect(result).not.toHaveProperty("receipt");
  });

  it("reports a currency mismatch as contract_gap rather than guessing an FX rate", async () => {
    const source = createRehearsalCashReceiptSource({
      env: { RECOUP_CASH_REHEARSAL_ENABLED: "true" }
    });
    const result = await source.findReceipt({ ...query, currency: "EUR" });
    expect(result.status).toBe("contract_gap");
  });

  it("does not read run_control, leaving D-13 untouched", async () => {
    const source = createRehearsalCashReceiptSource({
      env: { RECOUP_CASH_REHEARSAL_ENABLED: "true", run_control: "should-be-ignored" }
    });
    const result = await source.findReceipt(query);
    expect(result.status).toBe("settled");
  });
});

describe("isRehearsalReceipt", () => {
  it("refuses a receipt claiming any other source system", () => {
    expect(isRehearsalReceipt({ sourceSystem: "sap-odata" })).toBe(false);
    expect(isRehearsalReceipt({ sourceSystem: REHEARSAL_SOURCE_SYSTEM })).toBe(true);
  });
});
