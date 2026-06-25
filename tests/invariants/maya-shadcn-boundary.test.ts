import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const requiredMayaComponentFiles = [
  "maya-workspace-shell.tsx",
  "maya-run-kpi-strip.tsx",
  "source-readiness-strip.tsx",
  "deduction-worklist-table.tsx",
  "recommended-action-cell.tsx",
  "deduction-case-workspace.tsx",
  "evidence-dossier.tsx",
  "query-evidence-dock.tsx",
  "agent-trace-panel.tsx",
  "cited-answer-card.tsx",
  "recovery-draft-review.tsx",
  "approval-gate-dialog.tsx",
  "audit-confirmation-panel.tsx",
  "maya-empty-state.tsx",
  "maya-forensics-surface.tsx",
  "types.ts"
] as const;

const obviousBusinessLiteralPatterns = [
  {
    label: "dollar-like literals",
    pattern: /["'`][^"'`]*\$\s?\d[\d,]*(?:\.\d{2})?[^"'`]*["'`]/u
  },
  {
    label: "demo customer names",
    pattern: /\b(?:Crestline|Harbor|Greenleaf|ValuMart|NorthBay)\b/u
  },
  {
    label: "fixture-like evidence IDs",
    pattern: /["'`](?:POD|TPM|PRICE|CLAUSE|BUREAU|FIN|DOC|EVIDENCE)-[A-Z0-9][A-Z0-9:_-]*["'`]/u
  },
  {
    label: "fixture-like action or audit IDs",
    pattern: /["'`](?:ACTION|APPROVAL|AUDIT|HASH|REBILL|RECOVERY|CUST|INV)-[A-Z0-9][A-Z0-9:_-]*["'`]/u
  },
  {
    label: "scenario line fixture IDs",
    pattern: /["'`]S[1-8]-L\d+["'`]/u
  }
] as const;

function readTree(root: string): string {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
        files.push(path);
      }
    }
  }

  walk(root);
  return files.sort().map((path) => readFileSync(path, "utf8")).join("\n");
}

function readMayaSourceFiles(): Array<{ path: string; source: string }> {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
        files.push(path);
      }
    }
  }

  walk("cockpit/components/maya");
  return files.sort().map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

