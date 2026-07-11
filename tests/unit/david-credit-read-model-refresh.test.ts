import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshDavidCreditReadModel } from "../../cockpit/components/david/refresh-credit-read-model.js";

describe("David credit read-model refresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for the governed David cache refresh route", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ surface: "credit-risk-review" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshDavidCreditReadModel()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/credit", {
      cache: "no-store",
      method: "POST"
    });
  });

  it("reports a failed refresh without hiding the committed mutation", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ error: "unavailable" }, { status: 502 }))));

    await expect(refreshDavidCreditReadModel()).resolves.toBe(false);
  });
});
