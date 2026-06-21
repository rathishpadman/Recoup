import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function read(paths: string[]): string {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

describe("S5 cockpit business-logic boundary", () => {
  it("keeps the Next cockpit surface free of core rule and Decimal imports", () => {
    const cockpitSources = read([
      "cockpit/app/page.tsx",
      "cockpit/app/cockpit-data.ts",
      "cockpit/app/cockpit-shell.tsx",
      "cockpit/app/forensics/page.tsx",
      "cockpit/app/run/page.tsx",
      "cockpit/app/credit/page.tsx",
      "cockpit/app/cfo/page.tsx"
    ]);

    expect(cockpitSources).not.toContain("decimal.js");
    expect(cockpitSources).not.toContain("../../src/services");
    expect(cockpitSources).not.toContain("src/core");
    expect(cockpitSources).not.toContain("evaluateRule");
    expect(cockpitSources).not.toContain("runForensicsInvestigation");
  });

  it("loads cockpit data through typed REST and SSE API boundaries", () => {
    const data = readFileSync("cockpit/app/cockpit-data.ts", "utf8");
    const stream = readFileSync("cockpit/app/run-stream.tsx", "utf8");
    const realtimeControls = readFileSync("cockpit/app/realtime-query-controls.tsx", "utf8");

    expect(data).toContain("/forensics");
    expect(data).toContain("/credit");
    expect(data).toContain("/cfo");
    expect(data).toContain("/trace");
    expect(data).toContain("/memory");
    expect(data).toContain("/agents");
    expect(data).toContain("/connectors");
    expect(stream).toContain("EventSource");
    expect(stream).toContain("/run");
    expect(realtimeControls).toContain("/api/query/realtime-client-secret");
    expect(data).not.toContain("runRiskMeshClosedLoop");
    expect(data).not.toContain("computePartialHold");
  });

  it("keeps cockpit money display away from JS number conversion", () => {
    const model = readFileSync("src/services/cockpitModel.ts", "utf8");

    expect(model).not.toContain(".toNumber(");
  });

  it("wires approval controls to the cockpit REST endpoint", () => {
    const controls = readFileSync("cockpit/app/approval-controls.tsx", "utf8");

    expect(controls).toContain('"use client"');
    expect(controls).toContain("/api/approval");
    expect(controls).toContain("approve");
    expect(controls).toContain("modify");
    expect(controls).toContain("reject");
    expect(controls).toContain("defer");
    expect(controls).toContain("approval-reason");
    expect(controls).toContain("Reason required");
    expect(controls).toContain("auditEntryHash");
    expect(controls).toContain("disabled={submitting");
    expect(controls).not.toContain("human:maya-lead");
  });

  it("keeps human cockpit auth tokens and Supabase service role server-only", () => {
    const example = readFileSync(".env.example", "utf8");
    const approvalControls = readFileSync("cockpit/app/approval-controls.tsx", "utf8");
    const realtimeControls = readFileSync("cockpit/app/realtime-query-controls.tsx", "utf8");
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");
    const approvalProxy = readFileSync("cockpit/app/api/approval/route.ts", "utf8");
    const loginProxy = readFileSync("cockpit/app/api/demo-login/route.ts", "utf8");
    const realtimeProxy = readFileSync("cockpit/app/api/query/realtime-client-secret/route.ts", "utf8");
    const humanAuth = readFileSync("cockpit/app/api/human-auth.ts", "utf8");

    expect(example).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN");
    expect(example).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_HUMAN_PRINCIPAL");
    expect(approvalControls).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN");
    expect(approvalControls).not.toContain("x-recoup-human-token");
    expect(realtimeControls).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN");
    expect(realtimeControls).not.toContain("x-recoup-human-token");
    expect(loginForm).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(loginForm).not.toContain("password_hash");
    expect(humanAuth).toContain("RECOUP_COCKPIT_AUTH_TOKEN");
    expect(humanAuth).toContain("x-recoup-human-token");
    expect(humanAuth).toContain("recoup_human_token");
    expect(approvalProxy).toContain("buildVerifiedHumanAuthHeaders");
    expect(approvalProxy).toContain("loadLocalRuntimeEnvFiles");
    expect(loginProxy).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(loginProxy).toContain("verify_recoup_demo_login");
    expect(realtimeProxy).toContain("buildVerifiedHumanAuthHeaders");
    expect(realtimeProxy).toContain("loadLocalRuntimeEnvFiles");
  });

  it("wires Realtime query controls to the credential-gated audit endpoint", () => {
    const runPage = readFileSync("cockpit/app/run/page.tsx", "utf8");
    const controls = readFileSync("cockpit/app/realtime-query-controls.tsx", "utf8");

    expect(runPage).toContain("<RealtimeQueryControls");
    expect(runPage).not.toContain("OPENAI_API_KEY required");
    expect(controls).toContain('"use client"');
    expect(controls).toContain("./realtime-browser-session");
    expect(controls).toContain("/api/query/realtime-client-secret");
    expect(controls).toContain("OpenAI-Safety-Identifier");
    expect(controls).toContain("auditPolicy");
    expect(controls).toContain("blocked uncited");
    expect(controls).toContain("deterministicBasis");
    expect(controls).toContain("startInFlightRef");
    expect(controls).toContain('status === "connecting"');
    expect(controls).toContain("no raw audio");
    expect(controls).toContain("WebRTC session ready");
    expect(controls).not.toContain("JSON.stringify({ safetyIdentifier })");
    expect(controls).toContain("key={`${recordId}-${String(index)}`}");
    expect(controls).not.toContain("sk-");
    expect(controls).not.toContain("OPENAI_API_KEY");
    expect(controls).not.toContain("RECOUP_COCKPIT_AUTH_TOKEN");
    expect(controls).not.toContain("x-recoup-human-token");
    expect(controls).not.toContain("localStorage");
    expect(controls).not.toContain("sessionStorage");
    expect(controls).not.toContain("indexedDB");
    expect(controls).not.toContain("decimal.js");
    expect(controls).not.toContain("src/core");
  });

  it("keeps cockpit navigation as accessible real routes", () => {
    const root = readFileSync("cockpit/app/page.tsx", "utf8");
    const shell = readFileSync("cockpit/app/cockpit-shell.tsx", "utf8");
    const forensics = readFileSync("cockpit/app/forensics/page.tsx", "utf8");

    expect(root).toContain("requireDemoSession");
    expect(root).toContain("defaultRoute");
    expect(shell).toContain('href: "/forensics"');
    expect(shell).toContain('href: "/run"');
    expect(shell).toContain('href: "/credit"');
    expect(shell).toContain('href: "/cfo"');
    expect(shell).toContain('href: "/governance/connectors"');
    expect(shell).toContain("href={item.href}");
    expect(shell).toContain("aria-current");
    expect(shell).toContain("session.allowedRoutes.includes(item.href)");
    expect(forensics).toContain("ApprovalControls");
    expect(forensics).toContain("aria-selected={isSelected}");
    expect(forensics).toContain('className="verdict-cell" role="cell"');
    expect(forensics).toContain('className="next-action-cell" role="cell"');
    expect(shell).not.toContain('href="#credit"');
    expect(shell).not.toContain('href="#cfo"');
    expect(root).not.toContain("<GovernanceTabs");
  });

  it("protects tablet, mobile, and table layouts from fixed-column page overflow", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));

    expect(styles).toContain("@media (max-width: 1372px)");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 620px)");
    expect(styles).toContain(".workspace-table-scroll");
    expect(styles).toContain("overflow-x: auto;");
    expect(styles).toContain(".route-grid.forensics");
    expect(styles).toContain("grid-template-columns: minmax(640px, 1.18fr) minmax(420px, 0.82fr);");
    expect(styles).toContain("min-width: 0;");
    expect(styles).toContain("min-width: 598px;");
    expect(styles).toContain("scrollbar-gutter: stable;");
  });

  it("anchors cockpit styling to the O2C v3.1 design-system tokens", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");
    const layout = readFileSync("cockpit/app/layout.tsx", "utf8");

    expect(layout).toContain("../../tokens.css");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(styles).toContain("letter-spacing: var(--tracking-ui)");
    expect(styles).toContain("var(--atmos-mint)");
    expect(styles).toContain("var(--radius-lg)");
    expect(styles).not.toContain("var(--text-on-primary)");
    expect(styles).not.toContain("text-transform: uppercase");
    expect(styles).toContain("font-family: var(--font-ui);");
    expect(styles).toContain("font-family: var(--font-editorial);");
    expect(styles).toContain("font-family: var(--font-mono);");
  });

  it("keeps operational surfaces restrained instead of over-framed demo cards", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));

    expect(styles).toContain(".metric,\n.worklist,\n.detail,\n.stream,\n.surface-panel");
    expect(styles).toContain("border-radius: var(--radius-lg);");
    expect(styles).toContain(".topbar {\n  border-bottom: 1px solid var(--border-default);");
    expect(styles).not.toContain("box-shadow: var(--shadow-md);");
    expect(styles).not.toContain("linear-gradient(135deg, var(--color-primary-tint)");
    expect(styles).not.toContain("linear-gradient(180deg, color-mix(in srgb, var(--atmos-mint)");
  });

  it("provides premium loading, error, reduced-motion, and desktop action states", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");
    const loading = readFileSync("cockpit/app/loading.tsx", "utf8");
    const error = readFileSync("cockpit/app/error.tsx", "utf8");
    const forensics = readFileSync("cockpit/app/forensics/page.tsx", "utf8");

    expect(loading).toContain("state-panel");
    expect(loading).toContain("aria-busy=\"true\"");
    expect(error).toContain('"use client"');
    expect(error).toContain("reset()");
    expect(error).toContain("Recovery service unavailable");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".state-panel");
    expect(styles).toContain(".skeleton-line");
    expect(styles).toContain('.work-row[aria-selected="true"]');
    expect(forensics).toContain('id="selected-line"');
  });

  it("prioritizes the Maya hero workflow over low-level trace content", () => {
    const forensics = readFileSync("cockpit/app/forensics/page.tsx", "utf8");
    const run = readFileSync("cockpit/app/run/page.tsx", "utf8");
    const styles = readFileSync("cockpit/app/styles.css", "utf8");

    expect(forensics.indexOf('className="decision-console"')).toBeGreaterThan(-1);
    expect(forensics.indexOf('className="decision-console"')).toBeLessThan(forensics.indexOf("Evidence pack"));
    expect(forensics.indexOf('className="next-best-action flagship-action"')).toBeLessThan(forensics.indexOf("Evidence pack"));
    expect(forensics.indexOf('className="draft priority-draft"')).toBeLessThan(forensics.indexOf("Evidence pack"));
    expect(run).toContain("<RunStream");
    expect(run).toContain("<RealtimeQueryControls");
    expect(styles).toContain(".metric.primary");
    expect(styles).toContain(".decision-console");
    expect(styles).toContain(".flagship-action");
    expect(styles).toContain(".priority-draft");
    expect(styles).toContain(".audit-rail");
  });

  it("renders governance operations as URL-backed route surfaces", () => {
    const root = readFileSync("cockpit/app/page.tsx", "utf8");
    const nav = readFileSync("cockpit/app/governance/governance-nav.tsx", "utf8");
    const agents = readFileSync("cockpit/app/governance/agents/page.tsx", "utf8");
    const connectors = readFileSync("cockpit/app/governance/connectors/page.tsx", "utf8");
    const memory = readFileSync("cockpit/app/governance/memory/page.tsx", "utf8");
    const trace = readFileSync("cockpit/app/governance/trace/page.tsx", "utf8");

    expect(root).not.toContain("<GovernanceTabs");
    expect(nav).toContain('"use client"');
    expect(nav).toContain('role="tablist"');
    expect(nav).toContain('role="tab"');
    expect(nav).toContain("aria-selected");
    expect(nav).toContain('href: "/governance/agents"');
    expect(nav).toContain('href: "/governance/connectors"');
    expect(nav).toContain('href: "/governance/memory"');
    expect(nav).toContain('href: "/governance/trace"');
    expect(agents).toContain("fetchAgentGraphModel");
    expect(connectors).toContain("fetchConnectorReadinessModel");
    expect(memory).toContain("fetchMemoryModel");
    expect(trace).toContain("fetchTraceModel");
    expect(nav).not.toContain("fetch(");
    expect(nav).not.toContain("decimal.js");
    expect(nav).not.toContain("src/core");
  });
});
