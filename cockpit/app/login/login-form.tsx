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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  EyeIcon,
  FingerprintIcon,
  LockKeyholeIcon,
  SearchIcon,
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
  personas: LoginCockpitModel["personas"];
}

type PersonaOption = {
  label: string;
  loginId: string;
  role: string;
  sortOrder: number;
};

const invalidSessionMessage = "Your session is invalid or has expired. Please sign in again.";
const rememberUserIdKey = "recoup.login.rememberUserId:v1";
const rememberedLoginIdKey = "recoup.login.loginId:v1";

export function LoginForm({ hasInvalidSession, personas }: LoginFormProps) {
  const personaOptions = useMemo(
    () =>
      personas.map((persona): PersonaOption => ({
        label: displayLabelForPersona(persona),
        loginId: persona.loginId,
        role: persona.role,
        sortOrder: displayOrderForPersona(persona)
      }))
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [personas]
  );
  const defaultLoginId = preferredLoginId(personaOptions);
  const [personaSelection, setPersonaSelection] = useState(defaultLoginId);
  const [loginId, setLoginId] = useState(defaultLoginId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [dismissedInitialError, setDismissedInitialError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUserId, setRememberUserId] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const displayError =
    error ?? (hasInvalidSession && !dismissedInitialError ? invalidSessionMessage : undefined);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(rememberUserIdKey) !== "true") {
        return;
      }

      const rememberedLoginId = window.localStorage.getItem(rememberedLoginIdKey);
      const rememberedPersona = personaOptions.find((persona) => persona.loginId === rememberedLoginId);
      setRememberUserId(true);
      if (rememberedPersona !== undefined) {
        setLoginId(rememberedPersona.loginId);
        setPersonaSelection(rememberedPersona.loginId);
      }
    } catch {
      setRememberUserId(false);
    }
  }, [personaOptions]);

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
    setPersonaSelection(personaOptions.find((persona) => persona.loginId === nextLoginId)?.loginId ?? "");
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
          <Button
            aria-label="Workspace Forensics"
            className="h-14 w-full justify-between px-4 text-base font-medium shadow-sm"
            type="button"
            variant="outline"
          >
            <span className="flex min-w-0 items-center gap-3">
              <SearchIcon data-icon="inline-start" />
              <span>Forensics</span>
            </span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </Field>

        <Separator />

        <Field>
          <FieldLabel>Persona</FieldLabel>
          <ToggleGroup
            aria-label="Persona"
            className="w-full"
            onValueChange={(value) => {
              if (personaOptions.some((persona) => persona.loginId === value)) {
                setPersonaSelection(value);
                setLoginId(value);
              }
            }}
            spacing={0}
            type="single"
            value={personaSelection}
            variant="outline"
          >
            {personaOptions.map((persona) => (
              <ToggleGroupItem
                aria-label={persona.label}
                className="h-12 flex-1 rounded-none text-base first:rounded-l-lg last:rounded-r-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
                key={persona.loginId}
                value={persona.loginId}
              >
                {persona.role === "maya" ? <FingerprintIcon data-icon="inline-start" /> : null}
                {persona.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="loginId">User ID</FieldLabel>
          <InputGroup className="h-13">
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
          <InputGroup className="h-13">
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
          <Button
            aria-describedby="forgot-password-unavailable"
            aria-label="Forgot password unavailable"
            className="h-auto px-0 text-sm"
            disabled
            type="button"
            variant="link"
          >
            Forgot password?
          </Button>
          <span className="sr-only" id="forgot-password-unavailable">
            Password recovery is unavailable in this deterministic demo login.
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

function preferredLoginId(personas: PersonaOption[]): string {
  return personas.find((persona) => persona.role === "maya" || persona.loginId === "Maya")?.loginId ?? personas[0]?.loginId ?? "";
}

function displayOrderForPersona(persona: LoginCockpitModel["personas"][number]): number {
  if (persona.role === "cfo") {
    return 0;
  }
  if (persona.role === "david") {
    return 1;
  }
  if (persona.role === "maya") {
    return 2;
  }

  return 3;
}

function displayLabelForPersona(persona: LoginCockpitModel["personas"][number]): string {
  if (persona.role === "cfo") {
    return "Investigator";
  }
  if (persona.role === "david") {
    return "Reviewer";
  }
  if (persona.role === "maya") {
    return "Maya";
  }

  return persona.persona || persona.displayName || persona.loginId;
}
