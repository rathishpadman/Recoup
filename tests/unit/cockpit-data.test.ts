import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConnectorReadinessModel, fetchEvalFinopsModel } from "../../cockpit/app/cockpit-data.ts";

describe("cockpit data client", () => {
  const originalPrincipal = process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL;
  const originalToken = process.env.RECOUP_COCKPIT_AUTH_TOKEN;

  afterEach(() => {
    restoreEnv("RECOUP_COCKPIT_HUMAN_PRINCIPAL", originalPrincipal);
    restoreEnv("RECOUP_COCKPIT_AUTH_TOKEN", originalToken);
    vi.unstubAllGlobals();
  });

  it("uses server cockpit auth headers for the Evals FinOps backend fetch", async () => {
    process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL = "human:cfo";
    process.env.RECOUP_COCKPIT_AUTH_TOKEN = "test-token";
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({
        agentMetrics: [],
        blockedInputs: [],
        evalGates: [],
        generatedAtIso: "2026-06-30T00:00:00.000Z",
        promptCache: {
          cachedInputTokens: 0,
          cacheHitRateLabel: "Usage unavailable",
          deterministicBasis: "test",
          recordIds: ["release-readiness"],
          savingsLabel: "Pricing not configured",
          savingsStatus: "pricing_not_configured_not_computed",
          status: "usage_unavailable",
          uncachedInputTokens: 0
        },
        provenance: {
          deterministicBasis: "test",
          recordIds: ["release-readiness"],
          sourceKind: "derived_backend",
          sourceName: "test"
        },
        recommendations: [],
        releaseReadiness: {
          blockers: [],
          status: "pass"
        },
        surface: "evals-finops",
        unitEconomics: []
      }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchEvalFinopsModel();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      headers: {
        "x-recoup-human-principal": "human:cfo",
        "x-recoup-human-token": "test-token"
      }
    });
  });

  it("uses server cockpit auth headers for the connector readiness backend fetch", async () => {
    process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL = "human:cfo";
    process.env.RECOUP_COCKPIT_AUTH_TOKEN = "test-token";
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({
        checkedAtIso: "2026-07-02T00:00:00.000Z",
        connectors: [],
        lastRefreshedLabel: "No source health rows checked",
        provenance: {
          deterministicBasis: "test",
          recordIds: ["connectors"],
          sourceKind: "derived_backend",
          sourceName: "test"
        },
        sourceHealth: [],
        sourceTiles: [],
        surface: "connector-readiness"
      }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchConnectorReadinessModel();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      headers: {
        "x-recoup-human-principal": "human:cfo",
        "x-recoup-human-token": "test-token"
      }
    });
  });
});

function restoreEnv(name: "RECOUP_COCKPIT_AUTH_TOKEN" | "RECOUP_COCKPIT_HUMAN_PRINCIPAL", value: string | undefined): void {
  if (value === undefined) {
    if (name === "RECOUP_COCKPIT_AUTH_TOKEN") {
      delete process.env.RECOUP_COCKPIT_AUTH_TOKEN;
      return;
    }

    delete process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL;
    return;
  }

  process.env[name] = value;
}
