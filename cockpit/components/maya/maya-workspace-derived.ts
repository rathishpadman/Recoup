import type {
  ApprovalGateResponse,
  MayaActionInboxItem,
  MayaEvidenceDocument,
  MayaEvidencePack,
  MayaQueryPromptDockContract,
  MayaSelectedCase,
  QueryEvidenceBackendResponse,
  QueryEvidenceResponse,
  MayaSourceTile,
  MayaWorkItemDetail,
  MayaWorklistItem
} from "./types.ts";

export type MayaVerdictBucket = "valid" | "invalid" | "partial";
export type MayaOverviewCardVisualKey = "invalid" | "partial" | "total" | "valid";
export type MayaOverviewVerdictFilter = "all" | MayaVerdictBucket;

export interface MayaOverviewSummaryCard {
  accent: "green" | "red" | "amber" | "neutral";
  amountLabel: string;
  count: number;
  label: string;
  lineCount?: number;
  runValueShareLabel?: string;
  supportLabel: string;
  verdict?: MayaVerdictBucket;
}

export interface MayaOverviewVerdictFilterOption {
  count: number;
  key: MayaOverviewVerdictFilter;
  label: "All" | "Invalid" | "Partial" | "Valid";
}

export interface MayaSourcePillState {
  connectedCount: number;
  isAllReady: boolean;
  label: "Ready sources";
  statusTone: "ready" | "blocked";
  totalCount: number;
}

export interface MayaDecisionFlowStep {
  key: "scenario" | "agents" | "verdict" | "action" | "approval";
  label: string;
  state: "done" | "current" | "pending";
  supportLabel: string;
}

export interface MayaContrastCase {
  contrastReason: string;
  familyLabel: string;
  lineId: string;
  selectedReason: string;
  verdictLabel: string;
  workItemLabel: string;
}

export interface MayaAgentInvestigationTimelineStep {
  agentName: string;
  citationRecordChips: MayaCitedRecordChip[];
  citationRecordIds: string[];
  didLine: string;
  foundLine: string;
  isFinal: boolean;
  key: string;
  phase: string;
  sourceLabel: string;
  toolLabel?: string;
  verdict?: string;
  verdictLabel?: string;
}

export interface MayaEvidenceFactCard {
  documentId: string;
  documentType: string;
  documentHref?: string;
  documentSummary?: string;
  lineId?: string;
  provenanceRows: MayaEvidenceFactRow[];
  rows: MayaEvidenceFactRow[];
  semanticRetrievalBadge?: string;
  sourceLabel: string;
  title: string;
  verificationLabel: string;
}

export interface MayaEvidenceFactRow {
  label: string;
  value: string;
}

export interface MayaCopilotSuggestion {
  key: string;
  label: string;
  question: string;
  recordIds: string[];
  supportLabel: string;
  targetLineId: string;
}

export interface MayaCopilotCaseOption {
  customerLabel: string;
  label: string;
  lineId: string;
  recordIds: string[];
  workItem: MayaWorklistItem;
  workItemLabel: string;
}

export interface MayaConductorSummaryInput {
  customerLabel?: string;
  evidenceDocuments: readonly MayaEvidenceDocument[];
  question?: string;
  queryScope?: "line" | "workspace";
  selectedLineLabel?: string;
  subAgentNames: readonly string[];
}

export interface MayaAgentChecklistRow {
  agentName: string;
  key: string;
  state: "blocked" | "complete" | "running" | "stopped";
}

export interface MayaCopilotVerdictBand {
  actionLabel: string;
  amountLabel: string;
  basis: string;
  routeLabel: string;
  tone: "invalid" | "partial" | "valid" | "unknown";
  verdictLabel: string;
}

export interface MayaResolvedWorklistReason {
  factHash?: string;
  generatedAtIso?: string;
  model?: string;
  source: "deduction_reason" | "deterministic_basis" | "deterministic_fallback" | "llm";
  sourceLabel: "Deduction reason" | "Deterministic basis" | "Deterministic fallback" | "Stored narrative";
  text: string;
}

type MayaCopilotQuestionFocus =
  | "approval_gate"
  | "carrier"
  | "contract"
  | "general"
  | "pod"
  | "remittance"
  | "route"
  | "sap"
  | "tpm";

export interface MayaWorklistApprovalDisplay {
  isTerminal: boolean;
  label: string;
  status: "human_decided" | "line_human_decided" | MayaWorklistItem["approvalStatus"];
  title: string;
}

export interface BuildQueryEvidenceSnapshotInput {
  evidencePackRecordIds: readonly string[];
  queryScope: "line" | "workspace";
  recordIds: readonly string[];
  response: QueryEvidenceBackendResponse;
  selectedLine: string;
}

export interface MayaCitedRecordChip {
  label: string;
  recordId: string;
}

export interface MayaRoutingBanner {
  amountLabel: string;
  queueLabel: string;
  routeLine: string;
  title: string;
  verdictLabel: string;
}

export interface MayaOutcomeActionPackage {
  amount: string;
  basis: string;
  key: string;
  lineId: string;
  statusLabel: string;
  title: string;
}

export interface MayaDraftLetterPreview {
  body: string;
  recipientGroup: "billing" | "recovery";
  subject: string;
}

export interface BuildOutcomeActionPackagesInput {
  actionInbox: readonly MayaActionInboxItem[];
  draft: MayaSelectedCase["draft"];
  selectedLineId: string;
}

export interface BuildDraftLetterPreviewInput {
  draft: MayaSelectedCase["draft"];
  evidenceRecordIds: readonly string[];
  reason: string;
  recipientGroup: "billing" | "recovery";
  workItem: MayaWorklistItem;
}

export interface BuildDecisionFlowStepsInput {
  approvalResponse?: ApprovalGateResponse;
  detail?: MayaWorkItemDetail;
  workItem?: MayaWorklistItem;
}

export interface BuildEmailDraftInput {
  evidenceRecordIds: readonly string[];
  reason: string;
  recipientGroup: "billing" | "recovery";
  recommendedActionLabel: string;
  workItem: MayaWorklistItem;
}

export interface MayaEmailDraft {
  body: string;
  recipientGroup: "billing" | "recovery";
  subject: string;
}

export interface BuildAgentInvestigationTimelineStepsInput {
  evidenceDocuments?: readonly MayaEvidenceDocument[];
  evidenceRecordIds: readonly string[];
  reason?: string;
  recommendedActionLabel?: string;
  trace: readonly QueryEvidenceResponse["trace"][number][];
  verdict?: string;
  verdictLabel?: string;
}

type MoneyCents = bigint;
interface AmountAggregate {
  total: MoneyCents;
  unavailableCount: number;
}

const zeroCents = 0n;

export function normalizeMayaVerdict(value: string | undefined): MayaVerdictBucket | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (normalized === "valid" || normalized.includes("valid -> billing")) {
    return "valid";
  }
  if (normalized === "invalid" || normalized.includes("invalid -> recovery")) {
    return "invalid";
  }
  if (normalized === "partial" || normalized === "split" || normalized.includes("partial -> split")) {
    return "partial";
  }

  return undefined;
}

