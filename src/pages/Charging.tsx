import { useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging, Plus, Smartphone, LogOut, Pencil, Ban, Check, Search,
  Plug, Battery, Undo2, X, Trash2, ShoppingCart, Settings2, UserPlus,
  Package, Headphones, AlertTriangle, ArrowUp, ArrowDown, Link2, Users,
  ArrowLeftRight,
} from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { useCustomers } from '../lib/hooks';
import { money, fmtTime, fmtDateTime, todayISO, fmtDate } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState, Stat } from '../components/ui';
import type { Device, DeviceType, Accessory } from '../lib/types';

// ============================================================
// ثوابت مساعدة
// ============================================================
const CHARGE_CYCLE = [0, 25, 50, 75, 100];
const CHARGE_LEVELS: { value: number; label: string; btnClass: string; iconClass: string }[] = [
  { value: 0, label: '0%', btnClass: 'bg-rose-600 text-white', iconClass: 'text-rose-500' },
  { value: 25, label: '25%', btnClass: 'bg-amber-600 text-white', iconClass: 'text-amber-500' },
  { value: 50, label: '50%', btnClass: 'bg-sky-600 text-white', iconClass: 'text-sky-500' },
  { value: 75, label: '75%', btnClass: 'bg-sky-600 text-white', iconClass: 'text-sky-500' },
  { value: 100, label: '100%', btnClass: 'bg-emerald-600 text-white', iconClass: 'text-emerald-500' },
];

function customerName(id: string | null): string {
  if (!id) return '—';
  const c = db.first<any>('customers', (r) => r.id === id);
  return c?.name || '—';
}

// ============================================================
// عنصر في سلة الشحن (POS cart line) — جهاز مع ملحقاته المرتبطة
// ============================================================
type CartLine = {
  key: string;
  deviceType: string;
  accessories: string[];
  price: number;
  chargeLevel: number;
};

