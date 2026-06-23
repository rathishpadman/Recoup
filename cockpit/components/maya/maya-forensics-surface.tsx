"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Columns3Icon,
  FileSearchIcon,
  FlaskConicalIcon,
  FilterIcon,
  NotebookPenIcon,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MayaForensicsSurfaceProps, MayaWorklistItem } from "./types.ts";

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

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [selectedWorklistItem, setSelectedWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const [openedCaseWorklistItem, setOpenedCaseWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const [returnContextLineId, setReturnContextLineId] = React.useState<string | undefined>();
  const backendSelectedWorklistItem = React.useMemo(
    () => model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)),
    [model.selected.lineId, model.worklist]
  );
  const fallbackSelectedWorklistItem = model.worklist.at(0);
  const initialSelectedWorklistItem = backendSelectedWorklistItem ?? fallbackSelectedWorklistItem;
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
  const openedCaseHasBackendDetail =
    openedCaseWorklistItem !== undefined && openedCaseWorklistItem.lineIds.includes(model.selected.lineId);

  const handleSelectWorklistItem = React.useCallback(
    (item: MayaWorklistItem) => {
      setSelectedWorklistItem(item);
      setReturnContextLineId(undefined);
      if (openedCaseWorklistItem !== undefined) {
        setOpenedCaseWorklistItem(item);
      }
    },
    [openedCaseWorklistItem]
  );

  const handleReturnToWorklist = React.useCallback(() => {
    if (openedCaseWorklistItem === undefined) {
      return;
    }

    setSelectedWorklistItem(openedCaseWorklistItem);
    setReturnContextLineId(openedCaseWorklistItem.lineId);
    setOpenedCaseWorklistItem(undefined);
  }, [openedCaseWorklistItem]);

  React.useEffect(() => {
    if (openedCaseWorklistItem === undefined && returnContextLineId !== undefined) {
      window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }
  }, [openedCaseWorklistItem, returnContextLineId]);

  if (openedCaseWorklistItem !== undefined) {
    return (
      <MayaWorkspaceShell
        heading={openedCaseWorklistItem.scenarioLabel}
        pendingActionCount={model.actionInbox.length}
        refreshedLabel={connectors.lastRefreshedLabel}
        session={session}
        support={`${openedCaseWorklistItem.customerLabel} / ${openedCaseWorklistItem.lineId}`}
        worklistCount={model.worklist.length}
      >
        <section className="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]" aria-label="Maya case overview">
          <aside className="min-w-0" data-testid="maya-case-worklist-rail">
            <DeductionWorklistTable
              items={model.worklist}
              onSelectItem={handleSelectWorklistItem}
              selectedLineId={openedCaseWorklistItem.lineId}
              variant="rail"
            />
          </aside>
          <DeductionCaseWorkspace
            actionInbox={model.actionInbox}
            hasBackendDetail={openedCaseHasBackendDetail}
            journey={model.mayaJourney}
            multimodalDock={model.multimodalDock}
            onReturnToWorklist={handleReturnToWorklist}
            selected={model.selected}
            selectedWorklistItem={openedCaseWorklistItem}
            sourceTiles={connectors.sourceTiles}
          />
        </section>
      </MayaWorkspaceShell>
    );
  }

  if (returnedWorklistItem !== undefined) {
    return (
      <MayaWorkspaceShell
        heading="Deduction Cases"
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
            setSelectedWorklistItem(item);
            setReturnContextLineId(item.lineId);
          }}
          selectedItem={returnedWorklistItem}
        />
      </MayaWorkspaceShell>
    );
  }

  return (
    <MayaWorkspaceShell
      pendingActionCount={model.actionInbox.length}
      refreshedLabel={connectors.lastRefreshedLabel}
      session={session}
      worklistCount={model.worklist.length}
    >
      <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label="Maya morning run summary">
        <MayaRunKpiStrip actionInbox={model.actionInbox} items={model.kpiStrip} recoveryTracker={model.recoveryTracker} />
        <SourceReadinessStrip connectors={connectors} />
        <div className="grid min-h-0 min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
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
                          <Badge variant="secondary">{visibleSelectedWorklistItem.verdictLabel}</Badge>
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
                        <div className="grid gap-2">
                          <Button
                            data-testid="maya-local-row-action-open"
                            onClick={() => {
                              setReturnContextLineId(undefined);
                              setOpenedCaseWorklistItem(visibleSelectedWorklistItem);
                              setSelectedWorklistItem(visibleSelectedWorklistItem);
                            }}
                            size="sm"
                            type="button"
                          >
                            <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
                            Open investigation
                          </Button>
                          <Button data-testid="maya-local-row-action-add-note" disabled size="sm" type="button" variant="outline">
                            <NotebookPenIcon aria-hidden="true" data-icon="inline-start" />
                            Add note
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>
          </aside>
        </div>
      </section>
    </MayaWorkspaceShell>
  );
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
  const recommendedRows = React.useMemo(
    () => items.filter((item) => item.recommendedActionLabel.trim().length > 0),
    [items]
  );
  const reviewRows = React.useMemo(
    () => items.filter((item) => /\breview\b/iu.test(item.queueLabel)),
    [items]
  );
  const billingRows = React.useMemo(
    () => items.filter((item) => /\bbilling\b/iu.test(item.queueLabel)),
    [items]
  );
  const recoveryRows = React.useMemo(
    () => items.filter((item) => /\brecovery\b/iu.test(item.verdictLabel) || /\brecovery\b/iu.test(item.routingLabel)),
    [items]
  );
  const selectedRow = items.find((item) => item.lineId === selectedItem.lineId) ?? selectedItem;
  const metricCards = React.useMemo(() => beatTwelveMetricCards(items, kpiItems), [items, kpiItems]);

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
            <div className="flex shrink-0 items-center gap-2">
              <Button disabled size="sm" type="button" variant="outline">
                <FilterIcon aria-hidden="true" data-icon="inline-start" />
                Filters
              </Button>
              <Button disabled size="sm" type="button" variant="outline">
                <Columns3Icon aria-hidden="true" data-icon="inline-start" />
                Columns
              </Button>
              <Button aria-label="Refresh unavailable: no backend refresh action is exposed" disabled size="icon-sm" type="button" variant="outline">
                <RotateCwIcon aria-hidden="true" data-icon="button-icon" />
              </Button>
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
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2Icon className="text-[color:var(--status-success-text)]" aria-hidden="true" data-icon="inline-start" />
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
              <TabsTrigger value="recommended">Recommended {recommendedRows.length.toString()}</TabsTrigger>
              <TabsTrigger value="review">Review {reviewRows.length.toString()}</TabsTrigger>
              <TabsTrigger value="billing">Billing {billingRows.length.toString()}</TabsTrigger>
              <TabsTrigger value="recovery">Recovery {recoveryRows.length.toString()}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-sm" data-testid="maya-beat-12-return-table">
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

                return (
                  <TableRow
                    aria-selected={isSelected}
                    className="cursor-pointer data-[selected=true]:bg-primary/5 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/25"
                    data-line-id={item.lineId}
                    data-selected={isSelected ? "true" : undefined}
                    data-testid="maya-worklist-row"
                    key={`beat-12-${item.lineId}`}
                    onClick={() => {
                      onSelectItem(item);
                    }}
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
                      <Badge variant="secondary">{item.verdictLabel}</Badge>
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
            <div className="flex items-center gap-1" aria-label="Server pagination unavailable">
              <Button aria-label="First page unavailable" disabled size="icon-xs" type="button" variant="outline">
                <ChevronsLeftIcon aria-hidden="true" data-icon="button-icon" />
              </Button>
              <Button aria-label="Previous page unavailable" disabled size="icon-xs" type="button" variant="outline">
                <ChevronLeftIcon aria-hidden="true" data-icon="button-icon" />
              </Button>
              <Badge className="h-7 min-w-7 justify-center px-2 text-[11px]" variant="secondary">
                1
              </Badge>
              <Button aria-label="Next page unavailable" disabled size="icon-xs" type="button" variant="outline">
                <ChevronRightIcon aria-hidden="true" data-icon="button-icon" />
              </Button>
              <Button aria-label="Last page unavailable" disabled size="icon-xs" type="button" variant="outline">
                <ChevronsRightIcon aria-hidden="true" data-icon="button-icon" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