export function buildOverviewSummaryCards(worklist: readonly MayaWorklistItem[]): MayaOverviewSummaryCard[] {
  const totalAmount = sumAmounts(worklist);
  const totalLines = worklist.reduce((sum, item) => sum + item.lineCount, 0);
  const unknownVerdictCount = worklist.filter((item) => normalizeMayaVerdict(item.verdict) === undefined).length;
  const totalSupport = [
    "Settlement run total",
    totalAmount.unavailableCount === 0 ? undefined : `${String(totalAmount.unavailableCount)} amount unavailable`,
    unknownVerdictCount === 0 ? undefined : `${String(unknownVerdictCount)} verdict unavailable`
  ]
    .filter((part): part is string => part !== undefined)
    .join(" - ");
  const bucketCards: Array<{ accent: MayaOverviewSummaryCard["accent"]; bucket: MayaVerdictBucket; label: string; support: string }> = [
    { accent: "green", bucket: "valid", label: "Valid -> Billing", support: "Approved deduction value to route to Billing" },
    { accent: "red", bucket: "invalid", label: "Invalid -> Recovery", support: "Recovery value staged for human review" },
    { accent: "amber", bucket: "partial", label: "Partial -> Split", support: "Split value staged across Billing and Recovery" }
  ];

  return [
    {
      accent: "neutral",
      amountLabel: amountLabelForAggregate(totalAmount),
      count: worklist.length,
      label: "Deduction cases",
      lineCount: totalLines,
      supportLabel: totalSupport
    },
    ...bucketCards.map((card) => {
      const rows = worklist.filter((item) => normalizeMayaVerdict(item.verdict) === card.bucket);
      const aggregate = sumAmounts(rows);
      const runValueShareLabel = shareOfRunLabel(aggregate, totalAmount);
      return {
        accent: card.accent,
        amountLabel: amountLabelForAggregate(aggregate),
        count: rows.length,
        label: card.label,
        ...(runValueShareLabel === undefined ? {} : { runValueShareLabel }),
        supportLabel:
          aggregate.unavailableCount === 0 ? card.support : `${card.support} - ${String(aggregate.unavailableCount)} amount unavailable`,
        verdict: card.bucket
      };
    })
  ];
}

export function overviewCardVisualKey(card: MayaOverviewSummaryCard): MayaOverviewCardVisualKey {
  if (card.verdict === "valid") {
    return "valid";
  }
  if (card.verdict === "invalid") {
    return "invalid";
  }
  if (card.verdict === "partial") {
    return "partial";
  }

  return "total";
}

export function buildOverviewVerdictFilterOptions(
  worklist: readonly MayaWorklistItem[]
): MayaOverviewVerdictFilterOption[] {
  const counts = worklist.reduce<Record<MayaVerdictBucket, number>>(
    (nextCounts, item) => {
      const bucket = normalizeMayaVerdict(item.verdict);
      if (bucket !== undefined) {
        nextCounts[bucket] += 1;
      }
      return nextCounts;
    },
    { invalid: 0, partial: 0, valid: 0 }
  );

  return [
    { count: worklist.length, key: "all", label: "All" },
    { count: counts.valid, key: "valid", label: "Valid" },
    { count: counts.invalid, key: "invalid", label: "Invalid" },
    { count: counts.partial, key: "partial", label: "Partial" }
  ];
}

export function overviewShortVerdictLabel(verdict: string | undefined, fallbackLabel: string): string {
  const bucket = normalizeMayaVerdict(verdict);
  if (bucket === "valid") {
    return "Valid";
  }
  if (bucket === "invalid") {
    return "Invalid";
  }
  if (bucket === "partial") {
    return "Partial";
  }

  return fallbackLabel.trim().length > 0 ? fallbackLabel : "Unavailable";
}

export function buildSourcePillState(sourceTiles: readonly MayaSourceTile[]): MayaSourcePillState {
  const connectedCount = sourceTiles.filter((source) => source.statusTone === "ready").length;
  const totalCount = sourceTiles.length;
  const isAllReady = totalCount > 0 && connectedCount === totalCount;

  return {
    connectedCount,
    isAllReady,
    label: "Ready sources",
    statusTone: isAllReady ? "ready" : "blocked",
    totalCount
  };
}

export function findContrastCase(
  worklist: readonly MayaWorklistItem[],
  selected: MayaWorklistItem | undefined
): MayaContrastCase | undefined {
  if (selected === undefined) {
    return undefined;
  }

  const selectedBucket = normalizeMayaVerdict(selected.verdict);
  const selectedFamily = contrastFamilyForWorkItem(selected);
  if (selectedBucket === undefined || selectedFamily === undefined) {
    return undefined;
  }

  const contrast = worklist.find((item) => {
    if (item.lineId === selected.lineId) {
      return false;
    }
    const bucket = normalizeMayaVerdict(item.verdict);
    const family = contrastFamilyForWorkItem(item);
    return bucket !== undefined && bucket !== selectedBucket && family?.key === selectedFamily.key;
  });

  if (contrast === undefined) {
    return undefined;
  }

  return {
    contrastReason: resolveMayaWorklistReason(contrast),
    familyLabel: selectedFamily.label,
    lineId: contrast.lineId,
    selectedReason: resolveMayaWorklistReason(selected),
    verdictLabel: contrast.verdictLabel,
    workItemLabel: contrast.workItemLabel
  };
}

export function buildAgentInvestigationTimelineSteps(
  input: BuildAgentInvestigationTimelineStepsInput
): MayaAgentInvestigationTimelineStep[] {
  const evidenceRecordIds = new Set(input.evidenceRecordIds);
  if (input.trace.length === 0) {
    return buildOvernightInvestigationTimelineSteps(input);
  }

  return input.trace.map((event, index) => {
    const isFinal = index === input.trace.length - 1;
    const citationRecordIds = dedupeStrings(event.recordIds.filter((recordId) => evidenceRecordIds.has(recordId)));
    return {
      agentName: event.agentName,
      citationRecordChips: buildCitedRecordChips(citationRecordIds, [], input.evidenceDocuments),
      citationRecordIds,
      didLine: event.label,
      foundLine: event.message.trim().length > 0 ? event.message : event.deterministicBasis,
      isFinal,
      key: `trace-${index.toString()}-${event.phase}-${event.label}`,
      phase: event.phase,
      sourceLabel: timelineSourceLabel(event),
      ...(event.toolName === undefined ? {} : { toolLabel: event.toolName }),
      ...(isFinal && input.verdict !== undefined ? { verdict: input.verdict } : {}),
      ...(isFinal && input.verdictLabel !== undefined ? { verdictLabel: input.verdictLabel } : {})
    };
  });
}

export interface MayaEvidenceFactCardGroup {
  cards: MayaEvidenceFactCard[];
  countLabel: string;
  label: string;
  lineId?: string;
}

/**
 * Partitions evidence cards by deduction line so a work item covering several lines does not
 * render a run of identically titled documents. Documents with no line — governed vector-store
 * hits are case-scoped rather than line-scoped — collect into a trailing case-wide group.
 */
export function groupEvidenceFactCardsByLine(
  documents: readonly MayaEvidenceDocument[]
): MayaEvidenceFactCardGroup[] {
  const groupsByLineId = new Map<string, MayaEvidenceFactCard[]>();
  const caseWideCards: MayaEvidenceFactCard[] = [];

  for (const document of documents) {
    const card = buildEvidenceFactCard(document);
    if (card.lineId === undefined) {
      caseWideCards.push(card);
      continue;
    }

    const existing = groupsByLineId.get(card.lineId);
    if (existing === undefined) {
      groupsByLineId.set(card.lineId, [card]);
      continue;
    }
    existing.push(card);
  }

  const lineGroups = [...groupsByLineId.entries()].map(([lineId, cards]) => ({
    cards,
    countLabel: evidenceDocumentCountLabel(cards.length),
    label: lineId,
    lineId
  }));

  return caseWideCards.length === 0
    ? lineGroups
    : [
        ...lineGroups,
        {
          cards: caseWideCards,
          countLabel: evidenceDocumentCountLabel(caseWideCards.length),
          label: "Case-wide evidence"
        }
      ];
}

