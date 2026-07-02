import { pathToFileURL } from "node:url";
import {
  buildLiveRepairPlan,
  type ReconciliationCutoverRepairAction,
  type ReconciliationCutoverRepairPlan,
  type ReconciliationCutoverRepairPlanStatus
} from "./planReconciliationCutoverRepair.js";
import { type ReconciliationCutoverPreflightSourceReadFailure, type ReconciliationCutoverPreflightTarget } from "./preflightReconciliationCutover.js";
import {
  buildReconciliationCutoverSchemaRepairSqlArtifact,
  type ReconciliationCutoverSchemaRepairSqlArtifact
} from "./generateReconciliationCutoverSchemaRepairSql.js";

export interface ReconciliationCutoverApprovalChecklistItem {
  approvalRequired: true;
  gate: "schema_repair" | "real_evidence_refresh" | "production_project_binding" | "preview_canary_browser_proof";
  title: string;
}

export interface ReconciliationCutoverApprovalPacket {
  approvalChecklist: ReconciliationCutoverApprovalChecklistItem[];
  approvalRequired: true;
  artifactType: "human_approval_cutover_packet";
  generatedAt: string;
  noMutation: true;
  postApprovalMutationCommands: string[];
  postApprovalProductionProofCommands: string[];
  readOnlyVerificationCommands: string[];
  repairPlan: ReconciliationCutoverRepairPlan;
  sqlArtifact: ReconciliationCutoverSchemaRepairSqlArtifact;
  status: ReconciliationCutoverRepairPlanStatus;
  target: ReconciliationCutoverPreflightTarget;
}

export interface BuildReconciliationCutoverApprovalPacketOptions {
  generatedAt?: string;
  repairPlan: ReconciliationCutoverRepairPlan;
  sqlArtifact: ReconciliationCutoverSchemaRepairSqlArtifact;
}

export function buildReconciliationCutoverApprovalPacket(
  options: BuildReconciliationCutoverApprovalPacketOptions
): ReconciliationCutoverApprovalPacket {
  return {
    approvalChecklist: [
      {
        approvalRequired: true,
        gate: "schema_repair",
        title: "Approve canonical schema repair"
      },
      {
        approvalRequired: true,
        gate: "real_evidence_refresh",
        title: "Approve real evidence refresh"
      },
      {
        approvalRequired: true,
        gate: "production_project_binding",
        title: "Approve production project binding"
      },
      {
        approvalRequired: true,
        gate: "preview_canary_browser_proof",
        title: "Approve preview/canary/browser proof"
      }
    ],
    approvalRequired: true,
    artifactType: "human_approval_cutover_packet",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    noMutation: true,
    postApprovalMutationCommands: [...options.sqlArtifact.postApprovalMutationCommands],
    postApprovalProductionProofCommands: [...options.sqlArtifact.postApprovalProductionProofCommands],
    readOnlyVerificationCommands: [
      "npm.cmd run check:reconciliation-cutover-env",
      "npm.cmd run check:real-evidence-proof",
      ...options.sqlArtifact.readOnlyVerificationCommands
    ],
    repairPlan: options.repairPlan,
    sqlArtifact: options.sqlArtifact,
    status: options.repairPlan.status,
    target: options.repairPlan.target
  };
}

export function formatReconciliationCutoverApprovalPacketMarkdown(packet: ReconciliationCutoverApprovalPacket): string {
  return `# Reconciliation Cutover Approval Packet

Generated: ${packet.generatedAt}

Target: ${packet.target}

Status: ${packet.status}

Provider mutation: none. This packet is local review output only.

Command host: Windows PowerShell in this Recoup workspace. Non-Windows reviewers may translate \`npm.cmd run\` to \`npm run\`; these commands are documentation, not CI automation.

## Approval Checklist

${packet.approvalChecklist.map((item) => `- [ ] ${item.title}`).join("\n")}

## Read-Only Verification Commands

${packet.readOnlyVerificationCommands.map((command) => `- \`${command}\``).join("\n")}

