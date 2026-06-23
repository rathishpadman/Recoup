import type { DeductionLine } from "../types/entities.js";
import type { EvidenceDocument } from "../tools/retrieval/docs.js";
import { loadSapODataReadOnlyConnection, type RuntimeEnv } from "../../config/env.js";
import { Buffer } from "node:buffer";

export interface SapODataConnection {
  authMode?: "basic" | "oauth";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  sapClient?: string;
  scope: string;
  tenant: string;
  tokenUrl: string;
  userId?: string;
}

export interface SapODataReadRequest {
  method: "GET";
  purpose:
    | "accrual-cap"
    | "billing-document"
    | "billing-document-items"
    | "credit-account-dso"
    | "credit-exposure"
    | "delivery-item"
    | "dispute-case"
    | "reference-document"
    | "sales-order";
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
      sapClient?: string;
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
  entitySets: Record<string, { entityType: string; keys: SapODataMetadataKey[]; properties: SapODataMetadataKey[] }>;
}
export type SapODataMetadataInput = SapODataMetadata | Partial<Record<string, SapODataMetadata>>;

export const SAP_R1_SOURCE_NEEDS = {
  accrualCap: "accrual-cap",
  creditAccountDso: "credit-account-dso",
  creditExposure: "credit-exposure",
  disputeCase: "dispute-case",
  invoice: "invoice",
  salesOrder: "sales-order"
} as const;

export type SapR1SourceNeed =
  | { need: typeof SAP_R1_SOURCE_NEEDS.accrualCap; accrualObject: string }
  | { need: typeof SAP_R1_SOURCE_NEEDS.creditAccountDso; businessPartner: string; creditSegment: string }
  | { need: typeof SAP_R1_SOURCE_NEEDS.creditExposure; businessPartner: string }
  | { need: typeof SAP_R1_SOURCE_NEEDS.disputeCase; disputeCaseId: string }
  | { need: typeof SAP_R1_SOURCE_NEEDS.invoice; billingDocument: string }
  | { need: typeof SAP_R1_SOURCE_NEEDS.salesOrder; salesOrder: string };

export type SapR1SourceNeedName = SapR1SourceNeed["need"];

type SapFetch = typeof fetch;
type SapJsonRecord = Record<string, unknown>;
type SapRecordMapping = {
  entitySet: string;
  keyValueFromRecordId?: (recordId: string) => string | undefined;
  keyName: string;
  purpose: SapODataReadRequest["purpose"];
  recordPrefix: string;
  serviceName: string;
};
type SapCollectionFilterMapping = {
  documentIdFromKeyValue: (keyValue: string) => string;
  entitySet: string;
  filterKeyName: string;
  keyValueFromRecordId: (recordId: string) => string | undefined;
  purpose: SapODataReadRequest["purpose"];
  recordPrefix: string;
  serviceName: string;
};

type SapMetadataCoverageMapping = {
  entitySet: string;
  keyNames: string[];
  purpose: SapODataReadRequest["purpose"];
  propertyNames?: string[];
  serviceName: string;
};

type SapR1KeyReadMapping = {
  entitySet: string;
  keyValues: Record<string, string>;
  mode: "key";
  purpose: SapODataReadRequest["purpose"];
  recordIds: string[];
  serviceName: string;
};

type SapR1FilterReadMapping = {
  entitySet: string;
  filterKeyName: string;
  filterValue: string;
  mode: "filter";
  purpose: SapODataReadRequest["purpose"];
  recordIds: string[];
  serviceName: string;
};

type SapR1ReadMapping = SapR1KeyReadMapping | SapR1FilterReadMapping;

export interface SapODataMetadataCoverageClient {
  fetchMetadata(serviceName: string): Promise<string>;
}

export interface SapODataMetadataCoverageProof {
  mappings: Array<{
    entitySet: string;
    keyNames: string[];
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
    entitySet: "C_BillingDocumentFs",
    keyValueFromRecordId: extractSapNumericSuffix("INV-"),
    keyName: "BillingDocument",
    purpose: "billing-document",
    recordPrefix: "INV-",
    serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
  }
];

