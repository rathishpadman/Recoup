"use client";

import * as React from "react";
import { BookmarkIcon, ListFilterIcon, MoreHorizontalIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { RecommendedActionCell } from "./recommended-action-cell.tsx";
import type { MayaWorklistItem } from "./types.ts";

interface DeductionWorklistTableProps {
  items: MayaWorklistItem[];
  onSelectItem: (item: MayaWorklistItem) => void;
  selectedLineId?: string;
}

export function DeductionWorklistTable({ items, onSelectItem, selectedLineId }: DeductionWorklistTableProps) {
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

  return (
    <Card className="min-h-0 rounded-lg shadow-none" size="sm">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <CardTitle>Deduction Worklist ({items.length})</CardTitle>
            <CardDescription>Forensics read-model rows</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" type="button" variant="outline">
              <BookmarkIcon aria-hidden="true" data-icon="inline-start" />
              Save view
            </Button>
            <Button aria-label="Worklist display options" size="icon-sm" type="button" variant="outline">
              <SlidersHorizontalIcon aria-hidden="true" data-icon="button-icon" />
            </Button>
          </div>
        </div>
        <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(250px,1fr)_auto_auto_auto]">
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
          <Button size="lg" type="button" variant="outline">
            <ListFilterIcon aria-hidden="true" data-icon="inline-start" />
            Recommended action
          </Button>
          <Button size="lg" type="button" variant="outline">
            Queue
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" type="button" variant="outline">
                <SlidersHorizontalIcon aria-hidden="true" data-icon="inline-start" />
                More filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Backend fields</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem>Scenario</DropdownMenuItem>
                <DropdownMenuItem>Verdict</DropdownMenuItem>
                <DropdownMenuItem>Queue</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>Additional fields require backend support</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="min-h-0">
        {items.length === 0 ? (
          <MayaEmptyState description="The forensics read model returned no worklist rows." title="Worklist unavailable" />
        ) : filteredItems.length === 0 ? (
          <MayaEmptyState description="No fetched worklist rows match the current local search." title="No matching rows" />
        ) : (
          <ScrollArea className="h-[520px]">
            <Table className="w-[calc(100%-8px)] table-fixed text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[9%] whitespace-normal px-1.5 leading-4">Work item</TableHead>
                  <TableHead className="w-[15%] whitespace-normal px-1.5 leading-4">Case / Customer</TableHead>
                  <TableHead className="w-[14%] whitespace-normal px-1.5 leading-4">Verdict</TableHead>
                  <TableHead className="w-[22%] whitespace-normal px-1.5 leading-4">Recommended action</TableHead>
                  <TableHead className="w-[12%] whitespace-nowrap px-1.5 leading-4">Amount</TableHead>
                  <TableHead className="w-[9%] whitespace-normal px-1.5 leading-4">Evidence</TableHead>
                  <TableHead className="w-[15%] whitespace-normal px-1.5 leading-4">Queue</TableHead>
                  <TableHead className="w-[4%] whitespace-normal px-1 leading-4">
                    <span className="sr-only">Row actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow
                    aria-selected={item.lineId === selectedLineId}
                    data-state={item.lineId === selectedLineId ? "selected" : undefined}
                    data-testid="maya-worklist-row"
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
                    <TableCell className="whitespace-normal px-1.5 py-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate font-medium">{item.lineId}</p>
                        <div className="flex flex-wrap gap-1" aria-label={`${item.lineId} line IDs`}>
                          {item.lineIds.map((lineId) => (
                            <Badge className="h-5 px-1.5 text-[10px]" key={`${item.lineId}-${lineId}`} variant="outline">
                              {lineId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal px-1.5 py-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="min-w-0">
                          <p className="font-medium leading-4">{item.scenarioLabel}</p>
                          <p className="text-xs leading-4 text-muted-foreground">{item.customerLabel}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal px-1.5 py-3">
                      <Badge
                        className="h-7 max-w-full justify-start truncate px-1.5 text-[11px]"
                        title={item.verdictLabel}
                        variant="secondary"
                      >
                        <span className="min-w-0 truncate">{item.verdictLabel}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal px-1.5 py-3" data-testid="maya-worklist-recommended-action">
                      <RecommendedActionCell item={item} />
                    </TableCell>
                    <TableCell className="whitespace-normal px-1.5 py-3 tabular-nums">{item.amount}</TableCell>
                    <TableCell className="whitespace-normal px-1.5 py-3">
                      <div className="flex flex-col gap-1">
                        <span>{item.evidenceScoreLabel}</span>
                        <span className="text-xs text-muted-foreground">{item.evidenceLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal px-1.5 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="truncate">{item.queueLabel}</span>
                        <Badge
                          className="h-7 max-w-full justify-start truncate px-1.5 text-[11px]"
                          title={item.routingLabel}
                          variant="outline"
                        >
                          <span className="min-w-0 truncate">{item.routingLabel}</span>
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="px-1 py-3">
                      <Button aria-label={`Open ${item.scenarioLabel} row actions`} size="icon-xs" type="button" variant="ghost">
                        <MoreHorizontalIcon aria-hidden="true" data-icon="button-icon" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
