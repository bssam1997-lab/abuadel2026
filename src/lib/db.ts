// ============================================================
// نظام نقطة شحن أبو عادل — طبقة قاعدة البيانات المحلية
// LocalStorage-based offline database (no external services)
// ============================================================

// كل الجداول في النظام
export type TableName =
  | 'app_users'
  | 'customers'
  | 'devices'
  | 'products'
  | 'suppliers'
  | 'invoices'
  | 'invoice_items'
  | 'debts'
  | 'debt_payments'
  | 'partners'
  | 'partner_ledger'
  | 'partner_savings'
  | 'partner_savings_ledger'
  | 'cash_boxes'
  | 'cash_box_ledger'
  | 'supplier_ledger'
  | 'supplier_invoices'
  | 'supplier_invoice_items'
  | 'inventory_items'
  | 'inventory_moves'
  | 'collectors'
  | 'collector_shifts'
  | 'operation_log'
  | 'settings'
  | 'discount_groups'
  | 'partner_loans'
  | 'device_types'
  | 'accessories';

const STORAGE_PREFIX = 'npa_'; // نقطة شحن أبو عادل

// المفتاح المستخدم لحفظ كل جدول
const tableKey = (t: TableName) => `${STORAGE_PREFIX}${t}`;

// قراءة جدول كامل من LocalStorage
function readTable<T = any>(t: TableName): T[] {
  try {
    const raw = localStorage.getItem(tableKey(t));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// كتابة جدول كامل إلى LocalStorage
function writeTable<T = any>(t: TableName, rows: T[]): void {
  localStorage.setItem(tableKey(t), JSON.stringify(rows));
}

// توليد معرف فريد
export const uid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
};

// الطابع الزمني الحالي
export const now = (): string => new Date().toISOString();

// ============================================================
// العمليات الأساسية (CRUD)
// ============================================================

// جلب كل الصفوف من جدول
export function select<T = any>(table: TableName): T[] {
  return readTable<T>(table);
}

// جلب صفوف مطابقة لشرط
export function selectWhere<T = any>(table: TableName, predicate: (row: T) => boolean): T[] {
  return readTable<T>(table).filter(predicate);
}

// جلب أول صف مطابق
export function first<T = any>(table: TableName, predicate: (row: T) => boolean): T | null {
  const rows = readTable<T>(table);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

// إضافة صف جديد
export function insert<T = any>(table: TableName, row: T & { id?: string }): T & { id: string } {
  const rows = readTable<T>(table);
  const newRow = { ...row, id: row.id || uid() } as T & { id: string };
  rows.push(newRow);
  writeTable(table, rows);
  return newRow;
}

// تحديث صفوف مطابقة
export function update<T = any>(table: TableName, predicate: (row: T) => boolean, patch: Partial<T>): number {
  const rows = readTable<T>(table);
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) {
      rows[i] = { ...rows[i], ...patch };
      count++;
    }
  }
  writeTable(table, rows);
  return count;
}

// تحديث صف واحد بالمعرف
export function updateById<T = any>(table: TableName, id: string, patch: Partial<T>): T | null {
  const rows = readTable<T>(table);
  const idx = rows.findIndex((r: any) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...patch };
  writeTable(table, rows);
  return rows[idx];
}

// حذف صفوف مطابقة
export function remove<T = any>(table: TableName, predicate: (row: T) => boolean): number {
  const rows = readTable<T>(table);
  const filtered = rows.filter((r) => !predicate(r));
  const removed = rows.length - filtered.length;
  writeTable(table, filtered);
  return removed;
}

// حذف صف بالمعرف
export function removeById(table: TableName, id: string): boolean {
  return remove(table, (r: any) => r.id === id) > 0;
}

// ============================================================
// الإعدادات (key-value)
// ============================================================
export function getSetting(key: string, fallback = ''): string {
  const rows = readTable<{ key: string; value: string }>('settings');
  const row = rows.find((r) => r.key === key);
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  const rows = readTable<{ key: string; value: string }>('settings');
  const idx = rows.findIndex((r) => r.key === key);
  if (idx === -1) {
    rows.push({ key, value });
  } else {
    rows[idx].value = value;
  }
  writeTable('settings', rows);
}

