import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as db from '../lib/db';
import type { TableName } from '../lib/db';
import QRCode from 'qrcode';

// ============================================================
// مزامنة محلية لحظية ثنائية الاتجاه بين أجهزة المحل
// عبر Supabase Realtime Broadcast Channels
// التابلت = المضيف (يولد PIN + QR)
// الجوال/اللابتوب = أجهزة فرعية (تتصل بالـ PIN)
// ============================================================

export type LocalSyncRole = 'none' | 'host' | 'client';
export type LocalSyncStatus = 'disconnected' | 'connecting' | 'connected';

const SYNC_SETTINGS_KEY = 'npa_local_sync_settings';
const PEER_NAME_KEY = 'npa_peer_name';

type SyncMessage =
  | { type: 'change'; table: TableName; operation: 'insert' | 'update' | 'delete'; row: any; ts: string }
  | { type: 'full_dump'; tables: Record<string, any[]>; ts: string }
  | { type: 'request_dump'; from: string }
  | { type: 'hello'; name: string; role: 'client' }
  | { type: 'welcome'; name: string };

type SavedSyncSettings = {
  role: LocalSyncRole;
  pin: string;
  peerName: string;
};

function getSavedSettings(): SavedSyncSettings | null {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSettings(s: SavedSyncSettings | null) {
  if (s) localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(s));
  else localStorage.removeItem(SYNC_SETTINGS_KEY);
}

function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getPeerName(): string {
  try {
    let n = localStorage.getItem(PEER_NAME_KEY);
    if (!n) {
      const labels = ['التابلت', 'اللابتوب', 'الجوال', 'جهاز'];
      n = labels[Math.floor(Math.random() * labels.length)] + '-' + Math.random().toString(36).slice(2, 5);
      localStorage.setItem(PEER_NAME_KEY, n);
    }
    return n;
  } catch {
    return 'جهاز-' + Math.random().toString(36).slice(2, 5);
  }
}

// جداول قابلة للمزامنة (بدون operation_log لتجنب الضوضاء)
const SYNCABLE_TABLES: TableName[] = [
  'app_users', 'customers', 'devices', 'products', 'suppliers', 'invoices',
  'invoice_items', 'debts', 'debt_payments', 'partners', 'partner_ledger',
  'partner_savings', 'partner_savings_ledger', 'cash_boxes', 'cash_box_ledger',
  'supplier_ledger', 'supplier_invoices', 'supplier_invoice_items',
  'inventory_items', 'inventory_moves', 'collectors', 'collector_shifts',
  'settings', 'discount_groups', 'partner_loans', 'device_types', 'accessories',
];

// flag لمنع حلقة المزامنة (تغيير قادم من الشبكة → لا يعاد بثه)
let suppressBroadcast = false;

export function setSuppressBroadcast(v: boolean) { suppressBroadcast = v; }

/** بث تغيير محلي عبر قناة المزامنة */
function broadcastChange(
  channel: any,
  table: TableName,
  operation: 'insert' | 'update' | 'delete',
  row: any,
) {
  if (suppressBroadcast || !channel) return;
  channel.send({
    type: 'broadcast',
    event: 'sync',
    payload: { type: 'change', table, operation, row, ts: db.now() } as SyncMessage,
  });
}

