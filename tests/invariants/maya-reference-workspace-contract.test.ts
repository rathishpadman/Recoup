import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readTree(root: string): string {
  const sources: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry).replace(/\\/g, "/");
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
        sources.push(read(path));
      }
    }
  }

  walk(root);
  return sources.join("\n");
}

describe("Maya reference workspace contract", () => {
  it("removes Cases and Evidence from the Maya left nav section type", () => {
    const types = read("cockpit/components/maya/types.ts");
    const shell = read("cockpit/components/maya/maya-workspace-shell.tsx");
    const surface = read("cockpit/components/maya/maya-forensics-surface.tsx");

    expect(types).toContain('export type MayaSurfaceSection = "overview" | "worklist" | "containment";');
    expect(shell).not.toContain('label: "Cases"');
    expect(shell).not.toContain('label: "Evidence"');
    expect(surface).not.toContain('case "cases"');
    expect(surface).not.toContain('case "evidence"');
  });

  it("renames user-visible cockpit copy from Recoup Agent to Recoup Copilot", () => {
    const mayaSources = readTree("cockpit/components/maya");

    expect(mayaSources).not.toContain("Recoup Agent");
    expect(mayaSources).toContain("Recoup Copilot");
  });

  it("renders Maya case detail as a single B1 to B7 scroll page with closed depth drawers", () => {
    const workspace = read("cockpit/components/maya/deduction-case-workspace.tsx");
    const recoveryDraftReview = read("cockpit/components/maya/recovery-draft-review.tsx");
    const sectionIds = [
      "maya-case-detail-b1-stepper",
      "maya-case-detail-b2-dossier-head",
      "maya-case-detail-b3-investigation",
      "maya-case-detail-b4-evidence",
      "maya-case-detail-b5-verdict",
      "maya-case-detail-b6-outcome",
      "maya-case-detail-b7-depth-drawers"
    ];
    const drawerIds = [
      "maya-case-depth-drawer-audit-provenance"
    ];

    let previousIndex = -1;
    for (const sectionId of sectionIds) {
      const currentIndex = workspace.indexOf(`data-testid="${sectionId}"`);
      expect(currentIndex, sectionId).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }

    for (const drawerId of drawerIds) {
      expect(workspace).toContain(`testId="${drawerId}"`);
    }

    expect(workspace).not.toMatch(/\bTabs(?:List|Trigger|Content)?\b/u);
    expect(recoveryDraftReview).not.toMatch(/\bTabs(?:List|Trigger|Content)?\b/u);
    expect(workspace).toContain('data-testid="maya-case-depth-drawer-trigger"');
    expect(workspace).toContain("{label} · {value}");
    expect(workspace).toContain('className="hidden pb-2 data-[state=open]:block"');
  });

  it("renders the Phase 2 contrast callout only through the real worklist-derived helper", () => {
    const workspace = read("cockpit/components/maya/deduction-case-workspace.tsx");
    const surface = read("cockpit/components/maya/maya-forensics-surface.tsx");
    const derived = read("cockpit/components/maya/maya-workspace-derived.ts");
    const unit = read("tests/unit/maya-workspace-derived.test.ts");

    expect(derived).toContain("export function findContrastCase(");
    expect(derived).toContain("normalizeMayaVerdict(selected.verdict)");
    expect(workspace).toContain("const contrastCase = findContrastCase(worklist, selectedWorklistItem);");
    expect(workspace).toContain('data-testid="maya-case-contrast-callout"');
    expect(surface).toContain("worklist={model.worklist}");
    expect(unit).toContain("finds same-family contrast cases only when verdicts are known and different");
  });

  it("renders the Phase 3 investigation timeline from trace rows while keeping trace details reachable", () => {
    const workspace = read("cockpit/components/maya/deduction-case-workspace.tsx");
    const timeline = read("cockpit/components/maya/agent-investigation-timeline.tsx");
    const derived = read("cockpit/components/maya/maya-workspace-derived.ts");
    const unit = read("tests/unit/maya-workspace-derived.test.ts");

    expect(derived).toContain("export function buildAgentInvestigationTimelineSteps(");
    expect(timeline).toContain('data-testid="maya-agent-investigation-timeline"');
    expect(timeline).toContain('data-testid="maya-agent-investigation-step"');
    expect(timeline).not.toMatch(/const\s+\w*steps\s*=\s*\[/u);
    expect(timeline).not.toContain("timestamp");
    expect(workspace).toContain("<AgentInvestigationTimeline");
    expect(workspace).toContain('testId="maya-case-depth-drawer-audit-provenance"');
    expect(workspace).toContain("<AgentTracePanel");
    expect(unit).toContain("builds Phase 3 investigation timeline steps only from backend trace rows");
  });

  it("renders Phase 4 evidence fact cards from packet documents and keeps raw proof strips out of the case header", () => {
    const workspace = read("cockpit/components/maya/deduction-case-workspace.tsx");
    const dossier = read("cockpit/components/maya/evidence-dossier.tsx");
    const derived = read("cockpit/components/maya/maya-workspace-derived.ts");
    const unit = read("tests/unit/maya-workspace-derived.test.ts");
    const e2e = read("tests/e2e/maya-real-backend-e2e.ts");

    expect(derived).toContain("export function buildEvidenceFactCard(");
    expect(derived).toContain("export function semanticRetrievalBadgeFromDocument(");
    expect(derived).toContain("export function buildEvidencePacketAvailabilityLabel(");
    expect(workspace).toContain("buildEvidenceFactCard(document)");
    expect(workspace).toContain("buildEvidencePacketAvailabilityLabel(selected.evidencePack)");
    expect(workspace).toContain('data-testid="maya-evidence-fact-card"');
    expect(workspace).toContain('data-testid="maya-evidence-fact-row"');
    expect(workspace).toContain('data-testid="maya-evidence-semantic-badge"');
    expect(workspace).not.toContain("SelectedEvidenceProofStrip");
    expect(dossier).toContain("export function SelectedEvidenceProofStrip");
    expect(unit).toContain("shows semantic retrieval scores only for vector-store evidence");
    expect(e2e).toContain("Maya evidence fact card");
    expect(e2e).toContain("Maya evidence packet drawer showed Unavailable");
  });

  it("renders Phase 5 verdict and outcome blocks from derived read-model helpers", () => {
    const workspace = read("cockpit/components/maya/deduction-case-workspace.tsx");
    const recoveryDraftReview = read("cockpit/components/maya/recovery-draft-review.tsx");
    const derived = read("cockpit/components/maya/maya-workspace-derived.ts");
    const unit = read("tests/unit/maya-workspace-derived.test.ts");

    expect(derived).toContain("export function buildVerdictLead(");
    expect(derived).toContain("export function buildRoutingBanner(");
    expect(derived).toContain("export function buildOutcomeActionPackages(");
    expect(derived).toContain("export function buildDraftLetterPreview(");
    expect(workspace).toContain('data-testid="maya-verdict-lead"');
    expect(workspace).toContain('data-testid="maya-verdict-cited-record"');
    expect(recoveryDraftReview).toContain('data-testid="maya-outcome-routing-banner"');
    expect(recoveryDraftReview).toContain('data-testid="maya-outcome-action-package"');
    expect(recoveryDraftReview).toContain('data-testid="maya-draft-letter-preview"');
    expect(recoveryDraftReview).toContain('data-testid="maya-evidence-reviewed-toggle"');
    expect(recoveryDraftReview).not.toContain("Draft message unavailable");
    expect(unit).toContain("builds Phase 5 verdict leads");
  });

  it("keeps Maya approval email controls scoped to the current draft action", () => {
    const recoveryDraftReview = read("cockpit/components/maya/recovery-draft-review.tsx");

    expect(recoveryDraftReview).toContain("committedApproval.actionId === draft.actionId");
    expect(recoveryDraftReview).toContain("[draft.actionId, selectedLineId]");
    expect(recoveryDraftReview).not.toContain("Amount carried from the approved draft packet.");
    expect(recoveryDraftReview).not.toContain('value="Selected routing team"');
  });

  it("keeps email secrets server-only and exposes email only through approved route and MCP service boundaries", () => {
    const emailRoute = read("cockpit/app/api/email/route.ts");
    const emailGateway = read("src/services/emailGateway.ts");
    const emailDialog = read("cockpit/components/maya/email-draft-dialog.tsx");
    const recoveryDraftReview = read("cockpit/components/maya/recovery-draft-review.tsx");
    const decisionStepper = read("cockpit/components/maya/decision-flow-stepper.tsx");
    const mcpServer = read("src/mcp/server.ts");
    const serviceLayer = read("src/services/serviceLayer.ts");
    const permissionEngine = read("src/services/permissionEngine.ts");
    const mayaGateway = read("src/agents/mcpGateway.ts");
    const mayaComponents = readTree("cockpit/components/maya");

    expect(emailRoute).toContain("loadLocalRuntimeEnvFiles");
    expect(emailRoute).toContain("RESEND_API_KEY");
    expect(emailRoute).toContain("EMAIL_TO_BILLING");
    expect(emailRoute).toContain("EMAIL_TO_RECOVERY");
    expect(emailRoute).toContain("SENDER_EMAIL_ADDRESS");
    expect(emailRoute).toContain("RECOUP_EMAIL_SEND_PRINCIPALS");
    expect(emailGateway).toContain("https://api.resend.com/emails");
    expect(emailGateway).toContain("createEmailStatusToken");
    expect(emailRoute).toContain('request.headers.get("x-recoup-email-status-token")');
    expect(recoveryDraftReview).toContain('"x-recoup-email-status-token": emailSendReceipt.statusToken');
    expect(emailDialog).toContain("Subject and body are editable");
    expect(emailDialog).toContain("maya-email-check-delivery-status");
    expect(emailDialog).toContain("maya-email-delivery-status");
    expect(emailDialog).toContain("Provider event");
    expect(decisionStepper).toContain("maya-decision-flow-stepper");
    expect(mayaComponents).not.toContain("RESEND_API_KEY");
    expect(mayaComponents).not.toContain("SENDER_EMAIL_ADDRESS");
    expect(serviceLayer).toContain('"email.sendApproved"');
    expect(serviceLayer).toContain('"email.status"');
    expect(permissionEngine).toContain("send_email");
    expect(mcpServer).toContain('toolName === "email.sendApproved"');
    expect(mcpServer).toContain('toolName === "email.status"');
    expect(mcpServer).toContain("statusToken: z.string().min(1)");
    expect(emailGateway).toContain("emailSendCapabilitiesForPrincipal");
    expect(emailGateway).toContain('"idempotency-key"');
    expect(emailRoute).not.toContain("html:");
    expect(mayaGateway).not.toMatch(/mayaAgentMcpAllowedToolNames[\s\S]*email\.sendApproved/u);
  });
});
