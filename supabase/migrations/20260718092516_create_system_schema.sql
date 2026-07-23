/*
# نظام نقطة شحن أبو عادل — Schema (Core tables)

Single-tenant shop management system. No Supabase auth sign-in screen; uses an app-level
user/permission system in `app_users`. All tables are shared shop data, so policies allow
anon + authenticated full CRUD (intentional public/shared, documented).

Tables: app_users, customers, suppliers, products, devices, invoices, invoice_items,
debts, debt_payments, partners, partner_ledger, partner_savings, partner_savings_ledger,
cash_boxes, cash_box_ledger, supplier_ledger, inventory_items, inventory_moves,
collectors, collector_shifts, operation_log, settings.
*/

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  pin text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  notes text,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0,
  debt_locked boolean NOT NULL DEFAULT false,
  is_vip boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  notes text,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sell_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold numeric(12,2) NOT NULL DEFAULT 5,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  device_type text NOT NULL,
  device_number text,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  price numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'charging',
  cancel_reason text,
  collector_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  invoice_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  total numeric(12,2) NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  profit numeric(12,2) NOT NULL DEFAULT 0,
  collector_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  qty numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'charging',
  description text,
  debit numeric(12,2) NOT NULL DEFAULT 0,
  credit numeric(12,2) NOT NULL DEFAULT 0,
  balance_after numeric(12,2) NOT NULL DEFAULT 0,
  related_invoice_id uuid,
  related_device_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  charging_part numeric(12,2) NOT NULL DEFAULT 0,
  drinks_part numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_savings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 10,
  for_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (partner_id, for_date)
);

CREATE TABLE IF NOT EXISTS partner_savings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cash_box_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_box_id uuid NOT NULL REFERENCES cash_boxes(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  reason text,
  related_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sell_price numeric(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold numeric(12,2) NOT NULL DEFAULT 5,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL,
  qty numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  hours numeric(8,2) NOT NULL DEFAULT 0,
  note text
);

CREATE TABLE IF NOT EXISTS operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  value text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_created ON devices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_debts_created ON debts(created_at);
CREATE INDEX IF NOT EXISTS idx_partner_ledger_partner ON partner_ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_cash_box_ledger_box ON cash_box_ledger(cash_box_id);
CREATE INDEX IF NOT EXISTS idx_inventory_moves_item ON inventory_moves(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_created ON operation_log(created_at);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_savings ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_savings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_box_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'app_users','customers','devices','products','suppliers','invoices','invoice_items',
    'debts','debt_payments','partners','partner_ledger','partner_savings','partner_savings_ledger',
    'cash_boxes','cash_box_ledger','supplier_ledger','inventory_items','inventory_moves',
    'collectors','collector_shifts','operation_log','settings'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true)', t, t);
  END LOOP;
END $$;

INSERT INTO cash_boxes (code, name, balance)
VALUES
  ('charging', 'صندوق كاش الشحن', 0),
  ('drinks', 'صندوق كاش المشروبات', 0),
  ('daily_debts', 'صندوق ديون اليوم', 0)
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('debt_lock_pin', ''),
  ('daily_savings_per_partner', '10'),
  ('shop_name', 'نظام نقطة شحن أبو عادل')
ON CONFLICT (key) DO NOTHING;