function evidenceDocumentCountLabel(count: number): string {
  return count === 1 ? "1 document" : `${count.toString()} documents`;
}

export function buildEvidenceFactCard(document: MayaEvidenceDocument): MayaEvidenceFactCard {
  const rows = compactEvidenceFactRows([
    { label: "Document", value: buildEvidenceDocumentBusinessLabel(document) },
    { label: "Source", value: document.sourceLabel },
    { label: "Status", value: evidenceDocumentVisibleStatus(document) }
  ]);
  const provenanceRows = compactEvidenceFactRows([
    { label: "Summary", value: document.summary },
    { label: "Document ID", value: document.documentId },
    { label: "Type", value: evidenceDocumentTypeLabel(document.documentType) },
    { label: "Deduction line", value: document.lineId },
    { label: "Source record", value: document.sourceRecordId },
    { label: "Citation", value: document.citationId },
    { label: "Evidence record", value: document.evidenceId },
    { label: "Retrieved", value: document.retrievedAt ?? document.sourceFreshness },
    { label: "Receipt", value: document.receiptId },
    { label: "Content hash", value: document.contentHash },
    { label: "Receipt hash", value: document.receiptContentHash },
    { label: "Storage", value: document.storageUri },
    { label: "Basis", value: document.deterministicComparisonBasis ?? document.provenance.deterministicBasis }
  ]);
  const semanticRetrievalBadge = semanticRetrievalBadgeFromDocument(document);

  return {
    documentId: document.documentId,
    documentType: document.documentType,
    ...(document.summary.trim().length === 0 ? {} : { documentSummary: document.summary }),
    ...(document.storageHref === undefined ? {} : { documentHref: document.storageHref }),
    ...(document.lineId === undefined ? {} : { lineId: document.lineId }),
    provenanceRows,
    rows,
    ...(semanticRetrievalBadge === undefined ? {} : { semanticRetrievalBadge }),
    sourceLabel: document.sourceLabel,
    title: evidenceBusinessTitle(document),
    verificationLabel: evidenceDocumentVisibleStatus(document)
  };
}

export function semanticRetrievalBadgeFromDocument(document: MayaEvidenceDocument): string | undefined {
  if (document.retrieval?.provenance !== "openai-vector-store") {
    return undefined;
  }

  const scoreMatch = /\bscore\s+([01](?:\.\d+)?)\b/iu.exec(document.provenance.deterministicBasis);
  const scoreValue = scoreMatch?.[1] === undefined ? undefined : Number(scoreMatch[1]);
  if (scoreValue === undefined || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 1) {
    return undefined;
  }

  return `Semantic retrieval · score ${scoreValue.toFixed(2)}`;
}

export function buildEvidencePacketAvailabilityLabel(evidencePack: MayaEvidencePack): string {
  if (evidencePack.documents.length === 0 && evidencePack.recordIds.length === 0) {
    return "No evidence records";
  }

  return `${pluralizeCount(evidencePack.documents.length, "document")} / ${pluralizeCount(evidencePack.recordIds.length, "record")}`;
}

export function countEvidenceSourceLabels(documents: readonly MayaEvidenceDocument[]): number {
  return dedupeStrings(documents.map((document) => document.sourceLabel)).length;
}

export function buildVerdictLead(item: MayaWorklistItem): string {
  const bucket = normalizeMayaVerdict(item.verdict);
  if (bucket === "valid") {
    return `This deduction is ${item.verdictLabel}. Route to ${routeTargetLabel(item, "Billing")} - the customer's claim is supported by the evidence.`;
  }
  if (bucket === "invalid") {
    return `This deduction is ${item.verdictLabel}. Route to ${routeTargetLabel(item, "Recovery")} - the evidence does not support the customer's claim.`;
  }
  if (bucket === "partial") {
    return `This deduction is ${item.verdictLabel}. Split between Billing and Recovery - only part of the claim is supported.`;
  }

  return "Verdict unavailable. Keep this case in review until the source evidence returns a supported verdict.";
}

export function buildCitedRecordChips(
  evidenceRecordIds: readonly string[],
  preferredRecordIds: readonly string[] = [],
  evidenceDocuments: readonly MayaEvidenceDocument[] = []
): MayaCitedRecordChip[] {
  const allowed = new Set(dedupeStrings(evidenceRecordIds));
  const ordered = dedupeStrings([...preferredRecordIds, ...evidenceRecordIds]);
  return ordered
    .filter((recordId) => allowed.has(recordId))
    .map((recordId) => ({
      label: businessLabelForRecordId(recordId, evidenceDocuments),
      recordId
    }));
}

export function buildRoutingBanner(item: MayaWorklistItem): MayaRoutingBanner {
  const routeTarget = routeTargetLabel(item, item.routingLabel);
  return {
    amountLabel: item.amount,
    queueLabel: routeTarget,
    routeLine: item.recommendedActionLabel,
    title: `${item.verdictLabel.toUpperCase()} -> route to ${routeTarget}`,
    verdictLabel: item.verdictLabel
  };
}

export function buildOutcomeActionPackages(input: BuildOutcomeActionPackagesInput): MayaOutcomeActionPackage[] {
  const currentLineActions = input.actionInbox.filter((action) => action.lineId === input.selectedLineId);
  if (currentLineActions.length === 0) {
    return [
      {
        amount: input.draft.amount,
        basis: input.draft.basis,
        key: input.draft.actionId,
        lineId: input.selectedLineId,
        statusLabel: input.draft.statusLabel,
        title: input.draft.actionLabel
      }
    ];
  }

  return currentLineActions.map((action) => ({
    amount: action.amount,
    basis: action.basis ?? input.draft.basis,
    key: action.actionId,
    lineId: action.lineId,
    statusLabel: action.statusLabel ?? input.draft.statusLabel,
    title: action.actionLabel
  }));
}

export function deriveWorklistApprovalDisplay(
  item: MayaWorklistItem,
  locallyDecidedLineIds: readonly string[] = []
): MayaWorklistApprovalDisplay {
  if (item.approvalStatus === "human_decided") {
    return {
      isTerminal: true,
      label: item.approvalStatusLabel,
      status: "human_decided",
      title: item.approvalStatusLabel
    };
  }

  const itemLineIds = dedupeStrings(item.lineIds.length > 0 ? item.lineIds : [item.lineId]);
  const locallyDecided = itemLineIds.filter((lineId) => locallyDecidedLineIds.includes(lineId));
  if (locallyDecided.length === 0) {
    return {
      isTerminal: false,
      label: item.approvalStatusLabel,
      status: item.approvalStatus,
      title: item.approvalStatusLabel
    };
  }

  if (locallyDecided.length >= itemLineIds.length) {
    return {
      isTerminal: true,
      label: "Human decision recorded",
      status: "human_decided",
      title: `Human decision recorded for ${itemLineIds.join(", ")}.`
    };
  }

  return {
    isTerminal: false,
    label: `${locallyDecided.length.toString()}/${itemLineIds.length.toString()} lines decided`,
    status: "line_human_decided",
    title: `Human decision recorded for ${locallyDecided.join(", ")}. Group status remains ${item.approvalStatusLabel} until every line is decided.`
  };
}

export function buildDraftLetterPreview(input: BuildDraftLetterPreviewInput): MayaDraftLetterPreview | undefined {
  if (!deriveEmailRecipientGroups(input.workItem).includes(input.recipientGroup)) {
    return undefined;
  }

  const draft = buildEmailDraft({
    evidenceRecordIds: input.evidenceRecordIds,
    reason: input.reason,
    recipientGroup: input.recipientGroup,
    recommendedActionLabel: input.workItem.recommendedActionLabel,
    workItem: input.workItem
  });

  return {
    body: draft.body,
    recipientGroup: draft.recipientGroup,
    subject: draft.subject
  };
}