// ============================================================
// مكوّن البحث الذكي عن الزبون (Autocomplete)
// ============================================================
function CustomerSearch({
  customers,
  selectedId,
  onSelect,
  onClear,
}: {
  customers: any[];
  selectedId: string;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = customers.find((c) => c.id === selectedId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) => (c.name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [query, customers]);

  const showAdd = query.trim().length > 0 && !filtered.some((c) => (c.name || '').toLowerCase() === query.trim().toLowerCase());

  if (selected) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 dark:bg-emerald-900/30 dark:border-emerald-700">
        <UserPlus size={18} className="text-emerald-600 dark:text-emerald-400" />
        <span className="font-bold text-emerald-800 dark:text-emerald-200 flex-1 truncate">{selected.name}</span>
        <button onClick={onClear} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800/50" title="تغيير">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className="input pr-10"
          placeholder="ابحث عن الزبون بالاسم..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </div>
      {open && (filtered.length > 0 || showAdd) && (
        <div className="absolute z-[60] mt-1 w-full card p-1 max-h-60 overflow-y-auto shadow-lg">
          {filtered.map((c) => (
            <button
              key={c.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(c.id, c.name); setQuery(''); setOpen(false); }}
              className="w-full text-right px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between"
            >
              <span>{c.name}</span>
              {c.phone && <span className="text-xs text-slate-400">{c.phone}</span>}
            </button>
          ))}
          {showAdd && (
            <div className="px-2 pt-1">
              <button
                onMouseDown={(e) => { e.preventDefault(); onSelect('__new__', query.trim()); setQuery(''); setOpen(false); }}
                className="w-full btn-success text-sm"
              >
                <UserPlus size={16} /> إضافة «{query.trim()}» كزبون
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// شاشة إدارة أنواع الأجهزة (Device Types Management)
// ============================================================
function DeviceTypesManager({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { push } = useToast();
  const { requireOwnerPassword } = useStore();
  const [rows, setRows] = useState<DeviceType[]>([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const load = () => {
    setRows(db.select<DeviceType>('device_types').sort((a, b) => (a.sort || 0) - (b.sort || 0)));
  };

  useEffect(() => { if (open) load(); }, [open]);

  const addRow = () => {
    if (!newName.trim()) { push('أدخل اسم الجهاز', 'error'); return; }
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort || 0), -1);
    db.insert('device_types', { name: newName.trim(), default_price: Number(newPrice) || 0, sort: maxSort + 1, created_at: db.now() });
    setNewName(''); setNewPrice('');
    load(); onChanged();
    push('تمت إضافة نوع الجهاز', 'success');
  };

  const updateRow = (id: string, patch: Partial<DeviceType>) => {
    db.updateById('device_types', id, patch);
    load(); onChanged();
  };

  const deleteRow = (r: DeviceType) => {
    requireOwnerPassword(() => {
      db.removeById('device_types', r.id);
      load(); onChanged();
      push('تم حذف نوع الجهاز', 'info');
    });
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const a = rows[idx]; const b = rows[next];
    db.updateById('device_types', a.id, { sort: b.sort });
    db.updateById('device_types', b.id, { sort: a.sort });
    load(); onChanged();
  };

  return (
    <Modal open={open} onClose={onClose} title="إدارة أنواع الأجهزة" size="lg">
      <div className="space-y-4">
        {/* إضافة جديد */}
        <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="label">اسم الجهاز الجديد</label>
              <input className="input" placeholder="مثال: ساعة ذكية" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="w-32">
              <label className="label">السعر الافتراضي</label>
              <input className="input" type="number" placeholder="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            </div>
            <button onClick={addRow} className="btn-success"><Plus size={18} /> إضافة</button>
          </div>
        </div>

        {/* القائمة */}
        <div className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState icon={<Smartphone size={32} />} title="لا توجد أنواع أجهزة" />
          ) : rows.map((r, idx) => (
            <div key={r.id} className="card p-3 flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveRow(idx, -1)} disabled={idx === 0} className="p-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" title="أعلى">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1} className="p-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" title="أسفل">
                  <ArrowDown size={14} />
                </button>
              </div>
              <Smartphone className="text-sky-500" size={20} />
              <input
                className="input flex-1"
                value={r.name}
                onChange={(e) => updateRow(r.id, { name: e.target.value })}
              />
              <div className="w-28">
                <input
                  className="input"
                  type="number"
                  value={r.default_price || 0}
                  onChange={(e) => updateRow(r.id, { default_price: Number(e.target.value) })}
                />
              </div>
              <button onClick={() => deleteRow(r)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="حذف">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <AlertTriangle size={12} /> التغييرات تُطبق مباشرة على النظام. الحذف يتطلب كلمة مرور المالك.
        </p>
      </div>
    </Modal>
  );
}

// ============================================================
// شاشة إدارة الملحقات (Accessories Management)
// ============================================================
function AccessoriesManager({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { push } = useToast();
  const { requireOwnerPassword } = useStore();
  const [rows, setRows] = useState<Accessory[]>([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const load = () => {
    setRows(db.select<Accessory>('accessories').sort((a, b) => (a.sort || 0) - (b.sort || 0)));
  };

  useEffect(() => { if (open) load(); }, [open]);

  const addRow = () => {
    if (!newName.trim()) { push('أدخل اسم الملحق', 'error'); return; }
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort || 0), -1);
    db.insert('accessories', { name: newName.trim(), price: Number(newPrice) || 0, sort: maxSort + 1, created_at: db.now() });
    setNewName(''); setNewPrice('');
    load(); onChanged();
    push('تمت إضافة الملحق', 'success');
  };

  const updateRow = (id: string, patch: Partial<Accessory>) => {
    db.updateById('accessories', id, patch);
    load(); onChanged();
  };

  const deleteRow = (r: Accessory) => {
    requireOwnerPassword(() => {
      db.removeById('accessories', r.id);
      load(); onChanged();
      push('تم حذف الملحق', 'info');
    });
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const a = rows[idx]; const b = rows[next];
    db.updateById('accessories', a.id, { sort: b.sort });
    db.updateById('accessories', b.id, { sort: a.sort });
    load(); onChanged();
  };

  return (
    <Modal open={open} onClose={onClose} title="إدارة الملحقات" size="lg">
      <div className="space-y-4">
        <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="label">اسم الملحق الجديد</label>
              <input className="input" placeholder="مثال: شاحن سريع" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="w-28">
              <label className="label">السعر</label>
              <input className="input" type="number" placeholder="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            </div>
            <button onClick={addRow} className="btn-success"><Plus size={18} /> إضافة</button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState icon={<Plug size={32} />} title="لا توجد ملحقات" />
          ) : rows.map((r, idx) => (
            <div key={r.id} className="card p-3 flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveRow(idx, -1)} disabled={idx === 0} className="p-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" title="أعلى">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1} className="p-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30" title="أسفل">
                  <ArrowDown size={14} />
                </button>
              </div>
              <Plug className="text-violet-500" size={20} />
              <input
                className="input flex-1"
                value={r.name}
                onChange={(e) => updateRow(r.id, { name: e.target.value })}
              />
              <div className="w-28">
                <input
                  className="input"
                  type="number"
                  value={r.price || 0}
                  onChange={(e) => updateRow(r.id, { price: Number(e.target.value) })}
                />
              </div>
              <button onClick={() => deleteRow(r)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="حذف">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <AlertTriangle size={12} /> التغييرات تُطبق مباشرة على النظام. الحذف يتطلب كلمة مرور المالك.
        </p>
      </div>
    </Modal>
  );
}

// ============================================================
// المكوّن الرئيسي
// ============================================================
export default function Charging() {
  const { currentUser, log, requireOwnerPassword } = useStore();
  const { push } = useToast();
  const { customers, refresh: refreshCustomers } = useCustomers();
  const [devices, setDevices] = useState<Device[]>([]);

  // التبويب النشط: charging | delivered
  const [tab, setTab] = useState<'charging' | 'delivered'>('charging');

  // POS fullscreen
  const [posOpen, setPosOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedLineKey, setSelectedLineKey] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customCharge, setCustomCharge] = useState(0);
  const [deviceTypesMgr, setDeviceTypesMgr] = useState(false);
  const [accessoriesMgr, setAccessoriesMgr] = useState(false);

  // تأكيد الاستلام (checkout popup)
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutCustomerId, setCheckoutCustomerId] = useState('');
  const [checkoutNewName, setCheckoutNewName] = useState('');
  const [checkoutRate, setCheckoutRate] = useState(100);
  const [checkoutPaid, setCheckoutPaid] = useState(true);
  const [checkoutCardNumber, setCheckoutCardNumber] = useState('');

  // تعديل / إلغاء / تسليم مفرد
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [cancelDevice, setCancelDevice] = useState<Device | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [search, setSearch] = useState('');

  // زبون عابر — اسم اختياري بدون إنشاء حساب دائم
  const [checkoutWalkInName, setCheckoutWalkInName] = useState('');
  const [checkoutSaveAsRegistered, setCheckoutSaveAsRegistered] = useState(false);

  // إسناد جهاز لزبون آخر
  const [reassignDevice, setReassignDevice] = useState<Device | null>(null);
  const [reassignCustSearch, setReassignCustSearch] = useState('');
  const [reassignCustId, setReassignCustId] = useState('');

  // إدارة أجهزة الزبون (modal واحد لكل الزبون)
  const [manageCustomer, setManageCustomer] = useState<any | null>(null);

  // تسليم جهاز مفرد
  const [deliverDevice, setDeliverDevice] = useState<Device | null>(null);
  const [deliverPaid, setDeliverPaid] = useState(true);
  const [deliverCheckoutLevel, setDeliverCheckoutLevel] = useState(100);

  const load = () => {
    setDevices(db.select<Device>('devices').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  };

  useEffect(() => { load(); }, []);

  // فلتر اليوم الصارم: فقط الأجهزة المنشأة اليوم
  const todayStart = todayISO();
  const isToday = (d: Device) => (d.created_at || '') >= todayStart;

  const matches = (d: Device) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (d.device_type || '').toLowerCase().includes(q) ||
      (d.device_number || '').toLowerCase().includes(q) ||
      customerName(d.customer_id).toLowerCase().includes(q);
  };

  // الأجهزة قيد الشحن: تظهر دائماً بغض النظر عن التاريخ حتى تُسلَّم
  const waiting = devices.filter((d) => d.status === 'charging' && matches(d));
  // الأجهزة المستلمة: تظهر فقط إذا سُلِّمت اليوم
  const delivered = devices.filter((d) => d.status === 'delivered' && isToday(d) && matches(d));
  const visible = tab === 'charging' ? waiting : delivered;

  const chargeIconClass = (lvl: number) => CHARGE_LEVELS.find((c) => c.value === lvl)?.iconClass || 'text-slate-500';

  // ملخص مالي لأجهزة اليوم
  const todayFinancial = useMemo(() => {
    const todayDevices = devices.filter((d) => (d.created_at || '') >= todayStart && d.status !== 'cancelled');
    const collected = todayDevices.filter((d) => d.status === 'delivered' && d.paid).reduce((s, d) => s + Number(d.price), 0);
    const deferred = todayDevices.filter((d) => d.status === 'delivered' && !d.paid).reduce((s, d) => s + Number(d.price), 0);
    const pending = todayDevices.filter((d) => d.status === 'charging').reduce((s, d) => s + Number(d.price), 0);
    return { collected, deferred, pending };
  }, [devices]);

  // تجميع الأجهزة حسب الزبون (متطلب #8)
  const customerGroups = useMemo(() => {
    const map = new Map<string, { customer: any; devices: Device[] }>();
    visible.forEach((d) => {
      const key = d.customer_id || 'anonymous';
      if (!map.has(key)) {
        const cust = d.customer_id ? db.first<any>('customers', (r) => r.id === d.customer_id) : null;
        map.set(key, { customer: cust, devices: [] });
      }
      map.get(key)!.devices.push(d);
    });
    return Array.from(map.values());
  }, [visible]);

  // ============================================================
  // POS: إضافة للسلة — جهاز مع ملحقات مرتبطة (متطلب #1)
  // ============================================================
  const deviceTypes = useMemo(() => db.select<DeviceType>('device_types').sort((a, b) => (a.sort || 0) - (b.sort || 0)), [posOpen, deviceTypesMgr]);
  const accessories = useMemo(() => db.select<Accessory>('accessories').sort((a, b) => (a.sort || 0) - (b.sort || 0)), [posOpen, accessoriesMgr]);

  const addDeviceToCart = (t: DeviceType) => {
    const key = `dev-${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const line: CartLine = {
      key,
      deviceType: t.name,
      accessories: [],
      price: Number(t.default_price) || 0,
      chargeLevel: 0,
    };
    setCart((prev) => [...prev, line]);
    setSelectedLineKey(key); // تحديد السطر الجديد تلقائيًا لربط الملحقات به
  };

  const addAccessoryToLine = (a: Accessory) => {
    if (!selectedLineKey) {
      push('اختر جهازًا من السلة أولًا لربط الملحق به', 'error');
      return;
    }
    setCart((prev) => prev.map((l) => {
      if (l.key !== selectedLineKey) return l;
      if (l.accessories.includes(a.name)) return l; // عدم التكرار
      return { ...l, accessories: [...l.accessories, a.name], price: l.price + (Number(a.price) || 0) };
    }));
  };

  const removeAccessoryFromLine = (lineKey: string, accName: string) => {
    setCart((prev) => prev.map((l) => {
      if (l.key !== lineKey) return l;
      const acc = accessories.find((x) => x.name === accName);
      const accPrice = acc ? Number(acc.price) || 0 : 0;
      return { ...l, accessories: l.accessories.filter((x) => x !== accName), price: Math.max(0, l.price - accPrice) };
    }));
  };

  const addCustomToCart = () => {
    if (!customLabel.trim()) { push('أدخل اسم العنصر', 'error'); return; }
    const key = `cus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setCart((prev) => [...prev, { key, deviceType: customLabel.trim(), accessories: [], price: Number(customPrice) || 0, chargeLevel: Number(customCharge) || 0 }]);
    setCustomLabel(''); setCustomPrice(''); setCustomCharge(0);
    setCustomizeOpen(false);
    setSelectedLineKey(key);
  };

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key));
    if (selectedLineKey === key) setSelectedLineKey(null);
  };

  const updateLinePrice = (key: string, price: number) => setCart((prev) => prev.map((l) => l.key === key ? { ...l, price } : l));
  const updateLineCharge = (key: string, lvl: number) => setCart((prev) => prev.map((l) => l.key === key ? { ...l, chargeLevel: lvl } : l));
  const cycleLineCharge = (key: string, current: number) => {
    const idx = CHARGE_CYCLE.indexOf(current);
    const next = CHARGE_CYCLE[(idx + 1) % CHARGE_CYCLE.length];
    updateLineCharge(key, next);
  };

  const cartTotal = cart.reduce((s, l) => s + (Number(l.price) || 0), 0);

  const openCheckout = () => {
    if (cart.length === 0) { push('السلة فارغة', 'error'); return; }
    setCheckoutCustomerId(''); setCheckoutNewName(''); setCheckoutRate(100); setCheckoutPaid(true); setCheckoutCardNumber('');
    setCheckoutWalkInName(''); setCheckoutSaveAsRegistered(false);
    setCheckoutOpen(true);
  };

  // ============================================================
  // تأكيد الاستلام: إنشاء أجهزة بحالة "قيد الشحن" فقط (متطلب #2)
  // لا يتم أي عملية مالية عند الاستلام — التسليم المالي يتم فقط عبر "تسليم الجهاز"
  // نفس الزبون → نفس السجل، لا صف جديد (متطلب #2)
  // ============================================================
  // إسناد جهاز لزبون آخر
  const reassignDeviceFn = () => {
    if (!reassignDevice || !reassignCustId) return;
    db.updateById('devices', reassignDevice.id, { customer_id: reassignCustId, customer_name: null });
    log('reassign_device', 'devices', reassignDevice.id, reassignCustId);
    push('تم إسناد الجهاز للزبون الجديد', 'success');
    setReassignDevice(null); setReassignCustSearch(''); setReassignCustId('');
    load();
    refreshManage();
  };

  const confirmCheckout = () => {
    // يُسمح بالمتابعة إذا: زبون مسجل، أو رقم بطاقة، أو اسم عابر
    if (!checkoutCustomerId && !checkoutCardNumber.trim() && !checkoutWalkInName.trim()) {
      push('أدخل رقم البطاقة أو اسم الزبون للمتابعة', 'error'); return;
    }
    let custId = checkoutCustomerId;
    let walkInName = '';
    if (custId === '__new__' && checkoutNewName.trim()) {
      const created = db.insert('customers', {
        name: checkoutNewName.trim(), phone: null, notes: null, credit_limit: 0,
        trust_limit: 0, drinks_credit_limit: 0, debt_locked: false, is_vip: false, created_at: db.now(),
      });
      custId = created.id;
      refreshCustomers();
    } else if (custId === '__new__') {
      custId = '';
    } else if (!custId && checkoutWalkInName.trim()) {
      if (checkoutSaveAsRegistered) {
        // حفظ الزبون العابر كزبون مسجل دائم
        const created = db.insert('customers', {
          name: checkoutWalkInName.trim(), phone: null, notes: null, credit_limit: 0,
          trust_limit: 0, drinks_credit_limit: 0, debt_locked: false, is_vip: false, created_at: db.now(),
        });
        custId = created.id;
        refreshCustomers();
      } else {
        // الاحتفاظ بالاسم على الجهاز فقط بدون إنشاء حساب
        walkInName = checkoutWalkInName.trim();
      }
    }

    cart.forEach((line) => {
      const created = db.insert('devices', {
        customer_id: custId || null,
        customer_name: walkInName || null,
        device_type: line.deviceType,
        device_number: checkoutCardNumber.trim() || null,
        accessory: line.accessories.length > 0 ? line.accessories.join('، ') : 'بدون ملحقات',
        accessories: JSON.stringify(line.accessories),
        charge_level: line.chargeLevel,
        checkout_charge_level: null,
        check_in_at: db.now(),
        check_out_at: null,
        price: Number(line.price) || 0,
        paid: false,
        status: 'charging',
        cancel_reason: null,
        collector_id: currentUser?.id || null,
        invoice_id: null,
        created_at: db.now(),
      });
      log('check_in_device', 'devices', created.id, String(line.price));
    });

    push(`تمت إضافة ${cart.length} جهاز لقيد الشحن`, 'success');
    setCart([]);
    setSelectedLineKey(null);
    setCheckoutOpen(false);
    setPosOpen(false);
    load();
  };

  // ============================================================
  // تسليم جهاز مفرد (من قائمة قيد الشحن)
  // ============================================================
  const confirmDeliver = () => {
    if (!deliverDevice) return;
    db.updateById('devices', deliverDevice.id, {
      status: 'delivered', check_out_at: db.now(), paid: deliverPaid, checkout_charge_level: deliverCheckoutLevel,
    });
    if (deliverPaid) {
      // المبلغ يُرحَّل حصراً إلى صندوق كاش الشحن — لا يُوزَّع على الشركاء تلقائياً
      const box = db.first<any>('cash_boxes', (r) => r.code === 'charging');
      if (box) {
        db.updateById('cash_boxes', box.id, { balance: Number(box.balance) + Number(deliverDevice.price) });
        db.insert('cash_box_ledger', { cash_box_id: box.id, type: 'in', amount: Number(deliverDevice.price), reason: `تسليم شحن: ${deliverDevice.device_type}`, related_id: deliverDevice.id, created_at: db.now() });
      }
    } else if (deliverDevice.customer_id) {
      const lastDebt = db.select<any>('debts').filter((d) => d.customer_id === deliverDevice.customer_id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      const prevBalance = lastDebt ? Number(lastDebt.balance_after) : 0;
      const newBalance = prevBalance + Number(deliverDevice.price);
      db.insert('debts', {
        customer_id: deliverDevice.customer_id, type: 'charging', description: `شحن: ${deliverDevice.device_type}`,
        debit: Number(deliverDevice.price), credit: 0, balance_after: newBalance, related_device_id: deliverDevice.id, reversed: false, created_at: db.now(),
      });
    }
    log('deliver_device', 'devices', deliverDevice.id, String(deliverDevice.price));
    push('تم تسليم الجهاز', 'success');
    setDeliverDevice(null); setDeliverPaid(true);
    setTab('charging'); // عودة تلقائية لقائمة الشحن فور التسليم
    load();
    refreshManage();
  };

  const cancelDeviceFn = () => {
    if (!cancelDevice) return;
    db.updateById('devices', cancelDevice.id, { status: 'cancelled', cancel_reason: cancelReason || null, check_out_at: db.now() });
    log('cancel_device', 'devices', cancelDevice.id, cancelReason);
    push('تم إلغاء الجهاز', 'info');
    setCancelDevice(null); setCancelReason('');
    load();
    refreshManage();
  };

  // تعديل بيانات الجهاز (شامل حتى بعد التسليم)
  const saveEdit = () => {
    if (!editDevice) return;
    const before = db.first<any>('devices', (r) => r.id === editDevice.id);
    const accArr = (() => {
      try { return JSON.parse(editDevice.accessories || '[]'); } catch { return []; }
    })();
    db.updateById('devices', editDevice.id, {
      device_type: editDevice.device_type,
      device_number: editDevice.device_number,
      accessory: accArr.length > 0 ? accArr.join('، ') : (editDevice.accessory || 'بدون ملحقات'),
      accessories: editDevice.accessories,
      charge_level: Number(editDevice.charge_level),
      checkout_charge_level: editDevice.checkout_charge_level != null ? Number(editDevice.checkout_charge_level) : null,
      price: Number(editDevice.price),
      paid: editDevice.paid,
    });
    log('edit_device', 'devices', editDevice.id, String(editDevice.price), before, editDevice);
    push('تم تعديل بيانات الجهاز', 'success');
    setEditDevice(null);
    load();
    refreshManage();
  };

  // التراجع عن التسليم (عكس كامل + إلغاء الأثر المالي)
  const undoDelivery = (d: Device) => {
    requireOwnerPassword(() => {
      const before = db.first<any>('devices', (r) => r.id === d.id);
      db.updateById('devices', d.id, { status: 'charging', check_out_at: null, checkout_charge_level: null });
      if (d.paid) {
        const box = db.first<any>('cash_boxes', (r) => r.code === 'charging');
        if (box) {
          db.updateById('cash_boxes', box.id, { balance: Number(box.balance) - Number(d.price) });
          db.insert('cash_box_ledger', { cash_box_id: box.id, type: 'out', amount: Number(d.price), reason: `عكس تسليم: ${d.device_type}`, related_id: d.id, created_at: db.now() });
        }
      } else if (d.customer_id) {
        const debt = db.first<any>('debts', (r) => r.related_device_id === d.id);
        if (debt) {
          db.updateById('debts', debt.id, { reversed: true });
          const dBox = db.first<any>('cash_boxes', (r) => r.code === 'daily_debts');
          if (dBox) {
            db.updateById('cash_boxes', dBox.id, { balance: Number(dBox.balance) - Number(d.price) });
            db.insert('cash_box_ledger', { cash_box_id: dBox.id, type: 'out', amount: Number(d.price), reason: `عكس دين شحن: ${d.device_type}`, related_id: d.id, created_at: db.now() });
          }
        }
      }
      log('undo_delivery', 'devices', d.id, String(d.price), before);
      push('تم التراجع عن التسليم وإلغاء الأثر المالي', 'success');
      load();
      refreshManage();
    });
  };

  // حذف جهاز من إدارة الأجهزة
  const deleteDevice = (d: Device) => {
    requireOwnerPassword(() => {
      const before = db.first<any>('devices', (r) => r.id === d.id);
      db.removeById('devices', d.id);
      log('delete_device', 'devices', d.id, String(d.price), before);
      push('تم حذف الجهاز', 'info');
      load();
      refreshManage();
    });
  };

  // ============================================================
  // إدارة أجهزة الزبون — modal واحد يعرض كل الأجهزة (متطلب #2)
  // ============================================================
  const refreshManage = () => {
    if (!manageCustomer) return;
    const all = db.select<Device>('devices').filter((d) => d.customer_id === manageCustomer.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    // الأجهزة النشطة: قيد الشحن فقط — الأرشيف: المسلمة والملغاة
    setManageCustomer({ ...manageCustomer, devices: all.filter((d) => d.status === 'charging'), archived: all.filter((d) => d.status !== 'charging') });
  };

  const openManageCustomer = (c: any) => {
    const all = db.select<Device>('devices').filter((x) => x.customer_id === c.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    setManageCustomer({ ...c, devices: all.filter((d) => d.status === 'charging'), archived: all.filter((d) => d.status !== 'charging') });
  };

  const openManageByDevice = (d: Device) => {
    if (!d.customer_id) return;
    const c = db.first<any>('customers', (r) => r.id === d.customer_id);
    if (c) openManageCustomer(c);
  };

  // إضافة جهاز جديد للزبون من داخل إدارة الأجهزة (يُضاف لنفس السجل)
  const [addDeviceForCustomer, setAddDeviceForCustomer] = useState<any | null>(null);
  const [newDeviceType, setNewDeviceType] = useState('');
  const [newDevicePrice, setNewDevicePrice] = useState(0);
  const [newDeviceCharge, setNewDeviceCharge] = useState(0);
  const [newDeviceAccessories, setNewDeviceAccessories] = useState<string[]>([]);

  const toggleNewDeviceAccessory = (name: string) => {
    setNewDeviceAccessories((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  };

  const saveNewDeviceForCustomer = () => {
    if (!addDeviceForCustomer) return;
    if (!newDeviceType.trim()) { push('اختر نوع الجهاز', 'error'); return; }
    const created = db.insert('devices', {
      customer_id: addDeviceForCustomer.id,
      device_type: newDeviceType.trim(),
      device_number: null,
      accessory: newDeviceAccessories.length > 0 ? newDeviceAccessories.join('، ') : 'بدون ملحقات',
      accessories: JSON.stringify(newDeviceAccessories),
      charge_level: newDeviceCharge,
      checkout_charge_level: null,
      check_in_at: db.now(),
      check_out_at: null,
      price: Number(newDevicePrice) || 0,
      paid: false,
      status: 'charging',
      cancel_reason: null,
      collector_id: currentUser?.id || null,
      invoice_id: null,
      created_at: db.now(),
    });
    log('add_device', 'devices', created.id, String(newDevicePrice));
    push('تمت إضافة جهاز جديد للزبون', 'success');
    setAddDeviceForCustomer(null);
    setNewDeviceType(''); setNewDevicePrice(0); setNewDeviceCharge(0); setNewDeviceAccessories([]);
    load();
    refreshManage();
  };

  // ============================================================
  // واجهة POS كاملة الشاشة
  // ============================================================
  if (posOpen) {
    return (
      <div className="fixed inset-0 z-40 bg-slate-100 dark:bg-slate-900 flex flex-col animate-fade" dir="rtl">
        {/* رأس POS */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-2">
            <BatteryCharging className="text-amber-500" size={24} />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">نقطة شحن — واجهة POS</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setDeviceTypesMgr(true)} className="btn-ghost text-sm">
              <Smartphone size={16} /> إدارة الأنواع
            </button>
            <button onClick={() => setAccessoriesMgr(true)} className="btn-ghost text-sm">
              <Plug size={16} /> إدارة الملحقات
            </button>
            <button onClick={() => setCustomizeOpen(true)} className="btn-ghost text-sm">
              <Settings2 size={16} /> تخصيص
            </button>
            <button onClick={() => { setPosOpen(false); setCart([]); setSelectedLineKey(null); }} className="btn-danger">
              <X size={18} /> إغلاق
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* يمين: سلة الشحن */}
          <aside className="w-[34%] min-w-[300px] bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
              <ShoppingCart className="text-sky-500" size={20} />
              <h3 className="font-bold text-slate-700 dark:text-slate-200">سلة الشحن ({cart.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <EmptyState icon={<ShoppingCart size={36} />} title="السلة فارغة" subtitle="اضغط على الأجهزة لإضافتها، ثم اختر الملحقات لربطها" />
              ) : (
                cart.map((line) => {
                  const isSelected = selectedLineKey === line.key;
                  return (
                    <div
                      key={line.key}
                      onClick={() => setSelectedLineKey(line.key)}
                      className={`rounded-xl border p-3 cursor-pointer transition ${isSelected
                        ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/30 ring-2 ring-sky-400/40'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 hover:border-slate-300'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Smartphone size={14} className="text-sky-500" />
                            <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{line.deviceType}</span>
                            {isSelected && <Badge color="sky">محدد</Badge>}
                          </div>
                          {line.accessories.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {line.accessories.map((a) => (
                                <span key={a} className="chip bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 flex items-center gap-1">
                                  <Link2 size={10} /> {a}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeAccessoryFromLine(line.key, a); }}
                                    className="hover:text-rose-500"
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 mt-0.5">بدون ملحقات</p>
                          )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeLine(line.key); }} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          className="input flex-1 py-1.5 text-sm"
                          placeholder="السعر"
                          value={line.price}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateLinePrice(line.key, Number(e.target.value))}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleLineCharge(line.key, line.chargeLevel); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
                          title="مستوى الشحن عند الاستلام"
                        >
                          {line.chargeLevel}%
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">الإجمالي</span>
                <span className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">{money(cartTotal)}</span>
              </div>
              <button onClick={openCheckout} className="btn-success w-full py-3 text-base">
                <Check size={20} /> تأكيد الاستلام
              </button>
            </div>
          </aside>

          {/* يسار: القائمتان (أجهزة + ملحقات) */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* الأجهزة */}
            <section className="flex-1 flex flex-col border-b border-slate-200 dark:border-slate-700">
              <div className="px-4 py-2.5 bg-sky-50 dark:bg-slate-800/60 flex items-center gap-2">
                <Smartphone className="text-sky-600" size={18} />
                <h3 className="font-bold text-sky-700 dark:text-sky-300">الأجهزة</h3>
                <span className="text-xs text-slate-400 mr-auto">اضغط لإضافة جهاز للسلة</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
                {deviceTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => addDeviceToCart(t)}
                    className="card p-4 flex flex-col items-center gap-2 hover:bg-sky-50 hover:border-sky-300 active:scale-95 transition touch-manipulation dark:hover:bg-slate-800"
                  >
                    <Smartphone className="text-sky-500" size={28} />
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{t.name}</span>
                    {Number(t.default_price) > 0 && <span className="text-xs text-slate-400">{money(t.default_price)}</span>}
                  </button>
                ))}
              </div>
            </section>

            {/* الملحقات */}
            <section className="flex-1 flex flex-col">
              <div className="px-4 py-2.5 bg-violet-50 dark:bg-slate-800/60 flex items-center gap-2">
                <Headphones className="text-violet-600" size={18} />
                <h3 className="font-bold text-violet-700 dark:text-violet-300">الملحقات</h3>
                <span className="text-xs text-slate-400 mr-auto">
                  {selectedLineKey ? 'تُربط بالجهاز المحدد في السلة' : 'اختر جهازًا في السلة أولًا'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
                {accessories.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => addAccessoryToLine(a)}
                    disabled={!selectedLineKey}
                    className="card p-4 flex flex-col items-center gap-2 hover:bg-violet-50 hover:border-violet-300 active:scale-95 transition touch-manipulation dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plug className="text-violet-500" size={28} />
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{a.name}</span>
                    {Number(a.price) > 0 && <span className="text-xs text-slate-400">+{money(a.price)}</span>}
                  </button>
                ))}
              </div>
            </section>
          </main>
        </div>

        {/* popup تخصيص */}
        <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="تخصيص / إضافة عنصر يدوي" size="sm">
          <div className="space-y-3">
            <div>
              <label className="label">اسم العنصر</label>
              <input className="input" placeholder="مثال: بطارية مخصصة" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">السعر</label>
                <input className="input" type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
              </div>
              <div>
                <label className="label">مستوى الشحن</label>
                <button onClick={() => setCustomCharge(CHARGE_CYCLE[(CHARGE_CYCLE.indexOf(customCharge) + 1) % CHARGE_CYCLE.length])} className="input text-center font-bold bg-slate-50 dark:bg-slate-800">
                  {customCharge}%
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setCustomizeOpen(false)} className="btn-ghost">إلغاء</button>
            <button onClick={addCustomToCart} className="btn-primary"><Plus size={18} /> إضافة للسلة</button>
          </div>
        </Modal>

        {/* popup تأكيد الاستلام */}
        <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="تأكيد الاستلام" size="md">
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-300">ملخص السلة ({cart.length} جهاز)</span>
                <span className="font-extrabold text-sky-600 dark:text-sky-400">{money(cartTotal)}</span>
              </div>
              <div className="text-xs text-slate-400 max-h-24 overflow-y-auto space-y-0.5">
                {cart.map((l) => (
                  <div key={l.key}>
                    {l.deviceType} — {money(l.price)}
                    {l.accessories.length > 0 && <span className="text-violet-500"> · {l.accessories.join('، ')}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="label">الزبون المسجل (بحث اختياري)</label>
              <CustomerSearch
                customers={customers}
                selectedId={checkoutCustomerId}
                onSelect={(id, name) => {
                  if (id === '__new__') { setCheckoutCustomerId('__new__'); setCheckoutNewName(name); }
                  else { setCheckoutCustomerId(id); setCheckoutWalkInName(''); }
                }}
                onClear={() => { setCheckoutCustomerId(''); setCheckoutNewName(''); }}
              />
              {checkoutCustomerId === '__new__' && (
                <div className="mt-2 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <UserPlus size={16} /> سيتم إنشاء زبون جديد: <b>{checkoutNewName}</b>
                </div>
              )}
              {/* زبون عابر — اسم بدون حساب دائم */}
              {!checkoutCustomerId && (
                <div className="mt-2 space-y-2">
                  <input
                    className="input text-sm"
                    placeholder="اسم الزبون العابر (اختياري)"
                    value={checkoutWalkInName}
                    onChange={(e) => setCheckoutWalkInName(e.target.value)}
                  />
                  {checkoutWalkInName.trim() && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={checkoutSaveAsRegistered}
                        onChange={(e) => setCheckoutSaveAsRegistered(e.target.checked)}
                        className="rounded accent-sky-600"
                      />
                      حفظ كزبون مسجل دائم في قائمة الديون
                    </label>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="label">
                رقم البطاقة
                {checkoutCustomerId && <span className="text-slate-400 text-xs font-normal mr-1">(اختياري للزبون المسجل)</span>}
              </label>
              <input
                className="input"
                placeholder="رقم البطاقة (اختياري)"
                value={checkoutCardNumber}
                onChange={(e) => setCheckoutCardNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="label">نسبة الشحن عند التسليم (للأجهزة)</label>
              <div className="flex gap-1">
                {CHARGE_LEVELS.map((c) => (
                  <button key={c.value} onClick={() => setCheckoutRate(c.value)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${checkoutRate === c.value ? c.btnClass : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">حالة الدفع</label>
              <div className="flex gap-2">
                <button onClick={() => setCheckoutPaid(true)} className={`flex-1 py-3 rounded-xl font-bold ${checkoutPaid ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>مدفوع (نقدًا)</button>
                <button onClick={() => setCheckoutPaid(false)} className={`flex-1 py-3 rounded-xl font-bold ${!checkoutPaid ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>دين (آجل)</button>
              </div>
              {!checkoutPaid && !checkoutCustomerId && (
                <p className="text-sm text-rose-600 font-semibold mt-2 flex items-center gap-1"><AlertTriangle size={14} /> لا يمكن تسجيل دين بدون زبون محدد</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <button onClick={() => setCheckoutOpen(false)} className="btn-ghost">إلغاء</button>
            <button onClick={confirmCheckout} disabled={!checkoutPaid && !checkoutCustomerId} className="btn-success">
              <Check size={18} /> تأكيد الاستلام
            </button>
          </div>
        </Modal>

        {/* شاشة إدارة أنواع الأجهزة */}
        <DeviceTypesManager open={deviceTypesMgr} onClose={() => setDeviceTypesMgr(false)} onChanged={() => load()} />

        {/* شاشة إدارة الملحقات */}
        <AccessoriesManager open={accessoriesMgr} onClose={() => setAccessoriesMgr(false)} onChanged={() => load()} />
      </div>
    );
  }

  // ============================================================
  // الصفحة الرئيسية — تجميع حسب الزبون (متطلب #8)
  // ============================================================
  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<BatteryCharging size={24} />}>قسم الشحن</SectionTitle>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="input pr-10" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => { setCart([]); setSelectedLineKey(null); setPosOpen(true); }} className="btn-primary">
            <Plus size={18} /> جهاز جديد
          </button>
        </div>
      </div>

      {/* ملخص مالي اليوم */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="المقبوض اليوم" value={money(todayFinancial.collected)} color="emerald" icon={<Check size={18} className="text-emerald-500" />} />
        <Stat label="الآجل اليوم" value={money(todayFinancial.deferred)} color="rose" icon={<BatteryCharging size={18} className="text-rose-400" />} />
        <Stat label="قيد الشحن" value={money(todayFinancial.pending)} color="amber" icon={<BatteryCharging size={18} className="text-amber-500" />} />
      </div>

      {/* عرض اليوم + التبويبات */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          <button
            onClick={() => setTab('charging')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === 'charging' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <BatteryCharging size={16} /> أجهزة قيد الشحن ({waiting.length})
          </button>
          <button
            onClick={() => setTab('delivered')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === 'delivered' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Check size={16} /> الأجهزة المستلمة ({delivered.length})
          </button>
        </div>
        <div className="chip bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          اليوم: {fmtDate(new Date())}
        </div>
      </div>

      {/* القائمة حسب التبويب — مجمّعة حسب الزبون */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-700">
          {tab === 'charging' ? (
            <><BatteryCharging className="text-amber-500" size={20} /><h3 className="font-bold text-slate-700 dark:text-slate-200">قيد الشحن — اليوم ({waiting.length})</h3></>
          ) : (
            <><Check className="text-emerald-500" size={20} /><h3 className="font-bold text-slate-700 dark:text-slate-200">تم التسليم — اليوم ({delivered.length})</h3></>
          )}
        </div>
        {visible.length === 0 ? (
          <EmptyState
            icon={tab === 'charging' ? <Smartphone size={36} /> : <Check size={36} />}
            title={tab === 'charging' ? 'لا توجد أجهزة قيد الشحن اليوم' : 'لا توجد أجهزة مسلمة اليوم'}
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[65vh] overflow-y-auto">
            {customerGroups.map((grp) => {
              // ── زبون مسجل: صف مجمّع + زر إدارة الأجهزة ──────────────────────
              if (grp.customer) {
                const chargingCount = grp.devices.filter((d) => d.status === 'charging').length;
                const deliveredCount = grp.devices.filter((d) => d.status === 'delivered').length;
                const totalPrice = grp.devices.reduce((s, d) => s + (Number(d.price) || 0), 0);
                return (
                  <div key={grp.customer.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300 shrink-0">
                        <Users size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{grp.customer.name}</span>
                          <Badge color="slate">{grp.devices.length} جهاز</Badge>
                          {chargingCount > 0 && <Badge color="amber">{chargingCount} قيد الشحن</Badge>}
                          {deliveredCount > 0 && <Badge color="emerald">{deliveredCount} مسلّم</Badge>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{grp.devices.map((d) => d.device_type).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join('، ')}{grp.devices.length > 3 && ' ...'}</span>
                          {grp.devices.some((d) => d.device_number) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-bold text-xs">
                              #{grp.devices.filter((d) => d.device_number).map((d) => d.device_number).join(' · ')}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sky-600 dark:text-sky-400">{money(totalPrice)}</span>
                        <button onClick={() => openManageCustomer(grp.customer)} className="btn-ghost text-sm py-2" title="إدارة جميع أجهزة الزبون">
                          <Smartphone size={16} /> إدارة الأجهزة
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              // ── زبائن عابرون: صف لكل جهاز مع اسمه وزر إسناد ─────────────────
              return grp.devices.map((d) => {
                const displayName = (d as any).customer_name || 'زبون عابر';
                return (
                  <div key={d.id} className="p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400 shrink-0">
                      <Smartphone size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{displayName}</span>
                        <Badge color={d.status === 'charging' ? 'amber' : 'emerald'}>{d.device_type}</Badge>
                        {d.device_number && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-bold text-xs">
                            #{d.device_number}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{d.accessory || 'بدون ملحقات'} · {d.charge_level}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sky-600 dark:text-sky-400">{money(d.price)}</span>
                      {d.status === 'charging' && (
                        <button
                          onClick={() => { setDeliverCheckoutLevel(100); setDeliverPaid(true); setDeliverDevice(d); }}
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          title="تسليم"
                        >
                          <LogOut size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => { setReassignDevice(d); setReassignCustId(''); setReassignCustSearch(''); }}
                        className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30"
                        title="إسناد لزبون مسجل"
                      >
                        <ArrowLeftRight size={16} />
                      </button>
                    </div>
                  </div>
                );
              });
            })}
          </div>
        )}
      </div>

      {/* Modal تسليم جهاز مفرد */}
      <Modal open={!!deliverDevice} onClose={() => setDeliverDevice(null)} title="تسليم جهاز" size="sm">
        {deliverDevice && (
          <div className="space-y-3">
            <p className="text-slate-600 dark:text-slate-300">تسليم <b>{deliverDevice.device_type}</b> — {money(deliverDevice.price)}</p>
            <div>
              <label className="label">نسبة الشحن عند التسليم</label>
              <div className="flex gap-1">
                {CHARGE_LEVELS.map((c) => (
                  <button key={c.value} onClick={() => setDeliverCheckoutLevel(c.value)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${deliverCheckoutLevel === c.value ? c.btnClass : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>{c.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">طريقة الدفع</label>
              <div className="flex gap-2">
                <button onClick={() => setDeliverPaid(true)} className={`flex-1 py-3 rounded-xl font-bold ${deliverPaid ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>نقدًا (مدفوع)</button>
                <button onClick={() => setDeliverPaid(false)} className={`flex-1 py-3 rounded-xl font-bold ${!deliverPaid ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>دين (آجل)</button>
              </div>
            </div>
            {!deliverPaid && !deliverDevice.customer_id && (
              <p className="text-sm text-rose-600 font-semibold">لا يمكن تسجيل دين بدون زبون محدد</p>
            )}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setDeliverDevice(null)} className="btn-ghost">إلغاء</button>
          <button onClick={confirmDeliver} disabled={!deliverPaid && !deliverDevice?.customer_id} className="btn-success">تأكيد التسليم</button>
        </div>
      </Modal>

      {/* Modal تعديل بيانات الجهاز */}
      <Modal open={!!editDevice} onClose={() => setEditDevice(null)} title="تعديل بيانات الجهاز / الفاتورة" size="md">
        {editDevice && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">نوع الجهاز</label>
              <input className="input" value={editDevice.device_type} onChange={(e) => setEditDevice({ ...editDevice, device_type: e.target.value })} />
            </div>
            <div>
              <label className="label">رقم الجهاز</label>
              <input className="input" value={editDevice.device_number || ''} onChange={(e) => setEditDevice({ ...editDevice, device_number: e.target.value })} />
            </div>
            <div>
              <label className="label">الملحقات (مفصولة بفاصلة)</label>
              <input
                className="input"
                placeholder="مثال: بشاحن، وصلة"
                value={(() => { try { return JSON.parse(editDevice.accessories || '[]').join('، '); } catch { return editDevice.accessory || ''; } })()}
                onChange={(e) => {
                  const arr = e.target.value.split('،').map((s) => s.trim()).filter(Boolean);
                  setEditDevice({ ...editDevice, accessories: JSON.stringify(arr), accessory: arr.join('، ') });
                }}
              />
            </div>
            <div>
              <label className="label">مستوى الشحن عند الاستلام</label>
              <div className="flex gap-1">
                {CHARGE_LEVELS.map((c) => (
                  <button key={c.value} onClick={() => setEditDevice({ ...editDevice, charge_level: c.value })} className={`flex-1 py-2 rounded-lg text-xs font-bold ${editDevice.charge_level === c.value ? c.btnClass : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {editDevice.status === 'delivered' && (
              <div>
                <label className="label">مستوى الشحن عند التسليم</label>
                <div className="flex gap-1">
                  {CHARGE_LEVELS.map((c) => (
                    <button key={c.value} onClick={() => setEditDevice({ ...editDevice, checkout_charge_level: c.value })} className={`flex-1 py-2 rounded-lg text-xs font-bold ${(editDevice.checkout_charge_level ?? 0) === c.value ? c.btnClass : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label">السعر</label>
              <input className="input" type="number" value={editDevice.price} onChange={(e) => setEditDevice({ ...editDevice, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">حالة الدفع</label>
              <div className="flex gap-2">
                <button onClick={() => setEditDevice({ ...editDevice, paid: true })} className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${editDevice.paid ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>مدفوع</button>
                <button onClick={() => setEditDevice({ ...editDevice, paid: false })} className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${!editDevice.paid ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>دين</button>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setEditDevice(null)} className="btn-ghost">إلغاء</button>
          <button onClick={saveEdit} className="btn-primary">حفظ التعديل</button>
        </div>
      </Modal>

      {/* Modal إلغاء جهاز */}
      <Modal open={!!cancelDevice} onClose={() => setCancelDevice(null)} title="إلغاء الجهاز" size="sm">
        <p className="text-slate-600 dark:text-slate-300 mb-3">سيتم إلغاء جهاز <b>{cancelDevice?.device_type}</b>. أدخل سبب الإلغاء:</p>
        <textarea className="input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="سبب الإلغاء..." />
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setCancelDevice(null)} className="btn-ghost">تراجع</button>
          <button onClick={cancelDeviceFn} className="btn-danger">تأكيد الإلغاء</button>
        </div>
      </Modal>

      {/* Modal إسناد جهاز لزبون آخر */}
      <Modal open={!!reassignDevice} onClose={() => setReassignDevice(null)} title={`إسناد الجهاز — ${reassignDevice?.device_type || ''}`} size="sm">
        {reassignDevice && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              سيُنقل الجهاز من حساب <b>{(reassignDevice as any).customer_name || 'زبون عابر'}</b> إلى الزبون المختار أدناه.
            </p>
            <div>
              <label className="label">ابحث عن الزبون الجديد</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  className="input pr-9"
                  placeholder="اكتب الاسم أو رقم الهاتف..."
                  value={reassignCustSearch}
                  onChange={(e) => { setReassignCustSearch(e.target.value); setReassignCustId(''); }}
                  autoFocus
                />
              </div>
              {reassignCustSearch.trim() && (
                <div className="mt-1.5 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {customers
                    .filter((c) =>
                      (c.name || '').toLowerCase().includes(reassignCustSearch.toLowerCase()) ||
                      (c.phone || '').includes(reassignCustSearch)
                    )
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setReassignCustId(c.id); setReassignCustSearch(c.name); }}
                        className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${reassignCustId === c.id ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 font-bold' : ''}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-sky-600 dark:text-sky-300 text-xs font-bold shrink-0">{c.name[0]}</div>
                        <div>
                          <p className="font-semibold">{c.name}</p>
                          {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                        </div>
                        {reassignCustId === c.id && <Check size={16} className="mr-auto text-emerald-500" />}
                      </button>
                    ))
                  }
                  {customers.filter((c) =>
                    (c.name || '').toLowerCase().includes(reassignCustSearch.toLowerCase()) ||
                    (c.phone || '').includes(reassignCustSearch)
                  ).length === 0 && (
                    <p className="px-3 py-3 text-sm text-slate-400 text-center">لا توجد نتائج</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setReassignDevice(null)} className="btn-ghost">إلغاء</button>
          <button onClick={reassignDeviceFn} disabled={!reassignCustId} className="btn-primary">
            <ArrowLeftRight size={16} /> تأكيد الإسناد
          </button>
        </div>
      </Modal>

      {/* Modal إدارة أجهزة الزبون — يعرض كل الأجهزة في نافذة واحدة (متطلب #2) */}
      <Modal open={!!manageCustomer} onClose={() => setManageCustomer(null)} title={`إدارة الأجهزة — ${manageCustomer?.name || ''}`} size="lg">
        {manageCustomer && (() => {
          const activeDevices: Device[] = manageCustomer.devices || [];
          const archivedDevices: Device[] = manageCustomer.archived || [];

          const DeviceRow = ({ d, isArchived }: { d: Device; isArchived?: boolean }) => {
            let accArr: string[] = [];
            try { accArr = JSON.parse(d.accessories || '[]'); } catch { accArr = []; }
            return (
              <div key={d.id} className={`p-3 rounded-xl border ${isArchived ? 'border-slate-200 bg-slate-50 dark:bg-slate-800/40 dark:border-slate-700 opacity-80' : 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{d.device_type}</span>
                      {d.device_number && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-bold text-xs">#{d.device_number}</span>
                      )}
                      {d.paid ? <Badge color="emerald">مدفوع</Badge> : <Badge color="rose">غير مدفوع</Badge>}
                      {isArchived && (
                        <Badge color={d.status === 'delivered' ? 'emerald' : 'rose'}>
                          {d.status === 'delivered' ? 'مسلّم' : 'ملغي'}
                        </Badge>
                      )}
                    </div>
                    {accArr.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {accArr.map((a) => (
                          <span key={a} className="chip bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                            <Link2 size={10} /> {a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{d.accessory || 'بدون ملحقات'}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      دخول: {fmtDateTime(d.check_in_at)} · شحن: {d.charge_level}%
                      {d.checkout_charge_level != null ? ` → تسليم: ${d.checkout_charge_level}%` : ''}
                      {d.check_out_at ? ` · تسليم: ${fmtDateTime(d.check_out_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-extrabold text-sky-600 dark:text-sky-400">{money(d.price)}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {d.status === 'charging' && (
                      <button onClick={() => { setDeliverCheckoutLevel(100); setDeliverPaid(true); setDeliverDevice(d); }} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30" title="تسليم هذا الجهاز">
                        <LogOut size={16} />
                      </button>
                    )}
                    {d.status === 'delivered' && (
                      <button onClick={() => undoDelivery(d)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30" title="التراجع عن التسليم">
                        <Undo2 size={16} />
                      </button>
                    )}
                    <button onClick={() => { setReassignDevice(d); setReassignCustId(''); setReassignCustSearch(''); }} className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30" title="إسناد لزبون آخر">
                      <ArrowLeftRight size={16} />
                    </button>
                    <button onClick={() => setEditDevice({ ...d })} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-900/30" title="تعديل">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => deleteDevice(d)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30" title="حذف">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-3">
              {/* رأس الشريط */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BatteryCharging className="text-amber-500" size={18} />
                  <span className="font-bold text-slate-700 dark:text-slate-200">{activeDevices.length} قيد الشحن</span>
                  {archivedDevices.length > 0 && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">· {archivedDevices.length} مؤرشف</span>
                  )}
                </div>
                <button
                  onClick={() => { setAddDeviceForCustomer(manageCustomer); setNewDeviceType(''); setNewDevicePrice(0); setNewDeviceCharge(0); setNewDeviceAccessories([]); }}
                  className="btn-primary text-sm py-2"
                >
                  <Plus size={16} /> إضافة جهاز جديد
                </button>
              </div>

              {/* ── قائمة الأجهزة النشطة (قيد الشحن) ── */}
              {activeDevices.length === 0 ? (
                <EmptyState icon={<Smartphone size={36} />} title="لا توجد أجهزة قيد الشحن" subtitle="جميع أجهزة هذا الزبون مسلَّمة أو ملغاة" />
              ) : (
                <div className="space-y-2">
                  {activeDevices.map((d: Device) => <DeviceRow key={d.id} d={d} />)}
                </div>
              )}

              {/* ── أرشيف الأجهزة المسلمة / الملغاة ── */}
              {archivedDevices.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition list-none select-none">
                    <Check size={15} className="text-emerald-500" />
                    أرشيف الأجهزة المسلمة والملغاة ({archivedDevices.length})
                    <span className="mr-auto text-xs opacity-60 group-open:hidden">اضغط للعرض</span>
                    <span className="mr-auto text-xs opacity-60 hidden group-open:inline">إخفاء</span>
                  </summary>
                  <div className="space-y-2 mt-2">
                    {archivedDevices.map((d: Device) => <DeviceRow key={d.id} d={d} isArchived />)}
                  </div>
                </details>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Modal إضافة جهاز جديد للزبون (داخل إدارة الأجهزة) */}
      <Modal open={!!addDeviceForCustomer} onClose={() => setAddDeviceForCustomer(null)} title={`إضافة جهاز — ${addDeviceForCustomer?.name || ''}`} size="md">
        {addDeviceForCustomer && (
          <div className="space-y-3">
            <div>
              <label className="label">نوع الجهاز</label>
              <select className="input" value={newDeviceType} onChange={(e) => {
                setNewDeviceType(e.target.value);
                const dt = db.first<DeviceType>('device_types', (r) => r.name === e.target.value);
                if (dt && !newDevicePrice) setNewDevicePrice(Number(dt.default_price) || 0);
              }}>
                <option value="">— اختر —</option>
                {db.select<DeviceType>('device_types').sort((a, b) => (a.sort || 0) - (b.sort || 0)).map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">السعر</label>
                <input className="input" type="number" value={newDevicePrice} onChange={(e) => setNewDevicePrice(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">مستوى الشحن</label>
                <div className="flex gap-1">
                  {CHARGE_LEVELS.map((c) => (
                    <button key={c.value} onClick={() => setNewDeviceCharge(c.value)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${newDeviceCharge === c.value ? c.btnClass : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="label">الملحقات</label>
              <div className="flex flex-wrap gap-2">
                {db.select<Accessory>('accessories').sort((a, b) => (a.sort || 0) - (b.sort || 0)).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggleNewDeviceAccessory(a.name)}
                    className={`chip ${newDeviceAccessories.includes(a.name) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                  >
                    <Link2 size={10} /> {a.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setAddDeviceForCustomer(null)} className="btn-ghost">إلغاء</button>
          <button onClick={saveNewDeviceForCustomer} className="btn-success"><Plus size={18} /> إضافة للزبون</button>
        </div>
      </Modal>
    </div>
  );
}
