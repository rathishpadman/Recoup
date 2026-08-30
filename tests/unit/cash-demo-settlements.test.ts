import { describe, expect, it } from "vitest";

import {
  CASH_DEMO_SETTLEMENTS,
  buildSettlementRow
} from "../../src/services/cashDemoSettlements.ts";

/**
 * The bank confirmations behind the emailed test scenarios.
 *
 * A remittance advice is the customer saying they paid. It is not proof the
 * money arrived; that comes from the bank. Nothing was confirming the payment
 * references the test files cite, so every emailed scenario held at Waiting
 * forever and the flow could not be demonstrated through the real front door.
 *
 * These rows are a PROXY FOR THE BANK FEED and are labelled as one. That is a
 * different thing from the send control they replace, which fabricated the
 * customer's own email and hardcoded the signature check to pass. Stubbing an
 * upstream system is a normal boundary; manufacturing a counterparty's message
 * is not.
 *
 * Each row is chosen to make its scenario reach the outcome the scenario is
 * named for, including the refusals — a payment that never arrived has no row
 * here at all, which is the point of it.
 */

describe("the settlement proxy covers the emailed scenarios", () => {
  it("confirms the payments that should complete", () => {
    for (const reference of ["PAY-SC01", "PAY-SC02", "PAY-SC03", "PAY-SC09", "PAY-SC10"]) {
      const row = CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === reference);
      expect(row?.settlementStatus).toBe("settled");
    }
  });

  it("leaves the money-never-arrived scenario unconfirmed", () => {
    // Seeding this one would delete the scenario. Its absence is the fixture.
    expect(CASH_DEMO_SETTLEMENTS.some((s) => s.paymentReference === "PAY-SC04")).toBe(false);
  });

  it("confirms the refusals in the shape each refusal needs", () => {
    const by = (ref: string) => CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === ref);

    expect(by("PAY-SC05")?.settlementStatus).toBe("pending");
    expect(by("PAY-SC07")?.settlementStatus).toBe("reversed");
    // Settled, but observed long enough ago to fail the freshness window.
    expect(by("PAY-SC06")?.settlementStatus).toBe("settled");
    expect(by("PAY-SC06")?.observedHoursAgo).toBeGreaterThan(24);
  });

  it("pays the euro scenario in euros, against a USD advice", () => {
    expect(by("PAY-SC08")?.currency).toBe("EUR");

    function by(ref: string) {
      return CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === ref);
    }
  });

  it("matches each advice's amount so the allocation reconciles", () => {
    expect(CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === "PAY-SC01")?.amountReceived).toBe(
      "1250.00"
    );
    // The multi-line advice settles a different total.
    expect(CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === "PAY-SC10")?.amountReceived).toBe(
      "8400.50"
    );
  });

  it("carries the customer each advice names", () => {
    expect(CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === "PAY-SC01")?.customerReference).toBe(
      "CUST-001"
    );
    expect(CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === "PAY-SC10")?.customerReference).toBe(
      "CUST-010"
    );
  });
});

describe("the rows say what they are", () => {
  const [first] = CASH_DEMO_SETTLEMENTS;

  it("names itself a proxy rather than a bank", () => {
    const row = build(first);

    // Provenance is how a reader tells a real settlement from a stand-in.
    expect(row.source_system).toBe("rehearsal-proxy");
  });

  it("keeps money as a string so the cents survive", () => {
    const row = build(first);

    expect(typeof row.amount_received).toBe("string");
    expect(row.amount_received).toMatch(/\.\d{2}$/u);
  });

  it("hashes the payload the way the column requires", () => {
    const row = build(first);

    expect(String(row.source_payload_hash)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("dates the confirmation from the observation, not from now", () => {
    // A stale confirmation has to actually be old, or the freshness rule it
    // exists to exercise never fires.
    const stale = CASH_DEMO_SETTLEMENTS.find((s) => s.paymentReference === "PAY-SC06");
    const built = build(stale);

    expect(new Date(String(built.observed_at)).getTime()).toBeLessThan(
      new Date("2026-08-30T09:00:00.000Z").getTime()
    );
  });

  /** Fails the test rather than asserting non-null, which lint forbids. */
  function build(settlement: (typeof CASH_DEMO_SETTLEMENTS)[number] | undefined) {
    if (settlement === undefined) {
      throw new Error("The fixture this test depends on is missing.");
    }

    return buildSettlementRow(settlement, new Date("2026-08-30T09:00:00.000Z"));
  }
});
