import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";

export const recoupCorrelationIdHeader = "x-recoup-correlation-id";

interface CorrelatedRequest extends Request {
  recoupCorrelationId?: string;
}

export function createCorrelationIdMiddleware(): RequestHandler {
  return (request, response, next) => {
    const correlationId = readSafeCorrelationId(request.header(recoupCorrelationIdHeader)) ?? randomUUID();
    (request as CorrelatedRequest).recoupCorrelationId = correlationId;
    response.setHeader(recoupCorrelationIdHeader, correlationId);
    next();
  };
}

export function readRequestCorrelationId(request: Request): string | undefined {
  return (request as CorrelatedRequest).recoupCorrelationId;
}

function readSafeCorrelationId(value: string | undefined): string | undefined {
  if (value === undefined || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    return undefined;
  }

  return value;
}