export function useLocalSync() {
  const [role, setRole] = useState<LocalSyncRole>('none');
  const [status, setStatus] = useState<LocalSyncStatus>('disconnected');
  const [pin, setPin] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [peerName, setPeerNameState] = useState(getPeerName());
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);

  // استرجاع الإعدادات المحفوظة عند الإقلاع
  useEffect(() => {
    try {
      const saved = getSavedSettings();
      if (saved && saved.role !== 'none') {
        if (saved.role === 'host') startHost(true);
        else if (saved.role === 'client') connectClient(saved.pin, true);
      }
    } catch { /* ignore — safe defaults */ }
  }, []);

  // توليد QR عند تغيير الـ PIN
  useEffect(() => {
    if (pin) {
      QRCode.toDataURL(`ABU-ADEL-SYNC:${pin}`, { width: 256, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(''));
    } else {
      setQrDataUrl('');
    }
  }, [pin]);

  const applyRemoteChange = useCallback((msg: SyncMessage) => {
    if (msg.type === 'change') {
      suppressBroadcast = true;
      try {
        if (msg.operation === 'delete') {
          if (msg.row?.id) db.removeById(msg.table, msg.row.id);
        } else {
          const existing = db.first<any>(msg.table, (r: any) => r.id === msg.row?.id);
          if (existing) db.updateById(msg.table, msg.row.id, msg.row);
          else db.insert(msg.table, msg.row);
        }
      } finally {
        suppressBroadcast = false;
      }
    } else if (msg.type === 'full_dump') {
      suppressBroadcast = true;
      try {
        for (const [tName, rows] of Object.entries(msg.tables)) {
          db.writeTableDirect(tName as TableName, rows as any[]);
        }
      } finally {
        suppressBroadcast = false;
      }
    } else if (msg.type === 'request_dump') {
      // المضيف يرسل نسخة كاملة عند الطلب
      if (channelRef.current) {
        const dump: Record<string, any[]> = {};
        for (const t of SYNCABLE_TABLES) dump[t] = db.select<any>(t);
        channelRef.current.send({
          type: 'broadcast',
          event: 'sync',
          payload: { type: 'full_dump', tables: dump, ts: db.now() } as SyncMessage,
        });
      }
    }
  }, []);

  const setupChannel = useCallback((pinCode: string, isHost: boolean) => {
    if (!supabase) return;
    // إزالة قناة سابقة
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase.channel(`local-sync-${pinCode}`, {
      config: { broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'sync' }, (payload: any) => {
      const msg = payload.payload as SyncMessage;
      if (!msg) return;

      if (msg.type === 'hello') {
        setConnectedPeers((prev) => prev.includes(msg.name) ? prev : [...prev, msg.name]);
        // المضيف يرد بـ welcome + full_dump
        if (isHost) {
          ch.send({ type: 'broadcast', event: 'sync', payload: { type: 'welcome', name: getPeerName() } as SyncMessage });
          const dump: Record<string, any[]> = {};
          for (const t of SYNCABLE_TABLES) dump[t] = db.select<any>(t);
          ch.send({ type: 'broadcast', event: 'sync', payload: { type: 'full_dump', tables: dump, ts: db.now() } as SyncMessage });
        }
      } else if (msg.type === 'welcome') {
        setConnectedPeers((prev) => prev.includes(msg.name) ? prev : [...prev, msg.name]);
      } else {
        applyRemoteChange(msg);
      }
    });

    ch.subscribe((state: string) => {
      if (state === 'SUBSCRIBED') {
        setStatus('connected');
        // العميل يرسل hello لطلب النسخة الكاملة
        if (!isHost) {
          ch.send({ type: 'broadcast', event: 'sync', payload: { type: 'hello', name: getPeerName(), role: 'client' } as SyncMessage });
        }
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        setStatus('disconnected');
      }
    });

    channelRef.current = ch;
  }, [applyRemoteChange]);

  // --- المضيف (التابلت) ---
  const startHost = useCallback((autoReconnect = false) => {
    let pinCode = '';
    const saved = getSavedSettings();
    if (autoReconnect && saved && saved.role === 'host') {
      pinCode = saved.pin;
    } else {
      pinCode = generatePin();
    }
    setPin(pinCode);
    setRole('host');
    setStatus('connecting');
    saveSettings({ role: 'host', pin: pinCode, peerName: getPeerName() });
    setupChannel(pinCode, true);
  }, [setupChannel]);

  const stopHost = useCallback(() => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRole('none');
    setStatus('disconnected');
    setPin('');
    setConnectedPeers([]);
    saveSettings(null);
  }, []);

  // --- العميل (الجوال/اللابتوب) ---
  const connectClient = useCallback((pinCode: string, autoReconnect = false) => {
    if (!pinCode || pinCode.length < 4) return;
    setPin(pinCode);
    setRole('client');
    setStatus('connecting');
    saveSettings({ role: 'client', pin: pinCode, peerName: getPeerName() });
    setupChannel(pinCode, false);
  }, [setupChannel]);

  const disconnectClient = useCallback(() => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRole('none');
    setStatus('disconnected');
    setPin('');
    setConnectedPeers([]);
    saveSettings(null);
  }, []);

  // بث تغيير محلي (يُستدعى من db.ts)
  const sendLocalChange = useCallback((table: TableName, operation: 'insert' | 'update' | 'delete', row: any) => {
    if (channelRef.current && role !== 'none') {
      broadcastChange(channelRef.current, table, operation, row);
    }
  }, [role]);

  // تنظيف عند الخروج
  useEffect(() => {
    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return {
    role, status, pin, qrDataUrl, peerName, connectedPeers,
    startHost, stopHost, connectClient, disconnectClient,
    sendLocalChange, setPeerNameState,
  };
}

// --- singleton accessor for db.ts to call sendLocalChange ---
let localSyncSend: ((table: TableName, op: 'insert' | 'update' | 'delete', row: any) => void) | null = null;

export function setLocalSyncSender(fn: typeof localSyncSend) {
  localSyncSend = fn;
}

export function broadcastLocalChange(table: TableName, op: 'insert' | 'update' | 'delete', row: any) {
  localSyncSend?.(table, op, row);
}
