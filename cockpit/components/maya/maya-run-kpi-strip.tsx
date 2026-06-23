import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaKpiItem } from "./types.ts";

interface MayaRunKpiStripProps {
  items: MayaKpiItem[];
}

export function MayaRunKpiStrip({ items }: MayaRunKpiStripProps) {
  if (items.length === 0) {
    return <MayaEmptyState description="The run read model returned no KPI rows." title="KPI strip unavailable" />;
  }

  return (
    <section className="grid min-w-0 gap-3 md:grid-cols-3" aria-label="Forensics run KPIs">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardDescription>{item.label}</CardDescription>
              <Badge variant="outline">{item.support}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CardTitle className="text-xl">{item.value}</CardTitle>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
