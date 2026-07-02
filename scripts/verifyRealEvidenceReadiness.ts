import { pathToFileURL } from "node:url";
import { assertRealEvidenceReadiness, buildRealEvidenceReadinessReport } from "../src/services/evidenceReadiness.js";
import {
  assertReconciliationCutoverPreflight,
  buildReconciliationCutoverPreflightReport,
  formatReconciliationCutoverPreflightFailureReport,
  formatReconciliationCutoverPreflightReport,
  type ReconciliationCutoverPreflightTarget
} from "./preflightReconciliationCutover.js";

type RealEvidenceReadinessTarget = ReconciliationCutoverPreflightTarget;

export async function runRealEvidenceReadinessCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const target = readTarget(argv);
  if (target === "production") {
    try {
      const report = await buildReconciliationCutoverPreflightReport({ target });
      process.stdout.write(formatReconciliationCutoverPreflightReport(report));
      assertReconciliationCutoverPreflight(report);
    } catch (error: unknown) {
      process.stdout.write(formatReconciliationCutoverPreflightFailureReport({ error, target }));
      throw error;
    }
    return;
  }

  const report = buildRealEvidenceReadinessReport();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  assertRealEvidenceReadiness(report);
}

function readTarget(argv: readonly string[]): RealEvidenceReadinessTarget {
  const targetArg = argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length) ?? "local";
  if (targetArg === "local" || targetArg === "production") {
    return targetArg;
  }

  throw new Error("--target must be local or production.");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRealEvidenceReadinessCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Real evidence readiness failed."}\n`);
    process.exitCode = 1;
  });
}
