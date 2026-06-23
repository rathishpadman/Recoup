import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ConnectorReadinessCockpitModel } from "../../app/cockpit-data.ts";
import type { MayaSourceTile } from "./types.ts";

interface SourceReadinessStripProps {
  connectors: ConnectorReadinessCockpitModel;
}

function sourceToneVariant(statusTone: MayaSourceTile["statusTone"]): "default" | "destructive" | "outline" | "secondary" {
  if (statusTone === "ready") {
    return "secondary";
  }

  if (statusTone === "blocked") {
    return "destructive";
  }

  return "outline";
}

export function SourceReadinessStrip({ connectors }: SourceReadinessStripProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Source readiness</CardTitle>
        <CardDescription>{connectors.lastRefreshedLabel}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-3">
          {connectors.sourceTiles.map((source) => (
            <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3" key={source.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{source.label}</p>
                  <p className="text-sm text-muted-foreground">{source.summary}</p>
                </div>
                <Badge variant={sourceToneVariant(source.statusTone)}>{source.stateLabel}</Badge>
              </div>
              <div className="flex flex-wrap gap-2" aria-label={`${source.label} proof`}>
                <Badge variant="outline">{source.modeLabel}</Badge>
                <Badge variant="outline">{source.mark}</Badge>
                {source.proofItems.map((proof) => (
                  <Badge key={`${source.key}-${proof}`} variant="outline">
                    {proof}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{source.detail}</p>
            </div>
          ))}
        </div>
        <Separator />
        <ScrollArea className="max-h-44">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connector</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.connectors.map((connector) => (
                <TableRow key={connector.name}>
                  <TableCell className="whitespace-normal font-medium">{connector.name}</TableCell>
                  <TableCell className="whitespace-normal">{connector.status}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{connector.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
