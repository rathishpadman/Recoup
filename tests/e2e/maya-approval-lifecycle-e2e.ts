import { execFileSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page, type Response as PlaywrightResponse } from "playwright";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../../config/localRuntimeEnv.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";

interface LifecycleStep {
  detail: string;
  elapsedMs: number;
  label: string;
  ok: boolean;
  status?: number;
}

interface ManagedProcess {
  args: string[];
  child: ChildProcessWithoutNullStreams;
  command: string;
  label: string;
  output: string[];
}

interface WorkItemDetailResponse {
  approvalReceipt?: {
    actionId: string;
    approverId?: string;
    auditEntryHash: string;
    decision: ApprovalDecision;
    reason?: string;
    recordIds?: string[];
    status: string;
  };
  approvalState: {
    actions: ApprovalActionModel[];
    status: string;
    statusLabel: string;
  };
  auditState: {
    status: string;
    statusLabel: string;
  };
  selected: {
    approvalEligibility: {
      available: boolean;
      statusLabel: string;
    };
  };
  recoveryDraft: {
    actionId: string;
  };
}

type ApprovalDecision = "approve" | "modify" | "reject";

interface ApprovalActionModel {
  decision: ApprovalDecision;
  requiresReason: boolean;
}

interface DecisionTarget {
  actionId: string;
  actions: ApprovalActionModel[];
  lineId: string;
}

interface PhaseDecisionTargets {
  approve: DecisionTarget;
  modify: DecisionTarget;
  reject: DecisionTarget;
}

interface ForensicsModelResponse {
  worklist: Array<{
    lineId: string;
  }>;
}

const localEnv = loadLocalRuntimeEnvFiles();
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const adminPrincipal = "human:cfo-lead";
const mayaPrincipal = "human:maya-lead";
const demoPassword = readEnvValue("RECOUP_E2E_DEMO_PASSWORD", "Welcome#123");
const humanToken = readEnvValue("RECOUP_COCKPIT_AUTH_TOKEN", "recoup-local-e2e-human-token");
const modifyReason = "Request corrected billing support before any recovery routing.";
const rejectReason = "Reject this draft until the evidence packet is rebuilt for review.";

const steps: LifecycleStep[] = [];

