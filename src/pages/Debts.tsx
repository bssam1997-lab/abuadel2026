import { useEffect, useState } from 'react';
import { Users, Plus, FileText, HandCoins, Lock, Unlock, Star, Printer, Pencil, Trash2, Undo2, ArrowDownCircle, ArrowUpCircle, Filter, Tag, Search } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { money, fmtDateTime, fmtDate } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState } from '../components/ui';

const DEBT_TYPES: { value: string; label: string; color: any }[] = [
  { value: 'charging', label: 'شحن', color: 'sky' },
  { value: 'drinks', label: 'مشروبات', color: 'amber' },
  { value: 'manual', label: 'يدوي', color: 'slate' },
  { value: 'deposit', label: 'إيداع', color: 'emerald' },
  { value: 'withdrawal', label: 'سحب', color: 'rose' },
  { value: 'settlement', label: 'تسوية', color: 'violet' },
  { value: 'trust', label: 'ثقة', color: 'sky' },
];

const MANUAL_TYPES: { value: any; label: string; isDebit: boolean }[] = [
  { value: 'charging', label: 'دين شحن', isDebit: true },
  { value: 'drinks', label: 'دين مشروبات', isDebit: true },
  { value: 'deposit', label: 'إيداع', isDebit: false },
  { value: 'withdrawal', label: 'سحب', isDebit: true },
  { value: 'settlement', label: 'تسوية', isDebit: false },
  { value: 'trust', label: 'زيادة حد الثقة', isDebit: true },
];

function debtTypeLabel(t: string): string {
  return DEBT_TYPES.find((d) => d.value === t)?.label || t;
}
function debtTypeColor(t: string): any {
  return DEBT_TYPES.find((d) => d.value === t)?.color || 'slate';
}

