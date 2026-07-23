import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import * as db from './db';
import type { AppUser } from './types';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

type AppState = {
  currentUser: AppUser | null;
  users: AppUser[];
  settings: Record<string, string>;
  loading: boolean;
  setCurrentUser: (u: AppUser | null) => void;
  refreshUsers: () => void;
  refreshSettings: () => void;
  log: (action: string, entity?: string, entity_id?: string, value?: string, before?: unknown, after?: unknown) => void;
  requireOwnerPassword: (action: () => void) => void;
};

const Ctx = createContext<AppState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { push } = useToast();
  const [ownerPwOpen, setOwnerPwOpen] = useState(false);
  const [ownerPwInput, setOwnerPwInput] = useState('');
  const [ownerPwPending, setOwnerPwPending] = useState<(() => void) | null>(null);

  const refreshUsers = useCallback(() => {
    setUsers(db.select<AppUser>('app_users').sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
  }, []);

  const refreshSettings = useCallback(() => {
    const rows = db.select<{ key: string; value: string }>('settings');
    const map: Record<string, string> = {};
    rows.forEach((r) => (map[r.key] = r.value));
    setSettings(map);
  }, []);

  const log = useCallback((action: string, entity?: string, entity_id?: string, value?: string, before?: unknown, after?: unknown) => {
    db.logAction(action, entity, entity_id, value, before, after, currentUser?.name);
  }, [currentUser]);

  const requireOwnerPassword = useCallback((action: () => void) => {
    if (!settings.owner_password) {
      action();
      return;
    }
    setOwnerPwInput('');;
    setOwnerPwPending(() => action);
    setOwnerPwOpen(true);
  }, [settings.owner_password]);

  const submitOwnerPw = () => {
    if (ownerPwInput === settings.owner_password) {
      setOwnerPwOpen(false);
      ownerPwPending?.();
    } else {
      push('كلمة مرور المالك غير صحيحة', 'error');
    }
  };

  useEffect(() => {
    db.initDatabase();
    refreshUsers();
    refreshSettings();
    setLoading(false);
  }, [refreshUsers, refreshSettings]);

  return (
    <Ctx.Provider value={{ currentUser, users, settings, loading, setCurrentUser, refreshUsers, refreshSettings, log, requireOwnerPassword }}>
      {children}
      <Modal open={ownerPwOpen} onClose={() => setOwnerPwOpen(false)} title="كلمة مرور المالك" size="sm">
        <div className="flex flex-col items-center gap-3">
          <p className="text-slate-600 text-sm text-center">هذا الإجراء حساس. أدخل كلمة مرور المالك للمتابعة.</p>
          <input
            className="input text-center text-xl tracking-widest font-bold"
            type="password"
            value={ownerPwInput}
            onChange={(e) => setOwnerPwInput(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submitOwnerPw()}
          />
          <button className="btn-primary w-full" onClick={submitOwnerPw}>تأكيد</button>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export function useStore(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
