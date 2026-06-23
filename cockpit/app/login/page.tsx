import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { fetchLoginModel } from "../cockpit-data.ts";
import { LoginForm } from "./login-form.tsx";

interface LoginPageProps {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [login, params] = await Promise.all([fetchLoginModel(), searchParams]);
  const errorParam = params?.error;
  const hasInvalidSession =
    errorParam === "demo-login" || (Array.isArray(errorParam) && errorParam.includes("demo-login"));

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground"
      data-testid="maya-login-beat"
    >
      <MayaLoginLineArt />
      <Card
        className="relative z-10 w-full max-w-[590px] rounded-[20px] border border-border/80 bg-card py-0 shadow-xl ring-border/70"
        data-testid="maya-login-card"
      >
        <CardHeader className="px-8 pb-2 pt-14">
          <div className="flex items-center justify-center gap-5" aria-label="Recoup Maya Forensics">
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-[14px] bg-primary text-4xl font-semibold text-primary-foreground"
            >
              R
            </span>
            <div className="text-left">
              <div className="text-4xl font-semibold leading-none">RECOUP</div>
              <div className="mt-2 text-sm font-medium text-primary">MAYA FORENSICS</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="mx-auto flex w-[82%] max-w-[484px] flex-col px-0 pb-10 pt-4">
          <LoginForm hasInvalidSession={hasInvalidSession} personas={login.personas} />
        </CardContent>
      </Card>
    </main>
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
