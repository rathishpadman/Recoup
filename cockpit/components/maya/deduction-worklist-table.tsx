import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { RecommendedActionCell } from "./recommended-action-cell.tsx";
import type { MayaWorklistItem } from "./types.ts";

interface DeductionWorklistTableProps {
  activeLineId: string;
  items: MayaWorklistItem[];
}

export function DeductionWorklistTable({ activeLineId, items }: DeductionWorklistTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended action worklist</CardTitle>
        <CardDescription>Recommended action</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <MayaEmptyState description="The forensics read model returned no worklist rows." title="Worklist unavailable" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead>Recommended action</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Queue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isActive = item.lineIds.includes(activeLineId);

                return (
                  <TableRow
                    aria-selected={isActive}
                    data-state={isActive ? "selected" : undefined}
                    data-testid="maya-worklist-row"
                    key={item.lineId}
                  >
                    <TableCell className="min-w-48 whitespace-normal">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{item.scenarioLabel}</span>
                        <span className="text-sm text-muted-foreground">{item.customerLabel}</span>
                        <div className="flex flex-wrap gap-1" aria-label={`${item.lineId} line IDs`}>
                          {item.lineIds.map((lineId) => (
                            <Badge key={`${item.lineId}-${lineId}`} variant="outline">
                              {lineId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-48 whitespace-normal" data-testid="maya-worklist-recommended-action">
                      <RecommendedActionCell item={item} />
                    </TableCell>
                    <TableCell>{item.amount}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span>{item.evidenceScoreLabel}</span>
                        <span className="text-sm text-muted-foreground">{item.evidenceLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span>{item.queueLabel}</span>
                        <Badge variant="outline">{item.routingLabel}</Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
