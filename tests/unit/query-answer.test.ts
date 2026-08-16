import { describe, expect, it } from "vitest";
import { buildDeterministicForensicsQueryAnswer } from "../../src/agents/query.js";

const baseInput = {
  basis: "Signed POD shows full delivery against the claimed shortage.",
  citationRecordIds: ["S3-L1", "EVD-POD-S3-L1", "RECON-S3-L1"],
  routing: "recovery",
  selectedLineId: "S3-L1",
  verdict: "invalid"
} as const;

describe("deterministic forensics query answers", () => {
  it("keeps approval-gate questions distinct from generic verdict summaries", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "What should I tell my manager before I ask for approval on the recovery draft?"
    });

    expect(answer).toContain("Before Maya opens approval");
    expect(answer).toContain("human approval");
    expect(answer).toContain("S3-L1");
    expect(answer).toContain("recovery");
  });

  it("keeps route questions focused on the route decision", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "Is this a billing correction or a recovery pursuit, and what proof drives that route?"
    });

    expect(answer).toContain("belongs with recovery");
    expect(answer).toContain("current invalid finding");
    expect(answer).toContain("Signed POD shows full delivery");
  });

  it("does not treat investigate phrasing as an approval-gate question", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "Investigate why this routed to recovery and what proof supports it."
    });

    expect(answer).toContain("belongs with recovery");
    expect(answer).not.toContain("Before Maya opens approval");
    expect(answer).not.toContain("human approval");
  });

  it("keeps counterfactual valid-deduction questions distinct from the default summary", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question:
        "What cited evidence would make this a valid deduction, and which selected SAP or document records show that this case does not meet that valid-deduction pattern?"
    });

    expect(answer).toContain("A valid deduction would need cited evidence");
    expect(answer).toContain("Instead, the selected evidence supports");
    expect(answer).toContain("invalid verdict");
  });

  it("answers an evidence question by naming the evidence, not by describing the process", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      citedDocuments: [
        { documentId: "EVD-POD-S3-L1", documentType: "pod" },
        { documentId: "EVD-TPM-ACCRUAL-S3-L1", documentType: "tpm_accrual" },
        { documentId: "EVD-SAP-INV-S3-L1", documentType: "sap_invoice" }
      ],
      question: "What evidence supports the Partial recovery verdict for Harbor Foods?"
    });

    // The cockpit strips record IDs from displayed prose, so the answer has to carry business
    // labels or it says nothing at all once rendered.
    expect(answer).toContain("proof of delivery");
    expect(answer).toContain("TPM accrual");
    expect(answer).toContain("SAP invoice");
    expect(answer).toContain(baseInput.basis);
    // The reviewer still needs to know where the case goes next.
    expect(answer).toContain("It routes to recovery.");
    // It must not fall back to the customer-challenge phrasing, which answers a different question.
    expect(answer).not.toContain("To respond on");
  });

  it("answers a which-cited-records question by naming records even when it mentions approval", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      citedDocuments: [
        { documentId: "EVD-POD-S3-L1", documentType: "pod" },
        { documentId: "EVD-REMIT-S3-L1", documentType: "remittance_advice" }
      ],
      question: "Which cited records support the current route and human approval gate?"
    });

    // The question asks which records; the approval gate is context, not the subject.
    expect(answer).toContain("proof of delivery");
    expect(answer).toContain("remittance advice");
    expect(answer).not.toContain("Before Maya opens approval");
  });

  it("still treats a genuine approval-gate question as an approval-gate question", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "What should I tell my manager before I ask for approval on the recovery draft?"
    });

    expect(answer).toContain("Before Maya opens approval");
  });

  it("still treats an explicit customer challenge as a customer challenge", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?"
    });

    expect(answer).toContain("To respond on");
  });

  it("names evidence without inventing a document it was not given", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      citedDocuments: [{ documentId: "EVD-POD-S3-L1", documentType: "pod" }],
      question: "What evidence supports this verdict?"
    });

    expect(answer).toContain("proof of delivery");
    expect(answer).not.toContain("TPM accrual");
    expect(answer).not.toContain("SAP invoice");
  });

  it("falls back to the cited record count when no document types are supplied", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "What evidence supports this verdict?"
    });

    expect(answer).toContain("3 cited records");
    expect(answer).toContain(baseInput.basis);
  });

  it("retains cited record IDs in every answer path", () => {
    const answer = buildDeterministicForensicsQueryAnswer({
      ...baseInput,
      question: "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?"
    });

    expect(answer).toContain("The answer is limited to cited record IDs");
    expect(answer).toContain("S3-L1");
    expect(answer).toContain("EVD-POD-S3-L1");
    expect(answer).toContain("RECON-S3-L1");
  });
});
