import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { hashSender } from "../../src/services/remittanceIntake.js";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";

/**
 * Specification 15, security and privacy acceptance.
 *
 * Logs, traces, test artifacts and screenshots may carry identifiers and safe
 * metadata only. No provider secret, auth header, .env value, raw customer free
 * text, attachment content or model reasoning may appear.
 */

function cashSourceFiles(): { path: string; source: string }[] {
  // Scoped to the cash slice. Pre-existing modules such as cockpitApi.ts have
  // their own logging conventions and are not in this session's diff.
  const roots = [
    "src/core/cashApplication",
    "src/services/attachmentSecurity.ts",
    "src/services/cashApplicationPipeline.ts",
    "src/services/cashApplicationRun.ts",
    "src/services/liveCaseReadModel.ts",
    "src/services/remittanceIntake.ts",
    "src/services/remittanceMapper.ts",
    "src/services/workflowOutbox.ts",
    "src/services/workflowRepository.ts",
    "src/services/workflowWorker.ts",
    "src/agents/cashApplication.ts",
    "src/adapters/cashReceipt.ts",
    "src/adapters/rehearsalCashReceipt.ts",
    "cockpit/components/agent-operations"
  ];

  const files: { path: string; source: string }[] = [];

  function walk(path: string): void {
    if (!statSync(path).isDirectory()) {
      // Non-source files such as .gitkeep are not part of the review surface.
      if (path.endsWith(".ts") || path.endsWith(".tsx")) {
        files.push({ path, source: readFileSync(path, "utf8") });
      }
      return;
    }

    for (const entry of readdirSync(path, { withFileTypes: true })) {
      walk(join(path, entry.name).replace(/\\/gu, "/"));
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return files;
}

const files = cashSourceFiles();

describe("no secret material is embedded or logged", () => {
  it.each(files.map((file) => file.path))("carries no hardcoded credential in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";

    expect(source).not.toMatch(/SERVICE_ROLE_KEY\s*=\s*["'][^"']+["']/u);
    expect(source).not.toMatch(/Authorization:\s*["']Bearer\s+[A-Za-z0-9]/u);
    expect(source).not.toMatch(/sk-[A-Za-z0-9]{16,}/u);
    expect(source).not.toMatch(/CLIENT_SECRET\s*=\s*["'][^"']+["']/u);
  });

  it.each(files.map((file) => file.path))("logs nothing from %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

    // The cash slice returns values; it does not print them. A console call is
    // the easiest way for a secret or a customer note to reach a log.
    expect(code).not.toMatch(/console\.(log|info|warn|error|debug)/u);
  });
});

describe("customer free text does not reach durable evidence", () => {
  it("keeps the sanitized note out of the event log", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: {
        remittanceId: "REM-1",
        inboundMessageId: "MSG-1",
        customerReference: "CUST-001",
        legalEntityReference: "LE-001",
        paymentReference: "PAY-1001",
        currency: "USD",
        instructedPaymentAmount: "1250.00",
        mapperVersion: "csv-v1",
        lines: [
          {
            lineId: "LINE-1",
            invoiceReference: "INV-1",
            instructedAmount: "1000.00",
            claimedDeductionAmount: "250.00",
            claimedReasonCode: "DMG",
            claimedReasonTextSanitized: "SECRET-CUSTOMER-PROSE",
            sourceRecordIds: ["REM-SRC-1"]
          }
        ],
        sourceRecordIds: ["REM-SRC-1"],
        provenanceMode: "replay"
      },
      invoices: [
        { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
      ],
      env: {
        RECOUP_CASH_REHEARSAL_ENABLED: "true",
        RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
      },
      repository
    });

    const events = await repository.listEvents(outcome.runId);
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(event.safeSummary).not.toContain("SECRET-CUSTOMER-PROSE");
    }
  });

  it("bounds every safe summary", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: {
        remittanceId: "REM-1",
        inboundMessageId: "MSG-1",
        customerReference: "CUST-001",
        legalEntityReference: "LE-001",
        paymentReference: "PAY-1001",
        currency: "USD",
        instructedPaymentAmount: "1250.00",
        mapperVersion: "csv-v1",
        lines: [
          {
            lineId: "LINE-1",
            invoiceReference: "INV-1",
            instructedAmount: "1000.00",
            claimedDeductionAmount: "250.00",
            claimedReasonCode: "DMG",
            sourceRecordIds: ["REM-SRC-1"]
          }
        ],
        sourceRecordIds: ["REM-SRC-1"],
        provenanceMode: "replay"
      },
      invoices: [
        { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
      ],
      env: {
        RECOUP_CASH_REHEARSAL_ENABLED: "true",
        RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
      },
      repository
    });

    for (const event of await repository.listEvents(outcome.runId)) {
      expect(event.safeSummary.length).toBeLessThanOrEqual(1000);
    }
  });
});

describe("sender addresses are minimised", () => {
  it("hashes rather than storing a raw address", () => {
    const hashed = hashSender("Accounts.Payable@BigCustomer.example");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashed).not.toMatch(/bigcustomer/iu);
  });

  it("stores no raw sender column in the schema", () => {
    const schema = readFileSync("docs/supabase-cash-application-schema.sql", "utf8");
    expect(schema).toContain("sender_hash");
    expect(schema).not.toMatch(/^\s*sender\s+text/mu);
  });
});

describe("attachment bytes never reach a model", () => {
  it("returns typed status and hashes, never raw bytes, from the scanner port", () => {
    const source = readFileSync("src/services/attachmentSecurity.ts", "utf8");
    const interfaceBlock = source.slice(
      source.indexOf("export interface AttachmentInspectionResult"),
      source.indexOf("export interface AttachmentSecurityService")
    );

    expect(interfaceBlock).toContain("contentHash");
    expect(interfaceBlock).not.toMatch(/bytes|buffer|Buffer|content:/u);
  });

  it("gives the agent no access to an attachment at all", () => {
    const agent = readFileSync("src/agents/cashApplication.ts", "utf8");
    expect(agent).not.toMatch(/attachment|Attachment/u);
  });
});

describe("no chain-of-thought or model reasoning is persisted", () => {
  it("keeps reasoning out of the narration contract", () => {
    const agent = readFileSync("src/agents/cashApplication.ts", "utf8");
    const code = agent.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
    expect(code).not.toMatch(/chainOfThought|reasoningTrace|rawReasoning/u);
  });
});
