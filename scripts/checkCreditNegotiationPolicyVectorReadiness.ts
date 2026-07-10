import { pathToFileURL } from "node:url";
import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";
import { createOpenAiCreditNegotiationPolicyRationaleReader, type OpenAiPolicyVectorStoreFetch } from "../src/adapters/openAiPolicyVectorStore.ts";
import {
  creditNegotiationPolicyCandidateRows,
  creditNegotiationPolicyKeys,
  parseActiveCreditNegotiationPolicyRows
} from "../src/services/creditNegotiationPolicy.ts";

export type CreditNegotiationPolicyVectorReadinessStatus = "blocked" | "ready_for_policy_vector_search";

export interface CreditNegotiationPolicyVectorReadinessReport {
  artifactType: "credit_negotiation_policy_vector_readiness";
  blockers: string[];
  checkedPolicyKeys: string[];
  env: {
    missing: string[];
    present: string[];
    status: "blocked" | "ready";
  };
  generatedAt: string;
  noMutation: true;
  policyHash?: string | undefined;
  policyVersion?: number | undefined;
  rationaleRecordIds: string[];
  status: CreditNegotiationPolicyVectorReadinessStatus;
}

interface CreditNegotiationPolicyVectorReadinessEnv {
  OPENAI_API_KEY?: string | undefined;
  OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID?: string | undefined;
}

interface BuildCreditNegotiationPolicyVectorReadinessReportOptions {
  env?: CreditNegotiationPolicyVectorReadinessEnv | undefined;
  fetcher?: OpenAiPolicyVectorStoreFetch | undefined;
  generatedAt?: string | undefined;
}

const requiredEnvKeys = ["OPENAI_API_KEY", "OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID"] as const;

export async function buildCreditNegotiationPolicyVectorReadinessReport(
  options: BuildCreditNegotiationPolicyVectorReadinessReportOptions = {}
): Promise<CreditNegotiationPolicyVectorReadinessReport> {
  const env = options.env ?? loadLocalRuntimeEnvFiles();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const missing = requiredEnvKeys.filter((key) => !isConfiguredValue(env[key]));
  if (missing.length > 0) {
    return {
      artifactType: "credit_negotiation_policy_vector_readiness",
      blockers: missing.map((key) => `${key} is required before policy-vector readiness can be proven.`),
      checkedPolicyKeys: [],
      env: {
        missing: [...missing],
        present: requiredEnvKeys.filter((key) => !missing.includes(key)),
        status: "blocked"
      },
      generatedAt,
      noMutation: true,
      rationaleRecordIds: [],
      status: "blocked"
    };
  }

  const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
  const reader = createOpenAiCreditNegotiationPolicyRationaleReader({
    apiKey: env.OPENAI_API_KEY as string,
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    maxResults: 10,
    vectorStoreId: env.OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID as string
  });
  const blockers: string[] = [];
  const rationaleRecordIds: string[] = [];
  const checkedPolicyKeys: string[] = [];

  for (const policyKey of creditNegotiationPolicyKeys) {
    checkedPolicyKeys.push(policyKey);
    try {
      const results = await reader.searchPolicyRationale({
        canonicalValueText: snapshot.canonicalValueText[policyKey],
        policyHash: snapshot.policyHash,
        policyKey,
        policyVersion: snapshot.policyVersion,
        question: `Confirm current governed rationale for ${policyKey}.`
      });
      const firstResult = results[0];
      if (firstResult === undefined) {
        blockers.push(`No current policy-vector rationale found for ${policyKey}.`);
      } else {
        rationaleRecordIds.push(firstResult.recordId);
      }
    } catch (error) {
      blockers.push(
        `Policy-vector readiness search failed for ${policyKey}: ${error instanceof Error ? error.message : "unknown error"}.`
      );
    }
  }

  return {
    artifactType: "credit_negotiation_policy_vector_readiness",
    blockers,
    checkedPolicyKeys,
    env: {
      missing: [],
      present: [...requiredEnvKeys],
      status: "ready"
    },
    generatedAt,
    noMutation: true,
    policyHash: snapshot.policyHash,
    policyVersion: snapshot.policyVersion,
    rationaleRecordIds,
    status: blockers.length === 0 ? "ready_for_policy_vector_search" : "blocked"
  };
}

export function formatCreditNegotiationPolicyVectorReadinessReport(report: CreditNegotiationPolicyVectorReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function isConfiguredValue(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

async function main(): Promise<void> {
  const report = await buildCreditNegotiationPolicyVectorReadinessReport();
  process.stdout.write(formatCreditNegotiationPolicyVectorReadinessReport(report));
  if (report.status === "blocked") {
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Credit negotiation policy-vector readiness check failed."}\n`);
    process.exitCode = 1;
  });
}
