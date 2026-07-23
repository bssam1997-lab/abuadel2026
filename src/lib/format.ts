export const money = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₪';
};

export const num = (n: number | null | undefined): string => {
  return Number(n ?? 0).toLocaleString('en-US');
};

export const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-GB');
};

export const fmtTime = (d: string | Date | null | undefined): string => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export const fmtDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return '-';
  return `${fmtDate(d)} ${fmtTime(d)}`;
};

export const todayISO = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const startOfWeek = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString();
};

export const startOfMonth = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.toISOString();
};

export const periodRange = (period: 'today' | 'week' | 'month' | 'custom', custom?: { from: string; to: string }): { from: string; to: string } => {
  if (period === 'today') return { from: todayISO(), to: new Date().toISOString() };
  if (period === 'week') return { from: startOfWeek(), to: new Date().toISOString() };
  if (period === 'month') return { from: startOfMonth(), to: new Date().toISOString() };
  if (period === 'custom' && custom) {
    return { from: new Date(custom.from).toISOString(), to: new Date(custom.to + 'T23:59:59').toISOString() };
  }
  return { from: todayISO(), to: new Date().toISOString() };
};

export const uid = (): string => crypto.randomUUID();
