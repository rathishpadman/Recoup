import { NextResponse } from "next/server.js";
import { clearDemoSessionCookie } from "../../demo-auth.ts";
import { loadDemoRuntimeEnv } from "../../demo-runtime-env.ts";

export function POST(): Response {
  const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  const cookie = clearDemoSessionCookie(loadDemoRuntimeEnv());
  response.cookies.set(cookie.name, cookie.value, cookie.options);

  return response;
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
