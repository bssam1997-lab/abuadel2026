import { useState, useEffect } from 'react';
import {
  LayoutDashboard, BatteryCharging, CupSoda, Users, Settings, Wallet,
  Boxes, Truck, UserCheck, FileBarChart, Database, Menu, LogOut,
  Lock, ChevronDown, Zap, RotateCw, Moon, Sun, X, Sliders
} from 'lucide-react';
import { StoreProvider, useStore } from './lib/store';
import * as db from './lib/db';
import { ToastProvider, useToast } from './components/Toast';
import Modal from './components/Modal';
import Dashboard from './pages/Dashboard';
import Charging from './pages/Charging';
import Drinks from './pages/Drinks';
import Debts from './pages/Debts';
import Partners from './pages/Partners';
import CashBoxes from './pages/CashBoxes';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import Collectors from './pages/Collectors';
import Reports from './pages/Reports';
import DatabasePage from './pages/DatabasePage';
import SettingsPage from './pages/SettingsPage';

type Page = 'dashboard' | 'charging' | 'drinks' | 'debts' | 'partners' | 'cashboxes' | 'inventory' | 'suppliers' | 'collectors' | 'reports' | 'database' | 'settings';

type NavItem = { id: Page; label: string; icon: any };

const mainNav: NavItem[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'charging', label: 'قسم الشحن', icon: BatteryCharging },
  { id: 'drinks', label: 'قسم المشروبات', icon: CupSoda },
  { id: 'debts', label: 'إدارة الديون', icon: Users },
];

const adminNav: NavItem[] = [
  { id: 'partners', label: 'الشركاء', icon: Wallet },
  { id: 'cashboxes', label: 'الصناديق', icon: Boxes },
  { id: 'inventory', label: 'المخازن', icon: Boxes },
  { id: 'suppliers', label: 'الموردين', icon: Truck },
  { id: 'collectors', label: 'المحصلين', icon: UserCheck },
  { id: 'reports', label: 'التقارير', icon: FileBarChart },
];

const allNav = [...mainNav, ...adminNav, { id: 'database' as Page, label: 'قاعدة البيانات', icon: Database }, { id: 'settings' as Page, label: 'الإعدادات', icon: Settings }];

