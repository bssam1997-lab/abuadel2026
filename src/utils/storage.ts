// ============================================================
// storage.ts — Drop-in replacement for localStorage using localforage (IndexedDB)
// Exposes synchronous-looking getItem/setItem/removeItem backed by an
// in-memory cache that is hydrated from IndexedDB on startup.
// ============================================================
import localforage from 'localforage';

const store = localforage.createInstance({
  name: 'npa_store',
  storeName: 'npa_kv',
  description: 'نقطة شحن أبو عادل — تخزين محلي',
});

// In-memory cache so reads are synchronous, just like localStorage.
// Hydrated by init() before the app reads anything.
const cache = new Map<string, string>();
let ready = false;

/**
 * One-time initialization. Loads every value from IndexedDB into the
 * in-memory cache so subsequent getItem calls are synchronous.
 */
export async function init(): Promise<void> {
  const keys = await store.keys();
  for (const k of keys) {
    const v = await store.getItem<string>(k);
    if (v !== null) cache.set(k, v);
  }
  ready = true;
}

/**
 * Migrate data from browser localStorage into localforage (IndexedDB).
 * Copies all keys that start with the app prefix without deleting them.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const prefix = 'npa_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    if (cache.has(key)) continue; // don't overwrite existing
    cache.set(key, raw);
    await store.setItem(key, raw);
  }
}

/** Synchronous read — returns the value or null. */
export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Write through cache + IndexedDB. */
export function setItem(key: string, value: string): void {
  cache.set(key, value);
  void store.setItem(key, value);
}

/** Remove from cache + IndexedDB. */
export function removeItem(key: string): void {
  cache.delete(key);
  void store.removeItem(key);
}

export function isReady(): boolean {
  return ready;
}
