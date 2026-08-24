import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import type { WorkflowRepository } from "../../src/services/workflowRepository.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * POST /rehearsal/send-test-payment lets an operator run a scenario without a
 * command line.
 *
 * Until now sending a test payment meant a signed request, so a finance user
 * could look at results but never produce any. The guide had to tell them to
 * ask someone technical, which is the wrong answer for the person the screen
 * is built for.
 *
 * It posts the confirmation and the note itself, so the shared secret stays on
 * the server and never reaches the browser.
 */

const baseEnv: RuntimeEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true",
  RECOUP_CASH_INTAKE_ENABLED: "true",
  RECOUP_INBOUND_PROVIDER: "gmail",
  RECOUP_INBOUND_SHARED_SECRET: "server-side-secret",
  RECOUP_INBOUND_APPROVED_RECIPIENT: "remittance@recoup.example",
  RECOUP_INBOUND_ALLOWED_SENDERS: "ar@customer.example",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  SUPABASE_URL: "https://stub.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "stub-key"
};

const adminAuth = {
  "x-recoup-human-principal": "human:maya-lead",
  "x-recoup-human-token": "test-human-token"
};

async function startApi(
  env: RuntimeEnv,
  repository: WorkflowRepository
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    createCockpitApi({
      env,
      workflowRepository: repository,
      // The receipt write goes to Supabase; accept it so the scenario can run.
      cashReceiptWriteFetcher: () => Promise.resolve(new Response("[]", { status: 201 }))
    })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve) => server.close(() => { resolve(); }))
  };
}

async function send(
  baseUrl: string,
  body: unknown,
  headers: Record<string, string> = adminAuth
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/rehearsal/send-test-payment`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });

  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe("POST /rehearsal/send-test-payment", () => {
  it("runs the happy path scenario and starts a run", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi(baseEnv, repository);

    try {
      const result = await send(api.baseUrl, { scenario: "short-payment" });

      expect(result.status).toBe(202);
      expect(typeof result.json.runId).toBe("string");
      expect(await repository.listRuns()).toHaveLength(1);
    } finally {
      await api.close();
    }
  });

  it("gives every send its own references so two runs never collide", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi(baseEnv, repository);

    try {
      const first = await send(api.baseUrl, { scenario: "short-payment" });
      const second = await send(api.baseUrl, { scenario: "short-payment" });

      // Reusing a reference would be read as a duplicate and refused, which
      // would make the button work exactly once.
      expect(first.json.runId).not.toBe(second.json.runId);
      expect(await repository.listRuns()).toHaveLength(2);
    } finally {
      await api.close();
    }
  });

  it("holds when the scenario says the money never arrived", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi(baseEnv, repository);

    try {
      const result = await send(api.baseUrl, { scenario: "no-receipt" });

      expect(result.status).toBe(202);
      expect(result.json.state).toBe("AwaitingCashReceipt");
    } finally {
      await api.close();
    }
  });

  it("refuses a scenario nobody defined", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi(baseEnv, repository);

    try {
      const result = await send(api.baseUrl, { scenario: "make-something-up" });

      expect(result.status).toBe(422);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("refuses an unauthenticated caller", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi(baseEnv, repository);

    try {
      const result = await send(api.baseUrl, { scenario: "short-payment" }, {});

      expect(result.status).toBe(401);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("does not exist when rehearsal is off", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ ...baseEnv, RECOUP_CASH_ROLLOUT_STAGE: "disabled" }, repository);

    try {
      const result = await send(api.baseUrl, { scenario: "short-payment" });

      expect(result.status).toBe(404);
    } finally {
      await api.close();
    }
  });

  it("lists the scenarios it can send", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi(baseEnv, repository);

    try {
      const response = await fetch(`${api.baseUrl}/rehearsal/test-payment-scenarios`, {
        headers: adminAuth
      });
      const body = (await response.json()) as { scenarios?: { id: string; name: string }[] };

      expect(response.status).toBe(200);
      // The dropdown is built from this, so it has to describe each one.
      expect(body.scenarios?.length).toBeGreaterThanOrEqual(5);
      expect(body.scenarios?.every((entry) => entry.name.length > 0)).toBe(true);
    } finally {
      await api.close();
    }
  });
});
