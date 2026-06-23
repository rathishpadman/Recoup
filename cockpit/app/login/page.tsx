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
        className="relative z-10 w-full max-w-[590px] rounded-[20px] border border-border/80 bg-card py-0 shadow-2xl ring-1 ring-border/60"
        data-testid="maya-login-card"
      >
        <CardHeader className="px-8 pb-1 pt-12">
          <div className="flex items-center justify-center gap-6" aria-label="Recoup Maya Forensics">
            <RecoupAngularMark />
            <div className="text-left">
              <div className="text-[2.5rem] font-semibold leading-none">RECOUP</div>
              <div className="mt-2 text-sm font-medium text-primary">MAYA FORENSICS</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="mx-auto flex w-[82%] max-w-[484px] flex-col px-0 pb-9 pt-4">
          <LoginForm hasInvalidSession={hasInvalidSession} personas={login.personas} />
        </CardContent>
      </Card>
    </main>
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
