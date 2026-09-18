// ============================================================
// نظام نقطة شحن أبو عادل — محرك التخزين المستقل
// IndexedDB-backed storage with synchronous in-memory cache
// Auto-migrates legacy localStorage data on first run
// ============================================================

import localforage from 'localforage';

const STORE_NAME = 'AbuAdelPOS';

// Initialize IndexedDB instance
const idbStore = localforage.createInstance({
  name: STORE_NAME,
  storeName: 'tables',
  description: 'نقطة شحن أبو عادل — قاعدة بيانات محلية',
});

// In-memory cache for synchronous reads (the app is fully synchronous)
const memoryCache = new Map<string, any>();

// Track whether migration + hydration is complete
let hydrated = false;

/**
 * Migrate legacy localStorage keys into IndexedDB (runs once).
 * Reads npa_* prefixed keys and copies them into IndexedDB
 * without deleting any records. Sets migration_done flag.
 */
async function migrateFromLocalStorage(): Promise<void> {
  const MIGRATION_KEY = '__migration_done__';

  // Check if migration already done (in IndexedDB)
  const alreadyMigrated = await idbStore.getItem<boolean>(MIGRATION_KEY);
  if (alreadyMigrated) return;

  // Legacy localStorage keys mentioned in requirements
  const legacyKeys = [
    'npa_devices', 'npa_debts', 'npa_sales', 'npa_partners',
    'npa_cash_boxes', 'npa_app_settings',
  ];

  // Also scan all npa_ prefixed keys in localStorage for completeness
  const allLegacyKeys = new Set<string>(legacyKeys);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('npa_')) allLegacyKeys.add(key);
    }
  } catch { /* ignore */ }

  // Copy each legacy key into IndexedDB if not already present
  for (const key of allLegacyKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const existing = await idbStore.getItem(key);
        if (!existing) {
          await idbStore.setItem(key, JSON.parse(raw));
        }
      }
    } catch { /* skip corrupt keys */ }
  }

  // Mark migration done so it never repeats
  await idbStore.setItem(MIGRATION_KEY, true);
}

/**
 * Hydrate the in-memory cache from IndexedDB.
 * Loads all stored table data into memory for synchronous access.
 * Falls back to localStorage if IndexedDB is empty.
 */
export async function hydrateStore(): Promise<void> {
  if (hydrated) return;

  // Run migration first
  await migrateFromLocalStorage();

  // Load all keys from IndexedDB into memory cache
  try {
    const keys = await idbStore.keys();
    await Promise.all(
      keys.map(async (key) => {
        if (key === '__migration_done__') return;
        const value = await idbStore.getItem<any>(key);
        if (value !== null && value !== undefined) {
          memoryCache.set(key, value);
        }
      })
    );
  } catch { /* IndexedDB might be unavailable — fall back to localStorage */ }

  // For any npa_ keys still in localStorage but not in cache, load them
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('npa_') && !memoryCache.has(key)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            memoryCache.set(key, JSON.parse(raw));
          } catch { /* skip corrupt */ }
        }
      }
    }
  } catch { /* ignore */ }

  hydrated = true;
}

/**
 * Check if the store has been hydrated (safe to call synchronously).
 */
export function isHydrated(): boolean {
  return hydrated;
}

/**
 * Synchronous read from in-memory cache.
 * Returns the stored value or undefined.
 */
export function getItemSync<T = any>(key: string): T | undefined {
  return memoryCache.get(key) as T | undefined;
}

/**
 * Synchronous write to in-memory cache + async persist to IndexedDB.
 * Also mirrors to localStorage as a backup for the service worker.
 */
export function setItemSync(key: string, value: any): void {
  memoryCache.set(key, value);
  // Async persist to IndexedDB (fire-and-forget)
  idbStore.setItem(key, value).catch(() => {});
  // Mirror to localStorage as backup
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — IndexedDB is the primary store */ }
}

/**
 * Remove an item from cache + IndexedDB.
 */
export function removeItemSync(key: string): void {
  memoryCache.delete(key);
  idbStore.removeItem(key).catch(() => {});
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}
