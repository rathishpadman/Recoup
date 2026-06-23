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
import { type SyntheticEvent, useState } from "react";
import type { LoginCockpitModel } from "../cockpit-data.ts";

interface DemoLoginResponse {
  defaultRoute?: string;
  error?: string;
}

interface LoginFormProps {
  hasInvalidSession: boolean;
  personas: LoginCockpitModel["personas"];
}

const personaLabels = ["Investigator", "Reviewer", "Maya"] as const;
const invalidSessionMessage = "Your session is invalid or has expired. Please sign in again.";

export function LoginForm({ hasInvalidSession, personas }: LoginFormProps) {
  const availablePersonaIds = personas.map((persona) => persona.loginId);
  const mayaPersonaAvailable = availablePersonaIds.includes("Maya");
  const [personaSelection, setPersonaSelection] = useState<(typeof personaLabels)[number]>(
    mayaPersonaAvailable ? "Maya" : "Investigator"
  );
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [dismissedInitialError, setDismissedInitialError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const displayError =
    error ?? (hasInvalidSession && !dismissedInitialError ? invalidSessionMessage : undefined);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitLogin();
  }

  async function submitLogin() {
    setError(undefined);
    setSubmitting(true);

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
            className="h-14 w-full justify-between px-4 text-base font-normal"
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
              if (personaLabels.includes(value as (typeof personaLabels)[number])) {
                setPersonaSelection(value as (typeof personaLabels)[number]);
              }
            }}
            spacing={0}
            type="single"
            value={personaSelection}
            variant="outline"
          >
            {personaLabels.map((label) => (
              <ToggleGroupItem
                aria-label={label}
                className="h-12 flex-1 rounded-none text-base first:rounded-l-lg last:rounded-r-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
                key={label}
                value={label}
              >
                {label === "Maya" ? <FingerprintIcon data-icon="inline-start" /> : null}
                {label}
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
                setLoginId(event.target.value);
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
            <Checkbox id="remember-user-id" />
            <FieldLabel className="font-normal text-muted-foreground" htmlFor="remember-user-id">
              Remember user ID
            </FieldLabel>
          </Field>
          <Button className="h-auto px-0 text-sm" type="button" variant="link">
            Forgot password?
          </Button>
        </div>
      </FieldGroup>

      <Button className="h-14 w-full text-base font-semibold" disabled={submitting} type="submit">
        <ShieldCheckIcon data-icon="inline-start" />
        {submitting ? "Opening workspace" : "Open workspace"}
      </Button>

      {displayError === undefined ? null : (
        <Alert className="min-h-20 border-destructive/50 bg-destructive/5" id="login-error" variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Invalid session</AlertTitle>
          <AlertDescription>{displayError}</AlertDescription>
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
        <span aria-hidden="true">/</span>
        <span>Enterprise grade</span>
        <span aria-hidden="true">/</span>
        <span>Audit ready</span>
      </div>
    </form>
  );
}
