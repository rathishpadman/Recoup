import { describe, expect, it, vi } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import type { DecisionConfidenceThreshold } from "../../config/releaseOwnerInputs.js";
import { decisionEvalBars } from "../../config/thresholds.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import {
  runForensicsInvestigation,
  runForensicsInvestigationWithEvidenceSources,
  type ForensicsTraceEvent
} from "../../src/agents/forensics.js";
import { calculateAccuracy } from "../../evals/harness.js";
import { buildSyntheticDataset } from "../../datagen/generate.js";
import { createInMemoryStore } from "../../src/memory/store.js";
import { readAgentHandoffPacket, readTransactionState } from "../../src/memory/session.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const decisionConfidenceThreshold = {
  approvedBy: "human:rathish-owner",
  threshold: 0.8
} satisfies DecisionConfidenceThreshold;
const runForensics = (
  options: Omit<NonNullable<Parameters<typeof runForensicsInvestigation>[0]>, "governedConfig" | "serviceContext" | "source"> = {}
) =>
  runForensicsInvestigation({
    governedConfig,
    serviceContext: fixtureForensicsServiceContext,
    source,
    ...options
  });

describe("Forensics Investigator hero run", () => {
  it("fails closed when governed runtime config is not injected", () => {
    expect(() => runForensicsInvestigation(undefined)).toThrow("Governed runtime config snapshot required.");
  });

  it("fails closed when a settlement source snapshot is not injected", () => {
    expect(() => runForensicsInvestigation({ governedConfig } as Parameters<typeof runForensicsInvestigation>[0])).toThrow(
      "Forensics settlement source snapshot required."
    );
  });

  it("classifies the canonical settlement run with release-bar validity accuracy", () => {
    const run = runForensics();
    const labels = new Map(buildSyntheticDataset({ seed: 42 }).deductionLines.map((line) => [line.lineId, line.verdict]));
    const cases = run.decisions.map((decision) => ({
      predicted: decision.verdict,
      actual: labels.get(decision.lineId)
    }));

    expect(run.decisions).toHaveLength(20);
    expect(calculateAccuracy(cases)).toBeGreaterThanOrEqual(decisionEvalBars.deductionValidityAccuracy);
    expect(calculateAccuracy(cases)).toBe(1);
  });

  it("hands invalid and partial decisions to Recovery and routes valid decisions to draft Billing", () => {
    const run = runForensics();

    expect(run.actions.filter((action) => action.actionType === "route-billing")).toHaveLength(7);
    expect(run.actions.filter((action) => action.actionType === "draft-rebill")).toHaveLength(13);
    expect(run.actions.map((action) => action.status)).toEqual(Array<string>(20).fill("pending_human"));
    expect(run.actions.map((action) => action.dispatchedExternally)).toEqual(Array<boolean>(20).fill(false));
  });

  it("derives routing from computed verdicts instead of evaluation labels", () => {
    const run = runForensics();

    expect(run.decisions.every((decision) => !("actualVerdict" in decision))).toBe(true);
    expect(run.actions.filter((action) => action.actionType === "route-billing").map((action) => action.lineId)).toEqual(
      run.decisions.filter((decision) => decision.verdict === "valid").map((decision) => decision.lineId)
    );
    expect(run.actions.filter((action) => action.actionType === "draft-rebill").map((action) => action.lineId)).toEqual(
      run.decisions.filter((decision) => decision.verdict !== "valid").map((decision) => decision.lineId)
    );
  });

  it("emits a trace with a tool event, handoff, and Forensics model text delta", () => {
    const run = runForensics();

    expect(run.trace.some((event) => event.type === "finding" && event.payload.source === "tool")).toBe(true);
    expect(run.trace.some((event) => event.type === "status" && event.payload.kind === "handoff")).toBe(true);
    expect(run.trace.some((event) => event.type === "status" && event.payload.kind === "model-text-delta")).toBe(true);
  });

  it("keeps the default Forensics retrieval surface scoped to SAP docs and TPM", () => {
    const run = runForensics();
    const retrievalTools = [
      ...new Set(
        run.trace
          .filter(isServiceToolStatusEvent)
          .map((event) => event.payload.toolName)
          .filter((toolName) => toolName.startsWith("retrieval."))
      )
    ];

    expect(retrievalTools).toEqual(["retrieval.sap", "retrieval.docs", "retrieval.tpm"]);
  });

  it("does not perform default live evidence fetches when live evidence env vars are present", () => {
    const originalFetch = globalThis.fetch;
    const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    const originalVectorStoreId = process.env.OPENAI_EVIDENCE_VECTOR_STORE_ID;
    const originalSupabaseUrl = process.env.SUPABASE_URL;
    const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as never;
    process.env.OPENAI_API_KEY = "sk-test-secret";
    process.env.OPENAI_EVIDENCE_VECTOR_STORE_ID = "vs_test";
    process.env.SUPABASE_URL = "https://recoup.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-secret-key";
    try {
      runForensics({ analystContext: "Maya requested deterministic proof review with live credentials configured." });

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      restoreForensicsLiveEvidenceEnv({
        originalOpenAiApiKey,
        originalSupabaseServiceRoleKey,
        originalSupabaseUrl,
        originalVectorStoreId
      });
    }
  });

  it("does not report Supabase-backed run-control rows as unresolved static metadata", () => {
    const run = runForensics();

    expect(run.openDependencies).toEqual(["decision-confidence-threshold"]);
    expect(run.openDependencies).not.toContain("run-control-token-budget");
    expect(run.openDependencies).not.toContain("run-control-step-budget");
    expect(run.openDependencies).not.toContain("run-control-retry-cap");
  });

  it("computes deterministic decision confidence when the owner threshold is supplied", () => {
    const run = runForensics({ decisionConfidenceThreshold });
    const decision = run.decisions.find((candidate) => candidate.lineId === "S6-L1");

    expect(run.openDependencies).toEqual([]);
    expect(decision?.confidence).toEqual({
      deterministicBasis: {
        evidenceCompleteness: "1.0000",
        formula: "0.40*evidenceCompleteness + 0.30*sourceAgreement + 0.30*ruleMatchStrength",
        ruleMatchStrength: "1.0000",
        scoreSource: "deterministic-decision-confidence",
        sourceAgreement: "1.0000",
        thresholdSource: "recoup_config.decision_confidence_threshold"
      },
      route: "standard_draft_stage",
      score: "1.0000",
      threshold: "0.8000"
    });
  });

  it("persists cited transaction and handoff memory when a memory store is supplied", () => {
    const store = createInMemoryStore();
    const run = runForensics({ memoryStore: store, sessionId: "unit-run" });

    const decision = run.decisions.find((candidate) => candidate.lineId === "S1-L1");
    expect(decision).toBeDefined();
    expect(readTransactionState(store, "S1-L1", "deduction-decision")).toMatchObject({
      category: "transaction_state",
      payload: {
        key: "deduction-decision",
        value: {
          confidence: "blocked: decision-confidence-threshold unset",
          decisionId: "deduction-decision:S1-L1",
          producedBy: "agent:forensics-investigator",
          routing: "billing",
          ruleId: "damage-evidence-valid",
          verdict: "valid"
        }
      },
      recordIds: decision?.recordIds
    });
    expect(readAgentHandoffPacket(store, "forensics-recovery:unit-run")).toMatchObject({
      category: "agent_handoff_packets",
      payload: {
        capability: "B",
        caseId: "unit-run",
        deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
        fromAgent: "Forensics Investigator",
        intent: "stage-recovery-and-billing-drafts",
        status: "created",
        summary: "Forensics completed cited decisions and staged human-review recovery or Billing drafts.",
        toAgent: "Recovery Drafter"
      }
    });
  });

  it("can attach injected document-source evidence without changing deterministic decisions or HITL actions", async () => {
    const baseline = runForensics();
    const run = await runForensicsInvestigationWithEvidenceSources({ governedConfig, serviceContext: fixtureForensicsServiceContext, source, evidenceSources: {
        docs(line) {
          if (line.lineId !== "S6-L1") {
            return [];
          }

          return [
            {
              documentId: "VECTOR-CONTRACT-S6-L1",
              source: "docs",
              documentType: "contract",
              summary: "Vector-store contract support for S6-L1.",
              recordIds: ["S6-L1", "PRICE-CLAUSE-1"]
            }
          ];
        }
      }
    });

    const baselineDecision = baseline.decisions.find((decision) => decision.lineId === "S6-L1");
    const decision = run.decisions.find((candidate) => candidate.lineId === "S6-L1");
    const action = run.actions.find((candidate) => candidate.lineId === "S6-L1");

    expect(
      run.decisions.map((decision) => ({
        computedDeltaAmount: decision.deterministicBasis.computedDeltaAmount.toFixed(2),
        lineId: decision.lineId,
        routing: decision.routing,
        verdict: decision.verdict
      }))
    ).toEqual(
      baseline.decisions.map((decision) => ({
        computedDeltaAmount: decision.deterministicBasis.computedDeltaAmount.toFixed(2),
        lineId: decision.lineId,
        routing: decision.routing,
        verdict: decision.verdict
      }))
    );
    expect(
      run.actions.map((candidate) => ({
        actionType: candidate.actionType,
        dispatchedExternally: candidate.dispatchedExternally,
        lineId: candidate.lineId,
        status: candidate.status
      }))
    ).toEqual(
      baseline.actions.map((candidate) => ({
        actionType: candidate.actionType,
        dispatchedExternally: candidate.dispatchedExternally,
        lineId: candidate.lineId,
        status: candidate.status
      }))
    );
    expect(decision).toBeDefined();
    expect(baselineDecision).toBeDefined();
    expect(decision?.verdict).toBe(baselineDecision?.verdict);
    expect(decision?.routing).toBe(baselineDecision?.routing);
    expect(decision?.deterministicBasis.computedDeltaAmount.toFixed(2)).toBe(
      baselineDecision?.deterministicBasis.computedDeltaAmount.toFixed(2)
    );
    expect(decision?.evidenceDocumentIds).toContain("VECTOR-CONTRACT-S6-L1");
    expect(decision?.recordIds).toEqual(expect.arrayContaining(["S6-L1", "PRICE-CLAUSE-1", "VECTOR-CONTRACT-S6-L1"]));
    expect(action).toMatchObject({
      actionType: "draft-rebill",
      dispatchedExternally: false,
      status: "pending_human"
    });
  });
});

function isServiceToolStatusEvent(
  event: ForensicsTraceEvent
): event is Extract<ForensicsTraceEvent, { type: "status" }> & {
  payload: Extract<ForensicsTraceEvent, { type: "status" }>["payload"] & { toolName: string };
} {
  return event.type === "status" && event.payload.kind === "service-tool" && event.payload.toolName !== undefined;
}

function restoreForensicsLiveEvidenceEnv(input: {
  originalOpenAiApiKey: string | undefined;
  originalSupabaseServiceRoleKey: string | undefined;
  originalSupabaseUrl: string | undefined;
  originalVectorStoreId: string | undefined;
}): void {
  if (input.originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = input.originalOpenAiApiKey;
  }

  if (input.originalVectorStoreId === undefined) {
    delete process.env.OPENAI_EVIDENCE_VECTOR_STORE_ID;
  } else {
    process.env.OPENAI_EVIDENCE_VECTOR_STORE_ID = input.originalVectorStoreId;
  }

  if (input.originalSupabaseUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = input.originalSupabaseUrl;
  }

  if (input.originalSupabaseServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = input.originalSupabaseServiceRoleKey;
  }
}