export function deriveEmailRecipientGroups(item: MayaWorklistItem): Array<"billing" | "recovery"> {
  const verdict = normalizeMayaVerdict(item.verdict);
  if (verdict === "valid") {
    return ["billing"];
  }
  if (verdict === "invalid") {
    return ["recovery"];
  }
  if (verdict === "partial") {
    return ["billing", "recovery"];
  }

  const action = item.recommendedActionLabel.toLowerCase();
  if (action.includes("billing") && action.includes("recovery")) {
    return ["billing", "recovery"];
  }
  if (action.includes("billing")) {
    return ["billing"];
  }
  if (action.includes("recovery")) {
    return ["recovery"];
  }

  return [];
}

export function buildCopilotSuggestions(worklist: readonly MayaWorklistItem[]): MayaCopilotSuggestion[] {
  const sorted = [...worklist].sort((left, right) => compareCents(readAmountForSort(right.amount), readAmountForSort(left.amount)));
  const invalid = sorted.find((item) => normalizeMayaVerdict(item.verdict) === "invalid");
  const valid = sorted.find((item) => normalizeMayaVerdict(item.verdict) === "valid");
  const partial = sorted.find((item) => normalizeMayaVerdict(item.verdict) === "partial");
  const picked = dedupeWorkItems([invalid, valid, partial, ...sorted]).slice(0, 3);

  return picked.map((item) => ({
    key: `suggestion-${item.lineId}`,
    label: item.customerLabel,
    question: `What evidence supports the ${item.verdictLabel} verdict for ${item.customerLabel}?`,
    recordIds: item.lineIds.length > 0 ? [...item.lineIds] : [item.lineId],
    supportLabel: `${item.amount} - ${resolveMayaWorklistReason(item)}`,
    targetLineId: item.lineId
  }));
}

export function buildOverviewCopilotPromptSuggestions(
  worklist: readonly MayaWorklistItem[],
  fallbackRecordIds: readonly string[]
): NonNullable<MayaQueryPromptDockContract["promptSuggestions"]> {
  void fallbackRecordIds;
  return buildCopilotSuggestions(worklist).map((suggestion) => ({
    label: suggestion.label,
    provenance: {
      deterministicBasis: `Overview prompt derived from Maya worklist row ${suggestion.recordIds.join(", ") || suggestion.label}.`,
      recordIds: [...suggestion.recordIds],
      sourceKind: "derived_backend",
      sourceName: "Maya worklist"
    },
    question: suggestion.question,
    recordIds: [...suggestion.recordIds],
    targetLineId: suggestion.targetLineId
  }));
}

export function resolveCopilotPromptCaseFocus(
  prompt: NonNullable<MayaQueryPromptDockContract["promptSuggestions"]>[number] | undefined,
  caseOptions: readonly MayaCopilotCaseOption[]
): string | undefined {
  const targetLineId = prompt?.targetLineId?.trim();
  if (targetLineId === undefined || targetLineId.length === 0) {
    return undefined;
  }

  return caseOptions.some((option) => option.lineId === targetLineId) ? targetLineId : undefined;
}

export function buildCopilotCaseOptions(worklist: readonly MayaWorklistItem[]): MayaCopilotCaseOption[] {
  return worklist.map((item) => ({
    customerLabel: item.customerLabel,
    label: `${item.customerLabel} - ${item.workItemLabel}`,
    lineId: item.lineId,
    recordIds: buildCaseScopedQueryRecordIds(item),
    workItem: item,
    workItemLabel: item.workItemLabel
  }));
}

export function buildCaseScopedQueryRecordIds(
  item: MayaWorklistItem,
  options: { selectedEvidenceRecordIds?: readonly string[] } = {}
): string[] {
  if ((options.selectedEvidenceRecordIds?.length ?? 0) > 0) {
    return dedupeQueryableRecordIds(options.selectedEvidenceRecordIds ?? []);
  }
  const lineIds = item.lineIds.length > 0 ? item.lineIds : [item.lineId];
  return dedupeQueryableRecordIds([...lineIds, ...item.provenance.recordIds, ...(options.selectedEvidenceRecordIds ?? [])]);
}

export function buildConductorSummary(input: MayaConductorSummaryInput): string {
  const sourceLabels = dedupeStrings(input.evidenceDocuments.map((document) => document.sourceLabel));
  const selectedLineLabel = humanizeConductorSubjectLabel(input.selectedLineLabel);
  const subjectParts = [
    selectedLineLabel,
    input.customerLabel?.trim()
  ].filter((part): part is string => part !== undefined && part.length > 0);
  const focus = deriveCopilotQuestionFocus(input.question, input.evidenceDocuments);
  const sentences: string[] = [];

  if (subjectParts.length > 0) {
    sentences.push(`Re-checking the overnight verdict for ${subjectParts.join(" - ")} — pulling the cited evidence.`);
  }

  if (input.question?.trim().length) {
    sentences.push(buildConductorFocusSentence(focus, input.queryScope));
  }

  if (sourceLabels.length > 0) {
    sentences.push(`Sources in scope: ${formatSourceList(sourceLabels)}.`);
  }

  return sentences.length === 0 ? "Conductor is checking cited evidence." : sentences.join(" ");
}

function humanizeConductorSubjectLabel(label: string | undefined): string | undefined {
  const trimmed = label?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return looksLikeBackendRecordId(trimmed) ? "selected deduction" : trimmed;
}

function looksLikeBackendRecordId(value: string): boolean {
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u.test(value);
}

export function buildAgentChecklistRows(input: {
  evidenceDocuments: readonly MayaEvidenceDocument[];
  fallbackAgentNames: readonly string[];
  message?: string;
  question?: string;
  status: QueryEvidenceResponse["status"] | undefined;
  trace: readonly QueryEvidenceResponse["trace"][number][];
}): MayaAgentChecklistRow[] {
  const focus = deriveCopilotQuestionFocus(input.question, input.evidenceDocuments);
  const labels = buildChecklistLabels(focus);
  const isBlocked = input.status === "blocked";
  const isStopped = isBlocked && input.message?.startsWith("Query stopped;") === true;
  const isAnswered = input.status === "answered";
  const completedPhases = new Set(
    input.trace.filter((event) => event.hook === "agent_end").map((event) => event.phase)
  );
  const phaseStates: MayaAgentChecklistRow["state"][] = [
    isStopped
      ? "stopped"
      : isBlocked
      ? "blocked"
      : isAnswered || completedPhases.has("supervisor") || completedPhases.has("query")
        ? "complete"
        : "running",
    isStopped ? "stopped" : isBlocked ? "blocked" : isAnswered || completedPhases.has("retrieval") ? "complete" : "running",
    isStopped ? "stopped" : isBlocked ? "blocked" : isAnswered || completedPhases.has("decision") ? "complete" : "running"
  ];
  const rows = labels.map((agentName, index) => ({
    agentName,
    key: `agent-${agentName}`,
    state: phaseStates[index] ?? "running"
  }));

  if (rows.length > 0) {
    return rows;
  }

  return dedupeStrings(input.fallbackAgentNames).map((agentName) => ({
    agentName,
    key: `agent-${agentName}`,
    state: isStopped ? "stopped" : isBlocked ? "blocked" : isAnswered ? "complete" : "running"
  }));
}

