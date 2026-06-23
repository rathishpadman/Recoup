import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runForensicsInvestigation, type ForensicsTraceEvent } from "../../src/agents/forensics.js";
import { redactPiiForModelContext } from "../../src/guardrails/input/pii.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("I-14 PII guard", () => {
  it("redacts direct contact details before model context", () => {
    const redacted = redactPiiForModelContext(
      "Contact maya@example.com or 555-0188 about deduction S5-L1 and record POD-TIMESTAMP-1."
    );

    expect(redacted).not.toContain("maya@example.com");
    expect(redacted).not.toContain("555-0188");
    expect(redacted).toContain("[redacted-email]");
    expect(redacted).toContain("[redacted-phone]");
    expect(redacted).toContain("S5-L1");
    expect(redacted).toContain("POD-TIMESTAMP-1");
  });

  it("redacts the Forensics model-context trace before any model delta", () => {
    const run = runForensicsInvestigation({
      analystContext: "Maya can be reached at maya@example.com or 555-0188.",
      governedConfig,
      serviceContext: fixtureForensicsServiceContext,
      source
    });
    const modelContext = run.trace.find(isModelContextEvent);

    expect(modelContext?.payload.text).toContain("[redacted-email]");
    expect(modelContext?.payload.text).toContain("[redacted-phone]");
    expect(modelContext?.payload.text).not.toContain("maya@example.com");
    expect(modelContext?.payload.text).not.toContain("555-0188");
  });
});

function isModelContextEvent(event: ForensicsTraceEvent): event is Extract<ForensicsTraceEvent, { type: "status" }> {
  return event.type === "status" && event.payload.kind === "model-context";
}
