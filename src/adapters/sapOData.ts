import type { DeductionLine } from "../types/entities.js";
import type { EvidenceDocument } from "../tools/retrieval/docs.js";
import { loadSapODataReadOnlyConnection, type RuntimeEnv } from "../../config/env.js";
import { Buffer } from "node:buffer";

export interface SapODataConnection {
  authMode?: "basic" | "oauth";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  tenant: string;
  tokenUrl: string;
  userId?: string;
}

export interface SapODataReadRequest {
  method: "GET";
  purpose: "billing-document" | "delivery-item" | "reference-document";
  url: string;
  recordIds: string[];
}

export type SapODataReadiness =
  | {
      configured: false;
      mode: "synthetic-readonly-fallback";
      reason: string;
    }
  | {
      configured: true;
      mode: "sap-odata-readonly";
      baseUrl: string;
      tenant: string;
    };

export type SapODataReadRequestPlan =
  | {
      configured: false;
      requests: [];
      reason: string;
    }
  | {
      configured: true;
      requests: SapODataReadRequest[];
      tenant: string;
    };

export interface SapODataMetadataKey {
  name: string;
  type: string;
}

export interface SapODataMetadata {
  entitySets: Record<string, { entityType: string; keys: SapODataMetadataKey[] }>;
}
export type SapODataMetadataInput = SapODataMetadata | Partial<Record<string, SapODataMetadata>>;

type SapFetch = typeof fetch;
type SapJsonRecord = Record<string, unknown>;
type SapRecordMapping = {
  entitySet: string;
  keyName: string;
  purpose: SapODataReadRequest["purpose"];
  recordPrefix: string;
  serviceName: string;
};

export interface SapODataMetadataCoverageClient {
  fetchMetadata(serviceName: string): Promise<string>;
}

export interface SapODataMetadataCoverageProof {
  mappings: Array<{
    entitySet: string;
    keyName: string;
    purpose: SapODataReadRequest["purpose"];
    ready: boolean;
    serviceName: string;
  }>;
  ready: boolean;
  services: Array<{
    ready: boolean;
    serviceName: string;
  }>;
}

const SAP_RECORD_MAPPINGS: SapRecordMapping[] = [
  {
    entitySet: "A_BillingDocument",
    keyName: "BillingDocument",
    purpose: "billing-document",
    recordPrefix: "INV-",
    serviceName: "API_BILLING_DOCUMENT_SRV"
  },
  {
    entitySet: "A_OutbDeliveryItem",
    keyName: "DeliveryDocument",
    purpose: "delivery-item",
    recordPrefix: "POD-",
    serviceName: "API_OUTBOUND_DELIVERY_SRV"
  },
  {
    entitySet: "A_BillingDocumentItem",
    keyName: "BillingDocument",
    purpose: "reference-document",
    recordPrefix: "CREDIT-",
    serviceName: "API_BILLING_DOCUMENT_SRV"
  },
  {
    entitySet: "A_BillingDocumentItem",
    keyName: "BillingDocument",
    purpose: "reference-document",
    recordPrefix: "DUP-",
    serviceName: "API_BILLING_DOCUMENT_SRV"
  }
];
export const SAP_ODATA_BASIC_ENV_NAMES = [
  "SAP_ODATA_BASE_URL",
  "SAP_ODATA_USERID",
  "SAP_ODATA_CLIENT_SECRET"
] as const;
export const SAP_ODATA_OAUTH_ENV_NAMES = [
  "SAP_ODATA_BASE_URL",
  "SAP_ODATA_CLIENT_ID",
  "SAP_ODATA_CLIENT_SECRET",
  "SAP_ODATA_TOKEN_URL"
] as const;
export const SAP_ODATA_REQUIRED_ENV_NAMES = [
  ...SAP_ODATA_BASIC_ENV_NAMES,
  ...SAP_ODATA_OAUTH_ENV_NAMES,
  "SAP_ODATA_SCOPE",
  "SAP_ODATA_TENANT"
] as const;

export function createSapODataReadOnlyAdapter(env: RuntimeEnv = process.env): SapODataReadOnlyAdapter {
  return new SapODataReadOnlyAdapter(loadSapODataReadOnlyConnection(env));
}

export function createSapODataConnectionFromEnv(env: RuntimeEnv = process.env): SapODataConnection | undefined {
  return loadSapODataReadOnlyConnection(env);
}

