import { execFileSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
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
    auditEntryHash: string;
    decision: string;
    status: string;
  };
  approvalState: {
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
}

const localEnv = loadLocalRuntimeEnvFiles();
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const actionId = "route-billing:S1-L1";
const lineId = "S1-L1";
const adminPrincipal = "human:cfo-lead";
const mayaPrincipal = "human:maya-lead";
const demoPassword = readEnvValue("RECOUP_E2E_DEMO_PASSWORD", "Welcome#123");
const humanToken = readEnvValue("RECOUP_COCKPIT_AUTH_TOKEN", "recoup-local-e2e-human-token");

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
    await waitForAnyHttpResponse(`${appUrl}/login`, 90_000);

    await timedStep("pre-test admin reset", async () => {
      const response = await resetAction(adminApiUrl, "Prepare approval lifecycle browser test");
      assert(response.ok, `Admin reset returned ${response.status.toString()}: ${await response.text()}`);
      return { detail: "Approval receipt memory cleared before browser flow.", status: response.status };
    });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await timedStep("login as Maya", async () => {
      await loginAsMaya(page, appUrl);
      return { detail: page.url() };
    });

    await timedStep("open S1-L1 draft", async () => {
      await openWorkItemDraft(page);
      const detail = await fetchDetail(readApiUrl);
      assert(detail.selected.approvalEligibility.available, "Backend detail did not expose approval eligibility.");
      return { detail: `${detail.approvalState.statusLabel}; ${detail.selected.approvalEligibility.statusLabel}` };
    });

    await timedStep("submit approval in browser", async () => {
      await submitBrowserApproval(page);
      const detail = await fetchDetail(readApiUrl);
      assert(detail.approvalState.status === "human_decided", `Expected human_decided, received ${detail.approvalState.status}.`);
      const receipt = detail.approvalReceipt;
      assert(receipt !== undefined && /^[a-f0-9]{64}$/u.test(receipt.auditEntryHash), "Approval receipt missing 64-hex audit hash.");
      return { detail: `${detail.approvalState.statusLabel}; hash ${receipt.auditEntryHash.slice(0, 8)}` };
    });

    await timedStep("logout and relogin", async () => {
      await logout(page);
      await loginAsMaya(page, appUrl);
      await openWorkItemDraft(page);
      await assertAuditUiState(page, "Human decision recorded");
      const detail = await fetchDetail(readApiUrl);
      assert(detail.approvalState.status === "human_decided", "Persisted approval did not rehydrate after relogin.");
      assert(!detail.selected.approvalEligibility.available, "Duplicate approval eligibility stayed open after committed receipt.");
      return { detail: `${detail.approvalState.statusLabel}; ${detail.selected.approvalEligibility.statusLabel}` };
    });

    await timedStep("admin reset after approval", async () => {
      const response = await resetAction(adminApiUrl, "Reset approval lifecycle after browser proof");
      assert(response.ok, `Admin reset returned ${response.status.toString()}: ${await response.text()}`);
      const detail = await fetchDetail(readApiUrl);
      assert(detail.approvalState.status === "pending_human", `Expected pending_human after reset, got ${detail.approvalState.status}.`);
      assert(detail.approvalReceipt === undefined, "Approval receipt still rehydrated after admin reset.");
      return { detail: `${detail.approvalState.statusLabel}; receipt cleared`, status: response.status };
    });

    await timedStep("relogin after reset", async () => {
      await logout(page);
      await loginAsMaya(page, appUrl);
      await openWorkItemDraft(page);
      await assertAuditUiState(page, "Audit confirmation unavailable");
      const detail = await fetchDetail(readApiUrl);
      assert(detail.approvalState.status === "pending_human", "Reset state did not survive relogin.");
      assert(detail.selected.approvalEligibility.available, "Approval eligibility did not reopen after reset.");
      return { detail: `${detail.approvalState.statusLabel}; ${detail.selected.approvalEligibility.statusLabel}` };
    });

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

async function openWorkItemDraft(page: Page): Promise<void> {
  const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${lineId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.locator('[data-testid="maya-row-action-open"]').click();
  await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("tab", { name: /^Draft$/u }).click();
  await page.locator('[data-testid="maya-recovery-draft-review"]').waitFor({ state: "visible", timeout: 30_000 });
}

async function submitBrowserApproval(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Open approval$/u }).click();
  const dialog = page.locator('[data-testid="maya-approval-gate-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  const approve = dialog.getByRole("button", { name: /^Approve$/u });
  await approve.waitFor({ state: "visible", timeout: 10_000 });
  assert(!(await approve.isDisabled()), "Approve button is disabled.");
  await approve.click();
  await page.getByText("Approval response recorded").waitFor({ state: "visible", timeout: 30_000 });
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

async function resetAction(apiUrl: string, reason: string): Promise<Response> {
  return fetch(`${apiUrl}/admin/demo-reset`, {
    body: JSON.stringify({ actionId, reason }),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": adminPrincipal,
      "x-recoup-human-token": humanToken
    },
    method: "POST"
  });
}

async function fetchDetail(apiUrl: string): Promise<WorkItemDetailResponse> {
  const response = await fetch(`${apiUrl}/forensics/work-items/${encodeURIComponent(lineId)}`, {
    cache: "no-store",
    headers: {
      "x-recoup-human-principal": mayaPrincipal,
      "x-recoup-human-token": humanToken
    }
  });
  const bodyText = await response.text();
  assert(response.ok, `Detail request failed ${response.status.toString()}: ${bodyText}`);
  return JSON.parse(bodyText) as WorkItemDetailResponse;
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
