import { describe, expect, it } from "vitest";

import { resolveWorkflowRepository } from "../../src/services/workflowRepositoryFactory.js";

describe("workflow repository selection", () => {
  it("selects Supabase when both coordinates are configured", () => {
    const resolved = resolveWorkflowRepository({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key"
    });

    expect(resolved.kind).toBe("supabase");
    expect(resolved.durable).toBe(true);
    expect(resolved.reason).toBeUndefined();
  });

  it.each([
    ["neither", {}],
    ["only the url", { SUPABASE_URL: "https://example.supabase.co" }],
    ["only the key", { SUPABASE_SERVICE_ROLE_KEY: "key" }],
    ["a blank url", { SUPABASE_URL: "   ", SUPABASE_SERVICE_ROLE_KEY: "key" }]
  ])("falls back to memory and says so with %s", (_label, env) => {
    const resolved = resolveWorkflowRepository(env);

    expect(resolved.kind).toBe("in_memory");
    expect(resolved.durable).toBe(false);
    expect(resolved.reason).toMatch(/not durable/u);
  });

  it("names the missing variable so a misconfiguration is diagnosable", () => {
    const resolved = resolveWorkflowRepository({ SUPABASE_URL: "https://example.supabase.co" });
    expect(resolved.reason).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(resolved.reason).not.toContain("SUPABASE_URL,");
  });

  it("never puts a key value into the reason string", () => {
    const resolved = resolveWorkflowRepository({ SUPABASE_SERVICE_ROLE_KEY: "super-secret-key" });
    expect(resolved.reason).not.toContain("super-secret-key");
  });

  it("returns a working repository either way", async () => {
    const memory = resolveWorkflowRepository({});
    expect(await memory.repository.listCases()).toEqual([]);
  });

  it("does not consult the rollout stage when choosing storage", () => {
    const staged = resolveWorkflowRepository({ RECOUP_CASH_ROLLOUT_STAGE: "production" });
    expect(staged.kind).toBe("in_memory");
  });
});
