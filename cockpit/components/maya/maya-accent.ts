export const mayaAccent = {
  appFrame: "maya-accent-root selection:bg-[color:var(--maya-accent-selection)] selection:text-white",
  iconBubble:
    "border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface)] text-[color:var(--maya-accent-strong)]",
  outlineButton:
    "border-[color:var(--maya-accent-border)] text-[color:var(--maya-accent-strong)] hover:border-[color:var(--maya-accent)] hover:bg-[color:var(--maya-accent-surface)] hover:text-[color:var(--maya-accent-strong)]",
  pill:
    "border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface)] text-[color:var(--maya-accent-strong)]",
  proofMutedPanel: "border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface-muted)]",
  proofPanel: "border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface)]",
  selectedRow:
    "data-[selected=true]:bg-[color:var(--maya-accent-surface-strong)] data-[selected=true]:shadow-[var(--shadow-sm)] data-[selected=true]:ring-1 data-[selected=true]:ring-[color:var(--maya-accent-ring)]",
  sidebar:
    "border-[color:var(--maya-accent-sidebar-border)] bg-[color:var(--maya-accent-sidebar)] text-[color:var(--maya-accent-light)]",
  sidebarActiveItem:
    "hover:bg-[color:var(--maya-accent-sidebar-active)] hover:text-white data-[active=true]:border-transparent data-[active=true]:bg-[color:var(--maya-accent-sidebar-active)] data-[active=true]:text-white data-[active=true]:shadow-none",
  sidebarBadge:
    "border border-[color:var(--maya-accent-sidebar-border)] bg-[color:var(--maya-accent-sidebar-active)] text-white",
  sidebarSurfaceLabel:
    "border-transparent bg-[color:var(--maya-accent-sidebar-active)] text-white shadow-none",
  subtleCard: "border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface-muted)]"
} as const;
