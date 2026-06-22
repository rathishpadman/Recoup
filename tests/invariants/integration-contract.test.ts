import { describe, expect, it } from "vitest";
import { serviceToolMetadata, serviceTools, invokeServiceTool } from "../../src/services/serviceLayer.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";

describe("integration contract", () => {
  it("exposes approval, audit, query, and retrieval tools through the typed whitelist", () => {
    expect(Object.keys(serviceTools).sort()).toEqual([
      "actions.draftOutreach",
      "actions.draftRebill",
      "actions.proposeHold",
      "actions.proposeTerms",
      "actions.routeBilling",
      "approvals.decide",
      "audit.read",
      "core.evaluateRule",
      "core.riskMeshClosedLoop",
      "decisions.deductionVerdict",
      "query.answer",
      "retrieval.docs",
      "retrieval.sap",
      "retrieval.tpm"
    ]);
  });

  it("exposes a disabled offline-safe query agent that cites deterministic state instead of calling Realtime", async () => {
    const { answerOfflineQuery } = await import("../../src/agents/query.js");

    expect(
      answerOfflineQuery({
        question: "What changed for Harbor?"
      })
    ).toMatchObject({
      status: "disabled_offline_safe",
      modelExecution: "blocked: offline build does not invoke live model calls"
    });
    const answer = answerOfflineQuery({
      question: "What changed for Harbor?"
    });
    expect(answer.answer).toContain("verify-runtime-config-loader-required");
    expect(answer.answer).not.toContain("r-score-weights-unset");
    expect(answer.recordIds).toContain("CUST-HARBOR");
    expect(answer.deterministicBasis).toContain("audit.read");
  });

  it("keeps Realtime browser query on read-only query and audit tools", async () => {
    const { buildRealtimeToolManifest } = await import("../../src/services/realtimeSession.js");
    const manifest = buildRealtimeToolManifest();

    expect(manifest.map((tool) => tool.name)).toEqual(["audit.read", "query.answer"]);
    expect(manifest.every((tool) => Object.hasOwn(serviceTools, tool.name))).toBe(true);
    expect(manifest.map((tool) => serviceToolMetadata[tool.name].sideEffectClass)).toEqual(["none", "none"]);
  });

  it("reads audit entries through a bounded service tool", () => {
    const result = invokeServiceTool("audit.read", { caseId: "ARB-HARBOR-ORDER-640K" });

    expect(result).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      auditTrailValid: true
    });
    expect(
      (result as { auditEntries: Array<{ entryHash: string }> }).auditEntries.every((entry) =>
        /^[a-f0-9]{64}$/u.test(entry.entryHash)
      )
    ).toBe(true);
    expect(JSON.stringify(result)).toContain("partial-hold.proposed");
  });

  it("routes approval decisions through a bounded HITL service tool with verified human context", () => {
    const [action] = runForensicsInvestigation().actions;
    if (action === undefined) {
      throw new Error("Forensics run must stage at least one action.");
    }

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: action.actionId,
        decision: "approve",
        approverId: "human:spoofed-service-caller"
      })
    ).toThrow("Verified human service context required.");

    const approval = invokeServiceTool("approvals.decide", {
      actionId: action.actionId,
      decision: "approve",
      approverId: "human:spoofed-service-caller"
    }, {
      verifiedHumanPrincipal: "human:maya-lead"
    }) as {
      actionId: string;
      auditEntryHash: string;
      approverId: string;
      decision: string;
      status: string;
    };

    expect(approval).toMatchObject({
      actionId: action.actionId,
      decision: "approve",
      approverId: "human:maya-lead",
      status: "human_decided"
    });
    expect(approval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: action.actionId,
        decision: "reject",
        approverId: "human:maya-lead",
        reason: "This should not replace the already-recorded approval."
      }, {
        verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Action already has a human decision.");

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: action.actionId,
        decision: "approve",
        approverId: "agent:credit-lead"
      }, {
        verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Client approver identity must be human-scoped.");

    const [, secondAction] = runForensicsInvestigation().actions;
    if (secondAction === undefined) {
      throw new Error("Forensics run must stage at least two actions.");
    }

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: secondAction.actionId,
        decision: "reject",
        approverId: "human:maya-lead",
        reason: "Contact maya@example.com before rejecting."
      }, {
        verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Approval reason must not contain direct PII or secrets.");

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: secondAction.actionId,
        decision: "reject",
        approverId: "human:maya-lead",
        reason: "        "
      }, {
        verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Reason required for modify or reject decisions.");

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: "missing-action",
        decision: "approve",
        approverId: "human:maya"
      }, {
        verifiedHumanPrincipal: "human:maya"
      })
    ).toThrow("Action not found.");
  });

  it("keeps SAP OData integration read-only and evidence-shaped", async () => {
    const { SapODataReadOnlyAdapter, SapODataReadOnlyClient } = await import("../../src/adapters/sapOData.js");
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines[0];
    if (line === undefined) {
      throw new Error("Synthetic dataset must include at least one deduction line.");
    }
    const adapter = new SapODataReadOnlyAdapter();
    const methodNames = Object.getOwnPropertyNames(SapODataReadOnlyAdapter.prototype).sort();
    const instanceMethodNames = Object.entries(adapter)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    const clientMethodNames = Object.getOwnPropertyNames(SapODataReadOnlyClient.prototype).sort();

    expect(methodNames).toEqual([
      "buildReadRequestPlan",
      "buildRequest",
      "constructor",
      "describeReadiness",
      "retrieveBillingDocument",
      "retrieveDeductionCase",
      "retrieveDeductionCaseLive",
      "retrieveDeliveryItem",
      "retrieveReferenceDocuments"
    ]);
    expect(methodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    expect(instanceMethodNames).toEqual(["buildMetadataValidatedReadRequestPlan"]);
    expect(instanceMethodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    expect(clientMethodNames).toEqual(["buildServiceUrl", "constructor", "fetchJson", "fetchMetadata", "fetchReadRequest"]);
    expect(clientMethodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    const documents = adapter.retrieveDeductionCase(line);
    expect(documents.some((document) => document.source === "sap" && document.recordIds.includes(line.lineId))).toBe(true);
  });

  it("exposes only whitelisted service tools through the MCP facade", async () => {
    const { createMcpToolFacade } = await import("../../src/mcp/server.js");
    const facade = createMcpToolFacade();

    expect(facade.listTools().map((tool) => tool.name).sort()).toEqual([
      "actions.draftOutreach",
      "actions.draftRebill",
      "actions.proposeHold",
      "actions.proposeTerms",
      "actions.routeBilling",
      "audit.read",
      "query.answer",
      "retrieval.docs",
      "retrieval.sap",
      "retrieval.tpm"
    ]);
    expect(() => facade.callTool("actions.erpWrite", {})).toThrow("Tool is not exposed through MCP.");
    expect(() => facade.callTool("core.evaluateRule", {})).toThrow("Tool is not exposed through MCP.");
    expect(() => facade.callTool("approvals.decide", {})).toThrow("Tool is not exposed through MCP.");
    expect(facade.callTool("query.answer", { question: "Show cited status" })).toMatchObject({
      status: "disabled_offline_safe"
    });
  });
});
