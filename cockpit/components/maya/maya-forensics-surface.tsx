"use client";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  FileSearchIcon,
  FlaskConicalIcon,
  FolderSearchIcon,
  MessageCircleIcon,
  RotateCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  SquareSplitHorizontalIcon,
  UserRoundCheckIcon,
  XCircleIcon,
  XIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { DeductionCaseWorkspace } from "./deduction-case-workspace.tsx";
import { DeductionWorklistTable } from "./deduction-worklist-table.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { MayaWorkspaceShell } from "./maya-workspace-shell.tsx";
import { QueryEvidenceDock } from "./query-evidence-dock.tsx";
import { SourceReadinessStrip } from "./source-readiness-strip.tsx";
import {
  buildCopilotCaseOptions,
  buildCopilotSuggestions,
  buildOverviewVerdictFilterOptions,
  buildOverviewSummaryCards,
  buildSourcePillState,
  normalizeMayaVerdict,
  overviewCardVisualKey,
  overviewShortVerdictLabel,
  resolveMayaWorklistReason,
  type MayaOverviewCardVisualKey,
  type MayaOverviewVerdictFilter
} from "./maya-workspace-derived.ts";
import { verdictBadgeVariant } from "./verdict-badge-variant.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  beginWorkItemDetailRequest,
  cancelWorkItemDetailRequest,
  isCurrentWorkItemDetailRequest
} from "./work-item-detail-request-gate.ts";
import type {
  MayaForensicsSurfaceProps,
  MayaQueryPromptDockContract,
  MayaSourceTile,
  MayaSurfaceSection,
  MayaWorkItemDetail,
  MayaWorklistItem,
  QueryEvidenceResponse
} from "./types.ts";
import { mayaAccent } from "./maya-accent.ts";

const missingBeatTwelveFields = [
  "Priority",
  "Age",
  "Status history",
  "Last updated",
  "Server pagination",
  "Audit receipt",
  "Next-case ranking"
] as const;
const mayaSelectedRowClass =
  "data-[selected=true]:bg-[color:var(--maya-accent-surface-strong)] data-[selected=true]:shadow-[var(--shadow-sm)] data-[selected=true]:ring-1 data-[selected=true]:ring-[color:var(--maya-accent-ring)]";

interface BeatTwelveMetricCard {
  label: string;
  support: string;
  value: string;
}

type OverviewCaseConcentrationSortKey = "customer" | "exposure" | "id" | "lines";
type OverviewCaseConcentrationSortDirection = "ascending" | "descending";

interface OverviewCaseConcentrationSortState {
  direction?: OverviewCaseConcentrationSortDirection | undefined;
  key?: OverviewCaseConcentrationSortKey | undefined;
}

type WorkItemDetailLoadState =
  | { lineId: string; state: "loading" }
  | {
      correlationId?: string | undefined;
      lineId: string;
      message: string;
      missingSource?: string | undefined;
      state: "error";
      status?: number | undefined;
    };

interface WorkItemDetailErrorBody {
  correlationId?: string | undefined;
  error?: string | undefined;
  missingSource?: string | undefined;
}

class WorkItemDetailFetchError extends Error {
  readonly correlationId: string | undefined;
  readonly missingSource: string | undefined;
  readonly status: number;

  constructor(status: number, body: WorkItemDetailErrorBody | undefined) {
    super(body?.error ?? `Forensics work item detail request failed with status ${status.toString()}.`);
    this.name = "WorkItemDetailFetchError";
    this.correlationId = body?.correlationId;
    this.missingSource = body?.missingSource;
    this.status = status;
  }
}

class WorkItemDetailIdentityError extends Error {
  constructor(lineId: string) {
    super(`Forensics work item detail response did not match requested line ${lineId}.`);
    this.name = "WorkItemDetailIdentityError";
  }
}

async function fetchForensicsWorkItemDetail(lineId: string): Promise<MayaWorkItemDetail> {
  const response = await fetch("/api/forensics/work-items/" + encodeURIComponent(lineId), { cache: "no-store" });
  if (!response.ok) {
    throw new WorkItemDetailFetchError(response.status, await readWorkItemDetailErrorBody(response));
  }

  return (await response.json()) as MayaWorkItemDetail;
}

async function readWorkItemDetailErrorBody(response: Response): Promise<WorkItemDetailErrorBody | undefined> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return undefined;
    }

    const record = body as Record<string, unknown>;
    return {
      correlationId: typeof record.correlationId === "string" ? record.correlationId : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      missingSource: typeof record.missingSource === "string" ? record.missingSource : undefined
    };
  } catch {
    return undefined;
  }
}

function reconcileWorklistItemFromModel(
  worklist: readonly MayaWorklistItem[],
  current: MayaWorklistItem | undefined
): MayaWorklistItem | undefined {
  if (current === undefined) {
    return undefined;
  }

  return (
    worklist.find((item) => item.workItemId === current.workItemId) ??
    worklist.find((item) => item.lineId === current.lineId) ??
    worklist.find((item) => current.lineIds.some((lineId) => item.lineIds.includes(lineId)))
  );
}

function worklistContainsLine(worklist: readonly MayaWorklistItem[], lineId: string | undefined): boolean {
  return lineId !== undefined && worklist.some((item) => item.lineIds.includes(lineId));
}

function beatTwelveMetricCards(
  items: MayaWorklistItem[],
  kpiItems: MayaForensicsSurfaceProps["model"]["kpiStrip"]
): BeatTwelveMetricCard[] {
  const exposureKpi = kpiItems.find((item) => /\bexposure\b/iu.test(item.label));

  return [
    {
      label: "Cases in Worklist",
      support: "Current source count",
      value: items.length.toString()
    },
    {
      label: "Total potential exposure",
      support: exposureKpi?.support ?? "Exposure KPI unavailable",
      value: exposureKpi?.value ?? "Unavailable"
    },
    {
      label: "Recommended next",
      support: "Review manually",
      value: "Unavailable"
    },
    {
      label: "Avg. age",
      support: "Awaiting source value",
      value: "Unavailable"
    },
    {
      label: "Audit coverage",
      support: "Receipt not confirmed",
      value: "Unavailable"
    }
  ];
}

