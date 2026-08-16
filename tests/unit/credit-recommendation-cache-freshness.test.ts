import { describe, expect, it } from "vitest";
import {
  cachedCreditRecommendationActionIds,
  cachedCreditRecommendationSignalActionIds,
  cachedCreditRecommendationStateIsFresh,
  cachedCreditSignalsAgreeWithApprovals
} from "../../cockpit/app/api/read-model-cache.js";

function creditPayloadWith(scenarioIds: string[]): Record<string, unknown> {
  return {
    accounts: [
      { accountId: "ACC-CRE", signals: scenarioIds.map((scenarioId) => ({ scenarioId })) },
      { accountId: "ACC-HAR", signals: [{ scenarioId: "S7" }] }
    ]
  };
}

function payloadWith(statuses: Array<{ actionId: string; status: string }>): Record<string, unknown> {
  return {
    creditRecommendations: statuses.map(({ actionId, status }) => ({
      actionId,
      kind: actionId.endsWith("terms-change") ? "terms-change" : "band-downgrade",
      status,
      statusLabel: status === "human_decided" ? "Human decision recorded" : "Awaiting approval"
    }))
  };
}

describe("credit recommendation cache freshness", () => {
  it("collects the cached recommendation action IDs", () => {
    const ids = cachedCreditRecommendationActionIds(
      payloadWith([
        { actionId: "credit-recommendation:S3-L1:band-downgrade", status: "pending_human" },
        { actionId: "credit-recommendation:S3-L1:terms-change", status: "pending_human" }
      ])
    );

    expect(ids).toEqual([
      "credit-recommendation:S3-L1:band-downgrade",
      "credit-recommendation:S3-L1:terms-change"
    ]);
  });

  it("treats a cached pending recommendation as stale once its approval is committed", () => {
    // This is the reported bug: approving in Maya left the cached payload untouched, so a reload
    // re-offered the approve control for a decision that had already been recorded.
    const payload = payloadWith([{ actionId: "credit-recommendation:S3-L1:band-downgrade", status: "pending_human" }]);

    expect(
      cachedCreditRecommendationStateIsFresh(payload, new Set(["credit-recommendation:S3-L1:band-downgrade"]))
    ).toBe(false);
  });

  it("treats a cached approved recommendation as stale if its approval no longer exists", () => {
    const payload = payloadWith([{ actionId: "credit-recommendation:S3-L1:terms-change", status: "human_decided" }]);

    expect(cachedCreditRecommendationStateIsFresh(payload, new Set())).toBe(false);
  });

  it("keeps a cached payload fresh when every recommendation agrees with the committed approvals", () => {
    const payload = payloadWith([
      { actionId: "credit-recommendation:S3-L1:band-downgrade", status: "human_decided" },
      { actionId: "credit-recommendation:S3-L1:terms-change", status: "pending_human" }
    ]);

    expect(
      cachedCreditRecommendationStateIsFresh(payload, new Set(["credit-recommendation:S3-L1:band-downgrade"]))
    ).toBe(true);
  });

  it("keeps a payload without recommendations fresh", () => {
    expect(cachedCreditRecommendationStateIsFresh({}, new Set())).toBe(true);
    expect(cachedCreditRecommendationActionIds({})).toEqual([]);
  });

  it("finds recommendation signals across accounts and ignores deduction signals", () => {
    expect(
      cachedCreditRecommendationSignalActionIds(
        creditPayloadWith(["S3", "credit-recommendation:S3-L1:terms-change"])
      )
    ).toEqual(["credit-recommendation:S3-L1:terms-change"]);
  });

  it("treats the credit surface as stale when an approval is not yet reflected in its signals", () => {
    // The reported symptom: approve, open the credit surface immediately, see nothing.
    const payload = creditPayloadWith(["S3"]);

    expect(
      cachedCreditSignalsAgreeWithApprovals(payload, new Set(["credit-recommendation:S3-L1:terms-change"]))
    ).toBe(false);
  });

  it("treats the credit surface as stale when it still shows a withdrawn approval", () => {
    const payload = creditPayloadWith(["credit-recommendation:S3-L1:terms-change"]);

    expect(cachedCreditSignalsAgreeWithApprovals(payload, new Set())).toBe(false);
  });

  it("keeps the credit surface fresh when its signals match the committed approvals", () => {
    const payload = creditPayloadWith(["S3", "credit-recommendation:S3-L1:terms-change"]);

    expect(
      cachedCreditSignalsAgreeWithApprovals(payload, new Set(["credit-recommendation:S3-L1:terms-change"]))
    ).toBe(true);
  });
});
