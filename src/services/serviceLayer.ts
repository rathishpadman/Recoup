import { z } from "zod";
import { draftOutreach } from "../tools/actions/draftOutreach.js";
import { draftRebill } from "../tools/actions/draftRebill.js";
import { proposeHold } from "../tools/actions/proposeHold.js";
import { proposeTerms } from "../tools/actions/proposeTerms.js";
import { routeBilling } from "../tools/actions/routeBilling.js";
import { retrieveDocs } from "../tools/retrieval/docs.js";
import { retrieveSap } from "../tools/retrieval/sap.js";
import { retrieveTpm } from "../tools/retrieval/tpm.js";
import {
  buildDeductionDecision,
  CoreRuleInputSchema,
  DeductionDecisionToolInputSchema,
  evaluateCoreRule
} from "./decisionTools.js";
import { getDecisionOrThrow } from "./decisionStore.js";
import { DeductionLineSchema } from "../types/entities.js";
import { runRiskMeshClosedLoop } from "../agents/riskMesh.js";

interface ServiceTool {
  schema: z.ZodTypeAny;
  handler: (input: unknown) => unknown;
}

const decisionIdToolSchema = z.object({
  decisionId: z.string().min(1),
  proposedBy: z.string().min(1).optional()
});
const riskMeshCaseSchema = z.object({
  caseId: z.literal("ARB-HARBOR-ORDER-640K")
});

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
      const run = runRiskMeshClosedLoop();
      return proposeHold({
        basis: run.holdAction.basis,
        customerId: run.holdAction.customerId,
        orderAmount: run.holdAction.orderAmount,
        orderId: run.holdAction.orderId,
        partialHold: run.partialHold,
        recordIds: run.holdAction.recordIds
      });
    }
  },
  "actions.proposeTerms": {
    schema: riskMeshCaseSchema,
    handler: (input) => {
      riskMeshCaseSchema.parse(input);
      const run = runRiskMeshClosedLoop();
      return proposeTerms({
        basis: run.termsAction.basis,
        customerId: run.termsAction.customerId,
        recordIds: run.termsAction.recordIds,
        terms: run.termsAction.terms
      });
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

export function invokeServiceTool(name: string, input: unknown): unknown {
  if (!isServiceToolName(name)) {
    throw new Error("Tool is not whitelisted.");
  }

  const tool = serviceTools[name];
  return tool.handler(tool.schema.parse(input));
}

function isServiceToolName(name: string): name is ServiceToolName {
  return Object.prototype.hasOwnProperty.call(serviceTools, name);
}
