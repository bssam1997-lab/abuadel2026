import { useState } from 'react';
import { Settings as SettingsIcon, Users, Lock, Plus, Trash2, Shield, KeyRound } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { SectionTitle, Badge } from '../components/ui';
import type { AppUser } from '../lib/types';

export default function SettingsPage({ requirePin }: { requirePin: (fn: () => void) => void }) {
  const { currentUser, users, settings, refreshUsers, refreshSettings, log } = useStore();
  const { push } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'owner' | 'employee'>('employee');
  const [savings, setSavings] = useState(String(settings.daily_savings_per_partner || '10'));
  const [shopName, setShopName] = useState(settings.shop_name || '');
  const [ownerPw, setOwnerPw] = useState(settings.owner_password || '');

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
            <label className="label">حصالة يومية لكل شريك (₪)</label>
            <div className="flex gap-2">
              <input className="input" type="number" value={savings} onChange={(e) => setSavings(e.target.value)} />
              <button onClick={saveSavings} className="btn-primary">حفظ</button>
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
            <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold">{u.name[0]}</div>
                <div>
                  <p className="font-semibold text-slate-700">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.role === 'owner' ? 'مالك النظام' : 'موظف'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={u.role === 'owner' ? 'sky' : 'slate'}>{u.role === 'owner' ? 'مالك' : 'موظف'}</Badge>
                <Badge color={u.is_active ? 'emerald' : 'rose'}>{u.is_active ? 'نشط' : 'متوقف'}</Badge>
                {currentUser?.role === 'owner' && (
                  <div className="flex gap-1">
                    <button onClick={() => toggleRole(u)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="تبديل الدور"><Shield size={14} /></button>
                    <button onClick={() => toggleActive(u)} className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50" title="تفعيل/إيقاف"><Lock size={14} /></button>
                    <button onClick={() => deleteUser(u)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title="حذف"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
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