const SAP_COLLECTION_FILTER_MAPPINGS: SapCollectionFilterMapping[] = [
  {
    documentIdFromKeyValue: (keyValue) => `C_BillingDocumentItemFs:${keyValue}`,
    entitySet: "C_BillingDocumentItemFs",
    filterKeyName: "BillingDocument",
    keyValueFromRecordId: extractSapNumericSuffix("INV-"),
    purpose: "billing-document-items",
    recordPrefix: "INV-",
    serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
  }
];

const SAP_SERVICE_URL_SEGMENTS: Record<string, string> = {
  ZUI_BILLINGDOCUMENTFS_0001: "UI_BILLINGDOCUMENTFS"
};

const SAP_METADATA_COVERAGE_MAPPINGS: SapMetadataCoverageMapping[] = [
  {
    entitySet: "C_BillingDocumentFs",
    keyNames: ["BillingDocument"],
    purpose: "billing-document",
    serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
  },
  {
    entitySet: "C_BillingDocumentItemFs",
    keyNames: ["BillingDocument", "BillingDocumentItem"],
    purpose: "billing-document-items",
    serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
  },
  {
    entitySet: "A_SalesOrder",
    keyNames: ["SalesOrder"],
    purpose: "reference-document",
    serviceName: "ZAPI_SALES_ORDER_SRV_0001"
  },
  {
    entitySet: "A_SalesOrderItem",
    keyNames: ["SalesOrder", "SalesOrderItem"],
    purpose: "reference-document",
    serviceName: "ZAPI_SALES_ORDER_SRV_0001"
  },
  {
    entitySet: "CreditAccountSummary",
    keyNames: ["BusinessPartner", "CreditSegment"],
    purpose: "credit-account-dso",
    serviceName: "ZUI_CREDITACCOUNT_DISPLAY_0001"
  },
  {
    entitySet: "CreditExposure",
    keyNames: ["BusinessPartner"],
    purpose: "credit-exposure",
    serviceName: "ZUI_CREDITEXPOSURE_DISPLAY_0001"
  },
  {
    entitySet: "DisputeCase",
    keyNames: ["DisputeCaseID"],
    purpose: "dispute-case",
    serviceName: "ZUI_DISPUTECASE_MANAGE_0001"
  },
  {
    entitySet: "PeriodicAmounts",
    keyNames: [],
    purpose: "accrual-cap",
    propertyNames: ["AccrualObject"],
    serviceName: "ZUI_ACCRUALS_MANAGE_0001"
  }
];
export const SAP_ODATA_BASIC_ENV_NAMES = [
  "SAP_ODATA_BASE_URL",
  "SAP_ODATA_CLIENT",
  "SAP_ODATA_USERID",
  "SAP_ODATA_CLIENT_SECRET"
] as const;
export const SAP_ODATA_OAUTH_ENV_NAMES = [
  "SAP_ODATA_BASE_URL",
  "SAP_ODATA_CLIENT",
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
  const services = [...new Set(SAP_METADATA_COVERAGE_MAPPINGS.map((mapping) => mapping.serviceName))];

  for (const serviceName of services) {
    metadataByService.set(serviceName, parseSapODataMetadata(await client.fetchMetadata(serviceName)));
  }

  const mappings = SAP_METADATA_COVERAGE_MAPPINGS.map((mapping) => {
    const metadata = metadataByService.get(mapping.serviceName);
    const entitySet = metadata?.entitySets[mapping.entitySet];
    const ready =
      entitySet !== undefined &&
      mapping.keyNames.every((keyName) => entitySet.keys.some((key) => key.name === keyName)) &&
      (mapping.propertyNames ?? []).every((propertyName) => entitySet.properties.some((property) => property.name === propertyName));

    return {
      entitySet: mapping.entitySet,
      keyNames: mapping.keyNames,
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
    metadata: SapODataMetadataInput
  ): SapODataReadRequestPlan => {
    return this.#buildMetadataInputReadRequestPlan(line, metadata);
  };

  readonly buildMetadataValidatedR1ReadRequestPlan = (
    sourceNeed: SapR1SourceNeed,
    metadata: SapODataMetadataInput
  ): SapODataReadRequestPlan => {
    return this.#buildMetadataInputR1ReadRequestPlan(sourceNeed, metadata);
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
      ...(this.#connection.sapClient === undefined ? {} : { sapClient: this.#connection.sapClient }),
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
    void line;

    return [];
  }

  retrieveReferenceDocuments(line: DeductionLine): EvidenceDocument[] {
    void line;

    return [];
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

    const documents = await Promise.all(
      plan.requests.map(async (request) => mapSapODataReadResultToEvidence(request, await readClient.fetchReadRequest(request)))
    );

    return documents.filter((document): document is EvidenceDocument => document !== undefined);
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
      const keyValue = mapping.keyValueFromRecordId?.(recordId);
      if (mapping.keyValueFromRecordId !== undefined && keyValue === undefined) {
        continue;
      }

      requests.push(
        buildRequestFromMetadata(
          this.#connection,
          mapping,
          key,
          keyValue ?? recordId,
          recordId,
          line.lineId
        )
      );

      for (const collectionMapping of SAP_COLLECTION_FILTER_MAPPINGS.filter((candidate) =>
        recordId.startsWith(candidate.recordPrefix)
      )) {
        const collectionMetadata = metadataForMapping(metadataInput, collectionMapping);
        if (collectionMetadata === undefined) {
          return {
            configured: false,
            reason: `SAP metadata missing service ${collectionMapping.serviceName}.`,
            requests: []
          };
        }

        const collectionEntitySet = collectionMetadata.entitySets[collectionMapping.entitySet];
        if (collectionEntitySet === undefined) {
          return {
            configured: false,
            reason: `SAP metadata missing mapped entity set ${collectionMapping.entitySet}.`,
            requests: []
          };
        }

        const filterKey = collectionEntitySet.keys.find((candidate) => candidate.name === collectionMapping.filterKeyName);
        if (filterKey === undefined) {
          return {
            configured: false,
            reason: `SAP metadata missing filter key ${collectionMapping.filterKeyName} for mapped entity set ${collectionMapping.entitySet}.`,
            requests: []
          };
        }

        const collectionKeyValue = collectionMapping.keyValueFromRecordId(recordId);
        if (collectionKeyValue === undefined) {
          continue;
        }

        requests.push(
          buildCollectionFilterRequestFromMetadata(
            this.#connection,
            collectionMapping,
            filterKey,
            collectionKeyValue,
            recordId,
            line.lineId
          )
        );
      }
    }

    return {
      configured: true,
      requests,
      tenant: this.#connection.tenant
    };
  }

  #buildMetadataInputR1ReadRequestPlan(
    sourceNeed: SapR1SourceNeed,
    metadataInput: SapODataMetadataInput
  ): SapODataReadRequestPlan {
    if (this.#connection === undefined) {
      return {
        configured: false,
        requests: [],
        reason: "SAP OData credentials are not configured."
      };
    }

    const mapping = r1ReadMappingForNeed(sourceNeed);
    const metadata = metadataForService(metadataInput, mapping.serviceName);
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

    if (mapping.mode === "filter") {
      const filterProperty = entitySet.properties.find((candidate) => candidate.name === mapping.filterKeyName);
      if (filterProperty === undefined) {
        return {
          configured: false,
          reason: `SAP metadata missing property ${mapping.filterKeyName} for mapped entity set ${mapping.entitySet}.`,
          requests: []
        };
      }

      return {
        configured: true,
        requests: [buildR1FilterReadRequestFromMetadata(this.#connection, mapping, filterProperty)],
        tenant: this.#connection.tenant
      };
    }

    const keys: SapODataMetadataKey[] = [];
    for (const keyName of Object.keys(mapping.keyValues)) {
      const key = entitySet.keys.find((candidate) => candidate.name === keyName);
      if (key === undefined) {
        return {
          configured: false,
          reason: `SAP metadata missing key ${keyName} for mapped entity set ${mapping.entitySet}.`,
          requests: []
        };
      }

      keys.push(key);
    }
    const unsupportedKeys = entitySet.keys.filter((candidate) => !Object.prototype.hasOwnProperty.call(mapping.keyValues, candidate.name));
    if (unsupportedKeys.length > 0) {
      return {
        configured: false,
        reason: `SAP metadata key set for mapped entity set ${mapping.entitySet} requires unsupported key ${unsupportedKeys[0]?.name ?? "unknown"}.`,
        requests: []
      };
    }

    return {
      configured: true,
      requests: [buildR1KeyReadRequestFromMetadata(this.#connection, mapping, keys)],
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
      url: appendSapQueryParams(
        `${this.#connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${entitySet}('${encodeURIComponent(recordId)}')`,
        sapClientParam(this.#connection.sapClient)
      ),
      recordIds: [lineId, recordId]
    };
  }
}

function buildRequestFromMetadata(
  connection: SapODataConnection,
  mapping: SapRecordMapping,
  key: SapODataMetadataKey,
  keyValue: string,
  recordId: string,
  lineId: string
): SapODataReadRequest {
  return {
    method: "GET",
    purpose: mapping.purpose,
    url: appendSapQueryParams(
      `${connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${sapServiceUrlSegment(mapping.serviceName)}/${mapping.entitySet}(${buildODataKeyPredicate(
        [key],
        {
          [key.name]: keyValue
        }
      )})`,
      sapClientParam(connection.sapClient)
    ),
    recordIds: [lineId, recordId]
  };
}

function buildCollectionFilterRequestFromMetadata(
  connection: SapODataConnection,
  mapping: SapCollectionFilterMapping,
  filterKey: SapODataMetadataKey,
  keyValue: string,
  recordId: string,
  lineId: string
): SapODataReadRequest {
  return {
    method: "GET",
    purpose: mapping.purpose,
    url: appendSapQueryParams(
      `${connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${sapServiceUrlSegment(mapping.serviceName)}/${mapping.entitySet}`,
      {
        $filter: buildODataFilterExpression(filterKey, keyValue),
        ...sapClientParam(connection.sapClient)
      }
    ),
    recordIds: [lineId, recordId, mapping.documentIdFromKeyValue(keyValue)]
  };
}

function buildR1KeyReadRequestFromMetadata(
  connection: SapODataConnection,
  mapping: SapR1KeyReadMapping,
  keys: SapODataMetadataKey[]
): SapODataReadRequest {
  return {
    method: "GET",
    purpose: mapping.purpose,
    url: appendSapQueryParams(
      `${connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${sapServiceUrlSegment(mapping.serviceName)}/${mapping.entitySet}(${buildODataKeyPredicate(
        keys,
        mapping.keyValues
      )})`,
      sapClientParam(connection.sapClient)
    ),
    recordIds: mapping.recordIds
  };
}

function buildR1FilterReadRequestFromMetadata(
  connection: SapODataConnection,
  mapping: SapR1FilterReadMapping,
  filterProperty: SapODataMetadataKey
): SapODataReadRequest {
  return {
    method: "GET",
    purpose: mapping.purpose,
    url: appendSapQueryParams(
      `${connection.baseUrl.replace(/\/$/, "")}/sap/opu/odata/sap/${sapServiceUrlSegment(mapping.serviceName)}/${mapping.entitySet}`,
      {
        $filter: buildODataFilterExpression(filterProperty, mapping.filterValue),
        ...sapClientParam(connection.sapClient)
      }
    ),
    recordIds: mapping.recordIds
  };
}

function metadataForMapping(
  metadataInput: SapODataMetadataInput,
  mapping: SapRecordMapping | SapCollectionFilterMapping
): SapODataMetadata | undefined {
  return metadataForService(metadataInput, mapping.serviceName);
}

function metadataForService(metadataInput: SapODataMetadataInput, serviceName: string): SapODataMetadata | undefined {
  if (isSapODataMetadata(metadataInput)) {
    return metadataInput;
  }

  return metadataInput[serviceName];
}

function r1ReadMappingForNeed(sourceNeed: SapR1SourceNeed): SapR1ReadMapping {
  switch (sourceNeed.need) {
    case "invoice":
      return {
        entitySet: "C_BillingDocumentFs",
        keyValues: { BillingDocument: sourceNeed.billingDocument },
        mode: "key",
        purpose: "billing-document",
        recordIds: [sourceNeed.billingDocument],
        serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
      };
    case "sales-order":
      return {
        entitySet: "A_SalesOrder",
        keyValues: { SalesOrder: sourceNeed.salesOrder },
        mode: "key",
        purpose: "sales-order",
        recordIds: [sourceNeed.salesOrder],
        serviceName: "ZAPI_SALES_ORDER_SRV_0001"
      };
    case "credit-account-dso":
      return {
        entitySet: "CreditAccountSummary",
        keyValues: {
          BusinessPartner: sourceNeed.businessPartner,
          CreditSegment: sourceNeed.creditSegment
        },
        mode: "key",
        purpose: "credit-account-dso",
        recordIds: [sourceNeed.businessPartner, sourceNeed.creditSegment],
        serviceName: "ZUI_CREDITACCOUNT_DISPLAY_0001"
      };
    case "credit-exposure":
      return {
        entitySet: "CreditExposure",
        keyValues: { BusinessPartner: sourceNeed.businessPartner },
        mode: "key",
        purpose: "credit-exposure",
        recordIds: [sourceNeed.businessPartner],
        serviceName: "ZUI_CREDITEXPOSURE_DISPLAY_0001"
      };
    case "dispute-case":
      return {
        entitySet: "DisputeCase",
        keyValues: { DisputeCaseID: sourceNeed.disputeCaseId },
        mode: "key",
        purpose: "dispute-case",
        recordIds: [sourceNeed.disputeCaseId],
        serviceName: "ZUI_DISPUTECASE_MANAGE_0001"
      };
    case "accrual-cap":
      return {
        entitySet: "PeriodicAmounts",
        filterKeyName: "AccrualObject",
        filterValue: sourceNeed.accrualObject,
        mode: "filter",
        purpose: "accrual-cap",
        recordIds: [sourceNeed.accrualObject],
        serviceName: "ZUI_ACCRUALS_MANAGE_0001"
      };
  }
}

function extractSapNumericSuffix(prefix: string): (recordId: string) => string | undefined {
  return (recordId) => {
    const suffix = recordId.slice(prefix.length);

    return /^\d+$/u.test(suffix) ? suffix : undefined;
  };
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
    const response = await this.#fetcher(withJsonFormat(request.url, this.#connection.sapClient), {
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
    const normalizedPath = resolveSapServicePath(path);
    const url = `${trimmedBase}/sap/opu/odata/sap/${normalizedPath}`;

    return appendSapQueryParams(url, {
      ...params,
      ...sapClientParam(this.#connection.sapClient)
    });
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

function resolveSapServicePath(path: string): string {
  const normalizedPath = path.replace(/^\//, "");
  const separatorIndex = normalizedPath.indexOf("/");
  if (separatorIndex === -1) {
    return sapServiceUrlSegment(normalizedPath);
  }

  const serviceName = normalizedPath.slice(0, separatorIndex);
  return `${sapServiceUrlSegment(serviceName)}${normalizedPath.slice(separatorIndex)}`;
}

function sapServiceUrlSegment(serviceName: string): string {
  return SAP_SERVICE_URL_SEGMENTS[serviceName] ?? serviceName;
}

export function mapSapODataReadResultToEvidence(request: SapODataReadRequest, payload: unknown): EvidenceDocument | undefined {
  if (request.purpose === "billing-document-items" && !hasSapODataResultRecord(payload)) {
    return undefined;
  }

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

function hasSapODataResultRecord(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  const d = payload["d"];
  if (!isRecord(d)) {
    return false;
  }

  const results = d["results"];
  if (Array.isArray(results)) {
    return results.some(isRecord);
  }

  return false;
}

function readSapDocumentId(request: SapODataReadRequest, record: SapJsonRecord): string {
  if (request.purpose === "billing-document-items") {
    return request.recordIds[2] ?? request.recordIds[1] ?? request.recordIds[0] ?? request.url;
  }

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

  if (purpose === "billing-document-items") {
    return "invoice";
  }

  if (purpose === "reference-document") {
    return "credit-memo";
  }

  return "invoice";
}

function uniqueRecordIds(recordIds: string[]): string[] {
  return [...new Set(recordIds)];
}

function withJsonFormat(url: string, sapClient: string | undefined): string {
  return appendSapQueryParams(url, {
    $format: "json",
    ...sapClientParam(sapClient)
  });
}

function appendSapQueryParams(url: string, params: Record<string, string | undefined>): string {
  const queryIndex = url.indexOf("?");
  const baseUrl = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const searchParams = new URLSearchParams(queryIndex === -1 ? "" : url.slice(queryIndex + 1));

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && !searchParams.has(key)) {
      searchParams.set(key, value);
    }
  }

  const search = searchParams.toString();
  return search.length === 0 ? baseUrl : `${baseUrl}?${search}`;
}

function sapClientParam(sapClient: string | undefined): Record<"sap-client", string> | Record<string, never> {
  return sapClient === undefined ? {} : { "sap-client": sapClient };
}

export function parseSapODataMetadata(xml: string): SapODataMetadata {
  const entityTypes = new Map<string, { keys: SapODataMetadataKey[]; properties: SapODataMetadataKey[] }>();
  const entitySets: SapODataMetadata["entitySets"] = {};
  const entityTypePattern = /<EntityType\b([^>]*)>([\s\S]*?)<\/EntityType>/g;
  let entityTypeMatch: RegExpExecArray | null;

  while ((entityTypeMatch = entityTypePattern.exec(xml)) !== null) {
    const name = readXmlAttribute(entityTypeMatch[1] ?? "", "Name");
    if (name === undefined) {
      continue;
    }

    const properties = parseEntityTypeProperties(entityTypeMatch[2] ?? "");
    entityTypes.set(name, { keys: parseEntityTypeKeys(entityTypeMatch[2] ?? "", properties), properties });
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
    const entityTypeMetadata = entityTypes.get(entityType) ?? entityTypes.get(`${name}Parameters`);
    entitySets[name] = {
      entityType,
      keys: entityTypeMetadata?.keys ?? [],
      properties: entityTypeMetadata?.properties ?? []
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

function buildODataFilterExpression(key: SapODataMetadataKey, value: unknown): string {
  return `${key.name} eq ${toEdmLiteral(value, key.type)}`;
}

function parseEntityTypeKeys(entityTypeBody: string, properties: SapODataMetadataKey[]): SapODataMetadataKey[] {
  const keyNames = Array.from(entityTypeBody.matchAll(/<PropertyRef\b([^>]*)\/?>/g))
    .map((match) => readXmlAttribute(match[1] ?? "", "Name"))
    .filter((value): value is string => value !== undefined);
  const propertyTypes = new Map(properties.map((property) => [property.name, property.type]));

  return keyNames.map((name) => ({ name, type: propertyTypes.get(name) ?? "Edm.String" }));
}

function parseEntityTypeProperties(entityTypeBody: string): SapODataMetadataKey[] {
  return Array.from(entityTypeBody.matchAll(/<Property\b([^>]*)\/?>/g))
    .map((match): SapODataMetadataKey | undefined => {
      const name = readXmlAttribute(match[1] ?? "", "Name");
      const type = readXmlAttribute(match[1] ?? "", "Type");

      return name === undefined || type === undefined ? undefined : { name, type };
    })
    .filter((value): value is SapODataMetadataKey => value !== undefined);
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
