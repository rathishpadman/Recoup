# O2C Data Availability Map — OData Probe Results

Host: `crown.sapvista.com:44300` · client `100` · user `HCLTECH`
Probed: 32 services across 9 domains

## Billing / Invoice

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ✅ | **Billing Document Factsheet** (`ZUI_BILLINGDOCUMENTFS_0001`) | 35 | Yes | `C_BillingDocumentFs`: 3 rows, 39 fields; `C_BillingDocumentItemFs`: 3 rows, 22 fields; `C_SDDocumentPartnerCard`: HTTP 403 |
| △ | **SO Flow → Invoice** (`ZSD_SOFM_INVOICE_SRV_0001`) | 15 | Empty | `InvoiceSet`: HTTP 501; `DeliverySet`: HTTP 501 |
| ✅ | **Pre-Billing Doc Manage** (`ZSD_PRE_BIL_DOC_MANAGE_0001`) | 43 | Yes | `C_BillingDocumentUserVH`: 3 rows, 2 fields; `C_PrelimBillingDocumentTypeVH`: 3 rows, 3 fields; `C_SalesDocSalesOrganizationVH`: 3 rows, 2 fields |

## SalesOrder / Delivery

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ✅ | **API Sales Order** (`ZAPI_SALES_ORDER_SRV_0001`) | 22 | Yes | `A_SalesOrder`: 3 rows, 102 fields; `A_SalesOrderBillingPlan`: 3 rows, 13 fields; `A_SalesOrderBillingPlanItem`: 3 rows, 24 fields |
| ❌ | **Sales Order Manage** (`ZSD_SLS_SALESORDER_MANAGE_SRV_0001`) | - | No | Server error '500 Internal Server Error' for url 'https://crown.sapvista.com:443 |
| △ | **SO Flow → Delivery** (`ZSD_SOFM_DELIVERY_SRV_01_0001`) | 14 | Empty | `Delivery`: HTTP 501 |
| ✅ | **Sales Order Process Flow** (`ZSD_SO_PROCFLOW_SRV_0001`) | 91 | Yes | `C_CFinJournalEntryProcessFlow`: HTTP 500; `C_MfgOrderObjPg`: 3 rows, 42 fields; `C_SalesOrderFulfillmentIssueQ`: 3 rows, 94 fields |

## Pricing / Conditions

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| △ | **Pricing Condition Record** (`ZSD_PRICING_CONDITIONRECORD_SRV_0001`) | 152 | Empty | `DownloadExcelTemplateSet`: HTTP 501; `DownloadLogSet`: HTTP 501; `CloseLogSet`: HTTP 501 |

## Customer / Master

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ✅ | **Customer Contact Manage** (`ZUI_CUSTOMER_CONTACT_MANAGE_0001`) | 31 | Yes | `BusinessPartnerQuickView`: 1 rows, 10 fields; `CustomerContactAttribute`: 3 rows, 67 fields; `CustomerContactRelation`: 3 rows, 21 fields |
| ✅ | **Customer 360** (`ZUI_INSURCUSTOMER360_0001`) | 19 | Yes | `C_InsurCust360BPIdentification`: 3 rows, 5 fields; `C_InsurCust360CustDetails`: 3 rows, 32 fields |

## AR / Receivables

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ✅ | **AR Receivables (CDS)** (`ZC_TOTALACCOUNTSRECEIVABLES_CDS_0001`) | 45 | Yes | `P_DisplayCurrency`: 3 rows, 2 fields; `P_ExchangeRateType`: 3 rows, 2 fields; `ReconciliationAccount`: 3 rows, 3 fields |
| ✅ | **DSO Overview (CDS)** (`ZC_GLDAYSSALESOUTSTDGOVW_CDS_0001`) | 19 | Yes | `DurationUnit`: 3 rows, 2 fields; `DurationUnitResults`: HTTP 400; `AdditionalMetadata`: 3 rows, 3 fields |
| ❌ | **Process Receivables** (`ZUI_PROCESSRECEIVABLES_MAN_0001`) | - | No | The read operation timed out |
| ✅ | **HOB Receivables Display** (`ZUI_HOBRECEIVABLES_DISPLAY_0001`) | 47 | Yes | `BusinessPartnerQuickView`: 1 rows, 10 fields; `AccountNote`: HTTP 500; `DueDateGrid`: HTTP 500 |