async function main(): Promise<void> {
  const readApiPort = await findAvailablePort(4317);
  const adminApiPort = await findAvailablePort(readApiPort + 1);
  const appPort = await findAvailablePort(3000);
  const readApiUrl = `http://127.0.0.1:${readApiPort.toString()}`;
  const adminApiUrl = `http://127.0.0.1:${adminApiPort.toString()}`;
  const appUrl = `http://127.0.0.1:${appPort.toString()}`;
  const readEnv = buildLifecycleEnv(readApiUrl, appUrl, mayaPrincipal);
  const adminEnv = buildLifecycleEnv(adminApiUrl, appUrl, adminPrincipal);
  const readApiServer = await startApiServer(readApiPort, readEnv);
  const adminApiServer = await startApiServer(adminApiPort, adminEnv);
  const nextProcess = startNextDev(appPort, readEnv);
  let phaseTargets: PhaseDecisionTargets | undefined;
  let browser: Browser | undefined;

  try {
    await timedStep("api health", async () => {
      const [readResponse, adminResponse] = await Promise.all([
        fetch(`${readApiUrl}/healthz`),
        fetch(`${adminApiUrl}/healthz`)
      ]);
      assert(readResponse.ok, `Read API health returned ${readResponse.status.toString()}.`);
      assert(adminResponse.ok, `Admin API health returned ${adminResponse.status.toString()}.`);
      return { detail: "Read and admin APIs accepted local health probes.", status: readResponse.status };
    });

    await timedStep("derive approval decision targets", async () => {
      phaseTargets = selectPhaseDecisionTargets(await loadDecisionTargets(readApiUrl));
      return {
        detail: `approve ${phaseTargets.approve.lineId}; modify ${phaseTargets.modify.lineId}; reject ${phaseTargets.reject.lineId}`
      };
    });
    const targets = requirePhaseTargets(phaseTargets);

    await waitForAnyHttpResponse(`${appUrl}/login`, 90_000);

    await timedStep("pre-test admin reset", async () => {
      const responses = await Promise.all(
        uniqueTargets([targets.approve, targets.modify, targets.reject]).map(async (target) => ({
          response: await resetAction(adminApiUrl, "Prepare approval lifecycle browser test", target.actionId),
          target
        }))
      );
      for (const { response, target } of responses) {
        assert(response.ok, `Admin reset for ${target.actionId} returned ${response.status.toString()}: ${await response.text()}`);
      }
      const firstStatus = responses[0]?.response.status;
      return {
        detail: `Approval receipt memory cleared for ${responses.length.toString()} decision target(s).`,
        ...(firstStatus === undefined ? {} : { status: firstStatus })
      };
    });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    let expectedDuplicateApprovalConflictConsoleCount = 0;
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        if (text.includes("status of 409 (Conflict)")) {
          expectedDuplicateApprovalConflictConsoleCount += 1;
          return;
        }
        consoleErrors.push(text);
      }
    });

    await timedStep("login as Maya", async () => {
      await loginAsMaya(page, appUrl);
      return { detail: page.url() };
    });

    await timedStep("open approve target draft", async () => {
      await openWorkItemDraft(page, appUrl, targets.approve.lineId);
      const detail = await fetchDetail(readApiUrl, targets.approve.lineId);
      assert(detail.selected.approvalEligibility.available, "Backend detail did not expose approval eligibility.");
      return { detail: `${detail.approvalState.statusLabel}; ${detail.selected.approvalEligibility.statusLabel}` };
    });

    await timedStep("submit approval in browser", async () => {
      await submitBrowserDecision(page, "approve", { closeDialog: true });
      const receipt = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.approve.lineId), targets.approve, "approve");
      return { detail: `${targets.approve.lineId}; hash ${receipt.auditEntryHash.slice(0, 8)}` };
    });

    await timedStep("logout and relogin", async () => {
      await logout(page);
      await loginAsMaya(page, appUrl);
      await openWorkItemDraft(page, appUrl, targets.approve.lineId);
      await assertAuditUiState(page, "Human decision recorded");
      const detail = await fetchDetail(readApiUrl, targets.approve.lineId);
      assert(detail.approvalState.status === "human_decided", "Persisted approval did not rehydrate after relogin.");
      assert(!detail.selected.approvalEligibility.available, "Duplicate approval eligibility stayed open after committed receipt.");
      return { detail: `${detail.approvalState.statusLabel}; ${detail.selected.approvalEligibility.statusLabel}` };
    });

    await timedStep("admin reset after approval", async () => {
      const response = await resetAction(adminApiUrl, "Reset approval lifecycle after browser proof", targets.approve.actionId);
      assert(response.ok, `Admin reset returned ${response.status.toString()}: ${await response.text()}`);
      const detail = await fetchDetail(readApiUrl, targets.approve.lineId);
      assert(detail.approvalState.status === "pending_human", `Expected pending_human after reset, got ${detail.approvalState.status}.`);
      assert(detail.approvalReceipt === undefined, "Approval receipt still rehydrated after admin reset.");
      return { detail: `${detail.approvalState.statusLabel}; receipt cleared`, status: response.status };
    });

    await timedStep("relogin after reset", async () => {
      await logout(page);
      await loginAsMaya(page, appUrl);
      await openWorkItemDraft(page, appUrl, targets.approve.lineId);
      await assertAuditUiState(page, "Audit confirmation unavailable");
      const detail = await fetchDetail(readApiUrl, targets.approve.lineId);
      assert(detail.approvalState.status === "pending_human", "Reset state did not survive relogin.");
      assert(detail.selected.approvalEligibility.available, "Approval eligibility did not reopen after reset.");
      return { detail: `${detail.approvalState.statusLabel}; ${detail.selected.approvalEligibility.statusLabel}` };
    });

    await timedStep("modify requires reason in browser", async () => {
      await openWorkItemDraft(page, appUrl, targets.modify.lineId);
      const detail = await fetchDetail(readApiUrl, targets.modify.lineId);
      assertRequiresReason(detail, "modify");
      await assertDecisionRequiresReasonInBrowser(page, "modify");
      return { detail: `${targets.modify.lineId}; Request changes stayed disabled without a reason.` };
    });

    await timedStep("submit modify in browser", async () => {
      await submitBrowserDecision(page, "modify", { closeDialog: true, reason: modifyReason });
      const receipt = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.modify.lineId), targets.modify, "modify", modifyReason);
      await assertAuditUiState(page, "Human decision recorded");
      return { detail: `${targets.modify.lineId}; hash ${receipt.auditEntryHash.slice(0, 8)}` };
    });

    await timedStep("relogin persistence after modify", async () => {
      await logout(page);
      await loginAsMaya(page, appUrl);
      await openWorkItemDraft(page, appUrl, targets.modify.lineId);
      await assertAuditUiState(page, "Human decision recorded");
      const receipt = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.modify.lineId), targets.modify, "modify", modifyReason);
      return { detail: `${targets.modify.lineId}; rehydrated ${receipt.decision}` };
    });

    await timedStep("admin reset after modify", async () => {
      const response = await resetAction(adminApiUrl, "Reset approval lifecycle after modify decision", targets.modify.actionId);
      assert(response.ok, `Admin reset returned ${response.status.toString()}: ${await response.text()}`);
      const detail = await fetchDetail(readApiUrl, targets.modify.lineId);
      assert(detail.approvalState.status === "pending_human", `Expected pending_human after modify reset, got ${detail.approvalState.status}.`);
      assert(detail.approvalReceipt === undefined, "Modify receipt still rehydrated after admin reset.");
      return { detail: `${targets.modify.lineId}; receipt cleared`, status: response.status };
    });

    await timedStep("reject requires reason in browser", async () => {
      await openWorkItemDraft(page, appUrl, targets.reject.lineId);
      const detail = await fetchDetail(readApiUrl, targets.reject.lineId);
      assertRequiresReason(detail, "reject");
      await assertDecisionRequiresReasonInBrowser(page, "reject");
      return { detail: `${targets.reject.lineId}; Reject stayed disabled without a reason.` };
    });

    await timedStep("submit reject in browser", async () => {
      await openWorkItemDraft(page, appUrl, targets.reject.lineId);
      assertRequiresReason(await fetchDetail(readApiUrl, targets.reject.lineId), "reject");
      await submitBrowserDecision(page, "reject", { closeDialog: false, reason: rejectReason });
      const receipt = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.reject.lineId), targets.reject, "reject", rejectReason);
      return { detail: `${targets.reject.lineId}; hash ${receipt.auditEntryHash.slice(0, 8)}` };
    });

    await timedStep("duplicate approval fails closed", async () => {
      const before = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.reject.lineId), targets.reject, "reject", rejectReason);
      const duplicateResponse = await submitDuplicateApprovalFromOpenDialog(page);
      assert(duplicateResponse.status() === 409, `Expected duplicate approval 409, got ${duplicateResponse.status().toString()}.`);
      await page.getByText("Approval service rejected the human decision.").waitFor({ state: "visible", timeout: 30_000 });
      await closeApprovalDialog(page);
      const after = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.reject.lineId), targets.reject, "reject", rejectReason);
      assert(after.auditEntryHash === before.auditEntryHash, "Duplicate decision replaced the committed reject receipt.");
      return { detail: `${targets.reject.lineId}; duplicate status ${duplicateResponse.status().toString()}` };
    });

    await timedStep("relogin persistence after reject", async () => {
      await logout(page);
      await loginAsMaya(page, appUrl);
      await openWorkItemDraft(page, appUrl, targets.reject.lineId);
      await assertAuditUiState(page, "Human decision recorded");
      const receipt = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.reject.lineId), targets.reject, "reject", rejectReason);
      return { detail: `${targets.reject.lineId}; rehydrated ${receipt.decision}` };
    });

    await timedStep("reset without admin fails closed", async () => {
      const before = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.reject.lineId), targets.reject, "reject", rejectReason);
      const response = await resetActionWithoutAdminAuth(readApiUrl, targets.reject.actionId);
      assert([401, 403].includes(response.status), `Expected reset without admin auth to fail closed, got ${response.status.toString()}.`);
      const after = assertCommittedReceipt(await fetchDetail(readApiUrl, targets.reject.lineId), targets.reject, "reject", rejectReason);
      assert(after.auditEntryHash === before.auditEntryHash, "Unauthorized reset cleared or replaced the committed reject receipt.");
      return { detail: `${targets.reject.lineId}; reset rejected ${response.status.toString()}`, status: response.status };
    });

    await timedStep("admin reset after reject", async () => {
      const response = await resetAction(adminApiUrl, "Reset approval lifecycle after reject decision", targets.reject.actionId);
      assert(response.ok, `Admin reset returned ${response.status.toString()}: ${await response.text()}`);
      const detail = await fetchDetail(readApiUrl, targets.reject.lineId);
      assert(detail.approvalState.status === "pending_human", `Expected pending_human after reject reset, got ${detail.approvalState.status}.`);
      assert(detail.approvalReceipt === undefined, "Reject receipt still rehydrated after admin reset.");
      return { detail: `${targets.reject.lineId}; receipt cleared`, status: response.status };
    });

    assertPhase2Coverage();
    assert(expectedDuplicateApprovalConflictConsoleCount <= 1, "Unexpected extra duplicate-approval 409 console errors were observed.");
    assert(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.join(" | ")}`);
    console.log(JSON.stringify({ ok: true, steps }, null, 2));
  } catch (error) {
    dumpRecentOutput(nextProcess);
    throw error;
  } finally {
    if (browser !== undefined) {
      await browser.close();
    }
    stopProcess(nextProcess.child);
    await Promise.all([closeServer(readApiServer), closeServer(adminApiServer)]);
  }
}

async function timedStep(
  label: string,
  run: () => Promise<{ detail: string; status?: number }>
): Promise<void> {
  const start = Date.now();
  try {
    const result = await run();
    steps.push({ detail: result.detail, elapsedMs: Date.now() - start, label, ok: true, ...(result.status === undefined ? {} : { status: result.status }) });
  } catch (error) {
    steps.push({
      detail: error instanceof Error ? error.message : "Unknown failure.",
      elapsedMs: Date.now() - start,
      label,
      ok: false
    });
    throw error;
  }
}

function assertPhase2Coverage(): void {
  const requiredLabels = [
    "modify requires reason in browser",
    "submit modify in browser",
    "admin reset after modify",
    "reject requires reason in browser",
    "submit reject in browser",
    "duplicate approval fails closed",
    "reset without admin fails closed",
    "admin reset after reject"
  ];
  const completedLabels = new Set(steps.filter((step) => step.ok).map((step) => step.label));
  const missingLabels = requiredLabels.filter((label) => !completedLabels.has(label));
  assert(missingLabels.length === 0, `Missing Phase 2 lifecycle coverage steps: ${missingLabels.join(", ")}`);
}

function selectPhaseDecisionTargets(targets: readonly DecisionTarget[]): PhaseDecisionTargets {
  const approveTarget = requireDecisionTarget(firstTargetWithDecision(targets, "approve"), "approve");
  const modifyTarget =
    firstTargetWithDecision(targets, "modify", new Set([approveTarget.actionId])) ?? approveTarget;
  const rejectTarget =
    firstTargetWithDecision(targets, "reject", new Set([approveTarget.actionId, modifyTarget.actionId])) ??
    firstTargetWithDecision(targets, "reject", new Set([approveTarget.actionId])) ??
    approveTarget;

  assertDecisionSupported(approveTarget, "approve");
  assertDecisionSupported(modifyTarget, "modify");
  assertDecisionSupported(rejectTarget, "reject");

  return {
    approve: approveTarget,
    modify: modifyTarget,
    reject: rejectTarget
  };
}

function requireDecisionTarget(target: DecisionTarget | undefined, decision: ApprovalDecision): DecisionTarget {
  assert(target !== undefined, `Backend forensics model exposed no ${decision} approval target.`);

  return target;
}

function firstTargetWithDecision(
  targets: readonly DecisionTarget[],
  decision: ApprovalDecision,
  excludedActionIds: ReadonlySet<string> = new Set()
): DecisionTarget | undefined {
  return targets.find((target) => !excludedActionIds.has(target.actionId) && target.actions.some((action) => action.decision === decision));
}

function requirePhaseTargets(targets: PhaseDecisionTargets | undefined): PhaseDecisionTargets {
  assert(targets !== undefined, "Approval lifecycle decision targets were not derived.");

  return targets;
}

function uniqueTargets(targets: readonly DecisionTarget[]): DecisionTarget[] {
  const seen = new Set<string>();
  const unique: DecisionTarget[] = [];
  for (const target of targets) {
    if (seen.has(target.actionId)) {
      continue;
    }
    seen.add(target.actionId);
    unique.push(target);
  }

  return unique;
}

function hasDecisionActions(actions: readonly ApprovalActionModel[]): boolean {
  return ["approve", "modify", "reject"].every((decision) =>
    actions.some((action) => action.decision === decision)
  );
}

function assertDecisionSupported(target: DecisionTarget, decision: ApprovalDecision): void {
  assert(
    target.actions.some((action) => action.decision === decision),
    `Backend approval target ${target.actionId} does not support ${decision}.`
  );
}

function assertRequiresReason(detail: WorkItemDetailResponse, decision: "modify" | "reject"): void {
  const action = detail.approvalState.actions.find((candidate) => candidate.decision === decision);
  assert(action !== undefined, `Backend detail did not expose ${decision} approval action.`);
  assert(action.requiresReason, `Backend detail exposed ${decision} without a required human reason.`);
}

function assertCommittedReceipt(
  detail: WorkItemDetailResponse,
  target: DecisionTarget,
  decision: ApprovalDecision,
  expectedReason?: string
): NonNullable<WorkItemDetailResponse["approvalReceipt"]> {
  assert(detail.approvalState.status === "human_decided", `Expected human_decided, received ${detail.approvalState.status}.`);
  assert(!detail.selected.approvalEligibility.available, "Duplicate approval eligibility stayed open after committed receipt.");
  const receipt = detail.approvalReceipt;
  assert(receipt !== undefined, `Committed ${decision} receipt is missing.`);
  assert(receipt.actionId === target.actionId, `Receipt actionId ${receipt.actionId} did not match ${target.actionId}.`);
  assert(receipt.decision === decision, `Receipt decision ${receipt.decision} did not match ${decision}.`);
  assert(receipt.status === "human_decided", `Receipt status ${receipt.status} did not record a human decision.`);
  assert(/^[a-f0-9]{64}$/u.test(receipt.auditEntryHash), "Approval receipt missing 64-hex audit hash.");
  assert(receipt.recordIds !== undefined && receipt.recordIds.length > 0, `Committed ${decision} receipt did not cite record IDs.`);
  assert(receipt.recordIds.includes(target.actionId), `Committed ${decision} receipt omitted action ID ${target.actionId}.`);
  if (expectedReason !== undefined) {
    assert(receipt.reason === expectedReason, `Receipt reason did not persist the human ${decision} reason.`);
  }

  return receipt;
}

function buildLifecycleEnv(apiUrl: string, appUrl: string, humanPrincipal: string): NodeJS.ProcessEnv {
  const demoSecret = readEnvValue("RECOUP_DEMO_SESSION_SECRET", humanToken);
  return sanitizedEnv({
    ...localEnv,
    ...process.env,
    NODE_ENV: "development",
    RECOUP_API_URL: apiUrl,
    RECOUP_COCKPIT_ADMIN_PRINCIPAL: adminPrincipal,
    RECOUP_COCKPIT_ALLOWED_ORIGINS: appUrl,
    RECOUP_COCKPIT_AUTH_TOKEN: humanToken,
    RECOUP_COCKPIT_HUMAN_PRINCIPAL: humanPrincipal,
    RECOUP_DATA_MODE: "real-backend",
    RECOUP_DEMO_SESSION_SECRET: demoSecret,
    RECOUP_MEMORY_BACKEND: "supabase",
    RECOUP_SUPABASE_MEMORY_TABLE: readEnvValue("RECOUP_SUPABASE_MEMORY_TABLE", "recoup_memory_records")
  });
}

async function startApiServer(port: number, env: NodeJS.ProcessEnv): Promise<Server> {
  const app = createCockpitApi({ env });
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve();
    });
  });
  return server;
}

function startNextDev(port: number, env: NodeJS.ProcessEnv): ManagedProcess {
  return startManagedProcess(
    "cockpit",
    process.execPath,
    [nextBin(), "dev", "cockpit", "--hostname", "127.0.0.1", "--port", port.toString()],
    env
  );
}

function startManagedProcess(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): ManagedProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "pipe",
    windowsHide: true
  });
  const managedProcess: ManagedProcess = { args, child, command, label, output: [] };

  child.stdout.on("data", (chunk: Buffer) => {
    appendOutput(managedProcess, chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    appendOutput(managedProcess, chunk);
  });

  return managedProcess;
}

function appendOutput(managedProcess: ManagedProcess, chunk: Buffer): void {
  managedProcess.output.push(chunk.toString("utf8"));
  if (managedProcess.output.length > 24) {
    managedProcess.output.shift();
  }
}

function dumpRecentOutput(managedProcess: ManagedProcess): void {
  if (managedProcess.output.length === 0) {
    return;
  }

  console.error(`--- ${managedProcess.label} recent output ---`);
  console.error(managedProcess.output.join(""));
}

async function loginAsMaya(page: Page, appUrl: string): Promise<void> {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="loginId"]').fill("Maya");
  await page.locator('input[name="password"]').fill(demoPassword);
  await Promise.all([
    page.waitForURL("**/forensics/shadcn", { timeout: 30_000 }),
    page.getByRole("button", { name: /Open (Forensics )?Workspace/u }).click()
  ]);
  await waitForVisibleWithPageState(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench", 30_000);
  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await waitForVisibleWithPageState(page, '[data-testid="maya-root-section-worklist"]', "Maya worklist section", 30_000);
  await waitForVisibleWithPageState(page, '[data-testid="maya-worklist-row"]', "Maya worklist row", 30_000);
}

async function openWorkItemDraft(page: Page, appUrl: string, targetLineId: string): Promise<void> {
  await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
  await waitForVisibleWithPageState(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench", 30_000);
  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await waitForVisibleWithPageState(page, '[data-testid="maya-root-section-worklist"]', "Maya worklist section", 30_000);
  const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${targetLineId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.locator('[data-testid="maya-row-action-open"]').click();
  await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("tab", { name: /^Draft$/u }).click();
  await page.locator('[data-testid="maya-recovery-draft-review"]').waitFor({ state: "visible", timeout: 30_000 });
}

async function assertDecisionRequiresReasonInBrowser(page: Page, decision: ApprovalDecision): Promise<void> {
  await openApprovalDialog(page);
  const dialog = page.locator('[data-testid="maya-approval-gate-dialog"]');
  const button = decisionButton(dialog, decision);
  await button.waitFor({ state: "visible", timeout: 10_000 });
  assert(await button.isDisabled(), `${decisionButtonLabel(decision)} button is enabled without a reason.`);
  await dialog.getByLabel("Note / reason").fill(reasonForDecision(decision));
  assert(!(await button.isDisabled()), `${decisionButtonLabel(decision)} button did not enable after a reason was supplied.`);
  await dialog.getByRole("button", { name: /^Cancel$/u }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
}

async function submitBrowserDecision(
  page: Page,
  decision: ApprovalDecision,
  options: { closeDialog: boolean; reason?: string }
): Promise<PlaywrightResponse> {
  await openApprovalDialog(page);
  const dialog = page.locator('[data-testid="maya-approval-gate-dialog"]');
  if (options.reason !== undefined) {
    await dialog.getByLabel("Note / reason").fill(options.reason);
  }
  const button = decisionButton(dialog, decision);
  await button.waitFor({ state: "visible", timeout: 10_000 });
  assert(!(await button.isDisabled()), `${decisionButtonLabel(decision)} button is disabled.`);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/approval") && response.request().method() === "POST");
  await button.click();
  const response = await responsePromise;
  assert(response.ok(), `Approval ${decision} returned ${response.status().toString()}: ${await response.text()}`);
  await page.getByText("Approval response recorded").waitFor({ state: "visible", timeout: 30_000 });
  if (options.closeDialog) {
    await closeApprovalDialog(page);
  }
  return response;
}

async function submitDuplicateApprovalFromOpenDialog(page: Page): Promise<PlaywrightResponse> {
  const dialog = page.locator('[data-testid="maya-approval-gate-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  const approve = decisionButton(dialog, "approve");
  await approve.waitFor({ state: "visible", timeout: 10_000 });
  assert(!(await approve.isDisabled()), "Approve button is disabled before duplicate approval attempt.");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/approval") && response.request().method() === "POST");
  await approve.click();
  return responsePromise;
}

function decisionButton(dialog: ReturnType<Page["locator"]>, decision: ApprovalDecision): ReturnType<Page["getByRole"]> {
  return dialog.getByRole("button", { name: decisionButtonPattern(decision) });
}

function decisionButtonPattern(decision: ApprovalDecision): RegExp {
  switch (decision) {
    case "approve":
      return /^Approve$/u;
    case "modify":
      return /^Request changes/u;
    case "reject":
      return /^Reject/u;
  }
}

function decisionButtonLabel(decision: ApprovalDecision): string {
  switch (decision) {
    case "approve":
      return "Approve";
    case "modify":
      return "Request changes";
    case "reject":
      return "Reject";
  }
}

function reasonForDecision(decision: ApprovalDecision): string {
  switch (decision) {
    case "approve":
      return "Approval reason is optional for this decision.";
    case "modify":
      return modifyReason;
    case "reject":
      return rejectReason;
  }
}

async function openApprovalDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Open approval$/u }).click();
  const dialog = page.locator('[data-testid="maya-approval-gate-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
}

async function closeApprovalDialog(page: Page): Promise<void> {
  const dialog = page.locator('[data-testid="maya-approval-gate-dialog"]');
  await page.getByRole("button", { name: /^Close human approval dialog$/u }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
}

async function assertAuditUiState(page: Page, expectedStateText: string): Promise<void> {
  await page.getByRole("tab", { name: /^Audit$/u }).click();
  const auditState = page.locator('[data-testid="maya-audit-confirmation-state"]');
  await auditState.waitFor({ state: "visible", timeout: 30_000 });
  await auditState.getByText(expectedStateText, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
}

async function logout(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL("**/login", { timeout: 30_000 }),
    page.getByRole("button", { name: /^Sign out$/u }).click()
  ]);
}

async function resetAction(apiUrl: string, reason: string, targetActionId: string): Promise<Response> {
  return fetch(`${apiUrl}/admin/demo-reset`, {
    body: JSON.stringify({ actionId: targetActionId, reason }),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": adminPrincipal,
      "x-recoup-human-token": humanToken
    },
    method: "POST"
  });
}

async function resetActionWithoutAdminAuth(apiUrl: string, targetActionId: string): Promise<Response> {
  return fetch(`${apiUrl}/admin/demo-reset`, {
    body: JSON.stringify({ actionId: targetActionId, reason: "Unauthorized reset attempt should fail closed." }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
}

async function loadDecisionTargets(apiUrl: string): Promise<DecisionTarget[]> {
  const response = await fetch(`${apiUrl}/forensics`, {
    cache: "no-store",
    headers: humanReadHeaders()
  });
  const bodyText = await response.text();
  assert(response.ok, `Forensics model request failed ${response.status.toString()}: ${bodyText}`);
  const model = JSON.parse(bodyText) as ForensicsModelResponse;
  const targets: DecisionTarget[] = [];
  const seenLineIds = new Set<string>();

  for (const item of model.worklist) {
    if (seenLineIds.has(item.lineId)) {
      continue;
    }
    seenLineIds.add(item.lineId);
    const detail = await fetchDetail(apiUrl, item.lineId);
    if (hasDecisionActions(detail.approvalState.actions)) {
      targets.push({
        actionId: detail.recoveryDraft.actionId,
        actions: detail.approvalState.actions,
        lineId: item.lineId
      });
    }
  }

  assert(targets.length > 0, "Backend forensics model exposed no approval decision targets.");
  return targets;
}

async function fetchDetail(apiUrl: string, targetLineId: string): Promise<WorkItemDetailResponse> {
  const response = await fetch(`${apiUrl}/forensics/work-items/${encodeURIComponent(targetLineId)}`, {
    cache: "no-store",
    headers: humanReadHeaders()
  });
  const bodyText = await response.text();
  assert(response.ok, `Detail request failed ${response.status.toString()}: ${bodyText}`);
  return JSON.parse(bodyText) as WorkItemDetailResponse;
}

function humanReadHeaders(): Record<string, string> {
  return {
    "x-recoup-human-principal": mayaPrincipal,
    "x-recoup-human-token": humanToken
  };
}

async function waitForAnyHttpResponse(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 600) {
        return;
      }
    } catch {
      // keep waiting
    }
    await delay(750);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function findAvailablePort(basePort: number): Promise<number> {
  for (let offset = 0; offset < 50; offset += 1) {
    const port = basePort + offset;
    if (await isTcpPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found from ${basePort.toString()}.`);
}

function isTcpPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createTcpServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

function stopProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", child.pid.toString(), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      child.kill();
      return;
    }
  }

  child.kill("SIGTERM");
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function nextBin(): string {
  return join(repoRoot, "node_modules", "next", "dist", "bin", "next");
}

function readEnvValue(key: string, fallback: string): string {
  return process.env[key] ?? localEnv[key] ?? fallback;
}

function sanitizedEnv(env: RuntimeEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  ) as NodeJS.ProcessEnv;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForVisibleWithPageState(page: Page, selector: string, label: string, timeout: number): Promise<void> {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
  } catch (error) {
    const bodyText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "body unavailable");
    const normalizedBody = bodyText.replace(/\s+/gu, " ").trim().slice(0, 700);
    throw new Error(
      `${label} did not become visible. url=${page.url()} body="${normalizedBody}" cause=${
        error instanceof Error ? error.message : "Unknown failure."
      }`
    );
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, steps, error: error instanceof Error ? error.message : "Unknown failure." }, null, 2));
  process.exitCode = 1;
});
