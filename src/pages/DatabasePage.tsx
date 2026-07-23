import { useState, useMemo } from 'react';
import { Database, Download, Upload, History, Trash2, Search, Printer } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { fmtDateTime, fmtDate } from '../lib/format';
import { SectionTitle, EmptyState } from '../components/ui';
import ConfirmDialog from '../components/ConfirmDialog';

export default function DatabasePage() {
  const { log } = useStore();
  const { push } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const exportJSON = () => {
    const dump = db.exportAll();
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), data: dump }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log('backup_export', 'database', undefined, 'json');
    push('تم تصدير النسخة الاحتياطية', 'success');
  };

  const importJSON = (file: File) => {
    setImporting(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const data = parsed.data || parsed;
        db.importAll(data);
        log('backup_import', 'database', undefined, 'json');
        push('تم استيراد البيانات بنجاح', 'success');
      } catch {
        push('ملف غير صالح', 'error');
      }
      setImporting(false);
    };
    reader.readAsText(file);
  };

  const loadLogs = () => {
    setLogs(db.select<any>('operation_log').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
    setLogsOpen(true);
    setSearchQuery(''); setActionFilter('all'); setEntityFilter('all'); setUserFilter('all'); setDateFrom(''); setDateTo('');
  };

  const uniqueActions = useMemo(() => Array.from(new Set(logs.map((l) => l.action).filter(Boolean))).sort(), [logs]);
  const uniqueEntities = useMemo(() => Array.from(new Set(logs.map((l) => l.entity).filter(Boolean))).sort(), [logs]);
  const uniqueUsers = useMemo(() => Array.from(new Set(logs.map((l) => l.user_name).filter(Boolean))).sort(), [logs]);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((l) =>
        (l.action || '').toLowerCase().includes(q) ||
        (l.entity || '').toLowerCase().includes(q) ||
        (l.user_name || '').toLowerCase().includes(q) ||
        (l.value || '').toLowerCase().includes(q) ||
        (l.entity_id || '').toLowerCase().includes(q)
      );
    }
    if (actionFilter !== 'all') result = result.filter((l) => l.action === actionFilter);
    if (entityFilter !== 'all') result = result.filter((l) => l.entity === entityFilter);
    if (userFilter !== 'all') result = result.filter((l) => l.user_name === userFilter);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((l) => new Date(l.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59').getTime();
      result = result.filter((l) => new Date(l.created_at).getTime() <= to);
    }
    return result;
  }, [logs, searchQuery, actionFilter, entityFilter, userFilter, dateFrom, dateTo]);

  const printLogs = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = filteredLogs.map((l) => `
      <tr>
        <td>${fmtDateTime(l.created_at)}</td>
        <td>${l.user_name || '—'}</td>
        <td>${l.action || '—'}</td>
        <td>${l.entity || '—'}</td>
        <td>${l.value || '—'}</td>
      </tr>`).join('');
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>سجل العمليات</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;color:#475569;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{padding:6px;border-bottom:1px solid #e2e8f0;text-align:right}
        th{background:#f1f5f9;font-weight:700}
      </style></head><body>
      <h1>نظام نقطة شحن أبو عادل</h1>
      <h2>سجل العمليات — ${fmtDate(new Date())} — عدد: ${filteredLogs.length}</h2>
      <table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>القيمة</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.print();
  };

  const confirmClear = () => {
    db.clearAll();
    log('clear_database', 'database', undefined, 'all');
    push('تم مسح كل البيانات وإعادة التهيئة', 'info');
    setClearOpen(false);
  };

  return (
    <div className="space-y-5 animate-fade">
      <SectionTitle icon={<Database size={24} />}>قاعدة البيانات والنسخ الاحتياطي</SectionTitle>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-600 dark:text-sky-400"><Download size={26} /></div>
          <h3 className="font-bold text-slate-700 dark:text-slate-200">نسخة احتياطية</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">تصدير كل البيانات إلى ملف JSON.</p>
          <button onClick={exportJSON} className="btn-primary w-full">تصدير JSON</button>
        </div>
        <div className="card p-5 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400"><Upload size={26} /></div>
          <h3 className="font-bold text-slate-700 dark:text-slate-200">استعادة البيانات</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">استيراد ملف JSON لاستعادة النسخة.</p>
          <label className="btn-success w-full cursor-pointer">
            {importing ? 'جارٍ الاستيراد...' : 'استيراد JSON'}
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
          </label>
        </div>
        <div className="card p-5 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-400"><History size={26} /></div>
          <h3 className="font-bold text-slate-700 dark:text-slate-200">سجل العمليات</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">عرض وبحث العمليات على النظام.</p>
          <button onClick={loadLogs} className="btn-ghost w-full">عرض السجل</button>
        </div>
        <div className="card p-5 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400"><Trash2 size={26} /></div>
          <h3 className="font-bold text-slate-700 dark:text-slate-200">مسح البيانات</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">إعادة ضبط النظام بالكامل (تأكيد مطلوب).</p>
          <button onClick={() => setClearOpen(true)} className="btn-danger w-full">مسح الكل</button>
        </div>
      </div>

      {logsOpen && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">سجل العمليات ({filteredLogs.length})</h3>
            <div className="flex gap-2">
              <button onClick={printLogs} className="btn-ghost text-sm"><Printer size={16} /> طباعة</button>
              <button onClick={() => setLogsOpen(false)} className="text-sm text-slate-500 dark:text-slate-400">إغلاق</button>
            </div>
          </div>

          {/* Advanced search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
              <input className="input pr-9 text-sm" placeholder="بحث نصي..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <select className="input text-sm" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">كل العمليات</option>
              {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="input text-sm" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="all">كل الكيانات</option>
              {uniqueEntities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select className="input text-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="all">كل المستخدمين</option>
              {uniqueUsers.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <div className="flex gap-2 lg:col-span-2">
              <div className="flex-1"><input type="date" className="input text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="من تاريخ" /></div>
              <div className="flex-1"><input type="date" className="input text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="إلى تاريخ" /></div>
            </div>
          </div>

          {filteredLogs.length === 0 ? <EmptyState title="لا توجد عمليات مطابقة" /> : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs sticky top-0">
                  <tr>
                    <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                    <th className="text-right px-3 py-2 font-bold">المستخدم</th>
                    <th className="text-right px-3 py-2 font-bold">العملية</th>
                    <th className="text-right px-3 py-2 font-bold">الكيان</th>
                    <th className="text-right px-3 py-2 font-bold">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredLogs.map((l) => (
                    <tr key={l.id} className="table-row dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{fmtDateTime(l.created_at)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{l.user_name || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{l.action}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.entity || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.value || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={clearOpen}
        title="مسح كل البيانات"
        message="سيتم مسح جميع الحسابات والسجلات والعدادات نهائيًا. لا يمكن التراجع. تأكد من وجود نسخة احتياطية."
        confirmText="مسح نهائي"
        danger
        onConfirm={confirmClear}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
