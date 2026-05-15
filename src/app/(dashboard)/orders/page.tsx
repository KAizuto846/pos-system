'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Eye, CheckCircle, Package, Search,
  Calendar, Clock, Calculator, Trash2, Columns, PlusCircle,
  Download, Image as ImageIcon, FileText, AlertCircle, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ─── Types ───
interface Supplier {
  id: number; name: string; active: boolean;
}

interface Product {
  id: number; name: string; barcode: string; stock: number; active: boolean;
}

interface SoldProduct {
  productId: number; name: string; barcode: string;
  price: number; cost: number; stock: number; minStock: number;
  department: { id: number; name: string } | null;
  supplierPrice: number | null; totalSold: number;
}

interface OrderItem {
  id: number; productId: number; quantity: number;
  product: Product; receivedQuantity: number; notes: string;
}

interface Order {
  id: number; supplierId: number; status: string; notes: string;
  createdAt: string; supplier: Supplier; items: OrderItem[];
}

interface ExtraColumn {
  id: string; name: string; key: string;
}

const EXTRA_COLUMN_OPTIONS: { label: string; key: string }[] = [
  { label: 'Precio Venta', key: 'price' },
  { label: 'Costo', key: 'cost' },
  { label: 'Stock Actual', key: 'stock' },
  { label: 'Stock Mínimo', key: 'minStock' },
  { label: 'Precio Proveedor', key: 'supplierPrice' },
  { label: 'Departamento', key: 'department' },
];

// ─── Helpers ───
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatCurrency(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusBadge(status: string) {
  const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    pending: 'secondary', sent: 'outline', received: 'default', cancelled: 'destructive',
  };
  const l: Record<string, string> = {
    pending: 'Pendiente', sent: 'Enviado', received: 'Recibido', cancelled: 'Cancelado',
  };
  return <Badge variant={v[status] || 'secondary'} className="uppercase text-xs">{l[status] || status}</Badge>;
}

function fmtSold(p: SoldProduct, key: string): string {
  if (key === 'department') return p.department?.name || '—';
  const v = (p as any)[key];
  if (v === null || v === undefined) return '—';
  return typeof v === 'number' ? v.toFixed(2) : String(v);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }

