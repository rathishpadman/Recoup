import { pathToFileURL } from "node:url";
import {
  creditNegotiationPolicyCandidateRows,
  creditNegotiationPolicyKeys,
  parseActiveCreditNegotiationPolicyRows,
  type CreditNegotiationPolicyRow
} from "../src/services/creditNegotiationPolicy.ts";

export type CreditNegotiationPolicyReadinessStatus = "blocked" | "ready_for_policy_seed";

export interface CreditNegotiationPolicyReadinessReport {
  artifactType: "credit_negotiation_policy_readiness";
  blockers: string[];
  generatedAt: string;
  noMutation: true;
  policyHash?: string | undefined;
  policyKeys: string[];
  policyVersion?: 1 | undefined;
  sourceRecordIds: string[];
  status: CreditNegotiationPolicyReadinessStatus;
}

interface BuildCreditNegotiationPolicyReadinessReportOptions {
  generatedAt?: string | undefined;
  rows?: readonly CreditNegotiationPolicyRow[] | undefined;
}

export function buildCreditNegotiationPolicyReadinessReport(
  options: BuildCreditNegotiationPolicyReadinessReportOptions = {}
): CreditNegotiationPolicyReadinessReport {
  const rows = options.rows ?? creditNegotiationPolicyCandidateRows;

  try {
    const snapshot = parseActiveCreditNegotiationPolicyRows(rows);
    return {
      artifactType: "credit_negotiation_policy_readiness",
      blockers: [],
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      noMutation: true,
      policyHash: snapshot.policyHash,
      policyKeys: [...creditNegotiationPolicyKeys],
      policyVersion: snapshot.policyVersion,
      sourceRecordIds: [...snapshot.sourceRecordIds],
      status: "ready_for_policy_seed"
    };
  } catch (error) {
    return {
      artifactType: "credit_negotiation_policy_readiness",
      blockers: [error instanceof Error ? error.message : "Credit negotiation policy readiness check failed."],
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      noMutation: true,
      policyKeys: [...creditNegotiationPolicyKeys],
      sourceRecordIds: [],
      status: "blocked"
    };
  }
}

export function formatCreditNegotiationPolicyReadinessReport(report: CreditNegotiationPolicyReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function main(): void {
  const report = buildCreditNegotiationPolicyReadinessReport();
  process.stdout.write(formatCreditNegotiationPolicyReadinessReport(report));
  if (report.status === "blocked") {
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Credit negotiation policy readiness check failed."}\n`);
    process.exitCode = 1;
  }
}