## Disputes / Collections

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ❌ | **Manage Disputes** (`ZUDMO_MANAGE_DISPUTES_SRV_0001`) | - | No | Server error '500 Internal Server Error' for url 'https://crown.sapvista.com:443 |
| ✅ | **Dispute Case Manage** (`ZUI_DISPUTECASE_MANAGE_0001`) | 57 | Yes | `CustomerQuickView`: 3 rows, 12 fields; `CollectionsInvoiceNote`: HTTP 500; `CollsInvoiceRelatedDsputCase`: 2 rows, 75 fields |
| ✅ | **Dispute Proposal Assignment** (`ZUI_DISPUTE_PROPOSAL_ASSGMT_0001`) | 36 | Yes | `DisputeCase`: 3 rows, 145 fields |
| ✅ | **Collection Worklist** (`ZUDMO_COLLECTION_WORKLIST_0001`) | 56 | Yes | `C_CurrencyValueHelp`: 3 rows, 4 fields; `VL_SH_UDM_COLL_GROUP`: 3 rows, 2 fields; `VL_SH_UDM_COLL_PRIO`: 3 rows, 2 fields |
| ✅ | **Collections Email** (`ZUI_COLLECTIONS_EMAIL_0001`) | 28 | Yes | `CollectionsEmailTemplateVH`: 3 rows, 6 fields; `CollectionsEmailCorrespncTmpl`: HTTP 403; `CollectionsEmailCorrespncType`: HTTP 403 |

## Credit / Management

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ❌ | **Credit Worklist** (`ZUKMO_CREDIT_WORKLIST_SRV_0001`) | - | No | Server error '500 Internal Server Error' for url 'https://crown.sapvista.com:443 |
| ✅ | **Credit Account Display** (`ZUI_CREDITACCOUNT_DISPLAY_0001`) | 24 | Yes | `CreditAccountSummary`: 3 rows, 99 fields; `I_CountryVH`: 3 rows, 5 fields; `I_CrdtMBusinessPartnerVH`: 3 rows, 8 fields |
| ✅ | **Credit Exposure Display** (`ZUI_CREDITEXPOSURE_DISPLAY_0001`) | 18 | Yes | `CreditExposure`: 3 rows, 13 fields; `I_CrdtMBusinessPartnerVH`: 3 rows, 8 fields; `I_CrdtMSegmentVH`: 3 rows, 2 fields |
| ✅ | **Credit Limit Request Manage** (`ZUI_CREDITLIMITREQUEST_MAN_0001`) | 34 | Yes | `AgingGrid`: HTTP 500; `QuickView`: 3 rows, 10 fields; `C_CreditLimitChgReqCaseStsVH`: 3 rows, 7 fields |
| ✅ | **Credit Decision Manage** (`ZUI_CREDIT_DECISION_MANAGE_0001`) | 41 | Yes | `AgingGrid`: HTTP 500; `QuickView`: 3 rows, 10 fields; `RejectionReasons`: HTTP 500 |
| ✅ | **Credit Worthiness Manage** (`ZUI_CACREDITWORTHINESS_MNG_0001`) | 22 | Yes | `C_CAContractPartnerValueHelp`: 3 rows, 18 fields |
| △ | **At-Risk Customer Analytics** (`ZUI_ATRISKCUSTOMER_ANA_0001`) | 51 | Empty | `AllRelatedRiskSet`: HTTP 400; `AllRelatedRisk`: HTTP 400; `CustomerEventSet`: HTTP 400 |
| △ | **Credit Block (SO Flow)** (`ZSD_SOFM_CREDIT_BLOCK_SRV_0001`) | 15 | Empty | `SalesOrderCollection`: HTTP 500; `DeliveryCollection`: HTTP 500 |

## TPM / Promotions

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| △ | **Promotion Operations** (`ZRFM_PROMOTION_OP_SRV_0001`) | 60 | Empty | - |
| ✅ | **Accruals Manage** (`ZUI_ACCRUALS_MANAGE_0001`) | 36 | Yes | `PeriodicAmounts`: 3 rows, 86 fields; `AcctAssignment`: 3 rows, 36 fields; `AccrItem`: 3 rows, 61 fields |
| △ | **Settlement Overview** (`ZUI_ACMSETTLEMENTOVRVIEW_O2_0001`) | 20 | Empty | - |

## Dunning / Payment

| Status | Service | Entity Sets | Data? | Details |
|---|---|---|---|---|
| ✅ | **Dunning Volume Analysis** (`ZUI_CADUNNINGVOL_ANALYSIS_0001`) | 34 | Yes | `C_CABusinessAreaValueHelp`: 3 rows, 2 fields; `C_CACompanyCodeVH`: 3 rows, 2 fields; `C_CAContractPartnerValueHelp`: 3 rows, 18 fields |
| ✅ | **Payment Plan Manage** (`ZUI_MANAGEPAYMENTPLAN_O2_0001`) | 48 | Yes | `C_PaymentRunPlanCompanyCodeTP`: 3 rows, 15 fields; `C_PaymentRunPlanTP`: 3 rows, 85 fields; `I_CompanyCodeStdVH`: 3 rows, 2 fields |

## Summary

- ✅ **Data available**: 21 services
- △ **Metadata OK but no sample data**: 7 services
- ⚠️ **Metadata only**: 0 services
- ❌ **Metadata failed**: 4 services
- 🚫 **Not found**: 0 services
