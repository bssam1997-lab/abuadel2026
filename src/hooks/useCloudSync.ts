import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as db from '../lib/db';
import type { TableName } from '../lib/db';

// ============================================================
// مزامنة سحابية offline-first
// يبقى localStorage/IndexedDB هو المصدر الأساسي
// السحابة هي نسخة احتياطية + مزامنة بين الأجهزة
// ============================================================

const PENDING_KEY = 'npa_pending_sync';
const LAST_SYNC_KEY = 'npa_last_sync_at';
const MIGRATION_KEY = 'npa_cloud_migration_done';
const DEVICE_ID_KEY = 'npa_device_id';

export type SyncStatus = 'online' | 'offline' | 'syncing';

type PendingOp = {
  id: string;
  table_name: TableName;
  row_id: string;
  operation: 'insert' | 'update' | 'delete';
  payload: any;
  created_at: string;
};

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getPending(): PendingOp[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setPending(ops: PendingOp[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch { /* quota — keep going */ }
}

function enqueuePending(op: PendingOp): void {
  const ops = getPending();
  ops.push(op);
  setPending(ops);
}

/** Push a single table change to the cloud (or queue if offline). */
export async function syncToCloud(
  table: TableName,
  operation: 'insert' | 'update' | 'delete',
  row: { id?: string } & Record<string, any>,
): Promise<void> {
  if (!supabase) return;
  const rowId = row.id || '';
  if (!rowId) return;

  const payload = operation === 'delete' ? null : { ...row };
  const op: PendingOp = {
    id: db.uid(),
    table_name: table,
    row_id: rowId,
    operation,
    payload,
    created_at: db.now(),
  };

  if (!navigator.onLine) {
    enqueuePending(op);
    return;
  }

  try {
    const { error } = await supabase.from('sync_transactions').upsert(
      { id: db.uid(), table_name: table, row_id: rowId, operation, payload, device_id: getDeviceId() },
      { onConflict: 'id' },
    );
    if (error) throw error;
  } catch {
    enqueuePending(op);
  }
}

/** Flush all pending operations to Supabase when back online. */
async function flushPending(
  onStatus: (s: SyncStatus) => void,
): Promise<number> {
  if (!supabase) return 0;
  const ops = getPending();
  if (ops.length === 0) return 0;

  onStatus('syncing');
  let flushed = 0;
  const remaining: PendingOp[] = [];

  for (const op of ops) {
    try {
      const { error } = await supabase.from('sync_transactions').upsert(
        { id: op.id, table_name: op.table_name, row_id: op.row_id, operation: op.operation, payload: op.payload, device_id: getDeviceId() },
        { onConflict: 'id' },
      );
      if (error) throw error;
      flushed++;
    } catch {
      remaining.push(op);
    }
  }

  setPending(remaining);
  if (flushed > 0) {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  }
  onStatus(navigator.onLine ? 'online' : 'offline');
  return flushed;
}

/** Subscribe to realtime changes from other devices. */
function subscribeToChanges(
  onChange: (table: TableName, operation: string, row: any) => void,
) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('sync_transactions_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sync_transactions' },
      (payload: any) => {
        const newRow = payload.new;
        if (!newRow || newRow.device_id === getDeviceId()) return;
        if (newRow.table_name && newRow.payload) {
          onChange(newRow.table_name as TableName, newRow.operation, newRow.payload);
        }
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/** One-time migration: upload local data to cloud if cloud is empty. */
export async function migrateLocalToCloud(): Promise<boolean> {
  if (!supabase) return false;
  const alreadyMigrated = localStorage.getItem(MIGRATION_KEY);
  if (alreadyMigrated) return false;

  try {
    const { count, error } = await supabase
      .from('sync_transactions')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;

    // Only migrate if cloud is empty AND we have local customers
    if ((count ?? 0) > 0) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return false;
    }

    const localCustomers = db.select<any>('customers');
    if (localCustomers.length === 0) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return false;
    }

    const tables: TableName[] = [
      'customers', 'suppliers', 'products', 'devices', 'invoices',
      'invoice_items', 'debts', 'partners', 'cash_boxes', 'settings',
      'device_types', 'accessories', 'collectors', 'discount_groups',
    ];

    const rows: any[] = [];
    for (const t of tables) {
      const localRows = db.select<any>(t);
      for (const r of localRows) {
        if (!r.id) continue;
        rows.push({
          id: db.uid(),
          table_name: t,
          row_id: r.id,
          operation: 'insert',
          payload: r,
          device_id: getDeviceId(),
        });
      }
    }

    if (rows.length === 0) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return false;
    }

    // Batch insert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: insertError } = await supabase.from('sync_transactions').insert(chunk);
      if (insertError) throw insertError;
    }

    localStorage.setItem(MIGRATION_KEY, '1');
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return true;
  } catch {
    // Will retry on next app start
    return false;
  }
}

/** React hook for cloud sync — manages status, online/offline, realtime. */
export function useCloudSync() {
  const [status, setStatus] = useState<SyncStatus>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
  );
  const [lastSync, setLastSync] = useState<string | null>(
    localStorage.getItem(LAST_SYNC_KEY),
  );
  const [pendingCount, setPendingCount] = useState<number>(getPending().length);
  const unsubRef = useRef<(() => void) | null>(null);

  const refreshPending = useCallback(() => {
    setPendingCount(getPending().length);
  }, []);

  const syncNow = useCallback(async () => {
    if (!supabase) return;
    setStatus('syncing');
    const flushed = await flushPending(setStatus);
    setLastSync(localStorage.getItem(LAST_SYNC_KEY));
    refreshPending();
    return flushed;
  }, [refreshPending]);

  useEffect(() => {
    const handleOnline = () => {
      setStatus('online');
      flushPending(setStatus).then(() => {
        setLastSync(localStorage.getItem(LAST_SYNC_KEY));
        refreshPending();
      });
    };
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Flush on mount if online
    if (navigator.onLine && getPending().length > 0) {
      flushPending(setStatus).then(() => {
        setLastSync(localStorage.getItem(LAST_SYNC_KEY));
        refreshPending();
      });
    }

    // Subscribe to realtime changes
    unsubRef.current = subscribeToChanges((table, operation, row) => {
      // Apply incoming change to local DB
      if (operation === 'delete') {
        if (row?.id) db.removeById(table, row.id);
      } else if (operation === 'insert' || operation === 'update') {
        const existing = db.first<any>(table, (r: any) => r.id === row.id);
        if (existing) {
          db.updateById(table, row.id, row);
        } else {
          db.insert(table, row);
        }
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubRef.current?.();
    };
  }, [refreshPending]);

  return { status, lastSync, pendingCount, syncNow, refreshPending };
}
