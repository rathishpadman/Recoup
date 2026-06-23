import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { serviceToolMetadata, serviceTools, invokeServiceTool } from "../../src/services/serviceLayer.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const runForensics = () => runForensicsInvestigation({ governedConfig, serviceContext: fixtureForensicsServiceContext, source });

describe("integration contract", () => {
  it("exposes approval, audit, query, and retrieval tools through the typed whitelist", () => {
    expect(Object.keys(serviceTools).sort()).toEqual([
      "actions.draftOutreach",
      "actions.draftRebill",
      "actions.proposeHold",
      "actions.proposeTerms",
      "actions.routeBilling",
      "agent_tool_containment_intent_position",
      "agent_tool_sentinel_position",
      "approvals.decide",
      "audit.read",
      "core.evaluateRule",
      "core.riskMeshClosedLoop",
      "decisions.deductionVerdict",
      "query.answer",
      "retrieval.bureau",
      "retrieval.docs",
      "retrieval.sap",
      "retrieval.tpm",
      "sources.r1Read"
    ]);
  });

  it("exposes a disabled offline-safe query agent that cites deterministic state instead of calling Realtime", async () => {
    const { answerOfflineQuery } = await import("../../src/agents/query.js");

    expect(
      answerOfflineQuery({ governedConfig, source, question: "What changed for Harbor?" })
    ).toMatchObject({
      status: "disabled_offline_safe",
      modelExecution: "blocked: offline build does not invoke live model calls"
    });
    const answer = answerOfflineQuery({ governedConfig, source, question: "What changed for Harbor?" });
    expect(answer.answer).toContain("source-risk-observation-fields-required");
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
    const result = invokeServiceTool("audit.read", { caseId: "ARB-HARBOR-ORDER-640K" }, { governedConfig, source });

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

  it("validates HITL approval decisions but requires Supabase persistence for commit", () => {
    const [action] = runForensics().actions;
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

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: action.actionId,
        decision: "approve",
        approverId: "human:spoofed-service-caller"
    }, {
      ...fixtureForensicsServiceContext,
      governedConfig,
      source,
      verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Supabase approval persistence required for approvals.decide.");

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: action.actionId,
        decision: "approve",
        approverId: "agent:credit-lead"
    }, {
      ...fixtureForensicsServiceContext,
      governedConfig,
      source,
      verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Client approver identity must be human-scoped.");

    const [, secondAction] = runForensics().actions;
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
      ...fixtureForensicsServiceContext,
      governedConfig,
      source,
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
      ...fixtureForensicsServiceContext,
      governedConfig,
      source,
      verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Reason required for modify or reject decisions.");

    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: "missing-action",
        decision: "approve",
        approverId: "human:maya"
    }, {
      ...fixtureForensicsServiceContext,
      governedConfig,
      source,
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
    expect(instanceMethodNames).toEqual(["buildMetadataValidatedR1ReadRequestPlan", "buildMetadataValidatedReadRequestPlan"]);
    expect(instanceMethodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    expect(clientMethodNames).toEqual(["buildServiceUrl", "constructor", "fetchJson", "fetchMetadata", "fetchReadRequest"]);
    expect(clientMethodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    const documents = adapter.retrieveDeductionCase(line);
    expect(documents.some((document) => document.source === "sap" && document.recordIds.includes(line.lineId))).toBe(true);
  });

  it("exposes only whitelisted service tools through the MCP facade", async () => {
    const { createMcpToolFacade } = await import("../../src/mcp/server.js");
    const facade = createMcpToolFacade({ serviceContext: { governedConfig, source } });

    expect(facade.listTools().map((tool) => tool.name).sort()).toEqual([
      "actions.draftOutreach",
      "actions.draftRebill",
      "actions.proposeHold",
      "actions.proposeTerms",
      "actions.routeBilling",
      "agent_tool_containment_intent_position",
      "agent_tool_sentinel_position",
      "audit.read",
      "query.answer",
      "retrieval.bureau",
      "retrieval.docs",
      "retrieval.sap",
      "retrieval.tpm",
      "sources.r1Read"
    ]);
    expect(() => facade.callTool("actions.erpWrite", {})).toThrow("Tool is not exposed through MCP.");
    expect(() => facade.callTool("core.evaluateRule", {})).toThrow("Tool is not exposed through MCP.");
    expect(() => facade.callTool("approvals.decide", {})).toThrow("Tool is not exposed through MCP.");
    expect(facade.callTool("query.answer", { question: "Show cited status" })).toMatchObject({
      status: "disabled_offline_safe"
    });
    expect(facade.callTool("sources.r1Read", { need: "payment-history", customerId: "USCU_S04" })).toMatchObject({
      need: "payment-history",
      sourceMode: "supabase_authoritative"
    });
    expect(facade.callTool("agent_tool_sentinel_position", { caseId: "ARB-HARBOR-ORDER-640K" })).toMatchObject({
      customerId: "CUST-HARBOR",
      status: "blocked"
    });
    expect(facade.callTool("agent_tool_containment_intent_position", { caseId: "ARB-HARBOR-ORDER-640K" })).toMatchObject({
      contained: false,
      customerId: "CUST-HARBOR",
      intentLabel: "distressed-honest"
    });
  });
});
