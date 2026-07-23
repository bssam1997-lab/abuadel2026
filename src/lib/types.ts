export type AppUser = {
  id: string;
  name: string;
  role: 'owner' | 'employee';
  pin: string | null;
  is_active: boolean;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  credit_limit: number;
  trust_limit: number;
  drinks_credit_limit: number;
  debt_locked: boolean;
  is_vip: boolean;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  balance: number;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  cost_price: number;
  sell_price: number;
  quantity: number;
  low_stock_threshold: number;
  supplier_id: string | null;
  icon: string | null;
  discount_group_id: string | null;
  created_at: string;
};

export type DiscountGroup = {
  id: string;
  name: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  active: boolean;
  created_at: string;
};

export type DeviceStatus = 'charging' | 'delivered' | 'cancelled';

export type Device = {
  id: string;
  customer_id: string | null;
  device_type: string;
  device_number: string | null;
  accessory: string | null;
  accessories: string | null; // JSON array of accessories linked to this device
  charge_level: number;
  checkout_charge_level: number | null;
  check_in_at: string;
  check_out_at: string | null;
  price: number;
  paid: boolean;
  status: DeviceStatus;
  cancel_reason: string | null;
  collector_id: string | null;
  invoice_id: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  customer_id: string | null;
  subtotal: number;
  discount_type: 'none' | 'fixed' | 'percentage';
  discount_value: number;
  discount_amount: number;
  total: number;
  paid: boolean;
  paid_amount: number;
  profit: number;
  realized_profit: number;
  collector_id: string | null;
  note: string | null;
  reversed: boolean;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  line_total: number;
};

export type Debt = {
  id: string;
  customer_id: string;
  type: 'charging' | 'drinks' | 'manual' | 'deposit' | 'withdrawal' | 'settlement' | 'trust';
  description: string | null;
  debit: number;
  credit: number;
  balance_after: number;
  related_invoice_id: string | null;
  related_device_id: string | null;
  reversed: boolean;
  created_at: string;
};

export type Partner = {
  id: string;
  name: string;
  balance: number;
  drinks_profit_balance: number;
  created_at: string;
};

export type PartnerLoan = {
  id: string;
  borrower_id: string;
  lender_id: string;
  amount: number;
  repaid: number;
  settled: boolean;
  note: string | null;
  created_at: string;
};

export type PartnerLedger = {
  id: string;
  partner_id: string;
  type: 'profit' | 'withdrawal' | 'expense';
  amount: number;
  note: string | null;
  created_at: string;
};

export type CashBox = {
  id: string;
  code: 'charging' | 'drinks' | 'drinks_profit';
  name: string;
  balance: number;
};

export type DeviceType = {
  id: string;
  name: string;
  default_price: number;
  sort: number;
  created_at: string;
};

export type Accessory = {
  id: string;
  name: string;
  price: number;
  sort: number;
  created_at: string;
};

export type Collector = {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

export type CollectorShift = {
  id: string;
  collector_id: string;
  check_in_at: string;
  check_out_at: string | null;
  hours: number;
  note: string | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  cost_price: number;
  sell_price: number;
  low_stock_threshold: number;
  supplier_id: string | null;
  icon: string | null;
  discount_group_id: string | null;
  created_at: string;
};

export type OperationLog = {
  id: string;
  user_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  value: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
};
