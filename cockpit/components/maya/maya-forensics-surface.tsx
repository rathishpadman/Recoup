"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ChevronLeftIcon,
  FileSearchIcon,
  FlaskConicalIcon,
  MessageCircleIcon,
  RotateCwIcon,
  ShieldAlertIcon,
  UserRoundCheckIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeductionCaseWorkspace } from "./deduction-case-workspace.tsx";
import { DeductionWorklistTable } from "./deduction-worklist-table.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { MayaRunKpiStrip } from "./maya-run-kpi-strip.tsx";
import { MayaWorkspaceShell } from "./maya-workspace-shell.tsx";
import { SourceReadinessStrip } from "./source-readiness-strip.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  beginWorkItemDetailRequest,
  cancelWorkItemDetailRequest,
  isCurrentWorkItemDetailRequest
} from "./work-item-detail-request-gate.ts";
import type {
  MayaForensicsSurfaceProps,
  MayaSourceTile,
  MayaSurfaceSection,
  MayaWorkItemDetail,
  MayaWorklistItem
} from "./types.ts";

const missingBeatTwelveFields = [
  "Priority",
  "Age",
  "Status history",
  "Last updated",
  "Server pagination",
  "Audit receipt",
  "Next-case ranking"
] as const;

interface BeatTwelveMetricCard {
  label: string;
  support: string;
  value: string;
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

function beatTwelveMetricCards(
  items: MayaWorklistItem[],
  kpiItems: MayaForensicsSurfaceProps["model"]["kpiStrip"]
): BeatTwelveMetricCard[] {
  const exposureKpi = kpiItems.find((item) => /\bexposure\b/iu.test(item.label));

  return [
    {
      label: "Cases in Worklist",
      support: "Fetched rows only",
      value: items.length.toString()
    },
    {
      label: "Total potential exposure",
      support: exposureKpi?.support ?? "Exposure KPI unavailable",
      value: exposureKpi?.value ?? "Unavailable"
    },
    {
      label: "Recommended next",
      support: "Next-case ranking not exposed",
      value: "Unavailable"
    },
    {
      label: "Avg. age",
      support: "Age field not exposed",
      value: "Unavailable"
    },
    {
      label: "Audit coverage",
      support: "Committed audit receipt not exposed",
      value: "Unavailable"
    }
  ];
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

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [activeSection, setActiveSection] = React.useState<MayaSurfaceSection>("overview");
  const [selectedWorklistItem, setSelectedWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const [openedCaseWorklistItem, setOpenedCaseWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const [openedCaseDetail, setOpenedCaseDetail] = React.useState<MayaWorkItemDetail | undefined>();
  const [workItemDetailLoadState, setWorkItemDetailLoadState] = React.useState<WorkItemDetailLoadState | undefined>();
  const [returnContextLineId, setReturnContextLineId] = React.useState<string | undefined>();
  const [agentDockOpenLineId, setAgentDockOpenLineId] = React.useState<string | undefined>();
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
    openedCaseDetail.lineId === openedCaseWorklistItem.lineId
      ? openedCaseDetail
      : undefined;
  const agentLaunchItem = activeCaseDetail?.workItem ?? openedCaseWorklistItem ?? visibleSelectedWorklistItem;

  const openInvestigationForItem = React.useCallback(async (item: MayaWorklistItem, options?: { openQueryDockOnReady?: boolean }) => {
    const requestId = beginWorkItemDetailRequest(detailRequestSequence);
    setActiveSection("cases");
    setReturnContextLineId(undefined);
    setSelectedWorklistItem(item);
    setOpenedCaseWorklistItem(item);
    setOpenedCaseDetail(undefined);
    setWorkItemDetailLoadState({ lineId: item.lineId, state: "loading" });
    if (options?.openQueryDockOnReady === true) {
      setAgentDockOpenLineId(item.lineId);
    } else {
      setAgentDockOpenLineId(undefined);
    }

    try {
      const detail = await fetchForensicsWorkItemDetail(item.lineId);
      if (!isCurrentWorkItemDetailRequest(detailRequestSequence, requestId)) {
        return;
      }
      assertWorkItemDetailIdentity(detail, item);

      setOpenedCaseDetail(detail);
      setOpenedCaseWorklistItem(detail.workItem);
      setSelectedWorklistItem(detail.workItem);
      setWorkItemDetailLoadState(undefined);
    } catch (error) {
      if (!isCurrentWorkItemDetailRequest(detailRequestSequence, requestId)) {
        return;
      }

      setOpenedCaseDetail(undefined);
      setWorkItemDetailLoadState(toWorkItemDetailLoadError(item.lineId, error));
      setAgentDockOpenLineId(undefined);
    }
  }, []);

  const handleSelectWorklistItem = React.useCallback(
    (item: MayaWorklistItem) => {
      cancelWorkItemDetailRequest(detailRequestSequence);
      setSelectedWorklistItem(item);
      setReturnContextLineId(undefined);
      setOpenedCaseWorklistItem(undefined);
      setOpenedCaseDetail(undefined);
      setWorkItemDetailLoadState(undefined);
      setAgentDockOpenLineId(undefined);
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
  }, [openedCaseWorklistItem]);

  const handleLaunchRecoupAgent = React.useCallback(() => {
    if (agentLaunchItem === undefined) {
      return;
    }

    setAgentDockOpenLineId(agentLaunchItem.lineId);
    if (activeCaseDetail !== undefined && openedCaseWorklistItem?.lineId === agentLaunchItem.lineId) {
      return;
    }

    void openInvestigationForItem(agentLaunchItem, { openQueryDockOnReady: true });
  }, [activeCaseDetail, agentLaunchItem, openInvestigationForItem, openedCaseWorklistItem?.lineId]);

  const handleQueryDockIntentConsumed = React.useCallback(() => {
    setAgentDockOpenLineId(undefined);
  }, []);

  const handleSurfaceSectionChange = React.useCallback((section: MayaSurfaceSection) => {
    setActiveSection(section);
    cancelWorkItemDetailRequest(detailRequestSequence);
    setOpenedCaseWorklistItem(undefined);
    setOpenedCaseDetail(undefined);
    setWorkItemDetailLoadState(undefined);
    setReturnContextLineId(undefined);
    setAgentDockOpenLineId(undefined);
  }, []);

  React.useEffect(() => {
    return () => {
      cancelWorkItemDetailRequest(detailRequestSequence);
    };
  }, []);

  React.useEffect(() => {
    if (openedCaseWorklistItem === undefined && returnContextLineId !== undefined) {
      window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }
  }, [openedCaseWorklistItem, returnContextLineId]);

  function renderMayaRootSection(): React.ReactNode {
    switch (activeSection) {
      case "overview": {
        const validDeductionItems = model.worklist.filter((item) => item.verdict === "valid");
        const validDeductionCount = model.worklist.filter((item) => item.verdict === "valid").length;
        const readySourceCount = connectors.sourceTiles.filter((source) => source.statusTone === "ready").length;
        const overviewFocusItem = visibleSelectedWorklistItem;
        const overviewFocusLabel = visibleSelectedWorklistItem === undefined ? "No selected case" : "Selected case";

        return (
          <section className="flex min-w-0 flex-col gap-3" data-testid="maya-root-section-overview">
            <MayaRunKpiStrip actionInbox={model.actionInbox} items={model.kpiStrip} recoveryTracker={model.recoveryTracker} />
            <SourceReadinessStrip connectors={connectors} />
            <section
              className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]"
              data-testid="maya-overview-command-center"
            >
              <div className="grid min-w-0 gap-3">
                <div className="grid min-w-0 gap-3 md:grid-cols-4" data-testid="maya-overview-intelligence-grid">
                  <DetailStateFact label="Fetched cases" value={model.worklist.length.toString()} />
                  <DetailStateFact label="Valid deductions" value={validDeductionCount.toString()} />
                  <DetailStateFact label="Pending actions" value={model.actionInbox.length.toString()} />
                  <DetailStateFact
                    label="Ready sources"
                    value={`${readySourceCount.toString()} / ${connectors.sourceTiles.length.toString()}`}
                  />
                </div>

                <Card className="rounded-lg shadow-none" data-testid="maya-overview-positive-cases" size="sm">
                  <CardHeader className="gap-1.5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1">
                        <CardTitle className="text-base">Positive deduction cases</CardTitle>
                        <CardDescription>Rows marked valid by the fetched Maya read model.</CardDescription>
                      </div>
                      <span
                        className="inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-xs font-medium text-muted-foreground"
                        data-testid="maya-valid-deduction-signal"
                      >
                        {validDeductionCount.toString()} valid
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {validDeductionItems.length === 0 ? (
                      <div className="px-4 pb-4">
                        <MayaEmptyState description="The fetched worklist returned no valid deduction rows." title="No valid rows" />
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-2 p-3 md:hidden" data-testid="maya-overview-positive-mobile-list">
                          {validDeductionItems.map((item) => (
                            <div className="grid gap-2 rounded-md border bg-background p-3" data-verdict={item.verdict} key={`overview-valid-mobile-${item.lineId}`}>
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-sm font-medium">{item.scenarioLabel}</p>
                                  <p className="truncate text-xs text-muted-foreground">{item.customerLabel}</p>
                                </div>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.amount}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <Badge className="gap-1.5" data-verdict={item.verdict} variant="secondary">
                                  <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
                                  {item.verdictLabel}
                                </Badge>
                                <Badge variant="outline">{item.lineId}</Badge>
                                <Badge variant="outline">{item.evidenceLabel}</Badge>
                              </div>
                              <div className="grid gap-0.5 text-xs text-muted-foreground">
                                <span>{item.routingLabel}</span>
                                <span>{item.recommendedActionLabel}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Case</TableHead>
                                <TableHead>Counterparty</TableHead>
                                <TableHead>Verdict</TableHead>
                                <TableHead>Evidence</TableHead>
                                <TableHead>Routing</TableHead>
                                <TableHead>Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {validDeductionItems.map((item) => (
                                <TableRow data-verdict={item.verdict} key={`overview-valid-${item.lineId}`}>
                                  <TableCell>
                                    <div className="grid min-w-0 gap-0.5">
                                      <span className="truncate font-medium">{item.scenarioLabel}</span>
                                      <span className="truncate text-xs text-muted-foreground">{item.lineId}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{item.customerLabel}</TableCell>
                                  <TableCell>
                                    <Badge className="gap-1.5" data-verdict={item.verdict} variant="secondary">
                                      <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
                                      {item.verdictLabel}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{item.evidenceLabel}</TableCell>
                                  <TableCell>
                                    <div className="grid min-w-0 gap-0.5">
                                      <span className="truncate">{item.routingLabel}</span>
                                      <span className="truncate text-xs text-muted-foreground">{item.recommendedActionLabel}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="tabular-nums">{item.amount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-lg shadow-none" data-testid="maya-overview-next-case" size="sm">
                <CardHeader className="gap-1.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <CardTitle className="text-base">{overviewFocusLabel}</CardTitle>
                      <CardDescription>Fetched read-model row selected for review.</CardDescription>
                    </div>
                    <Badge variant="outline">Read-model backed</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {overviewFocusItem === undefined ? (
                    <MayaEmptyState description="Select a fetched worklist row to inspect the case without inferring a next-best case." title="No selected case" />
                  ) : (() => {
                    const overviewFocusIsLoading =
                      workItemDetailLoadState?.state === "loading" &&
                      workItemDetailLoadState.lineId === overviewFocusItem.lineId;

                    return (
                      <>
                        <div className="grid min-w-0 gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge className="gap-1.5" data-verdict={overviewFocusItem.verdict} variant="secondary">
                              {overviewFocusItem.verdict === "valid" ? (
                                <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
                              ) : null}
                              {overviewFocusItem.verdictLabel}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{overviewFocusItem.lineId}</span>
                          </div>
                          <div className="grid min-w-0 gap-1">
                            <h2 className="truncate text-lg font-semibold leading-tight">{overviewFocusItem.scenarioLabel}</h2>
                            <p className="truncate text-sm text-muted-foreground">{overviewFocusItem.customerLabel}</p>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <DetailStateFact label="Potential exposure" value={overviewFocusItem.amount} />
                          <DetailStateFact label="Evidence" value={overviewFocusItem.evidenceLabel} />
                          <DetailStateFact label="Recommended action" value={overviewFocusItem.recommendedActionLabel} />
                        </div>
                        <Button
                          className="w-fit"
                          disabled={overviewFocusIsLoading}
                          onClick={() => {
                            void openInvestigationForItem(overviewFocusItem);
                          }}
                          size="sm"
                          type="button"
                        >
                          {overviewFocusIsLoading ? (
                            <RotateCwIcon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
                          ) : (
                            <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
                          )}
                          {overviewFocusIsLoading ? "Loading detail" : "Open investigation"}
                        </Button>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </section>
          </section>
        );
      }
      case "worklist":
        return renderWorklistSection();
      case "cases":
        return renderCasesSection();
      case "evidence":
        return (
          <section
            className="grid min-h-0 min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]"
            data-testid="maya-root-section-evidence"
          >
            <Card className="rounded-lg shadow-none" size="sm">
              <CardHeader>
                <CardTitle className="text-base">Selected evidence</CardTitle>
                <CardDescription>
                  {visibleSelectedWorklistItem === undefined
                    ? "Select a fetched row to inspect evidence readiness."
                    : visibleSelectedWorklistItem.lineId}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {visibleSelectedWorklistItem === undefined ? (
                  <MayaEmptyState description="No row is selected for evidence review." title="Select a case" />
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <DetailStateFact label="Evidence score" value={visibleSelectedWorklistItem.evidenceScoreLabel} />
                      <DetailStateFact
                        label="Documents"
                        value={selectedHasBackendDetail ? model.selected.evidencePack.documents.length.toString() : "Contract gap"}
                      />
                      <DetailStateFact label="Readiness" value={visibleSelectedWorklistItem.evidenceLabel} />
                    </div>
                    <Alert>
                      <ShieldAlertIcon aria-hidden="true" data-icon="inline-start" />
                      <AlertTitle>{selectedHasBackendDetail ? "Backend evidence attached" : "Contract gap"}</AlertTitle>
                      <AlertDescription>
                        {selectedHasBackendDetail
                          ? "The selected backend detail packet exposes evidence documents and record IDs."
                          : "Row-switched evidence documents are unavailable until the backend exposes detail for this row."}
                      </AlertDescription>
                    </Alert>
                    <Button
                      className="w-fit"
                      onClick={() => {
                        void openInvestigationForItem(visibleSelectedWorklistItem);
                      }}
                      size="sm"
                      type="button"
                    >
                      <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
                      Open investigation
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-lg shadow-none" size="sm">
              <CardHeader>
                <CardTitle className="text-base">Source readiness</CardTitle>
                <CardDescription>{connectors.lastRefreshedLabel}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {connectors.sourceTiles.map((source) => (
                  <div className="grid gap-1 rounded-md border bg-muted/20 p-3" data-status-tone={source.statusTone} key={source.key}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{source.label}</span>
                      <Badge variant="outline">{source.stateLabel}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{source.modeLabel}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        );
      case "approvals":
        return (
          <section className="min-w-0" data-testid="maya-root-section-approvals">
            <Card className="rounded-lg shadow-none" size="sm">
              <CardHeader>
                <CardTitle className="text-base">Action inbox</CardTitle>
                <CardDescription>Backend HITL posture from fetched action rows.</CardDescription>
              </CardHeader>
              <CardContent>
                {model.actionInbox.length === 0 ? (
                  <MayaEmptyState description="The read model returned no pending human actions." title="No pending HITL actions" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {model.actionInbox.map((item) => (
                        <TableRow key={item.actionId}>
                          <TableCell>{item.lineId}</TableCell>
                          <TableCell>{item.actionLabel}</TableCell>
                          <TableCell>{item.statusLabel ?? "Unavailable"}</TableCell>
                          <TableCell className="tabular-nums">{item.amount}</TableCell>
                        </TableRow>
                      ))}
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
            onSelectItem={handleSelectWorklistItem}
            {...(visibleSelectedWorklistItem === undefined ? {} : { selectedLineId: visibleSelectedWorklistItem.lineId })}
          />
        </section>
        <aside className="min-w-0" aria-label="Work item starter">
          <Card className="min-h-[568px] rounded-lg shadow-none" data-testid="maya-work-item-pane" size="sm">
            {visibleSelectedWorklistItem === undefined ? (
              <CardContent className="flex min-h-[568px] flex-col items-center justify-center px-8">
                {backendSelectionUnavailable && model.worklist.length > 0 ? (
                  <Alert className="mb-4" variant="destructive">
                    <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
                    <AlertTitle>Backend-selected line unavailable</AlertTitle>
                    <AlertDescription>
                      The backend selected line is not present in the fetched worklist. Select a row to request its
                      governed detail packet; no fallback business values are displayed.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <MayaEmptyState
                  description="View details, evidence, and workflow actions for the selected item."
                  title="Select a deduction to open its work item"
                />
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <CardTitle className="truncate">{visibleSelectedWorklistItem.customerLabel}</CardTitle>
                      <CardDescription className="truncate">{visibleSelectedWorklistItem.lineId}</CardDescription>
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
                          Returned locally from the Audit tab. Local focus only; no backend queue update or audit refresh is inferred.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <div className="grid gap-1">
                      <p className="text-sm text-muted-foreground">Scenario</p>
                      <h2 className="text-xl font-semibold leading-tight">{visibleSelectedWorklistItem.scenarioLabel}</h2>
                      <div className="flex flex-wrap gap-1" aria-label="Selected work item line IDs">
                        {visibleSelectedWorklistItem.lineIds.map((lineId) => (
                          <Badge key={`selected-${lineId}`} variant="outline">
                            {lineId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div className="grid gap-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Amount</span>
                        <strong className="tabular-nums">{visibleSelectedWorklistItem.amount}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Verdict</span>
                        <Badge data-verdict={visibleSelectedWorklistItem.verdict} variant="secondary">
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
                        className="grid gap-2 rounded-lg border bg-muted/35 p-3"
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
                        <p className="text-sm font-medium">Read-model detail packet</p>
                        <p className="text-sm text-muted-foreground" data-testid="maya-selected-row-contract-note">
                          {selectedHasBackendDetail
                            ? "The current fixed evidence packet corresponds to this row."
                            : "Detailed evidence is unavailable for this row until the backend exposes row switching."}
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

  function renderCasesSection(): React.ReactNode {
    return (
      <section
        className="grid min-h-0 min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]"
        data-testid="maya-root-section-cases"
      >
        <Card className="rounded-lg shadow-none" data-testid="maya-cases-fetched-rows" size="sm">
          <CardHeader>
            <CardTitle className="text-base">Fetched cases</CardTitle>
            <CardDescription>{model.worklist.length.toString()} fetched rows from the read model.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {model.worklist.length === 0 ? (
              <div className="px-6 py-8">
                <MayaEmptyState description="The read model returned no deduction case rows." title="No fetched cases" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>
                      <span className="sr-only">Selection</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.worklist.map((item) => {
                    const isSelected = visibleSelectedWorklistItem?.lineId === item.lineId;

                    return (
                      <TableRow aria-selected={isSelected} data-testid="maya-case-row" key={`case-${item.lineId}`}>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-medium">{item.scenarioLabel}</span>
                            <span className="text-xs text-muted-foreground">{item.lineId}</span>
                          </div>
                        </TableCell>
                        <TableCell>{item.customerLabel}</TableCell>
                        <TableCell>
                          <Badge data-verdict={item.verdict} variant="secondary">
                            {item.verdict === "valid" ? <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" /> : null}
                            {item.verdictLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.queueLabel}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            aria-pressed={isSelected}
                            onClick={() => {
                              setSelectedWorklistItem(item);
                            }}
                            size="sm"
                            type="button"
                            variant={isSelected ? "secondary" : "ghost"}
                          >
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <aside className="min-w-0" aria-label="Selected case starter">
          <Card className="min-h-[420px] rounded-lg shadow-none" data-testid="maya-cases-selected-starter" size="sm">
            <CardHeader>
              <CardTitle className="text-base">Selected case</CardTitle>
              <CardDescription>
                {visibleSelectedWorklistItem === undefined ? "No fetched case selected." : visibleSelectedWorklistItem.lineId}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {visibleSelectedWorklistItem === undefined ? (
                <>
                  {backendSelectionUnavailable && model.worklist.length > 0 ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
                      <AlertTitle>Backend-selected line unavailable</AlertTitle>
                      <AlertDescription>
                        The backend selected line is not present in the fetched cases. Select a fetched row; no fallback business values are displayed.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <MayaEmptyState description="Select a fetched row to prepare the case detail request." title="Select a case" />
                </>
              ) : (
                <>
                  <div className="grid gap-3">
                    <DetailStateFact label="Customer" value={visibleSelectedWorklistItem.customerLabel} />
                    <DetailStateFact label="Scenario" value={visibleSelectedWorklistItem.scenarioLabel} />
                    <DetailStateFact label="Fetched line IDs" value={visibleSelectedWorklistItem.lineIds.length.toString()} />
                    <DetailStateFact label="Evidence" value={visibleSelectedWorklistItem.evidenceLabel} />
                  </div>
                  <Alert>
                    <ShieldAlertIcon aria-hidden="true" data-icon="inline-start" />
                    <AlertTitle>{selectedHasBackendDetail ? "Backend detail starter" : "Contract gap"}</AlertTitle>
                    <AlertDescription>
                      {selectedHasBackendDetail
                        ? "This selected case corresponds to the backend detail packet exposed by the read model."
                        : "Case detail for this row remains unavailable until the backend exposes row-specific detail."}
                    </AlertDescription>
                  </Alert>
                  <Button
                    className="w-fit"
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
                </>
              )}
            </CardContent>
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
        heading={caseWorklistItem.scenarioLabel}
        onSectionChange={handleSurfaceSectionChange}
        pendingActionCount={model.actionInbox.length}
        refreshedLabel={connectors.lastRefreshedLabel}
        session={session}
        support={`${caseWorklistItem.customerLabel} / ${caseWorklistItem.lineId}`}
        worklistCount={model.worklist.length}
      >
        <section className="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]" aria-label="Maya case overview">
          <aside className="min-w-0" data-testid="maya-case-worklist-rail">
            <DeductionWorklistTable
              items={model.worklist}
              onSelectItem={handleSelectWorklistItem}
              selectedLineId={caseWorklistItem.lineId}
              variant="rail"
            />
          </aside>
          {activeCaseDetail === undefined ? (
            <WorkItemDetailStatePanel
              loadState={workItemDetailLoadState ?? { lineId: caseWorklistItem.lineId, state: "loading" }}
              onReturnToWorklist={handleReturnToWorklist}
            />
          ) : (
            <DeductionCaseWorkspace
              actionInbox={activeCaseDetail.actionInbox}
              auditState={activeCaseDetail.auditState}
              hasBackendDetail={true}
              journey={activeCaseDetail.mayaJourney}
              multimodalDock={activeCaseDetail.multimodalDock}
              onQueryDockIntentConsumed={handleQueryDockIntentConsumed}
              onReturnToWorklist={handleReturnToWorklist}
              openQueryDockLineId={agentDockOpenLineId}
              recommendedAction={activeCaseDetail.recommendedAction}
              selected={activeCaseDetail.selected}
              selectedWorklistItem={activeCaseDetail.workItem}
              sourceTiles={connectors.sourceTiles}
            />
          )}
        </section>
        <RecoupAgentLauncher disabled={agentLaunchItem === undefined} onClick={handleLaunchRecoupAgent} />
      </MayaWorkspaceShell>
    );
  }

  if (returnedWorklistItem !== undefined) {
    return (
      <MayaWorkspaceShell
        activeSection="worklist"
        heading="Deduction Cases"
        onSectionChange={handleSurfaceSectionChange}
        pendingActionCount={model.actionInbox.length}
        refreshedLabel={connectors.lastRefreshedLabel}
        session={session}
        support="Review, audit, and action fetched deduction cases."
        worklistCount={model.worklist.length}
      >
        <BeatTwelveReturnedWorklist
          connectors={connectors}
          items={model.worklist}
          kpiItems={model.kpiStrip}
          onSelectItem={(item) => {
            void openInvestigationForItem(item);
          }}
          selectedItem={returnedWorklistItem}
        />
        <RecoupAgentLauncher disabled={agentLaunchItem === undefined} onClick={handleLaunchRecoupAgent} />
      </MayaWorkspaceShell>
    );
  }

  return (
    <MayaWorkspaceShell
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      pendingActionCount={model.actionInbox.length}
      refreshedLabel={connectors.lastRefreshedLabel}
      session={session}
      worklistCount={model.worklist.length}
    >
      <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label="Maya morning run summary">
        {renderMayaRootSection()}
      </section>
      <RecoupAgentLauncher disabled={agentLaunchItem === undefined} onClick={handleLaunchRecoupAgent} />
    </MayaWorkspaceShell>
  );
}

function RecoupAgentLauncher({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      aria-label="Open Recoup Agent"
      className="fixed bottom-5 right-5 z-40 h-11 rounded-full px-4 shadow-lg"
      data-testid="recoup-agent-launcher"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <MessageCircleIcon aria-hidden="true" data-icon="inline-start" />
      <span className="hidden sm:inline">Recoup Agent</span>
    </Button>
  );
}

function WorkItemDetailStatePanel({
  loadState,
  onReturnToWorklist
}: {
  loadState: WorkItemDetailLoadState;
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
            {isLoading ? "Loading backend detail" : "Backend detail unavailable"}
          </CardTitle>
          <CardDescription>{loadState.lineId}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3" data-testid="maya-work-item-detail-loading-skeleton">
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
            <AlertTitle>{isLoading ? "Fetching governed detail packet" : "Fail-closed detail fetch"}</AlertTitle>
            <AlertDescription>
              {isLoading
                ? "Case evidence, draft, approval, and audit state will remain unavailable until the backend detail packet returns."
                : loadState.message}
            </AlertDescription>
          </Alert>
          {loadState.state === "error" ? (
            <div className="grid gap-3 md:grid-cols-3" data-testid="maya-work-item-detail-error">
              <DetailStateFact label="Status" value={loadState.status === undefined ? "Unavailable" : String(loadState.status)} />
              <DetailStateFact label="Missing source" value={loadState.missingSource ?? "Unavailable"} />
              <DetailStateFact label="Correlation" value={loadState.correlationId ?? "Unavailable"} />
            </div>
          ) : null}
        </CardContent>
        <CardContent className="pt-0">
          <Button onClick={onReturnToWorklist} size="sm" type="button" variant="outline">
            <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
            Return to worklist
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function DetailStateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-muted/20 p-3">
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
    message: "Forensics work item detail is unavailable from governed backend sources.",
    state: "error"
  };
}

function assertWorkItemDetailIdentity(detail: MayaWorkItemDetail, item: MayaWorklistItem): void {
  if (detail.lineId !== item.lineId || detail.workItem.lineId !== item.lineId) {
    throw new WorkItemDetailIdentityError(item.lineId);
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
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5" aria-label="Returned worklist source constraints">
              <Badge className="h-7 px-2 text-[11px]" variant="outline">
                Fetched rows only
              </Badge>
              <Badge className="h-7 px-2 text-[11px]" variant="outline">
                Read-model gaps
              </Badge>
            </div>
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
          <Card className="min-h-[112px] rounded-lg shadow-none" key={`${item.label}-${item.value}`} size="sm">
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

      <Card className="rounded-lg py-0 shadow-none" data-testid="maya-beat-12-source-readiness" size="sm">
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
            <div className="grid min-w-0 gap-0.5 border-l pl-3" data-status-tone={source.statusTone} key={`beat-12-${source.key}`}>
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

      <Card className="min-h-0 rounded-lg shadow-none" data-testid="maya-beat-12-deduction-cases" size="sm">
        <CardHeader className="gap-3 border-b pb-0">
          <Tabs defaultValue="all">
            <TabsList className="h-10">
              <TabsTrigger value="all">All fetched {items.length.toString()}</TabsTrigger>
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
                <TableHead>
                  Priority <span className="text-xs font-normal text-muted-foreground">(gap)</span>
                </TableHead>
                <TableHead>Deduction case</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Potential exposure</TableHead>
                <TableHead>
                  Age <span className="text-xs font-normal text-muted-foreground">(gap)</span>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recommended action</TableHead>
                <TableHead>
                  Last updated <span className="text-xs font-normal text-muted-foreground">(gap)</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isSelected = item.lineId === selectedRow.lineId;
                const isValidDeduction = item.verdict === "valid";

                return (
                  <TableRow
                    aria-selected={isSelected}
                    className="cursor-pointer outline-none data-[selected=true]:bg-muted/35 data-[selected=true]:ring-1 data-[selected=true]:ring-border/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
                            ? "block size-2.5 rounded-full bg-muted-foreground"
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
                        <p className="font-medium">{item.scenarioLabel}</p>
                        <p className="text-xs text-muted-foreground">{item.lineCount.toString()} lines</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{item.lineId}</span>
                        {isSelected ? (
                          <Badge className="w-fit" variant="outline">
                            Local focus
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{item.customerLabel}</TableCell>
                    <TableCell>
                      <Badge className="gap-1.5" data-verdict={item.verdict} variant="secondary">
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
          <span>Showing {items.length.toString()} of {items.length.toString()} fetched rows</span>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate xl:inline">Backend gaps: {missingBeatTwelveFields.join(", ")}</span>
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
