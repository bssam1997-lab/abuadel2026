import { useEffect, useState } from 'react';
import { UserCheck, Plus, LogIn, LogOut, Pencil, Clock, ScrollText, BarChart3, Printer } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { fmtTime, fmtDateTime, periodRange, money } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState, Stat } from '../components/ui';
import type { Collector, OperationLog, Invoice, Device } from '../lib/types';

export default function Collectors() {
  const { log } = useStore();
  const { push } = useToast();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editCol, setEditCol] = useState<Collector | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // حركات المحصل — مراقبة الحركات خلال فترة
  const [movesOpen, setMovesOpen] = useState(false);
  const [movesCol, setMovesCol] = useState<Collector | null>(null);
  const [movesPeriod, setMovesPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [movesCustom, setMovesCustom] = useState({ from: '', to: '' });
  const [moves, setMoves] = useState<OperationLog[]>([]);

  // أداء المحصل — مؤشرات الأداء خلال فترة الدوام الفعلية
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfCol, setPerfCol] = useState<Collector | null>(null);
  const [perfShift, setPerfShift] = useState<any>(null);
  const [perfInvoices, setPerfInvoices] = useState<Invoice[]>([]);
  const [perfDevices, setPerfDevices] = useState<Device[]>([]);

  const load = () => {
    setCollectors(db.select<Collector>('collectors').sort((a, b) => a.name.localeCompare(b.name, 'ar')));
    const sh = db.select<any>('collector_shifts').sort((a, b) => (b.check_in_at || '').localeCompare(a.check_in_at || '')).slice(0, 50);
    setShifts(sh.map((s) => ({ ...s, collector: db.first<any>('collectors', (r) => r.id === s.collector_id) })));
  };

  useEffect(() => { load(); }, []);

  const save = () => {
    if (!name.trim()) return;
    if (editCol) {
      db.updateById('collectors', editCol.id, { name: name.trim(), phone: phone || null });
      push('تم التعديل', 'success');
    } else {
      const created = db.insert('collectors', { name: name.trim(), phone: phone || null, is_active: true, created_at: db.now() });
      log('add_collector', 'collectors', created.id, name);
      push('تمت الإضافة', 'success');
    }
    setAddOpen(false); setEditCol(null); setName(''); setPhone('');
    load();
  };

  const checkIn = (c: Collector) => {
    const open = db.first<any>('collector_shifts', (r) => r.collector_id === c.id && !r.check_out_at);
    if (open) { push('يوجد دوام مفتوح بالفعل', 'error'); return; }
    db.insert('collector_shifts', { collector_id: c.id, check_in_at: db.now(), check_out_at: null, hours: 0, note: null });
    log('check_in', 'collector_shifts', c.id, c.name);
    push(`تم تسجيل دخول ${c.name}`, 'success');
    load();
  };

  const checkOut = (c: Collector) => {
    const open = db.select<any>('collector_shifts').filter((r) => r.collector_id === c.id && !r.check_out_at).sort((a, b) => (b.check_in_at || '').localeCompare(a.check_in_at || ''))[0];
    if (!open) { push('لا يوجد دوام مفتوح', 'error'); return; }
    const out = new Date();
    const inAt = new Date(open.check_in_at);
    const hours = Math.round(((out.getTime() - inAt.getTime()) / 3600000) * 100) / 100;
    db.updateById('collector_shifts', open.id, { check_out_at: out.toISOString(), hours });
    log('check_out', 'collector_shifts', c.id, String(hours));
    push(`تم تسجيل خروج ${c.name} (${hours} ساعة)`, 'success');
    load();
  };

  const totalHours = shifts.reduce((s: number, sh: any) => s + Number(sh.hours || 0), 0);

  // تحميل حركات المحصل خلال فترة محددة من سجل العمليات
  const loadMoves = (c: Collector, period: 'today' | 'week' | 'month' | 'custom', custom?: { from: string; to: string }) => {
    const range = periodRange(period, custom);
    const all = db.select<OperationLog>('operation_log');
    const filtered = all
      .filter((r) => r.user_name === c.name)
      .filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= new Date(range.from).getTime() && t <= new Date(range.to).getTime();
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    setMoves(filtered);
  };

  const openMoves = (c: Collector) => {
    setMovesCol(c);
    setMovesPeriod('today');
    setMovesCustom({ from: '', to: '' });
    loadMoves(c, 'today');
    setMovesOpen(true);
  };

  const applyMovesPeriod = () => {
    if (!movesCol) return;
    if (movesPeriod === 'custom' && (!movesCustom.from || !movesCustom.to)) {
      push('يرجى تحديد التاريخ من وإلى', 'error');
      return;
    }
    loadMoves(movesCol, movesPeriod, movesPeriod === 'custom' ? movesCustom : undefined);
  };

  // طباعة بيان احترافي بحركات المحصل
  const printMoves = () => {
    if (!movesCol) return;
    const range = periodRange(movesPeriod, movesPeriod === 'custom' ? movesCustom : undefined);
    const shopName = db.getSetting('shop_name', 'نظام نقطة شحن أبو عادل');
    const rowsHtml = moves.map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${fmtDateTime(m.created_at)}</td>
        <td>${m.action || '—'}</td>
        <td>${m.entity || '—'}</td>
        <td>${m.value || '—'}</td>
      </tr>`).join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
      <title>بيان حركات المحصل ${movesCol.name}</title>
      <style>
        body{font-family:'Segoe UI',Tahoma,sans-serif;padding:32px;color:#1e293b}
        h1{font-size:20px;margin:0 0 4px}
        .sub{color:#64748b;font-size:13px;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:right}
        th{background:#f1f5f9;font-weight:bold}
        .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #0ea5e9;padding-bottom:12px}
        .badge{background:#0ea5e9;color:#fff;padding:2px 10px;border-radius:9999px;font-size:12px}
      </style></head><body>
      <div class="head">
        <div><h1>${shopName}</h1><div class="sub">بيان حركات المحصل خلال فترة محددة</div></div>
        <span class="badge">محصل</span>
      </div>
      <p><b>المحصل:</b> ${movesCol.name} &nbsp;•&nbsp; <b>الهاتف:</b> ${movesCol.phone || '—'}</p>
      <p><b>الفترة من:</b> ${fmtDateTime(range.from)} &nbsp;•&nbsp; <b>إلى:</b> ${fmtDateTime(range.to)}</p>
      <p><b>عدد الحركات:</b> ${moves.length}</p>
      <table>
        <thead><tr><th>#</th><th>التاريخ والوقت</th><th>الإجراء</th><th>الكيان</th><th>القيمة</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan=5 style=text-align:center>لا توجد حركات</td></tr>'}</tbody>
      </table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { push('يرجى السماح بالنوافذ المنبثقة للطباعة', 'error'); return; }
    w.document.write(html);
    w.document.close();
  };

  // تحميل أداء المحصل خلال فترة دوامه الفعلية
  const openPerf = (c: Collector) => {
    setPerfCol(c);
    // آخر دوام (مفتوح أو مغلق) — نأخذ الأحدث
    const sh = db.select<any>('collector_shifts')
      .filter((r) => r.collector_id === c.id)
      .sort((a, b) => (b.check_in_at || '').localeCompare(a.check_in_at || ''))[0];
    setPerfShift(sh || null);
    if (!sh) {
      setPerfInvoices([]);
      setPerfDevices([]);
      setPerfOpen(true);
      return;
    }
    const from = new Date(sh.check_in_at).getTime();
    const to = sh.check_out_at ? new Date(sh.check_out_at).getTime() : Date.now();
    const invs = db.select<Invoice>('invoices')
      .filter((r) => r.collector_id === c.id)
      .filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= from && t <= to;
      })
      .filter((r) => !r.reversed)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    setPerfInvoices(invs);
    const devs = db.select<Device>('devices')
      .filter((r) => r.collector_id === c.id)
      .filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= from && t <= to;
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    setPerfDevices(devs);
    setPerfOpen(true);
  };

  const perfTotal = perfInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const perfAvg = perfInvoices.length ? perfTotal / perfInvoices.length : 0;
  const perfDevicesRevenue = perfDevices.reduce((s, d) => s + Number(d.price || 0), 0);

  // طباعة تقرير أداء المحصل
  const printPerf = () => {
    if (!perfCol || !perfShift) return;
    const shopName = db.getSetting('shop_name', 'نظام نقطة شحن أبو عادل');
    const invRows = perfInvoices.map((inv, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${fmtDateTime(inv.created_at)}</td>
        <td>${money(inv.total)}</td>
        <td>${inv.paid ? 'مدفوعة' : 'غير مدفوعة'}</td>
      </tr>`).join('');
    const devRows = perfDevices.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${fmtDateTime(d.created_at)}</td>
        <td>${d.device_type || '—'}</td>
        <td>${money(d.price)}</td>
        <td>${d.status === 'delivered' ? 'تم التسليم' : d.status === 'charging' ? 'قيد الشحن' : 'ملغى'}</td>
      </tr>`).join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
      <title>تقرير أداء المحصل ${perfCol.name}</title>
      <style>
        body{font-family:'Segoe UI',Tahoma,sans-serif;padding:32px;color:#1e293b}
        h1{font-size:20px;margin:0 0 4px}
        .sub{color:#64748b;font-size:13px;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px}
        th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:right}
        th{background:#f1f5f9;font-weight:bold}
        .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #10b981;padding-bottom:12px}
        .badge{background:#10b981;color:#fff;padding:2px 10px;border-radius:9999px;font-size:12px}
        .kpis{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}
        .kpi{flex:1;min-width:160px;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px}
        .kpi .l{font-size:12px;color:#64748b}
        .kpi .v{font-size:20px;font-weight:bold;margin-top:4px}
        h2{font-size:15px;margin:20px 0 8px;border-right:3px solid #0ea5e9;padding-right:8px}
      </style></head><body>
      <div class="head">
        <div><h1>${shopName}</h1><div class="sub">تقرير أداء المحصل خلال فترة الدوام الفعلية</div></div>
        <span class="badge">أداء</span>
      </div>
      <p><b>المحصل:</b> ${perfCol.name} &nbsp;•&nbsp; <b>الهاتف:</b> ${perfCol.phone || '—'}</p>
      <p><b>بداية الدوام:</b> ${fmtDateTime(perfShift.check_in_at)} &nbsp;•&nbsp; <b>نهاية الدوام:</b> ${perfShift.check_out_at ? fmtDateTime(perfShift.check_out_at) : 'مفتوح'} &nbsp;•&nbsp; <b>الساعات:</b> ${perfShift.hours || '—'}</p>
      <div class="kpis">
        <div class="kpi"><div class="l">عدد الفواتير</div><div class="v">${perfInvoices.length}</div></div>
        <div class="kpi"><div class="l">إجمالي القيمة</div><div class="v">${money(perfTotal)}</div></div>
        <div class="kpi"><div class="l">المتوسط لكل فاتورة</div><div class="v">${money(perfAvg)}</div></div>
        <div class="kpi"><div class="l">عدد الأجهزة</div><div class="v">${perfDevices.length}</div></div>
        <div class="kpi"><div class="l">إيرادات الأجهزة</div><div class="v">${money(perfDevicesRevenue)}</div></div>
      </div>
      <h2>الفواتير (${perfInvoices.length})</h2>
      <table>
        <thead><tr><th>#</th><th>التاريخ</th><th>المجموع</th><th>الحالة</th></tr></thead>
        <tbody>${invRows || '<tr><td colspan=4 style=text-align:center>لا توجد فواتير</td></tr>'}</tbody>
      </table>
      <h2>الأجهزة (${perfDevices.length})</h2>
      <table>
        <thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>السعر</th><th>الحالة</th></tr></thead>
        <tbody>${devRows || '<tr><td colspan=5 style=text-align:center>لا توجد أجهزة</td></tr>'}</tbody>
      </table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { push('يرجى السماح بالنوافذ المنبثقة للطباعة', 'error'); return; }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<UserCheck size={24} />}>المحصلين والدوام والإنتاجية</SectionTitle>
        <button onClick={() => { setEditCol(null); setName(''); setPhone(''); setAddOpen(true); }} className="btn-primary"><Plus size={18} /> محصل جديد</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="عدد المحصلين" value={String(collectors.length)} color="sky" />
        <Stat label="إجمالي ساعات العمل" value={String(totalHours)} color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3">المحصلون</h3>
          {collectors.length === 0 ? <EmptyState icon={<UserCheck size={32} />} title="لا يوجد محصلون" /> : (
            <div className="space-y-2">
              {collectors.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-sky-700 dark:text-sky-300 font-bold">{c.name[0]}</div>
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{c.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{c.phone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openMoves(c)} className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30" title="حركات المحصل"><ScrollText size={16} /></button>
                    <button onClick={() => openPerf(c)} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30" title="أداء المحصل"><BarChart3 size={16} /></button>
                    <button onClick={() => checkIn(c)} disabled={!c.is_active} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30" title="دخول"><LogIn size={16} /></button>
                    <button onClick={() => checkOut(c)} disabled={!c.is_active} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="خروج"><LogOut size={16} /></button>
                    <button onClick={() => { setEditCol(c); setName(c.name); setPhone(c.phone || ''); setAddOpen(true); }} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" title="تعديل"><Pencil size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-3">سجل الدوام</h3>
          {shifts.length === 0 ? <EmptyState icon={<Clock size={32} />} title="لا توجد سجلات" /> : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2 font-bold">المحصل</th>
                    <th className="text-right px-3 py-2 font-bold">الدخول</th>
                    <th className="text-right px-3 py-2 font-bold">الخروج</th>
                    <th className="text-right px-3 py-2 font-bold">الساعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {shifts.map((sh) => (
                    <tr key={sh.id} className="table-row">
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{sh.collector?.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtTime(sh.check_in_at)}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{sh.check_out_at ? fmtTime(sh.check_out_at) : <Badge color="amber">مفتوح</Badge>}</td>
                      <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">{sh.hours || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editCol ? 'تعديل محصل' : 'محصل جديد'} size="sm">
        <div className="space-y-3">
          <div><label className="label">الاسم *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><label className="label">الهاتف</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setAddOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={save} className="btn-primary">حفظ</button>
        </div>
      </Modal>

      {/* حركات المحصل خلال فترة محددة */}
      <Modal open={movesOpen} onClose={() => setMovesOpen(false)} title={`حركات المحصل${movesCol ? ' — ' + movesCol.name : ''}`} size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">الفترة</label>
              <select className="input" value={movesPeriod} onChange={(e) => setMovesPeriod(e.target.value as any)}>
                <option value="today">اليوم</option>
                <option value="week">هذا الأسبوع</option>
                <option value="month">هذا الشهر</option>
                <option value="custom">مخصص</option>
              </select>
            </div>
            {movesPeriod === 'custom' && (
              <>
                <div>
                  <label className="label">من</label>
                  <input type="date" className="input" value={movesCustom.from} onChange={(e) => setMovesCustom({ ...movesCustom, from: e.target.value })} />
                </div>
                <div>
                  <label className="label">إلى</label>
                  <input type="date" className="input" value={movesCustom.to} onChange={(e) => setMovesCustom({ ...movesCustom, to: e.target.value })} />
                </div>
              </>
            )}
            <button onClick={applyMovesPeriod} className="btn-primary">عرض</button>
            <button onClick={printMoves} className="btn-ghost"><Printer size={16} /> طباعة</button>
          </div>
          {moves.length === 0 ? (
            <EmptyState icon={<ScrollText size={32} />} title="لا توجد حركات في هذه الفترة" />
          ) : (
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2 font-bold">#</th>
                    <th className="text-right px-3 py-2 font-bold">التاريخ والوقت</th>
                    <th className="text-right px-3 py-2 font-bold">الإجراء</th>
                    <th className="text-right px-3 py-2 font-bold">الكيان</th>
                    <th className="text-right px-3 py-2 font-bold">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {moves.map((m, i) => (
                    <tr key={m.id} className="table-row">
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">{fmtDateTime(m.created_at)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{m.action}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{m.entity || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{m.value || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* أداء المحصل خلال فترة الدوام الفعلية */}
      <Modal open={perfOpen} onClose={() => setPerfOpen(false)} title={`أداء المحصل${perfCol ? ' — ' + perfCol.name : ''}`} size="lg">
        <div className="space-y-4">
          {!perfShift ? (
            <EmptyState icon={<BarChart3 size={32} />} title="لا يوجد دوام مسجل لهذا المحصل" />
          ) : (
            <>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-600 dark:text-slate-300">
                <p><b>بداية الدوام:</b> {fmtDateTime(perfShift.check_in_at)}</p>
                <p><b>نهاية الدوام:</b> {perfShift.check_out_at ? fmtDateTime(perfShift.check_out_at) : <Badge color="amber">مفتوح</Badge>} &nbsp;•&nbsp; <b>الساعات:</b> {perfShift.hours || '—'}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Stat label="عدد الفواتير" value={String(perfInvoices.length)} color="sky" />
                <Stat label="إجمالي القيمة" value={money(perfTotal)} color="emerald" />
                <Stat label="المتوسط لكل فاتورة" value={money(perfAvg)} color="violet" />
                <Stat label="عدد الأجهزة" value={String(perfDevices.length)} color="amber" />
                <Stat label="إيرادات الأجهزة" value={money(perfDevicesRevenue)} color="rose" />
              </div>
              <div className="flex justify-end">
                <button onClick={printPerf} className="btn-ghost"><Printer size={16} /> طباعة التقرير</button>
              </div>
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">الفواتير ({perfInvoices.length})</h4>
                {perfInvoices.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">لا توجد فواتير</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                        <tr>
                          <th className="text-right px-3 py-2 font-bold">#</th>
                          <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                          <th className="text-right px-3 py-2 font-bold">المجموع</th>
                          <th className="text-right px-3 py-2 font-bold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {perfInvoices.map((inv, i) => (
                          <tr key={inv.id} className="table-row">
                            <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">{fmtDateTime(inv.created_at)}</td>
                            <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">{money(inv.total)}</td>
                            <td className="px-3 py-2">{inv.paid ? <Badge color="emerald">مدفوعة</Badge> : <Badge color="rose">غير مدفوعة</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">الأجهزة ({perfDevices.length})</h4>
                {perfDevices.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">لا توجد أجهزة</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                        <tr>
                          <th className="text-right px-3 py-2 font-bold">#</th>
                          <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                          <th className="text-right px-3 py-2 font-bold">النوع</th>
                          <th className="text-right px-3 py-2 font-bold">السعر</th>
                          <th className="text-right px-3 py-2 font-bold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {perfDevices.map((d, i) => (
                          <tr key={d.id} className="table-row">
                            <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs">{fmtDateTime(d.created_at)}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{d.device_type || '—'}</td>
                            <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">{money(d.price)}</td>
                            <td className="px-3 py-2">{d.status === 'delivered' ? <Badge color="emerald">تم التسليم</Badge> : d.status === 'charging' ? <Badge color="sky">قيد الشحن</Badge> : <Badge color="rose">ملغى</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