export function buildConductorRunningLine(input: {
  evidenceDocuments: readonly MayaEvidenceDocument[];
  question?: string;
  queryScope?: "line" | "workspace";
}): string {
  const focus = deriveCopilotQuestionFocus(input.question, input.evidenceDocuments);
  const scopePhrase = input.queryScope === "workspace" ? "the workspace evidence packet" : "this selected case";
  switch (focus) {
    case "approval_gate":
      return `Maya is checking evidence behind the current route and human approval gate for ${scopePhrase}.`;
    case "route":
      return `Maya is checking evidence behind the current route for ${scopePhrase}.`;
    case "sap":
      return `Maya is checking evidence from SAP OData for ${scopePhrase}.`;
    case "contract":
      return `Maya is checking evidence from the contract packet for ${scopePhrase}.`;
    case "tpm":
      return `Maya is checking evidence from TPM for ${scopePhrase}.`;
    case "pod":
      return `Maya is checking evidence from proof of delivery for ${scopePhrase}.`;
    case "remittance":
      return `Maya is checking evidence from remittance for ${scopePhrase}.`;
    case "carrier":
      return `Maya is checking evidence from carrier records for ${scopePhrase}.`;
    case "general":
      return `Maya is checking evidence for ${scopePhrase}.`;
  }
}

export function buildCopilotVerdictBand(input: {
  basis: string;
  workItem: MayaWorklistItem;
}): MayaCopilotVerdictBand {
  const bucket = normalizeMayaVerdict(input.workItem.verdict);
  return {
    actionLabel: input.workItem.recommendedActionLabel,
    amountLabel: input.workItem.amount,
    basis: input.basis,
    routeLabel: routeTargetLabel(input.workItem, input.workItem.routingLabel),
    tone: bucket ?? "unknown",
    verdictLabel: input.workItem.verdictLabel
  };
}

export function buildCopilotDrawerTrigger(label: string, value: string): string {
  return `${label.trim()} · ${value.trim()}`;
}

export function buildQueryEvidenceSnapshot(input: BuildQueryEvidenceSnapshotInput): QueryEvidenceResponse {
  const citedRecordIds = dedupeStrings(input.response.citations.map((citation) => citation.recordId));
  const selectedScopeRecordIds =
    input.queryScope === "workspace"
      ? dedupeStrings([...input.recordIds, ...input.evidencePackRecordIds])
      : dedupeStrings([input.selectedLine, ...input.recordIds, ...input.evidencePackRecordIds]);
  const selectedScope = new Set(selectedScopeRecordIds);
  const citationsWithinSelectedScope = input.response.citations.every((citation) =>
    selectedScope.has(citation.recordId.trim())
  );
  const citationsHaveBasis = input.response.citations.every((citation) => citation.deterministicBasis.trim().length > 0);
  const workspaceHasLiveMcpProof =
    input.queryScope !== "workspace" ||
    (input.response.modelExecution?.mode === "live_openai_agents" &&
      "sourceReadMode" in input.response.modelExecution);
  const blockedRecordIds = dedupeStrings([...citedRecordIds, ...selectedScopeRecordIds]);
  const hasAnswer =
    input.response.answer !== undefined &&
    input.response.answer.trim().length > 0 &&
    input.response.deterministicBasis !== undefined &&
    input.response.deterministicBasis.trim().length > 0 &&
    input.response.citations.length > 0 &&
    input.response.trace.length > 0 &&
    citationsWithinSelectedScope &&
    citationsHaveBasis &&
    workspaceHasLiveMcpProof;
  let message = "Forensics query returned no cited answer.";
  if (hasAnswer) {
    message = input.queryScope === "workspace" ? "Cited answer returned from workspace evidence." : "Cited answer returned from selected evidence.";
  } else if (!citationsWithinSelectedScope) {
    message = "Forensics query cited records outside the selected evidence packet.";
  } else if (
    input.response.modelExecution !== undefined &&
    input.response.modelExecution.mode !== "live_openai_agents" &&
    input.response.modelExecution.mode !== "live_realtime_tool_bridge" &&
    "reason" in input.response.modelExecution &&
    input.response.modelExecution.reason.trim().length > 0
  ) {
    message = input.response.modelExecution.reason;
  }
  const modelExecutionField =
    input.response.modelExecution === undefined ? {} : { modelExecution: input.response.modelExecution };

  if (hasAnswer && input.response.answer !== undefined && input.response.deterministicBasis !== undefined) {
    return {
      ...modelExecutionField,
      answer: input.response.answer,
      citations: input.response.citations,
      deterministicBasis: input.response.deterministicBasis,
      message,
      recordIds: citedRecordIds,
      status: "answered",
      trace: input.response.trace
    };
  }

  return {
    ...modelExecutionField,
    citations: input.response.citations,
    message,
    recordIds: blockedRecordIds,
    status: "blocked",
    trace: input.response.trace
  };
}

export function deriveDecisionFlowSteps(input: BuildDecisionFlowStepsInput): MayaDecisionFlowStep[] {
  const hasScenario = input.workItem !== undefined || input.detail?.selected.lineId !== undefined;
  const hasAgents = (input.detail?.selected.evidencePack.documents.length ?? 0) > 0;
  const hasVerdict = input.workItem?.verdictLabel !== undefined || input.detail?.selected.draft.basis !== undefined;
  const hasAction = input.detail?.recommendedAction.actionLabel !== undefined || input.detail?.selected.draft.actionLabel !== undefined;
  const approvalDone = input.approvalResponse?.status === "human_decided" || input.detail?.approvalReceipt?.status === "human_decided";

  const states = [
    hasScenario,
    hasAgents,
    hasVerdict,
    hasAction,
    approvalDone
  ].map((done, index, values) => {
    if (done) {
      return "done" as const;
    }
    const previousComplete = values.slice(0, index).every(Boolean);
    return previousComplete ? "current" as const : "pending" as const;
  });

  return [
    {
      key: "scenario",
      label: "Scenario",
      state: states[0] ?? "pending",
      supportLabel: input.workItem?.deductionReason ?? input.detail?.selected.lineId ?? "Scenario unavailable"
    },
    {
      key: "agents",
      label: "Agents investigate",
      state: states[1] ?? "pending",
      supportLabel: hasAgents ? `${String(input.detail?.selected.evidencePack.documents.length ?? 0)} evidence documents` : "Evidence pending"
    },
    {
      key: "verdict",
      label: "Verdict",
      state: states[2] ?? "pending",
      supportLabel: input.workItem?.verdictLabel ?? "Verdict pending"
    },
    {
      key: "action",
      label: "Action",
      state: states[3] ?? "pending",
      supportLabel: input.detail?.recommendedAction.actionLabel ?? input.workItem?.recommendedActionLabel ?? "Action pending"
    },
    {
      key: "approval",
      label: "Your approval",
      state: states[4] ?? "pending",
      supportLabel: approvalDone ? "Human decision recorded" : input.detail?.auditState.statusLabel ?? "Awaiting human approval"
    }
  ];
}

export function buildEmailDraft(input: BuildEmailDraftInput): MayaEmailDraft {
  const recipientLabel = input.recipientGroup === "billing" ? "Billing" : "Recovery";
  const subject = `[Recoup] ${recipientLabel} review for ${input.workItem.customerLabel} - ${input.workItem.workItemLabel}`;
  const citedRecordCount = dedupeStrings(input.evidenceRecordIds).length;
  const citedRecordsLabel =
    citedRecordCount === 0 ? "Unavailable" : `${String(citedRecordCount)} records attached in the evidence packet`;
  const reason = displaySafeBusinessReason(input.reason);

  return {
    body: [
      `Team ${recipientLabel},`,
      "",
      `Maya reviewed ${input.workItem.customerLabel} deduction for ${input.workItem.workItemLabel}.`,
      `Amount: ${input.workItem.amount}`,
      `Case lines: ${String(input.workItem.lineCount)} ${input.workItem.lineCount === 1 ? "line" : "lines"} in scope`,
      `Verdict: ${input.workItem.verdictLabel}`,
      `Reason: ${reason}`,
      `Recommended action: ${input.recommendedActionLabel}`,
      `Cited records: ${citedRecordsLabel}`,
      "",
      "Please review and proceed according to the approved Recoup action."
    ].join("\n"),
    recipientGroup: input.recipientGroup,
    subject
  };
}

