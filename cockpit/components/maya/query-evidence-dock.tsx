"use client";

import { SearchIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MayaMultimodalDock } from "./types.ts";

interface QueryEvidenceDockProps {
  dock: MayaMultimodalDock;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recordIds: string[];
  selectedLine: string;
}

export function QueryEvidenceDock({ dock, onOpenChange, open, recordIds, selectedLine }: QueryEvidenceDockProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="sm:max-w-xl" data-testid="maya-query-dock">
        <SheetHeader>
          <SheetTitle>Evidence query</SheetTitle>
          <SheetDescription>{dock.policyLabel}</SheetDescription>
        </SheetHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-4 px-4">
          <Alert>
            <AlertTitle>Offline query shell</AlertTitle>
            <AlertDescription id="maya-query-offline-status">
              Query execution is not enabled in this review route.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2" aria-label={`${selectedLine} scoped query records`}>
            <Badge variant="secondary">{selectedLine}</Badge>
            {recordIds.map((recordId) => (
              <Badge key={recordId} variant="outline">
                {recordId}
              </Badge>
            ))}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="maya-query-question">Question</FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  aria-describedby="maya-query-offline-status"
                  data-testid="maya-query-input"
                  disabled
                  id="maya-query-question"
                  placeholder={dock.promptPlaceholder}
                  readOnly
                />
                <InputGroupAddon align="block-end">
                  <span>{dock.languageLabel}</span>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>{dock.transcript.english}</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2" aria-label="Query modes">
            {dock.modeOptions.map((mode) => (
              <Badge key={mode} variant="outline">
                {mode}
              </Badge>
            ))}
          </div>
        </div>
        <SheetFooter>
          <Button disabled type="button">
            <SearchIcon data-icon="inline-start" />
            Run query
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
