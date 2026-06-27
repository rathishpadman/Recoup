import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

interface ApiLogEntry {
  method: string;
  path: string;
  status: number;
  url: string;
}

interface QueryExecutionResult {
  answerPreview?: string;
  citationCount?: number;
  deterministicBasis?: string;
  durationMs: number;
  error?: string;
  id: string;
  mcpEvidence: boolean;
  mcpGatewayHealthEvidence: boolean;
  question: string;
  sapEvidence: boolean;
  sdkMcpSourceToolReceipt: boolean;
  status: "passed" | "failed";
  statusCode?: number;
  toolNames: string[];
  traceLabels: string[];
  traceRows?: number;
}

interface ProdQaResult {
  apiLogs: ApiLogEntry[];
  appUrl: string;
  browser: string;
  commit: string;
  consoleErrors: string[];
  connectorFetchMs: number;
  connectorStatus: number;
  connectorTiles: Array<{ label: string; modeLabel: string; stateLabel: string; statusTone: string }>;
  hitl: {
    approvalDialogVisible: boolean;
    approvalPostStatus?: number;
    buttonsDisabled: boolean;
    decisionButtons: string[];
    noteCounterVisible: boolean;
    result: string;
  };
  login: {
    loginApiStatus?: number;
    loginPageInteractiveMs: number;
    workspaceReadyMs: number;
  };
  queries: QueryExecutionResult[];
  renderHealth: {
    ok: boolean;
    status: number;
  };
  sections: Array<{ name: string; result: string; testId: string; visible: boolean }>;
  startedAtIso: string;
  summary: {
    failedQueries: number;
    passedQueries: number;
    totalQueries: number;
  };
}

const appUrl = trimTrailingSlash(process.env.RECOUP_PROD_APP_URL ?? "https://recoup-self-eta.vercel.app");
const renderUrl = trimTrailingSlash(process.env.RECOUP_PROD_API_URL ?? "https://recoup-api.onrender.com");
const demoPassword = process.env.RECOUP_E2E_DEMO_PASSWORD ?? "Welcome#123";
const commit = process.env.RECOUP_QA_COMMIT ?? "9446ebb8f6801437b4c1408df727af305e762f67";
const outputDir = join("output", "playwright", "prod-qa");
const queryTimeoutMs = Number(process.env.RECOUP_PROD_QA_QUERY_TIMEOUT_MS ?? "180000");
const launchHeaded = process.env.RECOUP_QA_HEADED === "1";

