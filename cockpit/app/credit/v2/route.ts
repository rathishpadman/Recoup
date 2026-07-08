import { NextResponse } from "next/server.js";

export function GET(request: Request): Response {
  return NextResponse.redirect(new URL("/credit", request.url), { status: 308 });
}
