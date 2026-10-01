/*
# Create sync_transactions table for offline-first cloud sync

1. New Tables
- `sync_transactions`: generic cloud-sync log for the POS app.
  - `id` (text, primary key) — matches the local IndexedDB row id (uuid string)
  - `table_name` (text, not null) — which local table this row belongs to (customers, debts, invoices, etc.)
  - `row_id` (text, not null) — the local row's id field
  - `operation` (text, not null) — 'insert' | 'update' | 'delete'
  - `payload` (jsonb, not null) — full row data as JSON for insert/update, or null for delete
  - `device_id` (text) — optional identifier for the originating device
  - `created_at` (timestamptz, default now()) — server timestamp

2. Indexes
- Index on `table_name` for filtering by table
- Index on `row_id` for looking up specific rows
- Index on `created_at` for ordering sync pulls

3. Security
- Enable RLS on `sync_transactions`.
- This is a single-tenant app with no Supabase auth sign-in screen — all access is via the anon key.
- Allow anon + authenticated full CRUD (the data is intentionally shared across devices for sync).
*/

CREATE TABLE IF NOT EXISTS sync_transactions (
  id text PRIMARY KEY,
  table_name text NOT NULL,
  row_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  payload jsonb,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_transactions_table_name ON sync_transactions(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_transactions_row_id ON sync_transactions(row_id);
CREATE INDEX IF NOT EXISTS idx_sync_transactions_created_at ON sync_transactions(created_at);

ALTER TABLE sync_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sync" ON sync_transactions;
CREATE POLICY "anon_select_sync" ON sync_transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sync" ON sync_transactions;
CREATE POLICY "anon_insert_sync" ON sync_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sync" ON sync_transactions;
CREATE POLICY "anon_update_sync" ON sync_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sync" ON sync_transactions;
CREATE POLICY "anon_delete_sync" ON sync_transactions FOR DELETE
  TO anon, authenticated USING (true);
