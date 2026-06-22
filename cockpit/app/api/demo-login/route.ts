import { NextResponse } from "next/server.js";
import {
  createDemoSessionCookie,
  demoSessionFromSupabaseRecord,
  isKnownDemoLoginId
} from "../../demo-auth.ts";
import { loadDemoRuntimeEnv } from "../../demo-runtime-env.ts";

interface DemoLoginRequest {
  loginId: string;
  password: string;
}

export async function POST(request: Request): Promise<Response> {
  const wantsJson = isJsonRequest(request);
  const credentials = await readLoginRequest(request);
  if (credentials === undefined) {
    return loginErrorResponse(request, wantsJson, "Login ID and password are required.", 400);
  }

  if (!isKnownDemoLoginId(credentials.loginId)) {
    return loginErrorResponse(request, wantsJson, "Invalid demo credentials.", 401);
  }

  const runtimeEnv = loadDemoRuntimeEnv();
  const supabaseUrl = runtimeEnv.SUPABASE_URL;
  const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return loginErrorResponse(request, wantsJson, "Demo login is not configured.", 503);
  }

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/u, "")}/rest/v1/rpc/verify_recoup_demo_login`, {
      body: JSON.stringify({
        p_login_id: credentials.loginId,
        p_password: credentials.password
      }),
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "content-type": "application/json"
      },
      method: "POST"
    });

    if (!upstream.ok) {
      return loginErrorResponse(request, wantsJson, "Demo login verification failed.", 502);
    }

    const rawResult = (await upstream.json()) as unknown;
    const session = demoSessionFromSupabaseRecord(Array.isArray(rawResult) ? rawResult[0] : rawResult);
    if (session === undefined) {
      return loginErrorResponse(request, wantsJson, "Invalid demo credentials.", 401);
    }

    const response = wantsJson
      ? NextResponse.json(
          {
            defaultRoute: session.defaultRoute,
            displayName: session.displayName,
            role: session.role
          },
          { headers: noStoreHeaders() }
        )
      : NextResponse.redirect(new URL(session.defaultRoute, request.url), { headers: noStoreHeaders(), status: 303 });
    const cookie = createDemoSessionCookie(session, runtimeEnv);
    response.cookies.set(cookie.name, cookie.value, cookie.options);

    return response;
  } catch {
    return loginErrorResponse(request, wantsJson, "Demo login service unavailable.", 502);
  }
}

async function readLoginRequest(request: Request): Promise<DemoLoginRequest | undefined> {
  try {
    if (!isJsonRequest(request)) {
      const formData = await request.formData();
      const loginId = formData.get("loginId");
      const password = formData.get("password");
      if (typeof loginId !== "string" || typeof password !== "string") {
        return undefined;
      }

      return normalizeLoginRequest({ loginId, password });
    }

    const body = (await request.json()) as unknown;
    if (!isLoginRequest(body)) {
      return undefined;
    }

    return normalizeLoginRequest(body);
  } catch {
    return undefined;
  }
}

function normalizeLoginRequest(body: DemoLoginRequest): DemoLoginRequest | undefined {
  const loginId = body.loginId.trim();
  if (loginId.length === 0 || body.password.length === 0) {
    return undefined;
  }

  return {
    loginId,
    password: body.password
  };
}

function isLoginRequest(value: unknown): value is DemoLoginRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "loginId" in value &&
    "password" in value &&
    typeof value.loginId === "string" &&
    value.loginId.trim().length > 0 &&
    typeof value.password === "string" &&
    value.password.length > 0
  );
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function loginErrorResponse(request: Request, wantsJson: boolean, error: string, status: number): Response {
  if (wantsJson) {
    return Response.json({ error }, { headers: noStoreHeaders(), status });
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("error", "demo-login");

  return NextResponse.redirect(url, { headers: noStoreHeaders(), status: 303 });
}
