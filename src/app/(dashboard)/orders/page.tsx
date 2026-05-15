'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Eye, CheckCircle, Package, Search, ChevronDown, ChevronRight, Trash2, Columns, PlusCircle } from 'lucide-react';
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
  id: number;
  name: string;
  active: boolean;
}

interface Product {
  id: number;
  name: string;
  barcode: string;
  stock: number;
  active: boolean;
}

interface SupplierProduct extends Product {
  price: number;
  cost: number;
  minStock: number;
  supplierPrice: number | null;
  department: { id: number; name: string } | null;
}

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  product: Product;
  receivedQuantity: number;
  notes: string;
}

interface Order {
  id: number;
  supplierId: number;
  status: string;
  notes: string;
  createdAt: string;
  supplier: Supplier;
  items: OrderItem[];
}

interface ExtraColumn {
  id: string;
  name: string;
  key: keyof SupplierProduct | string; // which field to pull from product
}

// Extra column options that auto-complete from product data
const EXTRA_COLUMN_OPTIONS: { label: string; key: keyof SupplierProduct }[] = [
  { label: 'Precio Venta', key: 'price' },
  { label: 'Costo', key: 'cost' },
  { label: 'Stock Actual', key: 'stock' },
  { label: 'Stock Mínimo', key: 'minStock' },
  { label: 'Precio Proveedor', key: 'supplierPrice' },
  { label: 'Departamento', key: 'department' },
];

// ─── Helpers ───
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    pending: 'secondary',
    sent: 'outline',
    received: 'default',
    cancelled: 'destructive',
  };
  return (
    <Badge variant={variants[status] || 'secondary'} className="uppercase text-xs">
      {status === 'pending' ? 'Pendiente' : status === 'sent' ? 'Enviado' : status === 'received' ? 'Recibido' : status === 'cancelled' ? 'Cancelado' : status}
    </Badge>
  );
}

function formatCellValue(product: SupplierProduct, key: keyof SupplierProduct | string): string {
  if (key === 'department') {
    return (product as any).department?.name || '—';
  }
  const val = (product as any)[key];
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toFixed(2);
  return String(val);
}

