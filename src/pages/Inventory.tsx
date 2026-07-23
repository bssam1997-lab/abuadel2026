import { useEffect, useState } from 'react';
import { Boxes, Plus, Pencil, Trash2, PackagePlus, AlertTriangle, ClipboardCheck, ArrowRightLeft } from 'lucide-react';
import * as db from '../lib/db';
import { useStore } from '../lib/store';
import { useToast } from '../components/Toast';
import { money, fmtDateTime } from '../lib/format';
import Modal from '../components/Modal';
import { SectionTitle, Badge, EmptyState, Stat } from '../components/ui';
import type { InventoryItem } from '../lib/types';

export default function Inventory() {
  const { log } = useStore();
  const { push } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [sell, setSell] = useState('');
  const [low, setLow] = useState('5');
  const [icon, setIcon] = useState<string | null>(null);
  const [discountGroupId, setDiscountGroupId] = useState<string | null>(null);
  const [discountGroups, setDiscountGroups] = useState<any[]>([]);

  const [mQty, setMQty] = useState('');
  const [mNote, setMNote] = useState('');
  const [tQty, setTQty] = useState('');

  const load = () => {
    setItems(db.select<InventoryItem>('inventory_items').sort((a, b) => a.name.localeCompare(b.name, 'ar')));
    const mv = db.select<any>('inventory_moves').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 50);
    setMoves(mv.map((m) => ({ ...m, item: db.first<any>('inventory_items', (r) => r.id === m.inventory_item_id) })));
    setDiscountGroups(db.select<any>('discount_groups'));
  };

  useEffect(() => { load(); }, []);

  const save = () => {
    if (!name.trim()) { push('أدخل الاسم', 'error'); return; }
    const payload = { name: name.trim(), quantity: Number(qty) || 0, cost_price: Number(cost) || 0, sell_price: Number(sell) || 0, low_stock_threshold: Number(low) || 5, icon, discount_group_id: discountGroupId };
    if (editItem) {
      db.updateById('inventory_items', editItem.id, payload);
      log('edit_inventory', 'inventory_items', editItem.id, name);
      push('تم التعديل', 'success');
    } else {
      const created = db.insert('inventory_items', { ...payload, created_at: db.now() });
      log('add_inventory', 'inventory_items', created.id, name);
      push('تمت الإضافة', 'success');
    }
    setAddOpen(false); setEditItem(null); setName(''); setQty(''); setCost(''); setSell(''); setLow('5'); setIcon(null); setDiscountGroupId(null);
    load();
  };

  const submitSupply = () => {
    if (!selected) return;
    const q = Number(mQty) || 0;
    if (q <= 0) { push('أدخل كمية', 'error'); return; }
    db.updateById('inventory_items', selected.id, { quantity: Number(selected.quantity) + q });
    db.insert('inventory_moves', { inventory_item_id: selected.id, type: 'supply', qty: q, note: mNote || 'توريد', created_at: db.now() });
    log('supply_inventory', 'inventory_items', selected.id, String(q));
    push('تم إضافة توريد', 'success');
    setSupplyOpen(false); setMQty(''); setMNote(''); load();
  };

  const submitAdjust = () => {
    if (!selected) return;
    const q = Number(mQty) || 0;
    const diff = q - Number(selected.quantity);
    db.updateById('inventory_items', selected.id, { quantity: q });
    db.insert('inventory_moves', { inventory_item_id: selected.id, type: 'adjust', qty: diff, note: mNote || 'جرد', created_at: db.now() });
    log('adjust_inventory', 'inventory_items', selected.id, String(q));
    push('تم تحديث الجرد', 'success');
    setAdjustOpen(false); setMQty(''); setMNote(''); load();
  };

  const submitTransfer = () => {
    if (!selected) return;
    const q = Number(tQty) || 0;
    if (q <= 0) { push('أدخل كمية', 'error'); return; }
    if (q > Number(selected.quantity)) { push('الكمية أكبر من المخزون', 'error'); return; }
    // Reduce inventory
    db.updateById('inventory_items', selected.id, { quantity: Number(selected.quantity) - q });
    db.insert('inventory_moves', { inventory_item_id: selected.id, type: 'transfer', qty: -q, note: mNote || 'تحويل إلى قسم المشروبات', created_at: db.now() });
    // Add or create product in drinks
    let prod = db.first<any>('products', (r) => r.name === selected.name);
    if (prod) {
      db.updateById('products', prod.id, { quantity: Number(prod.quantity) + q });
    } else {
      db.insert('products', {
        name: selected.name, cost_price: Number(selected.cost_price), sell_price: Number(selected.sell_price),
        quantity: q, low_stock_threshold: 5, supplier_id: null, icon: null, discount_group_id: null, created_at: db.now(),
      });
    }
    log('transfer_to_drinks', 'inventory_items', selected.id, String(q));
    push('تم التحويل إلى قسم المشروبات', 'success');
    setTransferOpen(false); setTQty(''); setMNote(''); load();
  };

  const deleteItem = (i: InventoryItem) => {
    const warnings: string[] = [];
    const movesCount = db.select<any>('inventory_moves', (r) => r.inventory_item_id === i.id).length;
    if (movesCount > 0) warnings.push(`مرتبط بـ ${movesCount} حركة مخزون`);
    const invoiceItemsCount = db.select<any>('supplier_invoice_items', (r) => r.inventory_item_id === i.id).length;
    if (invoiceItemsCount > 0) warnings.push(`مرتبط بـ ${invoiceItemsCount} بند فاتورة مورد`);
    const linkedProduct = db.first<any>('products', (r) => r.name === i.name);
    if (linkedProduct) warnings.push('مرتبط بمنتج في قسم المشروبات بنفس الاسم');
    const warnMsg = warnings.length > 0 ? `\n\n⚠️ ${warnings.join('، ')}` : '';
    if (!confirm(`هل أنت متأكد من حذف الصنف "${i.name}"؟${warnMsg}`)) return;
    db.removeById('inventory_items', i.id);
    log('delete_inventory_item', 'inventory_items', i.id, i.name);
    push('تم حذف الصنف', 'success');
    load();
  };

  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.low_stock_threshold));
  const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_price), 0);

  return (
    <div className="space-y-5 animate-fade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<Boxes size={24} />}>المخازن والجرد</SectionTitle>
        <button onClick={() => { setEditItem(null); setName(''); setQty(''); setCost(''); setSell(''); setLow('5'); setIcon(null); setDiscountGroupId(null); setAddOpen(true); }} className="btn-primary"><Plus size={18} /> صنف جديد</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="عدد الأصناف" value={String(items.length)} color="sky" />
        <Stat label="قيمة المخزون" value={money(totalValue)} color="emerald" />
        <Stat label="تنبيهات نقص" value={String(lowStock.length)} color="rose" icon={<AlertTriangle size={18} className="text-rose-500" />} />
      </div>

      {lowStock.length > 0 && (
        <div className="card p-4 bg-rose-50 border-rose-200">
          <div className="flex items-center gap-2 text-rose-700 font-bold mb-2"><AlertTriangle size={18} /> تنبيهات نقص الكمية</div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((i) => <Badge key={i.id} color="rose">{i.name} ({i.quantity})</Badge>)}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {items.length === 0 ? <EmptyState icon={<Boxes size={36} />} title="لا توجد أصناف" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">الصنف</th>
                  <th className="text-right px-4 py-3 font-bold">الكمية</th>
                  <th className="text-right px-4 py-3 font-bold">التكلفة</th>
                  <th className="text-right px-4 py-3 font-bold">البيع</th>
                  <th className="text-right px-4 py-3 font-bold">القيمة</th>
                  <th className="text-right px-4 py-3 font-bold">الربح</th>
                  <th className="text-right px-4 py-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((i) => (
                  <tr key={i.id} className="table-row">
                    <td className="px-4 py-3 font-semibold">{i.name}</td>
                    <td className="px-4 py-3"><Badge color={Number(i.quantity) <= Number(i.low_stock_threshold) ? 'rose' : 'slate'}>{i.quantity}</Badge></td>
                    <td className="px-4 py-3 text-slate-500">{money(i.cost_price)}</td>
                    <td className="px-4 py-3 font-bold">{money(i.sell_price)}</td>
                    <td className="px-4 py-3 text-slate-600">{money(Number(i.quantity) * Number(i.cost_price))}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{money((Number(i.sell_price) - Number(i.cost_price)) * Number(i.quantity))}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setSelected(i); setMQty(''); setMNote(''); setSupplyOpen(true); }} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="توريد"><PackagePlus size={16} /></button>
                        <button onClick={() => { setSelected(i); setMQty(String(i.quantity)); setMNote(''); setAdjustOpen(true); }} className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50" title="جرد"><ClipboardCheck size={16} /></button>
                        <button onClick={() => { setSelected(i); setTQty(''); setMNote(''); setTransferOpen(true); }} className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50" title="تحويل إلى المشروبات"><ArrowRightLeft size={16} /></button>
                        <button onClick={() => { setEditItem(i); setName(i.name); setQty(String(i.quantity)); setCost(String(i.cost_price)); setSell(String(i.sell_price)); setLow(String(i.low_stock_threshold)); setIcon(i.icon || null); setDiscountGroupId(i.discount_group_id || null); setAddOpen(true); }} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100" title="تعديل"><Pencil size={16} /></button>
                        <button onClick={() => deleteItem(i)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950" title="حذف"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-slate-700 mb-3">آخر حركات المخزون</h3>
        {moves.length === 0 ? <EmptyState title="لا توجد حركات" /> : (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs sticky top-0">
                <tr>
                  <th className="text-right px-3 py-2 font-bold">التاريخ</th>
                  <th className="text-right px-3 py-2 font-bold">الصنف</th>
                  <th className="text-right px-3 py-2 font-bold">النوع</th>
                  <th className="text-right px-3 py-2 font-bold">الكمية</th>
                  <th className="text-right px-3 py-2 font-bold">البيان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 text-slate-500 text-xs">{fmtDateTime(m.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{m.item?.name || '—'}</td>
                    <td className="px-3 py-2"><Badge color={m.type === 'supply' ? 'emerald' : m.type === 'sale' ? 'amber' : 'sky'}>{m.type === 'supply' ? 'توريد' : m.type === 'sale' ? 'بيع' : 'جرد'}</Badge></td>
                    <td className="px-3 py-2 font-bold">{m.qty > 0 ? '+' : ''}{m.qty}</td>
                    <td className="px-3 py-2 text-slate-500">{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editItem ? 'تعديل صنف' : 'صنف جديد'} size="md">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">الاسم *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><label className="label">الكمية</label><input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div><label className="label">حد التنبيه</label><input className="input" type="number" value={low} onChange={(e) => setLow(e.target.value)} /></div>
          <div><label className="label">سعر التكلفة</label><input className="input" type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <div><label className="label">سعر البيع</label><input className="input" type="number" value={sell} onChange={(e) => setSell(e.target.value)} /></div>
          <div className="col-span-2">
            <label className="label">الأيقونة</label>
            <div className="flex items-center gap-3">
              {icon && <img src={icon} alt="معاينة" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />}
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setIcon(reader.result as string);
                reader.readAsDataURL(file);
              }} className="text-sm text-slate-600 file:ml-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700 file:cursor-pointer" />
              {icon && <button onClick={() => setIcon(null)} className="text-xs text-rose-600 hover:underline">حذف</button>}
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">مجموعة الخصم</label>
            <select className="input" value={discountGroupId || ''} onChange={(e) => setDiscountGroupId(e.target.value || null)}>
              <option value="">بدون مجموعة</option>
              {discountGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setAddOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={save} className="btn-primary">حفظ</button>
        </div>
      </Modal>

      <Modal open={supplyOpen} onClose={() => setSupplyOpen(false)} title={`توريد: ${selected?.name}`} size="sm">
        <div className="space-y-3">
          <div><label className="label">الكمية الواردة</label><input className="input text-xl font-bold" type="number" value={mQty} onChange={(e) => setMQty(e.target.value)} autoFocus /></div>
          <div><label className="label">ملاحظة</label><input className="input" value={mNote} onChange={(e) => setMNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setSupplyOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitSupply} className="btn-success">تأكيد التوريد</button>
        </div>
      </Modal>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title={`جرد: ${selected?.name}`} size="sm">
        <div className="space-y-3">
          <div><label className="label">الكمية الفعلية</label><input className="input text-xl font-bold" type="number" value={mQty} onChange={(e) => setMQty(e.target.value)} autoFocus /></div>
          <div><label className="label">ملاحظة</label><input className="input" value={mNote} onChange={(e) => setMNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setAdjustOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitAdjust} className="btn-primary">تحديث الجرد</button>
        </div>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title={`تحويل إلى المشروبات: ${selected?.name}`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">المخزون الحالي: <b>{selected?.quantity}</b></p>
          <div><label className="label">الكمية المحوّلة</label><input className="input text-xl font-bold" type="number" value={tQty} onChange={(e) => setTQty(e.target.value)} autoFocus /></div>
          <div><label className="label">ملاحظة</label><input className="input" value={mNote} onChange={(e) => setMNote(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setTransferOpen(false)} className="btn-ghost">إلغاء</button>
          <button onClick={submitTransfer} className="btn-primary">تأكيد التحويل</button>
        </div>
      </Modal>
    </div>
  );
}
