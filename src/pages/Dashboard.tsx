import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, BatteryCharging, CupSoda, Wallet, AlertTriangle, Users,
  Smartphone, UserCheck, Boxes, X, ArrowDownCircle, ArrowUpCircle, ScrollText, Coins
} from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { money, num, periodRange, fmtDateTime, todayISO } from '../lib/format';
import { Stat, SectionTitle, Badge, EmptyState } from '../components/ui';
import Modal from '../components/Modal';

// صناديق نشطة فقط (استبعاد المحذوفة: daily_debts, drinks_profit_partner, savings)
const ACTIVE_BOX_CODES = ['charging', 'drinks', 'drinks_profit'];
const HIDDEN_BOX_CODES = ['daily_debts', 'drinks_profit_partner', 'savings'];

// شارة كل صندوق: لون + تسمية مختصرة
const boxBadge = (code: string): { color: 'sky' | 'amber' | 'violet' | 'slate'; label: string } => {
  if (code === 'charging') return { color: 'sky', label: 'شحن' };
  if (code === 'drinks') return { color: 'amber', label: 'مشروبات' };
  if (code === 'drinks_profit') return { color: 'violet', label: 'أرباح' };
  return { color: 'slate', label: code };
};

// تدرج لوني لكل صندوق (يطابق ألوان شارات الصناديق)
const boxGradient = (code: string): string => {
  if (code === 'charging') return 'from-sky-50 to-sky-100 text-sky-700';
  if (code === 'drinks') return 'from-amber-50 to-amber-100 text-amber-700';
  if (code === 'drinks_profit') return 'from-violet-50 to-violet-100 text-violet-700';
  return 'from-slate-50 to-slate-100 text-slate-700';
};

