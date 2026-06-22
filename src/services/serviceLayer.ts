import { z } from "zod";
import { draftOutreach } from "../tools/actions/draftOutreach.js";
import { draftRebill } from "../tools/actions/draftRebill.js";
import { proposeHold } from "../tools/actions/proposeHold.js";
import { proposeTerms } from "../tools/actions/proposeTerms.js";
import { routeBilling } from "../tools/actions/routeBilling.js";
import { retrieveDocs } from "../tools/retrieval/docs.js";
import { retrieveSap } from "../tools/retrieval/sap.js";
import { retrieveTpm } from "../tools/retrieval/tpm.js";
import { answerOfflineQuery } from "../agents/query.js";
import {
  assertApprovalActionOpen,
  assertApprovalReasonSafe,
  decideApproval,
  recordApprovalActionDecision,
  type ApprovalResult,
  type ProposedExternalAction
} from "./approvals.js";
import { createAuditTrail } from "../audit/trail.js";
import { runForensicsInvestigation } from "../agents/forensics.js";
import type { ToolPermissionMetadata } from "./permissionEngine.js";
import {
  buildDeductionDecision,
  CoreRuleInputSchema,
  DeductionDecisionToolInputSchema,
  evaluateCoreRule
} from "./decisionTools.js";
import { getDecisionOrThrow } from "./decisionStore.js";
import { DeductionLineSchema } from "../types/entities.js";
import { buildHarborRiskMeshProposalContext, runRiskMeshClosedLoop } from "../agents/riskMesh.js";

interface ServiceTool {
  schema: z.ZodTypeAny;
  handler: (input: unknown, context: ServiceInvocationContext) => unknown;
}

export interface ServiceInvocationContext {
  verifiedHumanPrincipal?: string;
}

const decisionIdToolSchema = z.object({
  decisionId: z.string().min(1),
  proposedBy: z.string().min(1).optional()
});
const riskMeshCaseSchema = z.object({
  caseId: z.literal("ARB-HARBOR-ORDER-640K")
});
const approvalDecisionToolSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(["approve", "modify", "reject"]),
  approverId: z.string().min(1).optional(),
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().min(8).max(500).optional()
  )
}).superRefine((value, context) => {
  if (value.approverId !== undefined && !value.approverId.startsWith("human:")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Client approver identity must be human-scoped.",
      path: ["approverId"]
    });
  }

  if (value.decision !== "approve" && value.reason === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason required for modify or reject decisions.",
      path: ["reason"]
    });
  }

  if (value.reason !== undefined) {
    try {
      assertApprovalReasonSafe(value.reason);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Approval reason rejected.",
        path: ["reason"]
      });
    }
  }
});
const queryAnswerToolSchema = z.object({
  question: z.string().min(1).max(500)
});
const serviceApprovalAuditTrail = createAuditTrail();

export interface PreparedApprovalDecision {
  action: ProposedExternalAction;
  approval: ApprovalResult;
}

export const serviceToolMetadata = {
  "actions.draftOutreach": { riskClass: "communication", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.draftRebill": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.proposeHold": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.proposeTerms": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.routeBilling": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "approvals.decide": { riskClass: "approval_gate", sideEffectClass: "write_local", visibility: "internal" },
  "audit.read": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "core.evaluateRule": { riskClass: "compute_only", sideEffectClass: "none", visibility: "internal" },
  "core.riskMeshClosedLoop": { riskClass: "compute_only", sideEffectClass: "none", visibility: "internal" },
  "decisions.deductionVerdict": { riskClass: "decision", sideEffectClass: "write_local", visibility: "internal" },
  "query.answer": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.docs": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.sap": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.tpm": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" }
} satisfies Record<string, ToolPermissionMetadata>;

