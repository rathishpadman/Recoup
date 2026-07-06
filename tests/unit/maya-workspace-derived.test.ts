import { describe, expect, it } from "vitest";
import {
  buildCopilotSuggestions,
  buildAgentInvestigationTimelineSteps,
  buildAgentChecklistRows,
  buildCopilotCaseOptions,
  buildCitedRecordChips,
  buildConductorSummary,
  buildCopilotVerdictBand,
  buildDraftLetterPreview,
  buildEmailDraft,
  buildEvidenceFactCard,
  buildEvidencePacketAvailabilityLabel,
  countEvidenceSourceLabels,
  buildCopilotDrawerTrigger,
  resolveMayaWorklistReasonDetail,
  buildOverviewSummaryCards,
  buildOverviewVerdictFilterOptions,
  buildOutcomeActionPackages,
  buildRoutingBanner,
  buildVerdictLead,
  deriveEmailRecipientGroups,
  semanticRetrievalBadgeFromDocument,
  buildSourcePillState,
  deriveDecisionFlowSteps,
  findContrastCase,
  normalizeMayaVerdict,
  overviewCardVisualKey,
  overviewShortVerdictLabel,
  resolveMayaWorklistReason,
  type MayaOverviewSummaryCard
} from "../../cockpit/components/maya/maya-workspace-derived.ts";
import type {
  MayaEvidenceDocument,
  MayaEvidencePack,
  MayaWorklistItem,
  QueryEvidenceResponse
} from "../../cockpit/components/maya/types.ts";

function workItem(overrides: Partial<MayaWorklistItem & { reason: string }>): MayaWorklistItem & { reason?: string } {
  return {
    amount: "$0",
    approvalStatus: "pending_human",
    approvalStatusLabel: "Awaiting reviewer",
    confidence: "0.9000",
    confidenceLabel: "High confidence",
    customerId: "CUST-1",
    customerLabel: "NorthBay Retail",
    deductionReason: "Shortage",
    evidenceLabel: "2 artifacts",
    evidenceScoreLabel: "2",
    lineCount: 1,
    lineId: "S1-L1",
    lineIds: ["S1-L1"],
    provenance: {
      deterministicBasis: "test fixture",
      recordIds: ["S1-L1"],
      sourceKind: "derived_backend",
      sourceName: "unit test"
    },
    queueLabel: "Review",
    recommendedActionLabel: "Recovery - issue debit memo",
    routing: "recovery",
    routingLabel: "Recovery",
    verdict: "invalid",
    verdictLabel: "Invalid",
    workItemId: "S1-L1",
    workItemLabel: "NorthBay shortage deduction",
    ...overrides
  };
}

function expectCard(cards: readonly MayaOverviewSummaryCard[], index: number): MayaOverviewSummaryCard {
  const card = cards[index];
  expect(card).toBeDefined();
  if (card === undefined) {
    throw new Error(`Expected overview card at index ${String(index)}.`);
  }

  return card;
}

function evidenceDocument(overrides: Partial<MayaEvidenceDocument>): MayaEvidenceDocument {
  return {
    citationId: "P1",
    description: "POD EVD-POD-S1-L1",
    documentId: "EVD-POD-S1-L1",
    documentType: "pod",
    provenance: {
      deterministicBasis: "canonical evidence document comparison via receipt RCP-S1-L1; evidence EVD-POD-S1-L1; contentHash hash-1",
      recordIds: ["RCP-S1-L1", "EVD-POD-S1-L1", "POD-77421"],
      sourceKind: "supabase",
      sourceName: "3PL POD"
    },
    relevance: "Primary",
    sourceLabel: "3PL POD",
    summary: "A sentence summary that must not render inside the fact rows.",
    verifiedLabel: "Hash verified",
    ...overrides
  };
}

function evidencePack(overrides: Partial<MayaEvidencePack>): MayaEvidencePack {
  return {
    documents: [],
    provenance: {
      deterministicBasis: "selected evidence packet",
      recordIds: [],
      sourceKind: "derived_backend",
      sourceName: "unit test"
    },
    recordIds: [],
    ...overrides
  };
}

