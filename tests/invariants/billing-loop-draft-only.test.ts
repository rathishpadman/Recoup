import { describe, expect, it } from "vitest";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";

describe("I-23 billing loop draft-only", () => {
  it("routes valid deductions to Billing as projected draft recommendations only", () => {
    const run = runForensicsInvestigation();
    const billingDrafts = run.actions.filter((action) => action.actionType === "route-billing");

    expect(billingDrafts).toHaveLength(7);
    expect(billingDrafts.map((draft) => draft.status)).toEqual(Array<string>(7).fill("pending_human"));
    expect(billingDrafts.map((draft) => draft.dispatchedExternally)).toEqual(Array<boolean>(7).fill(false));
    expect(billingDrafts.map((draft) => draft.recommendation.leakageStatus)).toEqual(
      Array<string>(7).fill("projected")
    );
    expect(billingDrafts.map((draft) => draft.recommendation.type)).toEqual(
      Array<string>(7).fill("billing-prevention-draft")
    );
    expect(billingDrafts.map((draft) => draft.recommendation.externalWrite)).toEqual(Array<boolean>(7).fill(false));
    expect(
      billingDrafts.every(
        (draft) =>
          draft.recommendation.basis.length > 0 &&
          draft.recommendation.recordIds.length > 0
      )
    ).toBe(true);
  });
});
