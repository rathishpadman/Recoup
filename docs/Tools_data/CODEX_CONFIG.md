# Codex O2C Solution Configuration & Integration Sheet

This document lists the configuration parameters, detailed field definitions, integration scripts, and database schemas for both SAP OData and the Supabase 3rd-party tables required in the **Codex O2C Cockpit** environment.

---

## 1. SAP Customer & Document Status

Use these mappings in your demo database to ensure live S/4HANA OData queries resolve correctly:

| Journey Customer Name | SAP Customer ID (Sold-To) | SAP Name | Strategic Segment | Credit Limit in SAP |
|---|---|---|---|---|
| **Crestline Grocery** | `USCU_L10` | Crestline Grocery | Strategic Retail | `$10,000,000.00` |
| **Harbor Foods** | `USCU_S04` | Fit Cycles (Harbor) | Foodservice Distributor | `$500,000.00` (CMS Segment `1000`) |
| **ValuMart Club** | `USCU_S07` | ValuMart Club | Club Channel | `$1,500,000.00` |
| **Greenleaf Naturals** | `USCU_S03` | Greenleaf Naturals | Regional Wholesaler | `$50,000.00` |

---

## 2. SAP Billing Documents (Invoices)

These invoices exist in SAP client `100` and are linked to the respective customer accounts. Map the 20-line deductions backlog in your database to these invoice numbers so OData queries return live invoice values:

| Deduction Scenario | Customer | SAP Invoice Number | SAP Net Value (USD) | Status in SAP |
|---|---|---|---|---|
| **S1: Damaged Product** | Greenleaf (`USCU_S03`) | `90000002` | `$3,990.00` | Active / Paid (Disputed) |
| **S2: Promo Billing Error** | Crestline (`USCU_L10`) | `90000017` | `$9,600.00` | Active / Paid (Disputed) |
| **S3: Shortage Claim** | Crestline (`USCU_L10`) | `90000000` | `$9,170.00` | Active / Paid (Disputed) |
| **S4: Valid OTIF Fine** | ValuMart (`USCU_S07`) | `90000080` | `$10,780.00` | Active / Paid (Disputed) |
| **S5: Invalid OTIF Fine** | ValuMart (`USCU_S07`) | `90000001` | `$9,380.00` | Active / Paid (Disputed) |
| **S6: Pricing Chargeback** | Crestline (`USCU_L10`) | `90000061` | `$1,695.00` | Active / Paid (Disputed) |
| **S7: Promo Overclaim** | Harbor (`USCU_S04`) | `90000005` | `$13,020.00` | Active / Paid (Disputed) |
| **S8: Duplicate Claim** | Harbor (`USCU_S04`) | `90000005` | `$13,020.00` | Active / Paid (Disputed) |

---

## 3. OData Target Services & Field Definitions

### 3.1 Sales Order Service (`ZAPI_SALES_ORDER_SRV_0001`)

#### Entity Set: `A_SalesOrder` (Header)
* `SalesOrder` (Key, string, length 10): Sales order document number (e.g. `6533`).
* `SalesOrderType` (string, length 4): Document type, standard is `OR`.
* `SalesOrganization` (string, length 4): Sales org code, default is `1710`.
* `DistributionChannel` (string, length 2): Distribution channel, default is `10`.
* `OrganizationDivision` (string, length 2): Division code, default is `00`.
* `SoldToParty` (string, length 10): Customer ID (e.g. `USCU_L10`).
* `TotalNetAmount` (string/decimal): Cumulative order net amount in transaction currency.
* `TotalBlockStatus` (string, length 1): Overall delivery block code.

#### Entity Set: `A_SalesOrderItem` (Items)
* `SalesOrder` (Key, string): Parent sales order document number.
* `SalesOrderItem` (Key, string, length 6): Item line number (e.g. `10`).
* `Material` (string, length 40): SKU identifier, default is `MZ-TG-Y120`.
* `RequestedQuantity` (string/decimal): Requested quantity of pieces.
* `RequestedQuantityUnit` (string, length 3): Unit of measure (e.g. `PC`).
* `NetAmount` (string/decimal): Total line item net value.

---

### 3.2 Billing Factsheet Service (`ZUI_BILLINGDOCUMENTFS_0001`)

#### Entity Set: `C_BillingDocumentFs` (Invoice Header)
* `BillingDocument` (Key, string, length 10): Invoice number (e.g. `90000000`).
* `BillingDocumentType` (string, length 4): Invoice type code.
* `SoldToParty` (string, length 10): Customer ID (e.g. `USCU_L10`).
* `TotalNetAmount` (string/decimal): Net amount of the invoice.
* `CompanyCode` (string, length 4): Company code, default is `1710`.

