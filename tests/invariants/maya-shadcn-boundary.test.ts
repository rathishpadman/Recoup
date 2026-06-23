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
    expect(route).toMatch(/\bfetchForensicsModel\s*\(\s*\)/u);
    expect(route).toMatch(/\bfetchConnectorReadinessModel\s*\(\s*\)/u);
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

  it("wires query narrative through the Realtime browser helper and cited answer guard", () => {
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
    expect(queryDock).toContain("startRealtimeBrowserSession");
    expect(queryDock).toContain("../../app/realtime-browser-session");
    expect(queryDock).toContain("const QUERY_QUESTION_CHARACTER_LIMIT = 500");
    expect(queryDock).toContain("sessionTokenRef");
    expect(queryDock).toContain("abortControllerRef");
    expect(queryDock).toContain("closeActiveSession");
    expect(queryDock).toContain("abortController?.abort()");
    expect(queryDock).toContain("previousAbortController?.abort()");
    expect(queryDock).toContain("onOpenChange={handleOpenChange}");
    expect(queryDock).toContain("sessionRef.current = null");
    expect(queryDock).toContain("publishForToken");
    expect(queryDock).toContain("isCurrentSession");
    expect(queryDock).toContain("<SheetHeader");
    expect(queryDock).toContain("<SheetTitle");
    expect(queryDock).toContain("<SheetDescription");
    expect(queryDock).toContain("<SheetFooter");
    expect(sheet).toContain("overlayClassName");
    expect(sheet).toContain("<SheetOverlay className={overlayClassName} />");
    expect(queryDock).toContain('overlayClassName="bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"');
    expect(queryDock).toContain('data-[side=right]:sm:max-w-[456px]');
    expect(queryDock).toContain('style={{ animation: "none", backgroundColor: "var(--bg-surface)", opacity: 1 }}');
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
    expect(queryDock).toContain("isRunning ? (");
    expect(queryDock).toContain("<AgentTracePanel response={snapshot} subAgents={dock.subAgents} />");
    expect(queryDock).toContain("submittedQuestion");
    expect(queryDock).toContain("setSubmittedQuestion(trimmedQuestion)");
    expect(queryDock).toContain('data-testid="maya-submitted-query"');
    expect(queryDock).toContain("recordIds");
    expect(queryDock).toContain("signal: abortController.signal");
    expect(queryDock).toContain("selectedLineId: selectedLine");
    expect(queryDock).toContain("onChange=");
    expect(queryDock).toContain("disabled={isRunning || question.trim().length === 0}");
    expect(queryDock).not.toContain("2000");
    expect(queryDock).not.toMatch(/\b(?:server-enforced|locked to|locked records|send|recover|approve|post|write back|route to billing|change terms|release hold|freeze)\b/iu);
    expect(citedAnswer).toContain("response.answer !== undefined");
    expect(citedAnswer).toContain("response.deterministicBasis !== undefined");
    expect(citedAnswer).toContain("response.recordIds.length > 0");
  });

  it("keeps Beat 7 agent trace in-progress state session-level and read-model honest", () => {
    const agentTrace = readFileSync("cockpit/components/maya/agent-trace-panel.tsx", "utf8");
    const queryDock = readFileSync("cockpit/components/maya/query-evidence-dock.tsx", "utf8");
    const mayaSources = readTree("cockpit/components/maya");
    const traceAndDock = `${agentTrace}\n${queryDock}`;

    expect(agentTrace).toContain('response?.status === "connecting" || response?.status === "connected"');
    expect(agentTrace).toContain('data-testid="maya-trace-running-session"');
    expect(agentTrace).toContain('data-testid="maya-trace-running-skeleton"');
    expect(agentTrace).toContain("Trace rail");
    expect(agentTrace).toContain("@/components/ui/table");
    expect(agentTrace).toContain('data-testid="maya-static-context-table"');
    expect(agentTrace).toContain('data-testid="maya-static-context-row"');
    expect(agentTrace).toContain("Read-model evidence context");
    expect(agentTrace).toContain("Backend trace-step contract gap");
    expect(agentTrace).toContain("subAgents.map");
    expect(agentTrace).toContain("agent.statusLabel");
    expect(agentTrace).not.toMatch(/agent\.statusLabel\s*===/u);
    expect(agentTrace).not.toContain("statusLabel.toLowerCase");
    expect(agentTrace).not.toMatch(/\b(?:Query Agent accepted|Forensics context attached|Delivery proof retriever|Evidence reader|Citation and action guard)\b/u);
    expect(queryDock).toContain("isRunning ? (");
    expect(queryDock).toContain("<AgentTracePanel response={snapshot} subAgents={dock.subAgents} />");
    expect(queryDock).toContain("canShowCitedAnswer ? <CitedAnswerCard");
    expect(mayaSources).not.toContain("/trace");
    expect(traceAndDock).not.toMatch(/\b(?:POD_2025|312 KB|SHA-256|Custodian|Proof of Delivery|fake five-step|fake trace)\b/u);
    expect(traceAndDock).not.toMatch(
      /\b(?:send|recover|approve|post|write back|route to billing|change terms|release hold|freeze)\b/iu
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
    expect(workspace).toContain("recordIds={selected.evidencePack.recordIds}");
    expect(workspace).toContain("selectedLine={selected.lineId}");
    expect(workspace).toContain("onResponse={() => undefined}");
    expect(workspace).not.toContain("queryResponse");
    expect(workspace).not.toContain("CitedAnswerCard");
  });

  it("wires approval dialog through supplied actions and the existing HITL API", () => {
    const approvalDialog = readFileSync("cockpit/components/maya/approval-gate-dialog.tsx", "utf8");
    const auditPanel = readFileSync("cockpit/components/maya/audit-confirmation-panel.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(approvalDialog).toContain("/api/approval");
    expect(approvalDialog).toContain("fetch(");
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
    expect(approvalDialog).toContain("onResponse");
    expect(approvalDialog).toContain("disabled={submitting");
    expect(approvalDialog).not.toContain("fallbackActions");
    expect(approvalDialog).not.toContain("human:maya-lead");
    expect(approvalDialog).not.toContain("human:david-lead");
    expect(approvalDialog).not.toContain("human:cfo-lead");
    expect(auditPanel).toContain("response?.auditEntryHash");
    expect(auditPanel).toContain("response?.status");
    expect(types).toMatch(/interface ApprovalGateResponse\s*\{[^}]*actionId:\s*string;/su);
  });

  it("keeps Beat 3 recommendation selection local, advisory, and read-model honest", () => {
    const sources = readTree("cockpit/components/maya");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const actionCell = readFileSync("cockpit/components/maya/recommended-action-cell.tsx", "utf8");

    expect(surface).not.toContain("model.worklist[0]");
    expect(surface).toContain("backendSelectedWorklistItem");
    expect(surface).toContain("fallbackSelectedWorklistItem");
    expect(surface).toContain("initialSelectedWorklistItem");
    expect(surface).toContain("selectedWorklistItem");
    expect(surface).toContain("setSelectedWorklistItem");
    expect(surface).toContain("selectedWorklistItem ?? initialSelectedWorklistItem");
    expect(surface).toContain("selectedWorklistItem.lineIds.includes(model.selected.lineId)");
    expect(surface).toContain("Advisory only");
    expect(surface).toContain("Detailed evidence is unavailable for this row until the backend exposes row switching.");
    expect(surface).toContain("Open investigation");
    expect(surface).toContain("Add note");
    expect(surface).toContain("openedCaseWorklistItem");
    expect(surface).toContain("setOpenedCaseWorklistItem");
    expect(surface).toContain("<DeductionCaseWorkspace");
    expect(surface).toContain("openedCaseHasBackendDetail");
    expect(surface).toContain("openedCaseWorklistItem.lineIds.includes(model.selected.lineId)");
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
    expect(actionCell).toContain("Forensics recommendation, advisory only");
    expect(actionCell).toContain("UserRoundCheckIcon");
    expect(sources).not.toContain("setSelectedLineId");
    expect(sources).not.toMatch(/useState[^;]*selectedLineId/su);
    expect(sources).not.toMatch(/onClick=\{[^}]*setSelectedLineId/su);
    expect(sources).not.toContain("Select ${");
    expect(sources).not.toMatch(/\b(?:auto recover|auto approve|execute|write back|recovered|cleared by AI)\b/iu);
  });

  it("keeps Beat 4 case overview opened locally, deep-detail gated, and non-dispatching", () => {
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const recoveryDraftReview = readFileSync("cockpit/components/maya/recovery-draft-review.tsx", "utf8");

    expect(surface).toContain("openedCaseWorklistItem !== undefined");
    expect(surface).toContain("setOpenedCaseWorklistItem(visibleSelectedWorklistItem)");
    expect(surface).toContain("openedCaseHasBackendDetail");
    expect(surface).toContain("model.selected");
    expect(surface).toContain("model.mayaJourney");
    expect(surface).toContain("model.multimodalDock");
    expect(surface).toContain("model.actionInbox");
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
    expect(recoveryDraftReview).not.toContain("draft.actionId");
    expect(recoveryDraftReview).not.toContain("draft.actionType");
    expect(recoveryDraftReview).not.toContain("item.actionType");
    expect(recoveryDraftReview).not.toMatch(/<TableHead>\s*Action\s*<\/TableHead>/u);
    expect(recoveryDraftReview).not.toMatch(/\b(?:preview draft|route for approval|approve draft|send draft)\b/iu);
    expect(recoveryDraftReview).not.toMatch(/<button\b|<Button\b/u);
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

  it("keeps Beat 2 priority gaps inside the KPI strip instead of a separate alert", () => {
    const kpiStrip = readFileSync("cockpit/components/maya/maya-run-kpi-strip.tsx", "utf8");

    expect(kpiStrip).toContain("Priority field not exposed");
    expect(kpiStrip).toContain("High-priority items");
    expect(kpiStrip).toContain("Read-model gap");
    expect(kpiStrip).toContain("recoveryTracker");
    expect(kpiStrip).toContain("actionInbox");
    expect(kpiStrip).not.toContain("@/components/ui/alert");
    expect(kpiStrip).not.toMatch(/<Alert(?:\s|>)/u);
    expect(kpiStrip).not.toContain("maya-priority-contract-gap");
  });

  it("keeps source readiness as a slim backend-wired strip", () => {
    const sourceStrip = readFileSync("cockpit/components/maya/source-readiness-strip.tsx", "utf8");

    expect(sourceStrip).toContain("connectors.sourceTiles.map");
    expect(sourceStrip).toContain("connectors.sourceTiles.length");
    expect(sourceStrip).toContain("connectors.lastRefreshedLabel");
    expect(sourceStrip).toContain("source.modeLabel");
    expect(sourceStrip).toContain("source.stateLabel");
    expect(sourceStrip).toContain("source.label");
    expect(sourceStrip).not.toContain("connectors.sourceTiles.slice");
    expect(sourceStrip).not.toContain("View all sources");
    expect(sourceStrip).not.toContain("connectors.connectors.map");
  });

  it("keeps the Beat 2 worklist table-led with mockup-like controls and no fake columns", () => {
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");

    expect(table).toContain("Deduction Worklist");
    expect(table).toContain("items.length");
    expect(table).toContain("InputGroup");
    expect(table).toContain("Search by scenario, customer, or line ID");
    expect(table).toContain("Save view");
    expect(table).toContain("More filters");
    expect(table).toContain("Recommended action");
    expect(table).toContain("Read-model gaps");
    expect(table).toContain("missingOperationalFields");
    expect(table).not.toMatch(/<TableHead[^>]*>\s*Priority/u);
    expect(table).not.toMatch(/<TableHead[^>]*>\s*Owner/u);
    expect(table).not.toMatch(/<TableHead[^>]*>\s*Age/u);
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
