import { useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Pencil, FileText, HandCoins, PackagePlus, Receipt, Eye, Printer, BarChart3, Trash2, X } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { money, fmtDateTime, fmtDate, periodRange } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState, Stat } from '../components/ui';
import type { Supplier, InventoryItem } from '../lib/types';

type Period = 'today' | 'week' | 'month' | 'custom';

type InvoiceStatus = 'unpaid' | 'paid';

type SupplierInvoice = {
  id: string;
  supplier_id: string;
  invoice_date: string; // YYYY-MM-DD
  total: number;
  status: InvoiceStatus;
  note: string | null;
  created_at: string;
};

type SupplierInvoiceItem = {
  id: string;
  invoice_id: string;
  name: string;
  qty: number; // number of cartons
  carton_price: number;
  pieces_per_carton: number;
  cost_price: number; // unit cost = carton_price / pieces_per_carton
  line_total: number; // carton_price * qty
};

// Line editor state for the new invoice form (carton-based pricing)
type InvoiceLine = {
  name: string;
  cartonPrice: string;
  piecesPerCarton: string;
  qty: string; // number of cartons
};

type InvoiceRow = {
  invoice: SupplierInvoice;
  supplier: Supplier | null;
  items: SupplierInvoiceItem[];
};

type ReportRow = {
  supplier: Supplier;
  purchases: number;
  payments: number;
  net: number;
  currentBalance: number;
};

const todayStr = (): string => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
};

