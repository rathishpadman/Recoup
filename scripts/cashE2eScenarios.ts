/**
 * Cash Application end-to-end scenario fixtures: seed, verify and reset.
 *
 * Every row this script writes carries the `E2E-` prefix in its primary key,
 * and reset deletes strictly by that prefix. That is the whole safety design:
 * a reset can never remove a row this script did not create, so it is safe to
 * run against an environment that also holds real data.
 *
 * Usage:
 *   npx tsx scripts/cashE2eScenarios.ts seed
 *   npx tsx scripts/cashE2eScenarios.ts verify
 *   npx tsx scripts/cashE2eScenarios.ts reset
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

const PREFIX = "E2E-";

export interface CashScenario {
  id: string;
  title: string;
  /** What a tester should see when this scenario is exercised. */
  expected: string;
  paymentReference: string;
  customerReference: string;
  legalEntityReference: string;
  /** Absent means no receipt row exists, which is the AwaitingCashReceipt case. */
  receipt?: {
    amountReceived: string;
    currency: string;
    settlementStatus: "settled" | "pending" | "reversed" | "unknown";
    /** Hours before now. A large value exercises the stale branch. */
    observedHoursAgo: number;
  };
}

/**
 * Ten scenarios, chosen so each one exercises a different branch of the
 * pipeline rather than repeating the happy path with different numbers.
 */
export const CASH_E2E_SCENARIOS: readonly CashScenario[] = [
  {
    id: `${PREFIX}SC-01`,
    title: "Happy path short payment",
    expected: "Run reaches Ready, a live case is created, short payment 250.00 USD",
    paymentReference: `${PREFIX}PAY-01`,
    customerReference: `${PREFIX}CUST-01`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "settled",
      observedHoursAgo: 2
    }
  },
  {
    id: `${PREFIX}SC-02`,
    title: "Full payment, nothing deducted",
    expected: "Run reaches Ready, short payment 0.00, no deduction to investigate",
    paymentReference: `${PREFIX}PAY-02`,
    customerReference: `${PREFIX}CUST-02`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "settled",
      observedHoursAgo: 3
    }
  },
  {
    id: `${PREFIX}SC-03`,
    title: "Duplicate delivery of the same remittance",
    expected: "Second run reuses the same run id and case id; exactly one case exists",
    paymentReference: `${PREFIX}PAY-03`,
    customerReference: `${PREFIX}CUST-03`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "settled",
      observedHoursAgo: 1
    }
  },
  {
    id: `${PREFIX}SC-04`,
    title: "No receipt has arrived yet",
    expected: "Run halts at AwaitingCashReceipt, no case created, one resume scheduled",
    paymentReference: `${PREFIX}PAY-04`,
    customerReference: `${PREFIX}CUST-04`,
    legalEntityReference: "LE-001"
    // Deliberately no receipt row.
  },
  {
    id: `${PREFIX}SC-05`,
    title: "Receipt exists but is not settled",
    expected: "Lookup reports pending, run does not allocate, no case created",
    paymentReference: `${PREFIX}PAY-05`,
    customerReference: `${PREFIX}CUST-05`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "pending",
      observedHoursAgo: 1
    }
  },
  {
    id: `${PREFIX}SC-06`,
    title: "Settled receipt older than the freshness window",
    expected: "Lookup reports stale despite the row claiming fresh; no allocation",
    paymentReference: `${PREFIX}PAY-06`,
    customerReference: `${PREFIX}CUST-06`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "settled",
      observedHoursAgo: 24 * 60
    }
  },
  {
    id: `${PREFIX}SC-07`,
    title: "Reversed receipt",
    expected: "Lookup reports pending rather than settled; no allocation",
    paymentReference: `${PREFIX}PAY-07`,
    customerReference: `${PREFIX}CUST-07`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "reversed",
      observedHoursAgo: 2
    }
  },
  {
    id: `${PREFIX}SC-08`,
    title: "Cross-currency receipt",
    expected: "Contract gap: no approved FX policy, amount is never converted",
    paymentReference: `${PREFIX}PAY-08`,
    customerReference: `${PREFIX}CUST-08`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1150.00",
      currency: "EUR",
      settlementStatus: "settled",
      observedHoursAgo: 2
    }
  },
  {
    id: `${PREFIX}SC-09`,
    title: "Unmapped claimed reason code",
    expected: "Run halts at ReasonReview, allocation exists, no case created",
    paymentReference: `${PREFIX}PAY-09`,
    customerReference: `${PREFIX}CUST-09`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "1250.00",
      currency: "USD",
      settlementStatus: "settled",
      observedHoursAgo: 2
    }
  },
  {
    id: `${PREFIX}SC-10`,
    title: "Large multi-line remittance",
    expected: "Allocation covers every line; reconciliation balanced",
    paymentReference: `${PREFIX}PAY-10`,
    customerReference: `${PREFIX}CUST-10`,
    legalEntityReference: "LE-001",
    receipt: {
      amountReceived: "8400.50",
      currency: "USD",
      settlementStatus: "settled",
      observedHoursAgo: 4
    }
  }
];

