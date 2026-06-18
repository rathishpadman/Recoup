import { describe, expect, it } from "vitest";
import { runtimeModels } from "../../config/models.js";

describe("runtime model config", () => {
  it("uses only pinned runtime model identifiers", () => {
    expect(runtimeModels).toEqual({
      reasoning: "gpt-5.5",
      fast: "gpt-5.4",
      fastMini: "gpt-5.4-mini",
      realtime: "gpt-realtime-2"
    });
  });
});