const mayaQueries = [
  {
    id: "q1-shortage-challenge-proof",
    question: "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?"
  },
  {
    id: "q2-manager-approval-brief",
    question: "What should I tell my manager before I ask for approval on the recovery draft?"
  },
  {
    id: "q3-billing-vs-recovery-route",
    question: "Is this a billing correction or a recovery pursuit, and what proof drives that route?"
  },
  {
    id: "q4-handoff-hitl-draft-gate",
    question:
      "Using only this selected evidence packet, have Forensics hand off to Recovery Drafter and confirm whether the recovery draft remains human-approval-gated. Which cited record IDs support that?"
  },
  {
    id: "q5-valid-deduction-counterfactual",
    question:
      "What cited evidence would make this a valid deduction, and which selected SAP or document records show that this case does not meet that valid-deduction pattern?"
  },
  {
    id: "q6-sap-call-provenance",
    question:
      "Show me the SAP or ERP read evidence used for this case and explain which cited records came from the source system versus supporting documents."
  },
  {
    id: "q7-risk-if-approved",
    question:
      "If I approve the current recovery draft, what is the business risk and which evidence records keep the action within the human approval boundary?"
  },
  {
    id: "q8-source-gaps-and-next-step",
    question:
      "Are any source systems, citations, or approval receipt fields missing or stale, and what should Maya do next without writing back to ERP?"
  }
] as const;

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const startedAtIso = new Date().toISOString();
  const apiLogs: ApiLogEntry[] = [];
  const consoleErrors: string[] = [];
  const renderHealth = await checkRenderHealth();

  const browser = await chromium.launch({ headless: !launchHeaded });
  const page = await browser.newPage({ viewport: { height: 950, width: 1440 } });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) {
      apiLogs.push({
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
        url: response.url()
      });
    }
  });

  try {
    const login = await loginAsMaya(page);
    await page.screenshot({ fullPage: true, path: join(outputDir, "01-workspace.png") });
    const connectorReadiness = await readConnectorTiles(page);
    const connectorTiles = connectorReadiness.tiles;
    const sections = await exerciseSidebarSections(page);
    await openInvestigation(page);
    await page.screenshot({ fullPage: true, path: join(outputDir, "02-investigation.png") });
    await openQueryDock(page);
    const queries = await runQueries(page);
    await page.screenshot({ fullPage: true, path: join(outputDir, "03-query-results.png") });
    const hitl = await exerciseHitl(page).catch((error: unknown) => ({
      approvalDialogVisible: false,
      buttonsDisabled: true,
      decisionButtons: [],
      noteCounterVisible: false,
      result: error instanceof Error ? `failed: ${error.message}` : "failed"
    }));
    await page.screenshot({ fullPage: true, path: join(outputDir, "04-hitl.png") });

    const result: ProdQaResult = {
      apiLogs,
      appUrl,
      browser: "chromium",
      commit,
      consoleErrors,
      connectorFetchMs: connectorReadiness.fetchMs,
      connectorStatus: connectorReadiness.status,
      connectorTiles,
      hitl,
      login,
      queries,
      renderHealth,
      sections,
      startedAtIso,
      summary: {
        failedQueries: queries.filter((query) => query.status === "failed").length,
        passedQueries: queries.filter((query) => query.status === "passed").length,
        totalQueries: queries.length
      }
    };

    await writeFile(join(outputDir, "maya-prod-qa-results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

async function loginAsMaya(page: Page): Promise<ProdQaResult["login"]> {
  const startedAt = Date.now();
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="loginId"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('input[name="password"]').waitFor({ state: "visible", timeout: 60_000 });
  const loginPageInteractiveMs = Date.now() - startedAt;
  await page.screenshot({ fullPage: true, path: join(outputDir, "00-login.png") });
  await page.locator('input[name="loginId"]').fill("Maya");
  await page.locator('input[name="password"]').fill(demoPassword);

  const loginResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/demo-login", {
    timeout: 60_000
  });
  await page.getByRole("button", { name: /Open (Forensics )?Workspace/u }).click();
  const loginResponse = await loginResponsePromise;
  await page.waitForURL("**/forensics/shadcn", { timeout: 60_000 });
  await page.getByTestId("maya-shadcn-workbench").waitFor({ state: "visible", timeout: 60_000 });

  return {
    loginApiStatus: loginResponse.status(),
    loginPageInteractiveMs,
    workspaceReadyMs: Date.now() - startedAt
  };
}

async function readConnectorTiles(page: Page): Promise<{
  fetchMs: number;
  status: number;
  tiles: ProdQaResult["connectorTiles"];
}> {
  const startedAt = Date.now();
  const response = await page.evaluate(async () => {
    const connectorResponse = await fetch("/api/connectors", { cache: "no-store" });
    const body = (await connectorResponse.json()) as {
      sourceTiles?: Array<{ label?: string; modeLabel?: string; stateLabel?: string; statusTone?: string }>;
    };
    return {
      body,
      status: connectorResponse.status
    };
  });
  const fetchMs = Date.now() - startedAt;
  if (response.status >= 400) {
    throw new Error(`/api/connectors returned HTTP ${response.status.toString()}.`);
  }

  return {
    fetchMs,
    status: response.status,
    tiles: (response.body.sourceTiles ?? []).map((tile) => ({
      label: tile.label ?? "Unknown",
      modeLabel: tile.modeLabel ?? "Unknown",
      stateLabel: tile.stateLabel ?? "Unknown",
      statusTone: tile.statusTone ?? "unknown"
    }))
  };
}

async function exerciseSidebarSections(page: Page): Promise<ProdQaResult["sections"]> {
  const sections = [
    { name: "Overview", testId: "maya-root-section-overview" },
    { name: "Worklist", testId: "maya-root-section-worklist" },
    { name: "Cases", testId: "maya-root-section-cases" },
    { name: "Evidence", testId: "maya-root-section-evidence" },
    { name: "Approvals", testId: "maya-root-section-approvals" }
  ];
  const results: ProdQaResult["sections"] = [];

  for (const section of sections) {
    await page.getByRole("button", { name: new RegExp(`^${section.name}$`, "u") }).click();
    const locator = page.getByTestId(section.testId);
    const visible = await locator.isVisible({ timeout: 15_000 }).catch(() => false);
    results.push({
      ...section,
      result: visible ? "passed" : "failed",
      visible
    });
  }

  return results;
}

async function openInvestigation(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Overview$/u }).click();
  await page.getByRole("button", { name: /Open investigation/u }).click();
  await page.getByTestId("maya-case-workspace").waitFor({ state: "visible", timeout: 60_000 });
}

async function openQueryDock(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /^Evidence$/u }).click();
  await page.getByTestId("maya-evidence-dossier").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: /^Query evidence$/u }).click();
  await page.getByTestId("maya-query-dock").waitFor({ state: "visible", timeout: 30_000 });
}

