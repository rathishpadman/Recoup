import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../datagen/generate.js";

describe("fixed seed reproducibility", () => {
  it("produces byte-identical data for seed 42", () => {
    const first = buildSyntheticDataset({ seed: 42 });
    const second = buildSyntheticDataset({ seed: 42 });

    expect(JSON.stringify(first.manifest)).toBe(JSON.stringify(second.manifest));
    expect(first.deductionLines.map((line) => line.eventId)).toEqual(second.deductionLines.map((line) => line.eventId));
  });
});
