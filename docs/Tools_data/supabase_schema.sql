-- ============================================================================
-- Supabase Schema Design for O2C Agentic Platform (External/Shadow Data)
-- Release Scope (R1): Closed-Loop Risk Mesh, Deduction Forensics, Credit Sentinel
-- Target: PostgreSQL / Supabase
-- ============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. CUSTOMERS & SYSTEM MASTER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(50) PRIMARY KEY, -- Maps to SAP KUNNR / Business Partner ID (e.g. '1000730')
    customer_name VARCHAR(150) NOT NULL,
    segment VARCHAR(100), -- 'Strategic Retail', 'Foodservice Distributor', 'Club', 'Regional Wholesaler'
    strategic_value VARCHAR(50), -- 'High', 'Medium', 'Low'
    credit_limit NUMERIC(15, 2) DEFAULT 0.00,
    revenue_forecast_12mo NUMERIC(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. 3PL POD (PROOF OF DELIVERY) RECORDS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pod_records (
    pod_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_order_ref VARCHAR(50) NOT NULL, -- Maps to SAP Sales Order
    delivery_ref VARCHAR(50) NOT NULL, -- Maps to SAP Delivery Document
    invoice_ref VARCHAR(50) NOT NULL, -- Maps to SAP Billing Document
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    carrier_name VARCHAR(100),
    delivery_timestamp TIMESTAMP WITH TIME ZONE,
    target_delivery_date DATE,
    shipped_qty INT NOT NULL,
    signed_qty INT NOT NULL,
    discrepancy_note TEXT,
    signed_by VARCHAR(100),
    signature_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pod_invoice ON pod_records(invoice_ref);
CREATE INDEX IF NOT EXISTS idx_pod_delivery ON pod_records(delivery_ref);

-- ----------------------------------------------------------------------------
-- 3. TPM (TRADE PROMOTION MANAGEMENT) & CONTRACTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
    promo_id VARCHAR(50) PRIMARY KEY, -- TPM Promotion Agreement ID
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    sku VARCHAR(100) NOT NULL,
    promo_rate NUMERIC(10, 2) NOT NULL, -- Discount per case or total budget
    accrual_cap NUMERIC(15, 2) DEFAULT 0.00, -- Maximum approved accrual budget
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    promo_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
    contract_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    pricing_model TEXT,
    otif_threshold NUMERIC(5, 2) DEFAULT 98.00, -- e.g. 98% required for On-Time In-Full
    fine_percentage NUMERIC(5, 2) DEFAULT 0.00, -- compliance fine % of invoice value if breached
    pricing_terms JSONB, -- stores SKU to price mapping: {"SKU_A": 12.50, "SKU_B": 15.00}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. CARRIER DAMAGE REPORTS & EVIDENCE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carrier_reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_ref VARCHAR(50) NOT NULL,
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    carrier_name VARCHAR(100),
    damage_description TEXT,
    damaged_qty INT NOT NULL,
    report_status VARCHAR(50) DEFAULT 'SUBMITTED', -- 'SUBMITTED', 'VERIFIED', 'REJECTED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS damage_photos (
    photo_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES carrier_reports(report_id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. CREDIT BUREAU ALERTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bureau_alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    alert_type VARCHAR(100) NOT NULL, -- 'TAX_LIEN', 'BANKRUPTCY', 'CREDIT_SCORE_DROP'
    severity VARCHAR(50) NOT NULL, -- 'CRITICAL', 'WARNING', 'INFO'
    details TEXT,
    alert_date DATE NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 6. OCR REMITTANCES (CUSTOMER DEDUCTION REMITTANCES INGESTED)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS remittance_headers (
    remittance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    remittance_date DATE NOT NULL,
    payment_reference VARCHAR(100),
    total_amount_paid NUMERIC(15, 2) NOT NULL,
    total_deductions NUMERIC(15, 2) DEFAULT 0.00,
    ocr_confidence NUMERIC(5, 2), -- Accuracy confidence from ingestion engine
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS remittance_lines (
    line_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remittance_id UUID REFERENCES remittance_headers(remittance_id) ON DELETE CASCADE,
    invoice_ref VARCHAR(50) NOT NULL, -- Original invoice being settled
    deducted_amount NUMERIC(15, 2) NOT NULL,
    reason_code_raw VARCHAR(50), -- Customer's native code (e.g., '01' for damage, '99' for shortage)
    reason_code_mapped VARCHAR(100), -- Mapped category (e.g. 'SHORTAGE', 'DAMAGED_PRODUCT', 'PROMO_ERROR')
    disputed_sku VARCHAR(100),
    disputed_qty INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 7. THE 20-LINE DEDUCTION WORKLIST (MAYA R. WORKLIST)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deductions_backlog (
    deduction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    line_ref UUID REFERENCES remittance_lines(line_id) ON DELETE SET NULL,
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    invoice_ref VARCHAR(50) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    scenario_type VARCHAR(50) NOT NULL, -- 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'
    verdict VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'VALID', 'INVALID', 'PARTIAL'
    confidence NUMERIC(5, 2) DEFAULT 0.00,
    explanation TEXT,
    assigned_analyst VARCHAR(100),
    status VARCHAR(50) DEFAULT 'OPEN', -- 'OPEN', 'ROUTED', 'RECOVERING', 'RESOLVED'
    gaming_pattern_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deductions_customer ON deductions_backlog(customer_id);
CREATE INDEX IF NOT EXISTS idx_deductions_verdict ON deductions_backlog(verdict);

-- ----------------------------------------------------------------------------
-- 8. ACTION STAGING QUEUES (BILLING & RECOVERY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deduction_id UUID REFERENCES deductions_backlog(deduction_id),
    invoice_ref VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'CREDIT_MEMO', 'CREDIT_AND_REBILL', 'WRITE_OFF'
    amount NUMERIC(15, 2) NOT NULL,
    gl_code VARCHAR(50), -- General Ledger code mapping
    re_bill_amount NUMERIC(15, 2) DEFAULT 0.00,
    re_bill_unit_price NUMERIC(10, 2) DEFAULT 0.00,
    supporting_evidence_urls TEXT[], -- Array of evidence URLs
    status VARCHAR(50) DEFAULT 'DRAFT', -- 'DRAFT', 'APPROVED', 'SENT_TO_SAP', 'CONFIRMED'
    audit_id VARCHAR(100), -- Correlates with immutable log
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_packages (
    package_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deduction_id UUID REFERENCES deductions_backlog(deduction_id),
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    invoice_ref VARCHAR(50) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    correspondence_letter TEXT, -- Automated template correspondence
    evidence_package_json JSONB, -- Collection of metadata proofs (POD date, contract clauses)
    status VARCHAR(50) DEFAULT 'GENERATED', -- 'GENERATED', 'SUBMITTED_TO_PORTAL', 'PAID', 'ABANDONED'
    follow_up_cadence_count INT DEFAULT 0,
    next_follow_up_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 9. CREDIT SENTINEL ARBITRATIONS (DAVID K. SCORING ENGINE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_decisions (
    decision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    blocked_order_ref VARCHAR(50) NOT NULL,
    order_amount NUMERIC(15, 2) NOT NULL,
    credit_limit_amount NUMERIC(15, 2) NOT NULL,
    dso_drift_days INT NOT NULL, -- DSO days (e.g. 51)
    margin_percentage NUMERIC(5, 2) NOT NULL, -- Order profit margin (e.g. 34.00)
    customer_strategic_segment VARCHAR(100) NOT NULL,
    composite_release_score NUMERIC(5, 2) NOT NULL, -- 0-100 score (e.g. 51.25)
    release_ratio NUMERIC(5, 2) NOT NULL, -- Release percentage (e.g. 55.00)
    released_amount NUMERIC(15, 2) NOT NULL, -- e.g. $352,000
    held_amount NUMERIC(15, 2) NOT NULL, -- e.g. $288,000
    proposed_terms VARCHAR(100), -- e.g. '2/10 Net-30, 25% Deposit'
    decision_verdict VARCHAR(50) DEFAULT 'PROPOSED', -- 'PROPOSED', 'APPROVED', 'OVERRIDDEN', 'REJECTED'
    arbitrator_user VARCHAR(100), -- The HitL user (e.g. 'david_k')
    negotiation_log JSONB, -- Negotiation details between Credit & Sales agents
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 10. HISTORICAL PAYMENTS & DSO ENGINE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(50) REFERENCES customers(customer_id),
    invoice_ref VARCHAR(50) NOT NULL,
    invoice_amount NUMERIC(15, 2) NOT NULL,
    invoice_date DATE NOT NULL,
    payment_date DATE NOT NULL,
    days_to_pay INT NOT NULL, -- payment_date - invoice_date
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 11. SHARED IMMUTABLE AUDIT / TRACEABILITY LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS immutable_audit_log (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type VARCHAR(100) NOT NULL, -- 'DEDUCTION_VERDICT', 'CREDIT_ARBITRATION', 'SAP_STAGE_WRITE'
    ref_id VARCHAR(100) NOT NULL, -- ID of the related object (deduction_id, decision_id)
    payload JSONB NOT NULL, -- Full explanation, confidence, weights, and decision details
    operator_user VARCHAR(100) NOT NULL, -- User/Agent executing the change
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
