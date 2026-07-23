import { type ReactNode } from 'react';

export const EmptyState = ({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    {icon && <div className="text-slate-300 mb-3">{icon}</div>}
    <p className="font-bold text-slate-600">{title}</p>
    {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
  </div>
);

export const SectionTitle = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <div className="flex items-center gap-2 mb-4">
    {icon && <span className="text-sky-600">{icon}</span>}
    <h2 className="text-xl font-bold text-slate-800">{children}</h2>
  </div>
);

export const Badge = ({ children, color = 'slate' }: { children: ReactNode; color?: 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' }) => {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    sky: 'bg-sky-100 text-sky-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return <span className={`chip ${colors[color]}`}>{children}</span>;
};

export const Stat = ({ label, value, color = 'slate', icon }: { label: string; value: string; color?: string; icon?: ReactNode }) => {
  const colors: Record<string, string> = {
    slate: 'from-slate-50 to-slate-100 text-slate-700',
    sky: 'from-sky-50 to-sky-100 text-sky-700',
    emerald: 'from-emerald-50 to-emerald-100 text-emerald-700',
    amber: 'from-amber-50 to-amber-100 text-amber-700',
    rose: 'from-rose-50 to-rose-100 text-rose-700',
    violet: 'from-violet-50 to-violet-100 text-violet-700',
  };
  return (
    <div className={`kpi bg-gradient-to-bl ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold opacity-80">{label}</span>
        {icon}
      </div>
      <span className="text-2xl font-extrabold">{value}</span>
    </div>
  );
};
