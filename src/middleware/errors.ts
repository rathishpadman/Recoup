import type { ErrorRequestHandler } from "express";

export interface JsonBodyErrorRoute {
  message: string;
  method: string;
  path: string;
}

export function createJsonBodyErrorHandler(routes: readonly JsonBodyErrorRoute[]): ErrorRequestHandler {
  return (error, request, response, next) => {
    const route = routes.find((candidate) => candidate.method === request.method && candidate.path === request.path);
    if (route !== undefined && isJsonBodyParseError(error)) {
      response.status(400).json({ error: route.message });
      return;
    }

    next(error);
  };
}

export function isJsonBodyParseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "entity.parse.failed"
  );
}
