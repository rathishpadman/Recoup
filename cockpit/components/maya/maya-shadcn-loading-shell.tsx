import { Skeleton } from "@/components/ui/skeleton";

export function MayaShadcnLoadingShell() {
  return (
    <main
      aria-busy="true"
      aria-label="Connecting Maya forensics workspace"
      className="min-h-svh bg-background text-foreground"
      data-testid="maya-shadcn-loading-shell"
    >
      <div className="grid min-h-svh grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden border-r bg-sidebar p-4 text-sidebar-foreground md:flex md:flex-col md:gap-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md border border-sidebar-border bg-sidebar-accent/40" />
            <div className="grid gap-2">
              <Skeleton className="h-5 w-24 bg-sidebar-accent/60" />
              <Skeleton className="h-3 w-28 bg-sidebar-accent/40" />
            </div>
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-9 rounded-md bg-sidebar-accent/50" />
            <Skeleton className="h-8 rounded-md bg-sidebar-accent/30" />
            <Skeleton className="h-8 rounded-md bg-sidebar-accent/30" />
            <Skeleton className="h-8 rounded-md bg-sidebar-accent/30" />
          </div>
          <div className="mt-auto grid gap-2">
            <Skeleton className="h-8 rounded-md bg-sidebar-accent/30" />
            <Skeleton className="h-3 w-32 bg-sidebar-accent/30" />
          </div>
        </aside>
        <section className="flex min-w-0 flex-col gap-4 px-5 py-5">
          <header className="flex min-w-0 items-center justify-between gap-4">
            <div className="grid min-w-0 gap-2">
              <p className="text-sm font-medium text-muted-foreground">Connecting workspace</p>
              <Skeleton className="h-7 w-64 max-w-full" />
            </div>
            <Skeleton className="h-9 w-28 rounded-md" />
          </header>
          <div className="grid gap-3 xl:grid-cols-[minmax(19rem,0.34fr)_minmax(0,1fr)]">
            <div className="grid gap-3">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
            <div className="grid min-w-0 gap-3">
              <Skeleton className="h-20 rounded-lg" />
              <div className="grid gap-3 md:grid-cols-4">
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </div>
              <Skeleton className="h-80 rounded-lg" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