export async function validateSapODataMetadataCoverage(
  client: SapODataMetadataCoverageClient
): Promise<SapODataMetadataCoverageProof> {
  const metadataByService = new Map<string, SapODataMetadata>();
  const services = [...new Set(SAP_RECORD_MAPPINGS.map((mapping) => mapping.serviceName))];

  for (const serviceName of services) {
    metadataByService.set(serviceName, parseSapODataMetadata(await client.fetchMetadata(serviceName)));
  }

  const mappings = SAP_RECORD_MAPPINGS.map((mapping) => {
    const metadata = metadataByService.get(mapping.serviceName);
    const entitySet = metadata?.entitySets[mapping.entitySet];
    const ready = entitySet?.keys.some((key) => key.name === mapping.keyName) ?? false;

    return {
      entitySet: mapping.entitySet,
      keyName: mapping.keyName,
      purpose: mapping.purpose,
      ready,
      serviceName: mapping.serviceName
    };
  });

  return {
    mappings,
    ready: mappings.every((mapping) => mapping.ready),
    services: services.map((serviceName) => ({
      ready: mappings.some((mapping) => mapping.serviceName === serviceName && mapping.ready),
      serviceName
    }))
  };
}

export class SapODataReadOnlyAdapter {
  #connection: SapODataConnection | undefined;

  constructor(connection?: SapODataConnection) {
    this.#connection = connection;
  }

  readonly buildMetadataValidatedReadRequestPlan = (
    line: DeductionLine,
    metadata: SapODataMetadata
  ): SapODataReadRequestPlan => {
    return this.#buildMetadataInputReadRequestPlan(line, metadata);
  };

  describeReadiness(): SapODataReadiness {
    if (this.#connection === undefined) {
      return {
        configured: false,
        mode: "synthetic-readonly-fallback",
        reason: "SAP OData credentials are not configured."
      };
    }

    return {
      configured: true,
      mode: "sap-odata-readonly",
      baseUrl: this.#connection.baseUrl,
      tenant: this.#connection.tenant
    };
  }

  buildReadRequestPlan(_line: DeductionLine): SapODataReadRequestPlan {
    void _line;

    if (this.#connection === undefined) {
      return {
        configured: false,
        requests: [],
        reason: "SAP OData credentials are not configured."
      };
    }

    return {
      configured: false,
      reason: "SAP OData metadata is required before building request plans.",
      requests: []
    };
  }

  retrieveBillingDocument(line: DeductionLine): EvidenceDocument[] {
    return line.recordIds
      .filter((recordId) => recordId.startsWith("INV-"))
      .map((recordId) => ({
        documentId: recordId,
        source: "sap",
        documentType: "invoice",
        summary: `Read-only SAP billing document for ${line.lineId}.`,
        recordIds: [line.lineId, recordId]
      }));
  }

  retrieveDeliveryItem(line: DeductionLine): EvidenceDocument[] {
    return line.recordIds
      .filter((recordId) => recordId.startsWith("POD-"))
      .map((recordId) => ({
        documentId: recordId,
        source: "sap",
        documentType: "POD",
        summary: `Read-only SAP delivery/POD proxy for ${line.lineId}.`,
        recordIds: [line.lineId, recordId]
      }));
  }

  retrieveReferenceDocuments(line: DeductionLine): EvidenceDocument[] {
    return line.recordIds
      .filter((recordId) => recordId.startsWith("CREDIT-") || recordId.startsWith("DUP-"))
      .map((recordId) => ({
        documentId: recordId,
        source: "sap",
        documentType: "credit-memo",
        summary: `Read-only SAP reference document for ${line.lineId}.`,
        recordIds: [line.lineId, recordId]
      }));
  }

  retrieveDeductionCase(line: DeductionLine): EvidenceDocument[] {
    return [
      ...this.retrieveBillingDocument(line),
      ...this.retrieveDeliveryItem(line),
      ...this.retrieveReferenceDocuments(line)
    ];
  }

