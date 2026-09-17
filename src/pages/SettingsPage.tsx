import { useState } from 'react';
import { Settings as SettingsIcon, Users, Lock, Plus, Trash2, Shield, KeyRound, PiggyBank, ChevronDown } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { SectionTitle, Badge } from '../components/ui';
import type { AppUser } from '../lib/types';

type Page = 'dashboard' | 'charging' | 'drinks' | 'debts' | 'partners' | 'cashboxes' | 'inventory' | 'suppliers' | 'collectors' | 'reports';
const ALL_PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'لوحة التحكم' },
  { id: 'charging', label: 'قسم الشحن' },
  { id: 'drinks', label: 'قسم المشروبات' },
  { id: 'debts', label: 'إدارة الديون' },
  { id: 'partners', label: 'حسابات الشركاء' },
  { id: 'cashboxes', label: 'الصناديق المالية' },
  { id: 'inventory', label: 'المخزون' },
  { id: 'suppliers', label: 'الموردون' },
  { id: 'collectors', label: 'المحصلون' },
  { id: 'reports', label: 'التقارير' },
];
const DEFAULT_EMPLOYEE_PAGES: Page[] = ['dashboard', 'charging', 'drinks', 'debts', 'collectors'];

export default function SettingsPage({ requirePin }: { requirePin: (fn: () => void) => void }) {
  const { currentUser, users, settings, refreshUsers, refreshSettings, log } = useStore();
  const { push } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'owner' | 'employee'>('employee');
  const [savings, setSavings] = useState(String(settings.daily_savings_per_partner || '10'));
  const [shopName, setShopName] = useState(settings.shop_name || '');
  const [ownerPw, setOwnerPw] = useState(settings.owner_password || '');
  const [permExpand, setPermExpand] = useState<string | null>(null); // expanded user id for permissions

  const addUser = () => {
    if (!name.trim()) return;
    const created = db.insert('app_users', { name: name.trim(), role, is_active: true, created_at: db.now() });
    log('add_user', 'app_users', created.id, name);
    push('تمت إضافة المستخدم', 'success');
    setName(''); setRole('employee'); setAddOpen(false);
    refreshUsers();
  };

  const toggleRole = (u: AppUser) => {
    if (u.id === currentUser?.id) { push('لا يمكن تعديل دورك الحالي', 'error'); return; }
    db.updateById('app_users', u.id, { role: u.role === 'owner' ? 'employee' : 'owner' });
    refreshUsers();
  };

  const toggleActive = (u: AppUser) => {
    if (u.id === currentUser?.id) { push('لا يمكن إيقاف حسابك الحالي', 'error'); return; }
    db.updateById('app_users', u.id, { is_active: !u.is_active });
    refreshUsers();
  };

  const deleteUser = (u: AppUser) => {
    if (u.id === currentUser?.id) { push('لا يمكن حذف حسابك الحالي', 'error'); return; }
    if (!confirm(`حذف المستخدم "${u.name}"؟`)) return;
    db.removeById('app_users', u.id);
    log('delete_user', 'app_users', u.id, u.name);
    refreshUsers();
  };

  const saveSavings = () => {
    db.setSetting('daily_savings_per_partner', savings);
    refreshSettings();
    push('تم حفظ إعداد الحصالة', 'success');
  };

  const toggleSavingsEnabled = () => {
    const next = settings.savings_enabled === '0' ? '1' : '0';
    db.setSetting('savings_enabled', next);
    refreshSettings();
    push(next === '1' ? 'تم تفعيل الحصالة اليومية' : 'تم تعطيل الحصالة اليومية', 'success');
  };

  const getUserPerms = (u: AppUser): Page[] => {
    if (!u.page_permissions) return DEFAULT_EMPLOYEE_PAGES;
    try { return JSON.parse(u.page_permissions as string); } catch { return DEFAULT_EMPLOYEE_PAGES; }
  };

  const togglePagePerm = (u: AppUser, pageId: Page) => {
    const current = getUserPerms(u);
    const next = current.includes(pageId) ? current.filter((p) => p !== pageId) : [...current, pageId];
    db.updateById('app_users', u.id, { page_permissions: JSON.stringify(next) });
    refreshUsers();
  };

  const saveShopName = () => {
    db.setSetting('shop_name', shopName);
    db.setSetting('owner_password', ownerPw);
    refreshSettings();
    push('تم حفظ اسم النظام', 'success');
  };

  const changePin = () => {
    requirePin(() => {
      const newPin = prompt('أدخل كلمة المرور الجديدة (4 أرقام):');
      if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { push('كلمة المرور يجب أن تكون 4 أرقام', 'error'); return; }
      db.setSetting('debt_lock_pin', newPin);
      refreshSettings();
      push('تم تغيير كلمة مرور القفل', 'success');
    });
  };

  return (
    <div className="space-y-5 animate-fade">
      <SectionTitle icon={<SettingsIcon size={24} />}>الإعدادات والصلاحيات</SectionTitle>

      <div className="card p-5">
        <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><KeyRound size={18} /> الإعدادات العامة</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">اسم النظام</label>
            <div className="flex gap-2">
              <input className="input" value={shopName} onChange={(e) => setShopName(e.target.value)} />
              <button onClick={saveShopName} className="btn-primary">حفظ</button>
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-2">
              <PiggyBank size={16} /> حصالة يومية لكل شريك (₪)
            </label>
            <div className="flex gap-2 items-center">
              <input className="input" type="number" value={savings} onChange={(e) => setSavings(e.target.value)} />
              <button onClick={saveSavings} className="btn-primary">حفظ</button>
              <button
                onClick={toggleSavingsEnabled}
                className={`px-3 py-2 rounded-xl text-sm font-bold transition ${settings.savings_enabled !== '0' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
                title={settings.savings_enabled !== '0' ? 'الحصالة مفعّلة — اضغط لتعطيلها' : 'الحصالة معطّلة — اضغط لتفعيلها'}
              >
                {settings.savings_enabled !== '0' ? '● مفعّلة' : '○ معطّلة'}
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">كلمة مرور المالك (للإجراءات الحساسة)</label>
            <div className="flex gap-2">
              <input className="input" type="password" value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} placeholder="اتركها فارغة لتعطيل الحماية" />
              <button onClick={saveShopName} className="btn-primary">حفظ</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-700 flex items-center gap-2"><Lock size={18} /> قفل المديونية</h3>
          <button onClick={changePin} className="btn-ghost text-sm">تغيير كلمة المرور</button>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
          <Shield className={settings.debt_lock_pin ? 'text-emerald-500' : 'text-slate-400'} size={20} />
          <div className="flex-1">
            <p className="font-semibold text-slate-700">حالة القفل</p>
            <p className="text-sm text-slate-500">{settings.debt_lock_pin ? 'مفعّل — كلمة المرور محددة' : 'غير مفعّل — سيُطلب إنشاء كلمة مرور عند أول استخدام'}</p>
          </div>
          <Badge color={settings.debt_lock_pin ? 'emerald' : 'amber'}>{settings.debt_lock_pin ? 'مفعّل' : 'غير مفعّل'}</Badge>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-700 flex items-center gap-2"><Users size={18} /> المستخدمون والصلاحيات</h3>
          <button onClick={() => setAddOpen(true)} className="btn-primary text-sm"><Plus size={16} /> مستخدم</button>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300 font-bold">{u.name[0]}</div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.role === 'owner' ? 'مالك النظام' : 'موظف'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={u.role === 'owner' ? 'sky' : 'slate'}>{u.role === 'owner' ? 'مالك' : 'موظف'}</Badge>
                  <Badge color={u.is_active ? 'emerald' : 'rose'}>{u.is_active ? 'نشط' : 'متوقف'}</Badge>
                  {currentUser?.role === 'owner' && (
                    <div className="flex gap-1">
                      {u.role === 'employee' && (
                        <button onClick={() => setPermExpand(permExpand === u.id ? null : u.id)} className="p-1.5 rounded-lg text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30" title="صلاحيات الصفحات"><ChevronDown size={14} className={`transition ${permExpand === u.id ? 'rotate-180' : ''}`} /></button>
                      )}
                      <button onClick={() => toggleRole(u)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title="تبديل الدور"><Shield size={14} /></button>
                      <button onClick={() => toggleActive(u)} className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30" title="تفعيل/إيقاف"><Lock size={14} /></button>
                      <button onClick={() => deleteUser(u)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="حذف"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
              {permExpand === u.id && u.role === 'employee' && (
                <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">الصفحات المسموح بها</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {ALL_PAGES.map((pg) => {
                      const allowed = getUserPerms(u).includes(pg.id);
                      return (
                        <button key={pg.id} onClick={() => togglePagePerm(u, pg.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-right transition ${allowed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-white text-slate-400 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500'}`}>
                          {allowed ? '✓ ' : '○ '}{pg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="مستخدم جديد" size="sm">
        <div className="space-y-3">
          <div><label className="label">الاسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div>
            <label className="label">الدور</label>
            <div className="flex gap-2">
              <button onClick={() => setRole('owner')} className={`flex-1 py-3 rounded-xl font-bold ${role === 'owner' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>مالك</button>
              <button onClick={() => setRole('employee')} className={`flex-1 py-3 rounded-xl font-bold ${role === 'employee' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>موظف</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setAddOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={addUser} className="btn-primary">إضافة</button>
        </div>
      </Modal>
    </div>
  );
}
