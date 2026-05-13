'use client';

import { useState, useEffect } from 'react';
import { Plus, Eye, CheckCircle, Package } from 'lucide-react';
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

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  product: Product;
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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Create order form
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<{ productId: string; quantity: string }[]>([
    { productId: '', quantity: '1' },
  ]);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchOrders = () => {
    setLoading(true);
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchSuppliers = () => {
    fetch('/api/suppliers')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSuppliers(data.filter((s: Supplier) => s.active));
      })
      .catch(() => {});
  };

  const fetchProducts = () => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data.filter((p: Product) => p.active));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
    fetchProducts();
  }, []);

  const resetForm = () => {
    setFormSupplierId('');
    setFormNotes('');
    setFormItems([{ productId: '', quantity: '1' }]);
    setFormError('');
  };

  const addItem = () => {
    setFormItems([...formItems, { productId: '', quantity: '1' }]);
  };

  const removeItem = (idx: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: 'productId' | 'quantity', value: string) => {
    const updated = [...formItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormItems(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    const items = formItems
      .filter((item) => item.productId)
      .map((item) => ({
        productId: parseInt(item.productId),
        quantity: parseInt(item.quantity) || 1,
      }));

    if (items.length === 0) {
      setFormError('Add at least one product');
      setFormLoading(false);
      return;
    }

    const body = {
      supplierId: parseInt(formSupplierId),
      notes: formNotes,
      items,
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Error creating order');
      return;
    }

    setCreateOpen(false);
    resetForm();
    fetchOrders();
  };

  const handleMarkReceived = async (order: Order) => {
    if (order.status === 'received') return;

    const res = await fetch(`/api/orders/${order.id}/receive`, {
      method: 'POST',
    });

    if (res.ok) {
      fetchOrders();
      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...order, status: 'received' });
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      pending: 'secondary',
      sent: 'outline',
      received: 'default',
    };
    return (
      <Badge variant={variants[status] || 'secondary'} className="uppercase">
        {status}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Supplier Orders</h2>
          <p className="text-sm text-slate-400 mt-1">Manage orders to suppliers</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Supplier Order</DialogTitle>
              <DialogDescription>Create a new purchase order</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="space-y-4 py-4">
                {formError && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={formSupplierId} onValueChange={setFormSupplierId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Products</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                      + Add Item
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {formItems.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-slate-400">Product</Label>
                          <Select
                            value={item.productId}
                            onValueChange={(v) => updateItem(idx, 'productId', v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name} (Stock: {p.stock})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-24 space-y-1">
                          <Label className="text-xs text-slate-400">Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                          />
                        </div>
                        {formItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mb-0.5"
                            onClick={() => removeItem(idx)}
                          >
                            <span className="text-red-400 text-lg leading-none">×</span>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? 'Creating...' : 'Create Order'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    No orders found
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-slate-400">#{order.id}</TableCell>
                    <TableCell className="font-medium text-slate-100">{order.supplier?.name || '—'}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-slate-300">{order.items.length}</TableCell>
                    <TableCell className="text-sm text-slate-300">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setSelectedOrder(order); setDetailOpen(true); }}
                          title="View details"
                        >
                          <Eye className="h-4 w-4 text-slate-400" />
                        </Button>
                        {order.status !== 'received' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMarkReceived(order)}
                            title="Mark as received"
                          >
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

      {/* Order Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setSelectedOrder(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order #{selectedOrder?.id}</DialogTitle>
            <DialogDescription>
              {selectedOrder && formatDate(selectedOrder.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Supplier:</span>
                <span className="text-slate-100 font-medium">{selectedOrder.supplier?.name || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Status:</span>
                {getStatusBadge(selectedOrder.status)}
              </div>
              {selectedOrder.notes && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Notes:</span>
                  <span className="text-slate-300">{selectedOrder.notes}</span>
                </div>
              )}

              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Items</h4>
                <div className="space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md bg-slate-800/50 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-100">{item.product?.name || `Product #${item.productId}`}</span>
                      <span className="text-slate-300">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.status !== 'received' && (
                <Button
                  className="w-full"
                  onClick={() => handleMarkReceived(selectedOrder)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Received
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