  async retrieveDeductionCaseLive(
    line: DeductionLine,
    metadata: SapODataMetadataInput,
    client?: SapODataReadOnlyClient
  ): Promise<EvidenceDocument[]> {
    const plan = this.#buildMetadataInputReadRequestPlan(line, metadata);
    if (!plan.configured) {
      return [];
    }

    const readClient = client ?? (this.#connection === undefined ? undefined : new SapODataReadOnlyClient(this.#connection));
    if (readClient === undefined) {
      return [];
    }

    return Promise.all(
      plan.requests.map(async (request) => mapSapODataReadResultToEvidence(request, await readClient.fetchReadRequest(request)))
    );
  }

  #buildMetadataInputReadRequestPlan(line: DeductionLine, metadataInput: SapODataMetadataInput): SapODataReadRequestPlan {
    if (this.#connection === undefined) {
      return {
        configured: false,
        requests: [],
        reason: "SAP OData credentials are not configured."
      };
    }

    const requests: SapODataReadRequest[] = [];

    for (const recordId of line.recordIds) {
      const mapping = SAP_RECORD_MAPPINGS.find((candidate) => recordId.startsWith(candidate.recordPrefix));
      if (mapping === undefined) {
        continue;
      }

      const metadata = metadataForMapping(metadataInput, mapping);
      if (metadata === undefined) {
        return {
          configured: false,
          reason: `SAP metadata missing service ${mapping.serviceName}.`,
          requests: []
        };
      }

      const entitySet = metadata.entitySets[mapping.entitySet];
      if (entitySet === undefined) {
        return {
          configured: false,
          reason: `SAP metadata missing mapped entity set ${mapping.entitySet}.`,
          requests: []
        };
      }

      const key = entitySet.keys.find((candidate) => candidate.name === mapping.keyName);
      if (key === undefined) {
        return {
          configured: false,
          reason: `SAP metadata missing key ${mapping.keyName} for mapped entity set ${mapping.entitySet}.`,
          requests: []
        };
      }
      const unsupportedKeys = entitySet.keys.filter((candidate) => candidate.name !== mapping.keyName);
      if (unsupportedKeys.length > 0) {
        return {
          configured: false,
          reason: `SAP metadata key set for mapped entity set ${mapping.entitySet} requires unsupported key ${unsupportedKeys[0]?.name ?? "unknown"}.`,
          requests: []
        };
      }

      requests.push(
        buildRequestFromMetadata(
          this.#connection,
          mapping.purpose,
          `${mapping.serviceName}/${mapping.entitySet}`,
          key,
          recordId,
          line.lineId
        )
      );
    }

    return {
      configured: true,
      requests,
      tenant: this.#connection.tenant
    };
  }

  private buildRequest(purpose: SapODataReadRequest["purpose"], entitySet: string, recordId: string, lineId: string): SapODataReadRequest {
    if (this.#connection === undefined) {
      throw new Error("SAP OData credentials are not configured.");
    }

    return {
      method: "GET",
      purpose,
      url: `${this.#connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${entitySet}('${encodeURIComponent(recordId)}')`,
      recordIds: [lineId, recordId]
    };
  }
}

function buildRequestFromMetadata(
  connection: SapODataConnection,
  purpose: SapODataReadRequest["purpose"],
  entityPath: string,
  key: SapODataMetadataKey,
  recordId: string,
  lineId: string
): SapODataReadRequest {
  return {
    method: "GET",
    purpose,
    url: `${connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${entityPath}(${buildODataKeyPredicate([key], {
      [key.name]: recordId
    })})`,
    recordIds: [lineId, recordId]
  };
}

function metadataForMapping(metadataInput: SapODataMetadataInput, mapping: SapRecordMapping): SapODataMetadata | undefined {
  if (isSapODataMetadata(metadataInput)) {
    return metadataInput;
  }

  return metadataInput[mapping.serviceName];
}

function isSapODataMetadata(metadataInput: SapODataMetadataInput): metadataInput is SapODataMetadata {
  return "entitySets" in metadataInput;
}

export class SapODataReadOnlyClient {
  #accessToken: string | undefined;
  #connection: SapODataConnection;
  #fetcher: SapFetch;

  constructor(
    connection: SapODataConnection,
    fetcher: SapFetch = fetch
  ) {
    this.#connection = connection;
    this.#fetcher = fetcher;
  }

