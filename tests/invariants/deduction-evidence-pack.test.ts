import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runForensicsInvestigation, runForensicsInvestigationWithEvidenceSources } from "../../src/agents/forensics.js";
import { assertDeductionEvidencePack } from "../../src/guardrails/tool/evidencePack.js";
import { money } from "../../src/types/money.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const runForensics = () => runForensicsInvestigation({ governedConfig, serviceContext: fixtureForensicsServiceContext, source });

describe("I-18 deduction evidence completeness", () => {
  it("blocks invalid or partial deductions without supporting documents", () => {
    expect(() => {
      assertDeductionEvidencePack({
        decisionId: "decision-without-docs",
        lineId: "S5-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: ["S5-L1"],
        basis: "POD timestamp contradicts the OTIF fine.",
        deterministicBasis: {
          ruleId: "otif-timestamp-mismatch",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: [],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset",
        evidenceDocuments: []
      });
    }
    ).toThrow("Invalid or partial deduction decisions require supporting documents.");
  });

  it("requires rule-specific supporting documents for any recovery-routed deduction", () => {
    expect(() => {
      assertDeductionEvidencePack({
        decisionId: "malformed-valid-recovery-decision",
        lineId: "S6-L1",
        verdict: "valid",
        routing: "recovery",
        recordIds: ["S6-L1", "INV-WRONG-SUPPORT"],
        basis: "Malformed recovery route with invoice-only proof.",
        deterministicBasis: {
          ruleId: "pricing-below-contract",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: ["INV-WRONG-SUPPORT"],
        evidenceDocuments: [
          {
            documentId: "INV-WRONG-SUPPORT",
            documentType: "invoice",
            source: "sap",
            summary: "Invoice is not the contract support document required by the pricing rule.",
            recordIds: ["INV-WRONG-SUPPORT"]
          }
        ],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      });
    }).toThrow("Invalid or partial deduction decisions require the rule-specific support document.");
  });

  it("does not treat bureau or remittance evidence as recovery support documents", () => {
    for (const [source, documentType] of [
      ["bureau", "bureau-signal"],
      ["remittance", "remittance-advice"]
    ] as const) {
      expect(() => {
        assertDeductionEvidencePack({
          decisionId: `recovery-with-${source}`,
          lineId: "S6-L1",
          verdict: "invalid",
          routing: "recovery",
          recordIds: ["S6-L1", `${source.toUpperCase()}-1`],
          basis: "Non-supporting source is not enough to pursue recovery.",
          deterministicBasis: {
            ruleId: "pricing-below-contract",
            computedDeltaAmount: money("10.00"),
            amountSource: "core-rule-delta"
          },
          evidenceDocumentIds: [`${source.toUpperCase()}-1`],
          evidenceDocuments: [
            {
              documentId: `${source.toUpperCase()}-1`,
              documentType,
              source,
              summary: "Enterprise signal only; not contract support.",
              recordIds: [`${source.toUpperCase()}-1`]
            }
          ],
          producedBy: "agent:forensics-investigator",
          modelId: "gpt-5.5",
          confidence: "blocked: decision-confidence-threshold unset"
        });
      }).toThrow("Invalid or partial deduction decisions require the rule-specific support document.");
    }
  });

  it("attaches supporting documents to every invalid or partial Forensics decision", () => {
    const run = runForensics();
    const recoveryDecisions = run.decisions.filter((decision) => decision.routing === "recovery");

    expect(recoveryDecisions).toHaveLength(13);
    expect(recoveryDecisions.every((decision) => decision.evidenceDocumentIds.length > 0)).toBe(true);
    expect(
      recoveryDecisions.every((decision) =>
        decision.evidenceDocumentIds.every((documentId) => decision.recordIds.includes(documentId))
      )
    ).toBe(true);
    expect(recoveryDecisions.every((decision) => decision.evidenceDocuments.length > 0)).toBe(true);
    expect(
      recoveryDecisions.every(
        (decision) => new Set(decision.evidenceDocuments.map((document) => document.documentId)).size === decision.evidenceDocuments.length
      )
    ).toBe(true);
  });

  it("cites injected supporting documents on async Forensics decisions", async () => {
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

    const decision = run.decisions.find((candidate) => candidate.lineId === "S6-L1");

    expect(decision?.evidenceDocumentIds).toContain("VECTOR-CONTRACT-S6-L1");
    expect(decision?.recordIds).toEqual(expect.arrayContaining(["VECTOR-CONTRACT-S6-L1", "PRICE-CLAUSE-1"]));
  });
});
