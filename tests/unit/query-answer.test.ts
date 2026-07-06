import { describe, expect, it } from "vitest";
import { buildDeterministicForensicsQueryAnswer } from "../../src/agents/query.js";

const baseInput = {
  basis: "Signed POD shows full delivery against the claimed shortage.",
  citationRecordIds: ["S3-L1", "EVD-POD-S3-L1", "RECON-S3-L1"],
  routing: "recovery",
  selectedLineId: "S3-L1",
  verdict: "invalid"
} as const;

describe("deterministic forensics query answers", () => {
  it("keeps approval-gate questions distinct from generic verdict summaries", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "What should I tell my manager before I ask for approval on the recovery draft?"
    });

    expect(answer).toContain("Before Maya opens approval");
    expect(answer).toContain("human approval");
    expect(answer).toContain("S3-L1");
    expect(answer).toContain("recovery");
  });

  it("keeps route questions focused on the route decision", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "Is this a billing correction or a recovery pursuit, and what proof drives that route?"
    });

    expect(answer).toContain("belongs with recovery");
    expect(answer).toContain("current invalid finding");
    expect(answer).toContain("Signed POD shows full delivery");
  });

  it("does not treat investigate phrasing as an approval-gate question", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "Investigate why this routed to recovery and what proof supports it."
    });

    expect(answer).toContain("belongs with recovery");
    expect(answer).not.toContain("Before Maya opens approval");
    expect(answer).not.toContain("human approval");
  });

  it("keeps counterfactual valid-deduction questions distinct from the default summary", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question:
        "What cited evidence would make this a valid deduction, and which selected SAP or document records show that this case does not meet that valid-deduction pattern?"
    });

    expect(answer).toContain("A valid deduction would need cited evidence");
    expect(answer).toContain("Instead, the selected evidence supports");
    expect(answer).toContain("invalid verdict");
  });

  it("retains cited record IDs in every answer path", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?"
    });

    expect(answer).toContain("The answer is limited to cited record IDs");
    expect(answer).toContain("S3-L1");
    expect(answer).toContain("EVD-POD-S3-L1");
    expect(answer).toContain("RECON-S3-L1");
  });
});
