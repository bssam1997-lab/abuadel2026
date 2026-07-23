import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Toast = { id: number; type: 'success' | 'error' | 'info'; msg: string };
type Ctx = { push: (msg: string, type?: Toast['type']) => void };
const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, type: Toast['type'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="card px-4 py-3 flex items-center gap-3 animate-slide min-w-[260px] shadow-soft">
            {t.type === 'success' && <CheckCircle2 className="text-emerald-500" size={20} />}
            {t.type === 'error' && <AlertCircle className="text-rose-500" size={20} />}
            {t.type === 'info' && <Info className="text-sky-500" size={20} />}
            <span className="text-sm font-semibold text-slate-700 flex-1">{t.msg}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}
