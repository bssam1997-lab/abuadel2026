import { useEffect, useState } from 'react';
import { Boxes, ArrowDownCircle, ArrowUpCircle, RefreshCw, AlertTriangle, ScrollText, Printer } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { money, fmtDateTime } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState, Stat } from '../components/ui';

// صناديق محذوفة نهائيًا (لم تعد تُنشأ في التهيئة، لكن قد تكون موجودة في قواعد بيانات قديمة)
const HIDDEN_CODES = ['daily_debts', 'drinks_profit_partner', 'savings'];

// شرح كل صندوق: المصدر، الاحتساب، العمليات المؤثرة
const BOX_INFO: Record<string, { source: string; calc: string; ops: string }> = {
  charging: {
    source: 'أجهزة الشحن المدفوعة نقدًا',
    calc: 'يزيد مع كل تسليم جهاز مدفوع',
    ops: 'تسليم جهاز، تراجع عن تسليم، إيداع/صرف يدوي',
  },
  drinks: {
    source: 'مبيعات المشروبات النقدية',
    calc: 'يزيد مع كل فاتورة مشروبات نقدية',
    ops: 'إتمام فاتورة، تراجع فاتورة، دفع مورد، توريد مدفوع، إيداع/صرف يدوي',
  },
  drinks_profit: {
    source: 'أرباح المشروبات المحسوبة',
    calc: 'يزيد تلقائيًا بنسبة الربح من كل فاتورة',
    ops: 'إتمام فاتورة، تراجع، إيداع/صرف يدوي',
  },
};

const boxBadge = (code: string): { color: 'sky' | 'amber' | 'violet' | 'slate'; label: string } => {
  if (code === 'charging') return { color: 'sky', label: 'شحن' };
  if (code === 'drinks') return { color: 'amber', label: 'مشروبات' };
  if (code === 'drinks_profit') return { color: 'violet', label: 'أرباح' };
  return { color: 'slate', label: code };
};