export function resolveMayaWorklistReason(item: MayaWorklistItem): string {
  return resolveMayaWorklistReasonDetail(item).text;
}

export function resolveMayaWorklistReasonDetail(
  item: MayaWorklistItem,
  options: { deterministicBasis?: string } = {}
): MayaResolvedWorklistReason {
  const reason = readWorklistString(item, "reason");
  if (reason !== undefined) {
    const source = readWorklistString(item, "reasonSource") ?? readWorklistString(item, "reason_source");
    return {
      ...reasonMetadataFields(item),
      source: source === "llm" ? "llm" : "deterministic_fallback",
      sourceLabel: source === "llm" ? "Stored narrative" : "Deterministic fallback",
      text: displaySafeBusinessReason(reason)
    };
  }

  const narrative = readWorklistString(item, "reasonNarrative") ?? readWorklistString(item, "reason_narrative");
  if (narrative !== undefined) {
    const source = readWorklistString(item, "reasonSource") ?? readWorklistString(item, "reason_source");
    return {
      ...reasonMetadataFields(item),
      source: source === "deterministic_fallback" ? "deterministic_fallback" : "llm",
      sourceLabel: source === "deterministic_fallback" ? "Deterministic fallback" : "Stored narrative",
      text: displaySafeBusinessReason(narrative)
    };
  }

  const deterministicBasis = options.deterministicBasis?.trim();
  if (deterministicBasis !== undefined && deterministicBasis.length > 0) {
    return {
      source: "deterministic_basis",
      sourceLabel: "Deterministic basis",
      text: deterministicBasis
    };
  }

  return {
    source: "deduction_reason",
    sourceLabel: "Deduction reason",
    text: item.deductionReason
  };
}

function displaySafeBusinessReason(value: string): string {
  const stripped = value.replace(/^\s*Line\s+[A-Z0-9:_-]+(?:\s+\([^)]+\))?\s*:\s*/iu, "").trim();
  return stripped.length > 0 ? stripped : value;
}

export function parseReadModelAmount(value: string): MoneyCents | undefined {
  return parseAmountToCents(value);
}

export function formatDollarAmount(cents: MoneyCents): string {
  const isNegative = cents < zeroCents;
  const absolute = isNegative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const wholeLabel = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",");

  return `${isNegative ? "-" : ""}$${wholeLabel}.${fraction}`;
}

function amountLabelForAggregate(aggregate: AmountAggregate): string {
  return aggregate.unavailableCount === 0 ? formatDollarAmount(aggregate.total) : "Amount unavailable";
}

function shareOfRunLabel(aggregate: AmountAggregate, total: AmountAggregate): string | undefined {
  if (aggregate.unavailableCount > 0 || total.unavailableCount > 0 || total.total <= zeroCents) {
    return undefined;
  }

  const share = Number((aggregate.total * 100n + total.total / 2n) / total.total);
  return `${share.toString()}% of run value`;
}

function sumAmounts(worklist: readonly MayaWorklistItem[]): AmountAggregate {
  return worklist.reduce<AmountAggregate>(
    (aggregate, item) => {
      const amount = parseAmountToCents(item.amount);
      if (amount === undefined) {
        return { total: aggregate.total, unavailableCount: aggregate.unavailableCount + 1 };
      }

      return { total: aggregate.total + amount, unavailableCount: aggregate.unavailableCount };
    },
    { total: zeroCents, unavailableCount: 0 }
  );
}

function readAmountForSort(value: string): MoneyCents {
  return parseAmountToCents(value) ?? zeroCents;
}

function parseAmountToCents(value: string): MoneyCents | undefined {
  const trimmed = value.trim();
  const match = /^\$?\s*(-?\d[\d,]*)(?:\.(\d{1,2}))?$/u.exec(trimmed);
  if (match === null) {
    return undefined;
  }

  const whole = match[1]?.replaceAll(",", "");
  if (whole === undefined) {
    return undefined;
  }

  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(fraction);
}

