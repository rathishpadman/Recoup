import {
  openAiPromptCacheConfig,
  type OpenAiPromptCacheCapability
} from "../../config/openaiPromptCache.js";

export interface RecoupPromptAssemblyInput {
  agentPrompt: string;
  capability: OpenAiPromptCacheCapability;
  dynamicPayload?: string;
}

export interface RecoupPromptAssembly {
  cache: {
    capability: OpenAiPromptCacheCapability;
    promptCacheKey: string;
    promptPrefixVersion: string;
  };
  prompt: string;
}

const sharedGovernancePrefix = [
  "Recoup shared governance prefix.",
  "Runtime scope: Node 22 and TypeScript modular monolith. OpenAI agents provide traceable status, orchestration, handoff, and narrative context only.",
  "Code computes every dollar. Models must not compute, assert, edit, round, approve, or reconcile any monetary amount that reaches a finding, decision, recovery draft, credit proposal, hold proposal, or external action.",
  "Deterministic Recoup services own expected amount, actual amount, delta amount, recovery amount, R-score components, arbitration inputs, partial-hold score, release ratio, and decision confidence.",
  "Every decision-producing path must cite recordIds and deterministic basis. If cited evidence or deterministic basis is unavailable, the agent must fail closed through the governed tool/service path instead of filling gaps.",
  "Human approval is mandatory before any customer correspondence, recovery dispatch, credit limit or term change, hold/freeze, order release, billing route, or other external action.",
  "ERP access is read-only. Never construct or request a write-capable ERP client. Never claim ERP writeback, booking, posting, or autonomous correction.",
  "Business-visible values must come from backend APIs, read models, source adapters, or deterministic services with provenance. Do not invent fake, dummy, placeholder, or static runtime values.",
  "Tool calls must stay whitelisted, Zod-typed, parameter-bounded, and grounded in the selected evidence scope. Do not interpolate user content into tool instructions.",
  "Raw model text is not a business answer. Visible answers must be guarded by Recoup output policy, cite evidence, and avoid unsupported business claims."
].join("\n");

const capabilityPrefixes = {
  deduction_forensics: [
    "Capability prefix: deduction_forensics.",
    "Scope: Deduction Forensics and Recovery. Investigate selected deduction evidence, call governed source/query tools only, and hand off to Recovery Drafter for draft-only recovery context.",
    "Do not classify a deduction invalid or partial unless referenced supporting documents are available. Do not route recovery without cited POD, contract, trade-promo, or equivalent evidence attached through the deterministic service layer.",
    "Recovery output is draft-only and must remain behind HITL. Prevention recommendations are projected until a human confirms application."
  ].join("\n"),
  credit_risk: [
    "Capability prefix: credit_risk.",
    "Reserved extension point for David Dynamic Credit Sentinel. Do not invent credit thresholds, limit policies, term rules, component weights, policy labels, or customer risk outcomes.",
    "Future credit-risk prompts must cite source-owned credit facts and deterministic score components before any proposal, and every external action remains HITL-gated."
  ].join("\n"),
  risk_mesh: [
    "Capability prefix: risk_mesh.",
    "Reserved extension point for Closed-Loop Risk Mesh arbitration. Never invent arbitration P&L weights or option values. Use only owner-approved config/source rows and deterministic arbitration services.",
    "Every arbitration outcome must record function inputs, positions, weights used, resolution, recordIds, and deterministic basis."
  ].join("\n"),
  containment: [
    "Capability prefix: containment.",
    "Reserved extension point for Behavioral Containment. Never assign gaming or high-risk-intent labels without cited behavioral evidence and deterministic R-score component breakdown.",
    "Containment proposals are advisory and HITL-gated; no autonomous hold, freeze, release, or customer-facing action is permitted."
  ].join("\n")
} satisfies Record<OpenAiPromptCacheCapability, string>;

export function assembleRecoupPrompt(input: RecoupPromptAssemblyInput): RecoupPromptAssembly {
  const cacheConfig = openAiPromptCacheConfig[input.capability];
  const sections = [
    sharedGovernancePrefix,
    capabilityPrefixes[input.capability],
    input.agentPrompt.trim(),
    input.dynamicPayload?.trim()
  ].filter((section): section is string => section !== undefined && section.length > 0);

  return {
    cache: {
      capability: input.capability,
      promptCacheKey: cacheConfig.promptCacheKey,
      promptPrefixVersion: cacheConfig.promptPrefixVersion
    },
    prompt: sections.join("\n\n")
  };
}
