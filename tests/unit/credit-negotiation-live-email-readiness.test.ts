import { describe, expect, it } from "vitest";
import {
  buildCreditNegotiationLiveEmailReadinessReport,
  fetchCreditNegotiationInboundRouteForReadiness,
  fetchCreditNegotiationResendWebhooksForReadiness
} from "../../scripts/checkCreditNegotiationLiveEmailReadiness.js";

const baseReadyEnv = {
  CREDIT_NEGOTIATION_FROM_EMAIL: "deals@north-bay.dev",
  CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT: "5",
  CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET: "retry-secret",
  EMAIL_TO_BILLING: "billing@example.com",
  EMAIL_TO_RECOVERY: "recovery@example.com",
  HARBOR_AP_CONTACT_EMAIL: "harbor-ap@example.com",
  OPENAI_API_KEY: "test-openai-api-key",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-cockpit-auth-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-credit-lead",
  RECOUP_CREDIT_NEGOTIATION_RESET_ENABLED: "enabled",
  RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED: "approved",
  RECOUP_EMAIL_SEND_PRINCIPALS: "human:david-credit-lead",
  RESEND_API_KEY: "re_test",
  RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS: "10",
  RESEND_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  RESEND_INBOUND_SIGNING_SECRET: "whsec_dGVzdA==",
  SENDER_EMAIL_ADDRESS: "maya@example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_URL: "https://recoup.supabase.co"
};

const recoupWebhookEndpoint = "https://recoup-self-eta.vercel.app/api/credit/negotiation/inbound";

function readyExternalChecks() {
  return {
    inboundRoute: {
      endpoint: recoupWebhookEndpoint,
      httpStatus: 405,
      lookupStatus: "succeeded" as const,
      status: "ready" as const
    },
    resendWebhooks: [
      {
        endpoint: recoupWebhookEndpoint,
        events: ["email.received"]
      }
    ]
  };
}

