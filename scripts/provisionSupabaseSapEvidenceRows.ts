import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";
import { createSupabaseSettlementRunReader } from "../src/adapters/supabaseSyntheticSource.js";
import {
  createSapODataConnectionFromEnv,
  parseSapODataMetadata,
  SapODataReadOnlyAdapter,
  SapODataReadOnlyClient
} from "../src/adapters/sapOData.js";
import {
  assertCompleteSapSupabaseEvidenceProvisioning,
  buildSapSupabaseEvidenceRows,
  type SapSupabaseEvidenceRow,
  type SapSupabaseEvidenceSourceLink
} from "../src/services/sapSupabaseEvidenceProvisioner.js";
import type { DeductionLine } from "../src/types/entities.js";

interface ReleaseIntentLabel {
  modelCustomerId: string;
  sapCustomerId: string;
}

interface ScenarioInvoiceRef {
  invoiceRef: string;
  sapCustomerId: string;
}

const billingMetadataServiceName = "ZUI_BILLINGDOCUMENTFS_0001";
const defaultSqlOutput = "output/recoup-src-sap-upsert.sql";

async function main(): Promise<void> {
  const env = loadLocalRuntimeEnvFiles();
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const connection = createSapODataConnectionFromEnv(env);
  if (connection === undefined) {
    throw new Error("SAP OData read-only credentials are required.");
  }

  const sqlOutput = readArgValue("--sql-output") ?? defaultSqlOutput;
  const settlementRun = await createSupabaseSettlementRunReader({
    seed: 42,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  }).loadSettlementRun();
  const customerMap = await loadSupabaseIntentCustomerMap(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const scenarioInvoices = parseScenarioInvoiceRefs(readFileSync("docs/Tools_data/CODEX_CONFIG.md", "utf8"));
  const sourceLinks = buildSourceLinks(settlementRun.deductionLines, customerMap, scenarioInvoices);

  const client = new SapODataReadOnlyClient(connection);
  const metadataXml = await client.fetchMetadata(billingMetadataServiceName);
  const result = await buildSapSupabaseEvidenceRows({
    adapter: new SapODataReadOnlyAdapter(connection),
    client,
    lines: settlementRun.deductionLines,
    metadata: { [billingMetadataServiceName]: parseSapODataMetadata(metadataXml) },
    retrievedAt: new Date(),
    sourceLinks
  });

  if (result.rows.length === 0) {
    throw new Error("SAP OData provisioning produced zero recoup_src_sap rows.");
  }
  assertCompleteSapSupabaseEvidenceProvisioning({ ...result, lines: settlementRun.deductionLines });

  mkdirSync(dirname(sqlOutput), { recursive: true });
  writeFileSync(sqlOutput, buildRecoupSrcSapUpsertSql(result.rows), "utf8");

  const rowsByScenario = result.rows.reduce<Record<string, number>>((acc, row) => {
    const scenarioId = row.linked_record_ids.find((recordId) => /^TOOLS-DATA:S\d+$/u.test(recordId)) ?? "unknown";
    acc[scenarioId] = (acc[scenarioId] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        diagnostics: result.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          invoiceRef: diagnostic.invoiceRef,
          lineId: diagnostic.lineId
        })),
        linkCount: sourceLinks.length,
        rowCount: result.rows.length,
        rowsByScenario,
        sqlOutput
      },
      null,
      2
    )
  );
}

async function loadSupabaseIntentCustomerMap(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<Map<string, string>> {
  const rows = await readSupabaseRows<{ value_json?: { labels?: ReleaseIntentLabel[] } }>(
    supabaseUrl,
    serviceRoleKey,
    "recoup_config",
    "?key=eq.intent_eval_labels&active=eq.true&select=value_json&limit=1"
  );
  const labels = rows[0]?.value_json?.labels ?? [];

  return new Map(labels.map((label) => [label.modelCustomerId, label.sapCustomerId]));
}

async function readSupabaseRows<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  tableName: string,
  queryString: string
): Promise<T[]> {
  const response = await fetch(`${supabaseUrl.replace(/\/$/u, "")}/rest/v1/${tableName}${queryString}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    },
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`Supabase ${tableName} read failed with status ${response.status.toString()}.`);
  }

  return (await response.json()) as T[];
}

function parseScenarioInvoiceRefs(markdown: string): Map<string, ScenarioInvoiceRef> {
  const refs = new Map<string, ScenarioInvoiceRef>();

  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(/^\| \*\*(S\d+):.*?\| .*?\(`([^`]+)`\) \| `([^`]+)` \|/u);
    if (match === null) {
      continue;
    }

    refs.set(match[1] ?? "", {
      invoiceRef: match[3] ?? "",
      sapCustomerId: match[2] ?? ""
    });
  }

  return refs;
}

function buildSourceLinks(
  lines: readonly DeductionLine[],
  customerMap: ReadonlyMap<string, string>,
  scenarioInvoices: ReadonlyMap<string, ScenarioInvoiceRef>
): SapSupabaseEvidenceSourceLink[] {
  return lines.flatMap((line) => {
    const scenarioInvoice = scenarioInvoices.get(line.scenarioId);
    const sapCustomerId = customerMap.get(line.customerId);
    if (scenarioInvoice === undefined || sapCustomerId === undefined || scenarioInvoice.sapCustomerId !== sapCustomerId) {
      return [];
    }

    return [
      {
        customerId: line.customerId,
        invoiceRef: scenarioInvoice.invoiceRef,
        lineId: line.lineId,
        sapCustomerId,
        sourceName: "docs/Tools_data/CODEX_CONFIG.md",
        sourceRecordIds: [`TOOLS-DATA:${line.scenarioId}`, sapCustomerId, `INV-${scenarioInvoice.invoiceRef}`]
      }
    ];
  });
}

function buildRecoupSrcSapUpsertSql(rows: readonly SapSupabaseEvidenceRow[]): string {
  return `INSERT INTO public.recoup_src_sap (
  sap_document_id,
  document_type,
  customer_id,
  service_name,
  entity_set,
  linked_record_ids,
  payload_json,
  summary,
  retrieved_at,
  provenance
) VALUES
${rows.map(rowToValuesSql).join(",\n")}
ON CONFLICT (sap_document_id) DO UPDATE SET
  document_type = EXCLUDED.document_type,
  customer_id = EXCLUDED.customer_id,
  service_name = EXCLUDED.service_name,
  entity_set = EXCLUDED.entity_set,
  linked_record_ids = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements_text(public.recoup_src_sap.linked_record_ids || EXCLUDED.linked_record_ids) AS merged(value)
  ),
  payload_json = EXCLUDED.payload_json,
  summary = EXCLUDED.summary,
  retrieved_at = EXCLUDED.retrieved_at,
  provenance = EXCLUDED.provenance;`;
}

function rowToValuesSql(row: SapSupabaseEvidenceRow): string {
  return `(${[
    sqlString(row.sap_document_id),
    sqlString(row.document_type),
    sqlString(row.customer_id),
    sqlString(row.service_name),
    sqlString(row.entity_set),
    sqlJson(row.linked_record_ids),
    sqlJson(row.payload_json),
    sqlString(row.summary),
    sqlString(row.retrieved_at),
    sqlString(row.provenance)
  ].join(", ")})`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function sqlJson(value: unknown): string {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function readArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

await main();
