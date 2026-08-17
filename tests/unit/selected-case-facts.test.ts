import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runForensicsQuerySession } from "../../src/services/forensicsQuerySession.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

function respond(question: string, selectedLineId = "S7-L1") {
  const recordIds = [selectedLineId];
  return runForensicsQuerySession({
    governedConfig,
    question,
    recordIds,
    selectedLineId,
    serviceContext: fixtureForensicsServiceContext,
    source,
    trustedEvidencePackRecordIds: recordIds
  });
}

describe("selected case facts", () => {
  it("exposes a fact set for the selected case", () => {
    const response = respond("what is this case?");

    expect(response.facts).toBeDefined();
    expect(response.facts?.caseIds).toContain("S7");
    expect(response.facts?.verdicts.length).toBeGreaterThan(0);
  });

  it("carries the code-computed amount, which the answer builder never received", () => {
    // "how much are we recovering?" was unanswerable because no amount reached this layer at all.
    const response = respond("how much are we recovering on this case?");

    expect(response.facts?.amounts.length).toBeGreaterThan(0);
    for (const amount of response.facts?.amounts ?? []) {
      expect(amount).toMatch(/^\$[\d,]+\.\d{2}$/u);
    }
  });

  it("carries the rule that classifies the case", () => {
    const response = respond("is this a promo overclaim or a shortage?");

    expect(response.facts?.ruleIds).toContain("promo-overclaim");
  });

  it("carries the customer so a who question can be answered", () => {
    const response = respond("who is the customer here?");

    expect(response.facts?.customerNames.length).toBeGreaterThan(0);
  });

  it("keeps every cited record inside the fact set", () => {
    const response = respond("what evidence supports this verdict?");

    for (const citation of response.citations) {
      expect(response.facts?.recordIds).toContain(citation.recordId);
    }
  });
});
