import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaEvidencePack } from "./types.ts";

interface EvidenceDossierProps {
  evidencePack: MayaEvidencePack;
}

export function EvidenceDossier({ evidencePack }: EvidenceDossierProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence dossier</CardTitle>
        <CardDescription>Cited record IDs and retrieved documents</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Selected record IDs">
          {evidencePack.recordIds.map((recordId) => (
            <Badge key={recordId} variant="secondary">
              {recordId}
            </Badge>
          ))}
        </div>
        {evidencePack.documents.length === 0 ? (
          <MayaEmptyState description="The selected case did not return evidence documents." title="Evidence unavailable" />
        ) : (
          <ScrollArea className="max-h-[28rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Relevance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidencePack.documents.map((document) => (
                    <TableRow key={document.citationId}>
                      <TableCell className="min-w-56 whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{document.documentId}</span>
                          <span className="text-sm text-muted-foreground">{document.description}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">{document.sourceLabel}</TableCell>
                      <TableCell className="whitespace-normal">{document.verifiedLabel}</TableCell>
                      <TableCell className="whitespace-normal">{document.relevance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Accordion type="multiple">
                {evidencePack.documents.map((document) => (
                  <AccordionItem key={document.citationId} value={document.citationId}>
                    <AccordionTrigger>{document.citationId}</AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-2 text-muted-foreground">
                        <p>{document.summary}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{document.documentType}</Badge>
                          <Badge variant="outline">{document.sourceLabel}</Badge>
                          <Badge variant="outline">{document.verifiedLabel}</Badge>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
