"use client";

import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { type SyntheticEvent, useState } from "react";
import type { LoginCockpitModel } from "../cockpit-data.ts";

interface DemoLoginResponse {
  defaultRoute?: string;
  error?: string;
}

interface LoginFormProps {
  personas: LoginCockpitModel["personas"];
}

export function LoginForm({ personas }: LoginFormProps) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

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
        setError(payload.error ?? "Demo login failed.");
        return;
      }

      window.location.assign(payload.defaultRoute);
    } catch {
      setError("Demo login service unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      aria-describedby={error === undefined ? undefined : "login-error"}
      action="/api/demo-login"
      className="login-form"
      method="post"
      onSubmit={handleSubmit}
    >
      <div className="login-persona-grid" aria-label="Demo personas">
        {personas.map((persona) => (
          <button
            aria-pressed={loginId === persona.loginId}
            key={persona.loginId}
            onClick={() => {
              setLoginId(persona.loginId);
            }}
            type="button"
          >
            <span className="login-persona-mark" aria-hidden="true">
              {loginId === persona.loginId ? <CheckCircle size={15} weight="fill" /> : persona.loginId.slice(0, 1)}
            </span>
            <span>
              <strong>{persona.loginId}</strong>
              <em>{persona.persona}</em>
            </span>
            <small>{persona.workspace}</small>
          </button>
        ))}
      </div>
      <div className="login-fields">
        <label>
          <span>User ID</span>
          <input
            autoComplete="username"
            name="loginId"
            onChange={(event) => {
              setLoginId(event.target.value);
            }}
            required
            value={loginId}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            required
            type="password"
            value={password}
          />
        </label>
      </div>
      <div className="login-auth-note">
        <span>Demo credentials only</span>
        <span>Server validates role and default route</span>
      </div>
      {error === undefined ? null : (
        <p className="micro" id="login-error" role="alert">
          {error}
        </p>
      )}
      <button disabled={submitting} type="submit">
        {submitting ? "Opening workspace" : "Open workspace"}
        <ArrowRight size={16} weight="bold" />
      </button>
    </form>
  );
}
