import { describe, expect, it } from "vitest";

import { resolveCashReceiptSource } from "../../src/adapters/cashReceiptSourceFactory.js";
import type { SapCashReceiptMapping } from "../../src/adapters/sapCashReceipt.js";

/**
 * The rehearsal proxy must never stand in for an authoritative settlement
 * source at a stage that implies live cash. A stage bump is a one-line
 * configuration change, so the guard belongs in code rather than in a runbook.
 */

const mapping: SapCashReceiptMapping = {
  serviceName: "Z_APPROVED_CDS",
  entitySet: "C_Approved",
  paymentReferenceProperty: "PaymentReference",
  customerReferenceProperty: "Customer",
  legalEntityProperty: "CompanyCode",
  amountProperty: "Amount",
  currencyProperty: "Currency",
  settlementStatusProperty: "ClearingStatus",
  settledValue: "C",
  valueDateProperty: "ValueDate",
  observedAtProperty: "LastChangeDateTime",
  freshnessPolicyVersion: "sap-freshness-v1",
  freshnessMaxAgeSeconds: 86_400
};

const rehearsalEnv = { RECOUP_CASH_REHEARSAL_ENABLED: "true" };

describe("no source below the rehearsal stage", () => {
  it.each(["disabled", "schema_only"])("returns nothing at %s", (stage) => {
    const resolved = resolveCashReceiptSource({
      env: { ...rehearsalEnv, RECOUP_CASH_ROLLOUT_STAGE: stage }
    });

    expect(resolved.source).toBeUndefined();
    expect(resolved.kind).toBe("none");
    expect(resolved.authoritative).toBe(false);
  });

  it("returns nothing with no stage configured at all", () => {
    const resolved = resolveCashReceiptSource({ env: {} });
    expect(resolved.kind).toBe("none");
  });
});

describe("the rehearsal proxy is confined to pre-production stages", () => {
  it.each(["rehearsal", "shadow"])("is available at %s but never authoritative", (stage) => {
    const resolved = resolveCashReceiptSource({
      env: { ...rehearsalEnv, RECOUP_CASH_ROLLOUT_STAGE: stage }
    });

    expect(resolved.kind).toBe("rehearsal");
    expect(resolved.source).toBeDefined();
    expect(resolved.authoritative).toBe(false);
    expect(resolved.reason).toContain("AC-01 remains blocked");
  });

  it.each(["reference_canary", "governed_canary", "production"])(
    "refuses to supply the rehearsal proxy at %s",
    (stage) => {
      const resolved = resolveCashReceiptSource({
        env: { ...rehearsalEnv, RECOUP_CASH_ROLLOUT_STAGE: stage }
      });

      expect(resolved.source).toBeUndefined();
      expect(resolved.kind).not.toBe("rehearsal");
      expect(resolved.reason).toContain("D-02 is unratified");
    }
  );

  it("stays refused at production even with the rehearsal flag on", () => {
    const resolved = resolveCashReceiptSource({
      env: {
        RECOUP_CASH_REHEARSAL_ENABLED: "true",
        RECOUP_CASH_DEMO_POLICY_ENABLED: "true",
        RECOUP_CASH_ROLLOUT_STAGE: "production"
      }
    });

    expect(resolved.source).toBeUndefined();
  });
});

describe("an approved SAP mapping is the only authoritative source", () => {
  it.each(["rehearsal", "shadow", "reference_canary", "governed_canary", "production"])(
    "is selected at %s when supplied",
    (stage) => {
      const resolved = resolveCashReceiptSource({
        env: { RECOUP_CASH_ROLLOUT_STAGE: stage },
        sapMapping: mapping
      });

      expect(resolved.kind).toBe("sap");
      expect(resolved.authoritative).toBe(true);
      expect(resolved.source).toBeDefined();
    }
  );

  it("takes precedence over the rehearsal proxy", () => {
    const resolved = resolveCashReceiptSource({
      env: { ...rehearsalEnv, RECOUP_CASH_ROLLOUT_STAGE: "rehearsal" },
      sapMapping: mapping
    });

    expect(resolved.kind).toBe("sap");
  });

  it("reports the stage it resolved for, so evidence records it", () => {
    const resolved = resolveCashReceiptSource({
      env: { RECOUP_CASH_ROLLOUT_STAGE: "shadow", ...rehearsalEnv }
    });
    expect(resolved.stage).toBe("shadow");
  });
});
