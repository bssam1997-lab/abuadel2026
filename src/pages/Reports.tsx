import { useEffect, useState, useMemo } from 'react';
import { FileBarChart, TrendingUp, CupSoda, BatteryCharging, AlertTriangle, Printer } from 'lucide-react';
import * as db from '../lib/db';
import { money, num, periodRange, fmtDate } from '../lib/format';
import { SectionTitle, Stat, Badge, EmptyState } from '../components/ui';

type Period = 'today' | 'week' | 'month' | 'custom';

export default function Reports() {
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  useEffect(() => {
    setLoading(true);
    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();

    const devices = db.select<any>('devices').filter((d) => { const t = new Date(d.created_at).getTime(); return t >= from && t <= to; });
    const invoices = db.select<any>('invoices').filter((i) => { const t = new Date(i.created_at).getTime(); return t >= from && t <= to; });
    const debts = db.select<any>('debts').filter((d) => { const t = new Date(d.created_at).getTime(); return t >= from && t <= to; });
    const allItems = db.select<any>('invoice_items');
    const partners = db.select<any>('partners');
    const customers = db.select<any>('customers');
    const cashLedger = db.select<any>('cash_box_ledger').filter((l) => { const t = new Date(l.created_at).getTime(); return t >= from && t <= to; }).map((l) => ({ ...l, box: db.first<any>('cash_boxes', (r) => r.id === l.cash_box_id) }));
    const savingsExp = db.select<any>('partner_savings_ledger').filter((s) => s.type === 'expense' && (() => { const t = new Date(s.created_at).getTime(); return t >= from && t <= to; })());

    const chargingCount = devices.length;
    const chargingRevenue = devices.filter((d) => d.status === 'delivered').reduce((s, d) => s + Number(d.price), 0);
    const cancelledCount = devices.filter((d) => d.status === 'cancelled').length;
    const drinksRevenue = invoices.reduce((s, i) => s + Number(i.total), 0);
    const drinksProfit = invoices.reduce((s, i) => s + Number(i.profit), 0);
    const paidInvoices = invoices.filter((i) => i.paid).length;
    const unpaidInvoices = invoices.filter((i) => !i.paid).length;
    const newDebts = debts.reduce((s, d) => s + Number(d.debit), 0);
    const collectedDebts = debts.reduce((s, d) => s + Number(d.credit), 0);
    const savingsExpense = savingsExp.reduce((s, r) => s + Number(r.amount), 0);

    // الأكثر مبيعًا
    const productMap: Record<string, { name: string; qty: number; total: number; profit: number }> = {};
    invoices.forEach((inv) => {
      const items = allItems.filter((it) => it.invoice_id === inv.id);
      items.forEach((it) => {
        if (!productMap[it.name]) productMap[it.name] = { name: it.name, qty: 0, total: 0, profit: 0 };
        productMap[it.name].qty += Number(it.qty);
        productMap[it.name].total += Number(it.line_total);
        productMap[it.name].profit += (Number(it.unit_price) - Number(it.cost_price)) * Number(it.qty);
      });
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.total - a.total).slice(0, 8);

    // أكبر المدينين
    const allDebts = db.select<any>('debts');
    const debtMap: Record<string, number> = {};
    allDebts.forEach((d) => { debtMap[d.customer_id] = (debtMap[d.customer_id] || 0) + Number(d.debit) - Number(d.credit); });
    const custMap: Record<string, string> = {};
    customers.forEach((c) => { custMap[c.id] = c.name; });
    const topDebtors = Object.entries(debtMap).map(([id, bal]) => ({ name: custMap[id] || '—', balance: bal })).filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 8);

    setData({
      chargingCount, chargingRevenue, cancelledCount, drinksRevenue, drinksProfit,
      paidInvoices, unpaidInvoices, newDebts, collectedDebts, savingsExpense,
      topProducts, topDebtors, partners, cashLedger,
    });
    setLoading(false);
  }, [range.from, range.to]);

  const print = () => window.print();

  if (loading) return <div className="text-center py-10 text-slate-500 font-semibold">جارٍ تحميل التقرير...</div>;

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <SectionTitle icon={<FileBarChart size={24} />}>التقارير المالية والتشغيلية</SectionTitle>
        <div className="flex gap-2">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3.5 py-2 rounded-xl text-sm font-bold transition ${period === p ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {p === 'today' ? 'اليوم' : p === 'week' ? 'الأسبوع' : p === 'month' ? 'الشهر' : 'مخصص'}
            </button>
          ))}
          <button onClick={print} className="btn-ghost text-sm"><Printer size={16} /> طباعة</button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="card p-4 flex flex-wrap gap-3 print:hidden">
          <div><label className="label">من</label><input type="date" className="input" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></div>
          <div><label className="label">إلى</label><input type="date" className="input" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="إيرادات الشحن" value={money(data.chargingRevenue)} color="emerald" icon={<BatteryCharging size={18} className="text-emerald-500" />} />
        <Stat label="عدد عمليات الشحن" value={num(data.chargingCount)} color="sky" />
        <Stat label="أجهزة ملغاة" value={num(data.cancelledCount)} color="rose" />
        <Stat label="إيرادات المشروبات" value={money(data.drinksRevenue)} color="amber" icon={<CupSoda size={18} className="text-amber-500" />} />
        <Stat label="أرباح المشروبات" value={money(data.drinksProfit)} color="emerald" />
        <Stat label="فواتير مدفوعة" value={num(data.paidInvoices)} color="emerald" />
        <Stat label="فواتير غير مدفوعة" value={num(data.unpaidInvoices)} color="rose" />
        <Stat label="ديون جديدة" value={money(data.newDebts)} color="rose" icon={<AlertTriangle size={18} className="text-rose-500" />} />
        <Stat label="ديون محصلة" value={money(data.collectedDebts)} color="emerald" />
        <Stat label="مصروفات الحصالة" value={money(data.savingsExpense)} color="violet" />
        <Stat label="صافي الربح" value={money(data.chargingRevenue + data.drinksProfit)} color="sky" icon={<TrendingUp size={18} className="text-sky-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-slate-700 mb-3">الأكثر مبيعًا</h3>
          {data.topProducts.length === 0 ? <EmptyState title="لا توجد بيانات" /> : (
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs"><tr><th className="text-right py-2">الصنف</th><th className="text-right py-2">الكمية</th><th className="text-right py-2">الإيراد</th><th className="text-right py-2">الربح</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.topProducts.map((p: any) => (
                  <tr key={p.name}><td className="py-2 font-semibold">{p.name}</td><td className="py-2">{p.qty}</td><td className="py-2">{money(p.total)}</td><td className="py-2 text-emerald-600">{money(p.profit)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-slate-700 mb-3">أكبر المدينين</h3>
          {data.topDebtors.length === 0 ? <EmptyState title="لا توجد ديون" /> : (
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs"><tr><th className="text-right py-2">الزبون</th><th className="text-right py-2">الرصيد</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.topDebtors.map((d: any) => (
                  <tr key={d.name}><td className="py-2 font-semibold">{d.name}</td><td className="py-2"><Badge color="rose">{money(d.balance)}</Badge></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-slate-700 mb-3">حركة الصناديق في الفترة</h3>
        {data.cashLedger.length === 0 ? <EmptyState title="لا توجد حركات" /> : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs sticky top-0">
                <tr><th className="text-right px-3 py-2 font-bold">التاريخ</th><th className="text-right px-3 py-2 font-bold">الصندوق</th><th className="text-right px-3 py-2 font-bold">النوع</th><th className="text-right px-3 py-2 font-bold">المبلغ</th><th className="text-right px-3 py-2 font-bold">السبب</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.cashLedger.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-slate-500 text-xs">{fmtDate(l.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{l.box?.name || '—'}</td>
                    <td className="px-3 py-2"><Badge color={l.type === 'in' ? 'emerald' : 'rose'}>{l.type === 'in' ? 'إيداع' : 'صرف'}</Badge></td>
                    <td className="px-3 py-2 font-bold">{money(l.amount)}</td>
                    <td className="px-3 py-2 text-slate-500">{l.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