async function runQueries(page: Page): Promise<QueryExecutionResult[]> {
  const results: QueryExecutionResult[] = [];

  for (const query of mayaQueries) {
    const startedAt = Date.now();
    const responsePromise = page.waitForResponse(
      (response) => {
        if (new URL(response.url()).pathname !== "/api/forensics/query" || response.request().method() !== "POST") {
          return false;
        }

        const requestBody = response.request().postDataJSON() as { question?: string } | undefined;
        return requestBody?.question === query.question;
      },
      { timeout: queryTimeoutMs }
    );

    await page.getByTestId("maya-query-input").fill(query.question);
    await page.getByRole("button", { name: /^Run query$/u }).click();

    try {
      const response = await responsePromise;
      const body = (await response.json()) as {
        answer?: string;
        citations?: Array<{ recordId?: string }>;
        deterministicBasis?: string;
        trace?: Array<{
          hook?: string;
          label?: string;
          receiptDeterministicBasis?: string;
          retrievalSource?: string;
          sourceKind?: string;
          toolName?: string;
        }>;
      };
      const trace = body.trace ?? [];
      const toolNames = uniqueStrings(trace.map((event) => event.toolName).filter(isString));
      const traceLabels = uniqueStrings(trace.map((event) => event.label).filter(isString));
      const citationCount = body.citations?.length ?? 0;
      const status = response.status() < 400 && body.answer !== undefined && citationCount > 0 && trace.length > 0 ? "passed" : "failed";
      const sdkMcpSourceToolReceipt = trace.some(
        (event) =>
          event.hook === "agent_tool_end" &&
          (event.toolName === "query.answer" || event.toolName === "retrieval.sap") &&
          event.receiptDeterministicBasis === "OpenAI Agents SDK RunHooks lifecycle event"
      );
      results.push({
        citationCount,
        durationMs: Date.now() - startedAt,
        id: query.id,
        mcpEvidence: sdkMcpSourceToolReceipt,
        mcpGatewayHealthEvidence: false,
        question: query.question,
        sapEvidence: trace.some((event) => event.sourceKind === "sap_odata") ||
          (body.citations ?? []).some((citation) => citation.recordId?.toUpperCase().includes("SAP") === true),
        sdkMcpSourceToolReceipt,
        status,
        statusCode: response.status(),
        toolNames,
        traceLabels,
        traceRows: trace.length,
        ...(body.answer === undefined ? {} : { answerPreview: body.answer.slice(0, 180) }),
        ...(body.deterministicBasis === undefined ? {} : { deterministicBasis: body.deterministicBasis })
      });
    } catch (error) {
      results.push({
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown query failure.",
        id: query.id,
        mcpEvidence: false,
        mcpGatewayHealthEvidence: false,
        question: query.question,
        sapEvidence: false,
        sdkMcpSourceToolReceipt: false,
        status: "failed",
        toolNames: [],
        traceLabels: []
      });
    }
  }

  return results;
}

async function exerciseHitl(page: Page): Promise<ProdQaResult["hitl"]> {
  await closeQueryDockIfOpen(page);
  await page.getByRole("tab", { name: /^Draft$/u }).click();
  await page.getByTestId("maya-recovery-draft-review").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: /^Open approval$/u }).click();
  const dialog = page.getByTestId("maya-approval-gate-dialog");
  const approvalDialogVisible = await dialog.isVisible({ timeout: 30_000 }).catch(() => false);
  const noteCounterVisible = await page.getByTestId("maya-approval-note-counter").isVisible().catch(() => false);
  const decisionButtons = await dialog.locator("button").evaluateAll((buttons) =>
    buttons.map((button) => button.textContent.replace(/\s+/gu, " ").trim()).filter((text) => text.length > 0)
  );
  const decisionButtonLocators = [
    dialog.getByRole("button", { name: /Approve/u }),
    dialog.getByRole("button", { name: /Request changes/u }),
    dialog.getByRole("button", { name: /Reject/u })
  ];
  const disabledStates = await Promise.all(decisionButtonLocators.map((locator) => locator.isDisabled().catch(() => true)));
  let approvalPostStatus: number | undefined;

  if (approvalDialogVisible && disabledStates.every((disabled) => !disabled)) {
    const approvalResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/approval", {
      timeout: 60_000
    });
    await dialog.getByRole("button", { name: /Approve/u }).click();
    approvalPostStatus = (await approvalResponsePromise).status();
  }

  return {
    approvalDialogVisible,
    buttonsDisabled: disabledStates.every(Boolean),
    decisionButtons,
    noteCounterVisible,
    result: approvalDialogVisible ? "passed" : "failed",
    ...(approvalPostStatus === undefined ? {} : { approvalPostStatus })
  };
}

async function closeQueryDockIfOpen(page: Page): Promise<void> {
  const dock = page.getByTestId("maya-query-dock");
  const visible = await dock.isVisible().catch(() => false);
  if (!visible) {
    return;
  }

  await page.keyboard.press("Escape");
  await dock.waitFor({ state: "hidden", timeout: 10_000 }).catch(async () => {
    await page.mouse.click(24, 24);
    await dock.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  });
}

async function checkRenderHealth(): Promise<ProdQaResult["renderHealth"]> {
  const response = await fetch(`${renderUrl}/healthz`, { cache: "no-store" });
  return {
    ok: response.ok,
    status: response.status
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

await main();