  async fetchMetadata(serviceName: string): Promise<string> {
    const response = await this.#fetcher(this.buildServiceUrl(`${serviceName}/$metadata`), {
      headers: await this.#buildReadHeaders("application/xml"),
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`SAP OData metadata request failed with status ${String(response.status)}.`);
    }

    return response.text();
  }

  async fetchJson(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const response = await this.#fetcher(this.buildServiceUrl(path, params), {
      headers: await this.#buildReadHeaders("application/json"),
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`SAP OData read request failed with status ${String(response.status)}.`);
    }

    return response.json() as Promise<unknown>;
  }

  async fetchReadRequest(request: SapODataReadRequest): Promise<unknown> {
    const response = await this.#fetcher(withJsonFormat(request.url), {
      headers: await this.#buildReadHeaders("application/json"),
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`SAP OData read request failed with status ${String(response.status)}.`);
    }

    return response.json() as Promise<unknown>;
  }

  private buildServiceUrl(path: string, params: Record<string, string> = {}): string {
    const trimmedBase = this.#connection.baseUrl.replace(/\/$/, "");
    const normalizedPath = path.replace(/^\//, "");
    const search = new URLSearchParams(params).toString();
    const url = `${trimmedBase}/sap/opu/odata/sap/${normalizedPath}`;

    return search.length === 0 ? url : `${url}?${search}`;
  }

  async #buildReadHeaders(accept: "application/json" | "application/xml"): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: accept };
    if (this.#connection.authMode === "basic") {
      if (this.#connection.userId === undefined || this.#connection.userId.trim().length === 0) {
        throw new Error("SAP Basic auth requires a configured user id.");
      }

      headers.Authorization = `Basic ${Buffer.from(`${this.#connection.userId}:${this.#connection.clientSecret}`, "utf8").toString("base64")}`;
      return headers;
    }

    const accessToken = await this.#fetchAccessTokenIfConfigured();
    if (accessToken !== undefined) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  async #fetchAccessTokenIfConfigured(): Promise<string | undefined> {
    if (
      this.#connection.clientSecret.trim().length === 0 ||
      this.#connection.clientId.trim().length === 0 ||
      this.#connection.tokenUrl.trim().length === 0
    ) {
      return undefined;
    }

    if (this.#accessToken !== undefined) {
      return this.#accessToken;
    }

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.#connection.clientId,
      client_secret: this.#connection.clientSecret
    });
    if (this.#connection.scope.trim().length > 0) {
      body.set("scope", this.#connection.scope);
    }

    const response = await this.#fetcher(this.#connection.tokenUrl, {
      body,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`SAP OAuth token request failed with status ${String(response.status)}.`);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || typeof payload["access_token"] !== "string" || payload["access_token"].trim().length === 0) {
      throw new Error("SAP OAuth token response did not include an access token.");
    }

    this.#accessToken = payload["access_token"];
    return this.#accessToken;
  }
}

export function mapSapODataReadResultToEvidence(request: SapODataReadRequest, payload: unknown): EvidenceDocument {
  const record = unwrapSapODataRecord(payload);
  const documentId = readSapDocumentId(request, record);

  return {
    documentId,
    source: "sap",
    documentType: documentTypeForSapPurpose(request.purpose),
    summary: `SAP OData ${request.purpose} ${documentId} retrieved through read-only mapping.`,
    recordIds: uniqueRecordIds([...request.recordIds, documentId])
  };
}

function unwrapSapODataRecord(payload: unknown): SapJsonRecord {
  if (!isRecord(payload)) {
    return {};
  }

  const d = payload["d"];
  if (!isRecord(d)) {
    return payload;
  }

  const results = d["results"];
  if (Array.isArray(results) && isRecord(results[0])) {
    return results[0];
  }

  return d;
}

function readSapDocumentId(request: SapODataReadRequest, record: SapJsonRecord): string {
  const fields = fieldsForSapPurpose(request.purpose);
  const value = fields.map((field) => record[field]).find((candidate): candidate is string => typeof candidate === "string");

  return value ?? request.recordIds[1] ?? request.recordIds[0] ?? request.url;
}

function fieldsForSapPurpose(purpose: SapODataReadRequest["purpose"]): string[] {
  if (purpose === "delivery-item") {
    return ["DeliveryDocument", "DeliveryDocumentItem"];
  }

  if (purpose === "reference-document") {
    return ["ReferenceSDDocument", "CreditMemo", "BillingDocument"];
  }

  return ["BillingDocument"];
}

function documentTypeForSapPurpose(purpose: SapODataReadRequest["purpose"]): EvidenceDocument["documentType"] {
  if (purpose === "delivery-item") {
    return "POD";
  }

  if (purpose === "reference-document") {
    return "credit-memo";
  }

  return "invoice";
}

function uniqueRecordIds(recordIds: string[]): string[] {
  return [...new Set(recordIds)];
}

function withJsonFormat(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("$format")) {
    parsed.searchParams.set("$format", "json");
  }

  return parsed.href;
}

