import { describe, expect, it } from "vitest";

import { DEMO_REASON_MAP } from "../../config/cashReasonMap.js";
import { validateClaimedReason } from "../../src/core/cashApplication/reason.js";

const recordIds = ["REM-SRC-1"];

describe("validateClaimedReason (TDD 5.3, 4.7)", () => {
  it("reports policy_missing when no reason map is supplied", () => {
    const result = validateClaimedReason({
      claimedReasonCode: "DMG",
      claimedReasonTextSanitized: "damaged pallet",
      reasonMap: undefined,
      recordIds
    });
    expect(result.status).toBe("review");
    if (result.status !== "validated") {
      expect(result.reason).toBe("policy_missing");
    }
  });

  it("validates a mapped code to DEP and cites the rule and policy version", () => {
    const result = validateClaimedReason({
      claimedReasonCode: "DMG",
      claimedReasonTextSanitized: "damaged pallet",
      reasonMap: DEMO_REASON_MAP,
      recordIds
    });
    expect(result.status).toBe("validated");
    if (result.status === "validated") {
      expect(result.validatedReason).toBe("DEP");
      expect(result.ruleId).toBe("RULE-DMG");
      expect(result.policyVersion).toBe(DEMO_REASON_MAP.policyVersion);
      expect(result.recordIds).toEqual(recordIds);
    }
  });

  it("reviews an unmapped code rather than guessing at its meaning", () => {
    const result = validateClaimedReason({
      claimedReasonCode: "NOT-A-CODE",
      claimedReasonTextSanitized: "something else",
      reasonMap: DEMO_REASON_MAP,
      recordIds
    });
    expect(result.status).toBe("review");
    if (result.status !== "validated") {
      expect(result.reason).toBe("unclassified");
    }
  });

  it("reviews a missing code rather than reading the free text", () => {
    const result = validateClaimedReason({
      claimedReasonCode: undefined,
      claimedReasonTextSanitized: "shortage on delivery, please see attached",
      reasonMap: DEMO_REASON_MAP,
      recordIds
    });
    expect(result.status).toBe("review");
    if (result.status !== "validated") {
      expect(result.reason).toBe("unclassified");
    }
  });

  it("blocks when a code maps to more than one rule", () => {
    const result = validateClaimedReason({
      claimedReasonCode: "DUP",
      reasonMap: {
        ...DEMO_REASON_MAP,
        rules: [
          { ruleId: "RULE-A", claimedReasonCode: "DUP", validatedReason: "DEP" },
          { ruleId: "RULE-B", claimedReasonCode: "DUP", validatedReason: "DEP" }
        ]
      },
      recordIds
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "validated") {
      expect(result.reason).toBe("ambiguous");
    }
  });

  it("reviews when no cited records accompany the claim", () => {
    const result = validateClaimedReason({
      claimedReasonCode: "DMG",
      reasonMap: DEMO_REASON_MAP,
      recordIds: []
    });
    expect(result.status).toBe("review");
    if (result.status !== "validated") {
      expect(result.reason).toBe("evidence_missing");
    }
  });

  it("matches codes case-insensitively after trimming", () => {
    const result = validateClaimedReason({
      claimedReasonCode: "  dmg  ",
      reasonMap: DEMO_REASON_MAP,
      recordIds
    });
    expect(result.status).toBe("validated");
  });

  it("permits only DEP in the first release", () => {
    for (const rule of DEMO_REASON_MAP.rules) {
      expect(rule.validatedReason).toBe("DEP");
    }
  });

  it("never lets free text alone produce a validated reason", () => {
    const textOnlyMap = {
      ...DEMO_REASON_MAP,
      rules: [{ ruleId: "RULE-TEXT", claimedReasonCode: "damaged pallet", validatedReason: "DEP" as const }]
    };
    const result = validateClaimedReason({
      claimedReasonCode: undefined,
      claimedReasonTextSanitized: "damaged pallet",
      reasonMap: textOnlyMap,
      recordIds
    });
    expect(result.status).toBe("review");
  });
});