#### Entity Set: `C_BillingDocumentItemFs` (Invoice Items)
* `BillingDocument` (Key, string): Parent invoice number.
* `BillingDocumentItem` (Key, string, length 6): Item line number (e.g. `10`).
* `Material` (string, length 40): Material/SKU ID.
* `BillingQuantity` (string/decimal): Billed quantity.
* `NetAmount` (string/decimal): Net value of the line item.

---

### 3.3 Credit Account Display Service (`ZUI_CREDITACCOUNT_DISPLAY_0001`)

#### Entity Set: `CreditAccountSummary` (Customer Credit Info)
* `BusinessPartner` (Key, string, length 10): BP number (e.g. `USCU_S04`).
* `CreditSegment` (Key, string, length 4): Credit segment, default segment is `0000`, CMS segment is `1000`.
* `CreditLimitAmount` (string/decimal): Customer's credit limit cap (e.g. `500000.00`).
* `StaticCreditExposureAmount` (string/decimal): Static utilization amount.
* `DynamicCreditExposureAmount` (string/decimal): Live credit exposure amount.
* `CreditRiskClass` (string, length 3): Risk category classification (e.g. `A`).
* `DaysSalesOutstanding` (string, length 3): live DSO metric days (e.g. `51`).

---

## 4. TypeScript OData Client Script

This TypeScript class (utilizing `axios`) implements SAP OData authentication, CSRF token handling, cookie state preservation, and transactional CRUD writes (Deep Inserts).