export function parseSapODataMetadata(xml: string): SapODataMetadata {
  const entityTypes = new Map<string, SapODataMetadataKey[]>();
  const entitySets: SapODataMetadata["entitySets"] = {};
  const entityTypePattern = /<EntityType\b([^>]*)>([\s\S]*?)<\/EntityType>/g;
  let entityTypeMatch: RegExpExecArray | null;

  while ((entityTypeMatch = entityTypePattern.exec(xml)) !== null) {
    const name = readXmlAttribute(entityTypeMatch[1] ?? "", "Name");
    if (name === undefined) {
      continue;
    }

    entityTypes.set(name, parseEntityTypeKeys(entityTypeMatch[2] ?? ""));
  }

  const entitySetPattern = /<EntitySet\b([^>]*)\/?>/g;
  let entitySetMatch: RegExpExecArray | null;

  while ((entitySetMatch = entitySetPattern.exec(xml)) !== null) {
    const attributes = entitySetMatch[1] ?? "";
    const name = readXmlAttribute(attributes, "Name");
    const qualifiedEntityType = readXmlAttribute(attributes, "EntityType");
    if (name === undefined || qualifiedEntityType === undefined) {
      continue;
    }

    const entityType = qualifiedEntityType.split(".").at(-1) ?? qualifiedEntityType;
    entitySets[name] = {
      entityType,
      keys: entityTypes.get(entityType) ?? entityTypes.get(`${name}Parameters`) ?? []
    };
  }

  return { entitySets };
}

export function buildParameterizedResultsPath(
  entitySet: string,
  keys: SapODataMetadataKey[],
  values: Record<string, unknown>
): string {
  return `/${entitySet}(${buildODataKeyPredicate(keys, values)})/Results`;
}

export function buildODataKeyPredicate(keys: SapODataMetadataKey[], values: Record<string, unknown>): string {
  if (keys.length === 0) {
    throw new Error("OData key predicates require at least one metadata key.");
  }

  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(values, key.name)).map((key) => key.name);
  if (missing.length > 0) {
    throw new Error(`Missing mandatory OData parameter keys: ${missing.join(", ")}`);
  }

  return keys.map((key) => `${key.name}=${toEdmLiteral(values[key.name], key.type)}`).join(",");
}

function parseEntityTypeKeys(entityTypeBody: string): SapODataMetadataKey[] {
  const keyNames = Array.from(entityTypeBody.matchAll(/<PropertyRef\b([^>]*)\/?>/g))
    .map((match) => readXmlAttribute(match[1] ?? "", "Name"))
    .filter((value): value is string => value !== undefined);
  const propertyTypes = new Map(
    Array.from(entityTypeBody.matchAll(/<Property\b([^>]*)\/?>/g))
      .map((match): [string, string] | undefined => {
        const name = readXmlAttribute(match[1] ?? "", "Name");
        const type = readXmlAttribute(match[1] ?? "", "Type");

        return name === undefined || type === undefined ? undefined : [name, type];
      })
      .filter((value): value is [string, string] => value !== undefined)
  );

  return keyNames.map((name) => ({ name, type: propertyTypes.get(name) ?? "Edm.String" }));
}

function readXmlAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]+)"`).exec(attributes);

  return match?.[1];
}

function toEdmLiteral(value: unknown, edmType: string): string {
  if (value === undefined || value === null) {
    throw new Error("OData key predicate values cannot be empty.");
  }

  if (edmType === "Edm.String") {
    return `'${encodeODataStringLiteral(value)}'`;
  }

  if (edmType === "Edm.DateTime") {
    const text = stringifyODataPrimitive(value);

    return text.startsWith("datetime'") ? text : `datetime'${text}'`;
  }

  if (
    ["Edm.Int16", "Edm.Int32", "Edm.Int64", "Edm.Decimal", "Edm.Double", "Edm.Single", "Edm.Boolean"].includes(edmType)
  ) {
    const text = stringifyODataPrimitive(value);

    return typeof value === "boolean" ? text.toLowerCase() : text;
  }

  return `'${encodeODataStringLiteral(value)}'`;
}

function encodeODataStringLiteral(value: unknown): string {
  return encodeURIComponent(stringifyODataPrimitive(value).replace(/'/g, "''")).replace(/'/g, "%27");
}

function stringifyODataPrimitive(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }

  throw new Error("OData key predicate values must be primitive.");
}

function isRecord(value: unknown): value is SapJsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
