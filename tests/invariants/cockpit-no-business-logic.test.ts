import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("S5 cockpit business-logic boundary", () => {
  it("keeps the Next cockpit surface free of core rule and Decimal imports", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");

    expect(page).not.toContain("decimal.js");
    expect(page).not.toContain("../../src/services");
    expect(page).not.toContain("src/core");
    expect(page).not.toContain("evaluateRule");
    expect(page).not.toContain("runForensicsInvestigation");
  });

  it("loads cockpit data through REST and SSE API boundaries", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");
    const stream = readFileSync("cockpit/app/run-stream.tsx", "utf8");

    expect(page).toContain("/forensics");
    expect(page).toContain("/trace");
    expect(page).toContain("/memory");
    expect(page).toContain("/agents");
    expect(page).toContain("/connectors");
    expect(stream).toContain("EventSource");
    expect(stream).toContain("/run");
    expect(page).not.toContain("runRiskMeshClosedLoop");
    expect(page).not.toContain("computePartialHold");
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

  it("keeps human cockpit auth tokens server-only", () => {
    const example = readFileSync(".env.example", "utf8");
    const approvalControls = readFileSync("cockpit/app/approval-controls.tsx", "utf8");
    const realtimeControls = readFileSync("cockpit/app/realtime-query-controls.tsx", "utf8");
    const approvalProxy = readFileSync("cockpit/app/api/approval/route.ts", "utf8");
    const realtimeProxy = readFileSync("cockpit/app/api/query/realtime-client-secret/route.ts", "utf8");

    expect(example).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN");
    expect(example).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_HUMAN_PRINCIPAL");
    expect(approvalControls).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN");
    expect(approvalControls).not.toContain("x-recoup-human-token");
    expect(realtimeControls).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN");
    expect(realtimeControls).not.toContain("x-recoup-human-token");
    expect(approvalProxy).toContain("RECOUP_COCKPIT_AUTH_TOKEN");
    expect(approvalProxy).toContain("x-recoup-human-token");
    expect(approvalProxy).toContain("loadLocalRuntimeEnvFiles");
    expect(realtimeProxy).toContain("RECOUP_COCKPIT_AUTH_TOKEN");
    expect(realtimeProxy).toContain("x-recoup-human-token");
    expect(realtimeProxy).toContain("loadLocalRuntimeEnvFiles");
  });

  it("wires Realtime query controls to the credential-gated audit endpoint", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");
    const controls = readFileSync("cockpit/app/realtime-query-controls.tsx", "utf8");

    expect(page).toContain("<RealtimeQueryControls");
    expect(page).not.toContain("OPENAI_API_KEY required");
    expect(controls).toContain('"use client"');
    expect(controls).toContain("/api/query/realtime-client-secret");
    expect(controls).toContain("OpenAI-Safety-Identifier");
    expect(controls).toContain("auditPolicy");
    expect(controls).toContain("no raw audio");
    expect(controls).toContain("WebRTC session ready");
    expect(controls).not.toContain("JSON.stringify({ safetyIdentifier })");
    expect(controls).toContain("key={`${recordId}-${String(index)}`}");
    expect(controls).not.toContain("OPENAI_API_KEY");
    expect(controls).not.toContain("decimal.js");
    expect(controls).not.toContain("src/core");
  });

  it("keeps cockpit navigation and icon controls accessible", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");

    expect(page).toContain('href="#forensics"');
    expect(page).toContain('href="#credit"');
    expect(page).toContain('href="#cfo"');
    expect(page).toContain('title="Refresh run"');
    expect(page).toContain('title="Filter worklist"');
    expect(page).toContain("StatusPill");
    expect(page).toContain("const isSelected = item.lineId === model.selected.lineId;");
    expect(page).toContain("aria-selected={isSelected}");
    expect(page).toContain('className="verdict-cell" role="cell"');
    expect(page).toContain('className="next-action-cell" role="cell"');
    expect(page).toContain('aria-label={`Review selected ${item.lineId}');
    expect(page).toContain("next-action-muted");
    expect(page).toContain('href="#selected-line"');
    expect(page).not.toContain('href="#selected-line" role="cell"');
    expect(page).not.toContain('aria-label={`Review ${item.lineId}');
  });

  it("protects tablet and low-desktop layouts from fixed-column overflow", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");

    expect(styles).toContain("@media (max-width: 1372px)");
    expect(styles).toContain(".governance-surface");
    expect(styles).toContain(".worklist {\n    grid-column: 1 / -1;");
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(styles).toContain(".summary-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(styles).toContain(".metric {\n    min-height: 74px;");
    expect(styles).toContain("overflow-x: auto;");
    expect(styles).toContain("flex: 0 0 auto;");
  });

  it("anchors cockpit styling to the O2C v3.1 design-system tokens", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");
    const layout = readFileSync("cockpit/app/layout.tsx", "utf8");

    expect(layout).toContain("../../tokens.css");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(styles).toContain("letter-spacing: var(--tracking-ui)");
    expect(styles).not.toContain(".workspace::before");
    expect(styles).toContain(".state-panel::before");
    expect(styles).toContain("var(--atmos-mint)");
    expect(styles).toContain("var(--radius-lg)");
    expect(styles).not.toContain("var(--text-on-primary)");
    expect(styles).not.toContain("text-transform: uppercase");
    expect(styles).toContain("max-width: 1560px;");
    expect(styles).toContain("font-family: var(--font-ui);");
    expect(styles).toContain("@media (max-width: 900px)");
  });

  it("keeps operational surfaces restrained instead of over-framed demo cards", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");

    expect(styles).toContain(".metric,\n.worklist,\n.detail,\n.stream,\n.surface-panel {\n  background: var(--bg-surface);");
    expect(styles).toContain("border-radius: var(--radius-lg);");
    expect(styles).toContain(".topbar {\n  border-bottom: 1px solid var(--border-default);");
    expect(styles).not.toContain("box-shadow: var(--shadow-md);");
    expect(styles).not.toContain("linear-gradient(135deg, var(--color-primary-tint)");
    expect(styles).not.toContain("linear-gradient(180deg, color-mix(in srgb, var(--atmos-mint)");
    expect(styles).not.toContain(".risk-board > div,\n.executive-strip > div {\n  background:");
  });

  it("provides premium loading, error, reduced-motion, and desktop action states", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");
    const loading = readFileSync("cockpit/app/loading.tsx", "utf8");
    const error = readFileSync("cockpit/app/error.tsx", "utf8");
    const page = readFileSync("cockpit/app/page.tsx", "utf8");

    expect(loading).toContain("state-panel");
    expect(loading).toContain("aria-busy=\"true\"");
    expect(error).toContain('"use client"');
    expect(error).toContain("reset()");
    expect(error).toContain("Recovery service unavailable");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".state-panel");
    expect(styles).toContain(".skeleton-line");
    expect(styles).toContain('.work-row[aria-selected="true"]');
    expect(page).toContain('id="selected-line"');
    expect(page).toContain('href="#selected-line"');
  });

  it("prioritizes the desktop hero workflow over low-level trace content", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");
    const styles = readFileSync("cockpit/app/styles.css", "utf8");

    expect(page.indexOf('className="decision-console"')).toBeLessThan(page.indexOf('className="audit-rail stream"'));
    expect(page.indexOf('className="next-best-action flagship-action"')).toBeLessThan(page.indexOf("Evidence pack"));
    expect(page.indexOf('className="draft priority-draft"')).toBeLessThan(page.indexOf("Evidence pack"));
    expect(page).toContain('variant="primary"');
    expect(page).toContain('drillDown="Open recovery queue"');
    expect(styles).toContain(".metric.primary");
    expect(styles).toContain(".decision-console");
    expect(styles).toContain(".flagship-action");
    expect(styles).toContain(".priority-draft");
    expect(styles).toContain(".audit-rail");
    expect(styles).toContain("grid-template-columns: minmax(540px, 0.95fr) minmax(520px, 1.05fr);");
  });

  it("renders governance operations as an interactive tabbed cockpit surface", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");
    const tabs = readFileSync("cockpit/app/governance-tabs.tsx", "utf8");

    expect(page).toContain("<GovernanceTabs");
    expect(page).not.toContain('className="operations-grid"');
    expect(tabs).toContain('"use client"');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain('aria-selected');
    expect(tabs).toContain('role="tabpanel"');
    expect(tabs).not.toContain("fetch(");
    expect(tabs).not.toContain("decimal.js");
    expect(tabs).not.toContain("src/core");
    expect(tabs).toContain("Agent operations");
    expect(tabs).toContain("Connector readiness");
    expect(tabs).toContain("Memory");
    expect(tabs).toContain("Trace");
    expect(tabs).toContain("externalWritesAllowed");
  });
});