export default function Debts({ requirePin }: { requirePin: (fn: () => void) => void }) {
  const { log, requireOwnerPassword } = useStore();
  const { push } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editCust, setEditCust] = useState<any | null>(null);
  const [statement, setStatement] = useState<any | null>(null);
  const [debts, setDebts] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [deleteCust, setDeleteCust] = useState<any | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [payMode, setPayMode] = useState<'charging' | 'drinks' | 'auto'>('auto');

  const [searchQuery, setSearchQuery] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [trustLimit, setTrustLimit] = useState('0');
  const [isVip, setIsVip] = useState(false);
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));

  const [payAmount, setPayAmount] = useState('');
  const [payCharging, setPayCharging] = useState('0');
  const [payDrinks, setPayDrinks] = useState('0');
  const [payNote, setPayNote] = useState('');
  const [payDiscount, setPayDiscount] = useState('');

  const [manualType, setManualType] = useState<any>('charging');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  const load = () => {
    const all = db.select<any>('customers').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const allDebts = db.select<any>('debts');
    const enriched = all.map((c) => {
      const custDebts = allDebts.filter((d) => d.customer_id === c.id && !d.reversed).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const totalDebit = custDebts.reduce((s: number, d: any) => s + Number(d.debit), 0);
      const totalCredit = custDebts.reduce((s: number, d: any) => s + Number(d.credit), 0);
      const lastMove = custDebts.length ? custDebts[custDebts.length - 1].created_at : null;
      const chargingDebt = custDebts.filter((d) => d.type === 'charging').reduce((s: number, d: any) => s + Number(d.debit) - Number(d.credit), 0);
      const drinksDebt = custDebts.filter((d) => d.type === 'drinks').reduce((s: number, d: any) => s + Number(d.debit) - Number(d.credit), 0);
      return { ...c, total_debit: totalDebit, total_credit: totalCredit, balance: totalDebit - totalCredit, last_move: lastMove, charging_debt: chargingDebt, drinks_debt: drinksDebt };
    });
    setCustomers(enriched);
  };

  useEffect(() => { load(); }, []);

  const saveCustomer = () => {
    if (!name.trim()) { push('أدخل اسم الزبون', 'error'); return; }
    const payload = { name: name.trim(), phone: phone || null, notes: notes || null, credit_limit: Number(creditLimit) || 0, trust_limit: Number(trustLimit) || 0, drinks_credit_limit: 0, is_vip: isVip };
    if (editCust) {
      db.updateById('customers', editCust.id, payload);
      log('edit_customer', 'customers', editCust.id, name);
      push('تم تعديل الزبون', 'success');
    } else {
      const created = db.insert('customers', { ...payload, debt_locked: false, created_at: new Date(joinDate).toISOString() });
      log('add_customer', 'customers', created.id, name);
      push('تم إضافة الزبون', 'success');
    }
    setAddOpen(false); setEditCust(null);
    setName(''); setPhone(''); setNotes(''); setCreditLimit('0'); setTrustLimit('0'); setIsVip(false); setJoinDate(new Date().toISOString().slice(0, 10));
    load();
  };

  const toggleLock = (c: any) => {
    requirePin(() => {
      db.updateById('customers', c.id, { debt_locked: !c.debt_locked });
      log('toggle_debt_lock', 'customers', c.id, String(!c.debt_locked));
      push(c.debt_locked ? 'تم فتح قفل المديونية' : 'تم قفل المديونية', 'success');
      load();
    });
  };

  const confirmDeleteCustomer = () => {
    if (!deleteCust) return;
    requireOwnerPassword(() => {
      const custDebts = db.select<any>('debts').filter((d) => d.customer_id === deleteCust.id);
      if (custDebts.length > 0 && Math.abs(deleteCust.balance) > 0.01) {
        push('لا يمكن حذف زبون له رصيد غير صفري. صفِّ الحساب أولًا.', 'error');
        return;
      }
      custDebts.forEach((d) => db.removeById('debts', d.id));
      db.removeById('customers', deleteCust.id);
      log('delete_customer', 'customers', deleteCust.id, deleteCust.name);
      push('تم حذف الزبون', 'success');
      setDeleteCust(null);
      load();
    });
  };

  const openStatement = (c: any) => {
    setStatement(c);
    setDebts(buildUnifiedStatement(c.id));
  };

  // Build a unified, chronological statement merging debts, invoices (with items), and devices.
  const buildUnifiedStatement = (customerId: string): any[] => {
    const rows: any[] = [];

    // 1. debts table (charging debts, payments, manual entries, settlements, trust, etc.)
    db.select<any>('debts')
      .filter((d) => d.customer_id === customerId)
      .forEach((d) => {
        rows.push({
          id: d.id,
          source: 'debt',
          type: d.type,
          customer_id: d.customer_id,
          created_at: d.created_at,
          description: d.description || '',
          debit: Number(d.debit) || 0,
          credit: Number(d.credit) || 0,
          balance_after: Number(d.balance_after) || 0,
          reversed: !!d.reversed,
        });
      });

    // 2. invoices + invoice_items (drinks) — expand each invoice into itemized rows
    db.select<any>('invoices')
      .filter((i) => i.customer_id === customerId && !i.reversed)
      .forEach((inv) => {
        const items = db.select<any>('invoice_items').filter((it) => it.invoice_id === inv.id);
        const itemsDesc = items.map((it) => `${it.name || 'صنف'} ×${Number(it.qty) || 1}`).join('، ');
        rows.push({
          id: inv.id,
          source: 'invoice',
          type: 'drinks',
          created_at: inv.created_at,
          description: `مشروبات: ${itemsDesc || 'فاتورة مشروبات'}`,
          debit: Number(inv.total) || 0,
          credit: 0,
          balance_after: 0, // recomputed below
          reversed: false,
        });
      });

    // 3. devices table (charging details: device type + accessory)
    db.select<any>('devices')
      .filter((d) => d.customer_id === customerId)
      .forEach((d) => {
        const parts = [d.device_type, d.accessory].filter(Boolean).join(' - ');
        rows.push({
          id: d.id,
          source: 'device',
          type: 'charging',
          created_at: d.created_at,
          description: `شحن: ${parts || 'جهاز'}`,
          debit: Number(d.amount) || Number(d.price) || 0,
          credit: 0,
          balance_after: 0, // recomputed below
          reversed: !!d.reversed,
        });
      });

    // Sort chronologically (stable)
    rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

    // Recompute running balance across the unified timeline.
    // debts rows already carry an authoritative balance_after; for invoice/device rows
    // we recompute by walking the timeline and accumulating debit - credit.
    let running = 0;
    rows.forEach((r) => {
      if (r.source === 'debt') {
        running = Number(r.balance_after) || (running + r.debit - r.credit);
      } else {
        running = running + r.debit - r.credit;
        r.balance_after = running;
      }
    });

    return rows;
  };

  const submitPayment = () => {
    if (!statement) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) { push('أدخل مبلغًا صحيحًا', 'error'); return; }
    const discount = Number(payDiscount) || 0;
    const effectiveAmt = amt - discount;
    if (effectiveAmt <= 0 && discount <= 0) { push('المبلغ غير صحيح', 'error'); return; }

    const lastBalance = debts.length ? Number(debts[debts.length - 1].balance_after) : 0;
    const newBalance = lastBalance - amt + discount;

    // Determine payment type and allocation
    let payType = 'manual';
    let chargingPart = Number(payCharging) || 0;
    let drinksPart = Number(payDrinks) || 0;
    if (payMode === 'charging') { payType = 'charging'; chargingPart = amt; }
    else if (payMode === 'drinks') { payType = 'drinks'; drinksPart = amt; }
    else {
      // auto: allocate to largest balance first
      if (statement.charging_debt >= statement.drinks_debt) {
        payType = 'charging';
        const afterCharging = Math.max(0, statement.charging_debt - amt);
        chargingPart = statement.charging_debt - afterCharging;
        drinksPart = Math.max(0, amt - chargingPart);
      } else {
        payType = 'drinks';
        const afterDrinks = Math.max(0, statement.drinks_debt - amt);
        drinksPart = statement.drinks_debt - afterDrinks;
        chargingPart = Math.max(0, amt - drinksPart);
      }
    }

    db.insert('debts', {
      customer_id: statement.id, type: payType, description: payNote || 'تسديد دين',
      debit: 0, credit: amt, balance_after: newBalance, reversed: false, created_at: db.now(),
    });
    if (discount > 0) {
      db.insert('debts', {
        customer_id: statement.id, type: 'settlement', description: `خصم ${money(discount)}`,
        debit: 0, credit: discount, balance_after: newBalance, reversed: false, created_at: db.now(),
      });
    }
    db.insert('debt_payments', {
      customer_id: statement.id, amount: amt,
      charging_part: chargingPart, drinks_part: drinksPart, discount_part: discount, note: payNote || null, created_at: db.now(),
    });
    const box = db.first<any>('cash_boxes', (r) => r.code === 'charging');
    if (box) {
      db.updateById('cash_boxes', box.id, { balance: Number(box.balance) + amt });
      db.insert('cash_box_ledger', { cash_box_id: box.id, type: 'in', amount: amt, reason: `تسديد دين: ${statement.name}`, created_at: db.now() });
    }
    if (discount > 0) {
      const dBox = db.first<any>('cash_boxes', (r) => r.code === 'daily_debts');
      if (dBox) {
        db.updateById('cash_boxes', dBox.id, { balance: Number(dBox.balance) - discount });
        db.insert('cash_box_ledger', { cash_box_id: dBox.id, type: 'out', amount: discount, reason: `خصم دين: ${statement.name}`, created_at: db.now() });
      }
    }

    // Debt lock 50%/90% rules: update drinks_credit_limit
    const cust = db.first<any>('customers', (r) => r.id === statement.id);
    if (cust?.debt_locked) {
      const currentLimit = Number(cust.drinks_credit_limit) || 0;
      if (drinksPart > 0) {
        const drinksDebtBefore = statement.drinks_debt;
        if (drinksPart >= drinksDebtBefore) {
          // Full settlement: 90% of settled amount
          const newLimit = currentLimit + Math.round(drinksPart * 0.9 * 100) / 100;
          db.updateById('customers', statement.id, { drinks_credit_limit: newLimit });
        } else {
          // Partial payment: 50% of payment
          const newLimit = currentLimit + Math.round(drinksPart * 0.5 * 100) / 100;
          db.updateById('customers', statement.id, { drinks_credit_limit: newLimit });
        }
      }
    }

    // Realize deferred drinks profit on drinks payment
    if (drinksPart > 0) {
      const pBox = db.first<any>('cash_boxes', (r) => r.code === 'drinks_profit');
      if (pBox) {
        // Find unpaid drinks invoices for this customer and realize profit proportionally
        const custInvoices = db.select<any>('invoices').filter((i) => i.customer_id === statement.id && !i.reversed && Number(i.realized_profit) < Number(i.profit));
        let remaining = drinksPart;
        let totalRealized = 0;
        for (const inv of custInvoices) {
          if (remaining <= 0) break;
          const invTotal = Number(inv.total);
          const invPaid = Number(inv.paid_amount || 0);
          const invDebt = invTotal - invPaid;
          if (invDebt <= 0) continue;
          const apply = Math.min(remaining, invDebt);
          const profitRatio = invTotal > 0 ? apply / invTotal : 0;
          const profitToRealize = Number(inv.profit) * profitRatio;
          const newRealized = Number(inv.realized_profit || 0) + profitToRealize;
          db.updateById('invoices', inv.id, { realized_profit: newRealized, paid_amount: Number(inv.paid_amount || 0) + apply });
          totalRealized += profitToRealize;
          remaining -= apply;
        }
        if (totalRealized > 0) {
          db.updateById('cash_boxes', pBox.id, { balance: Number(pBox.balance) + totalRealized });
          db.insert('cash_box_ledger', { cash_box_id: pBox.id, type: 'in', amount: totalRealized, reason: `أرباح محققة من تسديد: ${statement.name}`, created_at: db.now() });
        }
      }
    }

    log('pay_debt', 'debts', statement.id, String(amt));
    push('تم تسديد الدين', 'success');
    setPayOpen(false); setPayAmount(''); setPayCharging('0'); setPayDrinks('0'); setPayNote(''); setPayDiscount('');
    openStatement(statement);
    load();
  };

  const undoPayment = (d: any) => {
    requireOwnerPassword(() => {
      if (d.reversed) { push('الحركة معكوسة مسبقًا', 'error'); return; }
      const allDebts = db.select<any>('debts').filter((x) => x.customer_id === d.customer_id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const idx = allDebts.findIndex((x) => x.id === d.id);
      const reversedCredit = Number(d.credit);
      const reversedDebit = Number(d.debit);
      // Mark reversed
      db.updateById('debts', d.id, { reversed: true });
      // Recalculate balances for this row and all subsequent
      let runningBalance = idx > 0 ? Number(allDebts[idx - 1].balance_after) : 0;
      for (let i = idx; i < allDebts.length; i++) {
        const row = allDebts[i];
        if (row.id === d.id || row.reversed) {
          // reversed row contributes 0 to balance
        } else {
          runningBalance = runningBalance + Number(row.debit) - Number(row.credit);
        }
        db.updateById('debts', allDebts[i].id, { balance_after: runningBalance });
      }
      // Reverse cash box: route by debt type
      // credit payments go into the corresponding cash box; reverse them
      if (reversedCredit > 0) {
        const boxCode = d.type === 'drinks' ? 'drinks' : 'charging';
        const box = db.first<any>('cash_boxes', (r) => r.code === boxCode);
        if (box) {
          db.updateById('cash_boxes', box.id, { balance: Number(box.balance) - reversedCredit });
          db.insert('cash_box_ledger', { cash_box_id: box.id, type: 'out', amount: reversedCredit, reason: `إلغاء حركة: ${statement?.name || ''}`, related_id: d.id, created_at: db.now() });
        }
      }
      // Reverse discount/settlement from daily_debts box if applicable
      if (reversedCredit > 0 && d.type === 'settlement') {
        const dBox = db.first<any>('cash_boxes', (r) => r.code === 'daily_debts');
        if (dBox) {
          db.updateById('cash_boxes', dBox.id, { balance: Number(dBox.balance) + reversedCredit });
          db.insert('cash_box_ledger', { cash_box_id: dBox.id, type: 'in', amount: reversedCredit, reason: `إلغاء خصم: ${statement?.name || ''}`, related_id: d.id, created_at: db.now() });
        }
      }
      log('undo_payment', 'debts', d.id, String(reversedCredit || reversedDebit));
      push('تم إلغاء الحركة وتحديث الرصيد', 'success');
      if (statement) openStatement(statement);
      load();
    });
  };

  const submitManual = () => {
    if (!statement) return;
    const amt = Number(manualAmount) || 0;
    if (amt <= 0) { push('أدخل مبلغًا', 'error'); return; }
    const def = MANUAL_TYPES.find((m) => m.value === manualType);
    const isDebit = def?.isDebit ?? true;
    const lastBalance = debts.length ? Number(debts[debts.length - 1].balance_after) : 0;
    const newBalance = isDebit ? lastBalance + amt : lastBalance - amt;
    db.insert('debts', {
      customer_id: statement.id, type: manualType, description: manualDesc || def?.label || 'حركة يدوية',
      debit: isDebit ? amt : 0, credit: isDebit ? 0 : amt, balance_after: newBalance, reversed: false, created_at: db.now(),
    });
    // For trust type, also update trust_limit
    if (manualType === 'trust') {
      db.updateById('customers', statement.id, { trust_limit: (Number(statement.trust_limit) || 0) + amt });
    }
    log('manual_debt', 'debts', statement.id, String(amt));
    push('تمت إضافة الحركة', 'success');
    setManualOpen(false); setManualAmount(''); setManualDesc('');
    openStatement(statement);
    load();
  };

  const printStatement = () => {
    const c = statement;
    if (!c) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const opening = debts.length ? (Number(debts[0].balance_after) - Number(debts[0].debit) + Number(debts[0].credit)) : 0;
    const totalDebit = debts.reduce((s: number, d: any) => s + (Number(d.debit) || 0), 0);
    const totalCredit = debts.reduce((s: number, d: any) => s + (Number(d.credit) || 0), 0);
    const closing = debts.length ? Number(debts[debts.length - 1].balance_after) : Number(c.balance || 0);
    const rows = debts.map((d) => `
      <tr${d.reversed ? ' style="opacity:0.4"' : ''}>
        <td>${fmtDate(d.created_at)}</td>
        <td>${debtTypeLabel(d.type)}</td>
        <td>${(d.description || '').replace(/</g, '&lt;')}</td>
        <td style="text-align:left">${d.debit ? Number(d.debit).toFixed(2) : ''}</td>
        <td style="text-align:left">${d.credit ? Number(d.credit).toFixed(2) : ''}</td>
        <td style="text-align:left;font-weight:700">${Number(d.balance_after).toFixed(2)}</td>
      </tr>`).join('');
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>كشف حساب</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;color:#475569;margin:0 0 4px} h3{font-size:13px;color:#64748b;margin:0 0 16px;font-weight:400}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
        th,td{padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right}
        th{background:#f1f5f9;font-weight:700;color:#475569}
        tr:nth-child(even){background:#f8fafc}
        .sum{display:flex;justify-content:space-between;margin-top:14px;padding:10px 14px;border-radius:10px;font-size:14px}
        .sum.opening{background:#f1f5f9;color:#334155}
        .sum.closing{background:#dbeafe;color:#1e3a8a;font-weight:800;font-size:16px}
        .totals{display:flex;gap:12px;margin-top:10px}
        .totals div{flex:1;padding:8px 12px;border-radius:8px;font-size:13px}
        .totals .d{background:#fee2e2;color:#991b1b} .totals .c{background:#dcfce7;color:#166534}
      </style></head><body>
      <h1>نظام نقطة شحن أبو عادل</h1>
      <h2>كشف حساب: ${c.name}</h2>
      <h3>تاريخ الكشف: ${fmtDate(new Date())}</h3>
      <div class="sum opening"><span>الرصيد الافتتاحي</span><span>${money(opening)}</span></div>
      <table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="totals">
        <div class="d">إجمالي المدين: ${money(totalDebit)}</div>
        <div class="c">إجمالي المدفوع: ${money(totalCredit)}</div>
      </div>
      <div class="sum closing"><span>الرصيد الحالي</span><span>${money(closing)}</span></div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  const filteredDebts = typeFilter === 'all' ? debts : debts.filter((d) => d.type === typeFilter);

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<Users size={24} />}>إدارة الديون والزبائن</SectionTitle>
        <button onClick={() => { setEditCust(null); setName(''); setPhone(''); setNotes(''); setCreditLimit('0'); setTrustLimit('0'); setIsVip(false); setJoinDate(new Date().toISOString().slice(0, 10)); setAddOpen(true); }} className="btn-primary"><Plus size={18} /> زبون جديد</button>
      </div>

      <div className="card overflow-hidden dark:bg-slate-900 dark:border-slate-700">
        {customers.length === 0 ? (
          <EmptyState icon={<Users size={36} />} title="لا يوجد زبائن" subtitle="أضف زبونًا للبدء." />
        ) : (
          <>
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                className="input pr-9 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                placeholder="بحث ذكي بالاسم أو الهاتف أو الملاحظات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">الزبون</th>
                  <th className="text-right px-4 py-3 font-bold">الهاتف</th>
                  <th className="text-right px-4 py-3 font-bold">دين شحن</th>
                  <th className="text-right px-4 py-3 font-bold">دين مشروبات</th>
                  <th className="text-right px-4 py-3 font-bold">الرصيد</th>
                  <th className="text-right px-4 py-3 font-bold">حد الثقة</th>
                  <th className="text-right px-4 py-3 font-bold">آخر حركة</th>
                  <th className="text-right px-4 py-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {customers
                  .filter((c) => {
                    const q = searchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (c.name || '').toLowerCase().includes(q) ||
                      (c.phone || '').toLowerCase().includes(q) ||
                      (c.notes || '').toLowerCase().includes(q)
                    );
                  })
                  .map((c) => (
                  <tr key={c.id} className="table-row dark:text-slate-200">
                    <td className="px-4 py-3 font-semibold">
                      <div className="flex items-center gap-1.5">
                        {c.is_vip && <Star size={14} className="text-amber-500 fill-amber-400" />}
                        {c.name}
                        {c.debt_locked && <Lock size={12} className="text-rose-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-sky-600 font-semibold">{money(c.charging_debt || 0)}</td>
                    <td className="px-4 py-3 text-amber-600 font-semibold">{money(c.drinks_debt || 0)}</td>
                    <td className="px-4 py-3 font-bold">{money(c.balance)}</td>
                    <td className="px-4 py-3 text-slate-500">{c.trust_limit ? money(c.trust_limit) : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.last_move ? fmtDate(c.last_move) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openStatement(c)} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50" title="كشف حساب"><FileText size={16} /></button>
                        <button onClick={() => { setEditCust(c); setName(c.name); setPhone(c.phone || ''); setNotes(c.notes || ''); setCreditLimit(String(c.credit_limit)); setTrustLimit(String(c.trust_limit || 0)); setIsVip(c.is_vip); setAddOpen(true); }} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100" title="تعديل"><Pencil size={16} /></button>
                        <button onClick={() => toggleLock(c)} className={`p-1.5 rounded-lg hover:bg-slate-100 ${c.debt_locked ? 'text-rose-500' : 'text-slate-400'}`} title="قفل المديونية">{c.debt_locked ? <Lock size={16} /> : <Unlock size={16} />}</button>
                        <button onClick={() => setDeleteCust(c)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title="حذف الزبون"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editCust ? 'تعديل زبون' : 'زبون جديد'} size="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">الاسم *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><label className="label">الهاتف</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="label">حد المديونية</label><input className="input" type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} /></div>
          <div><label className="label">حد الثقة (حد السماح)</label><input className="input" type="number" value={trustLimit} onChange={(e) => setTrustLimit(e.target.value)} /></div>
          {!editCust && (
            <div>
              <label className="label">تاريخ الانضمام</label>
              <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
            </div>
          )}
          <div className={editCust ? 'sm:col-span-2' : ''}><label className="label">ملاحظات</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isVip} onChange={(e) => setIsVip(e.target.checked)} className="w-4 h-4" />
            <span className="font-semibold text-slate-700">زبون مميز</span>
          </label>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setAddOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={saveCustomer} className="btn-primary">حفظ</button>
        </div>
      </Modal>

      <Modal open={!!statement} onClose={() => setStatement(null)} title={`كشف حساب: ${statement?.name}`} size="lg">
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setPayOpen(true)} className="btn-success text-sm"><HandCoins size={16} /> تسديد دين</button>
          <button onClick={() => setManualOpen(true)} className="btn-ghost text-sm"><Plus size={16} /> حركة يدوية</button>
          <button onClick={printStatement} className="btn-ghost text-sm"><Printer size={16} /> طباعة الكشف</button>
        </div>
        {/* Opening + Closing balance summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="card p-3 bg-slate-50 dark:bg-slate-800 dark:border-slate-700"><p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">رصيد افتتاحي</p><p className="font-bold text-slate-700 dark:text-slate-200">{money(debts.length ? (debts[0].balance_after - debts[0].debit + debts[0].credit) : 0)}</p></div>
          <div className="card p-3 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800"><p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">إجمالي المدين</p><p className="font-bold text-rose-700 dark:text-rose-300">{money(debts.reduce((s: number, d: any) => s + (Number(d.debit) || 0), 0))}</p></div>
          <div className="card p-3 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800"><p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">إجمالي المدفوع</p><p className="font-bold text-emerald-700 dark:text-emerald-300">{money(debts.reduce((s: number, d: any) => s + (Number(d.credit) || 0), 0))}</p></div>
          <div className="card p-3 bg-sky-50 dark:bg-sky-950/40 dark:border-sky-800"><p className="text-xs text-sky-600 dark:text-sky-400 font-semibold">الرصيد الحالي</p><p className="font-bold text-sky-700 dark:text-sky-300">{money(debts.length ? debts[debts.length - 1].balance_after : (statement?.balance || 0))}</p></div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-400 dark:text-slate-500" />
          <select className="input max-w-48 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">كل الأنواع</option>
            {DEBT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <span className="text-xs text-slate-400 dark:text-slate-500">{filteredDebts.length} حركة</span>
        </div>
        {filteredDebts.length === 0 ? (
          <EmptyState title="لا توجد حركات" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                <tr>
                  <th className="text-right px-3 py-2.5 font-bold">التاريخ</th>
                  <th className="text-right px-3 py-2.5 font-bold">النوع</th>
                  <th className="text-right px-3 py-2.5 font-bold">البيان</th>
                  <th className="text-right px-3 py-2.5 font-bold">مدين</th>
                  <th className="text-right px-3 py-2.5 font-bold">دائن</th>
                  <th className="text-right px-3 py-2.5 font-bold">الرصيد</th>
                  <th className="text-right px-3 py-2.5 font-bold">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredDebts.map((d) => (
                  <tr key={d.id} className={`table-row dark:text-slate-200 ${d.reversed ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{fmtDateTime(d.created_at)}</td>
                    <td className="px-3 py-2"><Badge color={debtTypeColor(d.type)}>{debtTypeLabel(d.type)}</Badge></td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      <span className={d.source === 'invoice' ? 'text-amber-700 dark:text-amber-300 font-medium' : d.source === 'device' ? 'text-sky-700 dark:text-sky-300 font-medium' : ''}>{d.description || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-rose-600 dark:text-rose-400 font-semibold">{d.debit ? money(d.debit) : '—'}</td>
                    <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-semibold">{d.credit ? money(d.credit) : '—'}</td>
                    <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{money(d.balance_after)}</td>
                    <td className="px-3 py-2">
                      {d.source === 'debt' && !d.reversed && (
                        <button onClick={() => undoPayment(d)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title="إلغاء/حذف الحركة"><Undo2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="تسديد دين" size="md">
        <div className="space-y-3">
          <div><label className="label">المبلغ *</label><input className="input text-xl font-bold" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus /></div>
          <div>
            <label className="label">طريقة التسديد</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setPayMode('auto')} className={`py-2.5 rounded-xl font-bold text-sm ${payMode === 'auto' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>تلقائي</button>
              <button onClick={() => setPayMode('charging')} className={`py-2.5 rounded-xl font-bold text-sm ${payMode === 'charging' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>شحن</button>
              <button onClick={() => setPayMode('drinks')} className={`py-2.5 rounded-xl font-bold text-sm ${payMode === 'drinks' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>مشروبات</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">حصة الشحن</label><input className="input" type="number" value={payCharging} onChange={(e) => setPayCharging(e.target.value)} /></div>
            <div><label className="label">حصة المشروبات</label><input className="input" type="number" value={payDrinks} onChange={(e) => setPayDrinks(e.target.value)} /></div>
          </div>
          <div><label className="label">خصم (مسح جزء من الدين)</label><input className="input" type="number" value={payDiscount} onChange={(e) => setPayDiscount(e.target.value)} placeholder="0" /></div>
          <div><label className="label">ملاحظة</label><input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setPayOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitPayment} className="btn-success">تأكيد التسديد</button>
        </div>
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="حركة يدوية" size="md">
        <div className="space-y-3">
          <div>
            <label className="label">نوع الحركة</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MANUAL_TYPES.map((m) => (
                <button key={m.value} onClick={() => setManualType(m.value)} className={`py-2.5 rounded-xl font-bold text-sm ${manualType === m.value ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div><label className="label">المبلغ *</label><input className="input" type="number" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} autoFocus /></div>
          <div><label className="label">البيان</label><input className="input" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setManualOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitManual} className="btn-primary">إضافة</button>
        </div>
      </Modal>

      <Modal open={!!deleteCust} onClose={() => setDeleteCust(null)} title="حذف زبون" size="sm">
        <p className="text-slate-600 mb-3">سيتم حذف الزبون <b>{deleteCust?.name}</b>. هذا إجراء حساس ويحتاج تأكيد كلمة مرور المالك.</p>
        {deleteCust && Math.abs(deleteCust.balance) > 0.01 && (
          <p className="text-sm text-rose-600 font-semibold mb-3">تنبيه: للزبون رصيد غير صفري ({money(deleteCust.balance)}). يجب تصفية الحساب قبل الحذف.</p>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setDeleteCust(null)} className="btn-ghost">إلغاء</button>
          <button onClick={confirmDeleteCustomer} disabled={deleteCust && Math.abs(deleteCust.balance) > 0.01} className="btn-danger">تأكيد الحذف</button>
        </div>
      </Modal>
    </div>
  );
}
