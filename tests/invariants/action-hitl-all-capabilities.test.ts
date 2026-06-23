import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { createCrestlineM6ContainmentReviewAction } from "../../src/agents/containment.js";
import { decideApproval } from "../../src/services/approvals.js";
import { buildPreparedApprovalAuditEntry, invokeServiceTool, prepareApprovalDecision } from "../../src/services/serviceLayer.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import { draftOutreach } from "../../src/tools/actions/draftOutreach.js";
import { draftRebill } from "../../src/tools/actions/draftRebill.js";
import { proposeHold } from "../../src/tools/actions/proposeHold.js";
import { proposeTerms } from "../../src/tools/actions/proposeTerms.js";
import { routeBilling } from "../../src/tools/actions/routeBilling.js";
import { money } from "../../src/types/money.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const runForensics = () => runForensicsInvestigation({ governedConfig, serviceContext: fixtureForensicsServiceContext, source });

describe("I-7 and I-20 HITL gate", () => {
  it("halts every Forensics external action at human approval", () => {
    const run = runForensics();

    expect(run.actions).toHaveLength(20);
    expect(run.actions.map((action) => action.requiresHumanApproval)).toEqual(Array<boolean>(20).fill(true));
    expect(run.actions.map((action) => action.status)).toEqual(Array<string>(20).fill("pending_human"));
    expect(run.actions.map((action) => action.dispatchedExternally)).toEqual(Array<boolean>(20).fill(false));
  });

  it("rejects approval decisions made by an agent identity", () => {
    const [firstAction] = runForensics().actions;
    if (firstAction === undefined) {
      throw new Error("Expected at least one proposed action");
    }

    expect(() =>
      decideApproval(firstAction, {
        decision: "approve",
        approverId: "agent:recovery-drafter"
      })
    ).toThrow("Approval requires a human approver.");
  });

  it("rejects approval decisions without a human identity prefix", () => {
    const [firstAction] = runForensics().actions;
    if (firstAction === undefined) {
      throw new Error("Expected at least one proposed action");
    }

    expect(() =>
      decideApproval(firstAction, {
        decision: "approve",
        approverId: "system:auto"
      })
    ).toThrow("Approval requires a human approver.");
  });

  it("halts drafted outreach at the same HITL approval gate", () => {
    const run = runForensics();
    const decision = run.decisions.find((candidate) => candidate.lineId === "S5-L1");
    if (decision === undefined) {
      throw new Error("Expected S5-L1 decision.");
    }

    const outreach = draftOutreach({
      decision
    });

    expect(outreach.status).toBe("pending_human");
    expect(outreach.dispatchedExternally).toBe(false);
    expect(() =>
      decideApproval(outreach, {
        decision: "approve",
        approverId: "agent:forensics-investigator"
      })
    ).toThrow("Approval requires a human approver.");
  });

  it("halts Risk Mesh hold and term proposals at human approval", () => {
    const run = runRiskMeshClosedLoop({ governedConfig, source });

    for (const action of [run.holdAction, run.termsAction]) {
      expect(action.requiresHumanApproval).toBe(true);
      expect(action.status).toBe("pending_human");
      expect(action.dispatchedExternally).toBe(false);
      expect(() =>
        decideApproval(action, {
          decision: "approve",
          approverId: "agent:risk-mesh"
        })
      ).toThrow("Approval requires a human approver.");
    }
  });

  it("halts Behavioral Containment review closure at human approval", () => {
    const run = runForensics();
    const [candidate] = run.containmentCandidates;
    if (candidate === undefined) {
      throw new Error("Expected Crestline containment candidate.");
    }
    const reviewAction = createCrestlineM6ContainmentReviewAction(candidate);

    expect(reviewAction).toMatchObject({
      actionType: "containment-review",
      actionPosture: "no-external-action-staged",
      containsExternalDispatch: false,
      dispatchedExternally: false,
      requiresHumanApproval: true,
      status: "pending_human"
    });
    expect(reviewAction.actionId).toMatch(/^containment-review:CUST-CRESTLINE:[a-f0-9]{12}$/u);
    expect(reviewAction.recordIds).toEqual(expect.arrayContaining(candidate.recordIds));
    expect(reviewAction.behavioralEvidenceIds).toEqual(expect.arrayContaining(candidate.behavioralEvidenceIds));
    expect(Object.keys(reviewAction.deterministicBasis.rScoreComponents)).not.toHaveLength(0);
    expect(() =>
      decideApproval(reviewAction, {
        decision: "approve",
        approverId: "agent:containment"
      })
    ).toThrow("Proposer cannot approve its own action.");
    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: reviewAction.actionId,
        decision: "approve",
        approverId: "agent:containment"
      }, {
        ...fixtureForensicsServiceContext,
        governedConfig,
        source,
        verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Client approver identity must be human-scoped.");
    const prepared = prepareApprovalDecision({
      actionId: reviewAction.actionId,
      decision: "approve",
      approverId: "human:maya-lead"
    }, {
      ...fixtureForensicsServiceContext,
      governedConfig,
      source,
      verifiedHumanPrincipal: "human:maya-lead"
    });

    expect(prepared.approval).toMatchObject({
      actionId: reviewAction.actionId,
      approverId: "human:maya-lead",
      decision: "approve",
      status: "human_decided"
    });
    const auditEntry = buildPreparedApprovalAuditEntry(prepared, {
      previousHash: "GENESIS",
      sequence: 1
    });
    expect(auditEntry.entryType).toBe("approval.decision");
    expect(auditEntry.recordIds).toEqual(expect.arrayContaining([reviewAction.actionId, ...reviewAction.recordIds]));
    expect(() =>
      invokeServiceTool("approvals.decide", {
        actionId: reviewAction.actionId,
        decision: "approve",
        approverId: "human:maya-lead"
      }, {
        ...fixtureForensicsServiceContext,
        governedConfig,
        source,
        verifiedHumanPrincipal: "human:maya-lead"
      })
    ).toThrow("Supabase approval persistence required for approvals.decide.");
  });

  it("fails closed at each action tool boundary when cited records or basis are missing", () => {
    const forensicsRun = runForensics();
    const recoveryDecision = forensicsRun.decisions.find((decision) => decision.routing === "recovery");
    const billingDecision = forensicsRun.decisions.find((decision) => decision.routing === "billing");
    if (recoveryDecision === undefined || billingDecision === undefined) {
      throw new Error("Expected recovery and billing decisions.");
    }

    expect(() =>
      draftRebill({
        decision: {
          ...recoveryDecision,
          recordIds: []
        }
      })
    ).toThrow("Decision requires cited recordIds and deterministic basis.");

    expect(() =>
      draftOutreach({
        decision: {
          ...recoveryDecision,
          basis: ""
        }
      })
    ).toThrow("Decision requires cited recordIds and deterministic basis.");

    expect(() =>
      routeBilling({
        decision: {
          ...billingDecision,
          deterministicBasis: {
            ...billingDecision.deterministicBasis,
            amountSource: "model-text"
          }
        } as unknown as typeof billingDecision
      })
    ).toThrow("Decision requires cited recordIds and deterministic basis.");

    expect(() =>
      draftRebill({
        decision: billingDecision
      })
    ).toThrow("Recovery actions require recovery-routed deduction decisions.");

    expect(() =>
      draftOutreach({
        decision: billingDecision
      })
    ).toThrow("Recovery actions require recovery-routed deduction decisions.");

    expect(() =>
      routeBilling({
        decision: recoveryDecision
      })
    ).toThrow("Billing actions require billing-routed deduction decisions.");

    const malformedRecoveryDecision = {
      ...billingDecision,
      routing: "recovery",
      evidenceDocumentIds: [],
      evidenceDocuments: []
    } as Parameters<typeof draftRebill>[0]["decision"];
    expect(() =>
      draftRebill({
        decision: malformedRecoveryDecision
      })
    ).toThrow("Recovery actions require referenced supporting documents.");
    expect(() =>
      draftOutreach({
        decision: malformedRecoveryDecision
      })
    ).toThrow("Recovery actions require referenced supporting documents.");

    const wrongSupportTypeDecision = {
      ...billingDecision,
      routing: "recovery",
      deterministicBasis: {
        ...billingDecision.deterministicBasis,
        ruleId: "pricing-below-contract"
      },
      evidenceDocumentIds: ["INV-WRONG-SUPPORT"],
      evidenceDocuments: [
        {
          documentId: "INV-WRONG-SUPPORT",
          documentType: "invoice",
          source: "sap",
          summary: "Invoice is not the rule-specific contract support document.",
          recordIds: ["INV-WRONG-SUPPORT"]
        }
      ]
    } as Parameters<typeof draftRebill>[0]["decision"];
    expect(() =>
      draftRebill({
        decision: wrongSupportTypeDecision
      })
    ).toThrow("Invalid or partial deduction decisions require the rule-specific support document.");

    const riskRun = runRiskMeshClosedLoop({ governedConfig, source });
    expect(() =>
      proposeHold({
        ...riskRun.holdAction,
        amountSplit: {
          amountSource: "partial-hold-core",
          orderAmount: riskRun.holdAction.orderAmount,
          proposedBackOrderAmount: riskRun.holdAction.proposedBackOrderAmount,
          proposedReleaseAmount: riskRun.holdAction.proposedReleaseAmount,
          releaseRatioPercent: riskRun.partialHold.releaseRatioPercent
        },
        orderId: riskRun.holdAction.orderId,
        partialHold: riskRun.partialHold,
        recordIds: []
      })
    ).toThrow("Action proposals require cited recordIds and deterministic basis.");

    expect(() =>
      proposeHold({
        ...riskRun.holdAction,
        amountSplit: {
          amountSource: "partial-hold-core",
          orderAmount: riskRun.holdAction.orderAmount,
          proposedBackOrderAmount: riskRun.holdAction.proposedBackOrderAmount,
          proposedReleaseAmount: money("1.00"),
          releaseRatioPercent: riskRun.partialHold.releaseRatioPercent
        },
        orderId: riskRun.holdAction.orderId,
        partialHold: riskRun.partialHold
      })
    ).toThrow("Partial-hold action amounts must match deterministic core split.");

    expect(() =>
      proposeTerms({
        customerId: riskRun.termsAction.customerId,
        terms: riskRun.termsAction.terms,
        recordIds: riskRun.termsAction.recordIds,
        basis: riskRun.termsAction.basis,
        deterministicBasis: {
          foo: "bar"
        }
      } as unknown as Parameters<typeof proposeTerms>[0])
    ).toThrow("Action proposals require cited recordIds and deterministic basis.");
  });
});
