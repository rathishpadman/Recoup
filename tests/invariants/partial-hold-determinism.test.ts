import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { computePartialHold, computePartialHoldAmountSplit } from "../../src/core/partialHold.js";
import { money } from "../../src/types/money.js";

const governedConfig = day1GovernedConfigSeed.values;

describe("partial hold determinism", () => {
  it("reproduces the Harbor worked example from the locked ledger", () => {
    const result = computePartialHold({
      thresholds: governedConfig.partialHold.thresholds,
      weights: governedConfig.partialHold.weights,
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

  it("computes the release and back-order dollar split in core", () => {
    const partialHold = computePartialHold({
      thresholds: governedConfig.partialHold.thresholds,
      weights: governedConfig.partialHold.weights,
      scores: {
        orderValueVsExposure: 35,
        customerStrategicValue: 60,
        dsoPaymentDrift: 30,
        orderMargin: 80,
        revenueForecast: 65,
        paymentPattern: 50
      }
    });

    const amountSplit = computePartialHoldAmountSplit({
      orderAmount: money("640010.00"),
      releaseRatioPercent: partialHold.releaseRatioPercent
    });

    expect(amountSplit.proposedReleaseAmount.toFixed(2)).toBe("352005.50");
    expect(amountSplit.proposedBackOrderAmount.toFixed(2)).toBe("288004.50");
    expect(amountSplit.amountSource).toBe("partial-hold-core");
  });
});