/** Every table this script may touch, in delete order (children first). */
export const RESETTABLE_TABLES = [
  "recoup_workflow_events",
  "recoup_workflow_outbox",
  "recoup_agent_run_state",
  "recoup_live_deduction_cases",
  "recoup_cash_allocation_lines",
  "recoup_cash_allocations",
  "recoup_cash_remittance_lines",
  "recoup_cash_remittances",
  "recoup_cash_receipts",
  "recoup_cash_attachments",
  "recoup_cash_inbox",
  "recoup_workflow_runs"
] as const;

export function seedStatements(): string[] {
  return CASH_E2E_SCENARIOS.filter(
    (scenario): scenario is CashScenario & { receipt: NonNullable<CashScenario["receipt"]> } =>
      scenario.receipt !== undefined
  ).map((scenario) => {
    const { receipt } = scenario;
    return `insert into public.recoup_cash_receipts (
  receipt_id, source_system, source_record_id, payment_reference, customer_reference,
  legal_entity_reference, amount_received, currency, settlement_status, value_date,
  observed_at, retrieved_at, freshness_policy_version, freshness_status,
  source_payload_hash, record_ids
) values (
  '${scenario.id}-RECEIPT', 'rehearsal-proxy', '${scenario.id}-SRC',
  '${scenario.paymentReference}', '${scenario.customerReference}',
  '${scenario.legalEntityReference}', ${receipt.amountReceived}, '${receipt.currency}',
  '${receipt.settlementStatus}', current_date - 2,
  now() - interval '${String(receipt.observedHoursAgo)} hours', now(),
  'rehearsal-freshness-v1', 'fresh', 'e2e-seed-no-payload',
  '["${scenario.id}-SRC"]'::jsonb
) on conflict (receipt_id) do nothing;`;
  });
}

/**
 * Reset deletes strictly by the E2E- prefix. Nothing here can remove a row the
 * seed did not create, which is what makes this safe to run repeatedly against
 * an environment that also holds real data.
 */
export function resetStatements(): string[] {
  return RESETTABLE_TABLES.map((table) => {
    const idColumn = {
      recoup_workflow_events: "event_id",
      recoup_workflow_outbox: "command_id",
      recoup_agent_run_state: "run_id",
      recoup_live_deduction_cases: "case_id",
      recoup_cash_allocation_lines: "allocation_line_id",
      recoup_cash_allocations: "allocation_id",
      recoup_cash_remittance_lines: "line_id",
      recoup_cash_remittances: "remittance_id",
      recoup_cash_receipts: "receipt_id",
      recoup_cash_attachments: "attachment_id",
      recoup_cash_inbox: "inbox_id",
      recoup_workflow_runs: "run_id"
    }[table];

    return `delete from public.${table} where ${idColumn} like '${PREFIX}%';`;
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    console.error(`${name} is required.`);
    process.exit(2);
  }

  return value;
}

async function runSql(statements: string[]): Promise<void> {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // PostgREST has no arbitrary-SQL endpoint, so this path expects a
  // `exec_sql` RPC. Where one is not provisioned, run the printed SQL through
  // the Supabase SQL editor instead; the statements are identical either way.
  const response = await fetch(`${url.replace(/\/$/u, "")}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: statements.join("\n") })
  });

  if (!response.ok) {
    console.error(`SQL execution failed: ${String(response.status)}`);
    console.error("Run the statements printed above through the Supabase SQL editor instead.");
    process.exitCode = 1;
  }
}

const command = process.argv[2] ?? "help";

if (command === "seed") {
  const statements = seedStatements();
  console.log(statements.join("\n\n"));
  await runSql(statements);
} else if (command === "reset") {
  const statements = resetStatements();
  console.log(statements.join("\n"));
  await runSql(statements);
} else if (command === "verify") {
  for (const scenario of CASH_E2E_SCENARIOS) {
    console.log(`${scenario.id}  ${scenario.title}`);
    console.log(`         expect: ${scenario.expected}`);
  }
} else {
  console.log("usage: npx tsx scripts/cashE2eScenarios.ts <seed|verify|reset>");
}