// ─── Component ───
export default function OrdersPage() {
  // ── Data ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Dialogs ──
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});
  const [receiveLoading, setReceiveLoading] = useState(false);

  // ── Create form ──
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [dateFrom, setDateFrom] = useState(weekAgoStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [timeFrom, setTimeFrom] = useState('06:00');
  const [timeTo, setTimeTo] = useState('22:00');
  const [soldProducts, setSoldProducts] = useState<SoldProduct[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [salesInfo, setSalesInfo] = useState<{ totalProducts: number; totalUnits: number } | null>(null);
  const [extraColumns, setExtraColumns] = useState<ExtraColumn[]>([]);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnKey, setNewColumnKey] = useState('price');
  const [pendingItems, setPendingItems] = useState<SoldProduct[] | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);

  // ── Fetchers ──
  const fetchOrders = useCallback(() => {
    setLoading(true);
    fetch('/api/orders')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setOrders(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fetchSuppliers = useCallback(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSuppliers(d.filter((s: Supplier) => s.active)); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchOrders(); fetchSuppliers(); }, []);

  const resetForm = () => {
    setFormSupplierId(''); setFormNotes(''); setDateFrom(weekAgoStr());
    setDateTo(todayStr()); setTimeFrom('06:00'); setTimeTo('22:00');
    setSoldProducts([]); setQuantities({}); setHiddenRows(new Set());
    setSalesInfo(null); setFormError(''); setExtraColumns([]); setPendingItems(null);
  };

  // ── Calculate sales ──
  const calculateSales = async () => {
    if (!formSupplierId) { setFormError('Selecciona un proveedor primero'); return; }
    setFormError(''); setCalculating(true); setSoldProducts([]); setQuantities({}); setHiddenRows(new Set()); setPendingItems(null);
    try {
      const params = new URLSearchParams({ supplierId: formSupplierId, dateFrom, dateTo, timeFrom, timeTo });
      const res = await fetch(`/api/orders/sales-summary?${params}`);
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Error'); return; }
      setSoldProducts(data.products || []);
      setSalesInfo({ totalProducts: data.totalProducts, totalUnits: data.totalUnits });
      const init: Record<string, number> = {};
      (data.products || []).forEach((p: SoldProduct) => { init[String(p.productId)] = p.totalSold; });
      setQuantities(init);
    } catch { setFormError('Error de conexión'); }
    finally { setCalculating(false); }
  };

  // ── Load pending items ──
  const loadPendingItems = async () => {
    if (!formSupplierId) return;
    setLoadingPending(true);
    try {
      const res = await fetch(`/api/orders/pending-items?supplierId=${formSupplierId}`);
      const data = await res.json();
      if (res.ok && data.products?.length > 0) {
        setPendingItems(data.products);
        // Add pending items to sold products if they're not already there
        const existingIds = new Set(soldProducts.map(p => p.productId));
        const newProds = data.products.filter((p: any) => !existingIds.has(p.productId));
        if (newProds.length > 0) {
          const merged = [...soldProducts, ...newProds];
          setSoldProducts(merged);
          const qty = { ...quantities };
          newProds.forEach((p: any) => { qty[String(p.productId)] = p.pendingQuantity; });
          setQuantities(qty);
        }
      }
    } catch {}
    finally { setLoadingPending(false); }
  };

  // ── Extra columns ──
  const addExtraColumn = () => {
    const opt = EXTRA_COLUMN_OPTIONS.find(o => o.key === newColumnKey);
    if (!opt) return;
    setExtraColumns(prev => [...prev, { id: `col_${Date.now()}`, name: opt.label, key: opt.key }]);
    setShowAddColumn(false);
  };
  const removeExtraColumn = (id: string) => setExtraColumns(prev => prev.filter(c => c.id !== id));

  // ── Toggle row visibility ──
  const toggleRow = (productId: number) => {
    setHiddenRows(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // ── Create order ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const items = Object.entries(quantities)
      .filter(([pid, qty]) => qty > 0 && !hiddenRows.has(parseInt(pid)))
      .map(([productId, quantity]) => ({ productId: parseInt(productId), quantity }));
    if (items.length === 0) { setFormError('No hay productos con cantidad > 0'); return; }
    setFormLoading(true);
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: parseInt(formSupplierId), notes: formNotes, items }),
    });
    const data = await res.json();
    setFormLoading(false);
    if (!res.ok) { setFormError(data.error || 'Error al crear'); return; }
    setCreateOpen(false); resetForm(); fetchOrders();
  };

  // ── Partial receive ──
  const openReceiveDialog = (order: Order) => {
    setSelectedOrder(order);
    const init: Record<number, number> = {};
    order.items.forEach(i => { init[i.id] = i.receivedQuantity; });
    setReceiveQuantities(init);
    setReceiveOpen(true);
  };

  const handleReceive = async () => {
    if (!selectedOrder) return;
    setReceiveLoading(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedOrder.items.map(i => ({
            id: i.id,
            productId: i.productId,
            quantity: i.quantity,
            receivedQuantity: receiveQuantities[i.id] || 0,
            notes: i.notes,
          })),
        }),
      });
      if (res.ok) {
        setReceiveOpen(false);
        setSelectedOrder(null);
        fetchOrders();
      }
    } catch {}
    setReceiveLoading(false);
  };

  // ── Edit items ──
  const updateOrderItem = (itemId: number, field: string, value: string | number) => {
    if (!selectedOrder) return;
    setSelectedOrder({
      ...selectedOrder,
      items: selectedOrder.items.map(i =>
        i.id === itemId ? { ...i, [field]: field === 'notes' ? value : parseInt(String(value)) || 0 } : i
      ),
    });
  };

  const saveEditedItems = async () => {
    if (!selectedOrder) return;
    setFormLoading(true);
    try {
      await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedOrder.items.map(i => ({
            id: i.id, productId: i.productId, quantity: i.quantity,
            receivedQuantity: i.receivedQuantity, notes: i.notes,
          })),
        }),
      });
      setEditMode(false); fetchOrders();
    } catch {}
    setFormLoading(false);
  };

  // ── Export (PNG or PDF) ──
  const handleExport = async (format: 'png' | 'pdf') => {
    if (!selectedOrder || !exportRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#1e293b',
        scale: 2,
      });
      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `pedido_${selectedOrder.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
        pdf.save(`pedido_${selectedOrder.id}.pdf`);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
    setExporting(false);
  };

  // ── Computed ──
  const visibleProducts = soldProducts.filter(p => !hiddenRows.has(p.productId));
  const orderedCount = Object.entries(quantities)
    .filter(([pid, q]) => q > 0 && !hiddenRows.has(parseInt(pid))).length;
  const totalUnits = Object.entries(quantities)
    .filter(([pid]) => !hiddenRows.has(parseInt(pid)))
    .reduce((s, [, q]) => s + q, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Pedidos a Proveedores</h2>
          <p className="text-sm text-slate-400 mt-1">
            Genera pedidos basados en ventas reales + recepción parcial + exportación
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuevo Pedido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuevo Pedido — Basado en Ventas</DialogTitle>
              <DialogDescription>
                Selecciona proveedor, rango de fechas/horas y calcula qué productos reponer
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="space-y-5 py-4">
                {formError && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">{formError}</div>
                )}

                {/* Proveedor */}
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <Select value={formSupplierId} onValueChange={v => { setFormSupplierId(v); setPendingItems(null); }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.length === 0 && <SelectItem value="all" disabled>No hay proveedores</SelectItem>}
                      {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fechas y horas */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-slate-400" />Desde fecha</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-slate-400" />Hasta fecha</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />Desde hora</Label>
                    <Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />Hasta hora</Label>
                    <Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} />
                  </div>
                </div>

                {/* Botones: Calcular + Pendientes + Notas */}
                <div className="flex items-end gap-2 flex-wrap">
                  <Button type="button" className="bg-emerald-700 hover:bg-emerald-600" onClick={calculateSales} disabled={calculating || !formSupplierId}>
                    <Calculator className="mr-2 h-4 w-4" />{calculating ? 'Calculando...' : 'Calcular Ventas'}
                  </Button>
                  {formSupplierId && (
                    <Button type="button" variant="outline" size="sm" onClick={loadPendingItems} disabled={loadingPending}>
                      <History className="mr-2 h-4 w-4" />{loadingPending ? 'Cargando...' : 'Pendientes de recibir'}
                    </Button>
                  )}
                  <div className="flex-1 min-w-[200px] space-y-2">
                    <Label>Notas del pedido</Label>
                    <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Opcional" />
                  </div>
                </div>

                {/* Resultados */}
                {salesInfo && (
                  <div className="flex items-center justify-between text-sm bg-slate-700/30 rounded-md px-4 py-2">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-300"><Package className="h-3.5 w-3.5 inline mr-1 text-emerald-400" />{salesInfo.totalProducts} productos vendidos</span>
                      <span className="text-slate-300">{salesInfo.totalUnits} unidades</span>
                      {pendingItems && <Badge variant="outline" className="text-amber-400 border-amber-600">{pendingItems.length} pendientes</Badge>}
                    </div>
                  </div>
                )}

                {/* Tabla */}
                {soldProducts.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">
                        Productos {visibleProducts.length !== soldProducts.length && <Badge variant="secondary" className="ml-1">{visibleProducts.length} mostrados</Badge>}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setHiddenRows(new Set())}>Mostrar todo</Button>
                        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => { const u: Record<string, number> = {}; soldProducts.forEach(p => { u[String(p.productId)] = p.totalSold; }); setQuantities(u); }}>Restaurar ventas</Button>
                        <Button type="button" variant="ghost" size="sm" className="text-xs text-blue-400" onClick={() => setShowAddColumn(!showAddColumn)}><Columns className="h-3 w-3 mr-1" />Columna extra</Button>
                      </div>
                    </div>

                    {showAddColumn && (
                      <div className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-md">
                        <span className="text-xs text-slate-400">Añadir columna:</span>
                        <Select value={newColumnKey} onValueChange={setNewColumnKey}>
                          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EXTRA_COLUMN_OPTIONS.filter(o => !extraColumns.find(ec => ec.key === o.key)).map(o => (
                              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addExtraColumn}><PlusCircle className="h-3 w-3 mr-1" />Agregar</Button>
                      </div>
                    )}

                    <div className="overflow-x-auto border border-slate-700 rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-800/80">
                            <TableHead className="w-8"></TableHead>
                            <TableHead className="w-10 text-center">#</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead className="min-w-[180px]">Nombre</TableHead>
                            <TableHead className="w-28 text-center">Unidades</TableHead>
                            {extraColumns.map(col => (
                              <TableHead key={col.id} className="min-w-[90px] text-right">
                                <div className="flex items-center gap-1 justify-end">
                                  {col.name}
                                  <button type="button" onClick={() => removeExtraColumn(col.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {soldProducts.map((product, idx) => {
                            const hidden = hiddenRows.has(product.productId);
                            return (
                              <TableRow key={product.productId} className={`${hidden ? 'hidden' : ''} hover:bg-slate-700/40 ${(quantities[String(product.productId)] || 0) > 0 ? 'bg-emerald-900/10' : ''}`}>
                                <TableCell>
                                  <button type="button" onClick={() => toggleRow(product.productId)} className="text-red-400 hover:text-red-300 opacity-60 hover:opacity-100" title="Eliminar fila">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TableCell>
                                <TableCell className="text-center text-xs text-slate-500 font-mono">{idx + 1}</TableCell>
                                <TableCell className="font-mono text-xs text-slate-400">{product.barcode || '—'}</TableCell>
                                <TableCell className="text-sm text-slate-200">{product.name}</TableCell>
                                <TableCell className="text-center">
                                  <Input type="number" min="0" value={quantities[String(product.productId)] || 0}
                                    onChange={e => { const v = parseInt(e.target.value) || 0; setQuantities(prev => ({ ...prev, [String(product.productId)]: Math.max(0, v) })); }}
                                    className="w-20 h-8 text-center text-sm" />
                                </TableCell>
                                {extraColumns.map(col => (
                                  <TableCell key={col.id} className="text-right text-sm text-slate-300 font-mono">{fmtSold(product, col.key)}</TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Hidden rows summary */}
                    {hiddenRows.size > 0 && (
                      <div className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {hiddenRows.size} producto(s) oculto(s) — no se incluirán en el pedido
                      </div>
                    )}

                    <div className="text-sm text-slate-400">{orderedCount} productos con pedido · {totalUnits} unidades</div>
                  </>
                )}

                {!formSupplierId && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Selecciona un proveedor, ajusta el rango de fechas y horas, y presiona "Calcular Ventas"
                  </div>
                )}
              </div>

              <DialogFooter className="border-t border-slate-700 pt-4">
                <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={formLoading || orderedCount === 0}>
                  {formLoading ? 'Creando...' : `Crear Pedido (${orderedCount} prods.)`}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Orders List ── */}
      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Recibidas</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-slate-700" /></TableCell>)}</TableRow>
              )) : orders.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">No hay pedidos creados</TableCell></TableRow>
              ) : orders.map(order => {
                const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const totalRecv = order.items.reduce((s, i) => s + i.receivedQuantity, 0);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-slate-400">#{order.id}</TableCell>
                    <TableCell className="font-medium text-slate-100">{order.supplier?.name || '—'}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-slate-300">{order.items.length}</TableCell>
                    <TableCell className="text-slate-300">{totalQty}</TableCell>
                    <TableCell>
                      {order.status === 'received' ? (
                        <Badge variant={totalRecv >= totalQty ? 'default' : 'secondary'} className={totalRecv < totalQty ? 'bg-amber-900/40 text-amber-400' : ''}>
                          {totalRecv}/{totalQty}
                        </Badge>
                      ) : <span className="text-slate-500">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedOrder(order); setDetailOpen(true); setEditMode(false); }} title="Ver detalle"><Eye className="h-4 w-4 text-slate-400" /></Button>
                        {order.status !== 'received' && (
                          <Button variant="ghost" size="icon" onClick={() => openReceiveDialog(order)} title="Recibir productos"><CheckCircle className="h-4 w-4 text-emerald-400" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Receive Dialog ── */}
      <Dialog open={receiveOpen} onOpenChange={o => { setReceiveOpen(o); if (!o) setSelectedOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
              Recibir Pedido #{selectedOrder?.id}
            </DialogTitle>
            <DialogDescription>
              Ingresa las cantidades recibidas para cada producto. Las que no se reciban quedarán como pendientes.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="text-sm text-slate-400 mb-2">
                Proveedor: <span className="text-slate-200 font-medium">{selectedOrder.supplier?.name}</span>
              </div>
              <div className="overflow-x-auto border border-slate-700 rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800/80">
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Pedido</TableHead>
                      <TableHead className="text-center w-28">Recibido</TableHead>
                      <TableHead className="text-center">Pendiente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map(item => {
                      const received = receiveQuantities[item.id] ?? item.receivedQuantity;
                      const pending = Math.max(0, item.quantity - received);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs text-slate-400">{item.product?.barcode || '—'}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-200">{item.product?.name || `#${item.productId}`}</TableCell>
                          <TableCell className="text-center text-slate-300">{item.quantity}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number" min="0" max={item.quantity}
                              value={received}
                              onChange={e => setReceiveQuantities(prev => ({ ...prev, [item.id]: Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0)) }))}
                              className="w-20 h-8 text-center mx-auto"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            {pending > 0 ? <Badge variant="secondary" className="bg-amber-900/40 text-amber-400">{pending}</Badge> : <span className="text-emerald-400">✓</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Totals */}
              {(() => {
                const totalPedido = selectedOrder.items.reduce((s, i) => s + i.quantity, 0);
                const totalRecibido = selectedOrder.items.reduce((s, i) => s + (receiveQuantities[i.id] ?? i.receivedQuantity), 0);
                const totalPendiente = totalPedido - totalRecibido;
                return (
                  <div className="flex justify-between text-sm px-1">
                    <span className="text-slate-400">Total pedido: <span className="text-slate-200 font-medium">{totalPedido}</span></span>
                    <span className="text-emerald-400">Recibido: <span className="font-medium">{totalRecibido}</span></span>
                    {totalPendiente > 0 && <span className="text-amber-400">Pendiente: <span className="font-medium">{totalPendiente}</span></span>}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancelar</Button></DialogClose>
            <Button onClick={handleReceive} disabled={receiveLoading} className="bg-emerald-700 hover:bg-emerald-600">
              {receiveLoading ? 'Guardando...' : '✅ Confirmar Recepción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Order Detail Dialog (with Export) ── */}
      <Dialog open={detailOpen} onOpenChange={o => { setDetailOpen(o); if (!o) { setSelectedOrder(null); setEditMode(false); setExportOpen(false); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Pedido #{selectedOrder?.id}
              {selectedOrder && getStatusBadge(selectedOrder.status)}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder && formatDate(selectedOrder.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <>
              {/* Export buttons */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => handleExport('png')} disabled={exporting} className="text-xs">
                  <ImageIcon className="h-3.5 w-3.5 mr-1" />{exporting ? '...' : 'PNG'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={exporting} className="text-xs">
                  <FileText className="h-3.5 w-3.5 mr-1" />{exporting ? '...' : 'PDF'}
                </Button>
              </div>

              {/* Exportable content */}
              <div ref={exportRef} className="p-4 rounded-lg" style={{ background: '#1e293b' }}>
                {/* Header info */}
                <div className="text-center mb-4 pb-3 border-b border-slate-600">
                  <h3 className="text-lg font-bold text-slate-100">Pedido #{selectedOrder.id}</h3>
                  <p className="text-xs text-slate-400">{formatDate(selectedOrder.createdAt)}</p>
                  <p className="text-sm text-slate-300 mt-1">Proveedor: <span className="font-medium">{selectedOrder.supplier?.name}</span></p>
                  {selectedOrder.notes && <p className="text-xs text-slate-400 mt-1">Notas: {selectedOrder.notes}</p>}
                </div>

                {/* Export table */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-700/50">
                      <TableHead className="text-slate-300">#</TableHead>
                      <TableHead className="text-slate-300">Código</TableHead>
                      <TableHead className="text-slate-300">Nombre</TableHead>
                      <TableHead className="text-center text-slate-300">Cantidad</TableHead>
                      <TableHead className="text-center text-slate-300">Recibido</TableHead>
                      <TableHead className="text-center text-slate-300">Pendiente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item, idx) => {
                      const pending = Math.max(0, item.quantity - item.receivedQuantity);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs text-slate-400 font-mono">{idx + 1}</TableCell>
                          <TableCell className="text-xs text-slate-400 font-mono">{item.product?.barcode || '—'}</TableCell>
                          <TableCell className="text-sm text-slate-200">{item.product?.name || `#${item.productId}`}</TableCell>
                          <TableCell className="text-center text-slate-200">{item.quantity}</TableCell>
                          <TableCell className="text-center text-slate-300">{item.receivedQuantity}</TableCell>
                          <TableCell className="text-center">{pending > 0 ? <span className="text-amber-400">{pending}</span> : <span className="text-emerald-400">✓</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="mt-3 text-xs text-slate-500 text-center">
                  Generado por POS System — {new Date().toLocaleString('es-MX')}
                </div>
              </div>

              {/* Edit mode */}
              <div className="flex items-center justify-between mt-4">
                <h4 className="text-sm font-medium text-slate-300">Productos ({selectedOrder.items.length})</h4>
                {selectedOrder.status !== 'received' && (
                  <Button type="button" variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode(!editMode)}>
                    {editMode ? 'Cancelar edición' : 'Editar cantidades'}
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-700 rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800/80">
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Solicitado</TableHead>
                      <TableHead className="text-center">Recibido</TableHead>
                      <TableHead className="text-center">Pendiente</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map(item => {
                      const pending = Math.max(0, item.quantity - item.receivedQuantity);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs text-slate-400">{item.product?.barcode || '—'}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-200">{item.product?.name || `#${item.productId}`}</TableCell>
                          <TableCell className="text-center">
                            {editMode ? (
                              <Input type="number" min="0" value={item.quantity} onChange={e => updateOrderItem(item.id, 'quantity', e.target.value)} className="w-20 h-8 text-center mx-auto" />
                            ) : <span className="text-slate-200">{item.quantity}</span>}
                          </TableCell>
                          <TableCell className="text-center text-slate-300">{item.receivedQuantity}</TableCell>
                          <TableCell className="text-center">{pending > 0 ? <span className="text-amber-400">{pending}</span> : <span className="text-emerald-400">✓</span>}</TableCell>
                          <TableCell>
                            {editMode ? (
                              <Input value={item.notes} onChange={e => updateOrderItem(item.id, 'notes', e.target.value)} className="h-8 text-sm" placeholder="Notas..." />
                            ) : <span className="text-xs text-slate-400">{item.notes || '—'}</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {editMode && (
                <Button className="w-full" onClick={saveEditedItems} disabled={formLoading}>
                  {formLoading ? 'Guardando...' : '💾 Guardar cambios'}
                </Button>
              )}
            </>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cerrar</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