export const serviceTools = {
  "actions.draftOutreach": {
    schema: decisionIdToolSchema,
    handler: (input) => {
      const parsed = decisionIdToolSchema.parse(input);
      const actionInput =
        parsed.proposedBy === undefined
          ? { decision: getDecisionOrThrow(parsed.decisionId) }
          : { decision: getDecisionOrThrow(parsed.decisionId), proposedBy: parsed.proposedBy };
      return draftOutreach({
        ...actionInput
      });
    }
  },
  "actions.draftRebill": {
    schema: decisionIdToolSchema,
    handler: (input) => {
      const parsed = decisionIdToolSchema.parse(input);
      const actionInput =
        parsed.proposedBy === undefined
          ? { decision: getDecisionOrThrow(parsed.decisionId) }
          : { decision: getDecisionOrThrow(parsed.decisionId), proposedBy: parsed.proposedBy };
      return draftRebill({
        ...actionInput
      });
    }
  },
  "actions.proposeHold": {
    schema: riskMeshCaseSchema,
    handler: (input) => {
      riskMeshCaseSchema.parse(input);
      const context = buildHarborRiskMeshProposalContext();
      return proposeHold(context.holdProposalInput);
    }
  },
  "actions.proposeTerms": {
    schema: riskMeshCaseSchema,
    handler: (input) => {
      riskMeshCaseSchema.parse(input);
      const context = buildHarborRiskMeshProposalContext();
      return proposeTerms(context.termsProposalInput);
    }
  },
  "actions.routeBilling": {
    schema: decisionIdToolSchema,
    handler: (input) => {
      const parsed = decisionIdToolSchema.parse(input);
      const actionInput =
        parsed.proposedBy === undefined
          ? { decision: getDecisionOrThrow(parsed.decisionId) }
          : { decision: getDecisionOrThrow(parsed.decisionId), proposedBy: parsed.proposedBy };
      return routeBilling({
        ...actionInput
      });
    }
  },
  "approvals.decide": {
    schema: approvalDecisionToolSchema,
    handler: (input, context) => {
      const { action, approval } = prepareApprovalDecision(input, context);
      const auditEntry = serviceApprovalAuditTrail.append({
        entryType: "approval.decision",
        payload: {
          actionId: approval.actionId,
          approverId: approval.approverId,
          decision: approval.decision,
          ...(approval.reason === undefined ? {} : { reason: approval.reason }),
          status: approval.status
        },
        recordIds: [approval.actionId, ...action.recordIds]
      });
      recordApprovalActionDecision(action.actionId);

      return {
        ...approval,
        auditEntryHash: auditEntry.entryHash
      };
    }
  },
  "audit.read": {
    schema: riskMeshCaseSchema,
    handler: (input) => {
      const parsed = riskMeshCaseSchema.parse(input);
      const run = runRiskMeshClosedLoop();
      return {
        caseId: parsed.caseId,
        auditEntries: run.auditEntries,
        auditTrailValid: run.auditTrailValid
      };
    }
  },
  "core.evaluateRule": {
    schema: CoreRuleInputSchema,
    handler: (input) => evaluateCoreRule(input)
  },
  "core.riskMeshClosedLoop": {
    schema: riskMeshCaseSchema,
    handler: (input) => {
      riskMeshCaseSchema.parse(input);
      return runRiskMeshClosedLoop();
    }
  },
  "decisions.deductionVerdict": {
    schema: DeductionDecisionToolInputSchema,
    handler: (input) => buildDeductionDecision(input)
  },
  "query.answer": {
    schema: queryAnswerToolSchema,
    handler: (input) => answerOfflineQuery(queryAnswerToolSchema.parse(input))
  },
  "retrieval.docs": {
    schema: DeductionLineSchema,
    handler: (input) => retrieveDocs(DeductionLineSchema.parse(input))
  },
  "retrieval.sap": {
    schema: DeductionLineSchema,
    handler: (input) => retrieveSap(DeductionLineSchema.parse(input))
  },
  "retrieval.tpm": {
    schema: DeductionLineSchema,
    handler: (input) => retrieveTpm(DeductionLineSchema.parse(input))
  }
} satisfies Record<string, ServiceTool>;

export type ServiceToolName = keyof typeof serviceTools;

export function invokeServiceTool(name: string, input: unknown, context: ServiceInvocationContext = {}): unknown {
  if (!isServiceToolName(name)) {
    throw new Error("Tool is not whitelisted.");
  }

  const tool = serviceTools[name];
  return tool.handler(tool.schema.parse(input), context);
}

export function prepareApprovalDecision(input: unknown, context: ServiceInvocationContext = {}): PreparedApprovalDecision {
  const parsed = approvalDecisionToolSchema.parse(input);
  const approverId = readVerifiedHumanPrincipal(context);
  const action = findPendingAction(parsed.actionId);
  assertApprovalActionOpen(action.actionId);
  return {
    action,
    approval: decideApproval(action, {
      approverId,
      decision: parsed.decision,
      ...(parsed.reason === undefined ? {} : { reason: parsed.reason })
    })
  };
}

function isServiceToolName(name: string): name is ServiceToolName {
  return Object.prototype.hasOwnProperty.call(serviceTools, name);
}

function findPendingAction(actionId: string): ProposedExternalAction {
  const forensicsAction = runForensicsInvestigation().actions.find((action) => action.actionId === actionId);
  if (forensicsAction !== undefined) {
    return forensicsAction;
  }

  const riskRun = runRiskMeshClosedLoop();
  const riskAction = [riskRun.holdAction, riskRun.termsAction].find((action) => action.actionId === actionId);
  if (riskAction !== undefined) {
    return riskAction;
  }

  throw new Error("Action not found.");
}

function readVerifiedHumanPrincipal(context: ServiceInvocationContext): string {
  const principal = context.verifiedHumanPrincipal?.trim();
  if (principal === undefined || !principal.startsWith("human:")) {
    throw new Error("Verified human service context required.");
  }

  return principal;
}
