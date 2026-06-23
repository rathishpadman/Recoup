"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MayaForensicsSurfaceProps } from "./types.ts";

function connectorBadgeVariant(statusTone: "ready" | "synthetic" | "blocked"): "default" | "outline" | "secondary" {
  if (statusTone === "ready") {
    return "secondary";
  }

  if (statusTone === "blocked") {
    return "outline";
  }

  return "default";
}

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [selectedLineId, setSelectedLineId] = React.useState(model.selected.lineId);
  const selectedWorklistItem =
    model.worklist.find((item) => item.lineIds.includes(selectedLineId)) ??
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ??
    model.worklist[0];

  return (
    <main
      className="min-h-screen bg-background px-6 py-5 text-foreground md:px-8"
      data-testid="maya-shadcn-workbench"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{session.displayName}</p>
            <h1 className="text-2xl font-semibold">Deduction forensics</h1>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Session routes">
            {session.allowedRoutes.map((route) => (
              <Badge key={route} variant="outline">
                {route}
              </Badge>
            ))}
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3" aria-label="Forensics readout">
          {model.kpiStrip.map((item) => (
            <Card key={item.label} size="sm">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.support}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" aria-label="Maya workbench">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Recommended action worklist</CardTitle>
                <CardDescription>{model.whatChanged}</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {model.worklist.map((item) => {
                      const isSelected = item.lineIds.includes(selectedLineId);

                      return (
                        <TableRow aria-selected={isSelected} data-state={isSelected ? "selected" : undefined} key={item.lineId}>
                          <TableCell>
                            <Button
                              aria-label={`Select ${item.scenarioLabel}`}
                              onClick={() => {
                                setSelectedLineId(item.lineId);
                              }}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {item.scenarioLabel}
                            </Button>
                            <p className="text-sm text-muted-foreground">{item.customerLabel}</p>
                          </TableCell>
                          <TableCell>{item.recommendedActionLabel}</TableCell>
                          <TableCell>{item.amount}</TableCell>
                          <TableCell>{item.evidenceScoreLabel}</TableCell>
                          <TableCell>{item.queueLabel}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidence pack</CardTitle>
                <CardDescription>{model.selected.draft.basis}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2" aria-label="Selected record IDs">
                  {model.selected.evidencePack.recordIds.map((recordId) => (
                    <Badge key={recordId} variant="secondary">
                      {recordId}
                    </Badge>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Verification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {model.selected.evidencePack.documents.map((document) => (
                      <TableRow key={document.citationId}>
                        <TableCell>
                          <p>{document.documentId}</p>
                          <p className="text-sm text-muted-foreground">{document.summary}</p>
                        </TableCell>
                        <TableCell>{document.sourceLabel}</TableCell>
                        <TableCell>{document.verifiedLabel}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-4" aria-label="Case context">
            <Card>
              <CardHeader>
                <CardTitle>Selected case</CardTitle>
                <CardDescription>{selectedWorklistItem?.recommendedActionLabel ?? model.selected.draft.actionLabel}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Line</span>
                  <span className="font-medium">{model.selected.lineId}</span>
                </div>
                <Separator />
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Draft</span>
                  <span className="font-medium">{model.selected.draft.actionLabel}</span>
                  <span className="text-sm text-muted-foreground">{model.selected.draft.statusLabel}</span>
                </div>
                <Separator />
                <div className="flex flex-col gap-2">
                  <h2 className="text-base font-medium">Human approval</h2>
                  {model.selected.approvalActions.map((action) => (
                    <Badge key={action.decision} variant="outline">
                      {action.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Source readiness</CardTitle>
                <CardDescription>{connectors.lastRefreshedLabel}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {connectors.sourceTiles.map((source) => (
                  <div className="flex flex-col gap-1 rounded-md border p-3" key={source.key}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{source.label}</span>
                      <Badge variant={connectorBadgeVariant(source.statusTone)}>{source.stateLabel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{source.summary}</p>
                    <div className="flex flex-wrap gap-2" aria-label={`${source.label} proof`}>
                      {source.proofItems.map((proof) => (
                        <Badge key={proof} variant="outline">
                          {proof}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                <Separator />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connector</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connectors.connectors.map((connector) => (
                      <TableRow key={connector.name}>
                        <TableCell>{connector.name}</TableCell>
                        <TableCell>{connector.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