const escapeHtml = (s: string): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export default function Suppliers() {
  const { log } = useStore();
  const { push } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editSup, setEditSup] = useState<Supplier | null>(null);
  const [statement, setStatement] = useState<Supplier | null>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Full supply invoice state
  const [invOpen, setInvOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [invSupplierId, setInvSupplierId] = useState('');
  const [invDate, setInvDate] = useState(todayStr());
  const [invStatus, setInvStatus] = useState<InvoiceStatus>('unpaid');
  const [invNote, setInvNote] = useState('');
  const [invLines, setInvLines] = useState<InvoiceLine[]>([{ name: '', cartonPrice: '', piecesPerCarton: '', qty: '' }]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [viewInv, setViewInv] = useState<InvoiceRow | null>(null);

  // Reports state
  const [reportPeriod, setReportPeriod] = useState<Period>('month');
  const [reportCustom, setReportCustom] = useState({ from: '', to: '' });
  const [reportOpen, setReportOpen] = useState(false);

  const load = () => {
    setSuppliers(db.select<Supplier>('suppliers').sort((a, b) => a.name.localeCompare(b.name, 'ar')));
    setInvoices(db.select<SupplierInvoice>('supplier_invoices').sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || '')));
  };

  useEffect(() => { load(); }, []);

  const save = () => {
    if (!name.trim()) { push('أدخل الاسم', 'error'); return; }
    const payload = { name: name.trim(), phone: phone || null, notes: notes || null };
    if (editSup) {
      db.updateById('suppliers', editSup.id, payload);
      push('تم التعديل', 'success');
    } else {
      const created = db.insert('suppliers', { ...payload, balance: 0, created_at: db.now() });
      log('add_supplier', 'suppliers', created.id, name);
      push('تمت الإضافة', 'success');
    }
    setAddOpen(false); setEditSup(null); setName(''); setPhone(''); setNotes('');
    load();
  };

  const openStatement = (s: Supplier) => {
    setStatement(s);
    setLedger(db.select<any>('supplier_ledger').filter((l) => l.supplier_id === s.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
  };

  const submitPurchase = () => {
    if (!statement) return;
    const amt = Number(amount) || 0;
    if (amt <= 0) { push('أدخل مبلغًا', 'error'); return; }
    db.updateById('suppliers', statement.id, { balance: Number(statement.balance) + amt });
    db.insert('supplier_ledger', { supplier_id: statement.id, type: 'purchase', amount: amt, note: note || 'مشتريات', created_at: db.now() });
    log('supplier_purchase', 'suppliers', statement.id, String(amt));
    push('تم تسجيل مشتريات', 'success');
    setPurchaseOpen(false); setAmount(''); setNote('');
    const updated = { ...statement, balance: Number(statement.balance) + amt };
    setStatement(updated);
    setLedger(db.select<any>('supplier_ledger').filter((l) => l.supplier_id === updated.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
    load();
  };

  const submitPayment = () => {
    if (!statement) return;
    const amt = Number(amount) || 0;
    if (amt <= 0) { push('أدخل مبلغًا', 'error'); return; }
    if (amt > Number(statement.balance)) { push('المبلغ أكبر من الدين', 'error'); return; }
    const supplierName = statement.name;
    db.updateById('suppliers', statement.id, { balance: Number(statement.balance) - amt });
    db.insert('supplier_ledger', { supplier_id: statement.id, type: 'payment', amount: amt, note: note || 'دفع للمورد', created_at: db.now() });
    // Payment to supplier deducts from drinks cash box
    const drinksBox = db.first<any>('cash_boxes', (r) => r.code === 'drinks');
    if (drinksBox) {
      db.updateById('cash_boxes', drinksBox.id, { balance: Number(drinksBox.balance) - amt });
      db.insert('cash_box_ledger', { cash_box_id: drinksBox.id, type: 'out', amount: amt, reason: `دفع لمورد: ${supplierName}`, created_at: db.now() });
    }
    log('supplier_payment', 'suppliers', statement.id, String(amt));
    push('تم تسجيل الدفع', 'success');
    setPayOpen(false); setAmount(''); setNote('');
    const updated = { ...statement, balance: Number(statement.balance) - amt };
    setStatement(updated);
    setLedger(db.select<any>('supplier_ledger').filter((l) => l.supplier_id === updated.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
    load();
  };

  // ============================================================
  // Full Supply Invoice
  // ============================================================
  const resetInvoiceForm = () => {
    setEditingInvoiceId(null);
    setInvSupplierId('');
    setInvDate(todayStr());
    setInvStatus('unpaid');
    setInvNote('');
    setInvLines([{ name: '', cartonPrice: '', piecesPerCarton: '', qty: '' }]);
  };

  const openInvoiceModal = () => {
    if (suppliers.length === 0) { push('أضف موردًا أولًا', 'error'); return; }
    resetInvoiceForm();
    setInvSupplierId(suppliers[0].id);
    setInvOpen(true);
  };

  const openEditInvoice = (inv: SupplierInvoice) => {
    const items = db.select<SupplierInvoiceItem>('supplier_invoice_items').filter((it) => it.invoice_id === inv.id);
    setEditingInvoiceId(inv.id);
    setInvSupplierId(inv.supplier_id);
    setInvDate(inv.invoice_date);
    setInvStatus(inv.status || 'unpaid');
    setInvNote(inv.note || '');
    setInvLines(items.map((it) => ({
      name: it.name,
      cartonPrice: String(it.carton_price || 0),
      piecesPerCarton: String(it.pieces_per_carton || 1),
      qty: String(it.qty || 0),
    })));
    setInvOpen(true);
  };

  const updateLine = (i: number, field: keyof InvoiceLine, val: string) => {
    setInvLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  };

  const addLine = () => setInvLines((prev) => [...prev, { name: '', cartonPrice: '', piecesPerCarton: '', qty: '' }]);

  const removeLine = (i: number) => setInvLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  // unit cost = cartonPrice / piecesPerCarton ; line total = cartonPrice * qty (qty in cartons)
  const lineUnitCost = (l: InvoiceLine): number => {
    const cp = Number(l.cartonPrice) || 0;
    const ppc = Number(l.piecesPerCarton) || 0;
    return ppc > 0 ? cp / ppc : 0;
  };
  const lineTotal = (l: InvoiceLine): number => (Number(l.cartonPrice) || 0) * (Number(l.qty) || 0);

  const invLinesTotal = useMemo(() => invLines.reduce((sum, l) => sum + lineTotal(l), 0), [invLines]);

  const saveInvoice = () => {
    if (!invSupplierId) { push('اختر موردًا', 'error'); return; }
    if (!invDate) { push('اختر التاريخ', 'error'); return; }
    const validLines = invLines.filter((l) => l.name.trim() && (Number(l.qty) || 0) > 0);
    if (validLines.length === 0) { push('أضف أصنافًا صحيحة', 'error'); return; }

    const total = validLines.reduce((sum, l) => sum + lineTotal(l), 0);
    const sup = db.first<Supplier>('suppliers', (s) => s.id === invSupplierId);
    const supplierName = sup?.name || '';

    const isEdit = !!editingInvoiceId;
    let invoiceId = editingInvoiceId || '';

    if (isEdit) {
      // Recalculate: reverse previous invoice effect on supplier balance + inventory, then rewrite
      const oldInv = db.first<SupplierInvoice>('supplier_invoices', (r) => r.id === editingInvoiceId);
      const oldItems = db.select<SupplierInvoiceItem>('supplier_invoice_items').filter((it) => it.invoice_id === editingInvoiceId);
      const oldInvItems = db.select<InventoryItem>('inventory_items');
      oldItems.forEach((it) => {
        const match = oldInvItems.find((x) => x.name.trim().toLowerCase() === it.name.trim().toLowerCase());
        if (match) db.updateById('inventory_items', match.id, { quantity: Number(match.quantity) - Number(it.qty) });
      });
      if (oldInv) {
        const oldSup = db.first<Supplier>('suppliers', (s) => s.id === oldInv.supplier_id);
        if (oldSup) db.updateById('suppliers', oldInv.supplier_id, { balance: Number(oldSup.balance) - Number(oldInv.total) });
      }
      db.remove('supplier_invoice_items', (it) => it.invoice_id === editingInvoiceId);
      db.remove('supplier_ledger', (l) => l.note && l.note.includes(editingInvoiceId));
      db.updateById('supplier_invoices', editingInvoiceId, { supplier_id: invSupplierId, invoice_date: invDate, total, status: invStatus, note: invNote || null });
    } else {
      const inv = db.insert<SupplierInvoice>('supplier_invoices', {
        supplier_id: invSupplierId,
        invoice_date: invDate,
        total,
        status: invStatus,
        note: invNote || null,
        created_at: db.now(),
      });
      invoiceId = inv.id;
    }

    // Create invoice items + auto-update inventory (using carton pricing)
    const invItems = db.select<InventoryItem>('inventory_items');
    const updatedInvNames: string[] = [];
    validLines.forEach((l) => {
      const cartonPrice = Number(l.cartonPrice) || 0;
      const piecesPerCarton = Number(l.piecesPerCarton) || 1;
      const qty = Number(l.qty) || 0; // cartons
      const unitCost = piecesPerCarton > 0 ? cartonPrice / piecesPerCarton : 0;
      const lt = cartonPrice * qty;
      db.insert<SupplierInvoiceItem>('supplier_invoice_items', {
        invoice_id: invoiceId,
        name: l.name.trim(),
        qty,
        carton_price: cartonPrice,
        pieces_per_carton: piecesPerCarton,
        cost_price: unitCost,
        line_total: lt,
      });

      // Auto supply: add carton qty to inventory (track pieces = qty * piecesPerCarton)
      const piecesToAdd = qty * piecesPerCarton;
      const match = invItems.find((it) => it.name.trim().toLowerCase() === l.name.trim().toLowerCase());
      if (match) {
        db.updateById('inventory_items', match.id, { quantity: Number(match.quantity) + piecesToAdd, cost_price: unitCost });
      } else {
        const newIt = db.insert<InventoryItem>('inventory_items', {
          name: l.name.trim(),
          quantity: piecesToAdd,
          cost_price: unitCost,
          sell_price: 0,
          low_stock_threshold: 0,
          supplier_id: invSupplierId,
          created_at: db.now(),
        });
        invItems.push(newIt);
      }
      updatedInvNames.push(l.name.trim());
    });

    // Update supplier balance (increase debt)
    const supNow = db.first<Supplier>('suppliers', (s) => s.id === invSupplierId);
    if (supNow) db.updateById('suppliers', invSupplierId, { balance: Number(supNow.balance) + total });

    // Add to supplier ledger
    db.insert('supplier_ledger', {
      supplier_id: invSupplierId,
      type: 'purchase',
      amount: total,
      note: `فاتورة توريد (${validLines.length} صنف)${invNote ? ' - ' + invNote : ''} [${invoiceId}]`,
      created_at: db.now(),
    });

    // Paid invoice deducts from drinks cash box
    if (invStatus === 'paid') {
      const drinksBox = db.first<any>('cash_boxes', (r) => r.code === 'drinks');
      if (drinksBox) {
        db.updateById('cash_boxes', drinksBox.id, { balance: Number(drinksBox.balance) - total });
        db.insert('cash_box_ledger', { cash_box_id: drinksBox.id, type: 'out', amount: total, reason: `فاتورة توريد مدفوعة: ${supplierName}`, related_id: invoiceId, created_at: db.now() });
      }
    }

    log(isEdit ? 'supplier_invoice_edit' : 'supplier_invoice', 'supplier_invoices', invoiceId, String(total));
    push(`${isEdit ? 'تم تعديل' : 'تم حفظ'} الفاتورة وتحديث المخزون (${updatedInvNames.length} صنف)`, 'success');
    setInvOpen(false);
    resetInvoiceForm();
    load();
  };

  const deleteInvoice = (inv: SupplierInvoice) => {
    if (!confirm('هل تريد حذف هذه الفاتورة؟ سيتم عكس تأثيرها على المخزون ورصيد المورد.')) return;
    const items = db.select<SupplierInvoiceItem>('supplier_invoice_items').filter((it) => it.invoice_id === inv.id);
    const invItems = db.select<InventoryItem>('inventory_items');
    items.forEach((it) => {
      const match = invItems.find((x) => x.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if (match) db.updateById('inventory_items', match.id, { quantity: Number(match.quantity) - Number(it.qty) * Number(it.pieces_per_carton) });
    });
    const sup = db.first<Supplier>('suppliers', (s) => s.id === inv.supplier_id);
    if (sup) db.updateById('suppliers', inv.supplier_id, { balance: Number(sup.balance) - Number(inv.total) });
    db.remove('supplier_invoice_items', (it) => it.invoice_id === inv.id);
    db.remove('supplier_invoices', (r) => r.id === inv.id);
    db.remove('supplier_ledger', (l) => l.note && l.note.includes(inv.id));
    log('supplier_invoice_delete', 'supplier_invoices', inv.id, String(inv.total));
    push('تم حذف الفاتورة', 'success');
    setViewInv(null);
    load();
  };

  const viewInvoice = (inv: SupplierInvoice) => {
    const sup = db.first<Supplier>('suppliers', (s) => s.id === inv.supplier_id) || null;
    const items = db.select<SupplierInvoiceItem>('supplier_invoice_items').filter((it) => it.invoice_id === inv.id);
    setViewInv({ invoice: inv, supplier: sup, items });
  };

  const printInvoice = (row: InvoiceRow) => {
    const win = window.open('', '_blank');
    if (!win) { push('اسمح النوافذ المنبثقة', 'error'); return; }
    const { invoice: inv, supplier: sup, items } = row;
    const rowsHtml = items.map((it, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${escapeHtml(it.name)}</td>
        <td style="text-align:center">${Number(it.carton_price || 0).toFixed(2)}</td>
        <td style="text-align:center">${Number(it.pieces_per_carton || 1)}</td>
        <td style="text-align:center">${Number(it.qty)}</td>
        <td style="text-align:left">${Number(it.cost_price || 0).toFixed(2)}</td>
        <td style="text-align:left">${Number(it.line_total || 0).toFixed(2)}</td>
      </tr>`).join('');
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>فاتورة توريد</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;color:#475569;margin:0 0 4px} h3{font-size:14px;color:#64748b;margin:0 0 16px}
        .meta{display:flex;justify-content:space-between;margin-bottom:16px;font-size:13px}
        .meta div{line-height:1.8}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:right}
        th{background:#f1f5f9;font-weight:700}
        .total{margin-top:16px;text-align:left;font-weight:800;font-size:18px}
        .foot{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}
      </style></head><body>
      <h1>نظام نقطة شحن أبو عادل</h1>
      <h2>فاتورة توريد كاملة</h2>
      <h3>رقم الفاتورة: ${inv.id.slice(0, 8).toUpperCase()}</h3>
      <div class="meta">
        <div>
          <b>المورد:</b> ${escapeHtml(sup?.name || '—')}<br/>
          <b>الهاتف:</b> ${escapeHtml(sup?.phone || '—')}
        </div>
        <div style="text-align:left">
          <b>التاريخ:</b> ${fmtDate(inv.invoice_date)}<br/>
          <b>وقت الإنشاء:</b> ${fmtDateTime(inv.created_at)}<br/>
          <b>الحالة:</b> ${(inv.status || 'unpaid') === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}
        </div>
      </div>
      ${inv.note ? `<p style="font-size:13px;margin-bottom:12px"><b>ملاحظة:</b> ${escapeHtml(inv.note)}</p>` : ''}
      <table><thead><tr><th style="width:40px">#</th><th>الصنف</th><th style="text-align:center">سعر الكرتونة</th><th style="text-align:center">حبات/كرتونة</th><th style="text-align:center">عدد الكراتين</th><th style="text-align:left">تكلفة الوحدة</th><th style="text-align:left">الإجمالي</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <div class="total">الإجمالي: ${money(inv.total)}</div>
      <div class="foot">
        <span>تم إنشاء هذه الفاتورة إلكترونيًا</span>
        <span>توقيع المورد: ____________________</span>
      </div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  // ============================================================
  // Reports
  // ============================================================
  const reportRange = useMemo(() => periodRange(reportPeriod, reportCustom), [reportPeriod, reportCustom]);

  const reportRows: ReportRow[] = useMemo(() => {
    return suppliers.map((s) => {
      const entries = db.select<any>('supplier_ledger').filter((l) => l.supplier_id === s.id);
      const purchases = entries
        .filter((l) => l.type === 'purchase' && (l.created_at || '') >= reportRange.from && (l.created_at || '') <= reportRange.to)
        .reduce((sum, l) => sum + Number(l.amount), 0);
      const payments = entries
        .filter((l) => l.type === 'payment' && (l.created_at || '') >= reportRange.from && (l.created_at || '') <= reportRange.to)
        .reduce((sum, l) => sum + Number(l.amount), 0);
      return {
        supplier: s,
        purchases,
        payments,
        net: purchases - payments,
        currentBalance: Number(s.balance),
      };
    }).filter((r) => r.purchases > 0 || r.payments > 0 || r.currentBalance > 0);
  }, [suppliers, reportRange]);

  const reportTotals = useMemo(() => {
    return {
      purchases: reportRows.reduce((s, r) => s + r.purchases, 0),
      payments: reportRows.reduce((s, r) => s + r.payments, 0),
      debts: reportRows.reduce((s, r) => s + r.currentBalance, 0),
    };
  }, [reportRows]);

  const printReport = () => {
    const win = window.open('', '_blank');
    if (!win) { push('اسمح النوافذ المنبثقة', 'error'); return; }
    const rowsHtml = reportRows.map((r, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${escapeHtml(r.supplier.name)}</td>
        <td style="text-align:left">${r.purchases.toFixed(2)}</td>
        <td style="text-align:left">${r.payments.toFixed(2)}</td>
        <td style="text-align:left">${r.net.toFixed(2)}</td>
        <td style="text-align:left">${r.currentBalance.toFixed(2)}</td>
      </tr>`).join('');
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>تقرير أرصدة الموردين</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;color:#475569;margin:0 0 4px} h3{font-size:14px;color:#64748b;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:right}
        th{background:#f1f5f9;font-weight:700}
        .totals{margin-top:16px;display:flex;gap:24px;font-size:14px}
        .totals div{font-weight:700}
        .foot{margin-top:32px;font-size:12px;color:#64748b}
      </style></head><body>
      <h1>نظام نقطة شحن أبو عادل</h1>
      <h2>تقرير أرصدة الموردين والمدفوعات</h2>
      <h3>الفترة: ${fmtDate(reportRange.from)} — ${fmtDate(reportRange.to)}</h3>
      <table><thead><tr><th style="width:40px">#</th><th>المورد</th><th style="text-align:left">مشتريات (دين)</th><th style="text-align:left">مدفوعات</th><th style="text-align:left">صافي الحركة</th><th style="text-align:left">الرصيد الحالي</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <div class="totals">
        <div>إجمالي المشتريات: ${money(reportTotals.purchases)}</div>
        <div>إجمالي المدفوعات: ${money(reportTotals.payments)}</div>
        <div>إجمالي الأرصدة المستحقة: ${money(reportTotals.debts)}</div>
      </div>
      <div class="foot">تم إنشاء هذا التقرير إلكترونيًا في ${fmtDateTime(db.now())}</div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  const totalDebt = suppliers.reduce((s, x) => s + Number(x.balance), 0);
  const totalInvoiceAmount = invoices.reduce((s, x) => s + Number(x.total), 0);

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<Truck size={24} />}>الموردين والتجار</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setReportOpen(true)} className="btn-ghost"><BarChart3 size={18} /> تقرير الأرصدة</button>
          <button onClick={openInvoiceModal} disabled={suppliers.length === 0} className="btn-ghost"><Receipt size={18} /> فاتورة توريد كاملة</button>
          <button onClick={() => { setEditSup(null); setName(''); setPhone(''); setNotes(''); setAddOpen(true); }} className="btn-primary"><Plus size={18} /> مورد جديد</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="عدد الموردين" value={String(suppliers.length)} color="sky" />
        <Stat label="إجمالي الديون للموردين" value={money(totalDebt)} color="rose" />
        <Stat label="إجمالي فواتير التوريد" value={money(totalInvoiceAmount)} color="violet" />
      </div>

      {/* Suppliers table */}
      <div className="card overflow-hidden">
        {suppliers.length === 0 ? <EmptyState icon={<Truck size={36} />} title="لا يوجد موردين" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">المورد</th>
                  <th className="text-right px-4 py-3 font-bold">الهاتف</th>
                  <th className="text-right px-4 py-3 font-bold">الرصيد (دين)</th>
                  <th className="text-right px-4 py-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {suppliers.map((s) => (
                  <tr key={s.id} className="table-row">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{s.name}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.phone || '—'}</td>
                    <td className="px-4 py-3"><Badge color={s.balance > 0 ? 'rose' : 'emerald'}>{money(s.balance)}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openStatement(s)} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30" title="كشف حساب"><FileText size={16} /></button>
                        <button onClick={() => { setEditSup(s); setName(s.name); setPhone(s.phone || ''); setNotes(s.notes || ''); setAddOpen(true); }} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" title="تعديل"><Pencil size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Saved supply invoices */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Receipt size={18} /> فواتير التوريد المحفوظة</h3>
        </div>
        {invoices.length === 0 ? <EmptyState icon={<Receipt size={32} />} title="لا توجد فواتير توريد بعد" subtitle="استخدم زر «فاتورة توريد كاملة» لإنشاء فاتورة جديدة" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">التاريخ</th>
                  <th className="text-right px-4 py-3 font-bold">المورد</th>
                  <th className="text-right px-4 py-3 font-bold">عدد الأصناف</th>
                  <th className="text-right px-4 py-3 font-bold">الإجمالي</th>
                  <th className="text-right px-4 py-3 font-bold">الحالة</th>
                  <th className="text-right px-4 py-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {invoices.map((inv) => {
                  const sup = suppliers.find((x) => x.id === inv.supplier_id);
                  const itemCount = db.select<SupplierInvoiceItem>('supplier_invoice_items').filter((it) => it.invoice_id === inv.id).length;
                  return (
                    <tr key={inv.id} className="table-row">
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{sup?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{itemCount}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{money(inv.total)}</td>
                      <td className="px-4 py-3"><Badge color={(inv.status || 'unpaid') === 'paid' ? 'emerald' : 'amber'}>{(inv.status || 'unpaid') === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => viewInvoice(inv)} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30" title="عرض"><Eye size={16} /></button>
                          <button onClick={() => openEditInvoice(inv)} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30" title="تعديل"><Pencil size={16} /></button>
                          <button onClick={() => printInvoice({ invoice: inv, supplier: sup || null, items: db.select<SupplierInvoiceItem>('supplier_invoice_items').filter((it) => it.invoice_id === inv.id) })} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" title="طباعة"><Printer size={16} /></button>
                          <button onClick={() => deleteInvoice(inv)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="حذف"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit supplier modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editSup ? 'تعديل مورد' : 'مورد جديد'} size="md">
        <div className="space-y-3">
          <div><label className="label">الاسم *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><label className="label">الهاتف</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="label">ملاحظات</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setAddOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={save} className="btn-primary">حفظ</button>
        </div>
      </Modal>

      {/* Supplier statement modal */}
      <Modal open={!!statement} onClose={() => setStatement(null)} title={`كشف حساب: ${statement?.name}`} size="lg">
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => { setAmount(''); setNote(''); setPurchaseOpen(true); }} className="btn-ghost text-sm"><PackagePlus size={16} /> مشتريات</button>
          <button onClick={() => { setAmount(''); setNote(''); setPayOpen(true); }} className="btn-success text-sm"><HandCoins size={16} /> دفع</button>
        </div>
        <div className="card p-4 bg-rose-50 dark:bg-rose-900/20 mb-4">
          <p className="text-sm text-rose-600 dark:text-rose-400 font-semibold">الرصيد المستحق</p>
          <p className="text-2xl font-extrabold text-rose-700 dark:text-rose-300">{money(statement?.balance || 0)}</p>
        </div>
        {ledger.length === 0 ? <EmptyState title="لا توجد حركات" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                <tr>
                  <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                  <th className="text-right px-3 py-2 font-bold">النوع</th>
                  <th className="text-right px-3 py-2 font-bold">المبلغ</th>
                  <th className="text-right px-3 py-2 font-bold">البيان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(l.created_at)}</td>
                    <td className="px-3 py-2"><Badge color={l.type === 'purchase' ? 'rose' : 'emerald'}>{l.type === 'purchase' ? 'مشتريات' : 'دفع'}</Badge></td>
                    <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{money(l.amount)}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Quick purchase modal */}
      <Modal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} title="تسجيل مشتريات" size="sm">
        <div className="space-y-3">
          <div><label className="label">المبلغ</label><input className="input text-xl font-bold" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><label className="label">البيان</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setPurchaseOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitPurchase} className="btn-primary">تأكيد</button>
        </div>
      </Modal>

      {/* Payment modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="دفع للمورد" size="sm">
        <div className="space-y-3">
          <div><label className="label">المبلغ</label><input className="input text-xl font-bold" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><label className="label">البيان</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setPayOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitPayment} className="btn-success">تأكيد الدفع</button>
        </div>
      </Modal>

      {/* Full supply invoice modal (carton-based pricing) */}
      <Modal open={invOpen} onClose={() => { setInvOpen(false); resetInvoiceForm(); }} title={editingInvoiceId ? 'تعديل فاتورة توريد' : 'فاتورة توريد كاملة'} size="xl">
        <div className="space-y-4">
          {/* Header row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">المورد *</label>
              <select className="input" value={invSupplierId} onChange={(e) => setInvSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">التاريخ *</label>
              <input type="date" className="input" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            </div>
            <div>
              <label className="label">الحالة</label>
              <select className="input" value={invStatus} onChange={(e) => setInvStatus(e.target.value as InvoiceStatus)}>
                <option value="unpaid">غير مدفوعة</option>
                <option value="paid">مدفوعة</option>
              </select>
            </div>
            <div>
              <label className="label">ملاحظة</label>
              <input className="input" value={invNote} onChange={(e) => setInvNote(e.target.value)} placeholder="اختياري" />
            </div>
          </div>

          {/* Line items — carton pricing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">الأصناف (التسعير بالكرتونة)</label>
              <button onClick={addLine} className="btn-ghost text-sm py-1.5"><Plus size={14} /> إضافة صنف</button>
            </div>
            <div className="space-y-2">
              {invLines.map((l, i) => (
                <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-800/50">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="input col-span-5"
                      placeholder="اسم الصنف"
                      value={l.name}
                      onChange={(e) => updateLine(i, 'name', e.target.value)}
                    />
                    <input
                      className="input col-span-2 text-center"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="سعر الكرتونة"
                      value={l.cartonPrice}
                      onChange={(e) => updateLine(i, 'cartonPrice', e.target.value)}
                    />
                    <input
                      className="input col-span-2 text-center"
                      type="number"
                      min="1"
                      placeholder="حبات/كرتونة"
                      value={l.piecesPerCarton}
                      onChange={(e) => updateLine(i, 'piecesPerCarton', e.target.value)}
                    />
                    <input
                      className="input col-span-2 text-center"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="عدد الكراتين"
                      value={l.qty}
                      onChange={(e) => updateLine(i, 'qty', e.target.value)}
                    />
                    <button
                      onClick={() => removeLine(i)}
                      disabled={invLines.length === 1}
                      className="col-span-1 p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="حذف"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {/* Computed row: unit cost + line total */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-1 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      سعر تكلفة الوحدة = <span className="font-bold text-emerald-600 dark:text-emerald-400">{money(lineUnitCost(l))}</span>
                      <span className="text-slate-400 dark:text-slate-500"> (كرتونة ÷ حبات)</span>
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      إجمالي السطر = <span className="font-bold text-sky-600 dark:text-sky-400">{money(lineTotal(l))}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
              الإجمالي: <span className="text-sky-600 dark:text-sky-400">{money(invLinesTotal)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setInvOpen(false); resetInvoiceForm(); }} className="btn-ghost">إلغاء</button>
              <button onClick={saveInvoice} className="btn-primary"><Receipt size={16} /> {editingInvoiceId ? 'حفظ التعديل' : 'حفظ الفاتورة وتحديث المخزون'}</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* View original invoice modal */}
      <Modal open={!!viewInv} onClose={() => setViewInv(null)} title={`عرض الفاتورة — ${viewInv?.supplier?.name || ''}`} size="lg">
        {viewInv && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card p-3 bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">تاريخ الفاتورة</p>
                <p className="font-bold text-slate-700 dark:text-slate-200">{fmtDate(viewInv.invoice.invoice_date)}</p>
              </div>
              <div className="card p-3 bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">وقت الإنشاء</p>
                <p className="font-bold text-slate-700 dark:text-slate-200 text-xs">{fmtDateTime(viewInv.invoice.created_at)}</p>
              </div>
              <div className="card p-3 bg-sky-50 dark:bg-sky-900/20">
                <p className="text-xs text-sky-600 dark:text-sky-400 font-semibold">الإجمالي</p>
                <p className="font-extrabold text-sky-700 dark:text-sky-300">{money(viewInv.invoice.total)}</p>
              </div>
              <div className="card p-3 bg-amber-50 dark:bg-amber-900/20">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">الحالة</p>
                <p className="font-extrabold text-amber-700 dark:text-amber-300">{(viewInv.invoice.status || 'unpaid') === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</p>
              </div>
            </div>
            {viewInv.invoice.note && (
              <p className="text-sm text-slate-600 dark:text-slate-300"><b>ملاحظة:</b> {viewInv.invoice.note}</p>
            )}
            {viewInv.items.length === 0 ? <EmptyState title="لا توجد أصناف" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                    <tr>
                      <th className="text-right px-3 py-2 font-bold">#</th>
                      <th className="text-right px-3 py-2 font-bold">اسم الصنف</th>
                      <th className="text-right px-3 py-2 font-bold">سعر الكرتونة</th>
                      <th className="text-right px-3 py-2 font-bold">حبات/كرتونة</th>
                      <th className="text-right px-3 py-2 font-bold">عدد الكراتين</th>
                      <th className="text-right px-3 py-2 font-bold">تكلفة الوحدة</th>
                      <th className="text-right px-3 py-2 font-bold">إجمالي السطر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {viewInv.items.map((it, i) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{it.name}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{money(Number(it.carton_price) || 0)}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{Number(it.pieces_per_carton) || 1}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{Number(it.qty)}</td>
                        <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-semibold">{money(Number(it.cost_price) || 0)}</td>
                        <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{money(Number(it.line_total) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => printInvoice(viewInv)} className="btn-ghost"><Printer size={16} /> طباعة</button>
              <button onClick={() => { const inv = viewInv.invoice; setViewInv(null); openEditInvoice(inv); }} className="btn-ghost text-amber-600 dark:text-amber-400"><Pencil size={16} /> تعديل</button>
              <button onClick={() => deleteInvoice(viewInv.invoice)} className="btn-ghost text-rose-600 dark:text-rose-400"><Trash2 size={16} /> حذف</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reports modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="تقرير أرصدة الموردين والمدفوعات" size="lg">
        <div className="space-y-4">
          {/* Period filter */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-2">
              {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
                <button key={p} onClick={() => setReportPeriod(p)} className={`px-3 py-2 rounded-xl text-sm font-bold transition ${reportPeriod === p ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
                  {p === 'today' ? 'اليوم' : p === 'week' ? 'الأسبوع' : p === 'month' ? 'الشهر' : 'مخصص'}
                </button>
              ))}
            </div>
            {reportPeriod === 'custom' && (
              <div className="flex gap-2">
                <div><label className="label">من</label><input type="date" className="input" value={reportCustom.from} onChange={(e) => setReportCustom((c) => ({ ...c, from: e.target.value }))} /></div>
                <div><label className="label">إلى</label><input type="date" className="input" value={reportCustom.to} onChange={(e) => setReportCustom((c) => ({ ...c, to: e.target.value }))} /></div>
              </div>
            )}
            <button onClick={printReport} className="btn-ghost text-sm"><Printer size={16} /> طباعة كشف</button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 bg-rose-50 dark:bg-rose-900/20">
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">إجمالي المشتريات (دين)</p>
              <p className="font-extrabold text-rose-700 dark:text-rose-300">{money(reportTotals.purchases)}</p>
            </div>
            <div className="card p-3 bg-emerald-50 dark:bg-emerald-900/20">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">إجمالي المدفوعات</p>
              <p className="font-extrabold text-emerald-700 dark:text-emerald-300">{money(reportTotals.payments)}</p>
            </div>
            <div className="card p-3 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">إجمالي الأرصدة المستحقة</p>
              <p className="font-extrabold text-amber-700 dark:text-amber-300">{money(reportTotals.debts)}</p>
            </div>
          </div>

          {/* Report table */}
          {reportRows.length === 0 ? <EmptyState icon={<BarChart3 size={32} />} title="لا توجد بيانات في هذه الفترة" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                  <tr>
                    <th className="text-right px-3 py-2 font-bold">#</th>
                    <th className="text-right px-3 py-2 font-bold">المورد</th>
                    <th className="text-right px-3 py-2 font-bold">مشتريات (دين)</th>
                    <th className="text-right px-3 py-2 font-bold">مدفوعات</th>
                    <th className="text-right px-3 py-2 font-bold">صافي الحركة</th>
                    <th className="text-right px-3 py-2 font-bold">الرصيد الحالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {reportRows.map((r, i) => (
                    <tr key={r.supplier.id} className="table-row">
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{r.supplier.name}</td>
                      <td className="px-3 py-2 font-bold text-rose-600 dark:text-rose-400">{money(r.purchases)}</td>
                      <td className="px-3 py-2 font-bold text-emerald-600 dark:text-emerald-400">{money(r.payments)}</td>
                      <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">{money(r.net)}</td>
                      <td className="px-3 py-2"><Badge color={r.currentBalance > 0 ? 'rose' : 'emerald'}>{money(r.currentBalance)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
