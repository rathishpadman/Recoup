import { FileTextIcon, FilterIcon, InfoIcon, SearchIcon, Settings2Icon, ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaEvidencePack, MayaSourceTile } from "./types.ts";

type EvidenceDocument = MayaEvidencePack["documents"][number];

interface EvidenceBusinessGroup {
  documents: EvidenceDocument[];
  id: string;
  label: string;
}

interface EvidenceDossierProps {
  deterministicBasis: string;
  draftStatusLabel: string;
  evidencePack: MayaEvidencePack;
  onQueryEvidence?: () => void;
  sourceTiles: MayaSourceTile[];
}

export function EvidenceDossier({
  deterministicBasis,
  draftStatusLabel,
  evidencePack,
  onQueryEvidence,
  sourceTiles
}: EvidenceDossierProps) {
  const evidenceGroups = groupEvidenceDocumentsByBusinessLabel(evidencePack.documents);

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-evidence-dossier">
      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-lg shadow-none" size="sm">
          <CardHeader>
            <div className="grid min-w-0 gap-1">
              <CardTitle>Evidence dossier</CardTitle>
              <CardDescription>Business documents grouped from the selected read model</CardDescription>
            </div>
            <CardAction className="flex gap-2">
              {onQueryEvidence === undefined ? null : (
                <Button onClick={onQueryEvidence} size="sm" type="button">
                  <SearchIcon aria-hidden="true" data-icon="inline-start" />
                  Query evidence
                </Button>
              )}
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
            {evidencePack.documents.length === 0 ? (
              <MayaEmptyState description="The selected case did not return evidence documents." title="Evidence unavailable" />
            ) : (
              <Accordion defaultValue={evidenceGroups.slice(0, 1).map((group) => group.id)} type="multiple">
                {evidenceGroups.map((group) => (
                  <AccordionItem data-testid="maya-evidence-business-group" key={group.id} value={group.id}>
                    <AccordionTrigger>
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-left">
                        <span>{group.label}</span>
                        <Badge variant="secondary">{group.documents.length.toString()} documents</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <EvidenceDocumentTable documents={group.documents} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            <Collapsible className="rounded-lg border bg-muted/20 p-3" data-testid="maya-evidence-source-details">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">Source details</span>
                  <span className="text-xs text-muted-foreground">Record IDs and source identifiers remain available for audit.</span>
                </div>
                <CollapsibleTrigger asChild>
                  <Button size="sm" type="button" variant="outline">
                    View details
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="pt-3">
                <RecordIdStrip recordIds={evidencePack.recordIds} />
              </CollapsibleContent>
            </Collapsible>
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
          Evidence documents are available for this opened line. Review state unavailable until the backend exposes evidence
          review status, criteria, reviewer, timestamp, and cited basis.
        </AlertDescription>
      </Alert>
    </section>
  );
}

function EvidenceDocumentTable({ documents }: { documents: EvidenceDocument[] }) {
  return (
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
          {documents.map((document) => (
            <TableRow data-testid="maya-evidence-document-row" key={document.citationId}>
              <TableCell className="w-[56%] whitespace-normal align-top">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{getEvidenceBusinessLabel(document.documentType)}</Badge>
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
  );
}

function RecordIdStrip({ recordIds }: { recordIds: string[] }) {
  if (recordIds.length === 0) {
    return (
      <Badge className="w-fit" data-testid="maya-evidence-record-id" variant="outline">
        No record IDs
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Selected record IDs">
      {recordIds.map((recordId) => (
        <Badge className="max-w-full truncate" data-testid="maya-evidence-record-id" key={recordId} title={recordId} variant="secondary">
          {recordId}
        </Badge>
      ))}
    </div>
  );
}

function groupEvidenceDocumentsByBusinessLabel(documents: EvidenceDocument[]): EvidenceBusinessGroup[] {
  const groups = new Map<string, EvidenceDocument[]>();
  for (const document of documents) {
    const label = getEvidenceBusinessLabel(document.documentType);
    const existing = groups.get(label);
    if (existing === undefined) {
      groups.set(label, [document]);
    } else {
      existing.push(document);
    }
  }

  return [...groups.entries()].map(([label, groupDocuments]) => ({
    documents: groupDocuments,
    id: `evidence-group-${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`,
    label
  }));
}

function getEvidenceBusinessLabel(documentType: string): string {
  const normalized = documentType.trim().toLowerCase();
  if (normalized === "invoice" || normalized === "credit-memo" || normalized === "remittance-advice") {
    return "Invoice";
  }
  if (normalized === "pod" || normalized === "carrier-report") {
    return "POD";
  }
  if (normalized === "contract") {
    return "Contract";
  }
  if (normalized === "trade-promo" || normalized === "tpm" || normalized === "promotion") {
    return "Promotion";
  }
  if (normalized === "bureau-signal" || normalized === "correspondence" || normalized === "customer-record") {
    return "Customer record";
  }

  return normalized
    .split(/[-_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
