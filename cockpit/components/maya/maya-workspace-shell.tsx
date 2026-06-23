import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DemoSession } from "../../app/demo-auth.ts";

interface MayaWorkspaceShellProps {
  children: ReactNode;
  session: DemoSession;
}

export function MayaWorkspaceShell({ children, session }: MayaWorkspaceShellProps) {
  return (
    <TooltipProvider>
      <main
        className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 lg:px-8"
        data-testid="maya-shadcn-workbench"
      >
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <header className="flex min-w-0 flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm text-muted-foreground">{session.displayName}</p>
              <h1 className="text-2xl font-semibold">Deduction forensics</h1>
              <p className="text-sm text-muted-foreground">{session.defaultRoute}</p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Allowed workspace routes">
              <Badge variant="secondary">{session.role}</Badge>
              {session.allowedRoutes.map((route) => (
                <Badge key={route} variant="outline">
                  {route}
                </Badge>
              ))}
            </div>
          </header>
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
        </div>
      </main>
    </TooltipProvider>
  );
}