function Shell() {
  const { currentUser, users, settings, loading, setCurrentUser, refreshUsers, refreshSettings } = useStore();
  const { push } = useToast();
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<'create' | 'verify'>('verify');
  const [pinInput, setPinInput] = useState('');
  const [pinPending, setPinPending] = useState<(() => void) | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [dark, setDark] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupName, setSetupName] = useState('');

  useEffect(() => {
    if (loading) return;
    if (users.length === 0) {
      setLoginOpen(false);
      setSetupOpen(true);
    } else {
      setSetupOpen(false);
      setLoginOpen(!currentUser);
    }
  }, [loading, users.length, currentUser]);

  const isOwner = currentUser?.role === 'owner';

  const handleSetup = () => {
    if (!setupName.trim()) return;
    const created = db.insert('app_users', { name: setupName.trim(), role: 'owner', is_active: true, created_at: db.now() });
    refreshUsers();
    setCurrentUser(created as any);
    setSetupOpen(false);
    push('تم إنشاء حساب المالك', 'success');
  };

  const handleLogin = async () => {
    const u = users.find((x) => x.id === selectedUser);
    if (!u) return;
    setCurrentUser(u);
    setLoginOpen(false);
    push(`مرحبًا ${u.name}`, 'success');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginOpen(true);
    setPage('dashboard');
  };

  const requirePin = (action: () => void) => {
    if (!settings.debt_lock_pin) {
      setPinMode('create');
      setPinInput('');
      setPinPending(() => action);
      setPinOpen(true);
    } else {
      setPinMode('verify');
      setPinInput('');
      setPinPending(() => action);
      setPinOpen(true);
    }
  };

  const submitPin = () => {
    if (pinMode === 'create') {
      if (pinInput.length !== 4) { push('كلمة المرور يجب أن تكون 4 أرقام', 'error'); return; }
      db.setSetting('debt_lock_pin', pinInput);
      refreshSettings();
      setPinOpen(false);
      push('تم إنشاء كلمة مرور القفل', 'success');
      pinPending?.();
    } else {
      if (pinInput === settings.debt_lock_pin) {
        setPinOpen(false);
        pinPending?.();
      } else {
        push('كلمة المرور غير صحيحة', 'error');
      }
    }
  };

  const toggleOrientation = () => {
    const next = orientation === 'portrait' ? 'landscape' : 'portrait';
    setOrientation(next);
    db.setSetting('orientation', next);
    refreshSettings();
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    db.setSetting('dark_mode', next ? '1' : '0');
    refreshSettings();
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  useEffect(() => {
    if (settings.orientation === 'landscape' || settings.orientation === 'portrait') setOrientation(settings.orientation);
    const isDark = settings.dark_mode === '1';
    setDark(isDark);
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [settings.orientation, settings.dark_mode]);

  const canAccess = (p: Page): boolean => {
    if (isOwner) return true;
    const employeeAllowed: Page[] = ['dashboard', 'charging', 'drinks', 'debts', 'collectors'];
    return employeeAllowed.includes(p);
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'charging': return <Charging />;
      case 'drinks': return <Drinks />;
      case 'debts': return <Debts requirePin={requirePin} />;
      case 'partners': return <Partners />;
      case 'cashboxes': return <CashBoxes />;
      case 'inventory': return <Inventory />;
      case 'suppliers': return <Suppliers />;
      case 'collectors': return <Collectors />;
      case 'reports': return <Reports />;
      case 'database': return <DatabasePage />;
      case 'settings': return <SettingsPage requirePin={requirePin} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Zap className="text-sky-500 animate-pulse" size={40} />
          <p className="text-slate-500 dark:text-slate-400 font-semibold">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  const go = (p: Page) => {
    if (!canAccess(p)) { push('لا تملك صلاحية الوصول لهذا القسم', 'error'); return; }
    setPage(p);
    setMobileNavOpen(false);
    setAdminMenuOpen(false);
  };

  const isActive = (p: Page) => page === p;
  const isAdminActive = adminNav.some((n) => n.id === page);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-white shadow-md">
                <Zap size={20} />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-extrabold text-slate-800 dark:text-slate-100 leading-tight text-sm">{settings.shop_name || 'نقطة شحن أبو عادل'}</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">أبو عادل</p>
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center overflow-visible">
              {mainNav.map((n) => {
                const Icon = n.icon;
                const active = isActive(n.id);
                const allowed = canAccess(n.id);
                return (
                  <button
                    key={n.id}
                    disabled={!allowed}
                    onClick={() => go(n.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-semibold text-xs whitespace-nowrap transition ${active ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'} ${!allowed ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{n.label}</span>
                  </button>
                );
              })}
              {/* Admin dropdown — مفصول عن النف بار بانيميشن سلس */}
              {isOwner && (
                <div className="relative">
                  <button
                    onClick={() => setAdminMenuOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-semibold text-xs whitespace-nowrap transition ${isAdminActive ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <Sliders size={16} />
                    <span>الإدارة العامة</span>
                    <ChevronDown size={14} className={`transition-transform duration-300 ${adminMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {adminMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                      <div className="absolute top-full right-0 mt-2 w-56 card p-1.5 shadow-2xl z-50 origin-top animate-dropdown">
                        {adminNav.map((n) => {
                          const Icon = n.icon;
                          const active = isActive(n.id);
                          return (
                            <button
                              key={n.id}
                              onClick={() => go(n.id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-semibold text-xs whitespace-nowrap transition ${active ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                            >
                              <Icon size={16} />
                              <span>{n.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => go('database')}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-semibold text-xs whitespace-nowrap transition ${isActive('database') ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Database size={16} />
                <span>قاعدة البيانات</span>
              </button>
              <button
                onClick={() => go('settings')}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-semibold text-xs whitespace-nowrap transition ${isActive('settings') ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Settings size={16} />
                <span>الإعدادات</span>
              </button>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400" title="الوضع المظلم">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={toggleOrientation} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400" title="قلب الواجهة">
                <RotateCw size={18} />
              </button>
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800">
                <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300 font-bold text-xs">
                  {currentUser?.name?.[0] || '?'}
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 max-w-[100px] truncate">{currentUser?.name}</span>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-slate-400 hover:text-rose-500" title="تسجيل الخروج">
                <LogOut size={18} />
              </button>
              <button onClick={() => setMobileNavOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="relative ml-auto w-72 bg-white dark:bg-slate-900 shadow-xl flex flex-col animate-slide">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-800 dark:text-slate-100">الأقسام</span>
              <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><X size={20} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {mainNav.map((n) => {
                const Icon = n.icon;
                const active = isActive(n.id);
                const allowed = canAccess(n.id);
                return (
                  <button
                    key={n.id}
                    disabled={!allowed}
                    onClick={() => go(n.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold transition ${active ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'} ${!allowed ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icon size={20} />
                    <span>{n.label}</span>
                  </button>
                );
              })}
              {isOwner && (
                <>
                  <div className="pt-2 pb-1 px-3.5 text-xs font-bold text-slate-400 dark:text-slate-500">الإدارة العامة</div>
                  {adminNav.map((n) => {
                    const Icon = n.icon;
                    const active = isActive(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => go(n.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold transition ${active ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <Icon size={20} />
                        <span>{n.label}</span>
                      </button>
                    );
                  })}
                </>
              )}
              <div className="pt-2 pb-1 px-3.5 text-xs font-bold text-slate-400 dark:text-slate-500">النظام</div>
              <button onClick={() => go('database')} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold transition ${isActive('database') ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <Database size={20} /><span>قاعدة البيانات</span>
              </button>
              <button onClick={() => go('settings')} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold transition ${isActive('settings') ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <Settings size={20} /><span>الإعدادات</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main */}
      <main className={`flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto ${orientation === 'landscape' ? 'landscape-force' : ''}`}>
        {renderPage()}
      </main>

      {/* Setup modal */}
      <Modal open={setupOpen} onClose={() => {}} title="إعداد النظام" size="sm">
        <p className="text-slate-600 dark:text-slate-300 mb-4">مرحبًا! أدخل اسم مالك النظام للبدء.</p>
        <input className="input" placeholder="اسم المالك" value={setupName} onChange={(e) => setSetupName(e.target.value)} autoFocus />
        <button className="btn-primary w-full mt-4" onClick={handleSetup}>بدء النظام</button>
      </Modal>

      {/* Login modal */}
      <Modal open={loginOpen} onClose={() => {}} title="تسجيل الدخول" size="sm">
        <p className="text-slate-600 dark:text-slate-300 mb-4">اختر المستخدم للدخول إلى النظام.</p>
        <select className="input" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} autoFocus>
          <option value="">— اختر مستخدم —</option>
          {users.filter((u) => u.is_active).map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role === 'owner' ? 'مالك' : 'موظف'})</option>
          ))}
        </select>
        <button className="btn-primary w-full mt-4" disabled={!selectedUser} onClick={handleLogin}>دخول</button>
      </Modal>

      {/* Pin modal */}
      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title={pinMode === 'create' ? 'إنشاء كلمة مرور القفل' : 'كلمة مرور القفل'} size="sm">
        <div className="flex flex-col items-center gap-3">
          <Lock className="text-sky-600" size={32} />
          <p className="text-slate-600 dark:text-slate-300 text-sm text-center">
            {pinMode === 'create' ? 'أدخل كلمة مرور من 4 أرقام لتفعيل قفل المديونية.' : 'أدخل كلمة مرور القفل (4 أرقام).'}
          </p>
          <input
            className="input text-center text-2xl tracking-[0.5em] font-bold"
            maxLength={4}
            inputMode="numeric"
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submitPin()}
          />
          <button className="btn-primary w-full" onClick={submitPin}>تأكيد</button>
        </div>
      </Modal>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ToastProvider>
  );
}
