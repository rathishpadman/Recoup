import { CheckCircle2Icon, FileTextIcon, ShieldCheckIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MayaEvidenceDocument, MayaEvidencePack, QueryEvidenceResponse } from "./types.ts";

interface CitedAnswerCardProps {
  evidencePack: MayaEvidencePack;
  response: QueryEvidenceResponse | undefined;
}

function hasCitedAnswer(response: QueryEvidenceResponse | undefined): response is QueryEvidenceResponse & {
  answer: string;
  deterministicBasis: string;
} {
  return (
    response !== undefined &&
    response.status === "answered" &&
    response.answer !== undefined &&
    response.answer.trim().length > 0 &&
    response.deterministicBasis !== undefined &&
    response.deterministicBasis.trim().length > 0 &&
    response.citations.length > 0 &&
    response.recordIds.length > 0
  );
}

type BackendCitation = QueryEvidenceResponse["citations"][number];

function findEvidenceDocumentForCitation(
  citation: BackendCitation,
  documents: MayaEvidenceDocument[]
): MayaEvidenceDocument | undefined {
  return documents.find(
    (document) =>
      document.documentId === citation.documentId ||
      document.documentId === citation.recordId ||
      document.citationId === citation.documentId ||
      document.citationId === citation.recordId
  );
}

function hasBackendCitationMetadata(citation: BackendCitation): boolean {
  return (
    citation.documentId !== undefined ||
    citation.source !== undefined ||
    citation.summary !== undefined
  );
}

export function CitedAnswerCard({ evidencePack, response }: CitedAnswerCardProps) {
  if (!hasCitedAnswer(response)) {
    return (
      <Card data-testid="maya-cited-answer" size="sm">
        <CardHeader>
          <CardTitle>Cited answer</CardTitle>
          <CardDescription>Blocked unless a response includes citations and deterministic basis</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert data-testid="maya-cited-answer-blocked">
            <AlertTitle>{response?.message ?? "No cited answer returned"}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-2">
                {(response?.recordIds ?? []).map((recordId) => (
                  <Badge key={recordId} variant="outline">
                    {recordId}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const citationRows = response.citations.map((citation) => ({
    citation,
    metadata: findEvidenceDocumentForCitation(citation, evidencePack.documents)
  }));

  return (
    <Card data-testid="maya-cited-answer" size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
          <span>Citation review</span>
        </CardTitle>
        <CardDescription>Accepted only after answer, deterministic basis, and cited record IDs are present.</CardDescription>
        <CardAction>
          <Badge variant="secondary">Answered</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Answer summary</Badge>
              <Badge variant="outline">{`${response.recordIds.length.toString()} cited records`}</Badge>
              <Badge variant="outline">{`${evidencePack.documents.length.toString()} loaded documents`}</Badge>
            </div>
            <p className="text-sm leading-6" data-testid="maya-cited-answer-text">
              {response.answer}
            </p>
          </div>
          <Separator />
          <Alert data-testid="maya-cited-answer-basis">
            <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Deterministic basis</AlertTitle>
            <AlertDescription>{response.deterministicBasis}</AlertDescription>
          </Alert>
        </div>
        <Accordion collapsible type="single">
          <AccordionItem data-testid="maya-cited-source-details" value="source-details">
            <AccordionTrigger>Sources</AccordionTrigger>
            <AccordionContent>
              <div className="flex min-w-0 flex-col gap-2" aria-label="Cited answer record IDs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Citations</span>
                  <Badge variant="outline">Record IDs from query response</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record ID</TableHead>
                      <TableHead>Evidence metadata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {citationRows.map(({ citation, metadata }, index) => {
                      const hasBackendMetadata = hasBackendCitationMetadata(citation);
                      return (
                        <TableRow
                          data-citation-index={index}
                          data-metadata-gap={metadata === undefined && !hasBackendMetadata ? "true" : undefined}
                          data-metadata-join={metadata === undefined ? (hasBackendMetadata ? "backend-citation" : undefined) : "exact"}
                          data-record-id={citation.recordId}
                          data-testid="maya-cited-record-row"
                          key={`${citation.recordId}-${index.toString()}`}
                        >
                          <TableCell className="w-[34%] whitespace-normal align-top">
                            <Badge className="max-w-full truncate" title={citation.recordId} variant="secondary">
                              {citation.recordId}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <div className="flex min-w-0 flex-col gap-1" data-testid="maya-cited-record-metadata">
                              {metadata !== undefined ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                                    <span className="font-medium">{metadata.description}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <Badge variant="secondary">{metadata.citationId}</Badge>
                                    <Badge variant="outline">{metadata.documentId}</Badge>
                                    <Badge variant="outline">{metadata.documentType}</Badge>
                                    <Badge variant="outline">{metadata.relevance}</Badge>
                                    {citation.source === undefined ? null : <Badge variant="outline">{citation.source}</Badge>}
                                  </div>
                                  <span className="text-sm text-muted-foreground">
                                    {metadata.sourceLabel} / {metadata.verifiedLabel}
                                  </span>
                                  <span className="text-sm text-muted-foreground">{citation.summary ?? metadata.summary}</span>
                                </>
                              ) : hasBackendMetadata ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                                    <span className="font-medium">{citation.documentId ?? citation.recordId}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {citation.documentId === undefined ? null : <Badge variant="secondary">{citation.documentId}</Badge>}
                                    {citation.source === undefined ? null : <Badge variant="outline">{citation.source}</Badge>}
                                  </div>
                                  {citation.summary === undefined ? null : (
                                    <span className="text-sm text-muted-foreground">{citation.summary}</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                                    <span>Metadata unavailable</span>
                                  </div>
                                  <span className="text-sm text-muted-foreground">
                                    No exact document ID, source, or summary was returned for this cited record.
                                  </span>
                                </>
                              )}
                              <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/25 p-2">
                                <span className="text-xs font-medium">Citation basis</span>
                                <span className="text-sm text-muted-foreground" data-testid="maya-cited-record-basis">
                                  {citation.deterministicBasis}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
