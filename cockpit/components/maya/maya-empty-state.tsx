import {
  ClipboardListIcon,
  ClockIcon,
  FileSearchIcon,
  InboxIcon,
  SearchXIcon,
  ShieldCheckIcon,
  type LucideIcon
} from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export type MayaEmptyStateKind = "worklist" | "evidence" | "timeline" | "approval" | "search" | "generic";

interface MayaEmptyStateProps {
  description: string;
  kind?: MayaEmptyStateKind;
  title: string;
}

const emptyStateIconByKind = {
  worklist: ClipboardListIcon,
  evidence: FileSearchIcon,
  timeline: ClockIcon,
  approval: ShieldCheckIcon,
  search: SearchXIcon,
  generic: InboxIcon
} satisfies Record<MayaEmptyStateKind, LucideIcon>;

export function MayaEmptyState({ description, kind = "generic", title }: MayaEmptyStateProps) {
  const EmptyIcon = emptyStateIconByKind[kind];

  return (
    <Empty data-empty-kind={kind} data-testid="maya-empty-state">
      <EmptyHeader>
        <EmptyMedia data-testid="maya-empty-state-icon" variant="icon">
          <EmptyIcon aria-hidden="true" data-icon="empty-state" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent />
    </Empty>
  );
}
