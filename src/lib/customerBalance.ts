import * as db from './db';
import type { TableName } from './db';

// ============================================================
// الدالة المركزية الموحدة لحساب مالية الزبون
// المصدر الوحيد للحقيقة (Single Source of Truth)
// ============================================================

export type CustomerBalance = {
  totalDebit: number;       // إجمالي المدين
  totalCredit: number;      // إجمالي المسدد
  openingBalance: number;   // الرصيد الافتتاحي (قبل أول حركة)
  balance: number;          // الرصيد الفعلي الحالي
  chargingDebt: number;     // دين الشحن
  drinksDebt: number;       // دين المشروبات
  lastMoveAt: string | null;
  debtCount: number;
};

/**
 * حساب مالية زبون من جدول debts — المصدر الوحيد.
 * تُستثنى القيود المعكوسة (reversed) من كل الحسابات.
 */
export function calculateCustomerBalance(
  customerId: string,
  allDebts?: any[],
): CustomerBalance {
  const debts = (allDebts ?? db.select<any>('debts'))
    .filter((d) => d.customer_id === customerId && !d.reversed)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  const totalDebit = debts.reduce((s: number, d: any) => s + (Number(d.debit) || 0), 0);
  const totalCredit = debts.reduce((s: number, d: any) => s + (Number(d.credit) || 0), 0);
  const balance = totalDebit - totalCredit;

  // الرصيد الافتتاحي = الرصيد قبل أول حركة
  const openingBalance = debts.length > 0
    ? (Number(debts[0].balance_after) || 0) - (Number(debts[0].debit) || 0) + (Number(debts[0].credit) || 0)
    : 0;

  // ── توزيع ديون الأقسام مع ضمان: chargingDebt + drinksDebt = balance ──
  const cGross = debts
    .filter((d) => d.type === 'charging')
    .reduce((s: number, d: any) => s + (Number(d.debit) || 0) - (Number(d.credit) || 0), 0);
  const dGross = debts
    .filter((d) => d.type === 'drinks')
    .reduce((s: number, d: any) => s + (Number(d.debit) || 0) - (Number(d.credit) || 0), 0);

  let chargingDebt = 0;
  let drinksDebt = 0;

  if (balance > 0.001) {
    let cAdj = cGross;
    let dAdj = dGross;
    if (cAdj < 0) { dAdj += cAdj; cAdj = 0; }
    if (dAdj < 0) { cAdj += dAdj; dAdj = 0; }
    cAdj = Math.max(0, cAdj);
    dAdj = Math.max(0, dAdj);

    const adjSum = cAdj + dAdj;
    const unalloc = adjSum - balance;
    if (unalloc > 0.001) {
      if (adjSum > 0) {
        const scale = balance / adjSum;
        cAdj = Math.max(0, cAdj * scale);
        dAdj = Math.max(0, dAdj * scale);
      } else {
        cAdj = balance; dAdj = 0;
      }
    }

    const finalSum = cAdj + dAdj;
    if (Math.abs(finalSum - balance) > 0.005) {
      cAdj = Math.max(0, balance - dAdj);
    }

    chargingDebt = Math.round(cAdj);
    drinksDebt = Math.round(balance) - chargingDebt;
    if (drinksDebt < 0) { chargingDebt += drinksDebt; drinksDebt = 0; }
  }

  const lastMoveAt = debts.length > 0 ? debts[debts.length - 1].created_at : null;

  return {
    totalDebit,
    totalCredit,
    openingBalance,
    balance,
    chargingDebt,
    drinksDebt,
    lastMoveAt,
    debtCount: debts.length,
  };
}

/**
 * إعادة حساب balance_after لجميع قيود الزبائن — دفعة واحدة.
 * تُحدّث الحقل المخزن لتطابق الرصيد التراكمي الفعلي.
 * تُستثنى القيود المعكوسة من الحساب التراكمي.
 */
export function recalculateAllBalancesBatch(): { updated: number; customers: number } {
  const allDebts = db.select<any>('debts');
  const customers = db.select<any>('customers');
  let updated = 0;

  customers.forEach((c) => {
    const rows = allDebts
      .filter((d) => d.customer_id === c.id)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

    let running = 0;
    rows.forEach((r) => {
      if (!r.reversed) {
        running = Math.round((running + Number(r.debit) - Number(r.credit)) * 100) / 100;
      }
      const stored = Number(r.balance_after) || 0;
      if (Math.abs(stored - running) > 0.005) {
        db.updateById('debts', r.id, { balance_after: running });
        updated++;
      }
    });
  });

  return { updated, customers: customers.length };
}
