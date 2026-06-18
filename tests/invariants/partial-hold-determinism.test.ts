import { describe, expect, it } from "vitest";
import { partialHoldWeights } from "../../config/weights.js";
import { computePartialHold } from "../../src/core/partialHold.js";

describe("partial hold determinism", () => {
  it("reproduces the Harbor worked example from the locked ledger", () => {
    const result = computePartialHold({
      weights: partialHoldWeights,
      scores: {
        orderValueVsExposure: 35,
        customerStrategicValue: 60,
        dsoPaymentDrift: 30,
        orderMargin: 80,
        revenueForecast: 65,
        paymentPattern: 50
      }
    });

    expect(result.compositeScore.toFixed(2)).toBe("51.25");
    expect(result.releaseRatioPercent.toFixed(0)).toBe("55");
  });
});
