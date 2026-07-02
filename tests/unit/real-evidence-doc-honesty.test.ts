import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real evidence release documentation honesty", () => {
  it("keeps the README explicit that local verify is not production real-evidence proof", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("Real Evidence Cutover Status");
    expect(readme).toContain("npm.cmd run check:real-evidence-proof");
    expect(readme).toContain("not production-release proof");
    expect(readme).toContain("decoded POD image or HTTP-verified non-empty POD PDF/link");
    expect(readme).toContain("RECOUP_PREVIEW_URL");
    expect(readme).not.toContain(
      "The current proof pack passes end to end when `.env.local` has the Supabase service credentials."
    );
  });

  it("keeps the older Maya QA artifact labeled as historical, not current cutover proof", () => {
    const qa = readFileSync("docs/qa/maya-journey-rag-memory-test-cases-2026-06-28.md", "utf8");

    expect(qa).toContain("Historical Scope Note");
    expect(qa).toContain("2026-06-28 production smoke is historical");
    expect(qa).toContain("does not prove the 2026-07-01 real-evidence cutover");
    expect(qa).toContain("EVD-POD-S3-L1");
    expect(qa).toContain("RECON-S3-L1");
    expect(qa).toContain("npm.cmd run check:real-evidence-proof");
  });

  it("keeps post-capture scaffolding clear that partial local screenshots are not Phase 7 proof", () => {
    const postCaptureReadme = readFileSync(
      "docs/audit/real-evidence-post-implementation/2026-07-01/README.md",
      "utf8"
    );

    expect(postCaptureReadme).toContain("manifest.json");
    expect(postCaptureReadme).toContain("partial local artifacts");
    expect(postCaptureReadme).toContain("not Phase 7 production proof");
    expect(postCaptureReadme).toContain("3 local screenshot pairs pass");
    expect(postCaptureReadme).toContain("16 required route pairs still fail");
    expect(postCaptureReadme).not.toContain("`screenshots/` is intentionally absent");
  });

  it("keeps the phase plan honest about hardening and live provider gates", () => {
    const plan = readFileSync(
      "docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md",
      "utf8"
    );

    expect(plan).toContain("Step 11a: Add package scripts for the full hardening gate");
    expect(plan).toContain("Step 11b: Run full hardening gate to pass");
    expect(plan).toContain("3 route pairs passing and 16 route pairs failing");
    expect(plan).toContain("Live provider-env `authoritative` mode remains blocked");
    expect(plan).toContain("Local guard prevents repository/config defaults");
    expect(plan).toContain("Phase 6.5 release gate remains blocked");
    expect(plan).toContain("Step 1a: Run local non-browser verification");
    expect(plan).toContain("Step 1b: Run full local/browser hardening verification");
    expect(plan).toContain("Current result: PARTIAL / RELEASE GATE STILL BLOCKED");
    expect(plan).toContain("16 failing visual-diff route pairs");
    expect(plan).toContain('RECOUP_CAPTURE_KIND="preview"');
    expect(plan).toContain("npm.cmd run capture:real-evidence-audit");
    expect(plan).toContain("Preview deployment result");
    expect(plan).toContain("FINAL PROTECTED PREVIEW PASS / PRODUCTION STILL BLOCKED");
    expect(plan).toContain("docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json");
    expect(plan).toContain("19 captures, 19 HTTP 200 statuses, 19 screenshots");
    expect(plan).toContain("HTTP-verified `application/pdf` POD proof");
    expect(plan).toContain("no merge to `main`, `--prod` deploy, production alias promotion, provider env change, or Supabase DML was performed");
    expect(plan).toContain("SSE live-update e2e proves an already-open tab visibly changes after invalidation locally");
    expect(plan).toContain("default all-browser proof remains blocked by Firefox headless launch failure");
    expect(plan).toContain("This is not cross-browser release proof");
    expect(plan).toContain("when the backend/read model supplies canonical evidence and receipts");
    expect(plan).toContain("READ-ONLY PRODUCTION PREFLIGHT PASS");
    expect(plan).toContain("Local `.env.local` now includes the non-secret `RECOUP_PRODUCTION_SUPABASE_PROJECT_REF` binding");
    expect(plan).toContain("production preflight readiness is ready");
    expect(plan).toContain("ready_for_refresh_approval");
    expect(plan).toContain("browser-target reachability preflight");
    expect(plan).toContain("/api/forensics` returned HTTP 502");
    expect(plan).toContain("never became visible");
    expect(plan).toContain("HTML safe-viewer proof is no longer counted as loaded POD media");
    expect(plan).toContain("Generated support-document proof result");
    expect(plan).toContain("docs/audit/real-evidence-local/2026-07-01-local-proof-5/manifest.json");
    expect(plan).toContain("application/pdf");
    expect(plan).toContain("not live SAP/3PL original-document proof");
    expect(plan).not.toContain("REAL MEDIA/DOCUMENT VISIBLE OR SAFE VIEWER/LINK WITH LOAD PROOF");
    expect(plan).not.toContain("safe viewers/links with provenance and load proof");
    expect(plan).not.toContain("all Phase 0 routes are missing post-implementation screenshots");
    expect(plan).not.toContain("all 19 baseline live routes remain missing from post proof");
    expect(plan).not.toContain("fails all 19 routes because post screenshots have not been captured");
    expect(plan).not.toContain("latest local target failure reports");
    expect(plan).not.toContain("Step 1: Run full local verification");
    expect(plan).not.toContain("Expected: PASS for all commands");
  });

  it("keeps phase-gate chronology explicit and unfinished until before-next-phase proof exists", () => {
    const plan = readFileSync(
      "docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md",
      "utf8"
    );

    expect(plan).toContain("## Phase Gate Chronology Audit");
    expect(plan).toContain("Chronology verdict");
    expect(plan).toContain("PARTIAL");
    expect(plan).toContain("Phase 6.5 -> 7");
    expect(plan).toContain("PARTIAL");
    expect(plan).toContain("Phase 6.5 release gate remains blocked");
    expect(plan).toContain("Phase 7 closeout");
    expect(plan).toContain("NOT PROVEN");
    expect(plan).toContain("- [ ] Every phase gate ran its targeted tests and `npm.cmd run verify` before the next phase began.");
    expect(plan).not.toContain("- [x] Every phase gate ran its targeted tests and `npm.cmd run verify` before the next phase began.");
  });

  it("keeps the independent audit log explicit about baseline, local movement, and production blockers", () => {
    const auditLog = readFileSync("docs/independent-audit-log.md", "utf8");

    expect(auditLog).toContain("Independent Audit Verdict Movement - 2026-07-01");
    expect(auditLog).toContain("Phase 0 baseline verdict");
    expect(auditLog).toContain("Current local implementation status");
    expect(auditLog).toContain("Preview proof status");
    expect(auditLog).toContain("Production/post verdict");
    expect(auditLog).toContain("Required post verdict");
    expect(auditLog).toContain("Evidence/blocker");
    expect(auditLog).toContain("SAP -> Supabase");
    expect(auditLog).toContain("Supabase -> Express backend");
    expect(auditLog).toContain("Express backend -> Next API");
    expect(auditLog).toContain("Backend -> open browser tab");
    expect(auditLog).toContain("Demo/fixture escape hatches");
    expect(auditLog).toContain("Displayed verdict/confidence/routing");
    expect(auditLog).toContain("Multi-source evidence reconciliation");
    expect(auditLog).toContain("Synthetic verdict/rule-input pipeline");
    expect(auditLog).toContain("Production `rule_input_json` path");
    expect(auditLog).toContain("Runtime `scenario_id` path");
    expect(auditLog).toContain("POD/media frontend proof");
    expect(auditLog).toContain("Immutable audit + approval fail-closed");
    expect(auditLog).toContain("Cross-line behavioral gaming detection");
    expect(auditLog).toContain("LOCAL ONLY");
    expect(auditLog).toContain("PREVIEW PASSED / NOT PRODUCTION");
    expect(auditLog).toContain("PRODUCTION BLOCKED");
    expect(auditLog).toContain("BLOCKED UNTIL USER TEST + APPROVAL");
    expect(auditLog).toContain("not a production pass");
    expect(auditLog).toContain("EVD-POD-S3-L1");
    expect(auditLog).toContain("RECON-S3-L1");
    expect(auditLog).toContain("2026-07-01-local-proof-5/manifest.json");
    expect(auditLog).toContain("HTML safe-viewer proof is no longer counted as loaded POD media");
    expect(auditLog).toContain("application/pdf");
    expect(auditLog).toContain("generated/source-controlled evidence");
    expect(auditLog).toContain("zero capture errors");
    expect(auditLog).toContain("zero console-error routes");
    expect(auditLog).toContain("Superseded local Maya E2E blocker");
    expect(auditLog).toContain("The current local Maya real-backend gate is now green under SAP-degraded conditions");
    expect(auditLog).toContain("Latest local Supabase preflight on 2026-07-02 passes");
    expect(auditLog).toContain("production preflight readiness is `ready`");
    expect(auditLog).toContain("Final protected Preview proof on 2026-07-02");
    expect(auditLog).toContain("docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json");
    expect(auditLog).toContain("19 captures, 19 HTTP 200 statuses, 19 screenshots");
    expect(auditLog).toContain("HTTP-verified same-origin POD PDF link");
    expect(auditLog).toContain("no merge to `main`, production alias promotion, or production provider env change was run");
    expect(auditLog).toContain("persisted local production project-ref binding");
    expect(auditLog).toContain("ready_for_refresh_approval");
    expect(auditLog).toContain("No production deploy, public alias promotion, production mode change, or provider-env change was performed.");
    expect(auditLog).not.toContain("Latest local preflight blockers");
    expect(auditLog).not.toContain("Fresh `npm.cmd run test:e2e:maya-real` after Kaspersky was paused remains blocked");
  });

  it("keeps the restart handoff aligned with current cutover blockers", () => {
    const handoff = readFileSync("docs/vscode-handoff-status.md", "utf8");

    expect(handoff).toContain("Local `.env.local` now includes the non-secret production project-ref binding");
    expect(handoff).toContain("Provider env was not changed");
    expect(handoff).toContain("RECOUP_REAL_EVIDENCE_REFRESH_APPROVED");
    expect(handoff).toContain("RECOUP_PREVIEW_URL");
    expect(handoff).toContain("Final protected Preview proof checkpoint on 2026-07-02");
    expect(handoff).toContain("docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json");
    expect(handoff).toContain("19 captures, 19 HTTP 200 statuses, 19 screenshots");
    expect(handoff).toContain("HTTP-verified `application/pdf` POD proof");
    expect(handoff).toContain("approved production/public-alias post-implementation manifest is absent");
    expect(handoff).toContain("2026-07-01-local-proof-5/manifest.json");
    expect(handoff).toContain("19 captures, 19 HTTP 200 captures, zero capture errors, zero console-error routes");
    expect(handoff).toContain("clean local captures for the previously noisy `/forensics`, `/run`, and `/governance/connectors` routes");
    expect(handoff).toContain("not Phase 7 preview/production proof");
    expect(handoff).toContain("Local capture-timeout checkpoint");
    expect(handoff).toContain("Generated support-document proof checkpoint");
    expect(handoff).toContain("HTML safe-viewer proof is no longer counted as loaded POD media");
    expect(handoff).toContain("HTTP 200 `application/pdf`");
    expect(handoff).toContain("not live SAP/3PL/remittance originals");
    expect(handoff).toContain("Do not run production Supabase DML/backfill");
    expect(handoff).toContain("explicit human approval");
    expect(handoff).not.toContain("binding is not persisted");
    expect(handoff).not.toContain("missing project-ref persistence");
    expect(handoff).not.toContain("public alias promotion has been run");
    expect(handoff).not.toContain("zero evidence IDs, receipt IDs, content hashes, provenance terms, or loaded POD media on the four required Maya evidence-detail routes");
  });
});
