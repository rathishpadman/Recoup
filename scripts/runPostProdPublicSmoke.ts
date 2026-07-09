import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";
import { loadCreditRiskRows } from "../src/adapters/supabaseSyntheticSource.ts";
import {
  buildCreditRiskReviewModel,
  type CreditRiskAccountModel,
  type CreditRiskReviewModel
} from "../src/services/creditRiskModel.ts";
import { buildCaseScopedQueryRecordIds } from "../cockpit/components/maya/maya-workspace-derived.ts";

interface CheckResult {
  details?: Record<string, unknown>;
  name: string;
  status: "passed" | "skipped";
}

interface SmokeResult {
  appUrl: string;
  apiUrl: string;
  checks: CheckResult[];
  deployment?: {
    alias: string;
    deploymentId: string;
  };
  outputDir: string;
  startedAtIso: string;
}

interface ForensicsWorkItemDetail {
  selected: {
    evidencePack: {
      recordIds: string[];
    };
    lineId: string;
  };
  workItem: Parameters<typeof buildCaseScopedQueryRecordIds>[0];
}

interface ForensicsQueryResponse {
  answer?: string;
  citations?: Array<{ recordId?: string }>;
  modelExecution?: {
    agentNames?: string[];
    handoffCount?: number;
    mode?: string;
    rawModelTextPolicy?: string;
    tokenUsage?: number;
  };
  trace?: unknown[];
}

interface CreditQueryResponse {
  answer?: string;
  citations?: Array<{ recordId?: string }>;
  deterministicBasis?: string;
  modelExecution?: {
    agentNames?: string[];
    handoffCount?: number;
    mode?: string;
    rawModelTextPolicy?: string;
    sourceReadMode?: string;
    tokenUsage?: number;
    tokenUsageSnapshot?: { totalTokens?: number };
  };
  trace?: Array<{ toolName?: string }>;
}

interface ApiProbeResult {
  cache: string | null;
  elapsedMs: number;
  path: string;
  status: number;
}

