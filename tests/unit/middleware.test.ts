import { describe, expect, it } from "vitest";
import { buildRunControlStatus, type RunControlConfig } from "../../src/services/conductor.js";
import { buildRunBudgetMiddlewareStatus } from "../../src/middleware/budgets.js";
import { createJsonBodyErrorHandler, isJsonBodyParseError } from "../../src/middleware/errors.js";
import {
  createCorrelationIdMiddleware,
  readRequestCorrelationId,
  recoupCorrelationIdHeader
} from "../../src/middleware/logging.js";

describe("shared middleware", () => {
  it("recognizes Express JSON body parse failures", () => {
    expect(isJsonBodyParseError({ type: "entity.parse.failed" })).toBe(true);
    expect(isJsonBodyParseError(new Error("ordinary failure"))).toBe(false);
  });

  it("keeps run budget middleware explicitly blocked until DB-backed Appendix G values are configured", () => {
    expect(buildRunBudgetMiddlewareStatus()).toEqual(buildRunControlStatus());
  });

  it("reports run budget middleware status from an injected DB-backed run-control snapshot", () => {
    expect(buildRunBudgetMiddlewareStatus(runControlConfig)).toEqual({
      approvedBy: "human:owner-run-control",
      retryCapPhaseCount: 6,
      status: "pass",
      stepBudgetPhaseCount: 6,
      tokenBudgetPhaseCount: 6
    });
  });

  it("attaches a deterministic request correlation id for async hops", () => {
    const request = {
      header(name: string) {
        return name === recoupCorrelationIdHeader ? "run-42:MAYA" : undefined;
      }
    };
    const response = {
      headers: new Map<string, string>(),
      setHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
      }
    };
    let nextCalled = false;

    createCorrelationIdMiddleware()(request as never, response as never, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(readRequestCorrelationId(request as never)).toBe("run-42:MAYA");
    expect(response.headers.get(recoupCorrelationIdHeader)).toBe("run-42:MAYA");
  });

  it("replaces unsafe inbound request correlation ids", () => {
    const request = {
      header(name: string) {
        return name === recoupCorrelationIdHeader ? "unsafe header\nvalue" : undefined;
      }
    };
    const response = {
      headers: new Map<string, string>(),
      setHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
      }
    };

    createCorrelationIdMiddleware()(request as never, response as never, () => undefined);

    expect(readRequestCorrelationId(request as never)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(response.headers.get(recoupCorrelationIdHeader)).not.toBe("unsafe header\nvalue");
  });

  it("routes configured JSON body parse failures to compact JSON responses", () => {
    const handler = createJsonBodyErrorHandler([
      {
        message: "Invalid run request.",
        method: "POST",
        path: "/run"
      }
    ]);
    const response = {
      statusCode: 200,
      body: undefined as unknown,
      json(body: unknown) {
        this.body = body;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      }
    };
    let nextCalled = false;

    handler(
      { type: "entity.parse.failed" },
      { method: "POST", path: "/run" } as never,
      response as never,
      () => {
        nextCalled = true;
      }
    );

    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Invalid run request." });
  });
});

const runControlConfig: RunControlConfig = {
  approvedBy: "human:owner-run-control",
  phases: {
    containment: { retryCap: 2, stepBudget: 24, tokenBudget: 45000 },
    forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 },
    query: { retryCap: 1, stepBudget: 12, tokenBudget: 32000 },
    recovery: { retryCap: 2, stepBudget: 40, tokenBudget: 90000 },
    riskMesh: { retryCap: 2, stepBudget: 36, tokenBudget: 90000 },
    sentinel: { retryCap: 2, stepBudget: 30, tokenBudget: 70000 }
  }
};
