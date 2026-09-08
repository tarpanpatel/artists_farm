-- Performance Indexing Migration (ROADMAP.md Phase 3 / Issue #10)
-- Optimizes high-frequency query patterns across multi-tenant hospitality tables

-- 1. Guests: room availability and overlap lookups
ALTER TABLE guests ADD INDEX idx_guests_room_lookup (property_id, room_id, status, checkin_date, expected_checkout);

-- 2. Property Modules: module enablement checks
ALTER TABLE property_modules ADD INDEX idx_module_slug_enabled (module_slug, is_enabled);

-- 3. Service Requests: dashboard and status filtering
ALTER TABLE service_requests ADD INDEX idx_svc_req_prop_status_created (property_id, status, created_at);

-- 4. Service Requests: room-specific request filtering
ALTER TABLE service_requests ADD INDEX idx_svc_req_room (property_id, room_id);

-- 5. Billing Receipts: chronological financial reports
ALTER TABLE billing_receipts ADD INDEX idx_receipts_prop_created (property_id, created_at);

-- 6. Financial Ledger: monthly ledger range queries (BETWEEN occurred_at)
ALTER TABLE financial_ledger ADD INDEX idx_ledger_prop_occurred (property_id, occurred_at);

-- 7. Financial Ledger: source entity lookup scoped to property
ALTER TABLE financial_ledger ADD INDEX idx_ledger_prop_source (property_id, source_type, source_id);
