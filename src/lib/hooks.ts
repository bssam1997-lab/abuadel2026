import { useState, useEffect } from 'react';
import * as db from './db';
import type { Customer } from './types';

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setCustomers(db.select<Customer>('customers').sort((a, b) => a.name.localeCompare(b.name, 'ar')));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);
  return { customers, loading, refresh };
}

/** Debounce a value by 250ms — prevents UI stutter on search inputs */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