export default function CashBoxes() {
  const { log } = useStore();
  const { push } = useToast();
  const [boxes, setBoxes] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any | null>(null);
  const [mType, setMType] = useState<'in' | 'out'>('in');
  const [mAmount, setMAmount] = useState('');
  const [mReason, setMReason] = useState('');
  const [warnOut, setWarnOut] = useState(false);

  // مصادر التدفق (Flow sources) per-box ledger modal
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowBox, setFlowBox] = useState<any | null>(null);
  const [flowFrom, setFlowFrom] = useState('');
  const [flowTo, setFlowTo] = useState('');

  const openFlow = (b: any) => {
    setFlowBox(b);
    setFlowFrom('');
    setFlowTo('');
    setFlowOpen(true);
  };

  const flowEntries = (() => {
    if (!flowBox) return [];
    let rows = db
      .select<any>('cash_box_ledger')
      .filter((l) => l.cash_box_id === flowBox.id);
    if (flowFrom) {
      const from = new Date(flowFrom + 'T00:00:00').getTime();
      rows = rows.filter((l) => new Date(l.created_at).getTime() >= from);
    }
    if (flowTo) {
      const to = new Date(flowTo + 'T23:59:59').getTime();
      rows = rows.filter((l) => new Date(l.created_at).getTime() <= to);
    }
    return rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  })();

  const flowTotalIn = flowEntries.filter((l) => l.type === 'in').reduce((s, l) => s + Number(l.amount), 0);
  const flowTotalOut = flowEntries.filter((l) => l.type === 'out').reduce((s, l) => s + Number(l.amount), 0);
  const flowNet = flowTotalIn - flowTotalOut;

  const printFlow = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const rowsHtml = flowEntries
      .map(
        (l) => `
        <tr>
          <td>${fmtDateTime(l.created_at)}</td>
          <td>${l.type === 'in' ? 'إيداع' : 'صرف'}</td>
          <td>${l.amount}</td>
          <td>${l.reason || '—'}</td>
          <td>${l.related_id || '—'}</td>
        </tr>`
      )
      .join('');
    win.document.write(`
      <html dir="rtl"><head><title>مصادر التدفق - ${flowBox?.name || ''}</title>
      <style>body{font-family:Tahoma,Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f0f0f0}h2{margin:0 0 10px}.summary{display:flex;gap:20px;margin:10px 0 20px;font-weight:bold}</style>
      </head><body>
      <h2>مصادر التدفق - ${flowBox?.name || ''}</h2>
      <div class="summary">
        <span>إجمالي الإيداع: ${flowTotalIn} ₪</span>
        <span>إجمالي الصرف: ${flowTotalOut} ₪</span>
        <span>الصافي: ${flowNet} ₪</span>
        <span>الرصيد الحالي: ${flowBox?.balance ?? 0} ₪</span>
      </div>
      <table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>السبب</th><th>مرجع</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      </body></html>`
    );
    win.document.close();
    win.print();
  };

  const load = () => {
    // تصفية الصناديق المحذوفة نهائيًا من قواعد البيانات القديمة
    const all = db.select<any>('cash_boxes').filter((b) => !HIDDEN_CODES.includes(b.code));
    setBoxes(all.sort((a, b) => (a.code || '').localeCompare(b.code || '')));
    const lg = db
      .select<any>('cash_box_ledger')
      .filter((l) => {
        const box = db.first<any>('cash_boxes', (r) => r.id === l.cash_box_id);
        return box ? !HIDDEN_CODES.includes(box.code) : true;
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 100);
    setLedger(lg.map((l) => ({ ...l, box: db.first<any>('cash_boxes', (r) => r.id === l.cash_box_id) })));
  };

  useEffect(() => {
    load();
  }, []);

  const openMove = (b: any, type: 'in' | 'out') => {
    setSelectedBox(b);
    setMType(type);
    setMAmount('');
    setMReason('');
    setWarnOut(false);
    setMoveOpen(true);
  };

  const submitMove = () => {
    if (!selectedBox) return;
    const amt = Number(mAmount) || 0;
    if (amt <= 0) {
      push('أدخل مبلغًا', 'error');
      return;
    }
    if (mType === 'out' && amt > Number(selectedBox.balance)) {
      push('الرصيد غير كافٍ', 'error');
      return;
    }

    // حماية صناديق المشروبات من التصفير/التنقيص غير المبرر
    const isProtected = selectedBox.code === 'drinks' || selectedBox.code === 'drinks_profit';
    if (isProtected && mType === 'out' && !warnOut) {
      setWarnOut(true);
      return;
    }

    const newBal = mType === 'in' ? Number(selectedBox.balance) + amt : Number(selectedBox.balance) - amt;
    db.updateById('cash_boxes', selectedBox.id, { balance: newBal });
    db.insert('cash_box_ledger', {
      cash_box_id: selectedBox.id,
      type: mType,
      amount: amt,
      reason: mReason || (mType === 'in' ? 'إيداع' : 'صرف'),
      created_at: db.now(),
    });
    log('cash_move', 'cash_boxes', selectedBox.id, `${mType}:${amt}`);
    push('تمت الحركة', 'success');
    setMoveOpen(false);
    setWarnOut(false);
    load();
  };

  const resetBox = (b: any) => {
    if (!confirm(`تصفير صندوق "${b.name}"؟ سيتم تسجيل حركة تصفير.`)) return;
    const bal = Number(b.balance);
    if (bal === 0) return;
    db.updateById('cash_boxes', b.id, { balance: 0 });
    db.insert('cash_box_ledger', {
      cash_box_id: b.id,
      type: 'out',
      amount: bal,
      reason: 'تصفير الصندوق',
      created_at: db.now(),
    });
    log('reset_cashbox', 'cash_boxes', b.id, String(bal));
    push('تم تصفير الصندوق', 'info');
    load();
  };

  const total = boxes.reduce((s, b) => s + Number(b.balance), 0);

  return (
    <div className="space-y-5 animate-fade">
      <SectionTitle icon={<Boxes size={24} />}>إدارة الصناديق</SectionTitle>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Stat label="إجمالي الصناديق" value={money(total)} color="sky" />
        {boxes.slice(0, 3).map((b) => {
          const badge = boxBadge(b.code);
          return <Stat key={b.id} label={b.name} value={money(b.balance)} color={badge.color} />;
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {boxes.map((b) => {
          const badge = boxBadge(b.code);
          const info = BOX_INFO[b.code];
          return (
            <div key={b.id} className="card p-5 dark:bg-slate-800 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-700 dark:text-slate-100">{b.name}</h3>
                <Badge color={badge.color}>{badge.label}</Badge>
              </div>
              <p className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mb-4">{money(b.balance)}</p>

              {info && (
                <div className="mb-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 p-3 text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex gap-1.5">
                    <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">المصدر:</span>
                    <span>{info.source}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">الاحتساب:</span>
                    <span>{info.calc}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">العمليات:</span>
                    <span>{info.ops}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => openMove(b, 'in')} className="btn-success flex-1 text-sm">
                  <ArrowDownCircle size={16} /> إيداع
                </button>
                <button onClick={() => openMove(b, 'out')} className="btn-ghost flex-1 text-sm dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700">
                  <ArrowUpCircle size={16} /> صرف
                </button>
                <button onClick={() => resetBox(b)} className="btn-ghost text-sm dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700" title="تصفير">
                  <RefreshCw size={16} />
                </button>
              </div>
              <button onClick={() => openFlow(b)} className="btn-ghost w-full text-sm mt-2 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700">
                <ScrollText size={16} /> مصادر التدفق
              </button>
            </div>
          );
        })}
      </div>

      <div className="card p-5 dark:bg-slate-800 dark:border-slate-700">
        <h3 className="font-bold text-slate-700 dark:text-slate-100 mb-3">سجل حركات الصناديق</h3>
        {ledger.length === 0 ? (
          <EmptyState title="لا توجد حركات" />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                <tr>
                  <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                  <th className="text-right px-3 py-2 font-bold">الصندوق</th>
                  <th className="text-right px-3 py-2 font-bold">النوع</th>
                  <th className="text-right px-3 py-2 font-bold">المبلغ</th>
                  <th className="text-right px-3 py-2 font-bold">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {ledger.map((l) => (
                  <tr key={l.id} className="table-row dark:hover:bg-slate-700/40">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(l.created_at)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{l.box?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge color={l.type === 'in' ? 'emerald' : 'rose'}>{l.type === 'in' ? 'إيداع' : 'صرف'}</Badge>
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{money(l.amount)}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={moveOpen}
        onClose={() => {
          setMoveOpen(false);
          setWarnOut(false);
        }}
        title={`${mType === 'in' ? 'إيداع' : 'صرف'} - ${selectedBox?.name || ''}`}
        size="sm"
      >
        <div className="space-y-3">
          {warnOut && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-3 flex gap-2 items-start text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">تحذير: صرف من صندوق محمي</p>
                <p>هذا الصندوق ({selectedBox?.name}) لا يُصرف منه يدويًا عادةً. يُسمح بالصرف فقط لـ:</p>
                <ul className="list-disc pr-5 mt-1 space-y-0.5">
                  <li>توريد مورد مدفوع (مُعتمد)</li>
                  <li>دفع مورد مُعتمد</li>
                </ul>
                <p className="mt-1.5 font-semibold">أكد الحركة للمتابعة.</p>
              </div>
            </div>
          )}
          <div>
            <label className="label dark:text-slate-300">المبلغ</label>
            <input
              className="input text-xl font-bold dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
              type="number"
              value={mAmount}
              onChange={(e) => setMAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label dark:text-slate-300">السبب</label>
            <input
              className="input dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
              value={mReason}
              onChange={(e) => setMReason(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button
            onClick={() => {
              setMoveOpen(false);
              setWarnOut(false);
            }}
            className="btn-ghost dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            إلغاء
          </button>
          <button onClick={submitMove} className={mType === 'in' ? 'btn-success' : 'btn-primary'}>
            {warnOut ? 'تأكيد الصرف' : 'تأكيد'}
          </button>
        </div>
      </Modal>

      {/* مصادر التدفق - Per-box detailed ledger modal */}
      <Modal
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        title={`مصادر التدفق - ${flowBox?.name || ''}`}
        size="xl"
      >
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="إجمالي الإيداع" value={money(flowTotalIn)} color="emerald" />
            <Stat label="إجمالي الصرف" value={money(flowTotalOut)} color="rose" />
            <Stat label="الصافي" value={money(flowNet)} color="sky" />
            <Stat label="الرصيد الحالي" value={money(flowBox?.balance ?? 0)} color="violet" />
          </div>

          {/* Date range filters + print */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label dark:text-slate-300">من تاريخ</label>
              <input
                type="date"
                className="input dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                value={flowFrom}
                onChange={(e) => setFlowFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label dark:text-slate-300">إلى تاريخ</label>
              <input
                type="date"
                className="input dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                value={flowTo}
                onChange={(e) => setFlowTo(e.target.value)}
              />
            </div>
            <button
              onClick={() => {
                setFlowFrom('');
                setFlowTo('');
              }}
              className="btn-ghost text-sm dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              مسح التصفية
            </button>
            <button onClick={printFlow} className="btn-primary text-sm mr-auto">
              <Printer size={16} /> طباعة
            </button>
          </div>

          {/* Ledger entries table */}
          {flowEntries.length === 0 ? (
            <EmptyState icon={<ScrollText size={40} />} title="لا توجد حركات" subtitle="لا توجد قيود سجل لهذا الصندوق ضمن النطاق المحدد" />
          ) : (
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                    <th className="text-right px-3 py-2 font-bold">النوع</th>
                    <th className="text-right px-3 py-2 font-bold">المبلغ</th>
                    <th className="text-right px-3 py-2 font-bold">السبب</th>
                    <th className="text-right px-3 py-2 font-bold">مرجع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {flowEntries.map((l) => (
                    <tr key={l.id} className="table-row dark:hover:bg-slate-700/40">
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(l.created_at)}</td>
                      <td className="px-3 py-2">
                        <Badge color={l.type === 'in' ? 'emerald' : 'rose'}>{l.type === 'in' ? 'إيداع' : 'صرف'}</Badge>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{money(l.amount)}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.reason || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 dark:text-slate-500 text-xs font-mono">{l.related_id || '—'}</td>
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