describe("credit negotiation live email readiness", () => {
  it("blocks current missing env without exposing secret values", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        RESEND_API_KEY: "re_test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      resendWebhooks: []
    });

    expect(report.status).toBe("blocked");
    expect(report.env.missing).toEqual([
      "CREDIT_NEGOTIATION_FROM_EMAIL",
      "EMAIL_TO_BILLING",
      "EMAIL_TO_RECOVERY",
      "HARBOR_AP_CONTACT_EMAIL",
      "SENDER_EMAIL_ADDRESS",
      "RECOUP_COCKPIT_HUMAN_PRINCIPAL",
      "RECOUP_COCKPIT_AUTH_TOKEN",
      "OPENAI_API_KEY",
      "RECOUP_EMAIL_SEND_PRINCIPALS",
      "RESEND_INBOUND_SIGNING_SECRET",
      "RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS",
      "RESEND_INBOUND_RATE_LIMIT_WINDOW_MS",
      "CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET",
      "CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT",
      "RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED"
    ]);
    expect(report.localQaReset).toEqual({
      enabled: false,
      requiredForLiveEmail: false,
      status: "optional_not_enabled"
    });
    expect(report.catchAllSafety.status).toBe("blocked_pending_owner_confirmation");
    expect(report.nextActions).toEqual([
      {
        action: "Configure missing David live-email environment variables in local/Vercel without printing values.",
        configKeys: [
          "CREDIT_NEGOTIATION_FROM_EMAIL",
          "EMAIL_TO_BILLING",
          "EMAIL_TO_RECOVERY",
          "HARBOR_AP_CONTACT_EMAIL",
          "SENDER_EMAIL_ADDRESS",
          "RECOUP_COCKPIT_HUMAN_PRINCIPAL",
          "RECOUP_COCKPIT_AUTH_TOKEN",
          "OPENAI_API_KEY",
          "RECOUP_EMAIL_SEND_PRINCIPALS",
          "RESEND_INBOUND_SIGNING_SECRET",
          "RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS",
          "RESEND_INBOUND_RATE_LIMIT_WINDOW_MS",
          "CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET",
          "CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT",
          "RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED"
        ],
        noMutation: true,
        owner: "operator"
      },
      {
        action: "Confirm north-bay.dev root catch-all can be dedicated to Resend receiving, then set RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED=approved.",
        configKeys: ["RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED"],
        noMutation: true,
        owner: "owner"
      },
      {
        action: "Register Resend email.received webhook to /api/credit/negotiation/inbound on the deployed Recoup app and store its signing secret.",
        configKeys: ["RESEND_INBOUND_SIGNING_SECRET"],
        noMutation: true,
        owner: "operator"
      },
      {
        action: "Retry the no-mutation Recoup David inbound route readiness lookup.",
        configKeys: ["RECOUP_CREDIT_NEGOTIATION_INBOUND_URL"],
        noMutation: true,
        owner: "operator"
      }
    ]);
    expect(JSON.stringify(report)).not.toContain("re_test");
    expect(JSON.stringify(report)).not.toContain("service-role-key");
  });

  it("includes cockpit auth and live inbound extractor env in the base ready gate", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      ...readyExternalChecks()
    });

    expect(report.env.present).toEqual(
      expect.arrayContaining(["RECOUP_COCKPIT_HUMAN_PRINCIPAL", "RECOUP_COCKPIT_AUTH_TOKEN", "OPENAI_API_KEY"])
    );
    expect(report.env.missing).toEqual([]);
    expect(report.status).toBe("ready_for_live_email_test");
  });

  it("accepts the David demo principal while the global cockpit principal remains Maya", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
        RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret",
        RECOUP_EMAIL_SEND_PRINCIPALS: "human:david-lead"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      ...readyExternalChecks()
    });

    expect(report.status).toBe("ready_for_live_email_test");
    expect(report.env.missing).toEqual([]);
    expect(report.env.invalid).toEqual([]);
  });

  it("blocks readiness when the cockpit auth token is missing", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_COCKPIT_AUTH_TOKEN: undefined,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
        RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret",
        RECOUP_EMAIL_SEND_PRINCIPALS: "human:david-lead"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      ...readyExternalChecks()
    });

    expect(report.status).toBe("blocked");
    expect(report.env.missing).toEqual(["RECOUP_COCKPIT_AUTH_TOKEN"]);
    expect(report.blockers).toEqual(
      expect.arrayContaining(["RECOUP_COCKPIT_AUTH_TOKEN is required before David live email negotiation testing."])
    );
  });

  it("blocks auth readiness without either a David global principal or a David demo session secret", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
        RECOUP_DEMO_SESSION_SECRET: undefined,
        RECOUP_EMAIL_SEND_PRINCIPALS: "human:david-lead"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      ...readyExternalChecks()
    });

    expect(report.status).toBe("blocked");
    expect(report.env.invalid).toContain("RECOUP_COCKPIT_HUMAN_PRINCIPAL");
    expect(report.blockers).toContain("RECOUP_COCKPIT_HUMAN_PRINCIPAL is malformed for David live email negotiation testing.");
  });

  it("blocks auth readiness when the send allowlist omits the David route principal", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
        RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret",
        RECOUP_EMAIL_SEND_PRINCIPALS: "human:maya-lead,human:cfo-lead"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      ...readyExternalChecks()
    });

    expect(report.status).toBe("blocked");
    expect(report.env.invalid).toEqual(["RECOUP_EMAIL_SEND_PRINCIPALS"]);
    expect(report.blockers).toContain("RECOUP_EMAIL_SEND_PRINCIPALS is malformed for David live email negotiation testing.");
  });

  it("blocks readiness when the live inbound extractor OpenAI key is missing", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        OPENAI_API_KEY: undefined
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: recoupWebhookEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(report.status).toBe("blocked");
    expect(report.env.missing).toEqual(expect.arrayContaining(["OPENAI_API_KEY"]));
    expect(report.blockers).toContain("OPENAI_API_KEY is required before David live email negotiation testing.");
  });

  it("blocks malformed non-David cockpit human principals without a David demo session", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: recoupWebhookEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(report.status).toBe("blocked");
    expect(report.env.invalid).toEqual(["RECOUP_COCKPIT_HUMAN_PRINCIPAL"]);
    expect(report.blockers).toContain("RECOUP_COCKPIT_HUMAN_PRINCIPAL is malformed for David live email negotiation testing.");
  });

  it("blocks when Resend email.received is registered to a non-Recoup endpoint", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: recoupWebhookEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: "https://relay-mail-client.vercel.app/api/webhooks/resend",
          events: ["email.received"]
        }
      ]
    });

    expect(report.status).toBe("blocked");
    expect(report.resendWebhook).toMatchObject({
      emailReceivedWebhookPresent: true,
      recoupInboundEndpointPresent: false,
      status: "blocked_wrong_endpoint"
    });
    expect(report.blockers).toContain("Resend email.received webhook is not registered to the Recoup David inbound route.");
    expect(report.nextActions.map((entry) => entry.action)).toContain(
      "Register Resend email.received webhook to /api/credit/negotiation/inbound on the deployed Recoup app and store its signing secret."
    );
  });

  it("blocks a Resend email.received webhook on the same inbound path but wrong host", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: recoupWebhookEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: "https://relay-mail-client.vercel.app/api/credit/negotiation/inbound?source=resend",
          events: ["email.received"]
        }
      ]
    });

    expect(report.status).toBe("blocked");
    expect(report.resendWebhook).toMatchObject({
      emailReceivedWebhookPresent: true,
      recoupInboundEndpointPresent: false,
      status: "blocked_wrong_endpoint"
    });
    expect(report.blockers).toContain("Resend email.received webhook is not registered to the Recoup David inbound route.");
  });

  it("accepts the configured inbound endpoint origin and path instead of only the default path", () => {
    const configuredInboundEndpoint = "https://credit-hooks.north-bay.dev/hooks/david/inbound?ignored=1";
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_CREDIT_NEGOTIATION_INBOUND_URL: configuredInboundEndpoint
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: configuredInboundEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: "https://CREDIT-HOOKS.NORTH-BAY.DEV/hooks/david/inbound?webhook=resend",
          events: ["email.received"]
        }
      ]
    });

    expect(report.resendWebhook).toMatchObject({
      recoupInboundEndpointPresent: true,
      status: "ready"
    });
    expect(report.status).toBe("ready_for_live_email_test");
  });

  it("blocks when the configured Recoup inbound route is not deployed", async () => {
    const routeLookup = await fetchCreditNegotiationInboundRouteForReadiness(
      recoupWebhookEndpoint,
      () => Promise.resolve(new Response("not found", { status: 404 }))
    );
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: routeLookup,
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(routeLookup).toMatchObject({
      httpStatus: 404,
      lookupStatus: "succeeded",
      status: "blocked_missing_route"
    });
    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("Recoup David inbound route is not deployed at the configured public endpoint.");
    expect(report.nextActions.map((entry) => entry.action)).toContain(
      "Deploy or expose the Recoup David inbound route before registering live Resend traffic."
    );
  });

  it("blocks when the configured Recoup inbound route redirects to access protection", async () => {
    const routeLookup = await fetchCreditNegotiationInboundRouteForReadiness(
      recoupWebhookEndpoint,
      () =>
        Promise.resolve(
          new Response("redirect", {
            headers: { location: "https://vercel.com/sso-api?url=protected" },
            status: 302
          })
        )
    );
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: routeLookup,
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(routeLookup).toMatchObject({
      httpStatus: 302,
      lookupStatus: "succeeded",
      status: "blocked_protected_route"
    });
    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("Recoup David inbound route is protected or redirecting; Resend must reach it directly.");
  });

  it.each([401, 403])("blocks when the configured Recoup inbound route returns protected status %i", async (status) => {
    const routeLookup = await fetchCreditNegotiationInboundRouteForReadiness(
      recoupWebhookEndpoint,
      () => Promise.resolve(new Response("protected", { status }))
    );
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: routeLookup,
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(routeLookup).toMatchObject({
      httpStatus: status,
      lookupStatus: "succeeded",
      status: "blocked_protected_route"
    });
    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("Recoup David inbound route is protected or redirecting; Resend must reach it directly.");
  });

  it("blocks lookup readiness for a non-ready non-protected 4xx status", async () => {
    const routeLookup = await fetchCreditNegotiationInboundRouteForReadiness(
      recoupWebhookEndpoint,
      () => Promise.resolve(new Response("bad request", { status: 400 }))
    );

    expect(routeLookup).toMatchObject({
      httpStatus: 400,
      lookupStatus: "succeeded",
      status: "blocked_lookup_failed"
    });
  });

  it("fails closed when the Resend webhook lookup errors without exposing provider details", async () => {
    const failingFetch: typeof fetch = () => Promise.reject(new Error("network failed with re_secret_lookup_key"));
    const lookup = await fetchCreditNegotiationResendWebhooksForReadiness(
      { ...baseReadyEnv, RESEND_API_KEY: "re_secret_lookup_key" },
      failingFetch
    );
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      resendWebhookLookupStatus: lookup.lookupStatus,
      resendWebhooks: lookup.webhooks
    });

    expect(lookup).toEqual({ lookupStatus: "failed", webhooks: [] });
    expect(report.status).toBe("blocked");
    expect(report.resendWebhook.status).toBe("blocked_lookup_failed");
    expect(report.blockers).toContain("Resend webhook lookup failed; rerun readiness check before live email testing.");
    expect(report.nextActions.map((entry) => entry.action)).toContain("Retry the read-only Resend webhook readiness lookup.");
    expect(JSON.stringify(report)).not.toContain("re_secret_lookup_key");
    expect(JSON.stringify(report)).not.toContain("network failed");
  });

  it("blocks malformed live-email env values without exposing those values", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        CREDIT_NEGOTIATION_FROM_EMAIL: "not-an-email",
        CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT: "0",
        EMAIL_TO_BILLING: "billing",
        EMAIL_TO_RECOVERY: "recovery",
        HARBOR_AP_CONTACT_EMAIL: "harbor-ap",
        RECOUP_EMAIL_SEND_PRINCIPALS: "human:maya-lead",
        RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS: "-2",
        RESEND_INBOUND_RATE_LIMIT_WINDOW_MS: "later",
        RESEND_INBOUND_SIGNING_SECRET: "plain-secret",
        SENDER_EMAIL_ADDRESS: "sender"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: recoupWebhookEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(report.status).toBe("blocked");
    expect(report.env.invalid).toEqual([
      "CREDIT_NEGOTIATION_FROM_EMAIL",
      "EMAIL_TO_BILLING",
      "EMAIL_TO_RECOVERY",
      "HARBOR_AP_CONTACT_EMAIL",
      "SENDER_EMAIL_ADDRESS",
      "RECOUP_EMAIL_SEND_PRINCIPALS",
      "RESEND_INBOUND_SIGNING_SECRET",
      "RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS",
      "RESEND_INBOUND_RATE_LIMIT_WINDOW_MS",
      "CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT"
    ]);
    expect(report.blockers).toContain("CREDIT_NEGOTIATION_FROM_EMAIL is malformed for David live email negotiation testing.");
    expect(report.nextActions).toContainEqual({
      action: "Correct malformed David live-email environment variables without printing values.",
      configKeys: [
        "CREDIT_NEGOTIATION_FROM_EMAIL",
        "EMAIL_TO_BILLING",
        "EMAIL_TO_RECOVERY",
        "HARBOR_AP_CONTACT_EMAIL",
        "SENDER_EMAIL_ADDRESS",
        "RECOUP_EMAIL_SEND_PRINCIPALS",
        "RESEND_INBOUND_SIGNING_SECRET",
        "RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS",
        "RESEND_INBOUND_RATE_LIMIT_WINDOW_MS",
        "CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT"
      ],
      noMutation: true,
      owner: "operator"
    });
    expect(JSON.stringify(report)).not.toContain("not-an-email");
    expect(JSON.stringify(report)).not.toContain("plain-secret");
  });

  it("accepts a direct David credit principal with the David credit send allowlist", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: {
        ...baseReadyEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-credit-lead",
        RECOUP_EMAIL_SEND_PRINCIPALS: "human:david-credit-lead,human:maya-lead"
      },
      generatedAt: "2026-07-10T00:00:00.000Z",
      ...readyExternalChecks()
    });

    expect(report.status).toBe("ready_for_live_email_test");
    expect(report.env.invalid).toEqual([]);
  });

  it("is ready only when env, owner catch-all approval, and Recoup inbound webhook are present", () => {
    const report = buildCreditNegotiationLiveEmailReadinessReport({
      env: baseReadyEnv,
      generatedAt: "2026-07-10T00:00:00.000Z",
      inboundRoute: {
        endpoint: recoupWebhookEndpoint,
        httpStatus: 405,
        lookupStatus: "succeeded",
        status: "ready"
      },
      resendWebhooks: [
        {
          endpoint: recoupWebhookEndpoint,
          events: ["email.received"]
        }
      ]
    });

    expect(report).toMatchObject({
      catchAllSafety: { status: "approved" },
      env: { missing: [], status: "ready" },
      localQaReset: { requiredForLiveEmail: false, status: "optional_enabled" },
      noMutation: true,
      nextActions: [],
      resendWebhook: { status: "ready" },
      status: "ready_for_live_email_test"
    });
  });
});
