"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  CircleHelpIcon,
  MoreHorizontalIcon,
  SearchIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { RecommendedActionCell } from "./recommended-action-cell.tsx";
import type { MayaWorklistItem } from "./types.ts";

interface DeductionWorklistTableProps {
  items: MayaWorklistItem[];
  onSelectItem: (item: MayaWorklistItem) => void;
  selectedLineId?: string;
  variant?: "rail" | "table";
}

const missingOperationalFields = ["Priority", "Work type", "Source", "Age", "Owner"] as const;

export function DeductionWorklistTable({ items, onSelectItem, selectedLineId, variant = "table" }: DeductionWorklistTableProps) {
  const [query, setQuery] = React.useState("");
  const filteredItems = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) {
      return items;
    }

    return items.filter((item) =>
      [
        item.scenarioLabel,
        item.customerLabel,
        item.verdictLabel,
        item.routingLabel,
        item.queueLabel,
        item.recommendedActionLabel,
        ...item.lineIds
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [items, query]);

  if (variant === "rail") {
    return (
      <Card className="min-h-[calc(100vh-2rem)] rounded-lg shadow-none" size="sm">
        <CardHeader className="gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="grid min-w-0 gap-1">
              <CardTitle>Worklist</CardTitle>
              <CardDescription className="truncate">{items.length.toString()} fetched rows</CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="Read-model gaps" size="icon-sm" type="button" variant="outline">
                  <CircleHelpIcon aria-hidden="true" data-icon="button-icon" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                <span>Not exposed on worklist rows: {missingOperationalFields.join(", ")}.</span>
              </TooltipContent>
            </Tooltip>
          </div>
          <InputGroup className="h-9">
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" data-icon="input-addon" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search worklist rail"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search"
              title="Search by scenario, customer, or line ID"
              value={query}
            />
          </InputGroup>
        </CardHeader>
        <CardContent className="min-h-0 px-2">
          {items.length === 0 ? (
            <MayaEmptyState description="The forensics read model returned no worklist rows." title="Worklist unavailable" />
          ) : filteredItems.length === 0 ? (
            <MayaEmptyState description="No fetched worklist rows match the current local search." title="No matching rows" />
          ) : (
            <ScrollArea className="h-[calc(100vh-13rem)] min-h-[520px]">
              <div className="flex min-w-0 flex-col gap-1 pr-2">
                {filteredItems.map((item) => {
                  const isValidDeduction = item.verdict === "valid";

                  return (
                    <Button
                      aria-selected={item.lineId === selectedLineId}
                      className={cn(
                        "h-auto min-h-[104px] w-full justify-start rounded-md border px-3 py-3 text-left font-normal",
                        "data-[selected=true]:bg-muted/35 data-[selected=true]:ring-1 data-[selected=true]:ring-border/70"
                      )}
                      data-line-id={item.lineId}
                      data-selected={item.lineId === selectedLineId ? "true" : undefined}
                      data-state={item.lineId === selectedLineId ? "selected" : undefined}
                      data-testid="maya-worklist-row"
                      data-verdict={item.verdict}
                      key={item.lineId}
                      onClick={() => {
                        onSelectItem(item);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="flex min-w-0 items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{item.lineId}</span>
                            <span className="block truncate text-xs text-muted-foreground">{item.scenarioLabel}</span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.amount}</span>
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{item.customerLabel}</span>
                        <span className="flex min-w-0 flex-wrap gap-1">
                          <Badge className="h-5 gap-1 px-1.5 text-[10px]" data-verdict={item.verdict} variant="secondary">
                            {isValidDeduction ? <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" /> : null}
                            {item.verdictLabel}
                          </Badge>
                          <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                            {item.queueLabel}
                          </Badge>
                          <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                            {item.evidenceScoreLabel}
                          </Badge>
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
        {items.length > 0 ? (
          <CardFooter className="min-h-11 justify-between gap-2 bg-transparent px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">
              {filteredItems.length.toString()} of {items.length.toString()}
            </p>
            <Badge className="h-6 px-2 text-[11px]" variant="outline">
              Local focus
            </Badge>
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="min-h-0 rounded-lg shadow-none" size="sm">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <CardTitle>Deduction Worklist ({items.length})</CardTitle>
            <CardDescription>Forensics read-model rows grouped by scenario and queue</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="hidden h-8 gap-1.5 px-2 text-[11px] md:inline-flex" data-testid="maya-worklist-contract-gap" variant="outline">
                  <CircleHelpIcon aria-hidden="true" data-icon="inline-start" />
                  Read-model gaps
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                <span>Not exposed on worklist rows: {missingOperationalFields.join(", ")}.</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="grid min-w-0 gap-2">
          <InputGroup className="h-9">
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" data-icon="input-addon" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search worklist"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search worklist"
              title="Search by scenario, customer, or line ID"
              value={query}
            />
          </InputGroup>
        </div>
      </CardHeader>
      <CardContent className="min-h-0">
        {items.length === 0 ? (
          <MayaEmptyState description="The forensics read model returned no worklist rows." title="Worklist unavailable" />
        ) : filteredItems.length === 0 ? (
          <MayaEmptyState description="No fetched worklist rows match the current local search." title="No matching rows" />
        ) : (
          <>
            <div className="grid gap-2 md:hidden" data-testid="maya-mobile-worklist-list">
              {filteredItems.map((item) => {
                const isValidDeduction = item.verdict === "valid";

                return (
                  <Button
                    aria-selected={item.lineId === selectedLineId}
                    className="h-auto min-h-[108px] w-full justify-start rounded-md border bg-background px-3 py-3 text-left font-normal"
                    data-line-id={item.lineId}
                    data-state={item.lineId === selectedLineId ? "selected" : undefined}
                    data-testid="maya-mobile-worklist-row"
                    data-verdict={item.verdict}
                    key={item.lineId}
                    onClick={() => {
                      onSelectItem(item);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <span className="grid min-w-0 flex-1 gap-2">
                      <span className="flex min-w-0 items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.lineId}</span>
                          <span className="block line-clamp-2 text-xs text-muted-foreground">{item.scenarioLabel}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.amount}</span>
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{item.customerLabel}</span>
                      <span className="flex min-w-0 flex-wrap gap-1">
                        <Badge className="h-5 gap-1 px-1.5 text-[10px]" data-verdict={item.verdict} variant="secondary">
                          {isValidDeduction ? <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" /> : null}
                          {item.verdictLabel}
                        </Badge>
                        <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                          {item.queueLabel}
                        </Badge>
                        <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                          {item.evidenceScoreLabel}
                        </Badge>
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
            <ScrollArea className="hidden h-[484px] md:block">
            <Table className="w-[calc(100%-8px)] table-fixed text-xs" data-testid="maya-worklist-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[4%] px-2">
                    <span className="sr-only">Local row selection</span>
                  </TableHead>
                  <TableHead className="w-[11%] whitespace-nowrap px-2 leading-4">Work item</TableHead>
                  <TableHead className="w-[17%] whitespace-nowrap px-2 leading-4">Scenario / Customer</TableHead>
                  <TableHead className="w-[27%] whitespace-nowrap px-2 leading-4">Verdict / Action</TableHead>
                  <TableHead className="w-[12%] whitespace-nowrap px-2 leading-4">Amount</TableHead>
                  <TableHead className="w-[11%] whitespace-nowrap px-2 leading-4">Evidence</TableHead>
                  <TableHead className="w-[18%] whitespace-nowrap px-2 leading-4">Queue / Route</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const isValidDeduction = item.verdict === "valid";

                  return (
                    <TableRow
                      aria-selected={item.lineId === selectedLineId}
                      className={cn(
                        "cursor-pointer align-top outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        "data-[selected=true]:bg-muted/35 data-[selected=true]:ring-1 data-[selected=true]:ring-border/70"
                      )}
                      data-line-id={item.lineId}
                      data-selected={item.lineId === selectedLineId ? "true" : undefined}
                      data-state={item.lineId === selectedLineId ? "selected" : undefined}
                      data-testid="maya-worklist-row"
                      data-verdict={item.verdict}
                      key={item.lineId}
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
                    <TableCell className="px-2 py-2 align-middle">
                      <Checkbox
                        aria-label={`${item.scenarioLabel} local row selection`}
                        checked={item.lineId === selectedLineId}
                        onCheckedChange={() => {
                          onSelectItem(item);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                        }}
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal px-2 py-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate font-medium">{item.lineId}</p>
                        <span className="text-[11px] leading-3 text-muted-foreground">{item.lineCount.toString()} lines</span>
                        <div className="flex min-w-0 items-center gap-1" aria-label={`${item.lineId} line IDs`}>
                          {item.lineIds.slice(0, 1).map((lineId) => (
                            <Badge className="h-5 px-1.5 text-[10px]" key={`${item.lineId}-${lineId}`} variant="outline">
                              {lineId}
                            </Badge>
                          ))}
                          {item.lineIds.length > 1 ? (
                            <Badge
                              className="h-5 px-1.5 text-[10px]"
                              title={item.lineIds.slice(1).join(", ")}
                              variant="outline"
                            >
                              +{item.lineIds.length - 1}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal px-2 py-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="min-w-0">
                          <p className="break-words font-medium leading-4" title={item.scenarioLabel}>
                            {item.scenarioLabel}
                          </p>
                          <p className="break-words text-xs leading-4 text-muted-foreground" title={item.customerLabel}>
                            {item.customerLabel}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal px-2 py-2" data-testid="maya-worklist-recommended-action">
                      <div className="flex min-w-0 flex-col items-start gap-1.5">
                        <Badge
                          className="h-6 max-w-full justify-start gap-1 truncate px-2 text-[11px] leading-none"
                          data-verdict={item.verdict}
                          data-testid="maya-verdict-badge"
                          title={item.verdictLabel}
                          variant="secondary"
                        >
                          {isValidDeduction ? <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" /> : null}
                          <span className="min-w-0 truncate">{item.verdictLabel}</span>
                        </Badge>
                        <RecommendedActionCell item={item} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 tabular-nums">{item.amount}</TableCell>
                    <TableCell className="whitespace-normal px-2 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span>{item.evidenceScoreLabel}</span>
                        <span className="break-words text-xs leading-4 text-muted-foreground" title={item.evidenceLabel}>
                          {item.evidenceLabel}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal px-2 py-2">
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-1.5">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="break-words" title={item.queueLabel}>
                            {item.queueLabel}
                          </span>
                          <span
                            className="break-words text-[11px] leading-3 text-muted-foreground"
                            data-testid="maya-routing-label"
                            title={item.routingLabel}
                          >
                            {item.routingLabel}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={`Open ${item.scenarioLabel} row actions`}
                              className="shrink-0"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                              size="icon-xs"
                              type="button"
                              variant="ghost"
                            >
                              <MoreHorizontalIcon aria-hidden="true" data-icon="button-icon" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            <DropdownMenuLabel>Fetched row</DropdownMenuLabel>
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => {
                                  onSelectItem(item);
                                }}
                              >
                                Open work item
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>Deep evidence switching requires backend support</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </ScrollArea>
          </>
        )}
      </CardContent>
      {items.length > 0 ? (
        <CardFooter className="min-h-11 justify-between gap-3 bg-transparent px-3 py-2">
          <p className="truncate text-xs text-muted-foreground">
            Showing {filteredItems.length.toString()} of {items.length.toString()} fetched rows
          </p>
          <Badge className="h-6 px-2 text-[11px]" variant="outline">
            Fetched rows only
          </Badge>
        </CardFooter>
      ) : null}
    </Card>
  );
}
