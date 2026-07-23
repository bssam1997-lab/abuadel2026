import { useEffect, useState } from 'react';
import { Wallet, Plus, PiggyBank, TrendingUp, ArrowDownCircle, ArrowUpCircle, Users, FileText, Printer, HandCoins, ArrowLeftRight, Undo2 } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { money, fmtDateTime, fmtDate, periodRange } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState, Stat } from '../components/ui';
import type { Partner, PartnerLoan } from '../lib/types';

type Period = 'today' | 'week' | 'month' | 'custom';

export default function Partners() {
  const { settings, log } = useStore();
  const { push } = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [savings, setSavings] = useState<any[]>([]);
  const [savingsBalance, setSavingsBalance] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [savingsExpenseOpen, setSavingsExpenseOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementPartner, setStatementPartner] = useState<Partner | null>(null);
  const [statementPeriod, setStatementPeriod] = useState<Period>('month');
  const [statementCustom, setStatementCustom] = useState({ from: '', to: '' });
  const [openingBalance, setOpeningBalance] = useState(0);
  const [name, setName] = useState('');
  const [loans, setLoans] = useState<PartnerLoan[]>([]);
  const [withdrawalsPeriod, setWithdrawalsPeriod] = useState<Period>('month');
  const [withdrawalsCustom, setWithdrawalsCustom] = useState({ from: '', to: '' });
  const [balanceCheckOpen, setBalanceCheckOpen] = useState(false);
  const [undoLedger, setUndoLedger] = useState<any | null>(null);
  const [savingsThreshold, setSavingsThreshold] = useState(String(settings.savings_threshold || '0'));

  const [wTarget, setWTarget] = useState<'p1' | 'p2' | 'both'>('p1');
  const [wAmount, setWAmount] = useState('');
  const [wNote, setWNote] = useState('');

  const [seAmount, setSeAmount] = useState('');
  const [seNote, setSeNote] = useState('');

  const load = () => {
    setPartners(db.select<Partner>('partners').sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
    const lg = db.select<any>('partner_ledger').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 100);
    setLedger(lg.map((l) => ({ ...l, partner: db.first<any>('partners', (r) => r.id === l.partner_id) })));
    const sv = db.select<any>('partner_savings_ledger').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 50);
    setSavings(sv);
    const svb = db.select<any>('partner_savings_ledger');
    setSavingsBalance(svb.reduce((s: number, r: any) => s + (r.type === 'deposit' ? Number(r.amount) : -Number(r.amount)), 0));
    setLoans(db.select<PartnerLoan>('partner_loans').filter((l) => !l.settled).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  };

  useEffect(() => { load(); }, []);

  // خصم تلقائي يومي 10 شيكل من كل شريك - يبدأ فقط عند توفر رصيد كافٍ وتحقق الشروط
  const ensureDailySavings = () => {
    if (partners.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const perPartner = Number(settings.daily_savings_per_partner) || 10;
    const threshold = Number(settings.savings_threshold) || 0;
    let changed = false;
    for (const p of partners) {
      const existing = db.first<any>('partner_savings', (r) => r.partner_id === p.id && r.for_date === today);
      if (!existing) {
        const currentBalance = Number(p.balance);
        // لا خصم عند إنشاء شريك جديد أو عند عدم توفر رصيد كافٍ أو قبل تحقق الشروط
        if (currentBalance < perPartner) continue;
        if (threshold > 0 && currentBalance < threshold) continue;
        db.insert('partner_savings', { partner_id: p.id, amount: perPartner, for_date: today, created_at: db.now() });
        db.insert('partner_savings_ledger', { type: 'deposit', amount: perPartner, note: `حصالة يومية - ${p.name} (${today})`, created_at: db.now() });
        db.updateById('partners', p.id, { balance: currentBalance - perPartner });
        db.insert('partner_ledger', { partner_id: p.id, type: 'expense', amount: perPartner, note: 'حصالة يومية', created_at: db.now() });
        changed = true;
      }
    }
    if (changed) { redistribute(); load(); }
  };

  useEffect(() => { ensureDailySavings(); }, [partners.length]);

  // توزيع الرصيد تلقائيًا بالتساوي على جميع الشركاء
  const redistribute = () => {
    const allPartners = db.select<Partner>('partners');
    if (allPartners.length === 0) return;
    const totalBal = allPartners.reduce((s, p) => s + Number(p.balance), 0);
    const share = totalBal / allPartners.length;
    allPartners.forEach((p) => {
      db.updateById('partners', p.id, { balance: share });
    });
  };

  const addPartner = () => {
    if (!name.trim()) return;
    // لا خصم حصالة عند إنشاء شريك جديد - الرصيد يبدأ من صفر
    const created = db.insert('partners', { name: name.trim(), balance: 0, created_at: db.now() });
    log('add_partner', 'partners', created.id, name);
    push('تم إضافة الشريك', 'success');
    setName(''); setAddOpen(false);
    // إعادة توزيع الأرصدة بالتساوي بعد إضافة شريك
    redistribute();
    load();
  };

  const withdraw = () => {
    const amt = Number(wAmount) || 0;
    if (amt <= 0) { push('أدخل مبلغًا', 'error'); return; }
    if (partners.length < 2 && wTarget === 'both') { push('يجب وجود شريكين', 'error'); return; }

    const doWithdraw = (partner: Partner, amount: number, note: string) => {
      const currentBalance = Number(partner.balance);
      if (currentBalance < amount) {
        // Loan from other partner
        const other = partners.find((p) => p.id !== partner.id);
        if (!other) { push('لا يوجد شريك آخر للاقتراض', 'error'); return false; }
        const overdraft = amount - currentBalance;
        if (Number(other.balance) < overdraft) { push(`رصيد الشريك الآخر لا يكفي للاقتراض ${money(overdraft)}`, 'error'); return false; }
        // Deduct from borrower
        db.updateById('partners', partner.id, { balance: 0 });
        db.insert('partner_ledger', { partner_id: partner.id, type: 'withdrawal', amount: amount, note: note + ` (قرض ${money(overdraft)} من ${other.name})`, created_at: db.now() });
        // Deduct overdraft from lender
        db.updateById('partners', other.id, { balance: Number(other.balance) - overdraft });
        db.insert('partner_ledger', { partner_id: other.id, type: 'expense', amount: overdraft, note: `قرض لـ ${partner.name}`, created_at: db.now() });
        // Record loan
        const loan = db.insert('partner_loans', { borrower_id: partner.id, lender_id: other.id, amount: overdraft, repaid: 0, settled: false, note: note, created_at: db.now() });
        log('partner_loan', 'partner_loans', loan.id, String(overdraft));
        push(`تم تسجيل قرض ${money(overdraft)} من ${other.name} إلى ${partner.name}`, 'info');
        return true;
      }
      db.updateById('partners', partner.id, { balance: currentBalance - amount });
      db.insert('partner_ledger', { partner_id: partner.id, type: 'withdrawal', amount: amount, note: note || 'سحب', created_at: db.now() });
      log('withdraw', 'partners', partner.id, String(amount));
      return true;
    };

    let success = false;
    if (wTarget === 'p1' && partners[0]) success = doWithdraw(partners[0], amt, wNote || 'سحب');
    else if (wTarget === 'p2' && partners[1]) success = doWithdraw(partners[1], amt, wNote || 'سحب');
    else if (wTarget === 'both' && partners[0] && partners[1]) {
      const half = amt / 2;
      success = doWithdraw(partners[0], half, 'سحب (شريكين)') && doWithdraw(partners[1], half, 'سحب (شريكين)');
    }
    if (success) {
      push('تم السحب', 'success');
      setWithdrawOpen(false); setWAmount(''); setWNote(''); setWTarget('p1');
      // إعادة توزيع الأرصدة بالتساوي بعد السحب
      redistribute();
      load();
    }
  };

  const settleLoansOnProfit = (partner: Partner, profitAmount: number) => {
    let remaining = profitAmount;
    const activeLoans = db.select<PartnerLoan>('partner_loans').filter((l) => l.borrower_id === partner.id && !l.settled);
    for (const loan of activeLoans) {
      if (remaining <= 0) break;
      const owed = Number(loan.amount) - Number(loan.repaid);
      const repay = Math.min(remaining, owed);
      db.updateById('partner_loans', loan.id, { repaid: Number(loan.repaid) + repay, settled: repay >= owed });
      const lender = db.first<Partner>('partners', (r) => r.id === loan.lender_id);
      if (lender) {
        db.updateById('partners', lender.id, { balance: Number(lender.balance) + repay });
        db.insert('partner_ledger', { partner_id: lender.id, type: 'profit', amount: repay, note: `سداد قرض من ${partner.name}`, created_at: db.now() });
      }
      remaining -= repay;
    }
    return remaining;
  };

  const partnerWithdrawalsTotal = (partnerId: string): number => {
    const range = periodRange(withdrawalsPeriod, withdrawalsCustom);
    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();
    return db.select<any>('partner_ledger').filter((l) => l.partner_id === partnerId && l.type === 'withdrawal' && new Date(l.created_at).getTime() >= from && new Date(l.created_at).getTime() <= to).reduce((s: number, l: any) => s + Number(l.amount), 0);
  };

  const partnerBalanceBeforeToday = (partnerId: string): number => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const allMoves = db.select<any>('partner_ledger').filter((l) => l.partner_id === partnerId && new Date(l.created_at).getTime() < todayStart.getTime());
    return allMoves.reduce((s: number, m: any) => s + (m.type === 'profit' ? Number(m.amount) : -Number(m.amount)), 0);
  };

  const partnerBalanceToday = (partnerId: string): number => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMoves = db.select<any>('partner_ledger').filter((l) => l.partner_id === partnerId && new Date(l.created_at).getTime() >= todayStart.getTime());
    return todayMoves.reduce((s: number, m: any) => s + (m.type === 'profit' ? Number(m.amount) : -Number(m.amount)), 0);
  };

  const savingsExpense = () => {
    const amt = Number(seAmount) || 0;
    if (amt <= 0) { push('أدخل مبلغًا', 'error'); return; }
    if (amt > savingsBalance) { push('رصيد الحصالة غير كافٍ', 'error'); return; }
    // Savings threshold check: prevent deduction if total partner balance is zero or less than amount
    if (totalBalance <= 0) { push('لا يمكن الاقتطاع: إجمالي رصيد الشركاء صفر', 'error'); return; }
    const threshold = Number(settings.savings_threshold) || 0;
    if (threshold > 0 && totalBalance < threshold) { push(`لا يمكن الاقتطاع: رصيد الشركاء (${money(totalBalance)}) أقل من الحد المطلوب (${money(threshold)})`, 'error'); return; }
    // تخزين الحصالة في جدول partner_savings_ledger مباشرة دون صندوق كاش
    db.insert('partner_savings_ledger', { type: 'expense', amount: amt, note: seNote || 'مصروف', created_at: db.now() });
    log('savings_expense', 'partner_savings_ledger', undefined, String(amt));
    push('تم تسجيل المصروف', 'success');
    setSavingsExpenseOpen(false); setSeAmount(''); setSeNote('');
    load();
  };

  const totalBalance = partners.reduce((s, p) => s + Number(p.balance), 0);

  const undoWithdrawal = (entry: any) => {
    if (!entry) return;
    const partner = db.first<Partner>('partners', (r) => r.id === entry.partner_id);
    if (!partner) return;
    const amt = Number(entry.amount);
    if (entry.type === 'withdrawal') {
      // Reverse: add amount back to partner
      db.updateById('partners', partner.id, { balance: Number(partner.balance) + amt });
      db.insert('partner_ledger', { partner_id: partner.id, type: 'profit', amount: amt, note: `عكس سحب: ${entry.note || ''}`, created_at: db.now() });
    } else if (entry.type === 'expense') {
      db.updateById('partners', partner.id, { balance: Number(partner.balance) + amt });
      db.insert('partner_ledger', { partner_id: partner.id, type: 'profit', amount: amt, note: `عكس مصروف: ${entry.note || ''}`, created_at: db.now() });
    } else if (entry.type === 'profit') {
      db.updateById('partners', partner.id, { balance: Number(partner.balance) - amt });
      db.insert('partner_ledger', { partner_id: partner.id, type: 'withdrawal', amount: amt, note: `عكس ربح: ${entry.note || ''}`, created_at: db.now() });
    }
    log('undo_partner_ledger', 'partner_ledger', entry.id, String(amt));
    push('تم عكس العملية', 'success');
    setUndoLedger(null);
    // إعادة توزيع الأرصدة بالتساوي بعد عكس عملية
    redistribute();
    load();
  };

  const openStatement = (p: Partner) => {
    setStatementPartner(p);
    setStatementPeriod('month');
    setStatementCustom({ from: '', to: '' });
    computeStatement(p, 'month', { from: '', to: '' });
    setStatementOpen(true);
  };

  const computeStatement = (p: Partner, period: Period, custom: { from: string; to: string }) => {
    const range = periodRange(period, custom);
    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();
    const allMoves = db.select<any>('partner_ledger').filter((l) => l.partner_id === p.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const beforeMoves = allMoves.filter((m) => new Date(m.created_at).getTime() < from);
    const opening = beforeMoves.reduce((s: number, m: any) => s + (m.type === 'profit' ? Number(m.amount) : -Number(m.amount)), 0);
    setOpeningBalance(opening);
  };

  const statementMoves = (() => {
    if (!statementPartner) return [];
    const range = periodRange(statementPeriod, statementCustom);
    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();
    return db.select<any>('partner_ledger')
      .filter((l) => l.partner_id === statementPartner.id && new Date(l.created_at).getTime() >= from && new Date(l.created_at).getTime() <= to)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  })();

  const printStatement = () => {
    if (!statementPartner) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = statementMoves.map((m) => `
      <tr>
        <td>${fmtDate(m.created_at)}</td>
        <td>${m.type === 'profit' ? 'ربح' : m.type === 'withdrawal' ? 'سحب' : 'مصروف'}</td>
        <td>${m.note || ''}</td>
        <td style="text-align:left">${m.type === 'profit' ? '+' + Number(m.amount).toFixed(2) : '-' + Number(m.amount).toFixed(2)}</td>
      </tr>`).join('');
    const range = periodRange(statementPeriod, statementCustom);
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>كشف حساب شريك</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;color:#475569;margin:0 0 4px} h3{font-size:14px;color:#64748b;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:right}
        th{background:#f1f5f9;font-weight:700}
        .sum{margin-top:16px;font-weight:800;font-size:16px}
      </style></head><body>
      <h1>نظام نقطة شحن أبو عادل</h1>
      <h2>كشف حساب شريك: ${statementPartner.name}</h2>
      <h3>الفترة: ${fmtDate(range.from)} — ${fmtDate(range.to)}</h3>
      <div class="sum">رصيد افتتاحي: ${money(openingBalance)}</div>
      <table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="sum">الرصيد الحالي: ${money(statementPartner.balance)}</div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<Wallet size={24} />}>حسابات الشركاء</SectionTitle>
        <div className="flex gap-2">
          <button onClick={() => setWithdrawOpen(true)} disabled={partners.length === 0} className="btn-ghost"><ArrowDownCircle size={18} /> سحب</button>
          <button onClick={() => setAddOpen(true)} className="btn-primary"><Plus size={18} /> شريك جديد</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="إجمالي أرصدة الشركاء (صافي)" value={money(totalBalance)} color="violet" icon={<Users size={18} className="text-violet-500" />} />
        <Stat label="رصيد الحصالة" value={money(savingsBalance)} color="emerald" icon={<PiggyBank size={18} className="text-emerald-500" />} />
        <Stat label="حصالة يومية/شريك" value={money(Number(settings.daily_savings_per_partner) || 10)} color="amber" icon={<TrendingUp size={18} className="text-amber-500" />} />
      </div>

      {loans.length > 0 && (
        <div className="card p-5 dark:bg-slate-900 dark:border-slate-700">
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><ArrowLeftRight size={18} /> قروض نشطة بين الشركاء</h3>
          <div className="space-y-1">
            {loans.map((l) => {
              const borrower = db.first<Partner>('partners', (r) => r.id === l.borrower_id);
              const lender = db.first<Partner>('partners', (r) => r.id === l.lender_id);
              const remaining = Number(l.amount) - Number(l.repaid);
              return (
                <div key={l.id} className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5">
                  <span className="dark:text-slate-200">{borrower?.name} ← {lender?.name}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{money(remaining)} (إجمالي {money(l.amount)})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 dark:bg-slate-900 dark:border-slate-700">
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3">أرصدة الشركاء</h3>
          {partners.length === 0 ? <EmptyState icon={<Wallet size={32} />} title="لا يوجد شركاء" /> : (
            <div className="space-y-2">
              {partners.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300 font-bold text-sm">{i + 1}</div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{p.name}</span>
                    <button onClick={() => openStatement(p)} className="p-1.5 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40" title="كشف حساب"><FileText size={14} /></button>
                  </div>
                  <Badge color={p.balance >= 0 ? 'emerald' : 'rose'}>{money(p.balance)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">حصالة الشركاء</h3>
            <button onClick={() => setSavingsExpenseOpen(true)} className="btn-ghost text-sm"><ArrowUpCircle size={16} /> مصروف</button>
          </div>
          <div className="card p-4 bg-emerald-50 dark:bg-emerald-900/20 mb-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">الرصيد الحالي</p>
            <p className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400">{money(savingsBalance)}</p>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {savings.length === 0 ? <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">لا توجد حركات.</p> : savings.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="text-slate-600 dark:text-slate-300">{s.note}</span>
                <span className={`font-bold ${s.type === 'deposit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{s.type === 'deposit' ? '+' : '-'}{money(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5 dark:bg-slate-900 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-700 dark:text-slate-200">إجمالي السحوبات لكل شريك</h3>
          <div className="flex items-center gap-2">
            {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
              <button key={p} onClick={() => setWithdrawalsPeriod(p)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${withdrawalsPeriod === p ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 dark:text-slate-300'}`}>
                {p === 'today' ? 'اليوم' : p === 'week' ? 'أسبوع' : p === 'month' ? 'شهر' : 'مخصص'}
              </button>
            ))}
            <button onClick={() => setBalanceCheckOpen(true)} className="btn-ghost text-sm"><FileText size={14} /> أرصدة قبل/بعد اليوم</button>
          </div>
        </div>
        {withdrawalsPeriod === 'custom' && (
          <div className="flex gap-2 mb-3">
            <input type="date" className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={withdrawalsCustom.from} onChange={(e) => setWithdrawalsCustom((c) => ({ ...c, from: e.target.value }))} />
            <input type="date" className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={withdrawalsCustom.to} onChange={(e) => setWithdrawalsCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {partners.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{p.name}</span>
              <span className="font-bold text-rose-600 dark:text-rose-400">{money(partnerWithdrawalsTotal(p.id))}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 dark:bg-slate-900 dark:border-slate-700">
        <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3">سجل حركات الشركاء</h3>
        {ledger.length === 0 ? <EmptyState title="لا توجد حركات" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                <tr>
                  <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                  <th className="text-right px-3 py-2 font-bold">الشريك</th>
                  <th className="text-right px-3 py-2 font-bold">النوع</th>
                  <th className="text-right px-3 py-2 font-bold">المبلغ</th>
                  <th className="text-right px-3 py-2 font-bold">البيان</th>
                  <th className="text-right px-3 py-2 font-bold">عكس</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {ledger.map((l) => (
                  <tr key={l.id} className="table-row dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(l.created_at)}</td>
                    <td className="px-3 py-2 font-semibold dark:text-slate-200">{l.partner?.name || '—'}</td>
                    <td className="px-3 py-2"><Badge color={l.type === 'profit' ? 'emerald' : l.type === 'withdrawal' ? 'sky' : 'amber'}>{l.type === 'profit' ? 'ربح' : l.type === 'withdrawal' ? 'سحب' : 'مصروف'}</Badge></td>
                    <td className="px-3 py-2 font-bold dark:text-slate-200">{l.type === 'profit' ? '+' : '-'}{money(l.amount)}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.note || '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setUndoLedger(l)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="تراجع وعكس العملية"><Undo2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="شريك جديد" size="sm">
        <label className="label">اسم الشريك</label>
        <input className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setAddOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={addPartner} className="btn-primary">إضافة</button>
        </div>
      </Modal>

      <Modal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="سحب من حساب الشركاء" size="md">
        <div className="space-y-3">
          <div>
            <label className="label">الوجهة</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setWTarget('p1')} className={`py-3 rounded-xl font-bold text-sm ${wTarget === 'p1' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 dark:text-slate-200'}`}>{partners[0]?.name || 'الأول'}</button>
              <button onClick={() => setWTarget('p2')} className={`py-3 rounded-xl font-bold text-sm ${wTarget === 'p2' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 dark:text-slate-200'}`}>{partners[1]?.name || 'الثاني'}</button>
              <button onClick={() => setWTarget('both')} className={`py-3 rounded-xl font-bold text-sm ${wTarget === 'both' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 dark:text-slate-200'}`}>الشريكين</button>
            </div>
          </div>
          <div><label className="label">المبلغ</label><input className="input text-xl font-bold dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" type="number" value={wAmount} onChange={(e) => setWAmount(e.target.value)} autoFocus /></div>
          <div><label className="label">ملاحظة</label><input className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={wNote} onChange={(e) => setWNote(e.target.value)} /></div>
          {wTarget === 'both' && <p className="text-xs text-slate-500 dark:text-slate-400">سيُخصم نصف المبلغ من كل شريك.</p>}
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setWithdrawOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={withdraw} className="btn-primary">تأكيد السحب</button>
        </div>
      </Modal>

      <Modal open={savingsExpenseOpen} onClose={() => setSavingsExpenseOpen(false)} title="مصروف من الحصالة" size="sm">
        <div className="space-y-3">
          <div><label className="label">المبلغ</label><input className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" type="number" value={seAmount} onChange={(e) => setSeAmount(e.target.value)} autoFocus /></div>
          <div><label className="label">البيان</label><input className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={seNote} onChange={(e) => setSeNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setSavingsExpenseOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={savingsExpense} className="btn-primary">تأكيد</button>
        </div>
      </Modal>

      <Modal open={statementOpen} onClose={() => setStatementOpen(false)} title={`كشف حساب: ${statementPartner?.name}`} size="lg">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex gap-2">
            {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
              <button key={p} onClick={() => { setStatementPeriod(p); if (statementPartner) computeStatement(statementPartner, p, statementCustom); }} className={`px-3 py-2 rounded-xl text-sm font-bold ${statementPeriod === p ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-slate-200'}`}>
                {p === 'today' ? 'اليوم' : p === 'week' ? 'الأسبوع' : p === 'month' ? 'الشهر' : 'مخصص'}
              </button>
            ))}
          </div>
          {statementPeriod === 'custom' && (
            <>
              <div><label className="label">من</label><input type="date" className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={statementCustom.from} onChange={(e) => { const c = { ...statementCustom, from: e.target.value }; setStatementCustom(c); if (statementPartner) computeStatement(statementPartner, 'custom', c); }} /></div>
              <div><label className="label">إلى</label><input type="date" className="input dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" value={statementCustom.to} onChange={(e) => { const c = { ...statementCustom, to: e.target.value }; setStatementCustom(c); if (statementPartner) computeStatement(statementPartner, 'custom', c); }} /></div>
            </>
          )}
          <button onClick={printStatement} className="btn-ghost text-sm"><Printer size={16} /> طباعة PDF</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="card p-3 bg-slate-50 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">رصيد افتتاحي</p><p className="font-bold text-slate-700 dark:text-slate-200">{money(openingBalance)}</p></div>
          <div className="card p-3 bg-sky-50 dark:bg-sky-900/20"><p className="text-xs text-sky-600 dark:text-sky-400 font-semibold">الرصيد الحالي</p><p className="font-bold text-sky-700 dark:text-sky-300">{money(statementPartner?.balance || 0)}</p></div>
        </div>
        {statementMoves.length === 0 ? <EmptyState title="لا توجد حركات في هذه الفترة" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                <tr>
                  <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                  <th className="text-right px-3 py-2 font-bold">النوع</th>
                  <th className="text-right px-3 py-2 font-bold">البيان</th>
                  <th className="text-right px-3 py-2 font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {statementMoves.map((m) => (
                  <tr key={m.id} className="dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(m.created_at)}</td>
                    <td className="px-3 py-2"><Badge color={m.type === 'profit' ? 'emerald' : m.type === 'withdrawal' ? 'sky' : 'amber'}>{m.type === 'profit' ? 'ربح' : m.type === 'withdrawal' ? 'سحب' : 'مصروف'}</Badge></td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{m.note || '—'}</td>
                    <td className={`px-3 py-2 font-bold ${m.type === 'profit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{m.type === 'profit' ? '+' : '-'}{money(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={!!undoLedger} onClose={() => setUndoLedger(null)} title="عكس حركة شريك" size="sm">
        <div className="space-y-3">
          <p className="text-slate-600 dark:text-slate-300">سيتم عكس العملية التالية:</p>
          <div className="card p-3 bg-slate-50 dark:bg-slate-800">
            <p className="text-sm font-bold dark:text-slate-200">{undoLedger?.partner?.name || '—'}</p>
            <p className="text-sm dark:text-slate-300">{undoLedger?.type === 'profit' ? 'ربح' : undoLedger?.type === 'withdrawal' ? 'سحب' : 'مصروف'} — {money(undoLedger?.amount)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{undoLedger?.note}</p>
          </div>
          <p className="text-sm text-rose-600 dark:text-rose-400 font-semibold">سيتم عكس الأثر المالي للعملية على رصيد الشريك.</p>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setUndoLedger(null)} className="btn-ghost">إلغاء</button>
          <button onClick={() => undoWithdrawal(undoLedger)} className="btn-danger">تأكيد العكس</button>
        </div>
      </Modal>

      <Modal open={balanceCheckOpen} onClose={() => setBalanceCheckOpen(false)} title="أرصدة الشركاء قبل/بعد اليوم" size="md">
        <div className="space-y-3">
          {partners.map((p) => (
            <div key={p.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">{p.name}</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">رصيد أمس</p><p className="font-bold text-slate-700 dark:text-slate-200">{money(partnerBalanceBeforeToday(p.id))}</p></div>
                <div><p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">حركة اليوم</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{money(partnerBalanceToday(p.id))}</p></div>
                <div><p className="text-xs text-sky-600 dark:text-sky-400 font-semibold">الرصيد الحالي</p><p className="font-bold text-sky-700 dark:text-sky-300">{money(p.balance)}</p></div>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
