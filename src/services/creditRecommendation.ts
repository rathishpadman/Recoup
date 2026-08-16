import type { CreditRecommendationKind, CreditRiskAccountModel, CreditRiskRows } from "./creditRiskModel.js";
import { buildCreditRiskReviewModel, nextTermsNetDays, nextVerdictBand } from "./creditRiskModel.js";

export const creditRecommendationActionIdPrefix = "credit-recommendation:";
export const creditRecommendationProposedBy = "agent:credit-risk-review";

const titleByKind: Record<CreditRecommendationKind, string> = {
  "band-downgrade": "Downgrade risk band",
  "terms-change": "Tighten payment terms"
};

/**
 * The recommendation as the backend derives it, before any surface adds provenance or approval
 * state. Both the Maya read model and the approval path build from this so an approved action
 * carries exactly the values that were shown on the card.
 */
export interface CreditRecommendationCore {
  accountId: string;
  actionId: string;
  amount: string;
  basis: string;
  currentLabel: string;
  deterministicBasis: string;
  kind: CreditRecommendationKind;
  proposedLabel: string;
  recordIds: string[];
  title: string;
}

export function creditRecommendationActionId(lineId: string, kind: CreditRecommendationKind): string {
  return `${creditRecommendationActionIdPrefix}${lineId}:${kind}`;
}

/** Credit accounts are keyed by scenario, and a deduction line id leads with its scenario. */
export function creditRecommendationScenarioId(lineId: string): string | undefined {
  const scenarioId = lineId.split("-")[0];

  return scenarioId === undefined || scenarioId.length === 0 ? undefined : scenarioId;
}

/** Resolves the credit account a deduction line belongs to, via its scenario. */
export function findCreditAccountForLine(
  rows: CreditRiskRows,
  lineId: string
): CreditRiskAccountModel | undefined {
  const scenarioId = creditRecommendationScenarioId(lineId);
  const accountId = rows.deductions.find((deduction) => deduction.scenarioId === scenarioId)?.accountId;
  if (accountId === undefined) {
    return undefined;
  }

  return buildCreditRiskReviewModel(rows).accounts.find((account) => account.accountId === accountId);
}

export function parseCreditRecommendationActionId(
  actionId: string
): { kind: CreditRecommendationKind; lineId: string } | undefined {
  const match = /^credit-recommendation:(?<lineId>.+):(?<kind>band-downgrade|terms-change)$/u.exec(actionId);
  const lineId = match?.groups?.["lineId"];
  const kind = match?.groups?.["kind"];
  if (lineId === undefined || kind === undefined) {
    return undefined;
  }

  return { kind: kind as CreditRecommendationKind, lineId };
}

export function buildCreditRecommendationCores(input: {
  account: CreditRiskAccountModel;
  asOfDate: string;
  lineId: string;
  recordIds: readonly string[];
}): CreditRecommendationCore[] {
  const { account } = input;
  const proposedBand = nextVerdictBand(account.verdict);
  const proposedTermsDays = nextTermsNetDays(account.termsDays);
  const recordIds = [...new Set([account.accountId, input.lineId, ...input.recordIds])];
  // The amount a credit decision keys off is the account's unsupported deduction exposure, which
  // both the Maya card and the approval path read from the same governed account model.
  const amount = account.unsupportedAmountLabel;
  // The date belongs to the credit position, not to the recommendation. Saying "recommended on
  // <snapshot date>" read as though Maya had decided in January when that is simply when the
  // credit data was measured. A recommendation has no decision date until a human approves it.
  const caseContext = `Raised by Maya from case ${input.lineId} routed to Recovery. Credit position as of ${input.asOfDate}: ${account.accountId} unsupported deductions ${amount}`;

  return [
    {
      currentLabel: account.verdict,
      kind: "band-downgrade" as const,
      proposedLabel: proposedBand,
      basis:
        proposedBand === account.verdict
          ? `${caseContext}; ${account.accountId} is already at the highest risk band ${account.verdict}, so no further downgrade is proposed.`
          : `${caseContext}; ${account.accountId} risk band ${account.verdict} -> ${proposedBand}.`
    },
    {
      currentLabel: `Net ${account.termsDays.toString()}`,
      kind: "terms-change" as const,
      proposedLabel: `Net ${proposedTermsDays.toString()}`,
      basis:
        proposedTermsDays === account.termsDays
          ? `${caseContext}; ${account.accountId} is already at the tightest governed terms Net ${account.termsDays.toString()}, so no further tightening is proposed.`
          : `${caseContext}; ${account.accountId} account terms Net ${account.termsDays.toString()} -> Net ${proposedTermsDays.toString()}.`
    }
  ].map((recommendation) => ({
    accountId: account.accountId,
    actionId: creditRecommendationActionId(input.lineId, recommendation.kind),
    amount,
    basis: recommendation.basis,
    currentLabel: recommendation.currentLabel,
    deterministicBasis: `${recommendation.kind} derived from credit account ${account.accountId} as of ${input.asOfDate}; requires human approval before it reaches David`,
    kind: recommendation.kind,
    proposedLabel: recommendation.proposedLabel,
    recordIds,
    title: titleByKind[recommendation.kind]
  }));
}
