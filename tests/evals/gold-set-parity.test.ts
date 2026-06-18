import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../datagen/generate.js";

describe("canonical S1-S8 gold set parity", () => {
  it("matches the locked ledger totals", () => {
    const dataset = buildSyntheticDataset({ seed: 42 });

    expect(dataset.deductionLines).toHaveLength(20);
    expect(dataset.rollup.totalLines).toBe(20);
    expect(dataset.rollup.totalAmount.toFixed(2)).toBe("112400.00");
    expect(dataset.rollup.validLines).toBe(7);
    expect(dataset.rollup.validAmount.toFixed(2)).toBe("32600.00");
    expect(dataset.rollup.recoveryLines).toBe(13);
    expect(dataset.rollup.recoveryAmount.toFixed(2)).toBe("79800.00");
  });

  it("keeps S7 partial but fully in the recovery bucket for release 1", () => {
    const dataset = buildSyntheticDataset({ seed: 42 });
    const s7Lines = dataset.deductionLines.filter((line) => line.scenarioId === "S7");

    expect(s7Lines).toHaveLength(2);
    expect(s7Lines.every((line) => line.verdict === "partial")).toBe(true);
    expect(s7Lines.every((line) => line.routing === "recovery")).toBe(true);
    expect(s7Lines.reduce((total, line) => total.plus(line.amount), dataset.zeroMoney).toFixed(2)).toBe("15900.00");
  });
});
