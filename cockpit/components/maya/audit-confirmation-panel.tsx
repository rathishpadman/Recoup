import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { ApprovalGateResponse, MayaJourneyItem } from "./types.ts";

interface AuditConfirmationPanelProps {
  journey: MayaJourneyItem[];
  response: ApprovalGateResponse | undefined;
}

export function AuditConfirmationPanel({ journey, response }: AuditConfirmationPanelProps) {
  return (
    <Card data-testid="maya-audit-confirmation">
      <CardHeader>
        <CardTitle>Audit confirmation</CardTitle>
        <CardDescription>{response?.auditEntryHash}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <Alert>
          <AlertTitle>{response === undefined ? "No approval decision submitted" : "Approval response"}</AlertTitle>
          <AlertDescription>
            {response === undefined ? "This review route does not dispatch approval decisions." : response.auditEntryHash}
          </AlertDescription>
        </Alert>
        <Separator />
        {journey.length === 0 ? (
          <MayaEmptyState description="The Maya journey read model returned no audit rows." title="Journey unavailable" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Record IDs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journey.map((item) => (
                <TableRow key={`${item.timestamp}-${item.label}`}>
                  <TableCell className="whitespace-normal font-medium">{item.label}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{item.timestamp}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {item.recordIds.map((recordId) => (
                        <Badge key={`${item.timestamp}-${recordId}`} variant="outline">
                          {recordId}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
