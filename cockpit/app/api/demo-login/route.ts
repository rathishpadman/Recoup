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
  const credentials = await readLoginRequest(request);
  if (credentials === undefined) {
    return Response.json({ error: "Login ID and password are required." }, { headers: noStoreHeaders(), status: 400 });
  }

  if (!isKnownDemoLoginId(credentials.loginId)) {
    return Response.json({ error: "Invalid demo credentials." }, { headers: noStoreHeaders(), status: 401 });
  }

  const runtimeEnv = loadDemoRuntimeEnv();
  const supabaseUrl = runtimeEnv.SUPABASE_URL;
  const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return Response.json({ error: "Demo login is not configured." }, { headers: noStoreHeaders(), status: 503 });
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
      return Response.json({ error: "Demo login verification failed." }, { headers: noStoreHeaders(), status: 502 });
    }

    const rawResult = (await upstream.json()) as unknown;
    const session = demoSessionFromSupabaseRecord(Array.isArray(rawResult) ? rawResult[0] : rawResult);
    if (session === undefined) {
      return Response.json({ error: "Invalid demo credentials." }, { headers: noStoreHeaders(), status: 401 });
    }

    const response = NextResponse.json(
      {
        defaultRoute: session.defaultRoute,
        displayName: session.displayName,
        role: session.role
      },
      { headers: noStoreHeaders() }
    );
    const cookie = createDemoSessionCookie(session, runtimeEnv);
    response.cookies.set(cookie.name, cookie.value, cookie.options);

    return response;
  } catch {
    return Response.json({ error: "Demo login service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

async function readLoginRequest(request: Request): Promise<DemoLoginRequest | undefined> {
  try {
    const body = (await request.json()) as unknown;
    if (!isLoginRequest(body)) {
      return undefined;
    }

    return {
      loginId: body.loginId.trim(),
      password: body.password
    };
  } catch {
    return undefined;
  }
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
