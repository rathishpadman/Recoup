import { pathToFileURL } from "node:url";
import express, { type Express } from "express";
import { z } from "zod";
import { runForensicsInvestigation } from "../agents/forensics.js";
import { createAuditTrail } from "../audit/trail.js";
import { decideApproval } from "./approvals.js";
import { buildForensicsCockpitModel, buildForensicsSseEvents } from "./cockpitModel.js";

const approvalRequestSchema = z.object({
  actionId: z.string().min(1),
  approverId: z.string().startsWith("human:"),
  decision: z.enum(["approve", "modify", "reject"])
});
const approvalAuditTrail = createAuditTrail();

export function createCockpitApi(): Express {
  const app = express();
  app.use((request, response, next) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  });
  app.use(express.json());

  app.get("/forensics", (_request, response) => {
    response.json(buildForensicsCockpitModel());
  });

  app.get("/run", (request, response) => {
    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();

    const events = buildForensicsSseEvents();
    let index = 0;
    const interval = setInterval(() => {
      const event = events[index];
      if (event === undefined) {
        clearInterval(interval);
        response.end();
        return;
      }

      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
      index += 1;
    }, 5);

    request.on("close", () => {
      clearInterval(interval);
    });
  });

  app.post("/approval", (request, response) => {
    const parsed = approvalRequestSchema.safeParse(request.body as unknown);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid approval request." });
      return;
    }

    const action = runForensicsInvestigation().actions.find((candidate) => candidate.actionId === parsed.data.actionId);
    if (action === undefined) {
      response.status(404).json({ error: "Action not found." });
      return;
    }

    try {
      const approval = decideApproval(action, {
        approverId: parsed.data.approverId,
        decision: parsed.data.decision
      });
      const auditEntry = approvalAuditTrail.append({
        entryType: "approval.decision",
        payload: {
          actionId: approval.actionId,
          approverId: approval.approverId,
          decision: approval.decision,
          status: approval.status
        },
        recordIds: [approval.actionId, action.lineId, ...action.recordIds]
      });
      response.json({
        actionId: approval.actionId,
        auditEntryHash: auditEntry.entryHash,
        decision: approval.decision,
        status: approval.status
      });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Approval rejected." });
    }
  });

  return app;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4317);
  const server = createCockpitApi().listen(port, () => {
    console.log(`Recoup cockpit API listening on http://127.0.0.1:${String(port)}`);
  });

  process.once("SIGTERM", () => {
    server.close();
  });
}
