import { describe, expect, it } from "vitest";
import { serviceTools } from "../../src/services/serviceLayer.js";

describe("I-26 no ERP writeback", () => {
  it("does not expose a write-capable ERP action tool", () => {
    expect(Object.keys(serviceTools).some((toolName) => /erp.*write|write.*erp/i.test(toolName))).toBe(false);
  });
});