const appUrl = trimTrailingSlash(process.env.RECOUP_PROD_APP_URL ?? "https://recoup-self-eta.vercel.app");
const apiUrl = trimTrailingSlash(process.env.RECOUP_PROD_API_URL ?? "https://recoup-api.onrender.com");
const demoPassword = process.env.RECOUP_E2E_DEMO_PASSWORD ?? "Welcome#123";
const outputDir = join("output", "playwright", "post-prod-public-smoke");
const mayaLineIds = parseCsvEnv("RECOUP_POST_PROD_MAYA_LINE_IDS", [
  "S1-L1",
  "S2-L1",
  "S3-L1",
  "S4-L1",
  "S5-L1",
  "S6-L1",
  "S7-L1",
  "S8-L1"
]);
const davidAccountIds = parseCsvEnv("RECOUP_POST_PROD_DAVID_ACCOUNT_IDS", [
  "ACC-CRE",
  "ACC-HAR",
  "ACC-VAL",
  "ACC-GRE"
]);
const skipVoice = process.env.RECOUP_POST_PROD_SKIP_VOICE === "1";
const queryTimeoutMs = Number(process.env.RECOUP_POST_PROD_QUERY_TIMEOUT_MS ?? "120000");
const renderBudgetMs = Number(process.env.RECOUP_POST_PROD_MAYA_RENDER_BUDGET_MS ?? "60000");

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const result: SmokeResult = {
    apiUrl,
    appUrl,
    checks: [],
    outputDir,
    startedAtIso: new Date().toISOString()
  };

  const deployment = await resolveVercelAliasDeployment().catch(() => undefined);
  if (deployment !== undefined) {
    result.deployment = deployment;
  }

  const browser = await chromium.launch({ headless: process.env.RECOUP_QA_HEADED !== "1" });
  try {
    result.checks.push(await smokeLanding(browser));
    result.checks.push(await smokeMaya(browser));
    if (skipVoice) {
      result.checks.push({
        details: { reason: "RECOUP_POST_PROD_SKIP_VOICE=1" },
        name: "maya-voice-realtime-bridge",
        status: "skipped"
      });
    } else {
      result.checks.push(await smokeMayaVoiceBridge(browser));
    }
    result.checks.push(await smokeDavid(browser));
    result.checks.push(await compareCreditBackendWithSupabase());

    await writeFile(join(outputDir, "post-prod-public-smoke-results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log("POST_PROD_PUBLIC_SMOKE_RESULT", JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

async function smokeLanding(browser: Browser): Promise<CheckResult> {
  const landingTabs = ["Problem", "Solution", "Demo", "Tech", "How We Built It", "About"];
  const ctaSpecs = [
    { expectedPath: "/login?loginId=Maya", selector: '[data-testid="recoup-landing-header-maya-cta"]', setupTab: undefined },
    { expectedPath: "/login?loginId=david", selector: '[data-testid="recoup-landing-header-david-cta"]', setupTab: undefined },
    { expectedPath: "/login?loginId=Maya", selector: '[data-testid="recoup-landing-hero-maya-cta"]', setupTab: undefined },
    { expectedPath: "/login?loginId=david", selector: '[data-testid="recoup-landing-hero-david-cta"]', setupTab: undefined },
    { expectedPath: "/login?loginId=Maya", selector: '[data-testid="recoup-landing-maya-cta"]', setupTab: "Demo" },
    { expectedPath: "/login?loginId=david", selector: '[data-testid="recoup-landing-david-cta"]', setupTab: "Demo" },
    { expectedPath: "/login?loginId=Maya", selector: '[data-testid="recoup-landing-enter-cta"]', setupTab: undefined },
    {
      expectedPath: "/login?loginId=david",
      selector: '[data-testid="recoup-landing-bottom-cta"] a[href="/login?loginId=david"]',
      setupTab: undefined
    }
  ];
  const viewportResults: Array<{ ctas: number; headerTabs: number; tabs: number; viewport: { height: number; width: number } }> = [];

  for (const viewport of [
    { height: 1000, width: 1440 },
    { height: 844, width: 390 }
  ]) {
    const page = await newInstrumentedPage(browser, viewport);
    try {
      await page.goto(appUrl, { timeout: 60_000, waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="recoup-landing-page"]').waitFor({ state: "visible", timeout: 30_000 });
      for (const label of landingTabs) {
        await selectLandingTab(page, label);
      }
      if (viewport.width >= 1180) {
        for (const label of landingTabs) {
          await page.locator('[data-testid="recoup-landing-header"] nav button', { hasText: label }).click();
          assert(
            (await page.getByRole("tab", { name: label }).getAttribute("aria-selected")) === "true",
            `Landing header tab ${label} did not become selected.`
          );
        }
      }
      for (const spec of ctaSpecs) {
        await page.goto(appUrl, { timeout: 60_000, waitUntil: "domcontentloaded" });
        if (spec.setupTab !== undefined) {
          await selectLandingTab(page, spec.setupTab);
        }
        const target = page.locator(spec.selector);
        await target.waitFor({ state: "visible", timeout: 15_000 });
        assert((await target.count()) === 1, `Landing CTA selector ${spec.selector} did not resolve to one element.`);
        await target.click();
        await page.waitForURL((url) => `${url.pathname}${url.search}` === spec.expectedPath, { timeout: 20_000 });
      }
      assertNoPageErrors(page, "landing");
      viewportResults.push({ ctas: ctaSpecs.length, headerTabs: viewport.width >= 1180 ? landingTabs.length : 0, tabs: landingTabs.length, viewport });
      await page.screenshot({ fullPage: false, path: join(outputDir, `landing-${viewport.width.toString()}.png`) });
    } finally {
      await page.close();
    }
  }

  return {
    details: { viewports: viewportResults },
    name: "landing-tabs-buttons",
    status: "passed"
  };
}

async function selectLandingTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole("tab", { name: label });
  await tab.click();
  assert((await tab.getAttribute("aria-selected")) === "true", `Landing tab ${label} did not become selected.`);
  const contentTestId =
    label === "How We Built It" ? "recoup-landing-tab-build" : `recoup-landing-tab-${label.toLowerCase().replaceAll(" ", "-")}`;
  await page.getByTestId(contentTestId).waitFor({ state: "visible", timeout: 15_000 });
}

async function smokeMaya(browser: Browser): Promise<CheckResult> {
  const page = await newInstrumentedPage(browser, { height: 1000, width: 1440 });
  try {
    await loginAsDemoUser(page, "Maya");
    const renderStartedAt = Date.now();
    await page.goto(`${appUrl}/forensics/shadcn`, { timeout: renderBudgetMs, waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="maya-shadcn-workbench"]').waitFor({ state: "visible", timeout: renderBudgetMs });
    const renderMs = Date.now() - renderStartedAt;
    const probes = [
      await timedPageRequest(page, "/api/forensics"),
      await timedPageRequest(page, "/api/forensics"),
      await timedPageRequest(page, "/api/connectors")
    ];
    for (const probe of probes) {
      assert(probe.status === 200, `${probe.path} returned HTTP ${probe.status.toString()}.`);
      assert(probe.cache === "hit", `${probe.path} returned cache=${String(probe.cache)} instead of hit.`);
    }

    const liveQueryResults = [];
    for (const lineId of mayaLineIds) {
      liveQueryResults.push(await runMayaSelectedCaseQuery(page, lineId));
    }
    assertNoPageErrors(page, "maya");
    await page.screenshot({ fullPage: false, path: join(outputDir, "maya-workbench.png") });

    return {
      details: { liveQueryResults, probes, renderMs },
      name: "maya-eight-scenario-live-query-cache",
      status: "passed"
    };
  } finally {
    await page.close();
  }
}

async function smokeMayaVoiceBridge(browser: Browser): Promise<CheckResult> {
  const page = await newInstrumentedPage(browser, { height: 1000, width: 1440 });
  try {
    await loginAsDemoUser(page, "Maya");
    const detail = await fetchMayaWorkItemDetail(page, mayaLineIds[0] ?? "S1-L1");
    const recordIds = buildCaseScopedQueryRecordIds(detail.workItem, { selectedEvidenceRecordIds: detail.selected.evidencePack.recordIds });
    const question = "Voice smoke: which selected evidence supports this case verdict and route?";
    const secretResponse = await page.request.post(`${appUrl}/api/query/realtime-client-secret`, {
      data: {
        question,
        recordIds,
        selectedLineId: detail.selected.lineId
      },
      timeout: queryTimeoutMs
    });
    const secretBody = (await secretResponse.json()) as {
      auditPolicy?: { recordIds?: string[] };
      clientSecret?: { value?: string };
      model?: string;
      status?: string;
      transport?: string;
    };
    assert(secretResponse.ok(), `Realtime client secret returned HTTP ${secretResponse.status().toString()}.`);
    assert(secretBody.status === "issued", `Realtime client secret status was ${String(secretBody.status)}.`);
    assert(secretBody.transport === "webrtc", `Realtime transport was ${String(secretBody.transport)}.`);
    assert(secretBody.clientSecret?.value?.startsWith("ek_") === true, "Realtime client secret was not issued.");
    const policyRecordIds = secretBody.auditPolicy?.recordIds ?? [];
    assert(policyRecordIds.includes(detail.selected.lineId), "Realtime audit policy did not include the selected line.");
    assertSubset(policyRecordIds, recordIds, "Realtime audit policy record ids");

    const toolResponse = await page.request.post(`${appUrl}/api/query/realtime-tool`, {
      data: {
        argumentsJson: JSON.stringify({
          question,
          recordIds: policyRecordIds,
          selectedLineId: detail.selected.lineId
        }),
        name: "query.answer"
      },
      timeout: queryTimeoutMs
    });
    const toolBody = (await toolResponse.json()) as {
      output?: { citationParity?: { parity?: string }; recordIds?: string[] };
      recordIds?: string[];
      status?: string;
      toolName?: string;
    };
    assert(toolResponse.ok(), `Realtime tool returned HTTP ${toolResponse.status().toString()}.`);
    assert(toolBody.status === "ok", `Realtime tool status was ${String(toolBody.status)}.`);
    assert(toolBody.toolName === "query.answer", `Realtime tool name was ${String(toolBody.toolName)}.`);
    assertSameSet(toolBody.recordIds ?? [], policyRecordIds, "Realtime tool record ids");
    assert(toolBody.output?.citationParity?.parity === "same_record_ids", "Realtime tool did not prove voice/text citation parity.");

    return {
      details: {
        citationCount: recordIds.length,
        lineId: detail.selected.lineId,
        model: secretBody.model,
        policyRecordCount: policyRecordIds.length,
        toolName: toolBody.toolName,
        transport: secretBody.transport
      },
      name: "maya-voice-realtime-bridge",
      status: "passed"
    };
  } finally {
    await page.close();
  }
}

async function smokeDavid(browser: Browser): Promise<CheckResult> {
  const backendModel = await fetchCreditRiskReviewModelFromApi();
  const selectedAccounts = davidAccountIds.map((accountId) => requireCreditAccount(backendModel, accountId));
  const page = await newInstrumentedPage(browser, { height: 1000, width: 1440 });
  try {
    await loginAsDemoUser(page, "david");
    await page.goto(`${appUrl}/credit`, { timeout: 60_000, waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="david-shadcn-workbench"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 60_000 });
    for (const account of selectedAccounts) {
      await selectDavidAccount(page, account);
      await assertDavidDrawersCollapsed(page);
      await assertNoDuplicateDavidGreeting(page);
      await runDavidLiveQuery(page, account);
    }
    assertNoPageErrors(page, "david");
    await page.screenshot({ fullPage: false, path: join(outputDir, "david-credit.png") });

    return {
      details: {
        accounts: selectedAccounts.map((account) => ({
          accountId: account.accountId,
          customer: account.customer,
          verdict: account.verdict
        }))
      },
      name: "david-four-account-live-query",
      status: "passed"
    };
  } finally {
    await page.close();
  }
}

async function compareCreditBackendWithSupabase(): Promise<CheckResult> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const rows = await loadCreditRiskRows(runtimeEnv);
  const sourceModel = buildCreditRiskReviewModel(rows);
  const backendModel = await fetchCreditRiskReviewModelFromApi();
  const highAccount = backendModel.accounts.find((account) => account.verdict === "HIGH");
  const nonHighAccount = backendModel.accounts.find((account) => account.verdict !== "HIGH");
  assert(highAccount !== undefined, "Backend model did not include a HIGH account for Supabase proof.");
  assert(nonHighAccount !== undefined, "Backend model did not include a non-HIGH account for Supabase proof.");
  const compared = [highAccount, nonHighAccount].map((account) => {
    const sourceAccount = requireCreditAccount(sourceModel, account.accountId);
    assertCreditAccountMatchesSource(account, sourceAccount);
    return {
      accountId: account.accountId,
      exposureAmount: account.exposureAmount,
      openDisputeAmount: account.openDisputeAmount,
      openDisputeCount: account.openDisputeCount,
      packetRows: account.packet.rows.length,
      unsupportedAmount: account.unsupportedAmount,
      verdict: account.verdict
    };
  });

  return {
    details: { compared },
    name: "david-backend-vs-supabase-credit-source",
    status: "passed"
  };
}

async function runMayaSelectedCaseQuery(page: Page, lineId: string): Promise<Record<string, unknown>> {
  const detail = await fetchMayaWorkItemDetail(page, lineId);
  const recordIds = buildCaseScopedQueryRecordIds(detail.workItem, { selectedEvidenceRecordIds: detail.selected.evidencePack.recordIds });
  const question = "What evidence supports this selected case verdict and route?";
  const startedAt = Date.now();
  const response = await page.request.post(`${appUrl}/api/forensics/query`, {
    data: { question, recordIds, selectedLineId: lineId },
    timeout: queryTimeoutMs
  });
  const body = (await response.json()) as ForensicsQueryResponse;
  assert(response.ok(), `Maya query ${lineId} returned HTTP ${response.status().toString()}.`);
  assert(body.modelExecution?.mode === "live_openai_agents", `Maya query ${lineId} mode was ${String(body.modelExecution?.mode)}.`);
  assert(body.modelExecution.rawModelTextPolicy === "suppressed", `Maya query ${lineId} did not suppress raw model text.`);
  assert((body.modelExecution.handoffCount ?? 0) > 0, `Maya query ${lineId} did not include a handoff.`);
  assert((body.modelExecution.tokenUsage ?? 0) > 0, `Maya query ${lineId} did not include token usage.`);
  const mayaAgentNames = body.modelExecution.agentNames ?? [];
  assert(mayaAgentNames.includes("Forensics Investigator"), `Maya query ${lineId} omitted Forensics Investigator.`);
  assert(mayaAgentNames.includes("Recovery Drafter"), `Maya query ${lineId} omitted Recovery Drafter.`);
  assert(Array.isArray(body.citations) && body.citations.length > 0, `Maya query ${lineId} returned no citations.`);
  const allowed = new Set(recordIds);
  const outOfScope = body.citations.map((citation) => citation.recordId ?? "").filter((recordId) => !allowed.has(recordId));
  assert(outOfScope.length === 0, `Maya query ${lineId} cited out-of-scope records: ${outOfScope.join(",")}.`);
  assert(!body.citations.some((citation) => (citation.recordId ?? "").startsWith("file-")), `Maya query ${lineId} leaked provider file IDs.`);
  assert(
    !(body.answer ?? "").includes("Forensics query cited records outside the selected evidence packet."),
    `Maya query ${lineId} returned the old citation-scope error.`
  );

  return {
    citationCount: body.citations.length,
    durationMs: Date.now() - startedAt,
    handoffCount: body.modelExecution.handoffCount,
    lineId,
    mode: body.modelExecution.mode,
    tokenUsage: body.modelExecution.tokenUsage
  };
}

async function fetchMayaWorkItemDetail(page: Page, lineId: string): Promise<ForensicsWorkItemDetail> {
  const response = await page.request.get(`${appUrl}/api/forensics/work-items/${encodeURIComponent(lineId)}`, { timeout: 60_000 });
  assert(response.ok(), `Maya detail ${lineId} returned HTTP ${response.status().toString()}.`);
  const detail = (await response.json()) as ForensicsWorkItemDetail;
  assert(detail.selected.evidencePack.recordIds.length > 0, `Maya detail ${lineId} had no selected evidence records.`);
  return detail;
}

async function runDavidLiveQuery(page: Page, account: CreditRiskAccountModel): Promise<void> {
  const question = `Why is ${account.customer} ${account.verdict.toLowerCase()} risk?`;
  const response = await page.request.post(`${appUrl}/api/credit/query`, {
    data: {
      accountId: account.accountId,
      question,
      recordIds: account.recordIds
    },
    timeout: queryTimeoutMs
  });
  const body = (await response.json()) as CreditQueryResponse;
  assert(response.ok(), `David query ${account.accountId} returned HTTP ${response.status().toString()}.`);
  assert(typeof body.answer === "string" && body.answer.length > 0, `David query ${account.accountId} returned no answer.`);
  assert(body.modelExecution?.mode === "live_openai_agents", `David query ${account.accountId} mode was ${String(body.modelExecution?.mode)}.`);
  assert((body.modelExecution.handoffCount ?? 0) > 0, `David query ${account.accountId} did not include a handoff.`);
  assert(body.modelExecution.rawModelTextPolicy === "suppressed", `David query ${account.accountId} did not suppress raw output.`);
  assert(
    (body.modelExecution.agentNames?.length ?? 0) >= 2,
    `David query ${account.accountId} did not include the expected agent names.`
  );
  assert(
    typeof body.modelExecution.tokenUsage === "number" || typeof body.modelExecution.tokenUsageSnapshot?.totalTokens === "number",
    `David query ${account.accountId} did not include token usage.`
  );
  assert(Array.isArray(body.citations) && body.citations.length > 0, `David query ${account.accountId} returned no citations.`);
  assert(
    body.trace?.some((event) => event.toolName === "credit_risk.answer") === true,
    `David query ${account.accountId} did not include credit_risk.answer trace proof.`
  );
}

async function loginAsDemoUser(page: Page, loginId: "Maya" | "david"): Promise<void> {
  await page.goto(`${appUrl}/login?loginId=${encodeURIComponent(loginId)}`, { timeout: 60_000, waitUntil: "domcontentloaded" });
  const loginResult = await page.evaluate(
    async ({ password, userId }) => {
      const response = await fetch("/api/demo-login", {
        body: JSON.stringify({ loginId: userId, password }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      return { body: (await response.text()).slice(0, 240), status: response.status };
    },
    { password: demoPassword, userId: loginId }
  );
  assert(
    loginResult.status >= 200 && loginResult.status < 300,
    `Demo login ${loginId} failed HTTP ${loginResult.status.toString()}: ${loginResult.body}`
  );
}

async function selectDavidAccount(page: Page, account: CreditRiskAccountModel): Promise<void> {
  const row = page.locator(`[data-testid="david-queue-account-row"][data-account-id="${escapeAttributeValue(account.accountId)}"]`);
  if (await row.isVisible()) {
    await row.click();
  } else {
    await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(account.customer)}$`, "u") }).click();
  }
  const dossier = page.locator('[data-testid="david-account-dossier"]');
  await dossier.waitFor({ state: "visible", timeout: 45_000 });
  assert((await dossier.innerText()).includes(account.customer), `David dossier did not show ${account.customer}.`);
}

async function assertDavidDrawersCollapsed(page: Page): Promise<void> {
  for (const testId of ["david-assessment-timeline", "david-signals-in", "david-verdict-banner", "david-action-packet"]) {
    const state = await page.getByTestId(testId).getAttribute("data-open", { timeout: 10_000 });
    assert(state === "false", `${testId} should be collapsed by default; saw data-open=${String(state)}.`);
  }
}

async function assertNoDuplicateDavidGreeting(page: Page): Promise<void> {
  const greetingCount = await page.locator("text=Good morning, David.").count();
  assert(greetingCount <= 1, `David page rendered duplicate greeting count=${greetingCount.toString()}.`);
}

async function fetchCreditRiskReviewModelFromApi(): Promise<CreditRiskReviewModel> {
  const response = await fetch(`${apiUrl}/credit/v2`, { cache: "no-store" });
  const body = await response.text();
  assert(response.ok, `Credit v2 API returned HTTP ${response.status.toString()}: ${body.slice(0, 240)}`);
  return JSON.parse(body) as CreditRiskReviewModel;
}

function requireCreditAccount(model: CreditRiskReviewModel, accountId: string): CreditRiskAccountModel {
  const account = model.accounts.find((candidate) => candidate.accountId === accountId);
  assert(account !== undefined, `Credit risk model did not include ${accountId}.`);
  return account;
}

function assertCreditAccountMatchesSource(backend: CreditRiskAccountModel, source: CreditRiskAccountModel): void {
  assert(
    backend.exposureAmount === source.exposureAmount,
    `${backend.accountId} exposureAmount backend=${backend.exposureAmount.toString()} source=${source.exposureAmount.toString()}.`
  );
  assert(
    backend.openDisputeAmount === source.openDisputeAmount,
    `${backend.accountId} openDisputeAmount backend=${backend.openDisputeAmount.toString()} source=${source.openDisputeAmount.toString()}.`
  );
  assert(
    backend.openDisputeCount === source.openDisputeCount,
    `${backend.accountId} openDisputeCount backend=${backend.openDisputeCount.toString()} source=${source.openDisputeCount.toString()}.`
  );
  assert(
    backend.unsupportedAmount === source.unsupportedAmount,
    `${backend.accountId} unsupportedAmount backend=${backend.unsupportedAmount.toString()} source=${source.unsupportedAmount.toString()}.`
  );
  assert(backend.verdict === source.verdict, `${backend.accountId} verdict backend=${backend.verdict} source=${source.verdict}.`);
  assert(
    JSON.stringify(backend.packet.rows) === JSON.stringify(source.packet.rows),
    `${backend.accountId} packet rows did not match Supabase-derived model.`
  );
}

async function timedPageRequest(page: Page, path: string): Promise<ApiProbeResult> {
  const startedAt = Date.now();
  const response = await page.request.get(`${appUrl}${path}`, { timeout: 60_000 });
  await response.text();
  return {
    cache: response.headers()["x-recoup-read-model-cache"] ?? null,
    elapsedMs: Date.now() - startedAt,
    path,
    status: response.status()
  };
}

async function newInstrumentedPage(browser: Browser, viewport: { height: number; width: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("fonts.gstatic.com")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.setDefaultTimeout(45_000);
  (page as Page & { __recoupSmokeErrors?: string[] }).__recoupSmokeErrors = errors;
  return page;
}

function assertNoPageErrors(page: Page, label: string): void {
  const errors = (page as Page & { __recoupSmokeErrors?: string[] }).__recoupSmokeErrors ?? [];
  assert(errors.length === 0, `${label} browser errors: ${errors.join(" | ")}`);
}

async function resolveVercelAliasDeployment(): Promise<SmokeResult["deployment"] | undefined> {
  const token = process.env.VERCEL_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    return undefined;
  }
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (projectId === undefined || teamId === undefined) {
    return undefined;
  }
  const alias = new URL(appUrl).hostname;
  const response = await fetch(`https://api.vercel.com/v4/aliases?projectId=${encodeURIComponent(projectId)}&teamId=${encodeURIComponent(teamId)}&limit=100`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as {
    aliases?: Array<{ alias?: string; deploymentId?: string }>;
  };
  const match = body.aliases?.find((entry) => entry.alias === alias);
  if (match?.deploymentId === undefined) {
    return undefined;
  }
  return { alias, deploymentId: match.deploymentId };
}

function parseCsvEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  return raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertSameSet(actual: readonly string[], expected: readonly string[], label: string): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assert(JSON.stringify(actualSorted) === JSON.stringify(expectedSorted), `${label} mismatch.`);
}

function assertSubset(actual: readonly string[], expectedSuperset: readonly string[], label: string): void {
  const expected = new Set(expectedSuperset);
  const extras = actual.filter((item) => !expected.has(item));
  assert(extras.length === 0, `${label} included unexpected record ids: ${extras.join(",")}.`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