// ─── Page Component ───
export default function OrdersPage() {
  // ── Data ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editMode, setEditMode] = useState(false);

  // ── Create form ──
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [formItems, setFormItems] = useState<Record<string, number>>({}); // productId -> quantity
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // ── Extra columns in the table ──
  const [extraColumns, setExtraColumns] = useState<ExtraColumn[]>([]);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnKey, setNewColumnKey] = useState<string>('price');

  // ── Fetch functions ──
  const fetchOrders = useCallback(() => {
    setLoading(true);
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setOrders(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fetchSuppliers = useCallback(() => {
    fetch('/api/suppliers')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setSuppliers(data.filter((s: Supplier) => s.active)); })
      .catch(() => {});
  }, []);

  const fetchSupplierProducts = useCallback(async (supplierId: string) => {
    if (!supplierId) { setSupplierProducts([]); setFormItems({}); return; }
    setLoadingProducts(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/products`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSupplierProducts(data);
        // Initialize all products with quantity 0
        const initial: Record<string, number> = {};
        data.forEach((p: SupplierProduct) => { initial[String(p.id)] = 0; });
        setFormItems(initial);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); fetchSuppliers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setFormSupplierId('');
    setFormNotes('');
    setSupplierProducts([]);
    setFormItems({});
    setFormError('');
    setExtraColumns([]);
    setProductSearch('');
  };

  // ── When supplier changes, load products ──
  const handleSupplierChange = (val: string) => {
    setFormSupplierId(val);
    setFormItems({});
    setExtraColumns([]);
    if (val) fetchSupplierProducts(val);
    else setSupplierProducts([]);
  };

  // ── Add extra column ──
  const addExtraColumn = () => {
    if (!newColumnKey) return;
    const option = EXTRA_COLUMN_OPTIONS.find(o => o.key === newColumnKey);
    if (!option) return;
    setExtraColumns(prev => [...prev, { id: `col_${Date.now()}`, name: option.label, key: option.key }]);
    setShowAddColumn(false);
  };

  const removeExtraColumn = (id: string) => {
    setExtraColumns(prev => prev.filter(c => c.id !== id));
  };

  // ── Create order ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const items = Object.entries(formItems)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId: parseInt(productId), quantity }));

    if (items.length === 0) {
      setFormError('Selecciona al menos un producto con cantidad > 0');
      return;
    }

    setFormLoading(true);
    const body = { supplierId: parseInt(formSupplierId), notes: formNotes, items };
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error al crear pedido');
      return;
    }

    setCreateOpen(false);
    resetForm();
    fetchOrders();
  };

  // ── Mark received ──
  const handleMarkReceived = async (order: Order) => {
    if (order.status === 'received') return;
    const res = await fetch(`/api/orders/${order.id}/receive`, { method: 'POST' });
    if (res.ok) {
      fetchOrders();
      if (selectedOrder?.id === order.id) setSelectedOrder({ ...order, status: 'received' });
    }
  };

  // ── Update item in edit mode ──
  const updateOrderItem = (itemId: number, field: string, value: string | number) => {
    if (!selectedOrder) return;
    setSelectedOrder({
      ...selectedOrder,
      items: selectedOrder.items.map(item =>
        item.id === itemId ? { ...item, [field]: field === 'notes' ? value : parseInt(String(value)) || 0 } : item
      ),
    });
  };

  // ── Save edited items ──
  const saveEditedItems = async () => {
    if (!selectedOrder) return;
    setFormLoading(true);
    try {
      // Update each item one by one
      for (const item of selectedOrder.items) {
        await fetch(`/api/orders/${selectedOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: selectedOrder.items.map(i => ({
              id: i.id,
              productId: i.productId,
              quantity: i.quantity,
              receivedQuantity: i.receivedQuantity,
              notes: i.notes,
            })),
          }),
        });
      }
      setEditMode(false);
      fetchOrders();
    } catch (e) {
      console.error(e);
    }
    setFormLoading(false);
  };

  // ── Computed values ──
  const filteredProducts = supplierProducts.filter(p =>
    !productSearch ||
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.barcode.toLowerCase().includes(productSearch.toLowerCase())
  );

  const orderedProductCount = Object.values(formItems).filter(q => q > 0).length;
  const totalUnits = Object.values(formItems).reduce((sum, q) => sum + q, 0);

  // ── Bulk actions ──
  const setAllQuantities = (qty: number) => {
    const updated: Record<string, number> = {};
    Object.keys(formItems).forEach(id => { updated[id] = qty; });
    setFormItems(updated);
  };

  const zeroAllQuantities = () => setAllQuantities(0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Pedidos a Proveedores</h2>
          <p className="text-sm text-slate-400 mt-1">Gestiona órdenes de compra con tabla editable tipo Excel</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Pedido
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuevo Pedido a Proveedor</DialogTitle>
              <DialogDescription>
                Selecciona un proveedor para cargar automáticamente sus productos
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="space-y-4 py-4">
                {formError && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}

                {/* Supplier & Notes row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Proveedor *</Label>
                    <Select value={formSupplierId} onValueChange={handleSupplierChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.length === 0 && (
                          <SelectItem value="all" disabled>No hay proveedores</SelectItem>
                        )}
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Notas</Label>
                    <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notas opcionales del pedido" />
                  </div>
                </div>

                {/* Product table */}
                {formSupplierId && (
                  <>
                    <div className="flex items-center justify-between gap-4 mt-4">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-emerald-400" />
                        <span className="text-sm font-medium text-slate-200">
                          Productos de {suppliers.find(s => s.id === parseInt(formSupplierId))?.name || ''}
                        </span>
                        <Badge variant="outline" className="ml-2">
                          {supplierProducts.length} productos
                        </Badge>
                        {orderedProductCount > 0 && (
                          <Badge variant="default" className="bg-emerald-600">
                            {orderedProductCount} seleccionados ({totalUnits} uds)
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={zeroAllQuantities}>
                          Limpiar todo
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setAllQuantities(1)}>
                          Todos x1
                        </Button>
                        {/* Add column button */}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddColumn(!showAddColumn)} className="text-xs text-blue-400">
                          <Columns className="h-3 w-3 mr-1" />
                          Columna extra
                        </Button>
                      </div>
                    </div>

                    {/* Add column row */}
                    {showAddColumn && (
                      <div className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-md">
                        <span className="text-xs text-slate-400">Añadir columna:</span>
                        <Select value={newColumnKey} onValueChange={setNewColumnKey}>
                          <SelectTrigger className="w-48 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXTRA_COLUMN_OPTIONS
                              .filter(o => !extraColumns.find(ec => ec.key === o.key))
                              .map((o) => (
                                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addExtraColumn}>
                          <PlusCircle className="h-3 w-3 mr-1" /> Agregar
                        </Button>
                      </div>
                    )}

                    {/* Product search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Filtrar productos por nombre o código..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="pl-9 h-9 text-sm"
                      />
                    </div>

                    {/* Data table */}
                    {loadingProducts ? (
                      <div className="flex items-center justify-center py-12">
                        <Skeleton className="h-6 w-48 bg-slate-700" />
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-700 rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-800/80">
                              <TableHead className="w-12 text-center">#</TableHead>
                              <TableHead>Código</TableHead>
                              <TableHead className="min-w-[200px]">Nombre</TableHead>
                              <TableHead className="w-24 text-center">Unidades</TableHead>
                              {extraColumns.map(col => (
                                <TableHead key={col.id} className="min-w-[100px] text-right">
                                  <div className="flex items-center gap-1 justify-end">
                                    {col.name}
                                    <button type="button" onClick={() => removeExtraColumn(col.id)} className="text-red-400 hover:text-red-300">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredProducts.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3 + extraColumns.length} className="text-center text-slate-500 py-8 text-sm">
                                  {productSearch ? 'No hay productos que coincidan' : 'No hay productos cargados para este proveedor'}
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredProducts.map((product, idx) => (
                                <TableRow key={product.id} className={`hover:bg-slate-700/40 ${(formItems[String(product.id)] || 0) > 0 ? 'bg-emerald-900/10' : ''}`}>
                                  <TableCell className="text-center text-xs text-slate-500 font-mono">{idx + 1}</TableCell>
                                  <TableCell className="font-mono text-xs text-slate-400">{product.barcode || '—'}</TableCell>
                                  <TableCell className="text-sm text-slate-200">{product.name}</TableCell>
                                  <TableCell className="text-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={formItems[String(product.id)] || 0}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        setFormItems(prev => ({ ...prev, [String(product.id)]: Math.max(0, val) }));
                                      }}
                                      className="w-20 h-8 text-center text-sm"
                                    />
                                  </TableCell>
                                  {extraColumns.map(col => (
                                    <TableCell key={col.id} className="text-right text-sm text-slate-300 font-mono">
                                      {formatCellValue(product, col.key)}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="flex items-center justify-between text-sm px-1">
                      <span className="text-slate-400">
                        {orderedProductCount} productos con pedido · {totalUnits} unidades totales
                      </span>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter className="border-t border-slate-700 pt-4">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={formLoading || !formSupplierId || orderedProductCount === 0}>
                  {formLoading ? 'Creando...' : `Crear Pedido (${orderedProductCount} prods.)`}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Orders list */}
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
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full bg-slate-700" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                    No hay pedidos creados
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-slate-400">#{order.id}</TableCell>
                    <TableCell className="font-medium text-slate-100">{order.supplier?.name || '—'}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-slate-300">{order.items.length}</TableCell>
                    <TableCell className="text-slate-300">{order.items.reduce((s, i) => s + i.quantity, 0)}</TableCell>
                    <TableCell className="text-sm text-slate-300">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedOrder(order); setDetailOpen(true); setEditMode(false); }} title="Ver detalle">
                          <Eye className="h-4 w-4 text-slate-400" />
                        </Button>
                        {order.status !== 'received' && (
                          <Button variant="ghost" size="icon" onClick={() => handleMarkReceived(order)} title="Marcar como recibido">
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Order Detail / Edit Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) { setSelectedOrder(null); setEditMode(false); } }}>
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
            <div className="space-y-4">
              {/* Order info */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-800/50 rounded-md p-4">
                <div>
                  <span className="text-slate-400">Proveedor:</span>
                  <span className="text-slate-100 font-medium ml-2">{selectedOrder.supplier?.name || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Estado:</span>
                  <span className="ml-2">{getStatusBadge(selectedOrder.status)}</span>
                </div>
                {selectedOrder.notes && (
                  <div className="col-span-2">
                    <span className="text-slate-400">Notas:</span>
                    <span className="text-slate-300 ml-2">{selectedOrder.notes}</span>
                  </div>
                )}
              </div>

              {/* Editable items table */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-300">
                  Productos ({selectedOrder.items.length})
                </h4>
                {selectedOrder.status !== 'received' && (
                  <Button
                    type="button"
                    variant={editMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditMode(!editMode)}
                  >
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
                    {selectedOrder.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs text-slate-400">{item.product?.barcode || '—'}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-200">{item.product?.name || `Producto #${item.productId}`}</TableCell>
                        <TableCell className="text-center">
                          {editMode ? (
                            <Input
                              type="number"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => updateOrderItem(item.id, 'quantity', e.target.value)}
                              className="w-20 h-8 text-center mx-auto"
                            />
                          ) : (
                            <span className="text-slate-200">{item.quantity}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-slate-300">{item.receivedQuantity}</TableCell>
                        <TableCell className="text-center">
                          {item.quantity - item.receivedQuantity > 0 ? (
                            <span className="text-amber-400">{item.quantity - item.receivedQuantity}</span>
                          ) : (
                            <span className="text-emerald-400">✓</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editMode ? (
                            <Input
                              value={item.notes}
                              onChange={(e) => updateOrderItem(item.id, 'notes', e.target.value)}
                              className="h-8 text-sm"
                              placeholder="Notas..."
                            />
                          ) : (
                            <span className="text-xs text-slate-400">{item.notes || '—'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Save edit button */}
              {editMode && (
                <Button className="w-full" onClick={saveEditedItems} disabled={formLoading}>
                  {formLoading ? 'Guardando...' : '💾 Guardar cambios'}
                </Button>
              )}

              {/* Mark received */}
              {selectedOrder.status !== 'received' && !editMode && (
                <Button className="w-full" onClick={() => handleMarkReceived(selectedOrder)}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Marcar como Recibido
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
