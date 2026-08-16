import { describe, expect, it } from "vitest";
import { buildCreditRecommendationFlow } from "../../cockpit/components/shared/credit-recommendation-flow.js";

describe("credit recommendation flow", () => {
  it("names roles rather than people", () => {
    const flow = buildCreditRecommendationFlow({ acknowledged: false, approved: false });

    expect(flow.steps.map((step) => step.label)).toEqual([
      "Forensics analyst raises",
      "Human approval",
      "Credit lead acknowledges"
    ]);
    for (const step of flow.steps) {
      expect(step.label).not.toContain("Maya");
      expect(step.label).not.toContain("David");
    }
  });

  it("sits on the approval step while the recommendation is only raised", () => {
    const flow = buildCreditRecommendationFlow({ acknowledged: false, approved: false });

    expect(flow.currentIndex).toBe(1);
    expect(flow.steps[0]?.state).toBe("done");
    expect(flow.steps[1]?.state).toBe("current");
    expect(flow.steps[2]?.state).toBe("waiting");
    expect(flow.summary).toBe("Waiting for human approval.");
  });

  it("advances to acknowledgement once a human has approved", () => {
    const flow = buildCreditRecommendationFlow({ acknowledged: false, approved: true });

    expect(flow.currentIndex).toBe(2);
    expect(flow.steps[1]?.state).toBe("done");
    expect(flow.steps[2]?.state).toBe("current");
    expect(flow.summary).toBe("Waiting for the credit lead to acknowledge.");
  });

  it("completes once the credit lead acknowledges", () => {
    const flow = buildCreditRecommendationFlow({ acknowledged: true, approved: true });

    expect(flow.currentIndex).toBe(3);
    expect(flow.steps.every((step) => step.state === "done")).toBe(true);
    expect(flow.summary).toBe("Acknowledged by the credit lead.");
  });

  it("cannot be acknowledged before it is approved", () => {
    const flow = buildCreditRecommendationFlow({ acknowledged: true, approved: false });

    // Acknowledgement without an approval is not a reachable state; the flow must not report
    // completion for a decision that was never made.
    expect(flow.currentIndex).toBe(1);
    expect(flow.steps[2]?.state).toBe("waiting");
  });
});
