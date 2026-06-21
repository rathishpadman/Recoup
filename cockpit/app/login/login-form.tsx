"use client";

import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { type SyntheticEvent, useState } from "react";

const personas = [
  { loginId: "Maya", workspace: "Deduction Forensics" },
  { loginId: "david", workspace: "Credit Arbitration" },
  { loginId: "CFO", workspace: "Executive Readout" }
] as const;

interface DemoLoginResponse {
  defaultRoute?: string;
  error?: string;
}

export function LoginForm() {
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
    <form aria-describedby={error === undefined ? undefined : "login-error"} className="login-form" onSubmit={handleSubmit}>
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
      <div aria-label="Demo personas">
        {personas.map((persona) => (
          <button
            key={persona.loginId}
            onClick={() => {
              setLoginId(persona.loginId);
            }}
            type="button"
          >
            <strong>{persona.loginId}</strong>
            <span>{persona.workspace}</span>
          </button>
        ))}
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
