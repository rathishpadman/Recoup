import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentTracePanel } from "../../cockpit/components/maya/agent-trace-panel.tsx";
import type { QueryEvidenceResponse } from "../../cockpit/components/maya/types.ts";

function traceEvent(index: number, recordIds: string[]): QueryEvidenceResponse["trace"][number] {
  return {
    agentName: "Evidence Reader",
    deterministicBasis: `retrieval step ${index.toString()} basis`,
    hook: "agent_tool_start",
    label: `retrieval.docs step ${index.toString()}`,
    message: `Raw backend trace message for step ${index.toString()}.`,
    phase: "retrieval",
    receiptDeterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
    recordIds,
    toolName: "retrieval.docs"
  };
}

/** Nine retrieval steps, each touching a different number of its own records. */
function response(): QueryEvidenceResponse {
  const answerWideRecordIds = Array.from({ length: 12 }, (_, index) => `REC-${(index + 1).toString()}`);

  return {
    citations: answerWideRecordIds.map((recordId) => ({
      deterministicBasis: `citation basis ${recordId}`,
      recordId
    })),
    deterministicBasis: "answer guard basis",
    message: "answered",
    recordIds: answerWideRecordIds,
    status: "answered",
    trace: [traceEvent(1, ["REC-1"]), traceEvent(2, ["REC-2", "REC-3"]), traceEvent(3, ["REC-4", "REC-5", "REC-6"])]
  };
}

/** Node prose with the step number stripped, so two cards that only differ by position match. */
function evidenceDocument(documentId: string, documentType: string, sourceLabel: string) {
  return {
    citationId: documentId,
    description: `${documentType} description`,
    documentId,
    documentType,
    provenance: {
      deterministicBasis: `${documentId} basis`,
      recordIds: [documentId],
      sourceKind: "derived_backend" as const,
      sourceName: "unit test"
    },
    relevance: "Supporting",
    sourceLabel,
    summary: `${documentId} summary`,
    verifiedLabel: "Verified"
  };
}

function evidencePack() {
  return {
    documents: [
      evidenceDocument("EVD-POD-S3-L1", "pod", "3PL"),
      evidenceDocument("EVD-REMIT-S3-L1", "remittance_advice", "Remittance"),
      evidenceDocument("EVD-TPM-ACCRUAL-S3-L1", "tpm_accrual", "TPM")
    ],
    provenance: {
      deterministicBasis: "evidence pack basis",
      recordIds: ["S3-L1"],
      sourceKind: "derived_backend" as const,
      sourceName: "unit test"
    },
    recordIds: ["S3-L1"]
  };
}

function processNodeBodies(markup: string): string[] {
  const mapStart = markup.indexOf('data-testid="maya-agent-process-map"');
  expect(mapStart).toBeGreaterThan(-1);

  return markup
    .slice(mapStart)
    .split('data-testid="maya-agent-process-node"')
    .slice(1)
    .map((chunk) =>
      chunk
        .replace(/<[^>]*>/gu, " ")
        .replace(/\s+/gu, " ")
        .replace(/^\s*\d+\s*/u, "")
        .trim()
    );
}

function occurrences(markup: string, phrase: string): number {
  return markup.split(phrase).length - 1;
}

describe("Maya compact agent process map", () => {
  it("counts each node's own evidence rather than the answer-wide citation total", () => {
    const markup = renderToStaticMarkup(createElement(AgentTracePanel, { response: response() }));
    const retrievalStepCounts = markup
      .split('data-testid="maya-agent-process-node"')
      .slice(1)
      .filter((chunk) => chunk.includes('data-trace-label="retrieval.docs step'))
      .map((chunk) => Number(/(\d+) evidence links?/u.exec(chunk)?.[1]));

    // The answer cites 12 records, but these three steps touched 1, 2 and 3 of them.
    expect(retrievalStepCounts).toEqual([1, 2, 3]);
  });

  it("does not repeat a generic sentence on every step of the same kind", () => {
    const markup = renderToStaticMarkup(createElement(AgentTracePanel, { response: response() }));

    // Three retrieval steps currently print the same two sentences three times over.
    expect(occurrences(markup, "Maya checked the evidence needed for this step")).toBeLessThanOrEqual(1);
    expect(occurrences(markup, "Source evidence checked.")).toBeLessThanOrEqual(1);
    expect(occurrences(markup, "Maya evaluated the evidence step and kept the supporting record")).toBeLessThanOrEqual(1);
  });

  it("renders no two process nodes with identical body text", () => {
    const bodies = processNodeBodies(renderToStaticMarkup(createElement(AgentTracePanel, { response: response() })));

    expect(bodies.length).toBeGreaterThan(1);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("keeps distinct evidence steps distinguishable instead of collapsing them by kind", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentTracePanel, { evidencePack: evidencePack(), response: response() })
    );

    // These three are all "retrieval-source" nodes, but each checked a different document, so a
    // reader must be able to tell them apart - and in business words, not raw enum values.
    expect(markup).toContain("Proof of delivery");
    expect(markup).toContain("Remittance advice");
    expect(markup).toContain("TPM accrual");
    expect(markup).not.toContain("remittance_advice");
    expect(markup).not.toContain("tpm_accrual");
  });

  it("keeps raw backend trace messages off the compact map", () => {
    const markup = renderToStaticMarkup(createElement(AgentTracePanel, { response: response() }));

    expect(markup).not.toContain("Raw backend trace message for step");
  });
});