## Current Source Read Failures

${formatSourceReadFailures(packet.repairPlan.sourceReadFailures ?? [])}

## Blocking Preflight Error

${packet.repairPlan.preflightError ?? "No blocking preflight error was reported."}

## Repair Actions

${formatRepairActions(packet.repairPlan.repairActions)}

## Remaining Gates

${formatRemainingGates(packet.repairPlan.remainingGates)}

## Post-Approval Mutation Commands

${packet.postApprovalMutationCommands.map((command) => `- \`${command}\``).join("\n")}

## Post-Approval Production Proof Commands

${packet.postApprovalProductionProofCommands.map((command) => `- \`${command}\``).join("\n")}

## Review-Only SQL Plan

\`\`\`sql
${packet.sqlArtifact.reviewOnlySqlPlan.trimEnd()}
\`\`\`
`;
}

async function buildLiveApprovalPacket(target: ReconciliationCutoverPreflightTarget): Promise<ReconciliationCutoverApprovalPacket> {
  const repairPlan = await buildLiveRepairPlan(target);
  const generatedAt = new Date().toISOString();

  return buildReconciliationCutoverApprovalPacket({
    generatedAt,
    repairPlan,
    sqlArtifact: buildReconciliationCutoverSchemaRepairSqlArtifact({ generatedAt })
  });
}

function formatRepairActions(actions: readonly ReconciliationCutoverRepairAction[]): string {
  if (actions.length === 0) {
    return "No schema repair actions were produced by the read-only repair planner.";
  }

  return actions
    .map((action) => {
      const tables = action.tables === undefined ? "n/a" : action.tables.join(", ");
      const missingColumns = action.missingColumns === undefined ? "n/a" : action.missingColumns.join(", ");
      const command = action.command === undefined ? "n/a" : action.command;

      return `- **${action.title}**
  - Approval required: ${String(action.approvalRequired)}
  - Tables: ${tables}
  - Missing columns: ${missingColumns}
  - Reason: ${action.reason}
  - Command: ${command}`;
    })
    .join("\n");
}

function formatRemainingGates(gates: readonly string[]): string {
  if (gates.length === 0) {
    return "No remaining gates were reported by the repair planner.";
  }

  return gates.map((gate) => `- ${gate}`).join("\n");
}

function formatSourceReadFailures(failures: readonly ReconciliationCutoverPreflightSourceReadFailure[]): string {
  if (failures.length === 0) {
    return "No source-read failures were reported by the read-only preflight.";
  }

  const rows = failures.map(
    (failure) =>
      `| ${failure.table} | ${failure.failureKind} | ${failure.httpStatus === undefined ? "n/a" : String(failure.httpStatus)} | ${
        failure.postgrestCode ?? "n/a"
      } | ${failure.missingColumns === undefined ? "n/a" : failure.missingColumns.join(", ")} |`
  );

  return ["| Table | Failure kind | HTTP status | PostgREST code | Missing selected columns |", "|---|---|---:|---|---|", ...rows].join("\n");
}

function readTarget(argv: readonly string[]): ReconciliationCutoverPreflightTarget {
  const targetArg = argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length) ?? "local";
  if (targetArg === "local" || targetArg === "production") {
    return targetArg;
  }

  throw new Error("--target must be local or production.");
}

async function main(): Promise<void> {
  const target = readTarget(process.argv.slice(2));
  const packet = await buildLiveApprovalPacket(target);
  process.stdout.write(formatReconciliationCutoverApprovalPacketMarkdown(packet));
  if (packet.status === "blocked") {
    process.stderr.write("Blocked until the approval checklist and read-only preflight pass; no provider mutation was performed.\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reconciliation cutover approval packet generation failed."}\n`);
    process.exitCode = 1;
  });
}
