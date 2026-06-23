import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaActionInboxItem, MayaSelectedCase } from "./types.ts";

interface RecoveryDraftReviewProps {
  actionInbox: MayaActionInboxItem[];
  draft: MayaSelectedCase["draft"];
  recordIds: string[];
}

export function RecoveryDraftReview({ actionInbox, draft, recordIds }: RecoveryDraftReviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{draft.actionLabel}</CardTitle>
        <CardDescription>{draft.statusLabel}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Action ID</span>
            <span className="font-medium">{draft.actionId}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Action type</span>
            <span className="font-medium">{draft.actionType}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span className="font-medium">{draft.amount}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{draft.basis}</p>
        <div className="flex flex-wrap gap-2" aria-label="Draft basis record IDs">
          {recordIds.map((recordId) => (
            <Badge key={recordId} variant="secondary">
              {recordId}
            </Badge>
          ))}
        </div>
        <Separator />
        {actionInbox.length === 0 ? (
          <MayaEmptyState description="The action inbox read model returned no draft rows." title="Action inbox unavailable" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Line</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actionInbox.map((item) => (
                <TableRow key={item.actionId}>
                  <TableCell className="min-w-48 whitespace-normal">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{item.actionLabel}</span>
                      <span className="text-sm text-muted-foreground">{item.basis}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.lineId}</TableCell>
                  <TableCell>{item.amount}</TableCell>
                  <TableCell>{item.statusLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
