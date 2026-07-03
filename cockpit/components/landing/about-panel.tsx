import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { aboutCapabilities, aboutRows } from "./landing-content.ts";

export function AboutPanel() {
  return (
    <TabsContent className="m-0 pb-16 pt-2" data-testid="recoup-landing-tab-about" value="about">
      <div className="mb-7 text-center">
        <p className="mb-2 font-serif text-[15px] italic text-muted-foreground">About this demo</p>
        <h2 className="m-0 font-serif text-4xl font-normal leading-tight text-foreground">
          Built for the Hackathon.
          <br />
          <em className="text-primary">Designed for production.</em>
        </h2>
      </div>

      <div className="grid grid-cols-[1.05fr_0.95fr] items-start gap-5 max-[900px]:grid-cols-1">
        <Card className="gap-0 rounded-xl border border-border bg-card p-7 shadow-sm ring-0">
          <p className="mb-3 font-serif text-[15px] italic text-muted-foreground">The demo story</p>
          <p className="m-0 text-[15px] leading-7 text-[color:var(--text-secondary)]">
            NorthBay Brands is a fictional CPG manufacturer bleeding revenue through retailer deductions and unmanaged credit exposure.
            Recoup gives its O2C team a governed cockpit: agents investigate the evidence, deterministic code computes every dollar and risk
            score, and nothing leaves the building without a human signature.
          </p>
          <p className="mt-4 text-[15px] leading-7 text-[color:var(--text-secondary)]">
            Four agentic capabilities run on one deterministic evidence spine, and every decision they produce lands in a hash-chained audit
            trail.
          </p>
          <ul className="mt-4 flex list-none flex-col gap-1.5 p-0">
            {aboutCapabilities.map((capability) => (
              <li className="relative pl-3 text-xs leading-5 text-muted-foreground before:absolute before:left-0 before:top-2 before:size-1.5 before:rounded-full before:border before:border-primary before:bg-[color:var(--primary-subtle)]" key={capability}>
                {capability}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge className="rounded-sm border-border bg-card text-muted-foreground" variant="outline">
              Synthetic: company, data, personas
            </Badge>
            <Badge className="rounded-sm border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] text-primary" variant="outline">
              Real: governance, audit chain, scoring logic, UI flows
            </Badge>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-0">
            <Table>
              <TableBody>
                {aboutRows.map((row) => (
                  <TableRow className="hover:bg-muted/30" key={row.label}>
                    <TableCell className="w-[160px] bg-muted/50 px-4 py-3 text-xs font-semibold text-muted-foreground">{row.label}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-secondary-foreground">{row.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="rounded-xl border border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] px-5 py-4 text-sm leading-6 text-secondary-foreground">
            <strong className="mb-1 block text-xs font-semibold text-primary">Governance disclaimer</strong>
            Data is synthetic. The governance architecture, audit trail, scoring logic, and UI flows are presented as real product behavior.
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
