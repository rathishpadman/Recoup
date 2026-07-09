"use client";

import { Badge } from "@/components/ui/badge";

interface DavidRecordDisclosureProps {
  items: readonly string[];
  label: string;
  variant?: "outline" | "secondary";
}

export function DavidRecordDisclosure({ items, label, variant = "outline" }: Readonly<DavidRecordDisclosureProps>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <details className="group/records rounded-md border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none font-medium text-foreground marker:hidden">
        {label}
        <span className="ml-2 text-muted-foreground group-open/records:hidden">Open</span>
        <span className="ml-2 hidden text-muted-foreground group-open/records:inline">Hide</span>
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge className="font-mono text-[0.68rem]" key={item} variant={variant}>
            {item}
          </Badge>
        ))}
      </div>
    </details>
  );
}
