import { Fragment, useEffect, useMemo, useState } from 'react';
import { CupSoda, Plus, Trash2, ShoppingCart, Pencil, Package, Check, Tag, Undo2, Lock, Search, UserPlus, FileText, ChevronDown, ChevronLeft, Link2, X } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { useCustomers } from '../lib/hooks';
import { money, fmtDateTime } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState } from '../components/ui';
import type { Product, DiscountGroup, Customer, Invoice, InvoiceItem, Debt, Device } from '../lib/types';

type CartItem = { product_id: string; name: string; qty: number; unit_price: number; cost_price: number; line_total: number };

export default function Drinks() {
  const { currentUser, log, requireOwnerPassword } = useStore();
  const { push } = useToast();
  const { customers, refresh: refreshCustomers } = useCustomers();
  const [products, setProducts] = useState<Product[]>([]);
  const [discountGroups, setDiscountGroups] = useState<DiscountGroup[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tab, setTab] = useState<'sell' | 'groups' | 'history'>('sell');

  const [groupOpen, setGroupOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<DiscountGroup | null>(null);
  const [gName, setGName] = useState('');
  const [gType, setGType] = useState<'fixed' | 'percentage'>('fixed');
  const [gValue, setGValue] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [paid, setPaid] = useState(true);
  const [paidAmount, setPaidAmount] = useState('');
  const [note, setNote] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [discountValue, setDiscountValue] = useState('');

  // Smart customer search (checkout)
  const [custSearch, setCustSearch] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);

  // Detailed statement modal
  const [statementCustId, setStatementCustId] = useState<string | null>(null);
  const [expandedInv, setExpandedInv] = useState<string | null>(null);

  // Link items to group modal
  const [linkGroup, setLinkGroup] = useState<DiscountGroup | null>(null);
  const [linkPicks, setLinkPicks] = useState<Record<string, boolean>>({});

  const loadProducts = () => setProducts(db.select<Product>('products').sort((a, b) => a.name.localeCompare(b.name, 'ar')));
  const loadGroups = () => setDiscountGroups(db.select<DiscountGroup>('discount_groups').sort((a, b) => a.name.localeCompare(b.name, 'ar')));
  const loadInvoices = () => {
    const all = db.select<any>('invoices').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 50);
    const items = db.select<any>('invoice_items');
    setInvoices(all.map((inv) => ({ ...inv, items: items.filter((i) => i.invoice_id === inv.id) })));
  };

  useEffect(() => { loadProducts(); loadGroups(); loadInvoices(); }, []);

  const cartSubtotal = cart.reduce((s, i) => s + i.line_total, 0);
  const discountAmount = (() => {
    if (discountType === 'fixed') return Math.min(Number(discountValue) || 0, cartSubtotal);
    if (discountType === 'percentage') return Math.round((cartSubtotal * (Number(discountValue) || 0) / 100) * 100) / 100;
    return 0;
  })();
  // Discount group auto-apply: for every 2 units of same group, apply discount once
  const groupDiscount = (() => {
    const byGroup: Record<string, { qty: number; unit_price: number; group: DiscountGroup }> = {};
    cart.forEach((i) => {
      const prod = db.first<Product>('products', (r) => r.id === i.product_id);
      if (prod?.discount_group_id) {
        const g = discountGroups.find((x) => x.id === prod.discount_group_id && x.active);
        if (g) {
          if (!byGroup[g.id]) byGroup[g.id] = { qty: 0, unit_price: i.unit_price, group: g };
          byGroup[g.id].qty += i.qty;
        }
      }
    });
    let total = 0;
    Object.values(byGroup).forEach((entry) => {
      const pairs = Math.floor(entry.qty / 2);
      if (pairs > 0) {
        if (entry.group.discount_type === 'fixed') total += pairs * entry.group.discount_value;
        else total += Math.round((pairs * entry.unit_price * entry.group.discount_value / 100) * 100) / 100;
      }
    });
    return total;
  })();
  const totalDiscount = discountAmount + groupDiscount;
  const cartTotal = Math.max(0, cartSubtotal - totalDiscount);
  const cartProfit = cart.reduce((s, i) => s + (i.unit_price - i.cost_price) * i.qty, 0) - totalDiscount;
  const actualPaid = paid ? cartTotal : (Number(paidAmount) || 0);
  const remainingDebt = cartTotal - actualPaid;
  const realizedProfit = cartTotal > 0 ? (actualPaid / cartTotal) * cartProfit : 0;

  const saveGroup = () => {
    if (!gName.trim() || !gValue) { push('أدخل الاسم والقيمة', 'error'); return; }
    const payload = { name: gName.trim(), discount_type: gType, discount_value: Number(gValue) || 0, active: true };
    if (editGroup) {
      db.updateById('discount_groups', editGroup.id, payload);
      log('edit_discount_group', 'discount_groups', editGroup.id, gName);
      push('تم تعديل المجموعة', 'success');
    } else {
      const created = db.insert('discount_groups', { ...payload, created_at: db.now() });
      log('add_discount_group', 'discount_groups', created.id, gName);
      push('تم إضافة المجموعة', 'success');
    }
    setGroupOpen(false); setEditGroup(null); setGName(''); setGValue(''); setGType('fixed');
    loadGroups();
  };

  const toggleGroupActive = (g: DiscountGroup) => {
    db.updateById('discount_groups', g.id, { active: !g.active });
    log('toggle_group_active', 'discount_groups', g.id, String(!g.active));
    push(g.active ? 'تم تعطيل المعادلة' : 'تم تفعيل المعادلة', 'success');
    loadGroups();
  };

  const addToCart = (p: Product) => {
    if (Number(p.quantity) <= 0) { push('الكمية غير متوفرة', 'error'); return; }
    setCart((c) => {
      const existing = c.find((i) => i.product_id === p.id);
      if (existing) return c.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1, line_total: (i.qty + 1) * i.unit_price } : i);
      return [...c, { product_id: p.id, name: p.name, qty: 1, unit_price: Number(p.sell_price), cost_price: Number(p.cost_price), line_total: Number(p.sell_price) }];
    });
  };

  const updateQty = (id: string, delta: number) => setCart((c) => c.map((i) => i.product_id === id ? { ...i, qty: Math.max(1, i.qty + delta), line_total: Math.max(1, i.qty + delta) * i.unit_price } : i));
  const removeFromCart = (id: string) => setCart((c) => c.filter((i) => i.product_id !== id));

  const getCustomerBalance = (custId: string): number => {
    const custDebts = db.select<any>('debts').filter((d) => d.customer_id === custId);
    return custDebts.reduce((s: number, d: any) => s + Number(d.debit) - Number(d.credit), 0);
  };

  const checkout = () => {
    if (cart.length === 0) { push('السلة فارغة', 'error'); return; }
    let custId = customerId;
    // Smart customer creation: if user typed a name that isn't an existing customer, create on the fly
    if (!custId && custSearch.trim()) {
      const existing = db.first<Customer>('customers', (r) => r.name.trim() === custSearch.trim());
      if (existing) {
        custId = existing.id;
      } else {
        const created = db.insert('customers', { name: custSearch.trim(), phone: null, notes: null, credit_limit: 0, trust_limit: 0, drinks_credit_limit: 0, debt_locked: false, is_vip: false, created_at: db.now() });
        custId = created.id;
        refreshCustomers();
      }
    }
    // Enforce customer required for unpaid (credit) invoices
    if (!custId && remainingDebt > 0) {
      push('الفاتورة الآجلة تتطلب اختيار أو إضافة زبون', 'error');
      return;
    }

    // Debt lock check for unpaid / partial — drinks only, uses drinks_credit_limit with 50%/90% rules
    if (custId && remainingDebt > 0) {
      const cust = db.first<any>('customers', (r) => r.id === custId);
      if (cust?.debt_locked) {
        const currentDrinksDebt = db.select<any>('debts').filter((d) => d.customer_id === custId && !d.reversed && d.type === 'drinks').reduce((s: number, d: any) => s + Number(d.debit) - Number(d.credit), 0);
        const limit = Number(cust.drinks_credit_limit) || 0;
        if (limit <= 0 || currentDrinksDebt + remainingDebt > limit) {
          push(`الزبون مقفل المديونية. حد المشروبات المتاح: ${money(limit)} — لا يمكن البيع بالدين`, 'error');
          return;
        }
      } else {
        const trustLimit = Number(cust?.trust_limit) || 0;
        if (trustLimit > 0) {
          const currentBalance = getCustomerBalance(custId);
          if (currentBalance + remainingDebt > trustLimit) {
            push(`تجاوز حد الثقة (${money(trustLimit)}) — لا يمكن إضافة دين`, 'error');
            return;
          }
        }
      }
    }

    const inv = db.insert('invoices', {
      customer_id: custId || null,
      subtotal: cartSubtotal,
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      discount_amount: totalDiscount,
      group_discount: groupDiscount,
      total: cartTotal,
      paid: actualPaid >= cartTotal,
      paid_amount: actualPaid,
      profit: cartProfit,
      realized_profit: realizedProfit,
      collector_id: currentUser?.id || null,
      note: note || null,
      reversed: false,
      created_at: db.now(),
    });

    cart.forEach((i) => {
      db.insert('invoice_items', {
        invoice_id: inv.id, product_id: i.product_id, name: i.name, qty: i.qty,
        unit_price: i.unit_price, cost_price: i.cost_price, line_total: i.line_total,
      });
      const prod = db.first<any>('products', (r) => r.id === i.product_id);
      if (prod) db.updateById('products', prod.id, { quantity: Math.max(0, Number(prod.quantity) - i.qty) });
    });

    if (actualPaid > 0) {
      const box = db.first<any>('cash_boxes', (r) => r.code === 'drinks');
      if (box) {
        db.updateById('cash_boxes', box.id, { balance: Number(box.balance) + actualPaid });
        db.insert('cash_box_ledger', { cash_box_id: box.id, type: 'in', amount: actualPaid, reason: 'مبيعات مشروبات', related_id: inv.id, created_at: db.now() });
      }
      // Realized profit only to profit box
      if (realizedProfit > 0) {
        const pBox = db.first<any>('cash_boxes', (r) => r.code === 'drinks_profit');
        if (pBox) {
          db.updateById('cash_boxes', pBox.id, { balance: Number(pBox.balance) + realizedProfit });
          db.insert('cash_box_ledger', { cash_box_id: pBox.id, type: 'in', amount: realizedProfit, reason: 'أرباح مشروبات محققة', related_id: inv.id, created_at: db.now() });
        }
        // توزيع الربح بالتساوي على الشركاء
        const partners = db.select<any>('partners');
        if (partners.length > 0) {
          const share = realizedProfit / partners.length;
          partners.forEach((p) => {
            db.updateById('partners', p.id, { balance: Number(p.balance) + share });
            db.insert('partner_ledger', { partner_id: p.id, type: 'profit', amount: share, note: 'توزيع ربح مشروبات', created_at: db.now() });
          });
        }
      }
    }

    if (remainingDebt > 0 && custId) {
      const lastDebt = db.select<any>('debts').filter((d) => d.customer_id === custId).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      const prevBalance = lastDebt ? Number(lastDebt.balance_after) : 0;
      const newBalance = prevBalance + remainingDebt;
      db.insert('debts', {
        customer_id: custId, type: 'drinks', description: 'فاتورة مشروبات (آجل)',
        debit: remainingDebt, credit: 0, balance_after: newBalance, related_invoice_id: inv.id, reversed: false, created_at: db.now(),
      });
    }
    log('create_invoice', 'invoices', inv.id, String(cartTotal), null, { paid: actualPaid >= cartTotal, total: cartTotal });
    push(actualPaid >= cartTotal ? 'تم إنشاء فاتورة مدفوعة' : 'تم إنشاء فاتورة (آجل جزئي)', 'success');
    setCart([]); setCustomerId(''); setCustSearch(''); setShowCustDropdown(false); setPaid(true); setPaidAmount(''); setNote(''); setInvoiceOpen(false);
    setDiscountType('none'); setDiscountValue('');
    loadProducts(); loadInvoices(); refreshCustomers();
  };

  const reverseInvoice = (inv: any) => {
    requireOwnerPassword(() => {
      if (inv.reversed) { push('الفاتورة معكوسة مسبقًا', 'error'); return; }
      // Restore stock
      (inv.items || []).forEach((i: any) => {
        const prod = db.first<any>('products', (r) => r.id === i.product_id);
        if (prod) db.updateById('products', prod.id, { quantity: Number(prod.quantity) + Number(i.qty) });
      });
      // Reverse cash
      if (Number(inv.paid_amount) > 0) {
        const box = db.first<any>('cash_boxes', (r) => r.code === 'drinks');
        if (box) {
          db.updateById('cash_boxes', box.id, { balance: Number(box.balance) - Number(inv.paid_amount) });
          db.insert('cash_box_ledger', { cash_box_id: box.id, type: 'out', amount: Number(inv.paid_amount), reason: `عكس فاتورة ${inv.id.slice(0, 6)}`, related_id: inv.id, created_at: db.now() });
        }
        if (Number(inv.realized_profit) > 0) {
          const pBox = db.first<any>('cash_boxes', (r) => r.code === 'drinks_profit');
          if (pBox) {
            db.updateById('cash_boxes', pBox.id, { balance: Number(pBox.balance) - Number(inv.realized_profit) });
            db.insert('cash_box_ledger', { cash_box_id: pBox.id, type: 'out', amount: Number(inv.realized_profit), reason: 'عكس أرباح', related_id: inv.id, created_at: db.now() });
          }
        }
      }
      // Reverse debt
      const debt = db.first<any>('debts', (r) => r.related_invoice_id === inv.id);
      if (debt) {
        db.updateById('debts', debt.id, { reversed: true });
      }
      db.updateById('invoices', inv.id, { reversed: true });
      log('reverse_invoice', 'invoices', inv.id, String(inv.total));
      push('تم عكس الفاتورة', 'success');
      loadProducts(); loadInvoices(); refreshCustomers();
    });
  };

  // ===== Smart customer search helpers =====
  const customerMatches = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [custSearch, customers]);

  const exactMatch = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    return customers.find((c) => c.name.toLowerCase() === q);
  }, [custSearch, customers]);

  const quickAddCustomer = () => {
    if (!custSearch.trim()) { push('أدخل اسم الزبون', 'error'); return; }
    const created = db.insert('customers', { name: custSearch.trim(), phone: null, notes: null, credit_limit: 0, trust_limit: 0, drinks_credit_limit: 0, debt_locked: false, is_vip: false, created_at: db.now() });
    refreshCustomers();
    setCustomerId(created.id);
    setShowCustDropdown(false);
    push('تمت إضافة الزبون', 'success');
  };

  // ===== Detailed statement modal =====
  const statementCustomer = statementCustId ? customers.find((c) => c.id === statementCustId) : null;
  const statementInvoices = useMemo(() => {
    if (!statementCustId) return [];
    return db.select<Invoice>('invoices')
      .filter((i) => i.customer_id === statementCustId && !i.reversed)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [statementCustId, invoices]);

  const statementDebts = useMemo(() => {
    if (!statementCustId) return [];
    return db.select<Debt>('debts')
      .filter((d) => d.customer_id === statementCustId && !d.reversed)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [statementCustId, invoices]);

  const invoiceItemsFor = (invId: string): InvoiceItem[] => db.select<InvoiceItem>('invoice_items').filter((i) => i.invoice_id === invId);
  const deviceFor = (devId: string | null): Device | null => devId ? db.first<Device>('devices', (d) => d.id === devId) : null;

  // ===== Link items to group =====
  const openLinkModal = (g: DiscountGroup) => {
    setLinkGroup(g);
    const picks: Record<string, boolean> = {};
    products.forEach((p) => { picks[p.id] = p.discount_group_id === g.id; });
    setLinkPicks(picks);
  };

  const saveLinkPicks = () => {
    if (!linkGroup) return;
    let count = 0;
    Object.entries(linkPicks).forEach(([pid, on]) => {
      const prod = products.find((p) => p.id === pid);
      if (!prod) return;
      const want = on ? linkGroup.id : null;
      if (prod.discount_group_id !== want) {
        db.updateById('products', pid, { discount_group_id: want });
        count++;
      }
    });
    log('link_items_group', 'discount_groups', linkGroup.id, String(count));
    push(`تم ربط ${count} صنف بالمجموعة`, 'success');
    setLinkGroup(null);
    loadProducts();
  };

  const groupName = (id: string | null) => discountGroups.find((g) => g.id === id)?.name || null;

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<CupSoda size={24} />}>قسم المشروبات والمبيعات</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          {(['sell', 'groups', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 rounded-xl text-sm font-bold transition ${tab === t ? 'bg-sky-600 text-white dark:bg-sky-500' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
              {t === 'sell' ? 'بيع' : t === 'groups' ? 'مجموعات الخصم' : 'الفواتير'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'sell' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card p-4 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-700 dark:text-slate-200">الأصناف</h3>
            </div>
            {products.length === 0 ? (
              <EmptyState icon={<Package size={36} />} title="لا توجد منتجات" subtitle="أضف منتجات من قسم الإدارة." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {products.map((p) => (
                  <button key={p.id} onClick={() => addToCart(p)} className="card p-3 text-right hover:shadow-md hover:border-sky-300 transition active:scale-95 dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl">{p.icon || '📦'}</span>
                      <p className="font-bold text-slate-700 truncate flex-1 dark:text-slate-200">{p.name}</p>
                    </div>
                    <p className="text-sky-600 font-extrabold mt-1">{money(p.sell_price)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">المخزون: {p.quantity}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4 flex flex-col dark:bg-slate-900">
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2 dark:text-slate-200"><ShoppingCart size={18} /> السلة</h3>
            {cart.length === 0 ? (
              <EmptyState icon={<ShoppingCart size={32} />} title="السلة فارغة" />
            ) : (
              <div className="flex-1 space-y-2">
                {cart.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-700 truncate dark:text-slate-200">{i.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{money(i.unit_price)} × {i.qty} = {money(i.line_total)}</p>
                    </div>
                    <button onClick={() => updateQty(i.product_id, -1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200">-</button>
                    <button onClick={() => updateQty(i.product_id, 1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200">+</button>
                    <button onClick={() => removeFromCart(i.product_id)} className="p-1.5 text-rose-500"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-200 mt-3 pt-3 space-y-2 dark:border-slate-700">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                <span>المجموع الفرعي</span><span>{money(cartSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-rose-600 font-semibold">
                  <span>خصم مباشر</span><span>-{money(discountAmount)}</span>
                </div>
              )}
              {groupDiscount > 0 && (
                <div className="flex justify-between text-sm text-violet-600 font-semibold">
                  <span>خصم مجموعة (كل قطعتين)</span><span>-{money(groupDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100">
                <span>الإجمالي</span><span>{money(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                <span>الربح المتوقع</span><span>{money(cartProfit)}</span>
              </div>
              <button onClick={() => setInvoiceOpen(true)} disabled={cart.length === 0} className="btn-primary w-full mt-2">إتمام الفاتورة</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'groups' && (
        <div className="card overflow-hidden dark:bg-slate-900">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">مجموعات الخصم</h3>
            <button onClick={() => { setEditGroup(null); setGName(''); setGType('fixed'); setGValue(''); setGroupOpen(true); }} className="btn-primary text-sm"><Plus size={16} /> مجموعة جديدة</button>
          </div>
          {discountGroups.length === 0 ? (
            <EmptyState icon={<Tag size={36} />} title="لا توجد مجموعات خصم" subtitle="أنشئ مجموعات لتطبيق خصم موحد على منتجات." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="text-right px-4 py-3 font-bold">الاسم</th>
                    <th className="text-right px-4 py-3 font-bold">النوع</th>
                    <th className="text-right px-4 py-3 font-bold">القيمة</th>
                    <th className="text-right px-4 py-3 font-bold">المعادلة</th>
                    <th className="text-right px-4 py-3 font-bold">المنتجات</th>
                    <th className="text-right px-4 py-3 font-bold">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {discountGroups.map((g) => (
                    <tr key={g.id} className="table-row dark:bg-slate-900">
                      <td className="px-4 py-3 font-semibold dark:text-slate-200">{g.name}</td>
                      <td className="px-4 py-3"><Badge color={g.discount_type === 'fixed' ? 'sky' : 'amber'}>{g.discount_type === 'fixed' ? 'مبلغ ثابت' : 'نسبة مئوية'}</Badge></td>
                      <td className="px-4 py-3 font-bold dark:text-slate-200">{g.discount_type === 'fixed' ? money(g.discount_value) : `${g.discount_value}%`}</td>
                      <td className="px-4 py-3"><button onClick={() => toggleGroupActive(g)} className="cursor-pointer"><Badge color={g.active ? 'emerald' : 'slate'}>{g.active ? 'مفعّلة' : 'معطّلة'}</Badge></button></td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{products.filter((p) => p.discount_group_id === g.id).length}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openLinkModal(g)} className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30" title="ربط الأصناف"><Link2 size={16} /></button>
                          <button onClick={() => { setEditGroup(g); setGName(g.name); setGType(g.discount_type); setGValue(String(g.discount_value)); setGroupOpen(true); }} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30"><Pencil size={16} /></button>
                          <button onClick={() => toggleGroupActive(g)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title="تفعيل/تعطيل"><Tag size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="card overflow-hidden dark:bg-slate-900">
          {invoices.length === 0 ? (
            <EmptyState icon={<CupSoda size={36} />} title="لا توجد فواتير" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="text-right px-4 py-3 font-bold">التاريخ</th>
                    <th className="text-right px-4 py-3 font-bold">الزبون</th>
                    <th className="text-right px-4 py-3 font-bold">الإجمالي</th>
                    <th className="text-right px-4 py-3 font-bold">المدفوع</th>
                    <th className="text-right px-4 py-3 font-bold">الربح</th>
                    <th className="text-right px-4 py-3 font-bold">الحالة</th>
                    <th className="text-right px-4 py-3 font-bold">الأصناف</th>
                    <th className="text-right px-4 py-3 font-bold">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {invoices.map((inv) => {
                    const cust = inv.customer_id ? db.first<any>('customers', (r) => r.id === inv.customer_id) : null;
                    const items = db.select<any>('invoice_items').filter((i) => i.invoice_id === inv.id);
                    const isOpen = expandedInv === inv.id;
                    return (
                      <Fragment key={inv.id}>
                        <tr className={`table-row ${inv.reversed ? 'opacity-50' : ''} dark:bg-slate-900`}>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDateTime(inv.created_at)}</td>
                          <td className="px-4 py-3 font-semibold dark:text-slate-200">
                            {cust?.name || 'زبون عابر'}
                            {cust && (
                              <button onClick={() => setStatementCustId(cust.id)} className="mr-2 p-1 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30" title="كشف حساب"><FileText size={14} /></button>
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold dark:text-slate-200">{money(inv.total)}</td>
                          <td className="px-4 py-3 text-emerald-600">{money(inv.paid_amount || (inv.paid ? inv.total : 0))}</td>
                          <td className="px-4 py-3 text-emerald-600">{money(inv.realized_profit ?? inv.profit)}</td>
                          <td className="px-4 py-3">
                            {inv.reversed ? <Badge color="rose">معكوسة</Badge> :
                             inv.paid ? <Badge color="emerald">مدفوع</Badge> :
                             (Number(inv.paid_amount) > 0 ? <Badge color="amber">آجل جزئي</Badge> : <Badge color="rose">غير مدفوع</Badge>)}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            <button onClick={() => setExpandedInv(isOpen ? null : inv.id)} className="flex items-center gap-1 hover:text-sky-600">
                              {items.length} صنف
                              <ChevronDown size={14} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {!inv.reversed && (
                              <button onClick={() => reverseInvoice(inv)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="عكس الفاتورة"><Undo2 size={16} /></button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50 dark:bg-slate-800/50">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="space-y-1.5">
                                {items.length === 0 ? (
                                  <p className="text-xs text-slate-400">لا توجد أصناف مسجلة.</p>
                                ) : (
                                  items.map((it) => (
                                    <div key={it.id} className="flex justify-between text-xs py-1 border-b border-slate-200 last:border-0 dark:border-slate-700">
                                      <span className="font-semibold text-slate-700 dark:text-slate-200">{it.name} × {it.qty}</span>
                                      <span className="text-slate-500 dark:text-slate-400">{money(it.unit_price)} → {money(it.line_total)}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title={editGroup ? 'تعديل مجموعة' : 'مجموعة خصم جديدة'} size="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">اسم المجموعة *</label><input className="input" value={gName} onChange={(e) => setGName(e.target.value)} autoFocus /></div>
          <div>
            <label className="label">نوع الخصم</label>
            <div className="flex gap-2">
              <button onClick={() => setGType('fixed')} className={`flex-1 py-3 rounded-xl font-bold ${gType === 'fixed' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>مبلغ ثابت</button>
              <button onClick={() => setGType('percentage')} className={`flex-1 py-3 rounded-xl font-bold ${gType === 'percentage' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>نسبة %</button>
            </div>
          </div>
          <div><label className="label">القيمة *</label><input className="input" type="number" value={gValue} onChange={(e) => setGValue(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setGroupOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={saveGroup} className="btn-primary">حفظ</button>
        </div>
      </Modal>

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="إتمام الفاتورة" size="md">
        <div className="space-y-3">
          <div>
            <label className="label">طريقة الدفع</label>
            <div className="flex gap-2">
              <button onClick={() => { setPaid(true); setCustomerId(''); setCustSearch(''); setPaidAmount(''); }} className={`flex-1 py-3 rounded-xl font-bold transition ${paid ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>زبون عابر (كاش)</button>
              <button onClick={() => setPaid(false)} className={`flex-1 py-3 rounded-xl font-bold transition ${!paid ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>آجل</button>
            </div>
          </div>

          {!paid && (
            <div className="relative">
              <label className="label">الزبون * (بحث وإضافة سريعة)</label>
              <div className="relative">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pr-9"
                  value={custSearch}
                  onChange={(e) => { setCustSearch(e.target.value); setCustomerId(''); setShowCustDropdown(true); }}
                  onFocus={() => setShowCustDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustDropdown(false), 150)}
                  placeholder="اكتب اسم الزبون للبحث..."
                  autoFocus
                />
                {custSearch && (
                  <button onClick={() => { setCustSearch(''); setCustomerId(''); }} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500"><X size={14} /></button>
                )}
              </div>
              {showCustDropdown && customerMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg dark:bg-slate-800 dark:border-slate-700">
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={() => { setCustomerId(c.id); setCustSearch(c.name); setShowCustDropdown(false); }}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-sky-50 dark:hover:bg-sky-900/30 ${customerId === c.id ? 'bg-sky-100 dark:bg-sky-900/50' : ''} dark:text-slate-200`}
                    >
                      <span className="font-semibold">{c.name}</span>
                      {c.phone && <span className="text-xs text-slate-400 mr-2">{c.phone}</span>}
                      {c.debt_locked && <Badge color="rose">مقفل</Badge>}
                    </button>
                  ))}
                </div>
              )}
              {showCustDropdown && customerMatches.length === 0 && custSearch.trim() && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg dark:bg-slate-800 dark:border-slate-700">
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">لا يوجد زبون بهذا الاسم</div>
                  <button onMouseDown={quickAddCustomer} className="w-full text-right px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 font-bold flex items-center gap-1 dark:hover:bg-emerald-900/30">
                    <UserPlus size={14} /> إضافة «{custSearch.trim()}» كزبون
                  </button>
                </div>
              )}
              {customerId && exactMatch && (
                <p className="text-xs text-emerald-600 mt-1 font-semibold">✓ تم اختيار: {exactMatch.name}</p>
              )}
              {customerId && !exactMatch && (
                <p className="text-xs text-amber-600 mt-1 font-semibold">✓ سيتم إنشاء زبون جديد عند التأكيد</p>
              )}
            </div>
          )}

          <div className="card p-3 bg-slate-50 dark:bg-slate-800">
            {cart.map((i) => (
              <div key={i.product_id} className="flex justify-between text-sm py-1 dark:text-slate-200">
                <span>{i.name} × {i.qty}</span><span className="font-semibold">{money(i.line_total)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm text-slate-500 border-t border-slate-200 mt-2 pt-2 dark:text-slate-400 dark:border-slate-700">
              <span>المجموع الفرعي</span><span>{money(cartSubtotal)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-slate-200 mt-1 pt-2 dark:text-slate-100 dark:border-slate-700">
              <span>الإجمالي</span><span>{money(cartTotal)}</span>
            </div>
          </div>
          <div>
            <label className="label">الخصم</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setDiscountType('none')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${discountType === 'none' ? 'bg-slate-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>بدون</button>
              <button onClick={() => setDiscountType('fixed')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${discountType === 'fixed' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>مبلغ</button>
              <button onClick={() => setDiscountType('percentage')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${discountType === 'percentage' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-200'}`}>نسبة %</button>
            </div>
            {discountType !== 'none' && (
              <input className="input" type="number" placeholder={discountType === 'fixed' ? 'مبلغ الخصم' : 'نسبة الخصم %'} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            )}
          </div>
          {!paid && (
            <div>
              <label className="label">المبلغ المدفوع الآن</label>
              <input className="input text-xl font-bold" type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" />
              {remainingDebt > 0 && (
                <p className="text-sm text-rose-600 mt-1 font-semibold">الدين المتبقي: {money(remainingDebt)}</p>
              )}
            </div>
          )}
          <div><label className="label">ملاحظة</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setInvoiceOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={checkout} className="btn-primary"><Check size={18} /> تأكيد الفاتورة</button>
        </div>
      </Modal>

      {/* Detailed statement modal */}
      <Modal open={statementCustId !== null} onClose={() => { setStatementCustId(null); setExpandedInv(null); }} title={`كشف حساب — ${statementCustomer?.name || ''}`} size="lg">
        {statementCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="card p-3 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">الرصيد الحالي</p>
                <p className={`font-bold text-lg ${getCustomerBalance(statementCustomer.id) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(getCustomerBalance(statementCustomer.id))}</p>
              </div>
              <div className="card p-3 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">حد الثقة</p>
                <p className="font-bold text-lg dark:text-slate-200">{money(statementCustomer.trust_limit)}</p>
              </div>
              <div className="card p-3 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">حد مشروبات</p>
                <p className="font-bold text-lg dark:text-slate-200">{money(statementCustomer.drinks_credit_limit)}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-700 mb-2 dark:text-slate-200">الفواتير</h4>
              {statementInvoices.length === 0 ? (
                <p className="text-sm text-slate-400">لا توجد فواتير.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {statementInvoices.map((inv) => {
                    const items = invoiceItemsFor(inv.id);
                    const isOpen = expandedInv === inv.id;
                    return (
                      <div key={inv.id} className="border border-slate-200 rounded-xl overflow-hidden dark:border-slate-700">
                        <button onClick={() => setExpandedInv(isOpen ? null : inv.id)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700">
                          <div className="flex items-center gap-2">
                            <ChevronLeft size={14} className={`transition ${isOpen ? '-rotate-90' : ''} dark:text-slate-400`} />
                            <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(inv.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge color={inv.paid ? 'emerald' : 'rose'}>{inv.paid ? 'مدفوع' : 'آجل'}</Badge>
                            <span className="font-bold text-sm dark:text-slate-200">{money(inv.total)}</span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-3 py-2 bg-white dark:bg-slate-900">
                            {items.length === 0 ? (
                              <p className="text-xs text-slate-400">لا توجد أصناف.</p>
                            ) : (
                              items.map((it) => (
                                <div key={it.id} className="flex justify-between text-xs py-1 border-b border-slate-100 last:border-0 dark:border-slate-700">
                                  <span className="font-semibold dark:text-slate-200">{it.name} × {it.qty}</span>
                                  <span className="text-slate-500 dark:text-slate-400">{money(it.unit_price)} → {money(it.line_total)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-bold text-slate-700 mb-2 dark:text-slate-200">حركات الدين</h4>
              {statementDebts.length === 0 ? (
                <p className="text-sm text-slate-400">لا توجد حركات.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {statementDebts.map((d) => {
                    const dev = deviceFor(d.related_device_id);
                    return (
                      <div key={d.id} className="flex items-start justify-between px-3 py-2 bg-slate-50 rounded-xl dark:bg-slate-800">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(d.created_at)}</p>
                          <p className="text-sm font-semibold dark:text-slate-200">{d.description || d.type}</p>
                          {dev && (
                            <p className="text-xs text-sky-600 mt-0.5">
                              🔌 {dev.device_type}{dev.device_number ? ` (${dev.device_number})` : ''}{dev.accessory ? ` — ${dev.accessory}` : ''} — {money(dev.price)}
                            </p>
                          )}
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-bold ${Number(d.debit) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {Number(d.debit) > 0 ? `+${money(d.debit)}` : `-${money(d.credit)}`}
                          </p>
                          <p className="text-xs text-slate-400">رصيد: {money(d.balance_after)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Link items to group modal */}
      <Modal open={linkGroup !== null} onClose={() => setLinkGroup(null)} title={`ربط الأصناف — ${linkGroup?.name || ''}`} size="md">
        {linkGroup && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {products.length === 0 ? (
              <EmptyState icon={<Package size={32} />} title="لا توجد أصناف" />
            ) : (
              products.map((p) => (
                <label key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 cursor-pointer hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700">
                  <input
                    type="checkbox"
                    checked={!!linkPicks[p.id]}
                    onChange={(e) => setLinkPicks((s) => ({ ...s, [p.id]: e.target.checked }))}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-xl">{p.icon || '📦'}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm dark:text-slate-200">{p.name}</p>
                    <p className="text-xs text-slate-400">{money(p.sell_price)} — مخزون: {p.quantity}</p>
                  </div>
                  {p.discount_group_id && p.discount_group_id !== linkGroup.id && (
                    <Badge color="slate">{groupName(p.discount_group_id)}</Badge>
                  )}
                </label>
              ))
            )}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setLinkGroup(null)} className="btn-ghost">إلغاء</button>
          <button onClick={saveLinkPicks} className="btn-primary"><Link2 size={16} /> حفظ الربط</button>
        </div>
      </Modal>
    </div>
  );
}
