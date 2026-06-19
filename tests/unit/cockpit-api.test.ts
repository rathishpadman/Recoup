import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createCockpitApi } from "../../src/services/cockpitApi.js";

async function listen(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(createCockpitApi());
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    server
  };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("S5 cockpit API", () => {
  it("serves the Forensics read model and approval decisions through REST", async () => {
    const { baseUrl, server } = await listen();
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        selected: { draft: { actionId: string } };
        surface: string;
      };

      expect(modelResponse.status).toBe(200);
      expect(model.surface).toBe("forensics-analyst");

      const approvalResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: model.selected.draft.actionId,
          approverId: "human:maya-lead",
          decision: "approve"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const approval = (await approvalResponse.json()) as {
        actionId: string;
        auditEntryHash: string;
        decision: string;
        status: string;
      };

      expect(approvalResponse.status).toBe(200);
      expect(approvalResponse.headers.get("access-control-allow-origin")).toBe("*");
      expect(approval.actionId).toBe(model.selected.draft.actionId);
      expect(approval.decision).toBe("approve");
      expect(approval.status).toBe("human_decided");
      expect(approval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await close(server);
    }
  });

  it("rejects non-human approval identities at the API boundary", async () => {
    const { baseUrl, server } = await listen();
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        selected: { draft: { actionId: string } };
      };

      const approvalResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: model.selected.draft.actionId,
          approverId: "system:auto",
          decision: "approve"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      expect(approvalResponse.status).toBe(400);
    } finally {
      await close(server);
    }
  });

  it("streams run progress as SSE envelopes", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/run`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(body).toContain("event: finding");
      expect(body).toContain("event: verdict");
      expect(body).not.toContain("deductionValidityAccuracy");
      expect(body.split("\n\n").every((chunk) => chunk === "" || chunk.includes("data: {"))).toBe(true);
    } finally {
      await close(server);
    }
  });
});
