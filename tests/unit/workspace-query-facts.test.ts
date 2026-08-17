import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { buildForensicsWorkspaceQueryResponse } from "../../src/services/forensicsWorkspaceQuery.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";
import { settlementRunIdForSource } from "../../src/services/settlementRunIdentity.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

function respond(question: string) {
  return buildForensicsWorkspaceQueryResponse({
    governedConfig,
    question,
    serviceContext: fixtureForensicsServiceContext,
    settlementRunId: settlementRunIdForSource(source.loadSettlementRun()),
    source
  });
}

describe("workspace query facts", () => {
  it("exposes a fact set carrying every case with its rule", () => {
    const response = respond("what is in this run?");

    expect(response.facts).toBeDefined();
    expect(response.facts?.ruleIds).toEqual(expect.arrayContaining(["promo-not-captured", "promo-overclaim"]));
    expect(response.facts?.caseIds.length).toBeGreaterThan(0);
  });

  it("matches a topical question to the cases whose rule or basis mentions it", () => {
    // "promo" must reach both promo cases. The overclaim basis says "allowance" and "TPM accrual"
    // and never says promo, so matching on basis text alone finds only one of the two.
    const response = respond("can u help me understand which case is related to Promo?");

    expect(response.matchedCaseIds).toEqual(expect.arrayContaining(["S2", "S7"]));
    expect(response.matchedCaseIds).not.toContain("S3");
  });

  it("matches a shortage question to the shortage case only", () => {
    const response = respond("which case is a shortage claim?");

    expect(response.matchedCaseIds).toContain("S3");
    expect(response.matchedCaseIds).not.toContain("S2");
  });

  it("matches a customer question to that customer's cases", () => {
    const response = respond("what is going on with Harbor Foods?");

    expect(response.matchedCaseIds?.length).toBeGreaterThan(0);
    expect(response.facts?.customerNames).toContain("Harbor Foods");
  });

  it("reports no match rather than inventing one", () => {
    const response = respond("what is the weather in Chennai today?");

    expect(response.matchedCaseIds).toEqual([]);
  });

  it("keeps every fact amount code-computed from the run", () => {
    const response = respond("how much is being recovered?");

    for (const amount of response.facts?.amounts ?? []) {
      expect(amount).toMatch(/^\$[\d,]+\.\d{2}$/u);
    }
  });
});

describe("workspace overview questions", () => {
  it("answers a run-level question with the run summary rather than reporting no match", () => {
    // "What did the agents conclude across the settlement run?" is about the run as a whole. It
    // matches no single case, but the summary is the correct answer, not "nothing matched".
    const answer = respond("What did the agents conclude across the settlement run?").answer ?? "";

    expect(answer).toContain("3 valid");
    expect(answer).not.toContain("No case in the current settlement run matches");
  });

  it("still reports honestly when a question matches nothing and is not about the run", () => {
    const answer = respond("What is the weather in Mumbai today?").answer ?? "";

    expect(answer).toContain("No case in the current settlement run matches");
  });

  it("treats a how-many question as a run overview", () => {
    const answer = respond("How many cases are there in total?").answer ?? "";

    expect(answer).toContain("8 deduction cases");
    expect(answer).not.toContain("No case in the current settlement run matches");
  });
});

describe("workspace citation scoping", () => {
  it("cites only the cases a topical answer names", () => {
    // A promo question used to arrive with every record in the run attached, which dressed an
    // unrelated answer in evidence.
    const scoped = respond("which case is related to Promo?");
    const all = respond("What did the agents conclude across the settlement run?");
    const scopedCaseIds = [...new Set(scoped.citations.map((citation) => citation.documentId))];

    expect(scoped.matchedCaseIds?.length).toBeGreaterThan(0);
    expect(scoped.citations.length).toBeLessThan(all.citations.length);
    expect(scopedCaseIds.sort()).toEqual([...(scoped.matchedCaseIds ?? [])].sort());
  });

  it("never returns an empty citation list", () => {
    // The cockpit requires at least one citation to display an answer at all, so an unmatched
    // question must still cite the run it was asked about.
    for (const question of ["What is the weather in Mumbai today?", "which case is related to Promo?"]) {
      expect(respond(question).citations.length, question).toBeGreaterThan(0);
    }
  });
});
