import { describe, expect, it } from "vitest";

import {
  detectRemittanceFormat,
  extractRemittanceRows,
  REMITTANCE_TEMPLATES
} from "../../src/services/remittanceFormats.ts";

/**
 * Front-ends for the formats a customer actually sends.
 *
 * Every one converts into the canonical CSV v1 shape and is then handed to the
 * existing mapper. That is the whole design: one validated mapper, many ways in.
 * A second mapper per format would be a second place for the money rules to
 * drift.
 *
 * Fail-closed is the property that matters more than breadth. Anything not
 * recognised must say so plainly rather than guessing at a figure, because a
 * confident wrong amount is worse than a refusal.
 */

const EXPECTED = {
  customerReference: "CUST-001",
  paymentReference: "PAY-9001",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  invoiceReference: "INV-2026-0912",
  instructedAmount: "1000.00",
  claimedDeductionAmount: "250.00",
  claimedReasonCode: "DMG"
};

function expectCanonical(rows: ReturnType<typeof extractRemittanceRows>): void {
  expect(rows.ok, rows.ok ? "" : `extraction failed: ${rows.reason}`).toBe(true);
  if (!rows.ok) return;

  const [first] = rows.rows;
  expect(first?.customer_reference).toBe(EXPECTED.customerReference);
  expect(first?.payment_reference).toBe(EXPECTED.paymentReference);
  expect(first?.currency).toBe(EXPECTED.currency);
  expect(first?.instructed_payment_amount).toBe(EXPECTED.instructedPaymentAmount);
  expect(first?.invoice_reference).toBe(EXPECTED.invoiceReference);
  expect(first?.instructed_amount).toBe(EXPECTED.instructedAmount);
  expect(first?.claimed_deduction_amount).toBe(EXPECTED.claimedDeductionAmount);
  expect(first?.claimed_reason_code).toBe(EXPECTED.claimedReasonCode);
}

describe("remittance format detection", () => {
  it("recognises each supported format from its filename and type", () => {
    expect(detectRemittanceFormat({ filename: "advice.csv", mimeType: "text/csv" })).toBe("csv");
    expect(detectRemittanceFormat({ filename: "advice.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })).toBe("xlsx");
    expect(detectRemittanceFormat({ filename: "advice.pdf", mimeType: "application/pdf" })).toBe("pdf");
    expect(detectRemittanceFormat({ filename: "", mimeType: "text/plain" })).toBe("email-body");
  });

  it("refuses a format nobody approved rather than attempting it", () => {
    expect(detectRemittanceFormat({ filename: "advice.docx", mimeType: "application/msword" })).toBeUndefined();
    expect(detectRemittanceFormat({ filename: "scan.png", mimeType: "image/png" })).toBeUndefined();
  });

  it("trusts the extension over a claimed type, and refuses when they conflict", () => {
    // Extension spoofing is a named risk in the security review.
    expect(detectRemittanceFormat({ filename: "payload.exe", mimeType: "text/csv" })).toBeUndefined();
  });
});

describe("email body remittances", () => {
  it("reads a payment note typed into the body with no attachment", () => {
    const body = [
      "Hello,",
      "",
      "Payment reference: PAY-9001",
      "Customer: CUST-001",
      "Legal entity: LE-001",
      "Currency: USD",
      "Total paid: 1250.00",
      "",
      "Invoice INV-2026-0912 | paid 1000.00 | deducted 250.00 | reason DMG | two pallets damaged",
      "",
      "Regards"
    ].join("\n");

    expectCanonical(extractRemittanceRows({ format: "email-body", text: body }));
  });

  it("says what was missing when the body is just prose", () => {
    const result = extractRemittanceRows({ format: "email-body", text: "Hi, we have paid your invoice. Thanks." });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A person has to be able to act on this without reading the code.
    expect(result.reason.toLowerCase()).toContain("payment reference");
  });
});

describe("the five spreadsheet templates", () => {
  const excel = REMITTANCE_TEMPLATES.filter((template) => template.format === "xlsx");

  it("defines five", () => {
    expect(excel).toHaveLength(5);
  });

  for (const template of REMITTANCE_TEMPLATES.filter((t) => t.format === "xlsx")) {
    it(`reads ${template.id}: ${template.name}`, () => {
      expectCanonical(extractRemittanceRows({ format: "xlsx", grid: template.sample() }));
    });
  }
});

describe("the five PDF templates", () => {
  const pdf = REMITTANCE_TEMPLATES.filter((template) => template.format === "pdf");

  it("defines five", () => {
    expect(pdf).toHaveLength(5);
  });

  for (const template of REMITTANCE_TEMPLATES.filter((t) => t.format === "pdf")) {
    it(`reads ${template.id}: ${template.name}`, () => {
      expectCanonical(extractRemittanceRows({ format: "pdf", text: template.sampleText() }));
    });
  }
});

describe("fail closed", () => {
  it("refuses a spreadsheet whose columns it cannot place", () => {
    const result = extractRemittanceRows({
      format: "xlsx",
      grid: [["something", "entirely"], ["un", "expected"]]
    });

    expect(result.ok).toBe(false);
  });

  it("never invents an amount it could not find", () => {
    const result = extractRemittanceRows({
      format: "pdf",
      text: "Remittance advice\nPayment reference: PAY-9001\nCustomer: CUST-001"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
