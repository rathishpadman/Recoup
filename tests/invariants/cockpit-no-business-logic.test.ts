import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function read(paths: string[]): string {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

function readTree(root: string, extensions: string[]): string {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (extensions.some((extension) => path.endsWith(extension))) {
        files.push(path);
      }
    }
  }

  walk(root);
  return read(files.sort());
}

function cssBlock(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u").exec(styles);
  if (match === null) {
    throw new Error(`Missing CSS block for ${selector}.`);
  }

  return match[1] ?? "";
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
      "cockpit/app/credit/command/page.tsx",
      "cockpit/app/cfo/page.tsx"
    ]);
    const mayaSources = readTree("cockpit/components/maya", [".ts", ".tsx"]);
    const cockpitAndMayaSources = `${cockpitSources}\n${mayaSources}`;

    expect(cockpitAndMayaSources).not.toContain("decimal.js");
    expect(cockpitAndMayaSources).not.toContain("../../src/services");
    expect(cockpitAndMayaSources).not.toContain("src/core");
    expect(cockpitAndMayaSources).not.toContain("evaluateRule");
    expect(cockpitAndMayaSources).not.toContain("runForensicsInvestigation");
  });

  it("wires Maya shadcn query and approval through credential-gated browser/API boundaries", () => {
    const mayaSources = readTree("cockpit/components/maya", [".ts", ".tsx"]);
    const queryDock = readFileSync("cockpit/components/maya/query-evidence-dock.tsx", "utf8");
    const sheet = readFileSync("cockpit/components/ui/sheet.tsx", "utf8");
    const approvalDialog = readFileSync("cockpit/components/maya/approval-gate-dialog.tsx", "utf8");
    const caseWorkspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");
    const worklistTable = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const evidenceDossier = readFileSync("cockpit/components/maya/evidence-dossier.tsx", "utf8");
    const recoveryDraftReview = readFileSync("cockpit/components/maya/recovery-draft-review.tsx", "utf8");
    const realtimeHelper = readFileSync("cockpit/app/realtime-browser-session.ts", "utf8");

    expect(mayaSources).toContain("model: ForensicsCockpitModel");
    expect(mayaSources).toContain("connectors: ConnectorReadinessCockpitModel");
    expect(mayaSources).toContain("session: DemoSession");
    expect(mayaSources).toContain("recommendedActionLabel");
    expect(queryDock).toContain('fetch("/api/forensics/query"');
    expect(queryDock).not.toContain("startRealtimeBrowserSession");
    expect(queryDock).not.toContain("../../app/realtime-browser-session");
    expect(queryDock).toContain("sessionTokenRef");
    expect(queryDock).toContain("closeActiveSession");
    expect(queryDock).toContain("onOpenChange={handleOpenChange}");
    expect(queryDock).toContain("onResponse: (response: QueryEvidenceResponse) => void");
    expect(queryDock).toContain("publishForToken");
    expect(queryDock).toContain("onResponse(next)");
    expect(queryDock).not.toContain("onResponseRef.current(undefined)");
    expect(queryDock).toContain("question:");
    expect(queryDock).toContain("QUERY_QUESTION_CHARACTER_LIMIT = 500");
    expect(queryDock).toContain("maxLength={QUERY_QUESTION_CHARACTER_LIMIT}");
    expect(queryDock).toMatch(/@\/components\/ui\/(?:accordion|collapsible)/u);
    expect(queryDock).toContain("Selected evidence context");
    expect(queryDock).toContain("Client-selected case context");
    expect(queryDock).toContain('data-testid="maya-selected-evidence-context"');
    expect(queryDock).toContain("Selected evidence packet");
    expect(queryDock).toContain('data-testid="maya-query-record-id"');
    expect(queryDock).toContain('data-testid="maya-query-source-details"');
    expect(queryDock).toContain('data-testid="maya-query-trace-details"');
    expect(queryDock).toMatch(/\bisRunning\s*\?\s*\((?=[\s\S]{0,900}Stop query)(?=[\s\S]{0,900}\bcloseActiveSession\s*\()/u);
    expect(sheet).toContain("overlayClassName?: string");
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
    expect(queryDock).toContain("CitedAnswerCard");
    expect(queryDock).toContain("AgentTracePanel");
    expect(queryDock).toContain("submittedQuestion");
    expect(queryDock).toContain("setSubmittedQuestion(trimmedQuestion)");
    expect(queryDock).toContain('data-testid="maya-submitted-query"');
    expect(queryDock).toContain("const blockedRecordIds");
    expect(queryDock).toContain("citations: response.citations");
    expect(queryDock).toMatch(/\brecordIds\s*:\s*blockedRecordIds\b[\s\S]{0,260}\bstatus\s*:\s*"blocked"/u);
    const backendQuerySnapshot = queryDock.slice(
      queryDock.indexOf("function toQueryEvidenceSnapshot"),
      queryDock.indexOf("function buildSelectedEvidenceIdentity")
    );
    expect(backendQuerySnapshot).not.toMatch(
      /return\s*\{[\s\S]{0,600}\bcitations\s*:\s*\[\][\s\S]{0,600}\bstatus\s*:\s*"blocked"/u
    );
    expect(queryDock).toContain("function buildStoppedQuerySnapshot");
    expect(queryDock).toMatch(
      /function buildStoppedQuerySnapshot[\s\S]{0,500}return\s*\{[\s\S]{0,120}citations\s*:\s*\[\][\s\S]{0,220}status\s*:\s*"blocked"/u
    );
    expect(queryDock).toContain("aria-describedby={promptChipDescriptionId}");
    expect(queryDock).toContain("id={promptChipDescriptionId}");
    expect(queryDock).toMatch(
      /<div\b(?=[^>]*\bclassName="grid min-w-0 gap-2 rounded-lg border bg-background p-3")(?=[^>]*\bdata-testid="maya-query-assistant-message")[^>]*>/u
    );
    expect(queryDock).toContain("displayAnswerWithoutInlineRecordIds(snapshot.answer");
    expect(queryDock).not.toMatch(/\{(?:snapshot|response)\.answer\}/u);
    expect(queryDock).toContain("evidencePack: MayaEvidencePack");
    expect(queryDock).toContain("evidencePack,");
    expect(queryDock).toContain("evidencePack={evidencePack}");
    const citedAnswer = readFileSync("cockpit/components/maya/cited-answer-card.tsx", "utf8");
    expect(citedAnswer).toContain('response.status === "answered"');
    expect(citedAnswer).toContain("response.answer !== undefined");
    expect(citedAnswer).toContain("response.answer.trim().length > 0");
    expect(citedAnswer).toContain("response.deterministicBasis !== undefined");
    expect(citedAnswer).toContain("response.deterministicBasis.trim().length > 0");
    expect(citedAnswer).toContain("response.recordIds.length > 0");
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
      /\b(?:send|recover|approve|post|write back|route to billing|change terms|release hold|freeze)\b/iu
    );
    expect(queryDock).not.toContain("/api/query/realtime-tool");
    expect(queryDock).not.toContain("2000");
    expect(queryDock).not.toMatch(/\b(?:server-enforced|locked to|locked records|send|recover|approve|write back|route to billing|change terms|release hold|freeze)\b/iu);
    const agentTracePanel = readFileSync("cockpit/components/maya/agent-trace-panel.tsx", "utf8");
    const traceAndDock = `${agentTracePanel}\n${queryDock}`;
    expect(agentTracePanel).toContain('response?.status === "connecting"');
    expect(agentTracePanel).toContain('data-testid="maya-trace-running-session"');
    expect(agentTracePanel).toContain("Trace rail");
    expect(agentTracePanel).toMatch(/@\/components\/ui\/(?:accordion|collapsible)/u);
    expect(agentTracePanel).toContain("@/components/ui/table");
    expect(agentTracePanel).toContain('data-testid="maya-agent-trace-details"');
    expect(agentTracePanel).toContain('data-testid="maya-backend-trace-table"');
    expect(agentTracePanel).toContain('data-testid="maya-backend-trace-row"');
    expect(agentTracePanel.indexOf('data-testid="maya-agent-process-map"')).toBeLessThan(
      agentTracePanel.indexOf('data-testid="maya-agent-trace-details"')
    );
    expect(agentTracePanel.indexOf('data-testid="maya-agent-trace-details"')).toBeLessThan(
      agentTracePanel.indexOf('data-testid="maya-backend-trace-table"')
    );
    expect(agentTracePanel).toContain("event.deterministicBasis");
    expect(agentTracePanel).not.toContain('data-testid="maya-static-context-table"');
    expect(agentTracePanel).not.toContain("Backend trace-step contract gap");
    expect(agentTracePanel).not.toMatch(/agent\.statusLabel\s*===/u);
    expect(agentTracePanel).not.toContain("statusLabel.toLowerCase");
    expect(agentTracePanel).toContain("No record IDs");
    expect(agentTracePanel).not.toContain("selected-evidence-read-model");
    expect(traceAndDock).not.toMatch(/\b(?:Query Agent accepted|Forensics context attached|Delivery proof retriever|Evidence reader|Citation and action guard)\b/u);
    expect(traceAndDock).not.toMatch(/\b(?:POD_2025|312 KB|SHA-256|Custodian|Proof of Delivery|fake five-step|fake trace)\b/u);
    expect(realtimeHelper).toContain('const realtimeToolUrl = "/api/query/realtime-tool"');
    expect(approvalDialog).toContain("/api/approval");
    expect(approvalDialog).toContain("fetch(");
    expect(approvalDialog).toContain("<AlertDialog");
    expect(approvalDialog).toContain("<AlertDialogTitle");
    expect(approvalDialog).toContain("<AlertDialogDescription");
    expect(approvalDialog).toContain("<AlertDialogCancel asChild");
    expect(approvalDialog).toContain('aria-label="Close human approval dialog"');
    expect(approvalDialog).toContain("actionId");
    expect(approvalDialog).toContain("decision");
    expect(approvalDialog).toContain("reason");
    expect(approvalDialog).toContain("actions.map");
    expect(approvalDialog).toContain("useId");
    expect(approvalDialog).toContain("auditEntryHash");
    expect(approvalDialog).toContain("result.actionId !== actionId");
    expect(approvalDialog).toContain('result.status !== "human_decided"');
    expect(approvalDialog).toContain("evidenceReviewEligibilityAvailable = false");
    expect(approvalDialog).toContain("approvalEligibilityUnavailable");
    expect(approvalDialog).toContain("Evidence review status and approval availability are unavailable");
    expect(approvalDialog).toContain("Approval unavailable");
    expect(approvalDialog).toContain("Verified human principal unavailable");
    expect(approvalDialog).toContain("Opening this dialog does not dispatch anything");
    expect(approvalDialog).toContain("No action will be taken until you choose an option");
    expect(approvalDialog).toContain("Your decision, note, and timestamp will be recorded with the draft");
    expect(approvalDialog).toContain("NOTE_CHARACTER_LIMIT = 500");
    expect(approvalDialog).toContain("FieldError");
    expect(approvalDialog).toContain("Separator");
    expect(approvalDialog).toContain("disabled={isDecisionDisabled(action)}");
    expect(approvalDialog).toContain("onResponse: (response: ApprovalGateResponse) => void");
    expect(approvalDialog).toContain("onResponse");
    expect(approvalDialog).toContain("onResponse(approvalResponse)");
    expect(approvalDialog).not.toMatch(/\b(?:3 of 3|Reviewed|reviewed count|audit-entry-demo|APPROVAL-HASH|Maya Patel)\b/u);
    expect(caseWorkspace).toContain("hasBackendDetail");
    expect(caseWorkspace).toContain("selectedWorklistItem.lineIds.includes(selected.lineId)");
    expect(caseWorkspace).toContain("selected.evidencePack.recordIds");
    expect(caseWorkspace).toContain("selected.draft.basis");
    expect(caseWorkspace).toContain("selected.draft.actionLabel");
    expect(caseWorkspace).toContain("setApprovalResponse");
    expect(caseWorkspace).toContain("approvalReceipt");
    expect(caseWorkspace).toContain("response={approvalResponse ?? approvalReceipt}");
    expect(caseWorkspace).toContain("selectedActionContext");
    expect(caseWorkspace).toContain("<QueryEvidenceDock");
    expect(caseWorkspace).toContain("queryDockOpen");
    expect(caseWorkspace).toContain("setQueryDockOpen");
    expect(caseWorkspace).toContain("QueryEvidenceResponse");
    expect(caseWorkspace).toContain("setQueryResponse");
    expect(caseWorkspace).toContain("setQueryResponse(undefined)");
    expect(caseWorkspace).toContain("response={queryResponse}");
    expect(caseWorkspace).toContain("recordIds={selected.evidencePack.recordIds}");
    expect(caseWorkspace).toContain("evidencePack={selected.evidencePack}");
    expect(caseWorkspace).toContain('data-testid="maya-case-primary-draft-facts"');
    expect(caseWorkspace).toContain('data-testid="maya-case-draft-readonly-status"');
    expect(caseWorkspace).toContain("<RecoveryDraftReview");
    expect(caseWorkspace).not.toContain('label="Action ID"');
    expect(caseWorkspace).not.toContain('label="Action type"');
    expect(caseWorkspace).not.toContain("selected.draft.actionId");
    expect(caseWorkspace).not.toContain("selected.draft.actionType");
    expect(caseWorkspace).not.toContain('data-testid="maya-case-draft-action-');
    expect(caseWorkspace).not.toContain("External action locked");
    expect(caseWorkspace).not.toContain("View draft");
    expect(caseWorkspace).not.toContain("Approval locked");
    expect(caseWorkspace).not.toContain("More actions");
    expect(caseWorkspace).not.toContain("queryResponse?: QueryEvidenceResponse");
    expect(caseWorkspace).toContain("onResponse={setQueryResponse}");
    expect(caseWorkspace).not.toContain("onResponse={() => undefined}");
    expect(caseWorkspace).not.toContain("CitedAnswerCard");
    expect(caseWorkspace).not.toContain("fetch(");
    expect(worklistTable).toContain("item.approvalStatusLabel");
    expect(worklistTable).toContain('item.approvalStatus === "human_decided"');
    expect(worklistTable).not.toMatch(/\b(?:closed|completed|case closure|routed to billing|sent to ERP)\b/iu);
    const auditPanel = readFileSync("cockpit/components/maya/audit-confirmation-panel.tsx", "utf8");
    expect(auditPanel).toContain("AUDIT_HASH_PATTERN = /^[a-fA-F0-9]{64}$/u");
    expect(auditPanel).toContain('response.status === "human_decided"');
    expect(auditPanel).toContain("AUDIT_HASH_PATTERN.test(response.auditEntryHash)");
    expect(auditPanel).toContain('typeof response.actionId === "string"');
    expect(auditPanel).toContain("Audit confirmation unavailable");
    expect(auditPanel).toContain("No committed approval receipt is available yet");
    expect(auditPanel).toContain("Waiting for committed approval receipt");
    expect(auditPanel).toContain("Backend contract gap");
    expect(auditPanel).toContain("Receipt fields remain source-owned");
    expect(auditPanel).toContain("Committed audit receipt citations unavailable");
    expect(auditPanel).toContain("Selected action citations");
    expect(auditPanel).not.toContain("View audit trail");
    expect(auditPanel).toContain("onReturnToWorklist");
    expect(auditPanel).toContain("Return to worklist");
    expect(auditPanel).toContain("setCopyStatus(undefined)");
    expect(auditPanel).toContain("navigator.clipboard.writeText(confirmedResponse.auditEntryHash)");
    expect(auditPanel).not.toContain("/api/approval");
    expect(auditPanel).not.toContain("fetch(");
    expect(auditPanel).not.toContain("Return to worklist unavailable");
    expect(auditPanel).not.toMatch(/\b(?:new Date|Date\.now|crypto|getRandomValues|randomUUID|Math\.random)\b/u);
    expect(auditPanel).not.toMatch(
      /\b(?:APPROVAL-HASH|audit-entry-demo|Alex Kim|akim@acmecorp\.com|2025-05-20|Case state updated|Recovery sent|ERP updated|Billing routed|Next Case)\b/u
    );
    expect(evidenceDossier).toContain("onQueryEvidence?: () => void");
    expect(evidenceDossier).toContain("Query evidence");
    expect(evidenceDossier).toContain("groupEvidenceDocumentsByBusinessLabel(evidencePack.documents)");
    expect(evidenceDossier).toContain("evidenceGroups.map");
    expect(evidenceDossier).toContain("EvidenceDocumentTable documents={group.documents}");
    expect(evidenceDossier).toContain("RecordIdStrip recordIds={evidencePack.recordIds}");
    expect(evidenceDossier).toContain("recordIds.map");
    expect(evidenceDossier).toContain("documents.map");
    expect(evidenceDossier).toContain("sourceTiles.map");
    expect(evidenceDossier).toContain('data-testid="maya-evidence-business-group"');
    expect(evidenceDossier).toContain('data-testid="maya-evidence-source-details"');
    expect(evidenceDossier).toContain("Review state unavailable");
    expect(evidenceDossier).toContain("Deterministic basis unavailable");
    expect(evidenceDossier).not.toContain("Backend evidence packet");
    expect(evidenceDossier).not.toMatch(
      /\b(?:pod reviewed|review satisfied|evidence review satisfied|all criteria satisfied|3 of 3|source verified by API|auto recover|auto approve|send|execute|write back|recovered|cleared by AI)\b/iu
    );
    expect(evidenceDossier).not.toMatch(
      /\b(?:Delivery and Proof of Delivery|Shipment Details|Inventory and Shortage Claim|Communications|Adjustments and Financials)\b/u
    );
    expect(evidenceDossier).not.toContain("fetch(");
    expect(evidenceDossier).not.toContain("/api/");
    expect(recoveryDraftReview).toContain('data-testid="maya-recovery-draft-review"');
    expect(recoveryDraftReview).toContain("draft.actionLabel");
    expect(recoveryDraftReview).toContain("draft.statusLabel");
    expect(recoveryDraftReview).toContain("draft.amount");
    expect(recoveryDraftReview).toContain("draft.basis");
    expect(recoveryDraftReview).toContain("draft.actionId");
    expect(recoveryDraftReview).toContain("<ApprovalGateDialog");
    expect(recoveryDraftReview).toContain("approvalDialogOpen");
    expect(recoveryDraftReview).toContain("setApprovalDialogOpen(true)");
    expect(recoveryDraftReview).toContain("actionId={draft.actionId}");
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
    expect(recoveryDraftReview).toContain("approvalActions: MayaApprovalAction[]");
    expect(recoveryDraftReview).toContain("evidencePack: MayaEvidencePack");
    expect(recoveryDraftReview).toContain("selectedWorklistItem: MayaWorklistItem | undefined");
    expect(recoveryDraftReview).toContain("canOpenApproval");
    expect(recoveryDraftReview).not.toContain("approvalActions.find((action) => action.decision === \"modify\")");
    expect(recoveryDraftReview).not.toContain("approvalActions.find((action) => action.decision === \"reject\")");
    expect(recoveryDraftReview).toContain("evidencePack.documents.map");
    expect(recoveryDraftReview).toContain('data-testid="maya-draft-readonly-amount"');
    expect(recoveryDraftReview).toContain('aria-readonly="true"');
    expect(recoveryDraftReview).toContain('data-testid="maya-draft-command-bar"');
    expect(recoveryDraftReview).toContain("Open approval");
    expect(recoveryDraftReview).not.toContain('data-testid="maya-draft-command-intent"');
    expect(recoveryDraftReview).not.toContain("Request changes");
    expect(recoveryDraftReview).not.toContain("Reject draft");
    expect(recoveryDraftReview).toContain("sticky bottom-0");
    expect(recoveryDraftReview).toContain("pb-24");
    expect(recoveryDraftReview).not.toContain("/api/approval");
    expect(recoveryDraftReview).not.toContain("fetch(");
    expect(recoveryDraftReview).not.toMatch(/<input\b|<textarea\b|contentEditable|type="number"/iu);
    expect(recoveryDraftReview).not.toMatch(/\b(?:new Date|Date\.now|toLocaleDateString|toLocaleTimeString)\b/u);
    expect(recoveryDraftReview).not.toMatch(/\b(?:DP-24-08971-01|24-08971|XXXX-XX34|Sterling Equipment Finance|Crestline Auto Target|contract_XXXXX34|pmt_history_XXXXX34)\b/u);
    expect(recoveryDraftReview).not.toMatch(/\b(?:Sent|Recovered|ERP written|Portal submitted|Human approved|Approved|Posted|Cleared by AI)\b/u);
    expect(mayaSources).not.toContain("cockpit-shell");
    expect(mayaSources).not.toContain("premium-components");
    expect(mayaSources).not.toContain("@phosphor-icons");
    expect(mayaSources).not.toContain("decimal.js");
    expect(mayaSources).not.toContain("src/core");
    expect(mayaSources).not.toContain("src/services");
    expect(mayaSources).not.toContain("/api/query/realtime-client-secret");
    expect(mayaSources).not.toContain("https://api.openai.com");
    expect(mayaSources).not.toContain("OPENAI_API_KEY");
    expect(mayaSources).not.toContain("RECOUP_COCKPIT_AUTH_TOKEN");
    expect(mayaSources).not.toContain("x-recoup-human-token");
    expect(mayaSources).not.toContain("localStorage");
    expect(mayaSources).not.toContain("sessionStorage");
    expect(mayaSources).not.toContain("indexedDB");
  });

  it("rejects active-looking Maya controls that are not backed by behavior", () => {
    const worklist = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const returnedWorklist = surface.slice(surface.indexOf("function BeatTwelveReturnedWorklist"));

    expect(worklist).toContain("Search by scenario, customer, or line ID");
    expect(worklist).not.toContain("Save view");
    expect(worklist).not.toContain("Worklist display options");
    expect(worklist).not.toContain("More filters");
    expect(worklist).not.toMatch(/<Button\b[\s\S]{0,260}\bRecommended action\b[\s\S]{0,160}<\/Button>/u);
    expect(worklist).not.toMatch(/<Button\b[\s\S]{0,220}>\s*Queue\s*<\/Button>/u);
    expect(worklist).not.toMatch(/<DropdownMenuTrigger\b[\s\S]{0,360}\bMore filters\b/u);
    expect(surface).not.toContain("Add note");
    expect(surface).not.toContain("maya-local-row-action-add-note");
    expect(surface).not.toContain("FilterIcon");
    expect(surface).not.toContain("Columns3Icon");
    expect(returnedWorklist).not.toMatch(/<Button\b[^>]*\bdisabled\b[\s\S]{0,180}\b(?:Filters|Columns)\b/u);
    expect(returnedWorklist).not.toMatch(
      /aria-label=["']Refresh unavailable: no backend refresh action is exposed["'][\s\S]{0,180}\bdisabled\b/u
    );
  });

  it("refreshes Maya source readiness through a same-origin connector proxy every fifteen minutes", () => {
    const sourceStrip = readFileSync("cockpit/components/maya/source-readiness-strip.tsx", "utf8");
    const connectorRoute = readFileSync("cockpit/app/api/connectors/route.ts", "utf8");

    expect(sourceStrip).toContain("sourceReadinessRefreshIntervalMs = 15 * 60 * 1000");
    expect(sourceStrip).toContain('fetch("/api/connectors"');
    expect(sourceStrip).toContain("window.setInterval");
    expect(sourceStrip).toContain("window.clearInterval");
    expect(sourceStrip).toContain("setCurrentConnectors");
    expect(sourceStrip).toContain("sourceRefreshError");
    expect(sourceStrip).toContain('data-testid="maya-source-refresh-status"');
    expect(sourceStrip).toContain("aria-live");
    expect(sourceStrip).not.toContain("toBlockedConnectorReadiness");
    expect(sourceStrip).not.toMatch(/\bsourceTiles\s*:\s*currentConnectors\.sourceTiles\.map/u);
    expect(sourceStrip).not.toMatch(/\bsourceHealth\s*:\s*currentConnectors\.sourceHealth\.map/u);
    expect(sourceStrip).not.toMatch(/\bprovenance\s*=\s*\{/u);
    expect(sourceStrip).not.toMatch(/\bstatus\s*:\s*"blocked"/u);
    expect(sourceStrip).not.toMatch(/\brecordIds\s*:\s*\[\]/u);
    expect(connectorRoute).toContain("loadLocalRuntimeEnvFiles");
    expect(connectorRoute).toContain('`${apiBaseUrl}/connectors`');
    expect(connectorRoute).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(connectorRoute).not.toContain("SAP_ODATA_CLIENT_SECRET");
  });

  it("keeps Maya Beat 12 return navigation local and read-model honest", () => {
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
    expect(surface).toContain("BeatTwelveReturnedWorklist");
    expect(surface).toContain('heading="Deduction Cases"');
    expect(surface).toContain('data-testid="maya-beat-12-worklist-page"');
    expect(surface).toContain('data-testid="maya-beat-12-return-table"');
    expect(surface).toContain("Source fields pending");
    expect(surface).toContain("Pending source fields:");
    expect(surface).toContain("no committed audit receipt, queue update, or next-case assignment");
    expect(workspace).toContain("onReturnToWorklist: () => void");
    expect(auditPanel).toContain("onClick={onReturnToWorklist}");
    expect(table).toContain("items.length");
    expect(table).toContain("filteredItems.length");
    expect(table).toContain("Current queue");
    expect(surface).not.toContain("nextRecommendedLineId");
    expect(beat12Sources).not.toMatch(/\b(?:Next Case|Next case|Next recommended|Recommended Next|Audit recorded|audit recorded)\b/u);
    expect(beat12Sources).not.toMatch(/\b(?:Completed|Closed|Case closure|queue decremented|Audit verified)\b/u);
    expect(beat12Sources).not.toMatch(/\b(?:setQueue|setCompleted|setApproved|setAudit|postAudit|refreshAfterAudit)\b/u);
    expect(beat12Sources).not.toMatch(/\b(?:128|\$2\.74M|14\.6 days|96%|May 24, 2025)\b/u);
    expect(auditPanel).not.toContain("fetch(");
    expect(auditPanel).not.toContain("/api/");
  });

  it("keeps Maya root sidebar sections and valid verdict surfacing read-model backed", () => {
    const shell = readFileSync("cockpit/components/maya/maya-workspace-shell.tsx", "utf8");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");
    const workspace = readFileSync("cockpit/components/maya/deduction-case-workspace.tsx", "utf8");

    expect(shell).toContain("activeSection: MayaSurfaceSection");
    expect(shell).toContain("onSectionChange?: (section: MayaSurfaceSection) => void");
    expect(shell).toContain("onSectionChange?.(item.section)");
    expect(shell).toContain("disabled={onSectionChange === undefined}");
    expect(shell).not.toMatch(/\b(?:Deductions|Run trace|Analytics|Configuration)\b/u);
    expect(surface).toContain('React.useState<MayaSurfaceSection>("overview")');
    expect(surface).toContain("activeSection={activeSection}");
    expect(surface).toContain("onSectionChange={setActiveSection}");
    expect(surface).toContain('model.worklist.filter((item) => item.verdict === "valid").length');
    expect(surface).toContain('label="Valid deductions"');
    expect(surface).toContain("validDeductionCount.toString()");
    expect(surface).not.toContain('data-testid="maya-valid-deduction-signal"');
    expect(table).toContain('item.verdict === "valid"');
    expect(table).toContain("data-verdict={item.verdict}");
    expect(workspace).toContain('selectedWorklistItem.verdict === "valid"');
    expect(workspace).toContain("data-verdict={selectedWorklistItem.verdict}");
    expect(`${surface}\n${table}\n${workspace}`).not.toMatch(/["'`]Valid deduction["'`]/u);
  });

  it("keeps David command-centre rows in the canonical credit read model", () => {
    const page = readFileSync("cockpit/app/credit/command/page.tsx", "utf8");

    expect(page).toContain("model.commandCenter");
    expect(page).not.toMatch(/function build(?:StatusRail|Stats|ExposureRows|FeedRows|SignalRows|AuditRows|MarketTape)\b/u);
    expect(page).not.toMatch(/interface (?:StatusItem|StatItem|ExposureRow|FeedRow|SignalRow|AuditRow|MarketTapeItem)\b/u);
  });

  it("keeps CFO executive proof display labels in the canonical read model", () => {
    const page = readFileSync("cockpit/app/cfo/page.tsx", "utf8");

    expect(page).toContain("model.assurance");
    expect(page).toContain("model.readoutStatusLabels");
    expect(page).toContain("valueLabel");
    expect(page).toContain("supportLabel");
    expect(page).toContain("basisLabel");
    expect(page).toContain("recordCountLabel");
    expect(page).toContain("sourceLabel");
    expect(page).toContain("dataBasisLabel");
    expect(page).toContain("sourceSystemCountLabel");
    expect(page).not.toMatch(/function executiveMetadataValue\b/u);
    expect(page).not.toMatch(/function executiveBasis\b/u);
    expect(page).not.toMatch(/function recordCountLabel\b/u);
    expect(page).not.toMatch(/function humanize\b/u);
    expect(page).not.toContain("Audit verified");
    expect(page).not.toContain("Draft actions only");
    expect(page).not.toMatch(/model\.dependencies\.length/u);
    expect(page).not.toMatch(/open proofs/u);
    expect(page).not.toMatch(/String\(model\.provenance\.sourceSystems\.length\)\s*\}\s*source systems/u);
  });

  it("keeps David credit display labels in the canonical read model", () => {
    const page = readFileSync("cockpit/app/credit/page.tsx", "utf8");

    expect(page).toContain("model.readoutStatusLabels");
    expect(page).toContain("model.account.detailRows");
    expect(page).toContain("model.account.summaryRows");
    expect(page).toContain("model.sentinel.detailRows");
    expect(page).toContain("model.sentinel.recordStripLabel");
    expect(page).toContain("item.recordStripLabel");
    expect(page).toContain("model.actionQueueSummaryLabel");
    expect(page).toContain("model.partialHold.scoreReadout");
    expect(page).toContain("model.partialHold.releaseReadout");
    expect(page).toContain("model.partialHold.splitRows");
    expect(page).toContain("model.partialHold.ledgerRows");
    expect(page).toContain("model.partialHold.criteriaHeaders");
    expect(page).toContain("model.termProposal.summaryLabel");
    expect(page).toContain("model.termProposal.readyStateLabel");
    expect(page).toContain("model.termProposal.packetRows");
    expect(page).toContain("model.termProposal.commandLabels");
    expect(page).not.toMatch(/<small>\s*Account ID\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Legal entity\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Industry\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*HQ \/ region\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Credit program\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Owner\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Order\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Case\s*<\/small>/u);
    expect(page).not.toMatch(/<small>\s*Credit terms\s*<\/small>/u);
    expect(page).not.toMatch(/<strong>\{model\.account\.limitLabel\}<\/strong>\s*limit/u);
    expect(page).not.toMatch(/<strong>\{model\.account\.orderAmount\}<\/strong>\s*order exposure/u);
    expect(page).not.toMatch(/<strong>\{model\.account\.openArLabel\}<\/strong>\s*open AR/u);
    expect(page).not.toMatch(/<strong>\{model\.account\.dso90Label\}<\/strong>\s*DSO \(90D\)/u);
    expect(page).not.toMatch(/<strong>\{model\.account\.availableCreditLabel\}<\/strong>\s*available credit/u);
    expect(page).not.toMatch(/<strong>\{model\.audit\.valid \? "Valid" : "Blocked"\}<\/strong>\s*audit state/u);
    expect(page).not.toMatch(/<strong>\{model\.arbitration\.displayReason\}<\/strong>\s*arbitration/u);
    expect(page).not.toContain("Filing ID");
    expect(page).not.toContain("Secured party");
    expect(page).not.toContain("Sentinel alert record IDs");
    expect(page).not.toContain("`${item.actionLabel} record IDs`");
    expect(page).not.toContain("governed items");
    expect(page).not.toContain("String(model.actionQueue.length)");
    expect(page).not.toMatch(/<span>\s*composite\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*release path\s*<\/span>/u);
    expect(page).not.toContain('aria-label="Deterministic release path"');
    expect(page).not.toContain('aria-label="Composite partial hold score"');
    expect(page).not.toMatch(/<small>\s*Human approval gate\s*<\/small>/u);
    expect(page).not.toMatch(/>\s*release staged\s*<\/span>/u);
    expect(page).not.toMatch(/>\s*back-order queue\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Composite score\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Release ratio\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Proposed release\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Back-order hold\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Terms gate\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*State\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Criterion\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Weight\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Score\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Weighted\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Draft-only recommendations waiting for David\.\s*<\/span>/u);
    expect(page).not.toMatch(/<span className="ready-state">\s*Ready to act\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Recommended terms\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Conditions precedent\s*<\/span>/u);
    expect(page).not.toMatch(/<span>\s*Risk mitigants\s*<\/span>/u);
    expect(page).not.toMatch(/<button type="button">\s*Simulate alternatives\s*<\/button>/u);
    expect(page).not.toMatch(/<button type="button">\s*Send action packet\s*<\/button>/u);
  });

  it("keeps the David credit decision workbench compact without clipping cited basis", () => {
    const page = readFileSync("cockpit/app/credit/page.tsx", "utf8");
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));

    expect(page).toContain('className="score-basis-note"');
    expect(page).toContain('className="credit-action-decision-row"');
    expect(page).toContain('className="credit-provenance-strip"');
    expect(page).toContain("<RecordStrip label={item.recordStripLabel} recordIds={item.recordIds} />");

    expect(cssBlock(styles, ".credit-arbitration-workstation .score-hero small")).not.toMatch(
      /\b(?:max-height|overflow)\s*:/u
    );
    expect(cssBlock(styles, ".credit-arbitration-workstation .credit-action-table > .credit-action-decision-row")).toContain(
      "grid-template-columns: minmax(108px, 0.36fr) minmax(0, 1fr)"
    );
    expect(cssBlock(styles, ".credit-arbitration-workstation .credit-provenance-strip .record-strip code")).toContain(
      "font-size: 9px"
    );
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
    expect(data).toContain("/login");
    expect(stream).toContain("EventSource");
    expect(stream).toContain("/run");
    expect(realtimeControls).toContain("/api/query/realtime-client-secret");
    expect(data).not.toContain("runRiskMeshClosedLoop");
    expect(data).not.toContain("computePartialHold");
  });

  it("keeps login persona catalog data out of the client component", () => {
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");

    expect(loginForm).not.toContain("const personas = [");
    expect(loginForm).not.toContain("Deduction recovery workbench");
    expect(loginForm).toContain("personas:");
  });

  it("renders the login page from Vercel-local demo metadata without blocking on the Render cockpit API", () => {
    const loginPage = readFileSync("cockpit/app/login/page.tsx", "utf8");
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");
    const loginProxy = readFileSync("cockpit/app/api/demo-login/route.ts", "utf8");
    const cockpitModel = readFileSync("src/services/cockpitModel.ts", "utf8");
    const demoProfilesConfig = readFileSync("config/cockpitDemoProfiles.ts", "utf8");

    expect(loginPage).not.toContain("fetchLoginModel");
    expect(loginPage).not.toContain("../cockpit-data");
    expect(loginPage).not.toContain("RECOUP_API_URL");
    expect(loginPage).toContain("buildCockpitDemoLoginPersonas");
    expect(cockpitModel).toContain("buildCockpitDemoLoginPersonas");
    expect(demoProfilesConfig).toContain("export function buildCockpitDemoLoginPersonas");
    expect(loginPage).toContain("<LoginForm");
    expect(loginForm).toContain('fetch("/api/demo-login"');
    expect(loginProxy).toContain("verify_recoup_demo_login");
    expect(loginProxy).toContain("SUPABASE_SERVICE_ROLE_KEY");
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
    expect(controls).toContain("actions = fallbackActions");
    expect(controls).toContain("approval-reason");
    expect(controls).toContain("Reason required");
    expect(controls).toContain("auditEntryHash");
    expect(controls).toContain("disabled={submitting");
    expect(controls).not.toContain("human:maya-lead");
  });

  it("keeps approval reason textarea ids unique across mounted control instances", () => {
    const controls = readFileSync("cockpit/app/approval-controls.tsx", "utf8");

    expect(controls).toContain("useId");
    expect(controls).toContain("reasonTextareaId");
    expect(controls).toContain("htmlFor={reasonTextareaId}");
    expect(controls).toContain("id={reasonTextareaId}");
    expect(controls).not.toContain('htmlFor="approval-reason"');
    expect(controls).not.toContain('id="approval-reason"');
  });

  it("keeps human cockpit auth tokens and Supabase service role server-only", () => {
    const example = readFileSync(".env.example", "utf8");
    const approvalControls = readFileSync("cockpit/app/approval-controls.tsx", "utf8");
    const realtimeControls = readFileSync("cockpit/app/realtime-query-controls.tsx", "utf8");
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");
    const approvalProxy = readFileSync("cockpit/app/api/approval/route.ts", "utf8");
    const connectorsProxy = readFileSync("cockpit/app/api/connectors/route.ts", "utf8");
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
    expect(connectorsProxy).toContain("buildVerifiedHumanAuthHeaders");
    expect(connectorsProxy).toContain("loadLocalRuntimeEnvFiles");
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
    expect(shell).toContain("href={module.href}");
    expect(shell).toContain("aria-current");
    expect(shell).toContain("active={active}");
    expect(shell).toContain("const isActive = module.href !== undefined && routeForHref(module.href) === active;");
    expect(shell).not.toContain('session.role === "maya" ? null : <LogoutButton />');
    expect(shell).toContain("session.allowedRoutes.includes(module.href)");
    expect(forensics).toContain("ApprovalControls");
    expect(forensics).toContain("actions={model.selected.approvalActions}");
    const credit = readFileSync("cockpit/app/credit/page.tsx", "utf8");
    expect(credit).toContain("ApprovalControls");
    expect(credit).toContain("actionId={item.actionId}");
    expect(credit).toContain("item.actionLabel");
    expect(credit).toContain('className="credit-action-basis"');
    expect(credit).toContain("<RecordStrip label={item.recordStripLabel} recordIds={item.recordIds} />");
    const styles = readFileSync("cockpit/app/styles.css", "utf8");
    expect(styles).toContain(".credit-action-basis {");
    expect(styles).toContain(".credit-arbitration-workstation .credit-action-table .credit-action-basis .record-strip code");
    expect(styles).not.toMatch(/\.credit-arbitration-workstation\s+\.credit-action-table\s+code\s*\{[^}]*display:\s*none/isu);
    expect(forensics).toContain("aria-selected={isSelected}");
    expect(forensics).toContain("item.lineIds.includes(model.selected.lineId)");
    expect(forensics).toContain("item.customerLabel");
    expect(forensics).toContain("item.evidenceScoreLabel");
    expect(forensics).toContain("item.queueLabel");
    expect(shell).not.toContain('href="#credit"');
    expect(shell).not.toContain('href="#cfo"');
    expect(root).not.toContain("<GovernanceTabs");
  });

  it("protects tablet, mobile, and table layouts from fixed-column page overflow", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));
    const forensics = normalizeNewlines(readFileSync("cockpit/app/forensics/page.tsx", "utf8"));

    expect(styles).toContain("@media (max-width: 1372px)");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 620px)");
    expect(styles).toContain(".workspace-table-scroll");
    expect(styles).toContain("overflow-x: hidden;");
    expect(styles).toContain(".route-grid.forensics");
    expect(styles).toContain("grid-template-columns: minmax(430px, 0.98fr) minmax(504px, 1.16fr) minmax(296px, 0.68fr);");
    expect(styles).toContain("grid-template-columns: 16px minmax(74px, 0.58fr) minmax(122px, 0.92fr) minmax(74px, 0.52fr) minmax(48px, 0.36fr) minmax(62px, 0.48fr);");
    expect(styles).toContain(".forensic-worklist .account-cell");
    expect(styles).toContain(".evidence-score-cell");
    expect(styles).toContain(".queue-cell");
    expect(styles).toContain(".agent-sidecar > .audit-verify-chip");
    expect(styles).toContain(".journey-node");
    expect(forensics).toContain('className="account-cell"');
    expect(forensics).toContain('className="journey-node"');
    expect(styles).toContain("min-width: 0;");
    expect(styles).toContain("min-width: 598px;");
    expect(styles).toContain("scrollbar-gutter: stable;");
  });

  it("anchors cockpit styling to the O2C v3.1 design-system tokens", () => {
    const styles = readFileSync("cockpit/app/styles.css", "utf8");
    const layout = readFileSync("cockpit/app/layout.tsx", "utf8");

    expect(layout).toContain("../../tokens.css");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(styles).toContain("letter-spacing: 0");
    expect(styles).not.toContain("letter-spacing: var(--tracking-ui)");
    expect(styles).not.toMatch(/letter-spacing:\s*-[0-9]/u);
    expect(styles).not.toContain("var(--atmos-mint)");
    expect(styles).toContain("var(--radius-lg)");
    expect(styles).not.toContain("var(--text-on-primary)");
    expect(styles).not.toContain("text-transform: uppercase");
    expect(styles).toContain("font-family: var(--font-ui);");
    expect(styles).toContain("font-family: var(--font-editorial);");
    expect(styles).toContain("font-family: var(--font-mono);");
  });

  it("keeps operational surfaces restrained instead of over-framed demo cards", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));
    const cockpitSources = normalizeNewlines(readTree("cockpit/app", [".css", ".ts", ".tsx"]));

    expect(styles).toContain(".route-grid.forensics.workbench-grid");
    expect(styles).toContain("border-radius: var(--radius-lg);");
    expect(styles).toContain(".topbar {\n  border-bottom: 1px solid var(--border-default);");
    expect(styles).not.toContain("box-shadow: var(--shadow-md);");
    expect(styles).not.toMatch(
      /\.(?:metric|worklist|detail|stream|surface-panel|decision-console|scenario-metric-ledger|board-metric-ledger)[^{]*\{[^}]*\bbox-shadow:\s*var\(--shadow/isu
    );
    expect(cockpitSources).not.toMatch(/\b(?:forensics-kpi-strip|cfo-kpi-strip|executive-strip|graph-score-ring)\b/iu);
    expect(styles).toContain(".scenario-metric-ledger {\n  background: transparent;\n  border: 0;");
    expect(styles).toContain(".board-metric-ledger {\n  background: transparent;\n  border: 0;");
    expect(styles).not.toMatch(
      /\.(?:scenario-metric-ledger|board-metric-ledger)[^{]*\{[^}]*\bborder:\s*1px\s+solid/isu
    );
    expect(styles).not.toMatch(/border-(?:left|right|top|bottom):\s*[2-9]px/u);
    expect(styles).not.toMatch(/box-shadow:\s*inset\s+[^;]*(?:var\(--(?:color|status)|color-mix\(in srgb,\s*var\(--(?:color|status))/iu);
    expect(styles).not.toMatch(
      /border-(?:left|right|top|bottom):\s*1px\s+solid\s+(?:var\(--(?:color|status)|color-mix\(in srgb,\s*var\(--(?:color|status))/iu
    );
    expect(styles).not.toMatch(
      /::(?:before|after)\s*\{[^}]*background:\s*(?:var\(--(?:color|status)|color-mix\(in srgb,\s*var\(--(?:color|status))/isu
    );
    expect(styles).not.toContain("linear-gradient(");
    expect(styles).not.toContain("radial-gradient(");
  });

  it("blocks generated cockpit UI tells across CSS and component markup", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));
    const cockpitSources = normalizeNewlines(readTree("cockpit/app", [".css", ".ts", ".tsx"]));
    const pxAtLeastTwo = String.raw`(?:[2-9]|[1-9]\d+)(?:\.\d+)?px`;

    expect(styles).not.toMatch(
      new RegExp(
        String.raw`\bborder-(?:left|right|top|bottom|inline-start|inline-end|block-start|block-end)\s*:\s*${pxAtLeastTwo}\b`,
        "iu"
      )
    );
    expect(cockpitSources).not.toMatch(
      /\bborder-[lrtbsexy]-(?:[2-9]|[1-9]\d+|\[[^\]]*(?:[2-9]|[1-9]\d+)(?:\.\d+)?px[^\]]*\])\b/iu
    );
    expect(cockpitSources).not.toMatch(
      /\bborder(?:Left|Right|Top|Bottom)\s*:\s*["'`](?:[2-9]|[1-9]\d+)(?:\.\d+)?px\b/iu
    );
    expect(styles).not.toMatch(new RegExp(String.raw`\bbox-shadow\s*:[^;]*\binset\b[^;]*${pxAtLeastTwo}`, "iu"));
    expect(styles).not.toMatch(/\bbox-shadow\s*:[^;]*\binset\b/iu);
    expect(cockpitSources).not.toMatch(
      /\b(?:shadow-\[[^\]]*inset[^\]]*\]|boxShadow\s*:\s*["'`][^"'`]*\binset\b)/iu
    );
    expect(styles).not.toMatch(
      /::(?:before|after)\s*\{(?=[^}]*\bcontent\s*:\s*(?:""|''))(?=[^}]*\b(?:background(?:-color|-image)?|border(?:-(?:left|right|top|bottom|inline(?:-start|-end)?|block(?:-start|-end)?))?|box-shadow)\s*:)(?=[^}]*\b(?:width|height|inline-size|block-size|inset(?:-(?:inline|block)(?:-(?:start|end))?)?|top|right|bottom|left)\s*:)[^}]*\}/isu
    );
    expect(cockpitSources).not.toMatch(
      /\b(?:before|after):(?:absolute|content-|bg-|border-|shadow-|w-|h-|left-|right-|top-|bottom-|inset-)/iu
    );
    expect(cockpitSources).not.toMatch(/\b(?:uppercase|tracking-(?:wide|wider|widest|\[[^\]]+\]))\b/iu);
    expect(cockpitSources).not.toMatch(
      /\b(?:letterSpacing\s*[:=]|textTransform\s*:\s*["'`]uppercase["'`]|font-variant-caps\s*:)/iu
    );
    expect(styles).not.toMatch(/\btext-transform\s*:\s*uppercase\b/iu);
    const letterSpacingValues = [...styles.matchAll(/\bletter-spacing\s*:\s*([^;]+);/giu)].map((match) =>
      (match[1] ?? "").trim()
    );
    expect(letterSpacingValues.every((value) => value === "0")).toBe(true);
    expect(styles).not.toMatch(/\b(?:linear-gradient|radial-gradient|conic-gradient)\(/iu);
    expect(cockpitSources).not.toMatch(
      /\b(?:backdrop-blur|glass(?:morphism)?|score-(?:orb|ring)|graph-score-ring|\borb\b)\b/iu
    );
    expect(cockpitSources).not.toMatch(
      /className=(?:"[^"]*\b(?:bg-gradient|from-|via-|to-)[^"]*"|'[^']*\b(?:bg-gradient|from-|via-|to-)[^']*'|`[^`]*\b(?:bg-gradient|from-|via-|to-)[^`]*`)/iu
    );
  });

  it("keeps cockpit surfaces from nesting cards or expanding into spacious demo layouts", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));
    const cardNames =
      "(?:metric|worklist|detail|stream|surface-panel|decision-console|tool-status-rail|source-readiness-row|multimodal-dock|agent-trace-visualizer|negotiation-graph|audit-verify-chip|state-panel|account-360-panel|scenario-metric-ledger|board-metric-ledger|control-ledger|evidence-summary-grid|dock-state-grid|board-status-row|account-360-stats|arbitration-score-cell|graph-node|graph-supervisor|audit-rail)";

    expect(styles).not.toMatch(new RegExp(String.raw`\.${cardNames}[^,{]*\s+\.${cardNames}\b`, "u"));
    expect(styles).not.toMatch(
      new RegExp(
        String.raw`\.${cardNames}[^{}]*\{[^}]*\b(?:padding|gap|row-gap|column-gap|margin(?:-top|-bottom)?)\s*:[^;]*var\(--space-[5-9]\)`,
        "su"
      )
    );
    expect(styles).not.toMatch(
      new RegExp(String.raw`\.${cardNames}[^{}]*\{[^}]*\bmin-height\s*:\s*(?:1[6-9]\d|[2-9]\d{2,}|100vh)\b`, "su")
    );
  });

  it("keeps David Risk Mesh desktop supervisor clear of orbit nodes", () => {
    const styles = normalizeNewlines(readFileSync("cockpit/app/styles.css", "utf8"));

    expect(cssBlock(styles, ".credit-arbitration-workstation .risk-mesh-layout")).toContain(
      "grid-template-columns: minmax(0, 1fr) 140px"
    );
    expect(cssBlock(styles, ".credit-arbitration-workstation .risk-mesh-orbit")).toContain("min-height: 300px");

    const ownerNode = cssBlock(styles, ".credit-arbitration-workstation .mesh-owner-node");
    expect(ownerNode).toContain("grid-template-columns: minmax(58px, 0.62fr) minmax(0, 1fr)");
    expect(ownerNode).toContain("left: 50%");
    expect(ownerNode).toContain("top: 50%");
    expect(ownerNode).toContain("transform: translate(-50%, -50%)");
    expect(ownerNode).toContain("width: 176px");
    expect(ownerNode).toContain("z-index: 2");

    expect(cssBlock(styles, ".credit-arbitration-workstation .mesh-score-readout")).toContain(
      "border-right: 1px solid var(--border-subtle)"
    );

    const orbitNode = cssBlock(styles, ".credit-arbitration-workstation .orbit-node");
    expect(orbitNode).toContain("width: 154px");
    expect(orbitNode).toContain("z-index: 2");

    const meshLink = cssBlock(styles, ".credit-arbitration-workstation .mesh-link");
    expect(meshLink).toContain("top: 50%");
    expect(meshLink).toContain("z-index: 0");
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

    const decisionConsoleIndex = forensics.indexOf('className="decision-console');
    const nextBestActionIndex = forensics.indexOf('className="next-best-action flagship-action');
    const draftIndex = forensics.indexOf('className="draft priority-draft');

    expect(decisionConsoleIndex).toBeGreaterThan(-1);
    expect(decisionConsoleIndex).toBeLessThan(forensics.indexOf("Evidence pack"));
    expect(nextBestActionIndex).toBeLessThan(forensics.indexOf("Evidence pack"));
    expect(draftIndex).toBeGreaterThan(forensics.indexOf("Evidence pack"));
    expect(run).toContain("<RunStream");
    expect(run).toContain("<RealtimeQueryControls");
    expect(styles).toContain(".metric.primary");
    expect(styles).toContain(".decision-console");
    expect(styles).toContain(".flagship-action");
    expect(styles).toContain(".priority-draft");
    expect(styles).toContain(".audit-rail");
  });

  it("renders the M6 containment panel from Forensics read-model fields only", () => {
    const forensics = readFileSync("cockpit/app/forensics/page.tsx", "utf8");

    expect(forensics).toContain("model.containmentPanel");
    expect(forensics).toContain("model.containmentPanel.basisRows");
    expect(forensics).toContain("model.containmentPanel.handoff");
    expect(forensics).not.toContain("CUST-CRESTLINE");
    expect(forensics).not.toContain("POD-SIGNED-1");
    expect(forensics).not.toContain("PRICE-CLAUSE-1");
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
