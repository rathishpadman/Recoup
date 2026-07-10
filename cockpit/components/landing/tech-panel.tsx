import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { capabilityRows, guardrailCards } from "./landing-content.ts";

export function TechPanel() {
  return (
    <TabsContent className="m-0 pb-16 pt-2" data-testid="recoup-landing-tab-tech" value="tech">
      <div className="mb-7 max-w-[820px]">
        <p className="mb-2 font-serif text-[15px] italic text-muted-foreground">The architecture - five layers, one direction</p>
        <h2 className="m-0 font-serif text-3xl font-normal leading-tight text-foreground">Read-only evidence in, human-approved action out.</h2>
        <p className="mt-2 text-[15px] leading-6 text-[color:var(--text-secondary)]">
          Recoup keeps ERP writes disabled and requires cited records plus a deterministic basis before any human-approved external action.
        </p>
      </div>

      <figure className="m-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid="recoup-landing-architecture-figure">
        <img
          alt="Recoup architecture: read-only evidence in, human-approved action out"
          className="block h-auto w-full"
          src="/recoup-tech-architecture-infographic.png"
        />
        <figcaption className="border-t border-border/70 px-5 py-3 text-center text-xs text-muted-foreground">
          Evidence flows one way: read-only sources and grounded memory feed agents and deterministic services, then human-approved actions
          land in the hash-chained audit ledger.
        </figcaption>
      </figure>

      <div className="mt-6 grid grid-cols-3 gap-5 max-[900px]:grid-cols-1">
        {guardrailCards.map((card) => (
          <Card className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 rounded-xl border border-border bg-card p-4 shadow-sm ring-0" key={card.title}>
            <card.Icon className="mt-0.5 size-4 text-primary" />
            <div>
              <h3 className="m-0 text-sm font-semibold">{card.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-xs font-semibold text-muted-foreground">Layer</TableHead>
              <TableHead className="px-4 text-xs font-semibold text-muted-foreground">OpenAI capability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {capabilityRows.map((row) => (
              <TableRow className="hover:bg-muted/30" key={row.layer}>
                <TableCell className="px-4 py-3 text-sm font-semibold text-secondary-foreground">{row.layer}</TableCell>
                <TableCell className="px-4 py-3 font-mono text-xs text-foreground">{row.capability}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </TabsContent>
  );
}