type Period = 'today' | 'week' | 'month' | 'custom';

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<null | { title: string; rows: { label: string; value: string; color: string }[] }>(null);

  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  useEffect(() => {
    setLoading(true);
    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();

    const devices = db.select<any>('devices').filter((d) => {
      const t = new Date(d.created_at).getTime();
      return t >= from && t <= to;
    });
    const invoices = db.select<any>('invoices').filter((i) => {
      const t = new Date(i.created_at).getTime();
      return t >= from && t <= to;
    });
    const debts = db.select<any>('debts').filter((d) => {
      const t = new Date(d.created_at).getTime();
      return t >= from && t <= to;
    });

    const chargingRevenue = devices.filter((d) => d.status === 'delivered').reduce((s, d) => s + Number(d.price), 0);
    const chargingPaid = devices.filter((d) => d.status === 'delivered' && d.paid).reduce((s, d) => s + Number(d.price), 0);
    const chargingCredit = devices.filter((d) => d.status === 'delivered' && !d.paid).reduce((s, d) => s + Number(d.price), 0);
    const chargingProfit = chargingRevenue;
    const drinksRevenue = invoices.reduce((s, i) => s + Number(i.total), 0);
    const drinksPaid = invoices.filter((i) => !i.reversed).reduce((s, i) => s + Number(i.paid_amount || (i.paid ? i.total : 0)), 0);
    const drinksCredit = invoices.filter((i) => !i.reversed).reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount || (i.paid ? i.total : 0))), 0);
    const drinksProfit = invoices.filter((i) => !i.reversed).reduce((s, i) => s + Number(i.profit), 0);
    const drinksRealizedProfit = invoices.filter((i) => !i.reversed).reduce((s, i) => s + Number(i.realized_profit ?? i.profit), 0);
    const drinksDeferredProfit = drinksProfit - drinksRealizedProfit;
    const totalSales = chargingRevenue + drinksRevenue;
    const netProfit = chargingProfit + drinksProfit;
    const todayDebts = debts.reduce((s, d) => s + Number(d.debit) - Number(d.credit), 0);

    const allDebts = db.select<any>('debts');
    const totalCustomerDebts = allDebts.filter((d) => !d.reversed).reduce((s, d) => s + Number(d.debit) - Number(d.credit), 0);
    const customers = db.select<any>('customers');
    const activeCustomers = customers.length;
    const chargingDevices = devices.filter((d) => d.status === 'charging').length;

    const partners = db.select<any>('partners');
    const cashBoxes = db.select<any>('cash_boxes').filter((b) => ACTIVE_BOX_CODES.includes(b.code));

    // ===== تتبع التدفق المالي =====
    const dayStart = new Date(todayISO()).getTime();
    const allLedger = db.select<any>('cash_box_ledger');
    const activeBoxIds = new Set(cashBoxes.map((b) => b.id));
    const activeLedger = allLedger.filter((l) => activeBoxIds.has(l.cash_box_id));

    // ملخص اليوم لكل صندوق: إيداع/صرف
    const boxToday = cashBoxes.map((b) => {
      const entries = activeLedger.filter((l) => l.cash_box_id === b.id);
      const todayEntries = entries.filter((l) => new Date(l.created_at).getTime() >= dayStart);
      const inflow = todayEntries.filter((l) => l.type === 'in').reduce((s, l) => s + Number(l.amount), 0);
      const outflow = todayEntries.filter((l) => l.type === 'out').reduce((s, l) => s + Number(l.amount), 0);
      return { box: b, inflow, outflow };
    });
    const totalCash = cashBoxes.reduce((s, b) => s + Number(b.balance), 0);

    // آخر 10 قيود في السجل عبر كل الصناديق
    const recentLedger = activeLedger
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 10)
      .map((l) => ({ ...l, box: cashBoxes.find((b) => b.id === l.cash_box_id) }));

    setData({
      totalSales, chargingProfit, drinksProfit, netProfit, todayDebts,
      totalCustomerDebts, activeCustomers, chargingDevices,
      partners, cashBoxes, drinksRevenue, chargingRevenue,
      chargingPaid, chargingCredit, drinksPaid, drinksCredit, drinksRealizedProfit, drinksDeferredProfit,
      totalCash, boxToday, recentLedger,
    });
    setLoading(false);
  }, [range.from, range.to]);

  if (loading) return <div className="text-center py-10 text-slate-500 font-semibold">جارٍ تحميل لوحة التحكم...</div>;

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<TrendingUp size={24} />}>لوحة التحكم الرئيسية</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold transition ${period === p ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              {p === 'today' ? 'اليوم' : p === 'week' ? 'الأسبوع' : p === 'month' ? 'الشهر' : 'مخصص'}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="card p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">من تاريخ</label>
            <input type="date" className="input" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </div>
          <div>
            <label className="label">إلى تاريخ</label>
            <input type="date" className="input" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Stat label="إجمالي المبيعات" value={money(data.totalSales)} color="sky" icon={<TrendingUp size={18} className="text-sky-500" />} />
        <button onClick={() => setPopup({ title: 'تفاصيل أرباح الشحن', rows: [
          { label: 'إجمالي الإيرادات', value: money(data.chargingRevenue), color: 'text-sky-600' },
          { label: 'المسدد (نقدًا)', value: money(data.chargingPaid), color: 'text-emerald-600' },
          { label: 'الآجل (دين)', value: money(data.chargingCredit), color: 'text-rose-600' },
          { label: 'الأرباح', value: money(data.chargingProfit), color: 'text-emerald-700' },
        ] })} className="text-right">
          <Stat label="أرباح الشحن" value={money(data.chargingProfit)} color="emerald" icon={<BatteryCharging size={18} className="text-emerald-500" />} />
        </button>
        <button onClick={() => setPopup({ title: 'تفاصيل أرباح المشروبات', rows: [
          { label: 'إجمالي الإيرادات', value: money(data.drinksRevenue), color: 'text-sky-600' },
          { label: 'المسدد (نقدًا)', value: money(data.drinksPaid), color: 'text-emerald-600' },
          { label: 'الآجل (دين)', value: money(data.drinksCredit), color: 'text-rose-600' },
          { label: 'الأرباج المتوقعة', value: money(data.drinksProfit), color: 'text-amber-600' },
          { label: 'الأرباح المحققة', value: money(data.drinksRealizedProfit), color: 'text-emerald-600' },
          { label: 'الأرباح المؤجلة', value: money(data.drinksDeferredProfit), color: 'text-rose-600' },
        ] })} className="text-right">
          <Stat label="أرباح المشروبات" value={money(data.drinksProfit)} color="amber" icon={<CupSoda size={18} className="text-amber-500" />} />
        </button>
        <Stat label="صافي الأرباح" value={money(data.netProfit)} color="violet" icon={<TrendingUp size={18} className="text-violet-500" />} />
        <Stat label="ديون الفترة" value={money(data.todayDebts)} color="rose" icon={<AlertTriangle size={18} className="text-rose-500" />} />
        <Stat label="إجمالي ديون الزبائن" value={money(data.totalCustomerDebts)} color="rose" icon={<Wallet size={18} className="text-rose-500" />} />
        <Stat label="الزبائن النشطون" value={num(data.activeCustomers)} color="sky" icon={<Users size={18} className="text-sky-500" />} />
        <Stat label="أجهزة قيد الشحن" value={num(data.chargingDevices)} color="amber" icon={<Smartphone size={18} className="text-amber-500" />} />
      </div>

      {/* ===== تتبع التدفق المالي ===== */}
      <div className="space-y-4">
        <SectionTitle icon={<Coins size={22} />}>تتبع التدفق المالي</SectionTitle>

        {/* إجمالي الكاش عبر كل الصناديق */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="إجمالي الكاش (كل الصناديق)" value={money(data.totalCash)} color="violet" icon={<Coins size={18} className="text-violet-500" />} />
          {data.boxToday.map((bt: any) => {
            const badge = boxBadge(bt.box.code);
            return (
              <div key={bt.box.id} className={`kpi bg-gradient-to-bl ${boxGradient(bt.box.code)} dark:bg-slate-800 dark:bg-none dark:border dark:border-slate-700`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold opacity-80 dark:text-slate-300">{bt.box.name}</span>
                  <Badge color={badge.color}>{badge.label}</Badge>
                </div>
                <span className="text-2xl font-extrabold dark:text-slate-100">{money(bt.box.balance)}</span>
                <div className="flex items-center gap-3 mt-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <ArrowDownCircle size={14} /> {money(bt.inflow)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <ArrowUpCircle size={14} /> {money(bt.outflow)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* آخر 10 قيود في السجل */}
        <div className="card p-5 dark:bg-slate-800 dark:border-slate-700">
          <SectionTitle icon={<ScrollText size={20} />}>آخر حركات التدفق المالي</SectionTitle>
          {data.recentLedger.length === 0 ? (
            <EmptyState icon={<ScrollText size={40} />} title="لا توجد حركات" subtitle="لم تُسجَّل أي حركة في الصناديق بعد" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs">
                  <tr>
                    <th className="text-right px-3 py-2 font-bold">الصندوق</th>
                    <th className="text-right px-3 py-2 font-bold">النوع</th>
                    <th className="text-right px-3 py-2 font-bold">المبلغ</th>
                    <th className="text-right px-3 py-2 font-bold">السبب</th>
                    <th className="text-right px-3 py-2 font-bold">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.recentLedger.map((l: any) => (
                    <tr key={l.id} className="table-row dark:hover:bg-slate-700/40">
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{l.box?.name || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge color={l.type === 'in' ? 'emerald' : 'rose'}>{l.type === 'in' ? 'إيداع' : 'صرف'}</Badge>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{money(l.amount)}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.reason || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <SectionTitle icon={<Boxes size={20} />}>حركة الصناديق المالية</SectionTitle>
          <div className="space-y-2">
            {data.cashBoxes.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2">
                  <Boxes size={18} className="text-slate-500" />
                  <span className="font-semibold text-slate-700">{b.name}</span>
                </div>
                <span className="font-bold text-slate-800">{money(b.balance)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <SectionTitle icon={<Wallet size={20} />}>ملخص حسابات الشركاء</SectionTitle>
          <div className="space-y-2">
            {data.partners.length === 0 && <p className="text-sm text-slate-400">لا يوجد شركاء بعد.</p>}
            {data.partners.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2">
                  <UserCheck size={18} className="text-slate-500" />
                  <span className="font-semibold text-slate-700">{p.name}</span>
                </div>
                <Badge color={p.balance >= 0 ? 'emerald' : 'rose'}>{money(p.balance)}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={!!popup} onClose={() => setPopup(null)} title={popup?.title || ''} size="sm">
        {popup && (
          <div className="space-y-2">
            {popup.rows.map((r, i) => (
              <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-slate-50">
                <span className="text-sm font-semibold text-slate-600">{r.label}</span>
                <span className={`font-bold ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
