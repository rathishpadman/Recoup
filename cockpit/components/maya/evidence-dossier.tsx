import { FileTextIcon, FilterIcon, InfoIcon, Settings2Icon, ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaEvidencePack, MayaSourceTile } from "./types.ts";

interface EvidenceDossierProps {
  deterministicBasis: string;
  draftStatusLabel: string;
  evidencePack: MayaEvidencePack;
  sourceTiles: MayaSourceTile[];
}

export function EvidenceDossier({ deterministicBasis, draftStatusLabel, evidencePack, sourceTiles }: EvidenceDossierProps) {
  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-evidence-dossier">
      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-lg shadow-none" size="sm">
          <CardHeader>
            <div className="grid min-w-0 gap-1">
              <CardTitle>Evidence dossier</CardTitle>
              <CardDescription>Cited documents and record IDs from the selected backend packet</CardDescription>
            </div>
            <CardAction className="flex gap-2">
              <Button aria-label="Filter unavailable for current evidence packet" disabled size="sm" type="button" variant="outline">
                <FilterIcon aria-hidden="true" data-icon="inline-start" />
                Filter
              </Button>
              <Button aria-label="View options unavailable for current evidence packet" disabled size="sm" type="button" variant="outline">
                <Settings2Icon aria-hidden="true" data-icon="inline-start" />
                View options
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            <RecordIdStrip recordIds={evidencePack.recordIds} />
            {evidencePack.documents.length === 0 ? (
              <MayaEmptyState description="The selected case did not return evidence documents." title="Evidence unavailable" />
            ) : (
              <Accordion collapsible defaultValue="backend-evidence-packet" type="single">
                <AccordionItem data-testid="maya-evidence-packet" value="backend-evidence-packet">
                  <AccordionTrigger>
                    <span className="flex min-w-0 flex-wrap items-center gap-2 text-left">
                      <span>Backend evidence packet</span>
                      <Badge variant="secondary">{evidencePack.documents.length.toString()} documents</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ScrollArea className="max-h-[34rem]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Evidence item</TableHead>
                            <TableHead>Citation</TableHead>
                            <TableHead>Source</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {evidencePack.documents.map((document) => (
                            <TableRow data-testid="maya-evidence-document-row" key={document.citationId}>
                              <TableCell className="w-[56%] whitespace-normal align-top">
                                <div className="flex min-w-0 flex-col gap-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline">{document.documentType}</Badge>
                                    <Badge variant="secondary">{document.relevance}</Badge>
                                    <span className="font-medium">{document.description}</span>
                                  </div>
                                  <span className="text-sm text-muted-foreground">{document.summary}</span>
                                </div>
                              </TableCell>
                              <TableCell className="w-[21%] whitespace-normal align-top">
                                <div className="flex min-w-0 flex-col gap-1">
                                  <span className="font-medium">{document.citationId}</span>
                                  <span className="text-sm text-muted-foreground">{document.documentId}</span>
                                </div>
                              </TableCell>
                              <TableCell className="w-[23%] whitespace-normal align-top">
                                <div className="flex min-w-0 flex-col gap-1">
                                  <span>{document.sourceLabel}</span>
                                  <span className="text-sm text-muted-foreground">{document.verifiedLabel}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          <Card className="rounded-lg shadow-none" data-testid="maya-deterministic-basis-rail" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
                Deterministic basis
              </CardTitle>
              <CardDescription>Draft basis text from the selected backend detail</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{deterministicBasis}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Draft/HITL status</span>
                <Badge variant="outline">{draftStatusLabel}</Badge>
              </div>
              <Alert>
                <InfoIcon aria-hidden="true" data-icon="inline-start" />
                <AlertTitle>Deterministic basis unavailable</AlertTitle>
                <AlertDescription>
                  Contract gap: structured criteria, counts, reviewer, and review timestamp are not exposed by the read model.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none" data-testid="maya-source-provenance-rail" size="sm">
            <CardHeader>
              <CardTitle>Source provenance</CardTitle>
              <CardDescription>Connector readiness labels from the source read model</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {sourceTiles.length === 0 ? (
                <MayaEmptyState description="Connector source tiles are not exposed for this session." title="Source provenance unavailable" />
              ) : (
                <div className="flex flex-col gap-3">
                  {sourceTiles.map((source, index) => (
                    <div className="flex flex-col gap-3" key={source.key}>
                      <div
                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
                        data-status-tone={source.statusTone}
                        data-testid="maya-source-provenance-row"
                      >
                        <div className="grid min-w-0 gap-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="font-medium">{source.label}</span>
                            <Badge variant={source.statusTone === "synthetic" ? "outline" : "secondary"}>{source.stateLabel}</Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">{source.summary}</span>
                        </div>
                        <Badge variant="outline">{source.modeLabel}</Badge>
                      </div>
                      {index === sourceTiles.length - 1 ? null : <Separator />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Alert data-testid="maya-evidence-review-state">
        <FileTextIcon aria-hidden="true" data-icon="inline-start" />
        <AlertTitle>Evidence dossier available</AlertTitle>
        <AlertDescription>
          Backend evidence packet is available for this opened line. Review state unavailable until the backend exposes
          evidence review status, criteria, reviewer, timestamp, and cited basis.
        </AlertDescription>
      </Alert>
    </section>
  );
}

function RecordIdStrip({ recordIds }: { recordIds: string[] }) {
  if (recordIds.length === 0) {
    return (
      <Badge className="w-fit" variant="outline">
        No record IDs
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Selected record IDs">
      {recordIds.map((recordId) => (
        <Badge className="max-w-full truncate" key={recordId} title={recordId} variant="secondary">
          {recordId}
        </Badge>
      ))}
    </div>
  );
}