function compareCents(left: MoneyCents, right: MoneyCents): number {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function contrastFamilyForWorkItem(item: MayaWorklistItem): { key: string; label: string } | undefined {
  const sourceText = `${item.deductionReason} ${resolveMayaWorklistReason(item)} ${item.workItemLabel}`.trim();
  const acronym = /\b[A-Z]{2,}\b/u.exec(sourceText)?.[0];
  if (acronym !== undefined) {
    return { key: acronym.toLowerCase(), label: acronym };
  }

  const words = item.deductionReason.match(/[a-z0-9]+/giu)?.map((word) => word.toLowerCase()) ?? [];
  const familyWords = words.filter((word) => !contrastFamilyStopWords.has(word)).slice(0, 2);
  if (familyWords.length === 0) {
    return undefined;
  }

  return {
    key: familyWords.join("-"),
    label: familyWords.map(toTitleCase).join(" ")
  };
}

const contrastFamilyStopWords = new Set(["a", "and", "claim", "per", "the", "with"]);

function toTitleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function timelineSourceLabel(event: QueryEvidenceResponse["trace"][number]): string {
  if (event.retrievalSource === "sap_odata" || event.sourceKind === "sap_odata") {
    return "SAP OData";
  }
  if (event.retrievalSource === "supabase" || event.sourceKind === "supabase") {
    return "Supabase";
  }
  if (event.retrievalSource === "source_backed" || event.sourceKind === "derived_backend") {
    return "Source-backed";
  }
  if (event.sourceKind === "operator_session") {
    return "Operator session";
  }

  return "Agent trace";
}

function buildOvernightInvestigationTimelineSteps(
  input: BuildAgentInvestigationTimelineStepsInput
): MayaAgentInvestigationTimelineStep[] {
  const evidenceDocuments = input.evidenceDocuments ?? [];
  const recordIds = new Set(input.evidenceRecordIds);
  const documentRecordIds = dedupeStrings(
    evidenceDocuments.flatMap((document) => [
      document.documentId,
      document.evidenceId ?? "",
      document.sourceRecordId ?? "",
      ...document.provenance.recordIds
    ])
  ).filter((recordId) => recordIds.has(recordId) || recordIds.size === 0);
  const citedRecordIds = documentRecordIds.length > 0 ? documentRecordIds : dedupeStrings(input.evidenceRecordIds);
  const sourceLabels = dedupeStrings(evidenceDocuments.map((document) => document.sourceLabel));
  const documentTypes = dedupeStrings(evidenceDocuments.map((document) => evidenceDocumentTypeLabel(document.documentType)));
  const retrievalSourceLabel = sourceLabels.length > 0 ? formatSourceList(sourceLabels) : "Evidence read model";
  const documentTypeLabel = documentTypes.length > 0 ? formatSourceList(documentTypes) : "Evidence documents";
  const reason = input.reason?.trim();
  const actionLabel = input.recommendedActionLabel?.trim();
  const steps: MayaAgentInvestigationTimelineStep[] = [];

  if (evidenceDocuments.length > 0 || citedRecordIds.length > 0) {
    steps.push({
      agentName: "Forensics Retrieval",
      citationRecordChips: buildCitedRecordChips(citedRecordIds, citedRecordIds, evidenceDocuments),
      citationRecordIds: citedRecordIds.slice(0, 6),
      didLine: `Read ${pluralizeCount(evidenceDocuments.length, "evidence document")}`,
      foundLine: `${documentTypeLabel} from ${retrievalSourceLabel}`,
      isFinal: false,
      key: "overnight-retrieval",
      phase: "retrieval",
      sourceLabel: retrievalSourceLabel,
      toolLabel: "Evidence retrieval"
    });
  }

  steps.push({
    agentName: "Forensics Investigator",
    citationRecordChips: buildCitedRecordChips(citedRecordIds, citedRecordIds, evidenceDocuments),
    citationRecordIds: citedRecordIds.slice(0, 6),
    didLine: "Checked deterministic rule basis",
    foundLine: reason !== undefined && reason.length > 0 ? reason : "Rule basis returned from the settlement read model.",
    isFinal: false,
    key: "overnight-rule-basis",
    phase: "decision",
    sourceLabel: "Deterministic receipt",
    toolLabel: "Deterministic verdict"
  });

  steps.push({
    agentName: "Recovery Drafter",
    citationRecordChips: buildCitedRecordChips(citedRecordIds, citedRecordIds, evidenceDocuments),
    citationRecordIds: citedRecordIds.slice(0, 6),
    didLine: "Prepared gated route",
    foundLine:
      reason !== undefined && reason.length > 0 && input.verdictLabel !== undefined
        ? `${reason} -> ${input.verdictLabel}`
        : actionLabel !== undefined && actionLabel.length > 0
          ? actionLabel
          : "Recommended action returned from the case record.",
    isFinal: input.verdict !== undefined || input.verdictLabel !== undefined,
    key: "overnight-route",
    phase: "action",
    sourceLabel: "Action read model",
    toolLabel: "Prepared action",
    ...(input.verdict === undefined ? {} : { verdict: input.verdict }),
    ...(input.verdictLabel === undefined ? {} : { verdictLabel: input.verdictLabel })
  });

  return steps;
}

function evidenceBusinessTitle(document: MayaEvidenceDocument): string {
  const source = document.sourceLabel.trim();
  const sourceSuffix = source.length > 0 ? ` · ${source}` : "";
  return `${buildEvidenceDocumentBusinessLabel(document)}${sourceSuffix}`;
}

export function buildEvidenceDocumentBusinessLabel(document: MayaEvidenceDocument): string {
  const type = document.documentType.toLowerCase();
  const typeParts = type.split(/[_-]+/u).filter((part) => part.length > 0);
  const invoiceNumber = extractInvoiceNumber(document.sourceRecordId) ?? extractInvoiceNumber(document.documentId);

  if (type.includes("invoice")) {
    return invoiceNumber === undefined ? "Invoice" : `Invoice ${invoiceNumber}`;
  }
  if (type.includes("credit")) {
    return invoiceNumber === undefined ? "Credit memo" : `Credit memo ${invoiceNumber}`;
  }
  if (type.includes("pod")) {
    return "Signed POD";
  }
  if (type.includes("photo")) {
    return "Carrier photo";
  }
  if (type.includes("carrier") || type.includes("damage")) {
    return "Carrier report";
  }
  if (type.includes("remittance") || type.includes("edi")) {
    return "Remittance advice";
  }
  if (type.includes("contract") || type.includes("sla")) {
    return "Contract terms";
  }
  if (type.includes("tpm") || type.includes("promo") || type.includes("accrual")) {
    return "Promotion support";
  }
  if (type.includes("customer") || typeParts.includes("po")) {
    return "Customer PO";
  }
  if (type.includes("bureau")) {
    return "Bureau alert";
  }
  if (type.includes("payment")) {
    return "Payment history";
  }

  const typeLabel = evidenceDocumentTypeLabel(document.documentType).trim();
  return typeLabel.length > 0 ? typeLabel : "Evidence document";
}

function evidenceDocumentVisibleStatus(document: MayaEvidenceDocument): string {
  const verifiedLabel = document.verifiedLabel.trim();
  if (verifiedLabel.length > 0) {
    return verifiedLabel;
  }

  return document.sourceFreshness?.trim().length ? "Source retrieved" : "Source available";
}

function businessLabelForRecordId(recordId: string, evidenceDocuments: readonly MayaEvidenceDocument[]): string {
  const document = evidenceDocuments.find((candidate) => documentReferencesRecord(candidate, recordId));
  if (document !== undefined) {
    return buildEvidenceDocumentBusinessLabel(document);
  }

  if (/^S\d+-L\d+$/iu.test(recordId)) {
    return "Case line";
  }
  if (/^SAP-/iu.test(recordId)) {
    const invoiceNumber = extractInvoiceNumber(recordId);
    return invoiceNumber === undefined ? "SAP record" : `Invoice ${invoiceNumber}`;
  }
  if (/^CLAIM-/iu.test(recordId)) {
    return "Claim packet";
  }
  if (/^RECON-/iu.test(recordId)) {
    return "Decision receipt";
  }
  if (/^TOOLS-DATA(?::|-)/iu.test(recordId)) {
    return "Source readiness record";
  }

  return "Cited record";
}

function documentReferencesRecord(document: MayaEvidenceDocument, recordId: string): boolean {
  return [
    document.documentId,
    document.evidenceId,
    document.sourceRecordId,
    document.receiptId,
    ...document.provenance.recordIds
  ]
    .filter((value): value is string => value !== undefined)
    .some((value) => value === recordId);
}

function extractInvoiceNumber(value: string | undefined): string | undefined {
  const match = /\b(\d{6,})\b/u.exec(value ?? "");
  return match?.[1];
}

function evidenceDocumentTypeLabel(documentType: string): string {
  return documentType
    .split(/[_-]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function compactEvidenceFactRows(rows: Array<{ label: string; value: string | undefined }>): MayaEvidenceFactRow[] {
  return rows.filter((row): row is MayaEvidenceFactRow => row.value !== undefined && row.value.trim().length > 0);
}

function pluralizeCount(count: number, noun: string): string {
  return `${count.toString()} ${noun}${count === 1 ? "" : "s"}`;
}

function formatSourceList(sourceLabels: readonly string[]): string {
  const shown = sourceLabels.slice(0, 4);
  const hiddenCount = sourceLabels.length - shown.length;
  return hiddenCount > 0 ? `${shown.join(", ")}, +${hiddenCount.toString()} more` : shown.join(", ");
}

const COPILOT_SOURCE_FOCUS_PATTERNS: ReadonlyArray<{
  focus: Exclude<MayaCopilotQuestionFocus, "approval_gate" | "general" | "route">;
  patterns: readonly RegExp[];
}> = [
  {
    focus: "sap",
    patterns: [/\bsap(?:\s+odata)?\b/iu, /\bodata\b/iu]
  },
  {
    focus: "contract",
    patterns: [/\bcontract(?:\s+(?:evidence|packet|repo))?\b/iu, /\bsla\b/iu]
  },
  {
    focus: "tpm",
    patterns: [/\btpm\b/iu, /\btrade promotion\b/iu]
  },
  {
    focus: "pod",
    patterns: [/\bpod\b/iu, /\bproof of delivery\b/iu]
  },
  {
    focus: "remittance",
    patterns: [/\bremittance\b/iu]
  },
  {
    focus: "carrier",
    patterns: [/\bcarrier (?:evidence|record|records|report|reports)\b/iu, /\bphoto evidence\b/iu]
  }
];

const COPILOT_APPROVAL_GATE_PATTERNS: readonly RegExp[] = [
  /\bapproval gate\b/iu,
  /\bhuman approval\b/iu,
  /\bapproval review\b/iu,
  /\breviewer\b/iu
];

const COPILOT_ROUTE_PATTERNS: readonly RegExp[] = [
  /\bcurrent route\b/iu,
  /\broute(?:\s+to)?\b/iu,
  /\brouting\b/iu,
  /\brecommended action\b/iu
];

function deriveCopilotQuestionFocus(
  question: string | undefined,
  evidenceDocuments: readonly MayaEvidenceDocument[]
): MayaCopilotQuestionFocus {
  const normalizedQuestion = question?.trim() ?? "";
  if (normalizedQuestion.length === 0) {
    return "general";
  }

  let requestedSourceFocus: MayaCopilotQuestionFocus | undefined;
  for (const matcher of COPILOT_SOURCE_FOCUS_PATTERNS) {
    if (matchesAnyPattern(normalizedQuestion, matcher.patterns)) {
      requestedSourceFocus = matcher.focus;
      break;
    }
  }

  if (
    requestedSourceFocus !== undefined &&
    evidenceDocumentsSupportFocus(requestedSourceFocus, evidenceDocuments)
  ) {
    return requestedSourceFocus;
  }

  if (matchesAnyPattern(normalizedQuestion, COPILOT_APPROVAL_GATE_PATTERNS)) {
    return "approval_gate";
  }

  if (matchesAnyPattern(normalizedQuestion, COPILOT_ROUTE_PATTERNS)) {
    return "route";
  }

  return "general";
}

function evidenceDocumentsSupportFocus(
  focus: MayaCopilotQuestionFocus,
  evidenceDocuments: readonly MayaEvidenceDocument[]
): boolean {
  if (evidenceDocuments.length === 0) {
    return false;
  }

  return evidenceDocuments.some((document) => evidenceDocumentSupportsFocus(document, focus));
}

function evidenceDocumentSupportsFocus(
  document: MayaEvidenceDocument,
  focus: MayaCopilotQuestionFocus
): boolean {
  const sourceLabel = document.sourceLabel.trim().toLowerCase();
  const documentType = document.documentType.trim().toLowerCase();

  switch (focus) {
    case "sap":
      return sourceLabel.includes("sap") || documentType === "sap_invoice";
    case "contract":
      return sourceLabel.includes("contract") || documentType.startsWith("contract_");
    case "tpm":
      return sourceLabel.includes("tpm") || documentType.startsWith("tpm_");
    case "pod":
      return sourceLabel.includes("pod") || sourceLabel.includes("proof of delivery") || documentType === "pod";
    case "remittance":
      return sourceLabel.includes("remittance") || documentType === "remittance_advice";
    case "carrier":
      return sourceLabel.includes("carrier") || documentType === "carrier_damage_report" || documentType === "carrier_photo";
    case "approval_gate":
    case "route":
    case "general":
      return true;
  }
}

function buildConductorFocusSentence(
  focus: MayaCopilotQuestionFocus,
  queryScope: "line" | "workspace" | undefined
): string {
  const scopePhrase = queryScope === "workspace" ? "the workspace evidence packet" : "this selected case";
  switch (focus) {
    case "approval_gate":
      return `Conductor is checking the current route and human approval gate for ${scopePhrase}.`;
    case "route":
      return `Conductor is checking the current route and cited basis for ${scopePhrase}.`;
    case "sap":
      return `Conductor is checking the SAP OData evidence returned for ${scopePhrase}.`;
    case "contract":
      return `Conductor is checking the contract evidence returned for ${scopePhrase}.`;
    case "tpm":
      return `Conductor is checking the TPM evidence returned for ${scopePhrase}.`;
    case "pod":
      return `Conductor is checking the proof of delivery evidence returned for ${scopePhrase}.`;
    case "remittance":
      return `Conductor is checking the remittance evidence returned for ${scopePhrase}.`;
    case "carrier":
      return `Conductor is checking the carrier evidence returned for ${scopePhrase}.`;
    case "general":
      return "Conductor is checking cited evidence.";
  }
}

function buildChecklistLabels(focus: MayaCopilotQuestionFocus): readonly string[] {
  switch (focus) {
    case "approval_gate":
      return ["Case scope confirmed", "Route evidence checked", "Human approval gate verified"];
    case "route":
      return ["Case scope confirmed", "Route evidence checked", "Deterministic basis verified"];
    case "sap":
      return ["Case scope confirmed", "SAP OData evidence checked", "Deterministic basis verified"];
    case "contract":
      return ["Case scope confirmed", "Contract evidence checked", "Deterministic basis verified"];
    case "tpm":
      return ["Case scope confirmed", "TPM evidence checked", "Deterministic basis verified"];
    case "pod":
      return ["Case scope confirmed", "Proof of delivery checked", "Deterministic basis verified"];
    case "remittance":
      return ["Case scope confirmed", "Remittance evidence checked", "Deterministic basis verified"];
    case "carrier":
      return ["Case scope confirmed", "Carrier evidence checked", "Deterministic basis verified"];
    case "general":
      return ["Case scope confirmed", "Cited evidence checked", "Deterministic basis verified"];
  }
}

function matchesAnyPattern(input: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function routeTargetLabel(item: MayaWorklistItem, fallback: string): string {
  const routing = item.routing?.toLowerCase() ?? "";
  if (routing.includes("billing") && routing.includes("recovery")) {
    return "Billing and Recovery";
  }
  if (routing.includes("billing")) {
    return "Billing";
  }
  if (routing.includes("recovery")) {
    return "Recovery";
  }
  if (routing.includes("partial") || routing.includes("split")) {
    return "Billing and Recovery";
  }

  const queueLabel = item.queueLabel.trim();
  if (queueLabel.length > 0 && queueLabel.toLowerCase() !== "review") {
    return queueLabel;
  }

  const routingLabel = item.routingLabel.trim();
  if (routingLabel.length > 0 && routingLabel.toLowerCase() !== "review") {
    return routingLabel;
  }

  const recommendedAction = item.recommendedActionLabel.toLowerCase();
  if (recommendedAction.includes("billing") && recommendedAction.includes("recovery")) {
    return "Billing and Recovery";
  }
  if (recommendedAction.includes("billing")) {
    return "Billing";
  }
  if (recommendedAction.includes("recovery")) {
    return "Recovery";
  }

  return fallback;
}

function reasonMetadataFields(
  item: MayaWorklistItem
): Pick<MayaResolvedWorklistReason, "factHash" | "generatedAtIso" | "model"> {
  const factHash = readWorklistString(item, "reasonFactHash") ?? readWorklistString(item, "reason_fact_hash");
  const generatedAtIso = readWorklistString(item, "reasonGeneratedAt") ?? readWorklistString(item, "reason_generated_at");
  const model = readWorklistString(item, "reasonModel") ?? readWorklistString(item, "reason_model");

  return {
    ...(factHash === undefined ? {} : { factHash }),
    ...(generatedAtIso === undefined ? {} : { generatedAtIso }),
    ...(model === undefined ? {} : { model })
  };
}

function readWorklistString(item: MayaWorklistItem, key: string): string | undefined {
  const value = (item as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function dedupeWorkItems(items: Array<MayaWorklistItem | undefined>): MayaWorklistItem[] {
  const seen = new Set<string>();
  const deduped: MayaWorklistItem[] = [];
  for (const item of items) {
    if (item === undefined || seen.has(item.lineId)) {
      continue;
    }
    seen.add(item.lineId);
    deduped.push(item);
  }

  return deduped;
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function dedupeQueryableRecordIds(values: readonly string[]): string[] {
  return dedupeStrings(values).filter((value) => !isProviderFileRecordId(value));
}

function isProviderFileRecordId(value: string): boolean {
  return value.startsWith("file-");
}