function filterOverviewCaseConcentrationItems(items: MayaWorklistItem[], query: string): MayaWorklistItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) {
    return items;
  }

  return items.filter((item) =>
    [
      item.lineId,
      item.customerLabel,
      item.workItemLabel,
      item.deductionReason,
      item.routingLabel,
      item.queueLabel,
      item.recommendedActionLabel,
      ...item.lineIds
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
}

function sortOverviewCaseConcentrationItems(
  items: MayaWorklistItem[],
  sortState: OverviewCaseConcentrationSortState
): MayaWorklistItem[] {
  const sortKey = sortState.key;
  const sortDirection = sortState.direction;
  if (sortKey === undefined || sortDirection === undefined) {
    return items;
  }

  const directionMultiplier = sortDirection === "ascending" ? 1 : -1;

  return items
    .map((item, index) => ({ index, item }))
    .sort((left, right) => {
      const comparison = compareOverviewCaseConcentrationItems(left.item, right.item, sortKey);
      if (comparison !== 0) {
        return comparison * directionMultiplier;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function compareOverviewCaseConcentrationItems(
  left: MayaWorklistItem,
  right: MayaWorklistItem,
  key: OverviewCaseConcentrationSortKey
): number {
  if (key === "id") {
    return left.lineId.localeCompare(right.lineId);
  }

  if (key === "customer") {
    return left.customerLabel.localeCompare(right.customerLabel);
  }

  if (key === "lines") {
    return left.lineCount - right.lineCount;
  }

  return parseFormattedExposureForPresentationSort(left.amount) - parseFormattedExposureForPresentationSort(right.amount);
}

function parseFormattedExposureForPresentationSort(value: string): number {
  const normalized = value.replace(/[^0-9.-]/gu, "");
  if (normalized.length === 0) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextOverviewCaseSortState(
  current: OverviewCaseConcentrationSortState,
  key: OverviewCaseConcentrationSortKey
): OverviewCaseConcentrationSortState {
  if (current.key !== key) {
    return { direction: "ascending", key };
  }

  if (current.direction === "ascending") {
    return { direction: "descending", key };
  }

  return {};
}

function overviewCaseAriaSort(
  sortState: OverviewCaseConcentrationSortState,
  key: OverviewCaseConcentrationSortKey
): "ascending" | "descending" | "none" {
  if (sortState.key !== key || sortState.direction === undefined) {
    return "none";
  }

  return sortState.direction;
}

function overviewCaseSortDirectionLabel(
  sortState: OverviewCaseConcentrationSortState,
  key: OverviewCaseConcentrationSortKey
): string {
  if (sortState.key !== key || sortState.direction === undefined) {
    return "Sort";
  }

  return sortState.direction === "ascending" ? "Asc" : "Desc";
}

function overviewCaseSortIcon(sortState: OverviewCaseConcentrationSortState, key: OverviewCaseConcentrationSortKey) {
  if (sortState.key !== key || sortState.direction === undefined) {
    return <ArrowUpDownIcon aria-hidden="true" data-icon="inline-start" />;
  }

  return sortState.direction === "ascending" ? (
    <ArrowUpIcon aria-hidden="true" data-icon="inline-start" />
  ) : (
    <ArrowDownIcon aria-hidden="true" data-icon="inline-start" />
  );
}

function timeOfDayGreeting(displayName: string): string {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${displayName}`;
}

function overviewVerdictSummary(worklist: readonly MayaWorklistItem[]): string {
  const totalCases = worklist.length;
  const verdictCount = worklist.filter((item) => normalizeMayaVerdict(item.verdict) !== undefined).length;
  const evidenceNeededCount = totalCases - verdictCount;
  if (evidenceNeededCount === 0) {
    return `The agents worked last night's settlement run and returned a verdict on all ${totalCases.toString()} cases.`;
  }

  return `The agents worked last night's settlement run and returned verdicts for ${verdictCount.toString()} of ${totalCases.toString()} cases; ${evidenceNeededCount.toString()} ${evidenceNeededCount === 1 ? "needs" : "need"} evidence before routing.`;
}

function readModelSettlementRunId(model: MayaForensicsSurfaceProps["model"]): string | undefined {
  const value = (model as { settlementRunId?: unknown }).settlementRunId;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function overviewFreshnessLine(
  businessFreshness: MayaForensicsSurfaceProps["businessFreshness"],
  connectors: MayaForensicsSurfaceProps["connectors"]
): string {
  const updatedAt = businessFreshness.updatedAtIso === undefined ? undefined : new Date(businessFreshness.updatedAtIso);
  const updatedLabel =
    updatedAt === undefined || Number.isNaN(updatedAt.getTime())
      ? connectors.lastRefreshedLabel
      : updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return `From SAP settlement read-model · updated ${updatedLabel}`;
}

function overviewCardIcon(visualKey: MayaOverviewCardVisualKey) {
  if (visualKey === "valid") {
    return <CheckCircle2Icon aria-hidden="true" className="size-4" data-icon="summary-card" />;
  }
  if (visualKey === "invalid") {
    return <XCircleIcon aria-hidden="true" className="size-4" data-icon="summary-card" />;
  }
  if (visualKey === "partial") {
    return <SquareSplitHorizontalIcon aria-hidden="true" className="size-4" data-icon="summary-card" />;
  }

  return <FolderSearchIcon aria-hidden="true" className="size-4" data-icon="summary-card" />;
}

function overviewCardTileClass(visualKey: MayaOverviewCardVisualKey): string {
  if (visualKey === "valid") {
    return "border-success-border bg-success-surface text-success";
  }
  if (visualKey === "invalid") {
    return "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]";
  }
  if (visualKey === "partial") {
    return "border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]";
  }

  return "border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface)] text-[color:var(--maya-accent-strong)]";
}

function overviewCardAmountClass(visualKey: MayaOverviewCardVisualKey): string {
  if (visualKey === "valid") {
    return "text-success";
  }
  if (visualKey === "invalid") {
    return "text-[color:var(--status-danger-text)]";
  }
  if (visualKey === "partial") {
    return "text-[color:var(--status-warning-text)]";
  }

  return "text-foreground";
}

function overviewVerdictFilterClass(filter: MayaOverviewVerdictFilter, isActive: boolean): string {
  const inactive = "bg-background text-muted-foreground";
  if (filter === "valid") {
    return cn("border-success-border", isActive ? "bg-success-surface text-success" : inactive);
  }
  if (filter === "invalid") {
    return cn(
      "border-[color:var(--status-danger-border)]",
      isActive ? "bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]" : inactive
    );
  }
  if (filter === "partial") {
    return cn(
      "border-[color:var(--status-warning-border)]",
      isActive ? "bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]" : inactive
    );
  }

  return cn(
    "border-[color:var(--maya-accent-border)]",
    isActive ? "bg-[color:var(--maya-accent-surface)] text-[color:var(--maya-accent-strong)]" : inactive
  );
}

function sourcePillClass(isAllReady: boolean): string {
  return isAllReady
    ? "border-success-border bg-success-surface/40 text-success"
    : "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]";
}

function sourcePillDotClass(isAllReady: boolean): string {
  return isAllReady ? "bg-success" : "bg-danger";
}

function overviewCaseBadgeClass(verdict: string): string {
  const bucket = normalizeMayaVerdict(verdict);
  if (bucket === "valid") {
    return "border-success-border bg-success-surface text-success";
  }
  if (bucket === "invalid") {
    return "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]";
  }
  if (bucket === "partial") {
    return "border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]";
  }

  return "border-border bg-muted text-muted-foreground";
}

function overviewCaseBadgeLabel(items: readonly MayaWorklistItem[], item: MayaWorklistItem): string {
  const index = items.findIndex((candidate) => candidate.lineId === item.lineId);
  return index >= 0 ? `Case ${String(index + 1)}` : "Case";
}

function overviewCaseCustomerSupport(item: MayaWorklistItem): string {
  return item.routingLabel;
}

function beatTwelveSourceReadinessTone(sourceTiles: MayaForensicsSurfaceProps["connectors"]["sourceTiles"]): MayaSourceTile["statusTone"] {
  if (sourceTiles.length === 0 || sourceTiles.some((source) => source.statusTone === "blocked")) {
    return "blocked";
  }

  if (sourceTiles.some((source) => source.statusTone === "synthetic")) {
    return "synthetic";
  }

  return "ready";
}

function beatTwelveSourceReadinessClass(statusTone: MayaSourceTile["statusTone"]): string {
  if (statusTone === "ready") {
    return "text-[color:var(--status-success-text)]";
  }

  if (statusTone === "blocked") {
    return "text-destructive";
  }

  return "text-muted-foreground";
}

function beatTwelveSourceReadinessIcon(statusTone: MayaSourceTile["statusTone"]) {
  if (statusTone === "ready") {
    return <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />;
  }

  if (statusTone === "blocked") {
    return <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />;
  }

  return <FlaskConicalIcon aria-hidden="true" data-icon="inline-start" />;
}

export function MayaForensicsSurface({
  businessFreshness,
  connectors,
  model,
  modelVersion,
  onRefreshSources,
  refreshError,
  refreshStatus,
  session
}: MayaForensicsSurfaceProps) {
  const [activeSection, setActiveSection] = React.useState<MayaSurfaceSection>("overview");
  const [selectedWorklistItem, setSelectedWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const [openedCaseWorklistItem, setOpenedCaseWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const [openedCaseDetail, setOpenedCaseDetail] = React.useState<MayaWorkItemDetail | undefined>();
  const [workItemDetailLoadState, setWorkItemDetailLoadState] = React.useState<WorkItemDetailLoadState | undefined>();
  const [returnContextLineId, setReturnContextLineId] = React.useState<string | undefined>();
  const [agentDockOpenLineId, setAgentDockOpenLineId] = React.useState<string | undefined>();
  const [overviewQueryDockOpen, setOverviewQueryDockOpen] = React.useState(false);
  const [overviewSourceReadinessOpen, setOverviewSourceReadinessOpen] = React.useState(false);
  const [overviewCaseFilter, setOverviewCaseFilter] = React.useState("");
  const [overviewCaseSort, setOverviewCaseSort] = React.useState<OverviewCaseConcentrationSortState>({});
  const [overviewVerdictFilter, setOverviewVerdictFilter] = React.useState<MayaOverviewVerdictFilter>("all");
  const detailRequestSequence = React.useRef(0);
  const backendSelectedWorklistItem = React.useMemo(
    () => model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)),
    [model.selected.lineId, model.worklist]
  );
  const backendSelectionUnavailable = backendSelectedWorklistItem === undefined;
  const initialSelectedWorklistItem = backendSelectedWorklistItem;
  const visibleSelectedWorklistItem = selectedWorklistItem ?? initialSelectedWorklistItem;
  let selectedHasBackendDetail = false;
  if (selectedWorklistItem !== undefined) {
    selectedHasBackendDetail = selectedWorklistItem.lineIds.includes(model.selected.lineId);
  } else if (initialSelectedWorklistItem !== undefined) {
    selectedHasBackendDetail = initialSelectedWorklistItem.lineIds.includes(model.selected.lineId);
  }
  const returnedWorklistItem =
    visibleSelectedWorklistItem !== undefined && returnContextLineId === visibleSelectedWorklistItem.lineId
      ? visibleSelectedWorklistItem
      : undefined;
  const hasLocalReturnContext = returnedWorklistItem !== undefined;
  const activeCaseDetail =
    openedCaseDetail !== undefined &&
    openedCaseWorklistItem !== undefined &&
    openedCaseWorklistItem.lineIds.includes(openedCaseDetail.lineId)
      ? openedCaseDetail
      : undefined;
  const agentLaunchItem = activeCaseDetail?.workItem ?? openedCaseWorklistItem ?? visibleSelectedWorklistItem;
  const businessFreshnessBanner = <ForensicsBusinessFreshnessBanner businessFreshness={businessFreshness} />;
  const overviewCopilotDock = React.useMemo<MayaQueryPromptDockContract>(
    () => ({
      ...model.multimodalDock,
      promptSuggestions: buildOverviewCopilotPromptSuggestions(model.worklist, model.selected.evidencePack.recordIds)
    }),
    [model.multimodalDock, model.selected.evidencePack.recordIds, model.worklist]
  );

  const handleOverviewQueryResponse = React.useCallback((response: QueryEvidenceResponse) => {
    void response;
  }, []);

  const openInvestigationForLine = React.useCallback(async (
    item: MayaWorklistItem,
    requestedLineId: string,
    options?: { openQueryDockOnReady?: boolean }
  ) => {
    const requestId = beginWorkItemDetailRequest(detailRequestSequence);
    setActiveSection("worklist");
    setReturnContextLineId(undefined);
    setOverviewQueryDockOpen(false);
    setOpenedCaseWorklistItem(item);
    setOpenedCaseDetail(undefined);
    setWorkItemDetailLoadState({ lineId: requestedLineId, state: "loading" });
    if (options?.openQueryDockOnReady === true) {
      setAgentDockOpenLineId(requestedLineId);
    } else {
      setAgentDockOpenLineId(undefined);
    }

    try {
      const detail = await fetchForensicsWorkItemDetail(requestedLineId);
      if (!isCurrentWorkItemDetailRequest(detailRequestSequence, requestId)) {
        return;
      }
      assertWorkItemDetailIdentity(detail, requestedLineId, item);

      setOpenedCaseDetail(detail);
      setOpenedCaseWorklistItem(detail.workItem);
      setWorkItemDetailLoadState(undefined);
    } catch (error) {
      if (!isCurrentWorkItemDetailRequest(detailRequestSequence, requestId)) {
        return;
      }

      setOpenedCaseDetail(undefined);
      setWorkItemDetailLoadState(toWorkItemDetailLoadError(requestedLineId, error));
      setAgentDockOpenLineId(undefined);
    }
  }, []);

  const openInvestigationForItem = React.useCallback(
    async (item: MayaWorklistItem, options?: { openQueryDockOnReady?: boolean }) => {
      await openInvestigationForLine(item, item.lineId, options);
    },
    [openInvestigationForLine]
  );

  const handleSelectCaseLine = React.useCallback(
    (lineId: string) => {
      if (activeCaseDetail === undefined || !activeCaseDetail.workItem.lineIds.includes(lineId)) {
        return;
      }
      if (lineId === activeCaseDetail.lineId) {
        return;
      }

      void openInvestigationForLine(activeCaseDetail.workItem, lineId);
    },
    [activeCaseDetail, openInvestigationForLine]
  );

  const handleSelectWorklistItem = React.useCallback(
    (item: MayaWorklistItem) => {
      cancelWorkItemDetailRequest(detailRequestSequence);
      setSelectedWorklistItem(item);
      setReturnContextLineId(undefined);
      setOpenedCaseWorklistItem(undefined);
      setOpenedCaseDetail(undefined);
      setWorkItemDetailLoadState(undefined);
      setAgentDockOpenLineId(undefined);
      setOverviewQueryDockOpen(false);
    },
    []
  );

  const handleReturnToWorklist = React.useCallback(() => {
    if (openedCaseWorklistItem === undefined) {
      return;
    }

    cancelWorkItemDetailRequest(detailRequestSequence);
    setActiveSection("worklist");
    setSelectedWorklistItem(openedCaseWorklistItem);
    setReturnContextLineId(openedCaseWorklistItem.lineId);
    setOpenedCaseWorklistItem(undefined);
    setOpenedCaseDetail(undefined);
    setWorkItemDetailLoadState(undefined);
    setAgentDockOpenLineId(undefined);
    setOverviewQueryDockOpen(false);
  }, [openedCaseWorklistItem]);

  const handleLaunchRecoupAgent = React.useCallback(() => {
    if (activeCaseDetail !== undefined) {
      setAgentDockOpenLineId(activeCaseDetail.lineId);
      return;
    }

    if (activeSection === "overview") {
      setAgentDockOpenLineId(undefined);
      setOverviewQueryDockOpen(true);
      return;
    }

    if (agentLaunchItem === undefined) {
      return;
    }

    setAgentDockOpenLineId(agentLaunchItem.lineId);
    void openInvestigationForItem(agentLaunchItem, { openQueryDockOnReady: true });
  }, [activeCaseDetail, agentLaunchItem, openInvestigationForItem]);

  const handleQueryDockIntentConsumed = React.useCallback(() => {
    setAgentDockOpenLineId(undefined);
  }, []);

  const handleOverviewCaseSort = React.useCallback((key: OverviewCaseConcentrationSortKey) => {
    setOverviewCaseSort((current) => nextOverviewCaseSortState(current, key));
  }, []);

  const handleClearOverviewCaseFilter = React.useCallback(() => {
    setOverviewCaseFilter("");
  }, []);

  const handleSurfaceSectionChange = React.useCallback((section: MayaSurfaceSection) => {
    setActiveSection(section);
    cancelWorkItemDetailRequest(detailRequestSequence);
    setOpenedCaseWorklistItem(undefined);
    setOpenedCaseDetail(undefined);
    setWorkItemDetailLoadState(undefined);
    setReturnContextLineId(undefined);
    setAgentDockOpenLineId(undefined);
    setOverviewQueryDockOpen(false);
  }, []);

  React.useEffect(() => {
    return () => {
      cancelWorkItemDetailRequest(detailRequestSequence);
    };
  }, []);

  React.useEffect(() => {
    setSelectedWorklistItem((current) => reconcileWorklistItemFromModel(model.worklist, current));
    setOpenedCaseWorklistItem((current) => reconcileWorklistItemFromModel(model.worklist, current));
    setOpenedCaseDetail((current) => {
      if (current === undefined) {
        return undefined;
      }

      const refreshedWorkItem = reconcileWorklistItemFromModel(model.worklist, current.workItem);
      if (refreshedWorkItem === undefined || !refreshedWorkItem.lineIds.includes(current.lineId)) {
        return undefined;
      }

      return current;
    });
    setWorkItemDetailLoadState((current) =>
      current === undefined || worklistContainsLine(model.worklist, current.lineId) ? current : undefined
    );
    setReturnContextLineId((current) => (worklistContainsLine(model.worklist, current) ? current : undefined));
    setAgentDockOpenLineId((current) => (worklistContainsLine(model.worklist, current) ? current : undefined));
    if (!worklistContainsLine(model.worklist, model.selected.lineId)) {
      setOverviewQueryDockOpen(false);
    }
  }, [model.worklist, modelVersion]);

  React.useEffect(() => {
    if (openedCaseWorklistItem === undefined && returnContextLineId !== undefined) {
      window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }
  }, [openedCaseWorklistItem, returnContextLineId]);

  function renderMayaRootSection(): React.ReactNode {
    switch (activeSection) {
      case "overview": {
        const summaryCards = buildOverviewSummaryCards(model.worklist);
        const verdictFilterOptions = buildOverviewVerdictFilterOptions(model.worklist);
        const sourcePill = buildSourcePillState(connectors.sourceTiles);
        const greeting = timeOfDayGreeting(session.displayName);
        const verdictSummary = overviewVerdictSummary(model.worklist);
        const freshnessLine = overviewFreshnessLine(businessFreshness, connectors);
        const verdictFilteredWorklist =
          overviewVerdictFilter === "all"
            ? model.worklist
            : model.worklist.filter((item) => normalizeMayaVerdict(item.verdict) === overviewVerdictFilter);
        const overviewConcentrationItems = sortOverviewCaseConcentrationItems(
          filterOverviewCaseConcentrationItems(verdictFilteredWorklist, overviewCaseFilter),
          overviewCaseSort
        );

        return (
          <section className="flex min-w-0 flex-col gap-3" data-testid="maya-root-section-overview">
            <section className="grid min-w-0 gap-3" data-testid="maya-overview-command-center">
              <div className="flex min-w-0 justify-end" data-testid="maya-overview-command-rail">
                {overviewQueryDockOpen ? null : (
                  <RecoupAgentLauncher
                    disabled={agentLaunchItem === undefined}
                    onClick={handleLaunchRecoupAgent}
                    placement="overview"
                  />
                )}
              </div>
              <section
                className="grid min-w-0 gap-3 rounded-lg border bg-background p-4 shadow-none"
                data-testid="maya-overview-kpi-band"
              >
                <div className="grid min-w-0 gap-3">
                  <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid min-w-0 gap-2">
                      <h2 className="text-2xl font-semibold leading-tight tracking-normal" data-testid="maya-overview-greeting">
                        {greeting}
                      </h2>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground" data-testid="maya-overview-verdict-summary">
                        {verdictSummary}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid="maya-overview-freshness-line">
                        {freshnessLine}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                      <Collapsible onOpenChange={setOverviewSourceReadinessOpen} open={overviewSourceReadinessOpen}>
                        <CollapsibleTrigger asChild>
                          <Button
                            aria-expanded={overviewSourceReadinessOpen}
                            className={`h-9 gap-2 rounded-full border px-3 text-xs font-medium shadow-none ${sourcePillClass(sourcePill.isAllReady)}`}
                            data-state={overviewSourceReadinessOpen ? "open" : "closed"}
                            data-testid="maya-overview-source-readiness-toggle"
                            type="button"
                            variant="outline"
                          >
                            <span aria-hidden="true" className={`size-2 rounded-full ${sourcePillDotClass(sourcePill.isAllReady)}`} />
                            <span>{sourcePill.label}</span>
                            <span className="tabular-nums">
                              {sourcePill.connectedCount.toString()}/{sourcePill.totalCount.toString()} connected
                            </span>
                            <ChevronDownIcon
                              aria-hidden="true"
                              className={overviewSourceReadinessOpen ? "rotate-180" : undefined}
                              data-icon="inline-end"
                            />
                          </Button>
                        </CollapsibleTrigger>
                      </Collapsible>
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="maya-overview-intelligence-grid">
                    {summaryCards.map((card) => {
                      const visualKey = overviewCardVisualKey(card);
                      const cardIcon = overviewCardIcon(visualKey);

                      return (
                        <Card
                          className="rounded-md shadow-none transition-shadow hover:shadow-sm"
                          data-card-visual={visualKey}
                          data-testid="maya-overview-summary-card"
                          key={card.label}
                          size="sm"
                        >
                          <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-3">
                            <span
                              aria-hidden="true"
                              className={cn("flex size-9 items-center justify-center rounded-md border", overviewCardTileClass(visualKey))}
                            >
                              {cardIcon}
                            </span>
                            <span className="grid min-w-0 gap-1">
                              <CardDescription className="truncate text-base font-semibold text-foreground" title={card.label}>
                                {card.label}
                              </CardDescription>
                              <CardTitle className="text-3xl font-semibold tracking-normal tabular-nums">
                                {card.count.toString()}
                              </CardTitle>
                            </span>
                          </CardHeader>
                          <CardContent className="grid gap-1 px-3 pb-3 pt-0">
                            <span className={cn("text-base font-semibold tabular-nums", overviewCardAmountClass(visualKey))}>
                              {card.amountLabel}
                            </span>
                            {card.runValueShareLabel === undefined ? null : (
                              <span className="text-xs leading-5 text-muted-foreground">{card.runValueShareLabel}</span>
                            )}
                            <span className="text-xs leading-5 text-muted-foreground">
                              {card.lineCount === undefined ? card.supportLabel : `${card.lineCount.toString()} lines - ${card.supportLabel}`}
                            </span>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  <Collapsible onOpenChange={setOverviewSourceReadinessOpen} open={overviewSourceReadinessOpen}>
                    <CollapsibleContent>
                      <SourceReadinessStrip connectors={connectors} />
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </section>

              <section className="grid min-w-0 gap-3" data-testid="maya-overview-concentration-band">
                <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} size="sm">
                  <CardHeader className="gap-3">
                    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="grid min-w-0 gap-1.5">
                        <CardTitle className="text-lg font-semibold text-foreground" data-testid="maya-overview-concentration-title">
                          Deduction cases
                        </CardTitle>
                        <CardDescription>
                          Case Concentration Analysis - verdict, routing, and agent reason shown for each work item.
                        </CardDescription>
                      </div>
                      <div className={cn("grid min-w-0 gap-1 rounded-md border px-3 py-2 lg:min-w-48", mayaAccent.proofMutedPanel)}>
                        <span className="text-xs text-muted-foreground">Total exposure</span>
                        <span className="truncate text-sm font-medium tabular-nums" title={model.recoveryTracker.totalExposure}>
                          {model.recoveryTracker.totalExposure}
                        </span>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="maya-overview-verdict-filter">
                      <span className="text-xs text-muted-foreground">Verdict</span>
                      {verdictFilterOptions.map((option) => {
                        const isActive = overviewVerdictFilter === option.key;

                        return (
                          <Button
                            aria-pressed={isActive}
                            className={cn("h-8 rounded-full border px-3 text-xs font-medium", overviewVerdictFilterClass(option.key, isActive))}
                            data-filter={option.key}
                            key={option.key}
                            onClick={() => {
                              setOverviewVerdictFilter(option.key);
                            }}
                            type="button"
                            variant="outline"
                          >
                            <span>{option.label}</span>
                            <span className="tabular-nums">{option.count.toString()}</span>
                          </Button>
                        );
                      })}
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <InputGroup className="h-9 md:max-w-md">
                        <InputGroupAddon>
                          <SearchIcon aria-hidden="true" data-icon="input-addon" />
                        </InputGroupAddon>
                        <InputGroupInput
                          aria-label="Filter case concentration rows"
                          data-testid="maya-overview-case-concentration-filter"
                          onChange={(event) => {
                            setOverviewCaseFilter(event.target.value);
                          }}
                          placeholder="Filter ID, customer, or work item"
                          title="Filter by case ID, customer, or work item text"
                          value={overviewCaseFilter}
                        />
                        {overviewCaseFilter.trim().length > 0 ? (
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              aria-label="Clear case concentration filter"
                              onClick={handleClearOverviewCaseFilter}
                              size="icon-xs"
                              type="button"
                              variant="ghost"
                            >
                              <XIcon aria-hidden="true" data-icon="button-icon" />
                            </InputGroupButton>
                          </InputGroupAddon>
                        ) : null}
                      </InputGroup>
                      <span className="text-xs text-muted-foreground">
                        Showing {overviewConcentrationItems.length.toString()} of {model.worklist.length.toString()} cases
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {model.worklist.length === 0 ? (
                      <div className="p-4">
                        <MayaEmptyState description="No worklist rows are available for concentration." kind="worklist" title="No cases" />
                      </div>
                    ) : overviewConcentrationItems.length === 0 ? (
                      <div className="p-4">
                        <MayaEmptyState description="No worklist rows match the current local filter." kind="search" title="No matching cases" />
                      </div>
                    ) : (
                      <div>
                        <div className="grid min-w-0 gap-0" data-testid="maya-overview-case-concentration-table">
                          <div
                            className="border-y border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface)] px-3 py-1"
                            data-testid="maya-overview-case-concentration-header-row"
                          >
                            <div
                              aria-label="Sort deduction cases"
                              className="grid min-w-0 items-center gap-3 px-3 text-sm font-semibold text-foreground md:grid-cols-[60px_minmax(0,1.1fr)_minmax(0,1.8fr)_126px_minmax(170px,0.95fr)_20px]"
                              role="group"
                            >
                              <Button
                                aria-label={`Sort deduction cases by ID. Current state: ${overviewCaseSortDirectionLabel(overviewCaseSort, "id")}.`}
                                aria-pressed={overviewCaseSort.key === "id"}
                                className={cn(
                                  "h-7 justify-start gap-1.5 rounded px-2 text-sm font-semibold shadow-none",
                                  overviewCaseSort.key === "id"
                                    ? "bg-[var(--maya-accent-soft)] text-[var(--maya-accent-text)]"
                                    : "text-foreground hover:bg-muted/60"
                                )}
                                data-sort-state={overviewCaseAriaSort(overviewCaseSort, "id")}
                                data-testid="maya-overview-case-concentration-sort-id"
                                onClick={() => {
                                  handleOverviewCaseSort("id");
                                }}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {overviewCaseSort.key === "id" ? overviewCaseSortIcon(overviewCaseSort, "id") : null}
                                <span>ID</span>
                                {overviewCaseSort.key === "id" && overviewCaseSort.direction !== undefined ? (
                                  <span className="sr-only">
                                    {overviewCaseSortDirectionLabel(overviewCaseSort, "id")}
                                  </span>
                                ) : null}
                              </Button>
                              <Button
                                aria-label={`Sort deduction cases by customer. Current state: ${overviewCaseSortDirectionLabel(
                                  overviewCaseSort,
                                  "customer"
                                )}.`}
                                aria-pressed={overviewCaseSort.key === "customer"}
                                className={cn(
                                  "h-7 justify-start gap-1.5 rounded px-2 text-sm font-semibold shadow-none",
                                  overviewCaseSort.key === "customer"
                                    ? "bg-[var(--maya-accent-soft)] text-[var(--maya-accent-text)]"
                                    : "text-foreground hover:bg-muted/60"
                                )}
                                data-sort-state={overviewCaseAriaSort(overviewCaseSort, "customer")}
                                data-testid="maya-overview-case-concentration-sort-customer"
                                onClick={() => {
                                  handleOverviewCaseSort("customer");
                                }}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {overviewCaseSort.key === "customer" ? overviewCaseSortIcon(overviewCaseSort, "customer") : null}
                                <span>Customer</span>
                                {overviewCaseSort.key === "customer" && overviewCaseSort.direction !== undefined ? (
                                  <span className="sr-only">
                                    {overviewCaseSortDirectionLabel(overviewCaseSort, "customer")}
                                  </span>
                                ) : null}
                              </Button>
                              <span className="px-2 font-semibold text-foreground">Work item</span>
                              <span className="grid grid-cols-2 justify-items-end gap-1">
                                <Button
                                  aria-label={`Sort deduction cases by exposure. Current state: ${overviewCaseSortDirectionLabel(
                                    overviewCaseSort,
                                    "exposure"
                                  )}.`}
                                  aria-pressed={overviewCaseSort.key === "exposure"}
                                  className={cn(
                                    "h-7 w-full justify-end gap-1 rounded px-2 text-sm font-semibold shadow-none",
                                    overviewCaseSort.key === "exposure"
                                      ? "bg-[var(--maya-accent-soft)] text-[var(--maya-accent-text)]"
                                      : "text-foreground hover:bg-muted/60"
                                  )}
                                  data-sort-state={overviewCaseAriaSort(overviewCaseSort, "exposure")}
                                  data-testid="maya-overview-case-concentration-sort-exposure"
                                  onClick={() => {
                                    handleOverviewCaseSort("exposure");
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  {overviewCaseSort.key === "exposure" ? overviewCaseSortIcon(overviewCaseSort, "exposure") : null}
                                  <span>Exposure</span>
                                  {overviewCaseSort.key === "exposure" && overviewCaseSort.direction !== undefined ? (
                                    <span className="sr-only">
                                      {overviewCaseSortDirectionLabel(overviewCaseSort, "exposure")}
                                    </span>
                                  ) : null}
                                </Button>
                                <Button
                                  aria-label={`Sort deduction cases by line count. Current state: ${overviewCaseSortDirectionLabel(
                                    overviewCaseSort,
                                    "lines"
                                  )}.`}
                                  aria-pressed={overviewCaseSort.key === "lines"}
                                  className={cn(
                                    "h-7 w-full justify-end gap-1 rounded px-2 text-sm font-semibold shadow-none",
                                    overviewCaseSort.key === "lines"
                                      ? "bg-[var(--maya-accent-soft)] text-[var(--maya-accent-text)]"
                                      : "text-foreground hover:bg-muted/60"
                                  )}
                                  data-sort-state={overviewCaseAriaSort(overviewCaseSort, "lines")}
                                  data-testid="maya-overview-case-concentration-sort-lines"
                                  onClick={() => {
                                    handleOverviewCaseSort("lines");
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  {overviewCaseSort.key === "lines" ? overviewCaseSortIcon(overviewCaseSort, "lines") : null}
                                  <span>Lines</span>
                                  {overviewCaseSort.key === "lines" && overviewCaseSort.direction !== undefined ? (
                                    <span className="sr-only">
                                      {overviewCaseSortDirectionLabel(overviewCaseSort, "lines")}
                                    </span>
                                  ) : null}
                                </Button>
                              </span>
                              <span className="px-2 font-semibold text-foreground">Verdict / route</span>
                              <span className="sr-only">Open case</span>
                            </div>
                          </div>
                          <div className="grid min-w-0 gap-2 p-3">
                            {overviewConcentrationItems.map((item) => {
                              const isSelected = item.lineId === visibleSelectedWorklistItem?.lineId;
                              const reason = resolveMayaWorklistReason(item);
                              const caseLabel = overviewCaseBadgeLabel(model.worklist, item);
                              const customerSupport = overviewCaseCustomerSupport(item);

                              return (
                                <button
                                  aria-selected={isSelected}
                                  className={cn(
                                    "grid min-w-0 items-center gap-3 rounded-md border bg-background p-3 text-left outline-none transition-colors hover:border-[var(--maya-accent-border)] hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:grid-cols-[60px_minmax(0,1.1fr)_minmax(0,1.8fr)_126px_minmax(170px,0.95fr)_20px]",
                                    mayaSelectedRowClass
                                  )}
                                  data-line-id={item.lineId}
                                  data-selected={isSelected ? "true" : undefined}
                                  data-testid="maya-overview-case-concentration-row"
                                  data-verdict={normalizeMayaVerdict(item.verdict) ?? item.verdict}
                                  key={`overview-concentration-${item.lineId}`}
                                  onClick={() => {
                                    void openInvestigationForItem(item);
                                  }}
                                  type="button"
                                >
                                  <span
                                    className={`flex h-10 min-w-14 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-semibold ${overviewCaseBadgeClass(item.verdict)}`}
                                    data-verdict={item.verdict}
                                    title={item.workItemId ?? item.workItemLabel}
                                  >
                                    {caseLabel}
                                  </span>
                                  <span className="grid min-w-0 gap-0.5">
                                    <span className="truncate text-sm font-medium" title={item.customerLabel}>
                                      {item.customerLabel}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground" title={customerSupport}>
                                      {customerSupport}
                                    </span>
                                  </span>
                                  <span className="grid min-w-0 gap-1">
                                    <span className="truncate text-sm font-medium" title={item.workItemLabel}>
                                      {item.workItemLabel}
                                    </span>
                                    <span className="line-clamp-2 text-xs leading-5 text-muted-foreground" title={reason}>
                                      {reason}
                                    </span>
                                  </span>
                                  <span className="grid min-w-0 gap-1 md:text-right">
                                    <span className="text-sm font-semibold tabular-nums">{item.amount}</span>
                                    <span className="text-xs text-muted-foreground tabular-nums">{item.lineCount.toString()} lines</span>
                                  </span>
                                  <span className="grid min-w-0 gap-1.5 md:justify-items-start">
                                    <Badge
                                      className="w-fit max-w-full justify-start rounded-full"
                                      data-verdict={item.verdict}
                                      title={item.verdictLabel}
                                      variant={verdictBadgeVariant(item.verdict)}
                                    >
                                      {overviewShortVerdictLabel(item.verdict, item.verdictLabel)}
                                    </Badge>
                                    <span className="line-clamp-2 text-xs leading-5 text-muted-foreground" title={item.recommendedActionLabel}>
                                      {item.recommendedActionLabel}
                                    </span>
                                  </span>
                                  <ChevronRightIcon aria-hidden="true" className="hidden size-4 text-muted-foreground md:block" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            </section>
          </section>
        );
      }
      case "worklist":
        return renderWorklistSection();
      case "approvals":
        return (
          <section className="min-w-0" data-testid="maya-root-section-approvals">
            <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} size="sm">
              <CardHeader>
                <CardTitle className="text-base">Action inbox</CardTitle>
                <CardDescription>Approval posture from action queue.</CardDescription>
              </CardHeader>
              <CardContent>
                {model.actionInbox.length === 0 ? (
                  <MayaEmptyState
                    description="The current action queue has no pending human actions."
                    kind="approval"
                    title="No pending HITL actions"
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Case</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {model.actionInbox.map((item) => {
                        const actionWorkItem = model.worklist.find((workItem) => workItem.lineIds.includes(item.lineId));
                        const caseLabel =
                          actionWorkItem === undefined ? "Selected case" : overviewCaseBadgeLabel(model.worklist, actionWorkItem);

                        return (
                          <TableRow key={item.actionId}>
                            <TableCell>{caseLabel}</TableCell>
                            <TableCell>{item.actionLabel}</TableCell>
                            <TableCell>{item.statusLabel ?? "Unavailable"}</TableCell>
                            <TableCell className="tabular-nums">{item.amount}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        );
    }
  }

  function renderWorklistSection(): React.ReactNode {
    return (
      <section
        className="grid min-h-0 min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]"
        data-testid="maya-root-section-worklist"
      >
        <section className="min-w-0" aria-label="Maya queue">
          <DeductionWorklistTable
            items={model.worklist}
            onOpenItem={(item) => {
              void openInvestigationForItem(item);
            }}
            onSelectItem={handleSelectWorklistItem}
            {...(visibleSelectedWorklistItem === undefined ? {} : { selectedLineId: visibleSelectedWorklistItem.lineId })}
          />
        </section>
        <aside className="min-w-0" aria-label="Work item starter">
          <Card className={cn("min-h-[568px] rounded-lg shadow-none", mayaAccent.subtleCard)} data-testid="maya-work-item-pane" size="sm">
            {visibleSelectedWorklistItem === undefined ? (
              <CardContent className="flex min-h-[568px] flex-col items-center justify-center px-8">
                {backendSelectionUnavailable && model.worklist.length > 0 ? (
                  <Alert className="mb-4" variant="destructive">
                    <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
                    <AlertTitle>Selected work item unavailable</AlertTitle>
                    <AlertDescription>
                      The selected work item is not present in the current worklist. Select a row to request its
                      governed detail packet; no fallback business values are displayed.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <MayaEmptyState
                  description="View details, evidence, and workflow actions for the selected item."
                  kind="worklist"
                  title="Select a deduction to open its work item"
                />
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <CardTitle className="truncate">{visibleSelectedWorklistItem.customerLabel}</CardTitle>
                      <CardDescription className="truncate">{visibleSelectedWorklistItem.workItemLabel}</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {hasLocalReturnContext ? (
                        <Badge data-testid="maya-return-local-focus-badge" variant="secondary">
                          Local focus
                        </Badge>
                      ) : null}
                      <Badge variant="outline">Advisory only</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-5">
                  <div className="flex min-w-0 flex-col gap-4" data-testid="maya-selected-work-item">
                    {hasLocalReturnContext ? (
                      <Alert data-testid="maya-local-return-context">
                        <ShieldAlertIcon aria-hidden="true" data-icon="inline-start" />
                        <AlertTitle>Audit status unavailable</AlertTitle>
                        <AlertDescription>
                          Returned locally from the Audit tab. Local focus only; no queue update or audit refresh is inferred.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                      <div className="grid gap-1">
                        <p className="text-sm text-muted-foreground">Work item</p>
                        <h2 className="text-xl font-semibold leading-tight">{visibleSelectedWorklistItem.workItemLabel}</h2>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button className="w-fit gap-1.5 px-2 text-[11px]" size="xs" type="button" variant="outline">
                              <CircleHelpIcon aria-hidden="true" data-icon="inline-start" />
                              Source lines
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-72">
                            <span>{visibleSelectedWorklistItem.lineIds.join(", ")}</span>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    <Separator />
                    <div className="grid gap-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Amount</span>
                        <strong className="tabular-nums">{visibleSelectedWorklistItem.amount}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Verdict</span>
                        <Badge data-verdict={visibleSelectedWorklistItem.verdict} variant={verdictBadgeVariant(visibleSelectedWorklistItem.verdict)}>
                          {visibleSelectedWorklistItem.verdict === "valid" ? (
                            <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
                          ) : null}
                          {visibleSelectedWorklistItem.verdictLabel}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Queue</span>
                        <span>{visibleSelectedWorklistItem.queueLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Routing</span>
                        <span>{visibleSelectedWorklistItem.routingLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Evidence</span>
                        <span>{visibleSelectedWorklistItem.evidenceScoreLabel}</span>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid gap-3">
                      <div
                        className={cn("grid gap-2 rounded-lg border p-3", mayaAccent.proofPanel)}
                        data-testid="maya-selected-advisory-callout"
                      >
                        <div className="flex items-center gap-2">
                          <UserRoundCheckIcon aria-hidden="true" data-icon="inline-start" />
                          <p className="text-sm font-medium">Recommended action</p>
                        </div>
                        <p className="text-sm">{visibleSelectedWorklistItem.recommendedActionLabel}</p>
                        <p className="text-xs text-muted-foreground">Advisory only. Human approval remains required for external action.</p>
                        <Badge className="justify-self-start" variant="outline">
                          {visibleSelectedWorklistItem.confidenceLabel}
                        </Badge>
                      </div>
                      <div className="grid gap-1.5">
                        <p className="text-sm font-medium">Detail packet</p>
                        <p className="text-sm text-muted-foreground" data-testid="maya-selected-row-contract-note">
                          {selectedHasBackendDetail
                            ? "The current fixed evidence packet corresponds to this row."
                            : "Detailed evidence is unavailable until a governed detail packet is requested for this row."}
                        </p>
                      </div>
                      <Button
                        data-testid="maya-local-row-action-open"
                        disabled={
                          workItemDetailLoadState?.state === "loading" &&
                          workItemDetailLoadState.lineId === visibleSelectedWorklistItem.lineId
                        }
                        onClick={() => {
                          void openInvestigationForItem(visibleSelectedWorklistItem);
                        }}
                        size="sm"
                        type="button"
                      >
                        {workItemDetailLoadState?.state === "loading" &&
                        workItemDetailLoadState.lineId === visibleSelectedWorklistItem.lineId ? (
                          <RotateCwIcon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
                        ) : (
                          <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
                        )}
                        {workItemDetailLoadState?.state === "loading" &&
                        workItemDetailLoadState.lineId === visibleSelectedWorklistItem.lineId
                          ? "Loading detail"
                          : "Open investigation"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </aside>
      </section>
    );
  }

  if (openedCaseWorklistItem !== undefined) {
    const caseWorklistItem = activeCaseDetail?.workItem ?? openedCaseWorklistItem;

    return (
      <MayaWorkspaceShell
        activeSection={activeSection}
        heading={caseWorklistItem.workItemLabel}
        onSectionChange={handleSurfaceSectionChange}
        onRefreshSources={onRefreshSources}
        pendingActionCount={model.actionInbox.length}
        {...(refreshError === undefined ? {} : { refreshError })}
        refreshStatus={refreshStatus}
        refreshedLabel={connectors.lastRefreshedLabel}
        session={session}
        support={`${caseWorklistItem.customerLabel} / ${caseWorklistItem.workItemLabel}`}
        worklistCount={model.worklist.length}
      >
        <RecoupAgentLauncher disabled={agentLaunchItem === undefined} onClick={handleLaunchRecoupAgent} />
        {businessFreshnessBanner}
        <section className="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]" aria-label="Maya case overview">
          <aside className="min-w-0" data-testid="maya-case-worklist-rail">
            <DeductionWorklistTable
              items={model.worklist}
              onOpenItem={(item) => {
                void openInvestigationForItem(item);
              }}
              onSelectItem={handleSelectWorklistItem}
              selectedLineId={caseWorklistItem.lineId}
              variant="rail"
            />
          </aside>
          {activeCaseDetail === undefined ? (
            <WorkItemDetailStatePanel
              loadState={workItemDetailLoadState ?? { lineId: caseWorklistItem.lineId, state: "loading" }}
              onRetry={() => {
                void openInvestigationForItem(caseWorklistItem);
              }}
              onReturnToWorklist={handleReturnToWorklist}
            />
          ) : (
            <DeductionCaseWorkspace
              actionInbox={activeCaseDetail.actionInbox}
              approvalReceipt={activeCaseDetail.approvalReceipt}
              auditState={activeCaseDetail.auditState}
              detail={activeCaseDetail}
              hasBackendDetail={true}
              journey={activeCaseDetail.mayaJourney}
              multimodalDock={activeCaseDetail.multimodalDock}
              onQueryDockIntentConsumed={handleQueryDockIntentConsumed}
              onReturnToWorklist={handleReturnToWorklist}
              onSelectLine={handleSelectCaseLine}
              openQueryDockLineId={agentDockOpenLineId}
              recommendedAction={activeCaseDetail.recommendedAction}
              selected={activeCaseDetail.selected}
              selectedWorklistItem={model.worklist.find((item) => item.lineId === activeCaseDetail.workItem.lineId) ?? activeCaseDetail.workItem}
              sourceTiles={connectors.sourceTiles}
              worklist={model.worklist}
            />
          )}
        </section>
      </MayaWorkspaceShell>
    );
  }

  if (returnedWorklistItem !== undefined) {
    return (
      <MayaWorkspaceShell
        activeSection="worklist"
        heading="Deduction Cases"
        headerAction={<RecoupAgentLauncher disabled={agentLaunchItem === undefined} onClick={handleLaunchRecoupAgent} />}
        onSectionChange={handleSurfaceSectionChange}
        onRefreshSources={onRefreshSources}
        pendingActionCount={model.actionInbox.length}
        {...(refreshError === undefined ? {} : { refreshError })}
        refreshStatus={refreshStatus}
        refreshedLabel={connectors.lastRefreshedLabel}
        session={session}
        support={`${model.worklist.length.toString()} work items / ${model.actionInbox.length.toString()} human actions pending`}
        worklistCount={model.worklist.length}
      >
        {businessFreshnessBanner}
        <BeatTwelveReturnedWorklist
          connectors={connectors}
          items={model.worklist}
          kpiItems={model.kpiStrip}
          onSelectItem={(item) => {
            void openInvestigationForItem(item);
          }}
          selectedItem={returnedWorklistItem}
        />
      </MayaWorkspaceShell>
    );
  }

  const overviewSettlementRunId = readModelSettlementRunId(model);

  return (
    <MayaWorkspaceShell
      activeSection={activeSection}
      onSectionChange={handleSurfaceSectionChange}
      onRefreshSources={onRefreshSources}
      pendingActionCount={model.actionInbox.length}
      {...(refreshError === undefined ? {} : { refreshError })}
      refreshStatus={refreshStatus}
      refreshedLabel={connectors.lastRefreshedLabel}
      session={session}
      worklistCount={model.worklist.length}
    >
      {businessFreshnessBanner}
      <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label="Maya morning run summary">
        {renderMayaRootSection()}
      </section>
      <QueryEvidenceDock
        caseOptions={buildCopilotCaseOptions(model.worklist)}
        dock={overviewCopilotDock}
        evidencePack={model.selected.evidencePack}
        onOpenChange={setOverviewQueryDockOpen}
        onResponse={handleOverviewQueryResponse}
        open={overviewQueryDockOpen}
        queryScope="workspace"
        recordIds={model.selected.evidencePack.recordIds}
        selectedLine={model.selected.lineId}
        {...(overviewSettlementRunId === undefined ? {} : { settlementRunId: overviewSettlementRunId })}
      />
    </MayaWorkspaceShell>
  );
}

function buildOverviewCopilotPromptSuggestions(
  worklist: readonly MayaWorklistItem[],
  fallbackRecordIds: readonly string[]
): NonNullable<MayaQueryPromptDockContract["promptSuggestions"]> {
  return buildCopilotSuggestions(worklist).map((suggestion) => {
    const recordIds = dedupeStrings([...suggestion.recordIds, ...fallbackRecordIds]);
    return {
      label: suggestion.label,
      provenance: {
        deterministicBasis: `Overview prompt derived from Maya worklist row ${recordIds.join(", ") || suggestion.label}.`,
        recordIds,
        sourceKind: "derived_backend",
        sourceName: "Maya worklist"
      },
      question: suggestion.question,
      recordIds
    };
  });
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function ForensicsBusinessFreshnessBanner({
  businessFreshness
}: {
  businessFreshness: MayaForensicsSurfaceProps["businessFreshness"];
}) {
  const businessFreshnessIsDegraded = businessFreshness.status === "degraded";
  if (!businessFreshnessIsDegraded) {
    if (businessFreshness.sourceHash === undefined && businessFreshness.receiptHash === undefined) {
      return null;
    }

    return <FreshnessHashDisclosure businessFreshness={businessFreshness} />;
  }

  return (
    <Alert className="border-amber-500/45 bg-amber-50/70 text-amber-950" data-testid="forensics-stale-state">
      <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
      <AlertTitle>Forensics live updates degraded</AlertTitle>
      <AlertDescription>
        <div className="flex flex-wrap gap-2">
          <span>{businessFreshness.message ?? "Displayed business data may be stale until the stream reconnects."}</span>
          <FreshnessHashDisclosure businessFreshness={businessFreshness} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

function FreshnessHashDisclosure({
  businessFreshness
}: {
  businessFreshness: MayaForensicsSurfaceProps["businessFreshness"];
}) {
  return (
    <div
      aria-label="Evidence provenance hashes available for audit"
      className="sr-only"
      data-testid="forensics-business-freshness"
    >
      {businessFreshness.sourceHash === undefined ? null : (
        <span data-testid="forensics-source-hash" title={businessFreshness.sourceHash}>
          {businessFreshness.sourceHash}
        </span>
      )}
      {businessFreshness.receiptHash === undefined ? null : (
        <span data-testid="forensics-receipt-hash" title={businessFreshness.receiptHash}>
          {businessFreshness.receiptHash}
        </span>
      )}
    </div>
  );
}

function RecoupAgentLauncher({
  disabled,
  onClick,
  placement = "inline"
}: {
  disabled: boolean;
  onClick: () => void;
  placement?: "inline" | "overview";
}) {
  return (
    <div className="maya-recoup-agent-float" data-placement={placement}>
      <Button
        aria-label="Open Recoup Copilot"
        className="maya-recoup-agent-button h-9 rounded-full px-3"
        data-testid="recoup-agent-launcher"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <MessageCircleIcon aria-hidden="true" data-icon="inline-start" />
        <span className="hidden sm:inline">Recoup Copilot</span>
      </Button>
    </div>
  );
}

function WorkItemDetailStatePanel({
  loadState,
  onRetry,
  onReturnToWorklist
}: {
  loadState: WorkItemDetailLoadState;
  onRetry: () => void;
  onReturnToWorklist: () => void;
}) {
  const isLoading = loadState.state === "loading";

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-work-item-detail-state">
      <Card className="rounded-lg shadow-none" size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isLoading ? (
              <RotateCwIcon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {isLoading ? "Loading detail" : "Detail unavailable"}
          </CardTitle>
          <CardDescription>Opening the selected work item.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className={cn("grid gap-3 rounded-lg border p-3", mayaAccent.proofMutedPanel)} data-testid="maya-work-item-detail-loading-skeleton">
              <Skeleton className="h-4 w-44" data-testid="maya-work-item-detail-skeleton-line" />
              <Skeleton className="h-4 w-full" data-testid="maya-work-item-detail-skeleton-line" />
              <Skeleton className="h-4 w-3/4" data-testid="maya-work-item-detail-skeleton-line" />
            </div>
          ) : null}
          <Alert variant={isLoading ? "default" : "destructive"}>
            {isLoading ? (
              <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
            ) : (
              <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
            )}
            <AlertTitle>{isLoading ? "Fetching governed detail packet" : "Source unavailable"}</AlertTitle>
            <AlertDescription>
              {isLoading
                ? "Case evidence, draft, approval, and audit state will remain unavailable until the detail packet returns."
                : "The governed detail packet is unavailable from source systems. Retry the request or review technical details."}
            </AlertDescription>
          </Alert>
          {loadState.state === "error" ? (
            <Collapsible className={cn("rounded-lg border p-3", mayaAccent.proofMutedPanel)} data-testid="maya-work-item-detail-error-details">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <p className="text-sm font-medium">Detail request details</p>
                  <p className="text-xs text-muted-foreground">
                    Technical fields are available for support without showing fallback case data.
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button size="sm" type="button" variant="outline">
                    Error details
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="pt-3">
                <div className="grid gap-3 md:grid-cols-4" data-testid="maya-work-item-detail-error">
                  <DetailStateFact label="Status" value={loadState.status === undefined ? "Unavailable" : String(loadState.status)} />
                  <DetailStateFact label="Missing source" value={loadState.missingSource ?? "Unavailable"} />
                  <DetailStateFact label="Correlation" value={loadState.correlationId ?? "Unavailable"} />
                  <DetailStateFact label="Source error" value={loadState.message} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </CardContent>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {loadState.state === "error" ? (
              <Button onClick={onRetry} size="sm" type="button">
                <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
                Retry
              </Button>
            ) : null}
            <Button onClick={onReturnToWorklist} size="sm" type="button" variant="outline">
              <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
              Return to worklist
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function DetailStateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("grid min-w-0 gap-1 rounded-md border p-3", mayaAccent.proofMutedPanel)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function toWorkItemDetailLoadError(lineId: string, error: unknown): WorkItemDetailLoadState {
  if (error instanceof WorkItemDetailIdentityError) {
    return {
      lineId,
      message: error.message,
      state: "error"
    };
  }

  if (error instanceof WorkItemDetailFetchError) {
    return {
      correlationId: error.correlationId,
      lineId,
      message: error.message,
      missingSource: error.missingSource,
      state: "error",
      status: error.status
    };
  }

  return {
    lineId,
    message: "Forensics work item detail is unavailable from governed sources.",
    state: "error"
  };
}

function assertWorkItemDetailIdentity(detail: MayaWorkItemDetail, requestedLineId: string, item: MayaWorklistItem): void {
  if (
    detail.lineId !== requestedLineId ||
    detail.selected.lineId !== requestedLineId ||
    detail.recommendedAction.lineId !== requestedLineId ||
    detail.recoveryDraft.actionId !== detail.recommendedAction.actionId ||
    detail.selected.draft.actionId !== detail.recoveryDraft.actionId ||
    !detail.workItem.lineIds.includes(requestedLineId) ||
    !item.lineIds.includes(requestedLineId) ||
    detail.workItem.lineId !== item.lineId
  ) {
    throw new WorkItemDetailIdentityError(requestedLineId);
  }
}

interface BeatTwelveReturnedWorklistProps {
  connectors: MayaForensicsSurfaceProps["connectors"];
  items: MayaWorklistItem[];
  kpiItems: MayaForensicsSurfaceProps["model"]["kpiStrip"];
  onSelectItem: (item: MayaWorklistItem) => void;
  selectedItem: MayaWorklistItem;
}

function BeatTwelveReturnedWorklist({
  connectors,
  items,
  kpiItems,
  onSelectItem,
  selectedItem
}: BeatTwelveReturnedWorklistProps) {
  const selectedRow = items.find((item) => item.lineId === selectedItem.lineId) ?? selectedItem;
  const metricCards = React.useMemo(() => beatTwelveMetricCards(items, kpiItems), [items, kpiItems]);
  const sourceReadinessTone = beatTwelveSourceReadinessTone(connectors.sourceTiles);

  React.useEffect(() => {
    document.querySelector<HTMLElement>('[data-testid="maya-beat-12-return-table"]')?.focus({ preventScroll: true });
  }, [selectedItem.lineId]);

  return (
    <section
      className="flex min-w-0 flex-1 flex-col gap-5"
      aria-label="Returned deduction worklist"
      data-testid="maya-beat-12-worklist-page"
    >
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid min-w-0 gap-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge className="w-fit" variant="outline">
                Worklist
              </Badge>
              <Badge className="w-fit" variant="secondary">
                Returned from local audit review
              </Badge>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className="h-7 gap-1.5 px-2 text-[11px]" size="sm" type="button" variant="outline">
                  <CircleHelpIcon aria-hidden="true" data-icon="inline-start" />
                  Evidence details
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <span>Evidence summaries only. Pending case detail fields: {missingBeatTwelveFields.join(", ")}.</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Alert className="min-h-[96px] self-start py-2 shadow-lg" data-testid="maya-beat-12-audit-unavailable-toast">
          <ShieldAlertIcon aria-hidden="true" data-icon="inline-start" />
          <AlertTitle>Audit status unavailable</AlertTitle>
          <AlertDescription className="text-xs">no committed audit receipt, queue update, or next-case assignment.</AlertDescription>
        </Alert>
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((item) => (
          <Card className={cn("min-h-[112px] rounded-lg shadow-none", mayaAccent.subtleCard)} key={`${item.label}-${item.value}`} size="sm">
            <CardHeader className="gap-2 pb-1">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="truncate text-2xl tabular-nums">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="truncate text-xs text-muted-foreground">{item.support}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={cn("rounded-lg py-0 shadow-none", mayaAccent.subtleCard)} data-testid="maya-beat-12-source-readiness" size="sm">
        <CardContent className="grid min-h-[62px] min-w-0 items-center gap-3 px-4 py-2 xl:grid-cols-[190px_repeat(7,minmax(0,1fr))]">
          <div className="flex min-w-0 items-center gap-2" data-status-tone={sourceReadinessTone}>
            <span className={beatTwelveSourceReadinessClass(sourceReadinessTone)}>
              {beatTwelveSourceReadinessIcon(sourceReadinessTone)}
            </span>
            <div className="grid min-w-0 gap-0.5">
              <p className="font-medium">Source Readiness</p>
              <p className="truncate text-xs text-muted-foreground">{connectors.lastRefreshedLabel}</p>
            </div>
          </div>
          {connectors.sourceTiles.map((source) => (
            <div className="grid min-w-0 gap-0.5 border-l border-l-primary/20 pl-3" data-status-tone={source.statusTone} key={`beat-12-${source.key}`}>
              <p className="truncate text-xs font-medium">{source.label}</p>
              <div
                className={
                  source.statusTone === "ready"
                    ? "flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--status-success-text)]"
                    : source.statusTone === "blocked"
                      ? "flex min-w-0 items-center gap-1.5 text-xs text-destructive"
                      : "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
                }
              >
                {source.statusTone === "ready" ? (
                  <CheckCircle2Icon aria-hidden="true" data-icon="source-status" />
                ) : source.statusTone === "blocked" ? (
                  <CircleAlertIcon aria-hidden="true" data-icon="source-status" />
                ) : (
                  <FlaskConicalIcon aria-hidden="true" data-icon="source-status" />
                )}
                <span className="truncate">{source.stateLabel}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className={cn("min-h-0 rounded-lg shadow-none", mayaAccent.subtleCard)} data-testid="maya-beat-12-deduction-cases" size="sm">
        <CardHeader className="gap-3 border-b pb-0">
          <Tabs defaultValue="all">
            <TabsList className="h-10">
              <TabsTrigger value="all">All work items {items.length.toString()}</TabsTrigger>
              <TabsTrigger value="recommended">Recommended</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="recovery">Recovery</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-sm" data-testid="maya-beat-12-return-table" tabIndex={-1}>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">
                  <span className="sr-only">Local selection</span>
                </TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Deduction case</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Potential exposure</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recommended action</TableHead>
                <TableHead>Last updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const isSelected = item.lineId === selectedRow.lineId;
                const isValidDeduction = item.verdict === "valid";
                const caseLabel = `Case ${String(index + 1)}`;

                return (
                  <TableRow
                    aria-selected={isSelected}
                    className={cn(
                      "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      mayaSelectedRowClass
                    )}
                    data-line-id={item.lineId}
                    data-selected={isSelected ? "true" : undefined}
                    data-testid="maya-worklist-row"
                    data-verdict={item.verdict}
                    key={`beat-12-${item.lineId}`}
                    onClick={() => {
                      onSelectItem(item);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectItem(item);
                      }
                    }}
                    tabIndex={0}
                  >
                    <TableCell className="px-4">
                      <span
                        aria-hidden="true"
                        className={
                          isSelected
                            ? "block size-2.5 rounded-full bg-primary"
                            : "block size-2.5 rounded-full border border-muted-foreground/35"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        aria-label="Priority unavailable"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                        title="Priority unavailable"
                      >
                        <span aria-hidden="true" className="size-2 rounded-full border border-muted-foreground/50" />
                        n/a
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <p className="font-medium">{item.workItemLabel}</p>
                        <p className="text-xs text-muted-foreground">{item.lineCount.toString()} lines</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{caseLabel}</span>
                        {isSelected ? (
                          <Badge className="w-fit" variant="outline">
                            Local focus
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{item.customerLabel}</TableCell>
                    <TableCell>
                      <Badge className="gap-1.5" data-verdict={item.verdict} variant={verdictBadgeVariant(item.verdict)}>
                        {isValidDeduction ? <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" /> : null}
                        {item.verdictLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{item.amount}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" title="Age unavailable">
                        n/a
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <span>{item.queueLabel}</span>
                        {isSelected ? <span className="text-xs text-muted-foreground">Audit unavailable</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <UserRoundCheckIcon aria-hidden="true" data-icon="inline-start" />
                        {item.recommendedActionLabel}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" title="Last updated unavailable">
                        n/a
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex min-h-12 items-center justify-between gap-3 border-t px-4 text-xs text-muted-foreground">
          <span>Showing {items.length.toString()} of {items.length.toString()} work items</span>
          <div className="flex min-w-0 items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className="hidden h-6 gap-1 px-2 text-[11px] xl:inline-flex" size="xs" type="button" variant="outline">
                  <CircleHelpIcon aria-hidden="true" data-icon="inline-start" />
                  Source fields pending
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <span>Pending source fields: {missingBeatTwelveFields.join(", ")}.</span>
              </TooltipContent>
            </Tooltip>
            <span className="hidden items-center gap-1 md:inline-flex">
              Rows per page
              <Badge className="h-6 px-2 text-[11px]" variant="outline">
                {items.length.toString()}
              </Badge>
            </span>
            <span className="hidden md:inline" aria-label="Server pagination unavailable">
              Server pagination unavailable
            </span>
            <Badge className="h-7 min-w-7 justify-center px-2 text-[11px]" variant="secondary">
              Page 1
            </Badge>
          </div>
        </div>
      </Card>
    </section>
  );
}
