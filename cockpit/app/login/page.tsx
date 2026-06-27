import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LockKeyholeIcon, ShieldCheckIcon, WorkflowIcon } from "lucide-react";
import type { ReactNode } from "react";
import { buildCockpitDemoLoginPersonas } from "../../../config/cockpitDemoProfiles.ts";
import { LoginForm } from "./login-form.tsx";

interface LoginPageProps {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorParam = params?.error;
  const hasInvalidSession =
    errorParam === "demo-login" || (Array.isArray(errorParam) && errorParam.includes("demo-login"));
  const personas = buildCockpitDemoLoginPersonas();

  return (
    <main
      className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground"
      data-testid="maya-login-beat"
    >
      <MayaLoginLineArt />
      <div className="relative z-10 grid w-full max-w-[1120px] items-stretch gap-6 lg:grid-cols-[minmax(0,500px)_minmax(320px,1fr)]">
        <Card
          className="w-full rounded-[20px] border border-border/80 bg-card py-0 shadow-2xl ring-1 ring-border/60"
          data-testid="maya-login-card"
        >
          <CardHeader className="px-8 pb-1 pt-12">
            <div className="flex items-center justify-center gap-6" aria-label="Recoup Deduction Forensics">
              <RecoupAngularMark />
              <div className="text-left">
                <div className="text-[2.5rem] font-semibold leading-none">RECOUP</div>
                <div className="mt-2 text-sm font-medium text-primary">Deduction Forensics</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="mx-auto flex w-[82%] max-w-[484px] flex-col px-0 pb-9 pt-4">
            <LoginForm hasInvalidSession={hasInvalidSession} personas={personas} />
          </CardContent>
        </Card>

        <aside
          aria-label="Workspace access context"
          className="hidden min-h-full rounded-[20px] border border-border/70 bg-card/90 p-8 shadow-[var(--shadow-sm)] ring-1 ring-border/40 lg:flex lg:flex-col lg:justify-between"
          data-testid="maya-login-context-panel"
        >
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
                Governed access
              </div>
              <h1 className="text-3xl font-semibold leading-tight tracking-normal text-foreground">
                Enter the analyst workspace with evidence controls already on.
              </h1>
              <p className="max-w-[34rem] text-sm leading-6 text-muted-foreground">
                The sign-in flow opens the read-only deduction forensics workspace and preserves the approval boundary for every external action.
              </p>
            </div>

            <div className="grid gap-3">
              <LoginAssuranceItem
                description="ERP and supporting records stay read-only from the cockpit."
                icon={<LockKeyholeIcon aria-hidden="true" className="size-4" />}
                title="Read-only evidence"
              />
              <LoginAssuranceItem
                description="Findings keep deterministic basis and cited records available for review."
                icon={<WorkflowIcon aria-hidden="true" className="size-4" />}
                title="Traceable decisions"
              />
              <LoginAssuranceItem
                description="Recovery, routing, and correspondence remain draft-only until a human approves."
                icon={<ShieldCheckIcon aria-hidden="true" className="size-4" />}
                title="Human approval gate"
              />
            </div>
          </div>

          <div className="border-t border-border/70 pt-6 text-sm text-muted-foreground">
            Workspace context is fixed for this demo session. Use your assigned User ID and password to continue.
          </div>
        </aside>
      </div>
    </main>
  );
}

function LoginAssuranceItem({
  description,
  icon,
  title
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-3 rounded-lg border border-border/70 bg-background/70 p-4">
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function RecoupAngularMark() {
  return (
    <svg
      aria-hidden="true"
      className="size-20 text-primary drop-shadow-sm"
      fill="none"
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path className="fill-primary" d="M17 18h41l21 20v19L61 75H45L29 59v18H17V31l12 12v1l27-1 7-7-8-7H28v17L17 35V18Z" />
      <path className="fill-primary/80" d="M31 47h22l21 28H58L42 58H31V47Z" />
      <path className="fill-background" d="M29 29h26l8 7-7 7H31l-2-2V29Z" />
      <path className="fill-background" d="M29 59V43l16 16H29Z" />
    </svg>
  );
}

function MayaLoginLineArt() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-border">
      <div className="absolute left-[3%] top-0 h-full w-px bg-border/60" />
      <div className="absolute right-[12%] top-0 h-full w-px bg-border/50" />
      <div className="absolute left-0 top-[36%] h-px w-[34%] bg-border/50" />
      <div className="absolute right-0 top-[12%] h-px w-[24%] bg-border/40" />
      <div className="absolute bottom-[18%] left-0 h-px w-[30%] bg-border/40" />
      <div className="absolute -left-[13rem] top-[31%] h-[18rem] w-[25rem] rounded-[44px] border border-border/50" />
      <div className="absolute -right-[12rem] top-[13%] h-[25rem] w-[28rem] rounded-[80px] border border-border/50" />
      <div className="absolute -right-[8rem] bottom-[7%] h-[20rem] w-[24rem] rounded-[72px] border border-border/40" />
    </div>
  );
}