describe("Maya workspace derived helpers", () => {
  it("builds exactly four overview cards from real worklist rows with exact cent aggregation", () => {
    const cards = buildOverviewSummaryCards([
      workItem({ amount: "$12,700.25", lineCount: 2, verdict: "valid", verdictLabel: "Valid" }),
      workItem({ amount: "$6,100.10", lineCount: 3, verdict: "invalid", verdictLabel: "Invalid" }),
      workItem({ amount: "$2,050.65", lineCount: 4, verdict: "partial", verdictLabel: "Partial" })
    ]);

    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.label)).toEqual([
      "Deduction cases",
      "Valid -> Billing",
      "Invalid -> Recovery",
      "Partial -> Split"
    ]);
    expect(expectCard(cards, 0)).toEqual(expect.objectContaining({ amountLabel: "$20,851.00", count: 3, lineCount: 9 }));
    expect(expectCard(cards, 1)).toEqual(
      expect.objectContaining({ accent: "green", amountLabel: "$12,700.25", count: 1, runValueShareLabel: "61% of run value" })
    );
    expect(expectCard(cards, 2)).toEqual(
      expect.objectContaining({ accent: "red", amountLabel: "$6,100.10", count: 1, runValueShareLabel: "29% of run value" })
    );
    expect(expectCard(cards, 3)).toEqual(
      expect.objectContaining({ accent: "amber", amountLabel: "$2,050.65", count: 1, runValueShareLabel: "10% of run value" })
    );
    expect(cards.map(overviewCardVisualKey)).toEqual(["total", "valid", "invalid", "partial"]);
  });

  it("keeps unknown verdicts out of routed buckets and exposes an unavailable marker", () => {
    expect(normalizeMayaVerdict("valid")).toBe("valid");
    expect(normalizeMayaVerdict("Invalid -> Recovery")).toBe("invalid");
    expect(normalizeMayaVerdict("split")).toBe("partial");
    expect(normalizeMayaVerdict("manual_review")).toBeUndefined();

    const cards = buildOverviewSummaryCards([
      workItem({ amount: "$10.00", lineCount: 1, verdict: "manual_review", verdictLabel: "Manual review" })
    ]);

    expect(expectCard(cards, 0)).toEqual(expect.objectContaining({ amountLabel: "$10.00", count: 1, lineCount: 1 }));
    expect(expectCard(cards, 1)).toEqual(expect.objectContaining({ amountLabel: "$0.00", count: 0 }));
    expect(expectCard(cards, 2)).toEqual(expect.objectContaining({ amountLabel: "$0.00", count: 0 }));
    expect(expectCard(cards, 3)).toEqual(expect.objectContaining({ amountLabel: "$0.00", count: 0 }));
    expect(expectCard(cards, 0).supportLabel).toContain("1 verdict unavailable");
  });

  it("fails overview amount totals closed when any read-model amount is unparseable", () => {
    const cards = buildOverviewSummaryCards([
      workItem({ amount: "unavailable", lineCount: 1, verdict: "invalid", verdictLabel: "Invalid" }),
      workItem({ amount: "$10.00", lineCount: 1, verdict: "valid", verdictLabel: "Valid" })
    ]);

    expect(expectCard(cards, 0)).toEqual(expect.objectContaining({ amountLabel: "Amount unavailable", count: 2, lineCount: 2 }));
    expect(expectCard(cards, 0).supportLabel).toContain("1 amount unavailable");
    expect(expectCard(cards, 1)).toEqual(expect.objectContaining({ amountLabel: "$10.00", count: 1 }));
    expect(expectCard(cards, 2)).toEqual(expect.objectContaining({ amountLabel: "Amount unavailable", count: 1 }));
    expect(expectCard(cards, 1).runValueShareLabel).toBeUndefined();
    expect(expectCard(cards, 2).runValueShareLabel).toBeUndefined();
  });

  it("builds overview verdict filter options and short labels from normalized verdict buckets", () => {
    const items = [
      workItem({ lineId: "S1-L1", verdict: "valid", verdictLabel: "Valid deduction" }),
      workItem({ lineId: "S2-L1", verdict: "Invalid -> Recovery", verdictLabel: "Recovery" }),
      workItem({ lineId: "S3-L1", verdict: "partial", verdictLabel: "Partial deduction" }),
      workItem({ lineId: "S4-L1", verdict: "manual_review", verdictLabel: "Manual review" })
    ];

    expect(buildOverviewVerdictFilterOptions(items)).toEqual([
      { count: 4, key: "all", label: "All" },
      { count: 1, key: "valid", label: "Valid" },
      { count: 1, key: "invalid", label: "Invalid" },
      { count: 1, key: "partial", label: "Partial" }
    ]);
    expect(overviewShortVerdictLabel("valid", "Valid deduction")).toBe("Valid");
    expect(overviewShortVerdictLabel("Invalid -> Recovery", "Recovery")).toBe("Invalid");
    expect(overviewShortVerdictLabel("partial", "Split")).toBe("Partial");
    expect(overviewShortVerdictLabel("manual_review", "Manual review")).toBe("Manual review");
    expect(overviewShortVerdictLabel(undefined, "")).toBe("Unavailable");
  });

  it("finds same-family contrast cases only when verdicts are known and different", () => {
    const otifValid = workItem({
      lineId: "S4-L1",
      deductionReason: "OTIF compliance fine valid per contract",
      reason: "The contract SLA permits the OTIF fine and the delivery evidence confirms the breach.",
      verdict: "valid",
      verdictLabel: "Valid",
      workItemLabel: "ValuMart Club deduction group (2 lines)"
    });
    const otifInvalid = workItem({
      lineId: "S5-L1",
      deductionReason: "OTIF fine contradicted by 3PL POD timestamp",
      reason: "The 3PL delivery timestamp shows the order was on time.",
      verdict: "invalid",
      verdictLabel: "Invalid",
      workItemLabel: "ValuMart Club deduction group (3 lines)"
    });
    const unknownVerdict = workItem({
      lineId: "S9-L1",
      deductionReason: "OTIF evidence pending",
      verdict: "manual_review",
      verdictLabel: "Manual review"
    });

    expect(findContrastCase([otifValid, otifInvalid], otifValid)).toEqual({
      contrastReason: "The 3PL delivery timestamp shows the order was on time.",
      familyLabel: "OTIF",
      lineId: "S5-L1",
      selectedReason: "The contract SLA permits the OTIF fine and the delivery evidence confirms the breach.",
      verdictLabel: "Invalid",
      workItemLabel: "ValuMart Club deduction group (3 lines)"
    });
    expect(findContrastCase([otifValid], otifValid)).toBeUndefined();
    expect(findContrastCase([otifValid, unknownVerdict], otifValid)).toBeUndefined();
    expect(findContrastCase([otifValid, otifInvalid], unknownVerdict)).toBeUndefined();
  });

  it("builds Phase 3 investigation timeline steps only from backend trace rows", () => {
    const steps = buildAgentInvestigationTimelineSteps({
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1", "SAP-90000000"],
      trace: [
        {
          agentName: "Forensics Investigator",
          deterministicBasis: "POD read completed.",
          hook: "agent_tool_end",
          label: "Evidence cited",
          message: "Signed proof of delivery was read for the selected case.",
          phase: "retrieval",
          receiptDeterministicBasis: "Recoup deterministic forensics hook audit event",
          recordIds: ["S3-L1", "EVD-POD-S3-L1", "OUT-OF-SCOPE"],
          retrievalSource: "source_backed",
          sourceKind: "derived_backend",
          toolName: "retrieval.evidence"
        },
        {
          agentName: "Forensics Decision",
          deterministicBasis: "Decision basis checked.",
          hook: "agent_end",
          label: "Decision basis checked",
          message: "Recovery verdict is tied to selected evidence.",
          phase: "decision",
          receiptDeterministicBasis: "Recoup deterministic forensics hook audit event",
          recordIds: ["S3-L1", "SAP-90000000"]
        }
      ],
      verdict: "invalid",
      verdictLabel: "Recovery"
    } as never);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual(
      expect.objectContaining({
        agentName: "Forensics Investigator",
        citationRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
        didLine: "Evidence cited",
        foundLine: "Signed proof of delivery was read for the selected case.",
        phase: "retrieval",
        sourceLabel: "Source-backed",
        toolLabel: "retrieval.evidence"
      })
    );
    expect(steps[1]).toEqual(
      expect.objectContaining({
        citationRecordIds: ["S3-L1", "SAP-90000000"],
        foundLine: "Recovery verdict is tied to selected evidence.",
        isFinal: true,
        verdict: "invalid",
        verdictLabel: "Recovery"
      })
    );
    expect(steps[0]).not.toHaveProperty("timestampLabel");
  });

  it("builds overnight investigation timeline steps from the selected evidence packet before a query runs", () => {
    const steps = buildAgentInvestigationTimelineSteps({
      evidenceDocuments: [
        evidenceDocument({
          documentId: "EVD-POD-S3-L1",
          evidenceId: "EVD-POD-S3-L1",
          sourceRecordId: "POD-9001"
        }),
        evidenceDocument({
          documentId: "EVD-INV-S3-L1",
          documentType: "invoice",
          evidenceId: "EVD-INV-S3-L1",
          sourceLabel: "SAP Invoice",
          sourceRecordId: "900000001"
        })
      ],
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1", "POD-9001", "EVD-INV-S3-L1", "900000001"],
      reason: "The signed proof of delivery shows full delivery for the claimed shortage.",
      recommendedActionLabel: "Recovery draft staged",
      trace: [],
      verdict: "invalid",
      verdictLabel: "Recovery"
    });

    expect(steps).toHaveLength(3);
    const retrievalStep = steps[0];
    expect(retrievalStep).toEqual(
      expect.objectContaining({
        agentName: "Forensics Retrieval",
        phase: "retrieval",
        toolLabel: "Evidence retrieval"
      })
    );
    expect(retrievalStep?.citationRecordIds).toEqual(expect.arrayContaining(["EVD-POD-S3-L1", "POD-9001"]));
    expect(steps[1]).toEqual(
      expect.objectContaining({
        agentName: "Forensics Investigator",
        foundLine: "The signed proof of delivery shows full delivery for the claimed shortage.",
        phase: "decision",
        toolLabel: "Deterministic verdict"
      })
    );
    expect(steps[2]).toEqual(
      expect.objectContaining({
        agentName: "Recovery Drafter",
        foundLine: "The signed proof of delivery shows full delivery for the claimed shortage. -> Recovery",
        isFinal: true,
        toolLabel: "Prepared action",
        verdict: "invalid",
        verdictLabel: "Recovery"
      })
    );
  });

  it("turns the source pill green only when every source tile is ready", () => {
    expect(
      buildSourcePillState([
        { label: "SAP", statusTone: "ready" },
        { label: "Docs", statusTone: "ready" }
      ] as never)
    ).toEqual({
      connectedCount: 2,
      isAllReady: true,
      label: "Ready sources",
      statusTone: "ready",
      totalCount: 2
    });

    expect(
      buildSourcePillState([
        { label: "SAP", statusTone: "ready" },
        { label: "Docs", statusTone: "blocked" }
      ] as never)
    ).toEqual(expect.objectContaining({ connectedCount: 1, isAllReady: false, statusTone: "blocked", totalCount: 2 }));
    expect(buildSourcePillState([])).toEqual(expect.objectContaining({ connectedCount: 0, isAllReady: false, statusTone: "blocked" }));
  });

  it("derives copilot suggestions and worklist reasons from real worklist fields", () => {
    const invalid = workItem({
      amount: "$99.00",
      lineId: "S3-L1",
      lineIds: ["S3-L1"],
      reason: "The signed proof of delivery shows the full ordered quantity was received.",
      verdict: "invalid"
    });
    const valid = workItem({
      amount: "$10.00",
      lineId: "S2-L1",
      lineIds: ["S2-L1"],
      reason: "Trade promotion accrual covers the claimed deduction.",
      verdict: "valid"
    });

    const suggestions = buildCopilotSuggestions([valid, invalid] as never);

    expect(resolveMayaWorklistReason(invalid as never)).toBe("The signed proof of delivery shows the full ordered quantity was received.");
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]?.question).toContain(invalid.customerLabel);
    expect(suggestions[0]?.question).not.toContain("S3-L1");
    expect(suggestions[0]?.question).not.toContain("POD-77421");
  });

  it("builds Overview copilot case-picker options from every real worklist item", () => {
    const options = buildCopilotCaseOptions([
      workItem({
        customerLabel: "Greenleaf Naturals",
        lineId: "S1-L1",
        lineIds: ["S1-L1", "S1-L2"],
        provenance: {
          deterministicBasis: "worklist source",
          recordIds: [
            "S1-L1",
            "CLAIM-S1-L1",
            "INV-S1",
            "TOOLS-DATA:S1",
            "USCU_S03",
            "EVD-S1",
            "DOC-S1-L2",
            "S1-L1"
          ],
          sourceKind: "derived_backend",
          sourceName: "unit test"
        },
        workItemLabel: "Greenleaf deduction group"
      }),
      workItem({
        customerLabel: "Crestline Grocery",
        lineId: "S3-L1",
        lineIds: ["S3-L1"],
        provenance: {
          deterministicBasis: "worklist source",
          recordIds: ["S3-L1", "POD-S3"],
          sourceKind: "derived_backend",
          sourceName: "unit test"
        },
        workItemLabel: "Crestline deduction group"
      })
    ]);

    expect(options).toMatchObject([
      {
        customerLabel: "Greenleaf Naturals",
        label: "Greenleaf Naturals - Greenleaf deduction group",
        lineId: "S1-L1",
        recordIds: ["S1-L1", "S1-L2", "INV-S1", "EVD-S1"],
        workItemLabel: "Greenleaf deduction group"
      },
      {
        customerLabel: "Crestline Grocery",
        label: "Crestline Grocery - Crestline deduction group",
        lineId: "S3-L1",
        recordIds: ["S3-L1", "POD-S3"],
        workItemLabel: "Crestline deduction group"
      }
    ]);
    expect(options[0]?.workItem.lineId).toBe("S1-L1");
    expect(options[1]?.workItem.lineId).toBe("S3-L1");
  });

  it("prefers the display-ready reason when a stored narrative is also present", () => {
    const storedNarrative =
      "The signed proof of delivery shows the full ordered quantity was received, so Recovery should challenge the shortage.";
    const displayReason = "Line S3-L4 (RECON-S3-L4): Stored narrative came from the cited sibling line.";
    const businessReason = "Stored narrative came from the cited sibling line.";
    const item = workItem({
      deductionReason: "Shortage",
      reason: displayReason,
      reason_fact_hash: "reason-fact-hash-s3",
      reason_generated_at: "2026-07-04T18:00:00.000Z",
      reason_model: "gpt-5.5",
      reason_narrative: storedNarrative,
      reason_source: "llm"
    } as never);

    expect(resolveMayaWorklistReason(item as never)).toBe(businessReason);
    expect(resolveMayaWorklistReasonDetail(item as never)).toEqual({
      factHash: "reason-fact-hash-s3",
      generatedAtIso: "2026-07-04T18:00:00.000Z",
      model: "gpt-5.5",
      source: "llm",
      sourceLabel: "Stored narrative",
      text: businessReason
    });
  });

  it("uses stored reason_narrative when no display reason is available", () => {
    const storedNarrative =
      "The signed proof of delivery shows the full ordered quantity was received, so Recovery should challenge the shortage.";
    const item = workItem({
      deductionReason: "Shortage",
      reason_fact_hash: "reason-fact-hash-s3",
      reason_generated_at: "2026-07-04T18:00:00.000Z",
      reason_model: "gpt-5.5",
      reason_narrative: storedNarrative,
      reason_source: "llm"
    } as never);

    expect(resolveMayaWorklistReason(item as never)).toBe(storedNarrative);
    expect(resolveMayaWorklistReasonDetail(item as never)).toEqual({
      factHash: "reason-fact-hash-s3",
      generatedAtIso: "2026-07-04T18:00:00.000Z",
      model: "gpt-5.5",
      source: "llm",
      sourceLabel: "Stored narrative",
      text: storedNarrative
    });
  });

  it("falls back to deterministic basis text before generic deduction reason", () => {
    const resolved = resolveMayaWorklistReasonDetail(
      workItem({
        deductionReason: "SHORTAGE",
        reason: ""
      }),
      { deterministicBasis: "POD evidence contradicts the shortage claim." }
    );

    expect(resolved).toEqual({
      source: "deterministic_basis",
      sourceLabel: "Deterministic basis",
      text: "POD evidence contradicts the shortage claim."
    });
  });

  it("derives decision flow from actual detail and approval state", () => {
    const detail = {
      auditState: { status: "pending_human", statusLabel: "Awaiting human approval" },
      recommendedAction: { actionLabel: "Recovery draft staged" },
      selected: {
        draft: { actionLabel: "Recovery draft staged", basis: "rule basis", statusLabel: "Pending" },
        evidencePack: { documents: [{ documentId: "EVD-1" }], recordIds: ["S3-L1", "EVD-1"] },
        lineId: "S3-L1"
      }
    } as never;
    const pending = deriveDecisionFlowSteps({
      detail,
      workItem: workItem({ verdict: "invalid" })
    });

    expect(pending.map((step) => step.state)).toEqual(["done", "done", "done", "done", "current"]);

    const approved = deriveDecisionFlowSteps({
      approvalResponse: { actionId: "draft:S3-L1", auditEntryHash: "a".repeat(64), decision: "approve", status: "human_decided" },
      detail,
      workItem: workItem({ approvalStatus: "human_decided", verdict: "invalid" })
    });

    expect(approved.at(-1)).toEqual(expect.objectContaining({ state: "done" }));
  });

  it("builds editable email drafts from real case facts and cited records", () => {
    const draft = buildEmailDraft({
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
      recipientGroup: "recovery",
      reason: "The signed proof of delivery shows the full ordered quantity was received.",
      recommendedActionLabel: "Recovery - issue debit memo",
      workItem: workItem({
        amount: "$99.00",
        customerLabel: "NorthBay Retail",
        lineCount: 1,
        lineIds: ["S3-L1"],
        verdict: "invalid",
        verdictLabel: "Invalid"
      })
    });

    expect(draft.subject).toContain("NorthBay Retail");
    expect(draft.subject).not.toContain("S3-L1");
    expect(draft.body).toContain("$99.00");
    expect(draft.body).toContain("1 line in scope");
    expect(draft.body).not.toContain("S3-L1");
    expect(draft.body).toContain("Invalid");
    expect(draft.body).toContain("The signed proof of delivery");
    expect(draft.body).toContain("Recovery - issue debit memo");
    expect(draft.body).toContain("2 records attached in the evidence packet");
    expect(draft.body).not.toContain("EVD-POD-S3-L1");
  });

  it("builds Phase 5 verdict leads from normalized verdict buckets and fails closed for unknown verdicts", () => {
    expect(
      buildVerdictLead(
        workItem({
          queueLabel: "Billing",
          routing: "billing",
          verdict: "valid",
          verdictLabel: "Valid"
        })
      )
    ).toBe("This deduction is Valid. Route to Billing - the customer's claim is supported by the evidence.");

    expect(
      buildVerdictLead(
        workItem({
          queueLabel: "Recovery",
          verdict: "invalid",
          verdictLabel: "Invalid"
        })
      )
    ).toBe("This deduction is Invalid. Route to Recovery - the evidence does not support the customer's claim.");

    expect(
      buildVerdictLead(
        workItem({
          queueLabel: "Split",
          recommendedActionLabel: "Split value staged across Billing and Recovery",
          routing: "split",
          verdict: "partial",
          verdictLabel: "Partial"
        })
      )
    ).toBe("This deduction is Partial. Split between Billing and Recovery - only part of the claim is supported.");

    expect(
      buildVerdictLead(
        workItem({
          queueLabel: "Review",
          verdict: "manual_review",
          verdictLabel: "Manual review"
        })
      )
    ).toBe("Verdict unavailable. Keep this case in review until the source evidence returns a supported verdict.");
  });

  it("builds Phase 5 cited chips as a subset of evidence-pack record ids", () => {
    const chips = buildCitedRecordChips(
      ["S3-L1", "EVD-POD-S3-L1", "RCP-S3-L1", "EVD-POD-S3-L1"],
      ["NOT-IN-PACK", "EVD-POD-S3-L1"]
    );

    expect(chips.map((chip) => chip.recordId)).toEqual(["EVD-POD-S3-L1", "S3-L1", "RCP-S3-L1"]);
    expect(chips.every((chip) => ["S3-L1", "EVD-POD-S3-L1", "RCP-S3-L1"].includes(chip.recordId))).toBe(true);
  });

  it("builds Phase 5 routing, action packages, and draft preview from read-model fields", () => {
    const item = workItem({
      amount: "$21,300.00",
      customerLabel: "Crestline Grocery",
      lineCount: 4,
      lineIds: ["S3-L1", "S3-L2", "S3-L3", "S3-L4"],
      queueLabel: "Review",
      reason: "The signed proof of delivery shows full delivery for the claimed shortage.",
      recommendedActionLabel: "Recovery draft staged",
      routing: "recovery",
      routingLabel: "Recovery draft staged",
      verdict: "invalid",
      verdictLabel: "Invalid"
    });
    const draft = {
      actionId: "ACT-S3-L1",
      actionLabel: "Recovery draft staged",
      actionType: "draft_recovery",
      amount: "$21,300.00",
      approvalEligibility: {
        available: true,
        provenance: item.provenance,
        statusLabel: "Ready for human approval"
      },
      basis: "POD shows full signed delivery for the claimed shortage.",
      provenance: item.provenance,
      status: "pending_human",
      statusLabel: "Awaiting human approval"
    };
    const actionInbox = [
      {
        actionId: "ACT-S3-L1",
        actionLabel: "Recovery draft staged",
        actionType: "draft_recovery",
        amount: "$21,300.00",
        basis: "POD shows full signed delivery for the claimed shortage.",
        lineId: "S3-L1",
        provenance: item.provenance,
        status: "pending_human",
        statusLabel: "Awaiting human approval"
      }
    ];

    expect(buildRoutingBanner(item)).toEqual({
      amountLabel: "$21,300.00",
      queueLabel: "Recovery",
      routeLine: "Recovery draft staged",
      title: "INVALID -> route to Recovery",
      verdictLabel: "Invalid"
    });
    expect(
      buildOutcomeActionPackages({
        actionInbox: actionInbox as never,
        draft: draft as never,
        selectedLineId: "S3-L1"
      })
    ).toEqual([
      {
        amount: "$21,300.00",
        basis: "POD shows full signed delivery for the claimed shortage.",
        key: "ACT-S3-L1",
        lineId: "S3-L1",
        statusLabel: "Awaiting human approval",
        title: "Recovery draft staged"
      }
    ]);
    expect(
      buildOutcomeActionPackages({
        actionInbox: [{ ...actionInbox[0], actionId: "ACT-S9-L1", lineId: "S9-L1" }] as never,
        draft: draft as never,
        selectedLineId: "S3-L1"
      })
    ).toEqual([
      {
        amount: "$21,300.00",
        basis: "POD shows full signed delivery for the claimed shortage.",
        key: "ACT-S3-L1",
        lineId: "S3-L1",
        statusLabel: "Awaiting human approval",
        title: "Recovery draft staged"
      }
    ]);
    const preview = buildDraftLetterPreview({
      draft: draft as never,
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
      reason: resolveMayaWorklistReason(item),
      recipientGroup: "recovery",
      workItem: item
    });

    expect(preview?.body).toBe(
      buildEmailDraft({
        evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
        recipientGroup: "recovery",
        reason: resolveMayaWorklistReason(item),
        recommendedActionLabel: item.recommendedActionLabel,
        workItem: item
      }).body
    );
    expect(preview?.body).toContain("$21,300.00");
    expect(preview?.body).toContain("2 records attached in the evidence packet");
    expect(preview?.body).not.toContain("EVD-POD-S3-L1");
    expect(buildDraftLetterPreview({
      draft: draft as never,
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
      reason: resolveMayaWorklistReason(item),
      recipientGroup: "billing",
      workItem: item
    })).toBeUndefined();

    const partialItem = workItem({
      recommendedActionLabel: "Split value staged across Billing and Recovery",
      verdict: "partial",
      verdictLabel: "Partial"
    });
    expect(deriveEmailRecipientGroups(partialItem)).toEqual(["billing", "recovery"]);
    expect(buildDraftLetterPreview({
      draft: draft as never,
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
      reason: resolveMayaWorklistReason(partialItem),
      recipientGroup: "billing",
      workItem: partialItem
    })).toBeDefined();
    expect(buildDraftLetterPreview({
      draft: draft as never,
      evidenceRecordIds: ["S3-L1", "EVD-POD-S3-L1"],
      reason: resolveMayaWorklistReason(partialItem),
      recipientGroup: "recovery",
      workItem: partialItem
    })).toBeDefined();

    expect(deriveEmailRecipientGroups(workItem({ recommendedActionLabel: "Review", verdict: "manual_review" }))).toEqual([]);
  });

  it("builds evidence fact cards from document fields without sentence prose rows", () => {
    const card = buildEvidenceFactCard(
      evidenceDocument({
        contentHash: "hash-pod-001",
        evidenceId: "EVD-POD-S1-L1",
        receiptContentHash: "hash-receipt-001",
        receiptId: "RCP-S1-L1",
        retrievedAt: "2026-07-04T10:30:00.000Z",
        sourceFreshness: "retrieved at 2026-07-04T10:30:00.000Z",
        sourceRecordId: "POD-77421",
        sourceSystem: "three_pl",
        storageHref: "/api/forensics/evidence-documents/EVD-POD-S1-L1",
        storageUri: "supabase://recoup_evidence_documents/EVD-POD-S1-L1"
      })
    );

    expect(card.title).toContain("Signed POD");
    expect(card.title).not.toContain("POD-77421");
    expect(card.title).toContain("3PL POD");
    expect(card.documentHref).toBe("/api/forensics/evidence-documents/EVD-POD-S1-L1");
    expect(card.sourceLabel).toBe("3PL POD");
    expect(card.semanticRetrievalBadge).toBeUndefined();
    expect(card.rows).toEqual([
      { label: "Document", value: "Signed POD" },
      { label: "Source", value: "3PL POD" },
      { label: "Status", value: "Hash verified" }
    ]);
    expect(card.provenanceRows).toEqual(
      expect.arrayContaining([
        { label: "Summary", value: "A sentence summary that must not render inside the fact rows." },
        { label: "Document ID", value: "EVD-POD-S1-L1" },
        { label: "Type", value: "Pod" },
        { label: "Source record", value: "POD-77421" },
        { label: "Receipt", value: "RCP-S1-L1" },
        { label: "Content hash", value: "hash-pod-001" },
        { label: "Receipt hash", value: "hash-receipt-001" },
        { label: "Storage", value: "supabase://recoup_evidence_documents/EVD-POD-S1-L1" },
        {
          label: "Basis",
          value: "canonical evidence document comparison via receipt RCP-S1-L1; evidence EVD-POD-S1-L1; contentHash hash-1"
        }
      ])
    );
    expect(card.rows.map((row) => row.value)).not.toContain("A sentence summary that must not render inside the fact rows.");
    expect(card.rows.map((row) => row.value).join(" ")).not.toContain("canonical evidence document comparison");
    expect(card.title).not.toMatch(/retrieved through|#/iu);
  });

  it("does not infer hash verification from hash fields alone", () => {
    const card = buildEvidenceFactCard(
      evidenceDocument({
        contentHash: "hash-pod-001",
        receiptContentHash: "hash-receipt-001",
        sourceFreshness: "retrieved at 2026-07-04T10:30:00.000Z",
        verifiedLabel: "Retrieved"
      })
    );

    expect(card.rows).toContainEqual({ label: "Status", value: "Retrieved" });
    expect(card.rows).not.toContainEqual({ label: "Status", value: "Hash verified" });
    expect(card.provenanceRows).toEqual(
      expect.arrayContaining([
        { label: "Content hash", value: "hash-pod-001" },
        { label: "Receipt hash", value: "hash-receipt-001" }
      ])
    );
  });

  it("keeps unknown evidence document IDs out of primary business labels", () => {
    const card = buildEvidenceFactCard(
      evidenceDocument({
        documentId: "RAW-DOC-1",
        documentType: "miscellaneous-support",
        sourceLabel: "Customer portal"
      })
    );

    expect(card.title).toContain("Miscellaneous Support");
    expect(card.title).not.toContain("RAW-DOC-1");
    expect(card.rows).toContainEqual({ label: "Document", value: "Miscellaneous Support" });
    expect(card.rows.map((row) => row.value).join(" ")).not.toContain("RAW-DOC-1");
    expect(card.provenanceRows).toContainEqual({ label: "Document ID", value: "RAW-DOC-1" });
  });

  it("counts only real evidence source labels for selected-packet source chips", () => {
    expect(
      countEvidenceSourceLabels([
        evidenceDocument({ sourceLabel: "SAP Invoice" }),
        evidenceDocument({ documentId: "EVD-POD-S1-L2", sourceLabel: "3PL POD" }),
        evidenceDocument({ documentId: "EVD-POD-S1-L3", sourceLabel: "3PL POD" }),
        evidenceDocument({ documentId: "EVD-EMPTY", sourceLabel: " " })
      ])
    ).toBe(2);
  });

  it("shows semantic retrieval scores only for vector-store evidence with a score in deterministic provenance", () => {
    const vectorDocument = evidenceDocument({
      documentId: "file-vector-runtime-contract",
      provenance: {
        deterministicBasis:
          "evidence document file-vector-runtime-contract returned by OpenAI vector store semantic retrieval; vectorStoreId vs_evidence_test; file pricing-clause.pdf; score 0.910",
        recordIds: ["file-vector-runtime-contract"],
        sourceKind: "derived_backend",
        sourceName: "OpenAI vector store semantic retrieval"
      },
      retrieval: {
        fileName: "pricing-clause.pdf",
        mode: "semantic-vector",
        provenance: "openai-vector-store",
        score: 0.91,
        vectorStoreId: "vs_evidence_test"
      },
      sourceLabel: "OpenAI vector store"
    });

    expect(semanticRetrievalBadgeFromDocument(vectorDocument)).toBe("Semantic retrieval · score 0.91");
    expect(buildEvidenceFactCard(vectorDocument).semanticRetrievalBadge).toBe("Semantic retrieval · score 0.91");
    expect(
      semanticRetrievalBadgeFromDocument(
        evidenceDocument({
          provenance: {
            deterministicBasis: "OpenAI vector store semantic retrieval without a score",
            recordIds: ["file-vector-runtime-contract"],
            sourceKind: "derived_backend",
            sourceName: "OpenAI vector store semantic retrieval"
          },
          retrieval: {
            fileName: "pricing-clause.pdf",
            mode: "semantic-vector",
            provenance: "openai-vector-store",
            score: 0.91,
            vectorStoreId: "vs_evidence_test"
          }
        })
      )
    ).toBeUndefined();
    expect(
      semanticRetrievalBadgeFromDocument(
        evidenceDocument({
          provenance: {
            deterministicBasis: "source-generated document; score 0.910",
            recordIds: ["EVD-POD-S1-L1"],
            sourceKind: "supabase",
            sourceName: "3PL POD"
          }
        })
      )
    ).toBeUndefined();
  });

  it("summarizes evidence packet availability from the same documents and records shown in the drawer", () => {
    const summary = buildEvidencePacketAvailabilityLabel(
      evidencePack({
        documents: [
          evidenceDocument({ documentId: "EVD-1" }),
          evidenceDocument({ documentId: "EVD-2" }),
          evidenceDocument({ documentId: "EVD-3" }),
          evidenceDocument({ documentId: "EVD-4" })
        ],
        recordIds: Array.from({ length: 16 }, (_, index) => `REC-${String(index + 1)}`)
      })
    );

    expect(summary).toBe("4 documents / 16 records");
    expect(summary).not.toContain("Unavailable");
    expect(buildEvidencePacketAvailabilityLabel(evidencePack({ documents: [], recordIds: [] }))).toBe("No evidence records");
  });

  it("composes the Phase 7 conductor sentence from real agent and source counts only", () => {
    expect(
      buildConductorSummary({
        customerLabel: "Crestline Grocery",
        evidenceDocuments: [
          evidenceDocument({ sourceLabel: "SAP OData" }),
          evidenceDocument({ sourceLabel: "3PL POD" }),
          evidenceDocument({ sourceLabel: "Contract Repo" }),
          evidenceDocument({ sourceLabel: "Remittance" }),
          evidenceDocument({ sourceLabel: "OpenAI vector store" })
        ],
        selectedLineLabel: "S3-L1",
        subAgentNames: ["Forensics Investigator", "Recovery Drafter", "Forensics Investigator"]
      })
    ).toBe(
      "Re-checking the overnight verdict for S3-L1 - Crestline Grocery — pulling the cited evidence. Conductor is coordinating 2 specialist agents across SAP OData, 3PL POD, Contract Repo, Remittance, +1 more."
    );

    expect(
      buildConductorSummary({
        evidenceDocuments: [],
        subAgentNames: []
      })
    ).toBe("Conductor is checking cited evidence.");
  });

  it("builds Phase 7 agent checklist rows from real trace order with roster fallback", () => {
    const trace: QueryEvidenceResponse["trace"] = [
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "basis",
        hook: "agent_start",
        label: "Scope accepted",
        message: "Scope accepted",
        phase: "supervisor",
        receiptDeterministicBasis: "Recoup deterministic forensics hook audit event",
        recordIds: ["S3-L1"]
      },
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "basis",
        hook: "agent_end",
        label: "Done",
        message: "Done",
        phase: "decision",
        receiptDeterministicBasis: "Recoup deterministic forensics hook audit event",
        recordIds: ["S3-L1"]
      },
      {
        agentName: "Recovery Drafter",
        deterministicBasis: "basis",
        hook: "agent_start",
        label: "Draft",
        message: "Draft",
        phase: "query",
        receiptDeterministicBasis: "Recoup deterministic forensics hook audit event",
        recordIds: ["S3-L1"]
      }
    ];

    expect(buildAgentChecklistRows({ fallbackAgentNames: ["POD-Retriever"], status: "answered", trace })).toEqual([
      { agentName: "Forensics Investigator", key: "agent-Forensics Investigator", state: "complete" },
      { agentName: "Recovery Drafter", key: "agent-Recovery Drafter", state: "complete" }
    ]);
    expect(buildAgentChecklistRows({ fallbackAgentNames: ["POD-Retriever"], status: "connecting", trace: [] })).toEqual([
      { agentName: "POD-Retriever", key: "agent-POD-Retriever", state: "running" }
    ]);
  });

  it("builds Phase 7 verdict band and drawer triggers from real values", () => {
    const item = workItem({
      amount: "$21,300.00",
      recommendedActionLabel: "Recovery draft staged",
      routing: "recovery",
      verdict: "invalid",
      verdictLabel: "Invalid"
    });

    expect(buildCopilotVerdictBand({ basis: "POD shows full signed delivery.", workItem: item })).toEqual({
      actionLabel: "Recovery draft staged",
      amountLabel: "$21,300.00",
      basis: "POD shows full signed delivery.",
      routeLabel: "Recovery",
      tone: "invalid",
      verdictLabel: "Invalid"
    });
    expect(buildCopilotDrawerTrigger("Citations", "24 records")).toBe("Citations · 24 records");
  });

});
