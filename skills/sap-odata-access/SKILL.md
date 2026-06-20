---
name: sap-odata-access
description: Use when validating, debugging, or documenting read-only SAP S/4HANA OData v2 access for Recoup: OAuth client-credentials probes, SAP Gateway service roots, $metadata parsing, metadata-backed key predicates, analytical CDS /Results traversal, and canonical evidence mapping. Do not use this skill to create SAP mutation paths in Recoup.
---

# SAP OData Access

Use this skill for Recoup-safe SAP S/4HANA OData v2 work. The Recoup runtime is read-only against SAP: metadata fetches, GET request planning, and canonical evidence mapping are allowed; SAP mutation methods are outside this repo's runtime contract.

## When To Use

- Validate SAP connection setup without printing secrets.
- Fetch or reason about `$metadata` for a Gateway service root such as `/sap/opu/odata/sap/<SERVICE_NAME>`.
- Build read-only key predicates from the exact entity set keys declared in `$metadata`.
- Debug analytical CDS view requests, including parameter entity sets and `/Results` navigation.
- Map live OData payloads back to cited Recoup evidence records.

## Safety Rules

- Never print SAP credentials, cookies, access tokens, client secrets, tenant names, or business-sensitive payloads.
- Use `.env.local`, shell env, or an approved secret provider; never hardcode credentials in source, tests, docs, or examples.
- Keep Recoup SAP integration read-only: OAuth token retrieval and OData `GET` are acceptable probes; SAP `POST`, `PATCH`, `PUT`, `DELETE`, action execution, CSRF write flows, and ERP mutation clients are not allowed in this repo.
- Preserve I-12 and I-26: adapters return canonical entities only, and no production ERP mutation path may exist.
- If a user requests SAP mutation behavior, stop and surface the invariant conflict before editing runtime code.

## Read-Only Workflow

1. Identify the SAP service root: `/sap/opu/odata/sap/<SERVICE_NAME>`.
2. Confirm URL shape and key presence without echoing values.
3. Request OAuth client credentials only when configured; report only status, error type, and whether a token was received.
4. Fetch `$metadata` with `GET` and parse entity sets, entity types, key properties, and EDM types.
5. Build key predicates from metadata. String values use single quotes; numeric and boolean values do not. OData v2 DateTime values commonly use `datetime'YYYY-MM-DDTHH:MM:SS'`.
6. For analytical CDS views, call the parameter entity set with all mandatory parameters, then append `/Results`.
7. Add `$format=json`, `$select`, `$filter`, `$top`, and `$orderby` only after the base metadata-backed request works.
8. Map returned records into Recoup evidence with cited `recordIds`, source `sap`, document type, and deterministic basis.

## CFO Tower Analytical Patterns

| CFO Domain / KPI | OData Service | Core Entity Set | Mandatory Parameters |
| :--- | :--- | :--- | :--- |
| Accounts Payable Open Items | `ZC_APVENDOROPENITEMS_CDS` | `C_APVENDOROPENITEMS` | `P_Currency`, `P_ExchangeRateType` |
| Days Sales Outstanding | `ZC_GLDAYSSALESOUTSTDGOVW_CDS` | `C_GLDAYSSALESOUTSTDGOVW` | `P_DisplayCurrency`, `P_KeyDate` as DateTime |
| Days Payable Outstanding | `ZC_GLDAYSPYBLOUTSTDGINDRCT_CDS` | `C_GLDAYSPYBLOUTSTDGINDRCT` | `P_DisplayCurrency` |
| Accounts Receivable | `ZC_TOTALACCOUNTSRECEIVABLES_CDS` | `C_TOTALACCOUNTSRECEIVABLES` | `P_DateFunction`, `P_NetDueInterval1InDays`, `P_NetDueInterval2InDays`, `P_NetDueInterval3InDays`, `P_DisplayCurrency`, `P_ExchangeRateType` |

## Troubleshooting

- `400` or incomplete URL: likely missing parameter predicates or `/Results` on a parameterized CDS view.
- `404` or invalid key predicate: check entity set name, key name casing, mandatory keys, and EDM literal formats from `$metadata`.
- Empty results: verify business filters, currency, exchange rate type, key date, company code, fiscal period, and SAP authorizations.
- OAuth connection closes without HTTP status: verify scheme, host, port, proxy, TLS policy, and whether the token endpoint expects HTTP or HTTPS.

## Validation

- Prefer unit tests with mocked HTTP responses over live SAP calls.
- Run focused Recoup checks after changes:

```powershell
npm.cmd run test -- tests/unit/sap-odata.test.ts tests/invariants/connector-readiness.test.ts tests/invariants/no-erp-writeback.test.ts
```

- For live probes, report only key presence, HTTP status, safe service/entity names, and metadata coverage booleans.
- Confirm no SAP mutation method or service tool was introduced before declaring the work complete.
