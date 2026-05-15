'use client';

import { useState, useEffect } from 'react';
import { Eye, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';

interface SaleItem {
  id: number;
  productId: number;
  quantity: number;
  price: number;
  product: { id: number; name: string; barcode: string };
}

interface PaymentMethod {
  id: number;
  name: string;
}

interface RefundInfo {
  id: number;
  quantity: number;
  amount: number;
  reason: string;
  createdAt: string;
}

interface Sale {
  id: number;
  total: number;
  createdAt: string;
  items: SaleItem[];
  paymentMethod: PaymentMethod;
  user: { name: string };
  refunds: RefundInfo[];
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Refund dialog state
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSale, setRefundSale] = useState<Sale | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [refundQty, setRefundQty] = useState(1);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSales = () => {
    setLoading(true);
    let url = '/api/sales';
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    if (qs) url += '?' + qs;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSales(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSales();
  }, []);

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

  const openRefundDialog = (sale: Sale) => {
    setRefundSale(sale);
    setSelectedProductId('');
    setRefundQty(1);
    setRefundAmount(0);
    setRefundReason('');
    setMessage('');
    setRefundOpen(true);
  };

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setRefundQty(1);
    if (productId && refundSale) {
      const item = refundSale.items.find(
        (i) => i.productId === parseInt(productId)
      );
      if (item) {
        setRefundAmount(item.price);
      }
    }
  };

  const getMaxRefundable = (): number => {
    if (!refundSale || !selectedProductId) return 0;
    const pid = parseInt(selectedProductId);
    const item = refundSale.items.find((i) => i.productId === pid);
    if (!item) return 0;
    const alreadyRefunded =
      refundSale.refunds?.reduce((sum, r) => sum + r.quantity, 0) || 0;
    return item.quantity - alreadyRefunded;
  };

  const handleRefundQtyChange = (value: string) => {
    const qty = parseInt(value) || 0;
    const max = getMaxRefundable();
    setRefundQty(Math.min(qty, max));
    // Update amount based on selected product price × quantity
    if (selectedProductId && refundSale) {
      const item = refundSale.items.find(
        (i) => i.productId === parseInt(selectedProductId)
      );
      if (item) {
        setRefundAmount(item.price * Math.min(qty, max));
      }
    }
  };

  const handleSubmitRefund = async () => {
    if (!refundSale || !selectedProductId) return;
    setSubmitting(true);
    setMessage('');

    try {
      const res = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: refundSale.id,
          productId: parseInt(selectedProductId),
          quantity: refundQty,
          amount: refundAmount,
          reason: refundReason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Error al procesar reembolso');
        return;
      }

      setMessage(`Reembolso creado exitosamente`);
      setRefundOpen(false);
      fetchSales(); // Refresh the list
    } catch {
      setMessage('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const getTotalRefunded = (sale: Sale): number => {
    if (!sale.refunds || sale.refunds.length === 0) return 0;
    return sale.refunds.reduce((sum, r) => sum + r.amount, 0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Sales History</h2>
        <p className="text-sm text-slate-400 mt-1">View all completed sales</p>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-44"
          />
        </div>
        <Button onClick={fetchSales} size="sm">
          <Search className="mr-2 h-4 w-4" />
          Filter
        </Button>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStartDate(''); setEndDate(''); }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Refunds</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                    No sales found
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => {
                  const totalRefunded = getTotalRefunded(sale);
                  const hasRefunds = totalRefunded > 0;
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-xs text-slate-400">#{sale.id}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{formatDate(sale.createdAt)}</TableCell>
                      <TableCell className="font-medium text-slate-100">
                        ${sale.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-slate-300">{sale.items.length}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sale.paymentMethod?.name || '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">{sale.user?.name || '—'}</TableCell>
                      <TableCell>
                        {hasRefunds ? (
                          <Badge variant="destructive" className="text-xs">
                            -${totalRefunded.toFixed(2)}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedSale(sale); setDetailOpen(true); }}
                          >
                            <Eye className="h-4 w-4 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openRefundDialog(sale)}
                            title="Reembolsar"
                          >
                            <RotateCcw className="h-4 w-4 text-amber-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sale Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setSelectedSale(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale #{selectedSale?.id}</DialogTitle>
            <DialogDescription>
              {selectedSale && formatDate(selectedSale.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Payment Method:</span>
                <span className="text-slate-100 font-medium">{selectedSale.paymentMethod?.name || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Cashier:</span>
                <span className="text-slate-100 font-medium">{selectedSale.user?.name || '—'}</span>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Items</h4>
                <div className="space-y-2">
                  {selectedSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md bg-slate-800/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="text-slate-100">{item.product.name}</span>
                        <span className="ml-2 text-xs text-slate-500">x{item.quantity}</span>
                      </div>
                      <span className="text-slate-200">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedSale.refunds && selectedSale.refunds.length > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Reembolsos</h4>
                  <div className="space-y-2">
                    {selectedSale.refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="flex items-center justify-between rounded-md bg-red-900/20 px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="text-slate-300">Refund #{refund.id}</span>
                          <span className="ml-2 text-xs text-slate-500">
                            {refund.reason ? `- ${refund.reason}` : ''}
                          </span>
                        </div>
                        <span className="text-red-400">-${refund.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between border-t border-slate-700 pt-4 text-base font-bold">
                <span className="text-slate-300">Total</span>
                <span className="text-emerald-400">${selectedSale.total.toFixed(2)}</span>
              </div>
              {getTotalRefunded(selectedSale) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Reembolsado</span>
                  <span className="text-red-400">-${getTotalRefunded(selectedSale).toFixed(2)}</span>
                </div>
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

      {/* Refund Dialog */}
      <Dialog open={refundOpen} onOpenChange={(o) => { if (!o) setRefundOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reembolsar - Sale #{refundSale?.id}</DialogTitle>
            <DialogDescription>
              Select a product and enter the refund details
            </DialogDescription>
          </DialogHeader>
          {refundSale && (
            <div className="space-y-4">
              {message && (
                <div className={`rounded-md p-3 text-sm ${
                  message.includes('exitosamente') || message.includes('éxito')
                    ? 'bg-emerald-900/30 text-emerald-300'
                    : 'bg-red-900/30 text-red-300'
                }`}>
                  {message}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="refund-product">Producto</Label>
                <Select
                  value={selectedProductId}
                  onValueChange={handleProductChange}
                >
                  <SelectTrigger id="refund-product">
                    <SelectValue placeholder="Seleccionar producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {refundSale.items.map((item) => (
                      <SelectItem
                        key={item.productId}
                        value={String(item.productId)}
                      >
                        {item.product.name} — ${item.price.toFixed(2)} x{item.quantity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProductId && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="refund-qty">
                      Cantidad (máx: {getMaxRefundable()})
                    </Label>
                    <Input
                      id="refund-qty"
                      type="number"
                      min={1}
                      max={getMaxRefundable()}
                      value={refundQty}
                      onChange={(e) => handleRefundQtyChange(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refund-amount">Monto a reembolsar ($)</Label>
                    <Input
                      id="refund-amount"
                      type="number"
                      step="0.01"
                      min={0}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refund-reason">Motivo / Nota</Label>
                    <Input
                      id="refund-reason"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Razón del reembolso (opcional)"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setRefundOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmitRefund}
              disabled={!selectedProductId || refundQty < 1 || submitting}
            >
              {submitting ? 'Procesando...' : 'Procesar Reembolso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
