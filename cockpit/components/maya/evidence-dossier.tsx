import { ExternalLinkIcon, FileTextIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { mayaAccent } from "./maya-accent.ts";
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

export function SelectedEvidenceProofStrip({ evidencePack }: { evidencePack: MayaEvidencePack }) {
  const evidenceIds = uniqueValues(evidencePack.documents.map((document) => document.evidenceId));
  const receiptIds = uniqueValues(evidencePack.documents.map((document) => document.receiptId));
  const contentHashes = uniqueValues(evidencePack.documents.map((document) => document.contentHash));
  const provenanceTerms = uniqueValues(evidencePack.documents.map((document) => document.evidenceProvenance));
  const podDocument = evidencePack.documents.find((document) => document.documentType.trim().toLowerCase() === "pod");

  if (
    evidenceIds.length === 0 &&
    receiptIds.length === 0 &&
    contentHashes.length === 0 &&
    provenanceTerms.length === 0 &&
    podDocument === undefined
  ) {
    return null;
  }

  return (
    <section
      aria-label="Selected evidence proof"
      className={cn("grid min-w-0 gap-3 rounded-lg border p-3", mayaAccent.proofPanel)}
      data-testid="maya-selected-evidence-proof-strip"
    >
      <div className="grid min-w-0 gap-3 md:grid-cols-4">
        <ProofColumn label="Evidence IDs" values={evidenceIds} />
        <ProofColumn label="Receipt IDs" values={receiptIds} />
        <ProofColumn label="Content hashes" values={contentHashes} />
        <ProofColumn label="Provenance" values={provenanceTerms} />
      </div>
      {podDocument === undefined ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge className={mayaAccent.pill} variant="secondary">POD document</Badge>
          <EvidenceStorageLink document={podDocument} />
        </div>
      )}
    </section>
  );
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
        <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} size="sm">
          <CardHeader>
            <div className="grid min-w-0 gap-1">
              <CardTitle>Evidence dossier</CardTitle>
            </div>
            <CardAction className="flex gap-2">
              {onQueryEvidence === undefined ? null : (
                <Button onClick={onQueryEvidence} size="sm" type="button">
                  <SearchIcon aria-hidden="true" data-icon="inline-start" />
                  Open Recoup Copilot
                </Button>
              )}
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
                        <Badge className={mayaAccent.pill} variant="secondary">{group.documents.length.toString()} documents</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <EvidenceDocumentTable documents={group.documents} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            <Collapsible className={cn("rounded-lg border p-3", mayaAccent.proofPanel)} data-testid="maya-evidence-source-details">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">Evidence details</span>
                  <span className="text-xs text-muted-foreground">Record IDs for audit.</span>
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
          <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} data-testid="maya-deterministic-basis-rail" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
                Deterministic basis
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{deterministicBasis}</p>
              <div className="flex flex-wrap items-center gap-2" data-testid="maya-deterministic-basis-status">
                <span className="text-sm text-muted-foreground">Draft status</span>
                <Badge variant="outline">{draftStatusLabel}</Badge>
                <Badge variant="outline">Structured review fields unavailable</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} data-testid="maya-source-provenance-rail" size="sm">
            <CardHeader>
              <CardTitle>Source provenance</CardTitle>
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
                            <Badge className={source.statusTone === "synthetic" ? undefined : mayaAccent.pill} variant={source.statusTone === "synthetic" ? "outline" : "secondary"}>{source.stateLabel}</Badge>
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
        <AlertDescription>Review state unavailable.</AlertDescription>
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
            <TableRow data-testid="maya-evidence-document-row" key={`${document.citationId}-${document.documentId}`}>
              <TableCell className="w-[56%] whitespace-normal align-top">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{getEvidenceBusinessLabel(document.documentType)}</Badge>
                    <Badge className={mayaAccent.pill} variant="secondary">{document.relevance}</Badge>
                    <span className="font-medium">{document.description}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{document.summary}</span>
                  <EvidenceDocumentProvenance document={document} />
                </div>
              </TableCell>
              <TableCell className="w-[21%] whitespace-normal align-top">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{document.citationId}</span>
                  <span className="text-sm text-muted-foreground">{document.documentId}</span>
                  {document.evidenceId === undefined ? null : (
                    <Badge className="w-fit" variant="outline">
                      {document.evidenceId}
                    </Badge>
                  )}
                  {document.receiptId === undefined ? null : (
                    <Badge className={cn("w-fit", mayaAccent.pill)} variant="secondary">
                      {document.receiptId}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="w-[23%] whitespace-normal align-top">
                <div className="flex min-w-0 flex-col gap-1">
                  <span>{document.sourceLabel}</span>
                  <span className="text-sm text-muted-foreground">{document.verifiedLabel}</span>
                  <EvidenceStorageLink document={document} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function ProofColumn({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {values.length === 0 ? (
        <Badge className="w-fit" variant="outline">
          Unavailable
        </Badge>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-1">
          {values.slice(0, 3).map((value) => (
            <Badge className={cn("max-w-full truncate font-mono text-[10px]", mayaAccent.pill)} key={value} title={value} variant="outline">
              {value}
            </Badge>
          ))}
          {values.length > 3 ? <Badge className={mayaAccent.pill} variant="secondary">+{String(values.length - 3)}</Badge> : null}
        </div>
      )}
    </div>
  );
}

function EvidenceDocumentProvenance({ document }: { document: EvidenceDocument }) {
  const rows = [
    { label: "Evidence ID", value: document.evidenceId },
    { label: "Receipt ID", value: document.receiptId },
    { label: "Content hash", value: document.contentHash },
    { label: "Receipt hash", value: document.receiptContentHash },
    { label: "Storage URI", value: document.storageUri },
    { label: "Source system", value: document.sourceSystem },
    { label: "Source record", value: document.sourceRecordId },
    { label: "Source freshness", value: document.sourceFreshness },
    { label: "Evidence provenance", value: document.evidenceProvenance },
    { label: "Deterministic basis", value: document.deterministicComparisonBasis }
  ].filter((row): row is { label: string; value: string } => row.value !== undefined && row.value.trim().length > 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <dl className={cn("grid min-w-0 gap-1 rounded-md border p-2 text-xs", mayaAccent.proofMutedPanel)} data-testid="maya-evidence-provenance">
      {rows.map((row) => (
        <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-2" key={row.label}>
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words font-mono text-[11px]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceStorageLink({ document }: { document: EvidenceDocument }) {
  // Availability tracks whether the document can be served, not whether a storage URI was
  // recorded: most canonical evidence types carry no stored object but still render from
  // their evidence row, and gating on storageUri hid those behind no link at all.
  const safeHref = document.storageHref?.trim();
  const isPodDocument = document.documentType.trim().toLowerCase() === "pod";
  if (safeHref === undefined || safeHref.length === 0) {
    const storageUri = document.storageUri?.trim();
    if (storageUri === undefined || storageUri.length === 0) {
      return null;
    }

    return (
      <span
        className="break-all font-mono text-[11px] text-muted-foreground"
        data-testid={isPodDocument ? "pod-document-preview" : "evidence-document-preview"}
      >
        {storageUri}
      </span>
    );
  }

  if (isPodDocument) {
    return (
      <a
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        data-testid="pod-document-preview"
        href={safeHref}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
        Open stored evidence
      </a>
    );
  }

  return (
    <a
      className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
      data-testid="evidence-document-preview"
      href={safeHref}
      rel="noreferrer"
      target="_blank"
    >
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      Open stored evidence
    </a>
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
        <Badge className={cn("max-w-full truncate", mayaAccent.pill)} data-testid="maya-evidence-record-id" key={recordId} title={recordId} variant="secondary">
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

function uniqueValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter((value) => value.length > 0))];
}