describe("Maya shadcn cockpit boundary", () => {
  it("keeps the Phase 4 Maya workbench decomposed into shadcn-only components", () => {
    expect(existsSync("cockpit/components/maya")).toBe(true);

    for (const fileName of requiredMayaComponentFiles) {
      expect(existsSync(join("cockpit/components/maya", fileName))).toBe(true);
    }

    const sources = readTree("cockpit/components/maya");

    for (const requiredImport of [
      "@/components/ui/card",
      "@/components/ui/table",
      "@/components/ui/badge",
      "@/components/ui/tabs",
      "@/components/ui/sheet",
      "@/components/ui/alert-dialog",
      "@/components/ui/alert",
      "@/components/ui/accordion",
      "@/components/ui/scroll-area",
      "@/components/ui/separator",
      "@/components/ui/button",
      "@/components/ui/empty",
      "@/components/ui/tooltip"
    ]) {
      expect(sources).toContain(requiredImport);
    }
  });

  it("renders through a dedicated review route backed by canonical read models", () => {
    const route = readFileSync("cockpit/app/forensics/shadcn/page.tsx", "utf8");

    expect(route).toMatch(/requireRouteAccess\(\s*["']\/forensics\/shadcn["']\s*\)/u);
    expect(route).toContain("requireMayaBackendReadAuthHeaders");
    expect(route).toMatch(/\bfetchForensicsModel\s*\(\s*backendReadAuthHeaders\s*\)/u);
    expect(route).toMatch(/\bfetchConnectorReadinessModel\s*\(\s*backendReadAuthHeaders\s*\)/u);
    expect(route).toMatch(/<MayaForensicsSurface\b/u);
  });

  it("keeps the Maya shadcn surface free of old bespoke UI and business logic", () => {
    expect(existsSync("cockpit/components/maya")).toBe(true);
    const sources = `${readFileSync("cockpit/app/forensics/shadcn/page.tsx", "utf8")}\n${readTree(
      "cockpit/components/maya"
    )}`;

    for (const forbidden of [
      "cockpit-shell",
      "premium-components",
      "@phosphor-icons",
      "phosphor-react",
      "decimal.js",
      "src/core",
      "src/services",
      "evaluateRule",
      "runForensicsInvestigation"
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });

  it("keeps Maya components backed by read-model props instead of local business fixtures", () => {
    const sources = readTree("cockpit/components/maya");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(types).toMatch(/\bmodel\s*:\s*ForensicsCockpitModel\b/u);
    expect(types).toMatch(/\bconnectors\s*:\s*ConnectorReadinessCockpitModel\b/u);
    expect(types).toMatch(/\bsession\s*:\s*DemoSession\b/u);
    expect(surface).toMatch(/\bMayaForensicsSurface\b/u);
    expect(surface).toMatch(/\bMayaForensicsSurfaceProps\b/u);
    expect(surface).toMatch(/\bmodel\.worklist\b/u);
    expect(surface).toContain("connectors={connectors}");
    expect(surface).toContain("session={session}");

    const recommendedActionCellPath = "cockpit/components/maya/recommended-action-cell.tsx";
    expect(existsSync(recommendedActionCellPath)).toBe(true);
    if (existsSync(recommendedActionCellPath)) {
      expect(readFileSync(recommendedActionCellPath, "utf8")).toContain("recommendedActionLabel");
    }

    for (const forbidden of [
      "const kpiStrip = [",
      "const worklist = [",
      "const evidencePack =",
      "const approvalActions = [",
      "const actionInbox = [",
      "const mayaJourney = [",
      "const mock",
      "mockData",
      "sampleData",
      "fixture",
      "Crestline Foods",
      "POD-Retriever",
      "human:maya-lead",
      "human:david-lead",
      "human:cfo-lead"
    ]) {
      expect(sources).not.toContain(forbidden);
    }

    for (const { label, pattern } of obviousBusinessLiteralPatterns) {
      expect(sources, `Maya components must not contain ${label}.`).not.toMatch(pattern);
    }
  });

  it("keeps root sidebar controls backed by section state instead of dead primary buttons", () => {
    const e2e = readFileSync("tests/e2e/maya-real-backend-e2e.ts", "utf8");
    const shell = readFileSync("cockpit/components/maya/maya-workspace-shell.tsx", "utf8");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(types).toContain('export type MayaSurfaceSection = "overview" | "worklist" | "cases" | "evidence" | "approvals";');
    expect(surface).toContain('React.useState<MayaSurfaceSection>("overview")');
    expect(surface).toContain("activeSection={activeSection}");
    expect(surface).toContain("onSectionChange={setActiveSection}");
    expect(surface).toContain("renderMayaRootSection");
    expect(surface).toContain('case "overview"');
    expect(surface).toContain('case "worklist"');
    expect(surface).toContain('case "cases"');
    expect(surface).toContain('case "evidence"');
    expect(surface).toContain('case "approvals"');
    expect(surface).toContain('data-testid="maya-root-section-overview"');
    expect(surface).toContain('data-testid="maya-root-section-worklist"');
    expect(surface).toContain('data-testid="maya-root-section-cases"');
    expect(surface).toContain('data-testid="maya-root-section-evidence"');
    expect(surface).toContain('data-testid="maya-root-section-approvals"');
    expect(surface).toMatch(/case "worklist":\s*return renderWorklistSection\(\);/u);
    expect(surface).toMatch(/case "cases":\s*return renderCasesSection\(\);/u);
    expect(surface).not.toMatch(/case "worklist":\s*case "cases":\s*return renderWorklistAndPane\(\);/su);
    expect(surface).toContain("function renderWorklistSection(): React.ReactNode");
    expect(surface).toContain("function renderCasesSection(): React.ReactNode");
    expect(shell).toContain("activeSection: MayaSurfaceSection");
    expect(shell).toContain("onSectionChange?: (section: MayaSurfaceSection) => void");
    expect(shell).toContain('section: "overview"');
    expect(shell).toContain('section: "worklist"');
    expect(shell).toContain('section: "cases"');
    expect(shell).toContain('section: "evidence"');
    expect(shell).toContain('section: "approvals"');
    expect(shell).toContain("onSectionChange?.(item.section)");
    expect(shell).toContain("disabled={onSectionChange === undefined}");
    expect(shell).toContain('aria-current={item.section === activeSection ? "page" : undefined}');
    expect(shell).toContain('data-testid="maya-sidebar-surface-label"');
    expect(shell).not.toContain('data-testid="maya-sidebar-filter-trigger"');
    expect(shell).not.toContain("DropdownMenu");
    expect(shell).not.toMatch(/<Button[\s\S]{0,500}Maya Forensics[\s\S]{0,300}<ChevronDownIcon/u);
    expect(shell).not.toMatch(/\b(?:Deductions|Run trace|Analytics|Configuration)\b/u);
    expect(e2e).toContain("assertRootSidebarSectionNavigation");
    expect(e2e).toMatch(/\bawait\s+assertRootSidebarSectionNavigation\s*\(\s*page\s*,\s*forensicsModel\s*\)/u);
    for (const sectionHook of [
      "maya-root-section-overview",
      "maya-root-section-worklist",
      "maya-root-section-cases",
      "maya-root-section-evidence",
      "maya-root-section-approvals"
    ]) {
      expect(e2e).toContain(sectionHook);
    }
    expect(e2e).toMatch(/\bgetByRole\s*\(\s*["']button["']\s*,\s*\{\s*name:\s*section\.buttonName\s*\}\s*\)\.click\s*\(\s*\)/u);
  });

  it("wires query narrative through the backend forensics query route and cited answer guard", () => {
    const sources = readTree("cockpit/components/maya");
    const queryDock = readFileSync("cockpit/components/maya/query-evidence-dock.tsx", "utf8");
    const citedAnswer = readFileSync("cockpit/components/maya/cited-answer-card.tsx", "utf8");
    const sheet = readFileSync("cockpit/components/ui/sheet.tsx", "utf8");

    for (const forbidden of [
      "/api/query/realtime-tool",
      "/api/query/realtime-client-secret",
      "https://api.openai.com",
      "OPENAI_API_KEY",
      "RECOUP_COCKPIT_AUTH_TOKEN",
      "x-recoup-human-token",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "decimal.js",
      "src/core",
      "src/services"
    ]) {
      expect(queryDock).not.toContain(forbidden);
    }

    expect(sources).not.toContain("https://api.openai.com");
    expect(queryDock).toContain('fetch("/api/forensics/query"');
    expect(queryDock).not.toContain("startRealtimeBrowserSession");
    expect(queryDock).not.toContain("../../app/realtime-browser-session");
    expect(queryDock).toContain("const QUERY_QUESTION_CHARACTER_LIMIT = 500");
    expect(queryDock).toContain("sessionTokenRef");
    expect(queryDock).toContain("abortControllerRef");
    expect(queryDock).toContain("closeActiveSession");
    expect(queryDock).toContain("abortController?.abort()");
    expect(queryDock).toContain("previousAbortController?.abort()");
    expect(queryDock).toContain("onOpenChange={handleOpenChange}");
    expect(queryDock).toContain("publishForToken");
    expect(queryDock).toContain("isCurrentSession");
    expect(queryDock).toContain("<SheetHeader");
    expect(queryDock).toContain("<SheetTitle");
    expect(queryDock).toContain("<SheetDescription");
    expect(queryDock).toContain("<SheetFooter");
    expect(queryDock).toMatch(/@\/components\/ui\/(?:accordion|collapsible)/u);
    expect(queryDock).toContain('data-testid="maya-query-source-details"');
    expect(queryDock).toContain('data-testid="maya-query-trace-details"');
    expect(queryDock).toMatch(/\bisRunning\s*\?\s*\((?=[\s\S]{0,900}Stop query)(?=[\s\S]{0,900}\bcloseActiveSession\s*\()/u);
    expect(sheet).toContain("overlayClassName");
    expect(sheet).toContain("<SheetOverlay className={overlayClassName} />");
    expect(queryDock).toContain('overlayClassName="bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"');
    expect(queryDock).toContain('data-answer-mode={canShowCitedAnswer ? "review" : "drawer"}');
    expect(queryDock).toContain('data-[side=right]:sm:max-w-[var(--maya-query-dock-max-width)]');
    expect(queryDock).toContain('"--maya-query-dock-max-width": canShowCitedAnswer');
    expect(queryDock).toContain('"min(936px, calc(100vw - 280px))"');
    expect(queryDock).toContain('"456px"');
    expect(queryDock).toContain('animation: "none"');
    expect(queryDock).toContain('backgroundColor: "var(--bg-surface)"');
    expect(queryDock).toContain("opacity: 1");
    expect(queryDock).toContain("<FieldGroup");
    expect(queryDock).toContain("<InputGroup");
    expect(queryDock).toContain("<InputGroupTextarea");
    expect(queryDock).toContain("maxLength={QUERY_QUESTION_CHARACTER_LIMIT}");
    expect(queryDock).toContain("aria-live");
    expect(queryDock).toContain("CitedAnswerCard");
    expect(queryDock).toContain("AgentTracePanel");
    expect(queryDock).toContain('data-testid="maya-query-selected-line"');
    expect(queryDock).toContain('data-testid="maya-query-record-id"');
    expect(queryDock).toContain('data-testid="maya-query-readiness-preview"');
    expect(queryDock).toContain("Selected evidence context");
    expect(queryDock).toContain("Client-selected case context");
    expect(queryDock).toContain('data-testid="maya-selected-evidence-context"');
    expect(queryDock).toContain("Selected evidence packet");
    expect(queryDock).toContain('snapshot.status === "answered"');
    expect(queryDock).toContain("snapshot.deterministicBasis");
    expect(queryDock).toContain("canShowCitedAnswer ? <CitedAnswerCard");
    expect(queryDock).toContain("snapshot !== undefined ? <AgentTracePanel response={snapshot} /> : null");
    expect(queryDock).toContain("const blockedRecordIds");
    expect(queryDock).toContain("citations: response.citations");
    expect(queryDock).toMatch(/\brecordIds\s*:\s*blockedRecordIds\b[\s\S]{0,260}\bstatus\s*:\s*"blocked"/u);
    expect(queryDock).not.toMatch(/return\s*\{[\s\S]{0,600}\bcitations\s*:\s*\[\][\s\S]{0,600}\bstatus\s*:\s*"blocked"/u);
    expect(queryDock).toContain("submittedQuestion");
    expect(queryDock).toContain("setSubmittedQuestion(trimmedQuestion)");
    expect(queryDock).toContain('data-testid="maya-submitted-query"');
    expect(queryDock).toContain("aria-describedby={promptChipDescriptionId}");
    expect(queryDock).toContain("id={promptChipDescriptionId}");
    expect(queryDock).toContain('className="sr-only"');
    expect(queryDock).toContain("onResponse: (response: QueryEvidenceResponse) => void");
    expect(queryDock).toContain("onResponse(next)");
    expect(queryDock).not.toContain("onResponseRef.current(undefined)");
    expect(queryDock).toContain("recordIds");
    expect(queryDock).toContain("evidencePack: MayaEvidencePack");
    expect(queryDock).toContain("evidencePack,");
    expect(queryDock).toContain("evidencePack={evidencePack}");
    expect(queryDock).toContain("signal: abortController.signal");
    expect(queryDock).toContain("selectedLineId: selectedLine");
    expect(queryDock).toContain("onChange=");
    expect(queryDock).toContain("disabled={canShowCitedAnswer || question.trim().length === 0}");
    expect(queryDock).toMatch(
      /<div\b(?=[^>]*\bclassName="grid min-w-0 gap-2 rounded-lg border bg-background p-3")(?=[^>]*\bdata-testid="maya-query-assistant-message")[^>]*>/u
    );
    expect(queryDock).not.toMatch(
      /data-testid="maya-query-assistant-message"[\s\S]{0,900}\b(?:snapshot|response)\.answer\b/u
    );
    expect(queryDock).not.toContain("2000");
    expect(queryDock).not.toMatch(/\b(?:server-enforced|locked to|locked records|send|recover|approve|write back|route to billing|change terms|release hold|freeze)\b/iu);
    expect(citedAnswer).toContain("response.answer !== undefined");
    expect(citedAnswer).toContain("response.deterministicBasis !== undefined");
    expect(citedAnswer).toContain("response.recordIds.length > 0");
    expect(citedAnswer).toContain("response.answer.trim().length > 0");
    expect(citedAnswer).toContain("response.deterministicBasis.trim().length > 0");
    expect(citedAnswer).toContain('data-testid="maya-cited-answer-text"');
    expect(citedAnswer).toContain('data-testid="maya-cited-answer-basis"');
    expect(citedAnswer).toContain('data-testid="maya-cited-record-row"');
    expect(citedAnswer).toMatch(/@\/components\/ui\/(?:accordion|collapsible)/u);
    expect(citedAnswer).toContain('data-testid="maya-cited-source-details"');
    expect(citedAnswer.indexOf('data-testid="maya-cited-source-details"')).toBeLessThan(
      citedAnswer.indexOf('data-testid="maya-cited-record-row"')
    );
    expect(citedAnswer).toContain('data-metadata-gap={metadata === undefined && !hasBackendMetadata ? "true" : undefined}');
    expect(citedAnswer).toContain("evidencePack: MayaEvidencePack");
    expect(citedAnswer).toContain("findEvidenceDocumentForCitation");
    expect(citedAnswer).toContain("document.documentId === citation.documentId");
    expect(citedAnswer).toContain("document.citationId === citation.recordId");
    expect(citedAnswer).toContain("evidencePack.documents.length");
    expect(citedAnswer).toContain('hasBackendMetadata ? "backend-citation" : undefined');
    expect(citedAnswer).toContain('data-testid="maya-cited-record-metadata"');
    expect(citedAnswer).toContain("response.citations.map");
    expect(citedAnswer).toContain("citationRows.map");
    expect(citedAnswer).not.toContain("orderedCitationRows");
    expect(citedAnswer).not.toMatch(/\bcitationRows\b[\s\S]{0,160}\.sort\s*\(/u);
    expect(citedAnswer).toContain("citation.source");
    expect(citedAnswer).toContain("citation.summary");
    expect(citedAnswer).toContain("citation.documentId");
    expect(citedAnswer).not.toContain("citation.deterministicBasis.trim().length > 0");
    expect(citedAnswer).toContain("Metadata unavailable");
    expect(citedAnswer).not.toContain("fallbackRecordIds.map");
    expect(citedAnswer).not.toMatch(
      /\b(?:Shortage Deduction Recoverability|shortage deduction is recoverable|INV-100245|POD-77421|CLAIM-8821|Partial \/ Blocked|Review Draft)\b/iu
    );
    expect(citedAnswer).not.toMatch(
      /\b(?:send|recover|approve|write back|route to billing|change terms|release hold|freeze)\b/iu
    );
  });

  it("keeps Beat 7 agent trace backed by backend query trace rows", () => {
    const agentTrace = readFileSync("cockpit/components/maya/agent-trace-panel.tsx", "utf8");
    const queryDock = readFileSync("cockpit/components/maya/query-evidence-dock.tsx", "utf8");
    const mayaSources = readTree("cockpit/components/maya");
    const traceAndDock = `${agentTrace}\n${queryDock}`;

    expect(agentTrace).toContain('response?.status === "connecting"');
    expect(agentTrace).toContain('data-testid="maya-trace-running-session"');
    expect(agentTrace).toContain("Trace rail");
    expect(agentTrace).toMatch(/@\/components\/ui\/(?:accordion|collapsible)/u);
    expect(agentTrace).toContain("@/components/ui/table");
    expect(agentTrace).toContain('data-testid="maya-agent-trace-details"');
    expect(agentTrace).toContain('data-testid="maya-backend-trace-table"');
    expect(agentTrace).toContain('data-testid="maya-backend-trace-row"');
    expect(agentTrace.indexOf('data-testid="maya-agent-process-map"')).toBeLessThan(
      agentTrace.indexOf('data-testid="maya-agent-trace-details"')
    );
    expect(agentTrace.indexOf('data-testid="maya-agent-trace-details"')).toBeLessThan(
      agentTrace.indexOf('data-testid="maya-backend-trace-table"')
    );
    expect(agentTrace).toContain("event.deterministicBasis");
    expect(agentTrace).toContain("isBackendTraceProcessNode");
    expect(agentTrace).toContain('data-ui-process-kind={!isBackendTrace ? node.nodeKind : undefined}');
    expect(agentTrace).toMatch(/data-agent-node=\{isBackendTrace \? node\.agentName : undefined\}/u);
    expect(agentTrace).toMatch(/data-hook=\{isBackendTrace \? node\.hook : undefined\}/u);
    expect(agentTrace).toMatch(/data-retrieval-source=\{isBackendTrace \? resolveTraceRetrievalSource\(node\) : undefined\}/u);
    expect(agentTrace).toMatch(/data-source-kind=\{isBackendTrace \? resolveTraceSourceKind\(node\) : undefined\}/u);
    expect(agentTrace).toMatch(/data-trace-label=\{isBackendTrace \? node\.label : undefined\}/u);
    expect(agentTrace).not.toContain("subAgents.map");
    expect(agentTrace).not.toContain("agent.statusLabel");
    expect(agentTrace).not.toMatch(/agent\.statusLabel\s*===/u);
    expect(agentTrace).not.toContain("statusLabel.toLowerCase");
    expect(agentTrace).toContain("No record IDs");
    expect(agentTrace).not.toContain("selected-evidence-read-model");
    expect(agentTrace).not.toMatch(/\b(?:Query Agent accepted|Forensics context attached|Delivery proof retriever|Evidence reader|Citation and action guard)\b/u);
    expect(queryDock).toContain("snapshot !== undefined ? <AgentTracePanel response={snapshot} /> : null");
    expect(queryDock).toContain("canShowCitedAnswer ? <CitedAnswerCard");
    expect(mayaSources).not.toContain("/trace");
    expect(traceAndDock).not.toMatch(/\b(?:POD_2025|312 KB|SHA-256|Custodian|Proof of Delivery|fake five-step|fake trace)\b/u);
    expect(traceAndDock).not.toMatch(
      /\b(?:send|recover|approve|write back|route to billing|change terms|release hold|freeze)\b/iu
    );
  });

  it("opens the Beat 6 query dock from the Evidence tab without borrowing future answer state", () => {
    const evidenceDossier = readFileSync("cockpit/components/maya/evidence-dossier.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");

    expect(evidenceDossier).toContain("onQueryEvidence?: () => void");
    expect(evidenceDossier).toContain("onQueryEvidence");
    expect(evidenceDossier).toContain("Query evidence");
    expect(workspace).toContain("QueryEvidenceDock");
    expect(workspace).toContain("queryDockOpen");
    expect(workspace).toContain("setQueryDockOpen");
    expect(workspace).toContain("QueryEvidenceResponse");
    expect(workspace).toContain("setQueryResponse");
    expect(workspace).toContain("setQueryResponse(undefined)");
    expect(workspace).toContain("response={queryResponse}");
    expect(workspace).toContain("recordIds={selected.evidencePack.recordIds}");
    expect(workspace).toContain("evidencePack={selected.evidencePack}");
    expect(workspace).toContain("selectedLine={selected.lineId}");
    expect(workspace).toContain("onResponse={setQueryResponse}");
    expect(workspace).not.toContain("onResponse={() => undefined}");
    expect(workspace).not.toContain("CitedAnswerCard");
  });

  it("wires approval dialog through supplied actions and the existing HITL API", () => {
    const approvalDialog = readFileSync("cockpit/components/maya/approval-gate-dialog.tsx", "utf8");
    const auditPanel = readFileSync("cockpit/components/maya/audit-confirmation-panel.tsx", "utf8");
    const recoveryDraftReview = readFileSync("cockpit/components/maya/recovery-draft-review.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(approvalDialog).toContain("/api/approval");
    expect(approvalDialog).toContain("fetch(");
    expect(approvalDialog).toContain("<AlertDialog");
    expect(approvalDialog).toContain("<AlertDialogTitle");
    expect(approvalDialog).toContain("<AlertDialogDescription");
    expect(approvalDialog).toContain("<AlertDialogCancel asChild");
    expect(approvalDialog).toContain('aria-label="Close human approval dialog"');
    expect(approvalDialog).toContain("actions.map");
    expect(approvalDialog).toContain("actionId");
    expect(approvalDialog).toContain("decision");
    expect(approvalDialog).toContain("requiresReason");
    expect(approvalDialog).toContain("reason.trim");
    expect(approvalDialog).toContain("useId");
    expect(approvalDialog).toContain("htmlFor={reasonTextareaId}");
    expect(approvalDialog).toContain("id={reasonTextareaId}");
    expect(approvalDialog).toContain("auditEntryHash");
    expect(approvalDialog).toContain("result.actionId !== actionId");
    expect(approvalDialog).toContain('result.status !== "human_decided"');
    expect(approvalDialog).toContain("evidenceReviewEligibilityAvailable = false");
    expect(approvalDialog).toContain("approvalEligibilityUnavailable");
    expect(approvalDialog).toContain("Evidence reviewed state and approval eligibility are unavailable");
    expect(approvalDialog).toContain("Verified human principal unavailable");
    expect(approvalDialog).toContain("Opening this dialog does not dispatch anything");
    expect(approvalDialog).toContain("No action will be taken until you choose an option");
    expect(approvalDialog).toContain("Your decision, note, and timestamp will be recorded with the draft");
    expect(approvalDialog).toContain("NOTE_CHARACTER_LIMIT = 500");
    expect(approvalDialog).toContain("FieldError");
    expect(approvalDialog).toContain("Separator");
    expect(approvalDialog).toContain("onResponse");
    expect(approvalDialog).toContain("disabled={submitting");
    expect(approvalDialog).toContain("disabled={isDecisionDisabled(action)}");
    expect(approvalDialog).toContain("decisionButtonVariant(action.decision, approvalEligibilityUnavailable)");
    expect(approvalDialog).toContain("approvalEligibilityUnavailable: boolean");
    expect(approvalDialog).not.toContain("fallbackActions");
    expect(approvalDialog).not.toContain("human:maya-lead");
    expect(approvalDialog).not.toContain("human:david-lead");
    expect(approvalDialog).not.toContain("human:cfo-lead");
    expect(approvalDialog).not.toMatch(/\b(?:3 of 3|Reviewed|reviewed count|audit-entry-demo|APPROVAL-HASH|Maya Patel)\b/u);
    expect(recoveryDraftReview).toContain("<ApprovalGateDialog");
    expect(recoveryDraftReview).toContain("approvalDialogOpen");
    expect(recoveryDraftReview).toContain("setApprovalDialogOpen(true)");
    expect(recoveryDraftReview).toContain("actionId={draft.actionId}");
    expect(recoveryDraftReview).toContain("onApprovalResponse");
    expect(recoveryDraftReview).not.toContain("/api/approval");
    expect(recoveryDraftReview).not.toContain("fetch(");
    expect(auditPanel).toContain("AUDIT_HASH_PATTERN = /^[a-fA-F0-9]{64}$/u");
    expect(auditPanel).toContain('response.status === "human_decided"');
    expect(auditPanel).toContain("AUDIT_HASH_PATTERN.test(response.auditEntryHash)");
    expect(auditPanel).toContain('typeof response.actionId === "string"');
    expect(auditPanel).toContain("Audit confirmation unavailable");
    expect(auditPanel).toContain("No backend approval response or audit commit is available yet");
    expect(auditPanel).toContain("status === human_decided");
    expect(auditPanel).toContain("valid 64-hex auditEntryHash");
    expect(auditPanel).toContain("Waiting for committed backend approval response");
    expect(auditPanel).toContain("Backend contract gap");
    expect(auditPanel).toContain("Committed audit receipt citations unavailable");
    expect(auditPanel).toContain("Selected action citations");
    expect(auditPanel).toContain("View audit trail");
    expect(auditPanel).toContain("onReturnToWorklist");
    expect(auditPanel).toContain("Return to worklist");
    expect(auditPanel).toContain("setCopyStatus(undefined)");
    expect(auditPanel).toContain("navigator.clipboard.writeText(confirmedResponse.auditEntryHash)");
    expect(auditPanel).not.toContain("/api/approval");
    expect(auditPanel).not.toContain("fetch(");
    expect(auditPanel).not.toContain("Return to worklist unavailable");
    expect(auditPanel).not.toMatch(/\b(?:new Date|Date\.now|crypto|getRandomValues|randomUUID|Math\.random)\b/u);
    expect(auditPanel).not.toMatch(/[a-fA-F0-9]{64}[^/]/u);
    expect(auditPanel).not.toMatch(
      /\b(?:APPROVAL-HASH|audit-entry-demo|Alex Kim|akim@acmecorp\.com|2025-05-20|Case state updated|Recovery sent|ERP updated|Billing routed|Next Case)\b/u
    );
    expect(types).toMatch(/interface ApprovalGateResponse\s*\{[^}]*actionId:\s*string;/su);
  });

  it("keeps Beat 12 return-to-worklist local-only without queue mutation or fake next-case state", () => {
    const cockpitData = readFileSync("cockpit/app/cockpit-data.ts", "utf8");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const auditPanel = readFileSync("cockpit/components/maya/audit-confirmation-panel.tsx", "utf8");
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const beat12Sources = `${surface}\n${workspace}\n${auditPanel}\n${table}`;

    expect(cockpitData).not.toContain("nextRecommendedLineId");
    expect(surface).toContain("handleReturnToWorklist");
    expect(surface).toContain("setOpenedCaseWorklistItem(undefined)");
    expect(surface).toContain("setSelectedWorklistItem(openedCaseWorklistItem)");
    expect(surface).toContain("setReturnContextLineId(openedCaseWorklistItem.lineId)");
    expect(surface).toContain("returnContextLineId === visibleSelectedWorklistItem.lineId");
    expect(surface).toContain("BeatTwelveReturnedWorklist");
    expect(surface).toContain('heading="Deduction Cases"');
    expect(surface).toContain('data-testid="maya-beat-12-worklist-page"');
    expect(surface).toContain('data-testid="maya-beat-12-return-table"');
    expect(surface).toContain("Backend gaps:");
    expect(surface).toContain("no committed audit receipt, queue update, or next-case assignment");
    expect(surface).toContain("beatTwelveSourceReadinessTone(connectors.sourceTiles)");
    expect(surface).toContain('sourceTiles.some((source) => source.statusTone === "blocked")');
    expect(surface).toContain('sourceTiles.some((source) => source.statusTone === "synthetic")');
    expect(workspace).toContain("onReturnToWorklist: () => void");
    expect(workspace).toContain("onReturnToWorklist={onReturnToWorklist}");
    expect(auditPanel).toContain("onReturnToWorklist: () => void");
    expect(auditPanel).toContain("onClick={onReturnToWorklist}");
    expect(surface).not.toContain("nextRecommendedLineId");
    expect(surface).not.toContain("recommendedRows");
    expect(surface).not.toContain("reviewRows");
    expect(surface).not.toContain("billingRows");
    expect(surface).not.toContain("recoveryRows");
    expect(surface).not.toMatch(/TabsTrigger value="(?:recommended|review|billing|recovery)">[^<]*\{[^}]*\.length\.toString\(\)\}/u);
    expect(beat12Sources).not.toMatch(/\b(?:Next Case|Next case|Next recommended|Recommended Next|Audit recorded|audit recorded)\b/u);
    expect(beat12Sources).not.toMatch(/\b(?:Completed|Closed|Case closure|queue decremented|Audit verified)\b/u);
    expect(beat12Sources).not.toMatch(/\b(?:setQueue|setCompleted|setApproved|setAudit|postAudit|refreshAfterAudit)\b/u);
    expect(beat12Sources).not.toMatch(/\b(?:128|\$2\.74M|14\.6 days|96%|May 24, 2025)\b/u);
    expect(table).toContain("items.length");
    expect(table).toContain("Fetched rows only");
  });

  it("keeps Beat 3 recommendation selection local, advisory, and read-model honest", () => {
    const sources = readTree("cockpit/components/maya");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const actionCell = readFileSync("cockpit/components/maya/recommended-action-cell.tsx", "utf8");

    expect(surface).not.toContain("model.worklist[0]");
    expect(surface).toContain("backendSelectedWorklistItem");
    expect(surface).toContain("backendSelectionUnavailable");
    expect(surface).toContain("Backend-selected line unavailable");
    expect(surface).not.toContain("fallbackSelectedWorklistItem");
    expect(surface).not.toContain("model.worklist.at(0)");
    expect(surface).toContain("initialSelectedWorklistItem");
    expect(surface).toContain("selectedWorklistItem");
    expect(surface).toContain("setSelectedWorklistItem");
    expect(surface).toContain("selectedWorklistItem ?? initialSelectedWorklistItem");
    expect(surface).toContain("selectedWorklistItem.lineIds.includes(model.selected.lineId)");
    expect(surface).toContain("Advisory only");
    expect(surface).toContain("Detailed evidence is unavailable for this row until the backend exposes row switching.");
    expect(surface).toContain("Open investigation");
    expect(surface).not.toContain("Add note");
    expect(surface).not.toContain("maya-local-row-action-add-note");
    expect(surface).not.toContain("NotebookPenIcon");
    expect(surface).toContain("openedCaseWorklistItem");
    expect(surface).toContain("setOpenedCaseWorklistItem");
    expect(surface).toContain("<DeductionCaseWorkspace");
    expect(surface).toContain("selectedHasBackendDetail");
    expect(surface).toContain("openInvestigationForItem");
    expect(surface).toContain("activeCaseDetail");
    expect(surface).not.toContain("activeLineId=");
    expect(table).toContain("onSelectItem");
    expect(table).toContain("selectedLineId");
    expect(table).toContain('variant?: "rail" | "table"');
    expect(table).toContain('variant === "rail"');
    expect(table).toContain("item.lineId");
    expect(table).toContain("aria-selected={item.lineId === selectedLineId}");
    expect(table).toContain('data-selected={item.lineId === selectedLineId ? "true" : undefined}');
    expect(table).toContain("tabIndex={0}");
    expect(table).toContain('event.key === "Enter"');
    expect(table).toContain('event.key === " "');
    expect(table).toContain("@/components/ui/checkbox");
    expect(table).toMatch(/<Checkbox\b[\s\S]{0,500}\bonKeyDown=\{\(event\)\s*=>\s*\{[\s\S]{0,120}event\.stopPropagation\(\);/u);
    expect(actionCell).toContain("Forensics recommendation, advisory only");
    expect(actionCell).toContain("UserRoundCheckIcon");
    expect(sources).not.toContain("setSelectedLineId");
    expect(sources).not.toMatch(/useState[^;]*selectedLineId/su);
    expect(sources).not.toMatch(/onClick=\{[^}]*setSelectedLineId/su);
    expect(sources).not.toContain("Select ${");
    expect(sources).not.toMatch(/\b(?:auto recover|auto approve|execute|write back|recovered|cleared by AI)\b/iu);
  });

  it("surfaces backend valid deductions as positive read-model rows without fake cases", () => {
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const sources = `${surface}\n${table}\n${workspace}`;

    expect(surface).toContain('model.worklist.filter((item) => item.verdict === "valid").length');
    expect(surface).toContain("validDeductionCount");
    expect(surface).toContain('data-testid="maya-valid-deduction-signal"');
    expect(table).toContain('item.verdict === "valid"');
    expect(table).toContain("CheckCircle2Icon");
    expect(table).toContain("data-verdict={item.verdict}");
    expect(table).toContain("item.verdictLabel");
    expect(workspace).toContain('selectedWorklistItem.verdict === "valid"');
    expect(workspace).toContain("CheckCircle2Icon");
    expect(workspace).toContain("data-verdict={selectedWorklistItem.verdict}");
    expect(sources).not.toMatch(/\bconst\s+(?:valid|positive)\w*\s*=\s*\[/u);
    expect(sources).not.toMatch(/["'`]Valid deduction["'`]/u);
  });

  it("keeps Beat 4 case overview opened locally, deep-detail gated, and non-dispatching", () => {
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const recoveryDraftReview = readFileSync("cockpit/components/maya/recovery-draft-review.tsx", "utf8");

    expect(surface).toContain("openedCaseWorklistItem !== undefined");
    expect(surface).toContain("setOpenedCaseWorklistItem(item)");
    expect(surface).toContain("activeCaseDetail");
    expect(surface).toContain("fetchForensicsWorkItemDetail");
    expect(surface).toContain("activeCaseDetail.selected");
    expect(surface).toContain("activeCaseDetail.mayaJourney");
    expect(surface).toContain("activeCaseDetail.multimodalDock");
    expect(surface).toContain("activeCaseDetail.actionInbox");
    expect(surface).toContain('data-testid="maya-case-worklist-rail"');

    expect(workspace).toContain("hasBackendDetail");
    expect(workspace).toContain("selectedWorklistItem.lineIds.includes(selected.lineId)");
    expect(workspace).toContain("selected.evidencePack.recordIds");
    expect(workspace).toContain("selected.evidencePack.documents");
    expect(workspace).toContain("selected.draft.basis");
    expect(workspace).toContain("selected.draft.actionLabel");
    expect(workspace).toContain("selected.draft.statusLabel");
    expect(workspace).toContain('data-testid="maya-case-primary-draft-facts"');
    expect(workspace).toContain('data-testid="maya-case-draft-readonly-status"');
    expect(workspace).toContain("journey.map");
    expect(workspace).toContain("Contract gap");
    expect(workspace).toContain("Notes unavailable");
    expect(workspace).toContain("aria-readonly");
    expect(workspace).toContain('data-testid="maya-case-overview"');
    expect(workspace).toContain('data-testid="maya-case-overview-readonly-amount"');
    expect(workspace).toContain('data-testid="maya-case-detail-contract-gap"');
    expect(workspace).toContain("<RecoveryDraftReview");
    expect(workspace).not.toContain("/api/approval");
    expect(workspace).not.toContain("/api/query");
    expect(workspace).not.toContain("fetch(");
    expect(workspace).not.toContain('label="Action ID"');
    expect(workspace).not.toContain('label="Action type"');
    expect(workspace).not.toContain("selected.draft.actionId");
    expect(workspace).not.toContain("selected.draft.actionType");
    expect(workspace).not.toContain('data-testid="maya-case-draft-action-');
    expect(workspace).not.toContain("External action locked");
    expect(workspace).not.toContain("View draft");
    expect(workspace).not.toContain("Approval locked");
    expect(workspace).not.toContain("More actions");
    expect(workspace).not.toMatch(/\b(?:owner|contact|due date|received|priority|case created|preview draft|route for approval)\b/iu);

    expect(recoveryDraftReview).toContain('data-testid="maya-recovery-draft-review"');
    expect(recoveryDraftReview).toContain("draft.actionLabel");
    expect(recoveryDraftReview).toContain("draft.statusLabel");
    expect(recoveryDraftReview).toContain("draft.amount");
    expect(recoveryDraftReview).toContain("draft.basis");
    expect(recoveryDraftReview).toContain("recordIds.map");
    expect(recoveryDraftReview).toContain("item.actionLabel");
    expect(recoveryDraftReview).toContain("item.lineId");
    expect(recoveryDraftReview).toContain("item.amount");
    expect(recoveryDraftReview).toContain("item.statusLabel");
    expect(recoveryDraftReview).toContain("<TableHead>Draft label</TableHead>");
    expect(recoveryDraftReview).not.toContain("Action ID");
    expect(recoveryDraftReview).not.toContain("Action type");
    expect(recoveryDraftReview).not.toContain("draft.actionType");
    expect(recoveryDraftReview).not.toContain("item.actionType");
    expect(recoveryDraftReview).not.toMatch(/<TableHead>\s*Action\s*<\/TableHead>/u);
    expect(recoveryDraftReview).not.toMatch(/\b(?:preview draft|route for approval|approve draft|send draft|submit approval)\b/iu);
  });

  it("keeps Beat 9 draft review pre-approval, prop-driven, and local-command only", () => {
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const recoveryDraftReview = readFileSync("cockpit/components/maya/recovery-draft-review.tsx", "utf8");

    expect(workspace).toContain("approvalActions={selected.approvalActions}");
    expect(workspace).toContain("evidencePack={selected.evidencePack}");
    expect(workspace).toContain("selectedLineId={selected.lineId}");
    expect(workspace).toContain("selectedWorklistItem={selectedWorklistItem}");
    expect(workspace).not.toContain("/api/approval");
    expect(workspace).not.toContain("fetch(");

    for (const requiredProp of [
      "approvalActions: MayaApprovalAction[]",
      "evidencePack: MayaEvidencePack",
      "selectedLineId: string",
      "selectedWorklistItem: MayaWorklistItem | undefined"
    ]) {
      expect(recoveryDraftReview).toContain(requiredProp);
    }

    for (const requiredHook of [
      'data-testid="maya-recovery-draft-review"',
      'data-testid="maya-draft-hitl-warning"',
      'data-testid="maya-draft-packet-panel"',
      'data-testid="maya-draft-evidence-table"',
      'data-testid="maya-draft-evidence-row"',
      'data-testid="maya-draft-context-rail"',
      'data-testid="maya-draft-rail-gate"',
      'data-testid="maya-draft-rail-record-ids"',
      'data-testid="maya-draft-rail-human-decisions"',
      'data-testid="maya-draft-rail-backend-gaps"',
      'data-testid="maya-draft-readonly-amount"',
      'data-testid="maya-draft-command-bar"',
      'data-testid="maya-draft-command-intent"'
    ]) {
      expect(recoveryDraftReview).toContain(requiredHook);
    }

    for (const requiredPropRead of [
      "draft.actionLabel",
      "draft.statusLabel",
      "draft.amount",
      "draft.basis",
      "draft.actionId",
      "selectedLineId",
      "selectedWorklistItem.customerLabel",
      "selectedWorklistItem.scenarioLabel",
      "selectedWorklistItem.amount",
      "selectedWorklistItem.queueLabel",
      "selectedWorklistItem.routingLabel",
      "evidencePack.recordIds",
      "approvalActions.map",
      "humanDecisionLabel(action.decision)",
      "action.requiresReason",
      "evidencePack.documents.map",
      "document.citationId",
      "document.documentId",
      "document.documentType",
      "document.description",
      "document.relevance",
      "document.sourceLabel",
      "document.summary",
      "document.verifiedLabel",
      "actionInbox.map",
      "item.actionLabel",
      "item.lineId",
      "item.amount",
      "item.statusLabel",
      "approvalActions.find((action) => action.decision === \"modify\")",
      "approvalActions.find((action) => action.decision === \"reject\")",
      "setCommandIntent"
    ]) {
      expect(recoveryDraftReview).toContain(requiredPropRead);
    }

    expect(recoveryDraftReview).toContain('aria-readonly="true"');
    expect(recoveryDraftReview).toContain("Backend amount, read-only");
    expect(recoveryDraftReview).toContain("Request changes");
    expect(recoveryDraftReview).toContain("Reject draft");
    expect(recoveryDraftReview).toContain("Open approval");
    expect(recoveryDraftReview).toContain("sticky bottom-0");
    expect(recoveryDraftReview).toContain("pb-24");
    expect(recoveryDraftReview).toContain("Packet display ID not exposed");
    expect(recoveryDraftReview).toContain("Case account and currency not exposed");
    expect(recoveryDraftReview).toContain("Approval owner and timestamps not exposed");
    expect(recoveryDraftReview).toContain("Audit hash waits for human decision");
    expect(recoveryDraftReview).toContain("type=\"button\"");
    expect(recoveryDraftReview).toContain("<TabsList");
    expect(recoveryDraftReview).toContain("<TabsTrigger");
    expect(recoveryDraftReview).toContain("<Table");
    expect(recoveryDraftReview).toContain("<Alert");
    expect(recoveryDraftReview).toContain("<Button");
    expect(recoveryDraftReview).not.toContain("/api/approval");
    expect(recoveryDraftReview).not.toContain("fetch(");
    expect(recoveryDraftReview).not.toMatch(/<input\b|<textarea\b|contentEditable|type="number"/iu);
    expect(recoveryDraftReview).not.toMatch(/\b(?:new Date|Date\.now|toLocaleDateString|toLocaleTimeString)\b/u);
    expect(recoveryDraftReview).not.toMatch(/\b(?:DP-24-08971-01|24-08971|XXXX-XX34|Sterling Equipment Finance|Crestline Auto Target|contract_XXXXX34|pmt_history_XXXXX34)\b/u);
    expect(recoveryDraftReview).not.toMatch(/\b(?:Sent|Recovered|ERP written|Portal submitted|Human approved|Approved|Posted|Cleared by AI)\b/u);
  });

  it("keeps Beat 5 evidence dossier prop-driven, review-state honest, and provenance-safe", () => {
    const evidenceDossier = readFileSync("cockpit/components/maya/evidence-dossier.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(types).toContain("MayaSourceTile");
    expect(surface).toContain("sourceTiles={connectors.sourceTiles}");
    expect(workspace).toContain("sourceTiles: MayaSourceTile[]");
    expect(workspace).toContain("sourceTiles={sourceTiles}");
    expect(workspace).toContain("deterministicBasis={selected.draft.basis}");
    expect(workspace).toContain("draftStatusLabel={selected.draft.statusLabel}");
    expect(workspace).toContain("<EvidenceDossier");

    for (const requiredHook of [
      'data-testid="maya-evidence-dossier"',
      'data-testid="maya-evidence-packet"',
      'data-testid="maya-evidence-document-row"',
      'data-testid="maya-deterministic-basis-rail"',
      'data-testid="maya-source-provenance-rail"',
      'data-testid="maya-evidence-review-state"'
    ]) {
      expect(evidenceDossier).toContain(requiredHook);
    }

    for (const requiredPropRead of [
      "RecordIdStrip recordIds={evidencePack.recordIds}",
      "recordIds.map",
      "evidencePack.documents.map",
      "document.citationId",
      "document.documentId",
      "document.documentType",
      "document.description",
      "document.summary",
      "document.sourceLabel",
      "document.verifiedLabel",
      "document.relevance",
      "sourceTiles.map",
      "source.statusTone",
      "source.stateLabel",
      "source.modeLabel"
    ]) {
      expect(evidenceDossier).toContain(requiredPropRead);
    }

    expect(evidenceDossier).toContain("Backend evidence packet");
    expect(evidenceDossier).toContain("Evidence dossier available");
    expect(evidenceDossier).toContain("Review state unavailable");
    expect(evidenceDossier).toContain("Deterministic basis unavailable");
    expect(evidenceDossier).toContain("Contract gap");
    expect(evidenceDossier).toContain('source.statusTone === "synthetic"');
    expect(evidenceDossier).not.toMatch(
      /\b(?:pod reviewed|review satisfied|evidence review satisfied|all criteria satisfied|3 of 3|source verified by API|auto recover|auto approve|send|execute|write back|recovered|cleared by AI)\b/iu
    );
    expect(evidenceDossier).not.toMatch(
      /\b(?:Delivery and Proof of Delivery|Shipment Details|Inventory and Shortage Claim|Communications|Adjustments and Financials)\b/u
    );
    expect(evidenceDossier).not.toContain("new Date");
    expect(evidenceDossier).not.toContain("Date.now");
    expect(evidenceDossier).not.toContain("fetch(");
    expect(evidenceDossier).not.toContain("/api/");
  });

  it("renders only backend KPI items in backend order without UI metric injection", () => {
    const kpiStrip = readFileSync("cockpit/components/maya/maya-run-kpi-strip.tsx", "utf8");

    expect(kpiStrip).toContain("items.map((item, index)");
    expect(kpiStrip).toContain("key={item.label}");
    expect(kpiStrip).not.toContain("Priority field not exposed");
    expect(kpiStrip).not.toContain("High-priority items");
    expect(kpiStrip).not.toContain("Not exposed");
    expect(kpiStrip).not.toContain("Read-model gap");
    expect(kpiStrip).not.toContain("contract-gap");
    expect(kpiStrip).not.toContain("beatTwoKpiCards");
    expect(kpiStrip).not.toContain("hasHighPriorityKpi");
    expect(kpiStrip).not.toMatch(/\bitems\.slice\s*\(/u);
    expect(kpiStrip).not.toContain("@/components/ui/alert");
    expect(kpiStrip).not.toMatch(/<Alert(?:\s|>)/u);
    expect(kpiStrip).not.toContain("maya-priority-contract-gap");
  });

  it("keeps source readiness as a slim backend-wired strip", () => {
    const sourceStrip = readFileSync("cockpit/components/maya/source-readiness-strip.tsx", "utf8");

    expect(sourceStrip).toContain("React.useState(connectors)");
    expect(sourceStrip).toContain('fetch("/api/connectors"');
    expect(sourceStrip).toContain("sourceReadinessRefreshIntervalMs");
    expect(sourceStrip).toContain("sourceRefreshError");
    expect(sourceStrip).toContain('data-testid="maya-source-refresh-status"');
    expect(sourceStrip).toContain("aria-live");
    expect(sourceStrip).toContain("Connector refresh returned an invalid readiness model.");
    expect(sourceStrip).toContain("isMayaFieldProvenance");
    expect(sourceStrip).toContain("isSourceHealthResult");
    expect(sourceStrip).toContain("isSourceTile");
    expect(sourceStrip).toContain("isConnectorProof");
    expect(sourceStrip).toContain("isConnectorReadinessEntry");
    expect(sourceStrip).toContain("sourceHealth.every(isSourceHealthResult)");
    expect(sourceStrip).toContain("sourceTiles.every(isSourceTile)");
    expect(sourceStrip).toContain("connectors.every(isConnectorReadinessEntry)");
    expect(sourceStrip).toContain("currentConnectors.sourceTiles.map");
    expect(sourceStrip).toContain("currentConnectors.sourceTiles.length");
    expect(sourceStrip).toContain("currentConnectors.lastRefreshedLabel");
    expect(sourceStrip).toContain("source.modeLabel");
    expect(sourceStrip).toContain("source.stateLabel");
    expect(sourceStrip).toContain("source.label");
    expect(sourceStrip).not.toContain("toBlockedConnectorReadiness");
    expect(sourceStrip).not.toMatch(/\bsourceTiles\s*:\s*currentConnectors\.sourceTiles\.map/u);
    expect(sourceStrip).not.toMatch(/\bsourceHealth\s*:\s*currentConnectors\.sourceHealth\.map/u);
    expect(sourceStrip).not.toMatch(/\bprovenance\s*=\s*\{/u);
    expect(sourceStrip).not.toMatch(/\bstatus\s*:\s*"blocked"/u);
    expect(sourceStrip).not.toMatch(/\brecordIds\s*:\s*\[\]/u);
    expect(sourceStrip).not.toContain("connectors.sourceTiles.slice");
    expect(sourceStrip).not.toContain("View all sources");
    expect(sourceStrip).not.toContain("connectors.connectors.map");
  });

  it("keeps the Beat 2 worklist table-led with real controls only and no fake columns", () => {
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");

    expect(table).toContain("Deduction Worklist");
    expect(table).toContain("items.length");
    expect(table).toContain("InputGroup");
    expect(table).toContain("Search by scenario, customer, or line ID");
    expect(table).toContain("Read-model gaps");
    expect(table).toContain("missingOperationalFields");
    expect(table).toContain("Open work item");
    expect(table).not.toContain("Save view");
    expect(table).not.toContain("Worklist display options");
    expect(table).not.toContain("More filters");
    expect(table).not.toMatch(/<Button\b[\s\S]{0,260}\bRecommended action\b[\s\S]{0,160}<\/Button>/u);
    expect(table).not.toMatch(/<Button\b[\s\S]{0,220}>\s*Queue\s*<\/Button>/u);
    expect(table).not.toMatch(/<DropdownMenuTrigger\b[\s\S]{0,360}\bMore filters\b/u);
    expect(table).not.toMatch(/<TableHead[^>]*>\s*Priority/u);
    expect(table).not.toMatch(/<TableHead[^>]*>\s*Owner/u);
    expect(table).not.toMatch(/<TableHead[^>]*>\s*Age/u);
  });

  it("keeps the returned worklist free of disabled filter column refresh scaffolding", () => {
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const returnedWorklist = surface.slice(surface.indexOf("function BeatTwelveReturnedWorklist"));

    expect(returnedWorklist).toContain('data-testid="maya-beat-12-worklist-page"');
    expect(surface).not.toContain("FilterIcon");
    expect(surface).not.toContain("Columns3Icon");
    expect(returnedWorklist).not.toMatch(/<Button\b[^>]*\bdisabled\b[\s\S]{0,180}\b(?:Filters|Columns)\b/u);
    expect(returnedWorklist).not.toMatch(
      /aria-label=["']Refresh unavailable: no backend refresh action is exposed["'][\s\S]{0,180}\bdisabled\b/u
    );
  });

  it("keeps lucide icons accessible or explicitly decorative", () => {
    for (const { path, source } of readMayaSourceFiles()) {
      const lucideImports = [...source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"lucide-react"/gu)].flatMap((match) =>
        (match[1] ?? "")
          .split(",")
          .map((name) => name.trim().split(/\s+as\s+/u).pop() ?? "")
          .filter(Boolean)
      );

      for (const iconName of lucideImports) {
        const iconUsages = [...source.matchAll(new RegExp(`<${iconName}\\b([^>]*)>`, "gu"))];
        if (iconUsages.length === 0 && source.includes(`icon: ${iconName}`)) {
          expect(
            source,
            `${path} maps ${iconName} through an icon object and must render it through the shared NavIcon control.`
          ).toMatch(/<NavIcon\b[^>]*data-icon=/u);
          continue;
        }
        expect(iconUsages.length, `${path} imports ${iconName} but does not render it.`).toBeGreaterThan(0);
        for (const usage of iconUsages) {
          const attributes = usage[1] ?? "";
          expect(
            attributes,
            `${path} ${iconName} must include data-icon for controls or aria-hidden for decoration.`
          ).toMatch(/\b(?:data-icon|aria-hidden)=/u);
        }
      }
    }
  });
});
