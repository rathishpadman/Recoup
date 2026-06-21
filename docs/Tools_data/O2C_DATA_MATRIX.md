# O2C Data Availability Matrix — SAP OData & Supabase Mapping

This document provides a definitive mapping of the data requirements for **Maya R. (Deductions & Disputes)** and **David K. (Credit & Collections)** as defined in the [Agentic O2C Persona Journey v1.1](file:///c:/Rathish/Root%20Folder/CFO/GTM/SAP%20BAPI/journey_map_text.txt) to the SAP S/4HANA OData services on `crown.sapvista.com` and the designed Supabase tables.

---

## 1. Maya R. — Deductions & Disputes (Scenarios S1–S8)

### S1: Damaged Product ($8,200) — Greenleaf Naturals
* **Verdict**: `VALID` -> Route draft Credit Memo to Billing.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Billing Document Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument`, `BillingDocumentType`, `SoldToParty`, `TotalNetAmount` |
  | Billing Document Items | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentItemFs` | `BillingDocumentItem`, `Material`, `BillingQuantity`, `NetAmount` |
  | Carrier Damage Report | Supabase | `external_carrier_damages` | `carrier_reports` | `report_id`, `carrier_name`, `damage_description`, `damaged_qty`, `invoice_ref` |
  | Customer Photos | Supabase | `external_carrier_damages` | `damage_photos` | `photo_url`, `uploaded_at`, `report_id` |
  | signed 3PL POD | Supabase | `external_pod_data` | `pod_records` | `pod_id`, `signed_qty`, `discrepancy_note` (e.g., "12 cases damaged") |
  | Staged Credit Memo | Supabase | `external_billing_queue` | `billing_requests` | `request_id`, `type` ('CREDIT_MEMO'), `amount`, `status` ('DRAFT') |

### S2: Valid Promo Billed at List ($14,600) — Crestline Grocery
* **Verdict**: `VALID` -> Route draft Credit & Re-bill to Billing; emit root-cause recommendation.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Billing Document Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument` (billed at list price), `SoldToParty` |
  | SAP Accrual Record | SAP OData | `ZUI_ACCRUALS_MANAGE_0001` | `PeriodicAmounts` | `AccrualObject` (representing the promotional agreement) |
  | Trade Promo Contract | Supabase | `external_tpm_promotions` | `promotions` | `promo_id`, `customer_id`, `sku`, `promo_rate`, `start_date`, `end_date` |
  | Staged Credit + Re-bill | Supabase | `external_billing_queue` | `billing_requests` | `type` ('CREDIT_AND_REBILL'), `original_invoice_ref`, `correct_net_price` |

### S3: Shortage Claim (Invalid, $21,300) — Crestline Grocery
* **Verdict**: `INVALID` -> Generate Recovery Package; flag Crestline for gaming.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Sales Order Header | SAP OData | `ZAPI_SALES_ORDER_SRV_0001` | `A_SalesOrder` | `SalesOrder`, `SoldToParty`, `OverallDeliveryStatus` |
  | Billing Document Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument`, `TotalNetAmount` |
  | 3PL POD Signed Quantity | Supabase | `external_pod_data` | `pod_records` | `signed_qty` (shows 1,200-case full delivery, matching invoiced qty) |
  | Customer Dispute History | SAP OData | `ZUI_DISPUTECASE_MANAGE_0001`| `DisputeCase` | `DisputeCaseID`, `Customer`, `Status`, `DisputeReason` (identifies gaming pattern) |

### S4: Valid OTIF Fine ($9,800) — ValuMart Club
* **Verdict**: `VALID` -> Accept fine; route to Billing for write-off to cost center; flag carrier performance.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Original Invoice Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument`, `SoldToParty` |
  | Compliance SLA Contract | Supabase | `external_tpm_promotions` | `contracts` | `contract_id`, `customer_id`, `otif_threshold` (98%), `fine_percentage` |
  | Fine Notification (OCR) | Supabase | `external_ocr_remittances` | `remittance_lines` | `remittance_id`, `deduction_reason_code` ('OTIF_FINE'), `amount` |
  | Actual Delivery Date | SAP OData | `ZSD_SO_PROCFLOW_SRV_0001` | `C_MfgOrderObjPg` | Actual delivery date timestamp (confirms late delivery at 95%) |

### S5: Invalid OTIF Fine ($12,700) — ValuMart Club
* **Verdict**: `INVALID` -> Generate Recovery Package with 3PL timestamp proof.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Billing Document Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument`, `SoldToParty` |
  | Process Flow Timeline | SAP OData | `ZSD_SO_PROCFLOW_SRV_0001` | `C_SalesOrderFulfillmentIssueQ`| Delivery creation and goods issue timestamps |
  | 3PL POD Delivery Stamp | Supabase | `external_pod_data` | `pod_records` | `delivery_timestamp` (proving delivery was within SLA window) |
  | Recovery Output | Supabase | `external_recovery_queue` | `recovery_packages` | `package_id`, `deduction_ref`, `status` ('GENERATED'), `evidence_attachment` |

### S6: Pricing Chargeback (Invalid, $18,400) — Crestline Grocery
* **Verdict**: `INVALID` -> Generate Recovery Package citing contract clause.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Invoiced Item Prices | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentItemFs` | `Material`, `BillingQuantity`, `NetAmount`, `NetPrice` |
  | Active Pricing Record | SAP OData | `ZSD_PRICING_CONDITIONRECORD_SRV_0001`| `PricingConditionRecord` | `ConditionType`, `ConditionRateValue` (list price) |
  | Pricing Contract | Supabase | `external_tpm_promotions` | `contracts` | `contract_id`, `customer_id`, `sku`, `price` (verifies invoice billed correctly) |

### S7: Promo Overclaim ($15,900) — Harbor Foods
* **Verdict**: `PARTIAL` -> Under Option 1 Ledger rule, recover the $15,900 overclaim in full.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Billing Document Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument`, `SoldToParty` |
  | Approved TPM Accrual | SAP OData | `ZUI_ACCRUALS_MANAGE_0001` | `PeriodicAmounts` | `AccrualObject`, `ActualAccrualItemType` (limit value, e.g., $10,000) |
  | Claimed Allowance | Supabase | `external_ocr_remittances` | `remittance_lines` | `amount` ($25,900, showing $15,900 overclaim above accrual) |

### S8: Duplicate Deduction ($11,500) — Harbor Foods
* **Verdict**: `INVALID` -> Generate Recovery Package with duplicate-detection proof.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Billing Document Header | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | `BillingDocument`, `SoldToParty` |
  | Existing Credit Memo | SAP OData | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | Check for existing document with `BillingDocumentType` = 'G2' linked to invoice |
  | Dispute Case Resolution | SAP OData | `ZUI_DISPUTECASE_MANAGE_0001`| `DisputeCase` | `DisputeCaseID`, `CaseUUID`, `Status` ('CLOSED_CREDITED') |

---

## 2. David K. — Credit & Collections (Credit Sentinel & Risk Mesh)

### Credit Sentinel Account Re-Underwriting (Harbor Foods)
* **Objective**: Continuously evaluate customer risk profile using internal and external signals.
* **Data Mapping**:
  | Data Field / Object | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | Credit Limit & Risk Class | SAP OData | `ZUI_CREDITACCOUNT_DISPLAY_0001` | `CreditAccountSummary` | `CreditLimitAmount` ($500,000), `CreditRiskClass` ('A'), `CreditRiskClassName` |
  | Current Credit Exposure | SAP OData | `ZUI_CREDITEXPOSURE_DISPLAY_0001`| `CreditExposure` | `StaticCreditExposureAmount`, `DynamicCreditExposureAmount` |
  | Days Sales Outstanding (DSO) | SAP OData | `ZUI_CREDITACCOUNT_DISPLAY_0001` | `CreditAccountSummary` | `DaysSalesOutstanding` (32 -> 51 days drift) |
  | Active Disputes Volume | SAP OData | `ZUI_DISPUTECASE_MANAGE_0001`| `DisputeCase` | Count of open dispute cases for customer |
  | External Credit Bureau Alert| Supabase | `external_credit_bureau` | `bureau_alerts` | `alert_id`, `customer_id`, `alert_type` ('TAX_LIEN'), `details` |

### Multi-Criteria Partial-Hold Arbitration (Blocked $640K Order)
* **Objective**: Evaluate blocked order against 6 criteria to calculate release ratio.
* **Data Mapping**:
  | Weighted Criterion | Source | Service / Table | Entity Set / Column | Field Details / Notes |
  |---|---|---|---|---|
  | 1. Order vs. Limit (20%) | SAP OData | `ZAPI_SALES_ORDER_SRV_0001` | `A_SalesOrder` | Compare `TotalNetAmount` ($640,000) with `CreditLimitAmount` |
  | 2. Customer Segment (15%) | Supabase | `external_customer_master`| `customers` | `segment` ('Foodservice Distributor'), `strategic_value` |
  | 3. DSO / Payment Drift (20%)| SAP OData | `ZUI_CREDITACCOUNT_DISPLAY_0001` | `CreditAccountSummary` | `DaysSalesOutstanding` (from 32 to 51) |
  | 4. Order Profit Margin (15%) | SAP OData | `ZAPI_SALES_ORDER_SRV_0001` | `A_SalesOrderHeaderPrElement`| `ConditionType` = 'PR00' (price) vs costing to compute 34% margin |
  | 5. Revenue Forecast (15%) | Supabase | `external_customer_master`| `customers` | `revenue_forecast_12mo` (stable forecast) |
  | 6. 6-Month Payment (15%) | Supabase | `external_payment_history`| `payments` | Calculate payment delays over past 6 months |

---

## 3. Legend & Status Codes

* **SAP OData**: ✅ Data resolved and sample retrieved successfully during Phase 1 probe.
* **Supabase**: 🔌 External source representing 3PL POD portal, trade promotions (TPM), credit bureaus, and carrier portal. Structured in the Supabase schema for demo purposes.
* **SAP (No Data / Empty)**: △ Service metadata was resolved successfully, but no records exist in the S/4HANA sandboxed client `100` for default test values. Seeding script will target these.
