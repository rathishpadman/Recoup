import { z } from "zod";
import type { RuntimeEnv } from "../../config/env.js";
import {
  CustomerSchema,
  DeductionLineSchema,
  SyntheticDatasetSchema,
  type SyntheticDatasetCore
} from "../types/entities.js";
import { money } from "../types/money.js";
import type { SupabaseSyntheticSourceFetch } from "./supabaseSyntheticSource.js";

export interface LegacySupabaseSettlementRunReader {
  loadSettlementRun(): Promise<SyntheticDatasetCore>;
}

export interface LegacySupabaseSettlementRunReaderOptions {
  fetcher?: SupabaseSyntheticSourceFetch;
  seed: 42;
  serviceRoleKey: string;
  url: string;
}

const jsonArraySchema = z.preprocess(parseJsonCell, z.array(z.string().min(1)));
const jsonObjectSchema = z.preprocess(parseJsonCell, z.record(z.unknown()));

const legacySettlementCustomerRowSchema = z.object({
  customer_id: z.string().min(1),
  name: z.string().min(1),
  profile: z.string().min(1)
});

// rollback only: reads the pre-reconciliation settlement table while production is pinned to RECOUP_RECONCILIATION_MODE=legacy.
const legacySettlementDeductionLineRowSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  customer_id: z.string().min(1),
  event_id: z.string().regex(/^[a-f0-9]{64}$/u),
  line_id: z.string().min(1),
  period: z.string().min(1),
  record_ids_json: jsonArraySchema,
  routing: z.enum(["billing", "recovery"]),
  rule_id: z.string().min(1),
  rule_input_json: jsonObjectSchema,
  scenario_id: z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]),
  scenario_type: z.string().min(1),
  verdict: z.enum(["valid", "invalid", "partial"])
});

export function createLegacySupabaseSettlementRunReader(
  options: LegacySupabaseSettlementRunReaderOptions
): LegacySupabaseSettlementRunReader {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async loadSettlementRun() {
      const [customerRows, lineRows] = await Promise.all([
        requestSupabaseRows(fetcher, {
          baseUrl,
          orderBy: "customer_id.asc",
          serviceRoleKey: options.serviceRoleKey,
          tableName: "recoup_customers"
        }),
        requestSupabaseRows(fetcher, {
          baseUrl,
          orderBy: "line_id.asc",
          serviceRoleKey: options.serviceRoleKey,
          tableName: "recoup_deduction_lines"
        })
      ]);
      if (customerRows.length === 0 || lineRows.length === 0) {
        throw new Error("Supabase legacy settlement source rows are incomplete.");
      }

      const customers = customerRows.map((row) => {
        const customerRow = legacySettlementCustomerRowSchema.parse(row);
        return CustomerSchema.parse({
          customerId: customerRow.customer_id,
          name: customerRow.name,
          profile: customerRow.profile
        });
      });
      const customerIds = new Set(customers.map((customer) => customer.customerId));
      const deductionLines = lineRows.map((row) => {
        const lineRow = legacySettlementDeductionLineRowSchema.parse(row);
        if (!customerIds.has(lineRow.customer_id)) {
          throw new Error(`Supabase legacy settlement line references an unknown customer: ${lineRow.customer_id}.`);
        }

        return DeductionLineSchema.parse({
          amount: money(String(lineRow.amount)),
          customerId: lineRow.customer_id,
          eventId: lineRow.event_id,
          lineId: lineRow.line_id,
          period: lineRow.period,
          recordIds: lineRow.record_ids_json,
          routing: lineRow.routing,
          ruleId: lineRow.rule_id,
          ruleInput: lineRow.rule_input_json,
          scenarioId: lineRow.scenario_id,
          scenarioType: lineRow.scenario_type,
          verdict: lineRow.verdict
        });
      });

      return SyntheticDatasetSchema.parse({
        customers,
        deductionLines,
        seed: options.seed
      });
    }
  };
}

export function createLegacySupabaseSettlementRunReaderFromEnv(
  env: Partial<Pick<RuntimeEnv, "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL">>,
  seed: 42,
  fetcher?: SupabaseSyntheticSourceFetch
): LegacySupabaseSettlementRunReader | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createLegacySupabaseSettlementRunReader({
    ...(fetcher === undefined ? {} : { fetcher }),
    seed,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

function requestSupabaseRows(
  fetcher: SupabaseSyntheticSourceFetch,
  options: {
    baseUrl: string;
    orderBy: string;
    serviceRoleKey: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const endpoint = new URL(`${options.baseUrl}/rest/v1/${options.tableName}`);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("order", options.orderBy);

  return fetcher(endpoint.toString(), {
    headers: {
      accept: "application/json",
      apikey: options.serviceRoleKey,
      authorization: `Bearer ${options.serviceRoleKey}`
    },
    method: "GET"
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Supabase legacy settlement source read failed with HTTP ${String(response.status)}.`);
    }

    return z.array(z.unknown()).parse(await response.json());
  });
}

function parseJsonCell(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return JSON.parse(value) as unknown;
}