// ============================================================
// سجل العمليات (Audit log)
// ============================================================
export function logAction(action: string, entity?: string, entityId?: string, value?: string, before?: any, after?: any, userName?: string): void {
  insert('operation_log', {
    user_name: userName || 'system',
    action,
    entity: entity || null,
    entity_id: entityId || null,
    value: value || null,
    before_state: before || null,
    after_state: after || null,
    created_at: now(),
  });
}

// ============================================================
// التهيئة الأولية (Seed)
// ============================================================
export function initDatabase(): void {
  // الإعدادات الافتراضية
  const defaultSettings: Record<string, string> = {
    debt_lock_pin: '',
    daily_savings_per_partner: '10',
    shop_name: 'نظام نقطة شحن أبو عادل',
    owner_password: '',
    orientation: 'portrait',
  };
  for (const [k, v] of Object.entries(defaultSettings)) {
    if (!getSetting(k)) setSetting(k, v);
  }

  // الصناديق الافتراضية (تم حذف: ديون اليوم، أرباح المشروبات للسحب، حصالة الشركاء)
  const boxes = readTable('cash_boxes');
  if (boxes.length === 0) {
    const defaults = [
      { code: 'charging', name: 'صندوق كاش الشحن', balance: 0 },
      { code: 'drinks', name: 'صندوق كاش المشروبات', balance: 0 },
      { code: 'drinks_profit', name: 'صندوق أرباح المشروبات', balance: 0 },
    ];
    for (const b of defaults) insert('cash_boxes', b);
  }

  // أنواع الأجهزة الافتراضية
  const dt = readTable('device_types');
  if (dt.length === 0) {
    const defaultDevices = [
      { name: 'جوال', default_price: 0, sort: 0 },
      { name: 'كشاف', default_price: 0, sort: 1 },
      { name: 'لمبة شحن', default_price: 0, sort: 2 },
      { name: 'بطارية', default_price: 0, sort: 3 },
      { name: 'سماعة', default_price: 0, sort: 4 },
      { name: 'باور بانك', default_price: 0, sort: 5 },
      { name: 'ساعة', default_price: 0, sort: 6 },
      { name: 'تابلت', default_price: 0, sort: 7 },
      { name: 'أخرى', default_price: 0, sort: 8 },
    ];
    for (const d of defaultDevices) insert('device_types', d);
  }

  // الملحقات الافتراضية
  const acc = readTable('accessories');
  if (acc.length === 0) {
    const defaultAccs = [
      { name: 'بدون ملحقات', price: 0, sort: 0 },
      { name: 'بشاحن', price: 0, sort: 1 },
      { name: 'بوصلة', price: 0, sort: 2 },
      { name: 'رأس شحن فقط', price: 0, sort: 3 },
      { name: 'وصلة مدمجة', price: 0, sort: 4 },
      { name: 'سلك USB', price: 0, sort: 5 },
      { name: 'سماعة', price: 0, sort: 6 },
      { name: 'باور بانك', price: 0, sort: 7 },
    ];
    for (const a of defaultAccs) insert('accessories', a);
  }
}

// ============================================================
// النسخ الاحتياطي والاستعادة (JSON)
// ============================================================
const ALL_TABLES: TableName[] = [
  'app_users', 'customers', 'devices', 'products', 'suppliers', 'invoices',
  'invoice_items', 'debts', 'debt_payments', 'partners', 'partner_ledger',
  'partner_savings', 'partner_savings_ledger', 'cash_boxes', 'cash_box_ledger',
  'supplier_ledger', 'supplier_invoices', 'supplier_invoice_items', 'inventory_items', 'inventory_moves', 'collectors',
  'collector_shifts', 'operation_log', 'settings', 'discount_groups', 'partner_loans',
  'device_types', 'accessories',
];

// تصدير كل البيانات إلى كائن JSON
export function exportAll(): Record<string, any[]> {
  const dump: Record<string, any[]> = {};
  for (const t of ALL_TABLES) {
    dump[t] = readTable(t);
  }
  return dump;
}

// استيراد البيانات من كائن JSON (upsert حسب id)
export function importAll(data: Record<string, any[]>): void {
  for (const t of ALL_TABLES) {
    if (data[t] && Array.isArray(data[t])) {
      writeTable(t as TableName, data[t]);
    }
  }
}

// مسح كل البيانات (للاستعادة الكاملة)
export function clearAll(): void {
  for (const t of ALL_TABLES) {
    writeTable(t, []);
  }
  initDatabase();
}
