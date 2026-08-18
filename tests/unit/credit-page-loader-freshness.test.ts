import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * The credit page renders from its own cache-first loader, not from /api/credit. The approval
 * freshness rule was wired into the route only, so an approval committed a moment earlier stayed
 * invisible on the page David actually opens.
 */
const cacheModulePath = "../../cockpit/app/api/read-model-cache.ts";
const dataModulePath = "../../cockpit/app/cockpit-data.ts";

function creditPayload(scenarioIds: readonly string[]): Record<string, unknown> {
  return {
    accounts: [{ accountId: "ACC-CRE", signals: scenarioIds.map((scenarioId) => ({ scenarioId })) }],
    surface: "credit-risk-review"
  };
}

async function loadWith(input: {
  cachedPayload: Record<string, unknown>;
  committedActionIds: ReadonlySet<string> | undefined;
  upstream: ReturnType<typeof vi.fn>;
}): Promise<Record<string, unknown>> {
  vi.resetModules();
  vi.doMock(cacheModulePath, async () => {
    const actual = await vi.importActual<Record<string, unknown>>(cacheModulePath);
    return {
      ...actual,
      readCachedReadModelPayload: vi.fn(() =>
        Promise.resolve({ payload: input.cachedPayload, sourceRefreshedAt: "2026-08-18T06:00:00.000Z" })
      ),
      readCommittedCreditRecommendationActionIds: vi.fn(() => Promise.resolve(input.committedActionIds))
    };
  });
  vi.doMock(dataModulePath, () => ({ fetchCreditRiskReviewModel: input.upstream }));

  const { fetchCreditRiskReviewModelCacheFirst } = await import("../../cockpit/app/credit/credit-read-model.ts");

  return (await fetchCreditRiskReviewModelCacheFirst()) as unknown as Record<string, unknown>;
}

describe("credit page cache-first loader", () => {
  it("bypasses the cache when a committed approval is missing from the cached signals", async () => {
    const fresh = creditPayload([
      "S2",
      "S3",
      "S6",
      "credit-recommendation:S3-L1:band-downgrade",
      "credit-recommendation:S3-L1:terms-change"
    ]);
    const upstream = vi.fn(() => Promise.resolve(fresh));

    const model = await loadWith({
      cachedPayload: creditPayload(["S2", "S3", "S6"]),
      committedActionIds: new Set([
        "credit-recommendation:S3-L1:band-downgrade",
        "credit-recommendation:S3-L1:terms-change"
      ]),
      upstream
    });

    expect(upstream).toHaveBeenCalledTimes(1);
    expect((model["accounts"] as Array<{ signals: unknown[] }>)[0]?.signals).toHaveLength(5);
  });

  it("serves the cache when its signals already agree with the committed approvals", async () => {
    const upstream = vi.fn(() => Promise.resolve(creditPayload([])));

    const model = await loadWith({
      cachedPayload: creditPayload(["S2"]),
      committedActionIds: new Set<string>(),
      upstream
    });

    expect(upstream).not.toHaveBeenCalled();
    expect((model["accounts"] as Array<{ signals: unknown[] }>)[0]?.signals).toHaveLength(1);
  });

  it("keeps serving the cache when the approval store cannot be read", async () => {
    // This surface exists so the credit view survives a slow backend, and a store that cannot be
    // read is also one that could not have accepted a new approval.
    const upstream = vi.fn(() => Promise.resolve(creditPayload([])));

    await loadWith({ cachedPayload: creditPayload([]), committedActionIds: undefined, upstream });

    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("David account dossier tiles", () => {
  it("shows the order received rather than the account exposure, and names credit utilisation", () => {
    const source = readFileSync("cockpit/components/david/david-account-dossier.tsx", "utf8");

    // The tile said "Exposure" against the whole AR balance, which is not what the reviewer is
    // deciding on: the decision is about the order in front of them. The amount comes from the
    // negotiation order already on the model, so no new figure is computed in the component.
    expect(source).toContain("Order received");
    expect(source).toContain("orderAmountLabel");
    expect(source).toContain("Credit utilisation");
    expect(source).not.toMatch(/>\s*Exposure\s*</u);
  });
});
