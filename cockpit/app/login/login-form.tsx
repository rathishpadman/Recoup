"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangleIcon,
  Building2Icon,
  EyeIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  UserIcon,
  XIcon
} from "lucide-react";
import { type SyntheticEvent, useEffect, useMemo, useState } from "react";
import type { LoginCockpitModel } from "../cockpit-data.ts";

interface DemoLoginResponse {
  defaultRoute?: string;
  error?: string;
}

interface LoginFormProps {
  hasInvalidSession: boolean;
  initialLoginId: string | undefined;
  personas: LoginCockpitModel["personas"];
}

type PersonaOption = {
  loginId: string;
  role: string;
};

const invalidSessionMessage = "Your session is invalid or has expired. Please sign in again.";
const rememberUserIdKey = "recoup.login.rememberUserId:v1";
const rememberedLoginIdKey = "recoup.login.loginId:v1";

export function LoginForm({ hasInvalidSession, initialLoginId, personas }: LoginFormProps) {
  const personaOptions = useMemo(
    () =>
      personas.map((persona): PersonaOption => ({
        loginId: persona.loginId,
        role: persona.role
      })),
    [personas]
  );
  const initialPersonaLoginId = useMemo(
    () => personaOptions.find((persona) => persona.loginId === initialLoginId)?.loginId,
    [initialLoginId, personaOptions]
  );
  const [loginId, setLoginId] = useState(initialPersonaLoginId ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [dismissedInitialError, setDismissedInitialError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUserId, setRememberUserId] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const displayError =
    error ?? (hasInvalidSession && !dismissedInitialError ? invalidSessionMessage : undefined);

  useEffect(() => {
    if (initialPersonaLoginId !== undefined) {
      setLoginId(initialPersonaLoginId);
      try {
        setRememberUserId(window.localStorage.getItem(rememberUserIdKey) === "true");
      } catch {
        setRememberUserId(false);
      }
      return;
    }

    try {
      if (window.localStorage.getItem(rememberUserIdKey) !== "true") {
        return;
      }

      const rememberedLoginId = window.localStorage.getItem(rememberedLoginIdKey);
      const rememberedPersona = personaOptions.find((persona) => persona.loginId === rememberedLoginId);
      setRememberUserId(true);
      if (rememberedPersona !== undefined) {
        setLoginId(rememberedPersona.loginId);
      }
    } catch {
      setRememberUserId(false);
    }
  }, [initialPersonaLoginId, personaOptions]);

  useEffect(() => {
    try {
      if (rememberUserId) {
        window.localStorage.setItem(rememberUserIdKey, "true");
        if (loginId.trim().length > 0) {
          window.localStorage.setItem(rememberedLoginIdKey, loginId);
        }
        return;
      }

      window.localStorage.removeItem(rememberUserIdKey);
      window.localStorage.removeItem(rememberedLoginIdKey);
    } catch {
      setRememberUserId(false);
    }
  }, [loginId, rememberUserId]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitLogin();
  }

  async function submitLogin() {
    setError(undefined);
    setSubmitting(true);
    if (rememberUserId) {
      try {
        window.localStorage.setItem(rememberedLoginIdKey, loginId);
      } catch {
        setRememberUserId(false);
      }
    }

    try {
      const response = await fetch("/api/demo-login", {
        body: JSON.stringify({ loginId, password }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as DemoLoginResponse;

      if (!response.ok || payload.defaultRoute === undefined) {
        setError(payload.error ?? invalidSessionMessage);
        return;
      }

      window.location.assign(payload.defaultRoute);
    } catch {
      setError("Demo login service unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  function dismissError() {
    setError(undefined);
    setDismissedInitialError(true);
  }

  function updateLoginId(nextLoginId: string) {
    setLoginId(nextLoginId);
  }

  function updateRememberUserId(checked: boolean | "indeterminate") {
    const nextRememberUserId = checked === true;
    setRememberUserId(nextRememberUserId);
    try {
      if (nextRememberUserId) {
        window.localStorage.setItem(rememberUserIdKey, "true");
        window.localStorage.setItem(rememberedLoginIdKey, loginId);
        return;
      }

      window.localStorage.removeItem(rememberUserIdKey);
      window.localStorage.removeItem(rememberedLoginIdKey);
    } catch {
      setRememberUserId(false);
    }
  }

  return (
    <form
      aria-describedby={displayError === undefined ? undefined : "login-error"}
      action="/api/demo-login"
      className="flex flex-col gap-5"
      method="post"
      onSubmit={handleSubmit}
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Workspace</FieldLabel>
          <div className="flex">
            <div
              aria-label="Workspace Forensics"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/30 px-3.5 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-sm)]"
              data-testid="maya-login-workspace-chip"
            >
              <Building2Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>Forensics</span>
            </div>
          </div>
        </Field>

        <Separator />

        <Field>
          <FieldLabel htmlFor="loginId">User ID</FieldLabel>
          <InputGroup className="h-13 has-[[data-slot=input-group-control]:focus-visible]:border-ring/60 has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20">
            <InputGroupAddon>
              <UserIcon />
            </InputGroupAddon>
            <InputGroupInput
              autoComplete="username"
              id="loginId"
              name="loginId"
              onChange={(event) => {
                updateLoginId(event.target.value);
              }}
              placeholder="Enter your user ID"
              required
              value={loginId}
            />
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <InputGroup
            className="h-13 has-[[data-slot=input-group-control]:focus-visible]:border-ring/60 has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20"
            data-testid="maya-login-password-group"
          >
            <InputGroupAddon>
              <LockKeyholeIcon />
            </InputGroupAddon>
            <InputGroupInput
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              placeholder="Enter your password"
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => {
                  setShowPassword((current) => !current);
                }}
                type="button"
              >
                <EyeIcon data-icon="inline-start" />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>

        <div className="flex items-center justify-between gap-3">
          <Field className="w-auto flex-row items-center gap-2" orientation="horizontal">
            <Checkbox checked={rememberUserId} id="remember-user-id" onCheckedChange={updateRememberUserId} />
            <FieldLabel className="font-normal text-muted-foreground" htmlFor="remember-user-id">
              Remember user ID
            </FieldLabel>
          </Field>
          <span className="text-sm text-muted-foreground">
            Password recovery unavailable in demo
          </span>
        </div>
      </FieldGroup>

      <Button className="h-14 w-full text-base font-semibold shadow-md shadow-primary/20" disabled={submitting} type="submit">
        <ShieldCheckIcon data-icon="inline-start" />
        {submitting ? "Opening Forensics Workspace" : "Open Forensics Workspace"}
      </Button>

      {displayError === undefined ? null : (
        <Alert className="min-h-20 border-destructive/35 bg-card shadow-sm" id="login-error">
          <AlertTriangleIcon className="text-destructive" />
          <AlertTitle>Invalid session</AlertTitle>
          <AlertDescription className="text-muted-foreground">{displayError}</AlertDescription>
          <AlertAction>
            <Button aria-label="Dismiss login alert" onClick={dismissError} size="icon-sm" type="button" variant="ghost">
              <XIcon data-icon="inline-start" />
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Separator />

      <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <ShieldCheckIcon aria-hidden="true" />
          Secure access
        </span>
        <span aria-hidden="true">•</span>
        <span>Enterprise grade</span>
        <span aria-hidden="true">•</span>
        <span>Audit ready</span>
      </div>
    </form>
  );
}