```typescript
import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface SalesOrderItem {
  SalesOrderItem: string;
  Material: string;
  RequestedQuantity: string;
}

export interface SalesOrderPayload {
  SalesOrderType: string;
  SalesOrganization: string;
  DistributionChannel: string;
  OrganizationDivision: string;
  SoldToParty: string;
  to_Item: SalesOrderItem[];
}

export interface SapClientConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  client: string;
}

export class SapODataClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private sapClient: string;

  constructor(config: SapClientConfig) {
    this.baseUrl = `https://${config.host}:${config.port}`;
    this.sapClient = config.client;
    this.client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: config.user,
        password: config.pass
      },
      params: {
        'sap-client': this.sapClient
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Fetches metadata and returns session cookies + CSRF token required for POST actions.
   */
  private async getSecurityContext(serviceUrl: string): Promise<{ csrfToken: string; cookies: string[] }> {
    const fullUrl = serviceUrl.startsWith('http') ? serviceUrl : `${this.baseUrl}${serviceUrl}`;
    
    const response = await this.client.get(`${fullUrl}/$metadata`, {
      headers: {
        'X-CSRF-Token': 'Fetch'
      }
    });

    const csrfToken = response.headers['x-csrf-token'];
    const cookies = response.headers['set-cookie'] || [];

    if (!csrfToken) {
      throw new Error('Failed to fetch CSRF token from SAP Gateway.');
    }

    return { csrfToken, cookies };
  }

  /**
   * Performs an OData GET query.
   */
  public async get<T>(serviceUrl: string, entitySet: string, params: Record<string, string> = {}): Promise<T[]> {
    const fullUrl = serviceUrl.startsWith('http') ? serviceUrl : `${this.baseUrl}${serviceUrl}`;
    const response = await this.client.get<{ d: { results: T[] } }>(`${fullUrl}/${entitySet}`, {
      params: {
        ...params,
        '$format': 'json',
        'sap-client': this.sapClient
      }
    });
    return response.data.d.results;
  }

  /**
   * Creates a Sales Order in SAP via OData Deep Insert.
   */
  public async createSalesOrder(serviceUrl: string, payload: SalesOrderPayload): Promise<any> {
    const fullUrl = serviceUrl.startsWith('http') ? serviceUrl : `${this.baseUrl}${serviceUrl}`;
    
    // Fetch CSRF and session cookies
    const { csrfToken, cookies } = await this.getSecurityContext(serviceUrl);

    // Perform Deep Insert
    const response = await this.client.post<{ d: any }>(
      `${fullUrl}/A_SalesOrder`,
      payload,
      {
        headers: {
          'X-CSRF-Token': csrfToken,
          'Cookie': cookies.join('; ')
        },
        params: {
          'sap-client': this.sapClient
        }
      }
    );

    return response.data.d;
  }
}
```

---

## 5. Supabase 3rd-Party Schema & Tables

These tables reside in your **Supabase** instance to track the 3rd-party logistics (3PL) data, pricing contracts, trade promotions, OCR remittances, and agent action queues:

### 5.1 Customer Metadata & Payments
* `customers`: Additional analytical attributes for relationship classification:
  * `customer_id` (PK, varchar): Maps to SAP Customer ID (e.g. `USCU_L10`).
  * `segment` (varchar): CPG channel type (`Strategic Retail`, `Foodservice Distributor`, `Club`, `Regional Wholesaler`).
  * `strategic_value` (varchar): High/Medium/Low priority.
  * `revenue_forecast_12mo` (numeric): Annual forecast budget.
* `payments`: Historical invoice clearing ledger used to compute average DSO drifts:
  * `payment_id` (PK, uuid): Unique record key.
  * `customer_id` (FK -> customers): Business Partner.
  * `invoice_ref` (varchar): Invoice cleared (e.g. `90000036`).
  * `invoice_amount` (numeric): Value of invoice.
  * `days_to_pay` (integer): Cleared date minus invoice date (used to calculate average DSO drifts).

### 5.2 WMS Logistical proof & Damages
* `pod_records`: 3PL Proof of Delivery tracking database:
  * `pod_id` (PK, uuid): Delivery manifest ID.
  * `invoice_ref` (varchar): Cleared billing document (links to SAP `BillingDocument`).
  * `shipped_qty` (integer): Quantity shipped in cases.
  * `signed_qty` (integer): Quantity signed by receiver.
  * `discrepancy_note` (text): Logistical shortage notes (e.g., "12 cases damaged").
  * `delivery_timestamp` (timestamp): Actual arrival date/time.
* `carrier_reports` / `damage_photos`: Carrier damage verification logs (used for S1 validation):
  * `damaged_qty` (integer): Units verified damaged.
  * `carrier_name` (varchar): Logistics handler (e.g., `FedEx Freight`).
  * `photo_url` (text): Storage URL of damage proof.

### 5.3 Promotions & Compliance Contracts
* `promotions`: Trade Promotion Management (TPM) allowances and budgets (used for S2 & S7):
  * `promo_id` (PK, varchar): TPM agreement code.
  * `promo_rate` (numeric): Case allowance discount.
  * `accrual_cap` (numeric): Promotion total budget cap.
* `contracts`: Compliance SLAs and pricing agreements (used for S4, S5 & S6):
  * `otif_threshold` (numeric): On-Time In-Full required rate (default `98.00%`).
  * `fine_percentage` (numeric): SLA penalty percentage.
  * `pricing_terms` (jsonb): SKU-to-contract-price map.

### 5.4 OCR Remittances & Deductions Backlog
* `remittance_headers` / `remittance_lines`: Raw ingested remittance documents parsed from PDFs:
  * `total_deductions` (numeric): Claimed deduction total.
  * `reason_code_raw` (varchar): Retailer's native code (e.g., `DMG01`).
  * `reason_code_mapped` (varchar): Normalized category (`DAMAGED_PRODUCT`, `SHORTAGE`, `PROMO_ERROR`).
* `deductions_backlog`: The central 20-line worklist for Maya R.:
  * `deduction_id` (PK, uuid): Dispute ID.
  * `invoice_ref` (varchar): Invoice contested.
  * `amount` (numeric): Value deducted.
  * `scenario_type` (varchar): Journey step category (`S1` to `S8`).
  * `verdict` (varchar): Classification (`PENDING`, `VALID`, `INVALID`, `PARTIAL`).
  * `gaming_pattern_flag` (boolean): Flag for repeat invalid claims.

### 5.5 Staging Queues & Audit Logs
* `billing_requests`: Action queue for VALID adjustments (credit/re-bill):
  * `type` (varchar): Action type (`CREDIT_MEMO`, `CREDIT_AND_REBILL`).
  * `amount` (numeric) / `re_bill_amount` (numeric).
  * `status` (varchar): Stage state (`DRAFT`, `SENT_TO_SAP`).
* `recovery_packages`: Action queue for INVALID claims:
  * `correspondence_letter` (text): Autogenerated dispute denial email template.
  * `status` (varchar): Stage state (`GENERATED`, `SUBMITTED_TO_PORTAL`).
* `credit_decisions`: Credit Sentinel decision log (David K.):
  * `blocked_order_ref` (varchar): Created blocked sales order number (e.g., `6534`).
  * `composite_release_score` (numeric): Derived release score.
  * `release_ratio` (numeric) / `released_amount` (numeric) / `held_amount` (numeric).
  * `proposed_terms` (varchar): Custom term overrides.
  * `decision_verdict` (varchar): Decision state (`PROPOSED`, `APPROVED`).
* `immutable_audit_log`: Audit trail database preserving verdicts and parameters:
  * `action_type` (varchar): `DEDUCTION_VERDICT` or `CREDIT_ARBITRATION`.
  * `payload` (jsonb): Audit details (criteria scores, weights, confidence).
  * `operator_user` (varchar): Executed agent/user.
