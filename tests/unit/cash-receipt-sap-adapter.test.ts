import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createSapCashReceiptSource,
  type SapCashReceiptMapping
} from "../../src/adapters/sapCashReceipt.js";

const mapping: SapCashReceiptMapping = {
  serviceName: "ZTEST_CLEARED_ITEMS_CDS",
  entitySet: "C_TestClearedItem",
  paymentReferenceProperty: "PaymentReference",
  customerReferenceProperty: "Customer",
  legalEntityProperty: "CompanyCode",
  amountProperty: "AmountInTransactionCurrency",
  currencyProperty: "TransactionCurrency",
  settlementStatusProperty: "ClearingStatus",
  settledValue: "C",
  valueDateProperty: "ValueDate",
  observedAtProperty: "LastChangeDateTime",
  freshnessPolicyVersion: "sap-freshness-v1",
  freshnessMaxAgeSeconds: 86_400
};

const query = {
  customerReference: "CUST-001",
  legalEntityReference: "1000",
  paymentReference: "PAY-1001",
  instructedAmount: "1250.00",
  currency: "USD",
  asOf: "2026-08-22T09:00:00Z"
};

const now = () => new Date("2026-08-22T09:00:00Z");

const settledRow = {
  PaymentReference: "PAY-1001",
  Customer: "CUST-001",
  CompanyCode: "1000",
  AmountInTransactionCurrency: "1250.00",
  TransactionCurrency: "USD",
  ClearingStatus: "C",
  ValueDate: "2026-08-20",
  LastChangeDateTime: "2026-08-22T08:00:00Z"
};

describe("SAP CashReceipt adapter fails closed while D-02 is open", () => {
  it("reports contract_gap when no approved mapping is supplied", async () => {
    const source = createSapCashReceiptSource({ env: {} });
    const result = await source.findReceipt(query);

    expect(result.status).toBe("contract_gap");
    expect(result).not.toHaveProperty("receipt");
  });

  it("reports source_unavailable when nothing is configured and no read path exists", async () => {
    const source = createSapCashReceiptSource({ env: {}, mapping });
    const result = await source.findReceipt(query);

    expect(result.status).toBe("source_unavailable");
  });
});

describe("with an approved mapping and a proven read path", () => {
  it("returns a settled receipt for a cleared item", async () => {
    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () => Promise.resolve([settledRow])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;

    expect(result.receipt.sourceSystem).toBe("sap-odata");
    expect(result.receipt.amountReceived).toBe("1250.00");
    expect(result.receipt.settlementStatus).toBe("settled");
    expect(result.receipt.freshnessStatus).toBe("fresh");
  });

  it("reports pending when the item is not in the approved settled state", async () => {
    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () => Promise.resolve([{ ...settledRow, ClearingStatus: "O" }])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("pending");
  });

  it("reports stale rather than settled beyond the freshness window", async () => {
    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () =>
        Promise.resolve([{ ...settledRow, LastChangeDateTime: "2026-08-01T08:00:00Z" }])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("stale");
  });

  it("reports not_found with no receipt when nothing matches", async () => {
    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () => Promise.resolve([])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("not_found");
    expect(result).not.toHaveProperty("receipt");
  });

  it("reports ambiguous rather than picking one of two matches", async () => {
    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () => Promise.resolve([settledRow, settledRow])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("ambiguous");
  });

  it("keeps a read failure distinct from a zero result", async () => {
    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () => Promise.reject(new Error("gateway timeout"))
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("source_unavailable");
    expect(result.status).not.toBe("not_found");
  });

  it("reports contract_gap when an approved property is missing from the row", async () => {
    const { TransactionCurrency, ...withoutCurrency } = settledRow;
    void TransactionCurrency;

    const source = createSapCashReceiptSource({
      env: {},
      mapping,
      now,
      fetchEntity: () => Promise.resolve([withoutCurrency])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("contract_gap");
  });
});

describe("the adapter introduces no ERP mutation path", () => {
  it("contains no write verb or CSRF flow", () => {
    const source = readFileSync("src/adapters/sapCashReceipt.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

    expect(code).not.toMatch(/\bPOST\b|\bPATCH\b|\bPUT\b|\bDELETE\b/u);
    expect(code).not.toMatch(/csrf|CSRF|x-csrf-token/u);
    expect(code).not.toMatch(/\bmethod:\s*["'](POST|PUT|PATCH|DELETE)["']/u);
  });

  it("names no SAP entity as authoritative in code", () => {
    const source = readFileSync("src/adapters/sapCashReceipt.ts", "utf8");
    // Entity selection is an owner decision; hardcoding one here would be the
    // implementation quietly signing D-02.
    expect(source).not.toMatch(/C_AP[A-Za-z]+|BSEG|BKPF|I_JournalEntry/u);
  });
});
