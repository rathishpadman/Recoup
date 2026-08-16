import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.js";

/**
 * Read-only post-deploy check for the Maya-to-credit recommendation loop.
 *
 * Every failure this has caught so far was a propagation failure, not a logic failure: the
 * approvals were committed and correct while a surface kept serving a snapshot taken before them.
 * So this asserts agreement between the three places the same fact lives - the approval store, the
 * work-item read model, and the credit read model - rather than re-testing the logic.
 *
 * It writes nothing, needs no browser and no demo password, and exits non-zero on disagreement.
 */

interface CreditRecommendation {
  actionId: string;
  kind: string;
  status: string;
}

interface WorkItemDetail {
  creditRecommendations?: CreditRecommendation[];
  workItem?: { routing?: string };
}

interface CreditAccount {
  accountId: string;
  signals?: Array<{ scenarioId: string }>;
}

const env = loadLocalRuntimeEnvFiles();
const apiBaseUrl = (process.env["RECOUP_LOOP_CHECK_API_URL"] ?? env["RECOUP_API_URL"] ?? "https://recoup-api.onrender.com").replace(
  /\/+$/u,
  ""
);
const principal = env["RECOUP_COCKPIT_HUMAN_PRINCIPAL"] ?? "human:maya-lead";
const token = env["RECOUP_COCKPIT_AUTH_TOKEN"];
const supabaseUrl = env["SUPABASE_URL"]?.replace(/\/+$/u, "");
const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];
const memoryTable = env["RECOUP_SUPABASE_MEMORY_TABLE"] ?? "recoup_memory_records";

const failures: string[] = [];
function check(condition: boolean, label: string): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) {
    failures.push(label);
  }
}

async function apiJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    headers: { "x-recoup-human-principal": principal, "x-recoup-human-token": token ?? "" },
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`GET ${path} -> ${response.status.toString()}`);
  }

  return (await response.json()) as T;
}

/** Action IDs of every committed credit-recommendation approval. */
async function committedApprovalActionIds(): Promise<Set<string>> {
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read the approval store.");
  }

  const url = new URL(`${supabaseUrl}/rest/v1/${memoryTable}`);
  url.searchParams.set("select", "id,trust_level");
  url.searchParams.set("category", "eq.approval_records");
  url.searchParams.set("id", "like.approval:credit-recommendation:*");
  const response = await fetch(url.href, {
    cache: "no-store",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`approval store read -> ${response.status.toString()}`);
  }

  const rows = (await response.json()) as Array<{ id?: string; trust_level?: string }>;

  return new Set(
    rows
      .filter((row) => row.trust_level === "trusted" && typeof row.id === "string")
      .map((row) => (row.id ?? "").replace(/^approval:/u, ""))
  );
}

function recommendationLineId(actionId: string): string {
  return actionId.replace(/^credit-recommendation:/u, "").replace(/:(?:band-downgrade|terms-change)$/u, "");
}

async function main(): Promise<void> {
  if (token === undefined || token.length === 0) {
    throw new Error("RECOUP_COCKPIT_AUTH_TOKEN is required.");
  }

  console.log(`api: ${apiBaseUrl}`);
  const approved = await committedApprovalActionIds();
  console.log(`committed recommendation approvals: ${approved.size.toString()}`);

  // 1. Every approval is reflected on the work item it came from.
  const lineIds = [...new Set([...approved].map(recommendationLineId))];
  for (const lineId of lineIds) {
    const detail = await apiJson<WorkItemDetail>(`/forensics/work-items/${encodeURIComponent(lineId)}`);
    const recommendations = detail.creditRecommendations ?? [];
    check(recommendations.length > 0, `${lineId}: work item exposes credit recommendations`);
    for (const recommendation of recommendations) {
      const expected = approved.has(recommendation.actionId) ? "human_decided" : "pending_human";
      check(
        recommendation.status === expected,
        `${lineId}: ${recommendation.kind} status ${recommendation.status} matches the approval store (${expected})`
      );
    }
  }

  // 2. Every approval is reflected on the credit surface.
  const credit = await apiJson<{ accounts?: CreditAccount[] }>("/credit/v2");
  const creditSignalIds = new Set(
    (credit.accounts ?? []).flatMap((account) =>
      (account.signals ?? []).map((signal) => signal.scenarioId).filter((scenarioId) => scenarioId.startsWith("credit-recommendation:"))
    )
  );
  for (const actionId of approved) {
    check(creditSignalIds.has(actionId), `credit surface carries a signal for ${actionId}`);
  }
  for (const actionId of creditSignalIds) {
    check(approved.has(actionId), `credit signal ${actionId} corresponds to a committed approval`);
  }

  // 3. A recovery case that has no approval must still offer its recommendations.
  const pendingLine = "S5-L1";
  if (!lineIds.includes(pendingLine)) {
    const detail = await apiJson<WorkItemDetail>(`/forensics/work-items/${pendingLine}`);
    check(
      (detail.creditRecommendations ?? []).length === 2,
      `${pendingLine}: an unapproved recovery case still offers both recommendations`
    );
  }
}

await main().catch((error: unknown) => {
  console.log(`CHECK ERROR: ${error instanceof Error ? error.message : String(error)}`);
  failures.push("check error");
});

console.log(failures.length === 0 ? "\nCREDIT RECOMMENDATION LOOP OK" : `\nFAILURES (${failures.length.toString()}): ${failures.join(" | ")}`);
process.exit(failures.length === 0 ? 0 : 1);
