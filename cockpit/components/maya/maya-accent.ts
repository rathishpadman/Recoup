export const mayaAccent = {
  appFrame: "selection:bg-primary/20 selection:text-primary-foreground",
  iconBubble: "border-primary/20 bg-primary/10 text-primary",
  outlineButton: "border-primary/20 text-primary hover:bg-primary/10 hover:text-primary",
  pill: "border-primary/20 bg-primary/10 text-primary",
  proofMutedPanel: "border-primary/15 bg-[color:color-mix(in_srgb,var(--primary)_5%,var(--background))]",
  proofPanel: "border-primary/20 bg-[color:color-mix(in_srgb,var(--primary)_8%,var(--background))]",
  selectedRow:
    "data-[selected=true]:border-l-[3px] data-[selected=true]:border-l-primary data-[selected=true]:bg-primary/5 data-[selected=true]:shadow-[var(--shadow-sm)] data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20",
  sidebar: "border-primary/15 bg-[color:color-mix(in_srgb,var(--primary)_4%,var(--sidebar))]",
  sidebarActiveItem:
    "data-[active=true]:border-primary/20 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:shadow-sm",
  sidebarBadge: "border border-primary/20 bg-primary/10 text-primary",
  sidebarSurfaceLabel: "border-primary/20 bg-primary/10 text-sidebar-foreground",
  subtleCard: "border-primary/15 bg-[color:color-mix(in_srgb,var(--primary)_4%,var(--card))]"
} as const;
