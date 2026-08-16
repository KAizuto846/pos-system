'use client';

import { useState, useEffect } from 'react';
import { Eye, RotateCcw, Search, Printer, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
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
  productId: number;
  quantity: number;
  amount: number;
  reason: string;
  createdAt: string;
}

interface Sale {
  id: number;
  total: number;
  discountTotal?: number;
  cashReceived?: number | null;
  change?: number | null;
  createdAt: string;
  items: SaleItem[];
  paymentMethod: PaymentMethod;
  user: { name: string };
  refunds: RefundInfo[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

const PAGE_LIMIT = 25;

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Refund dialog state
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSale, setRefundSale] = useState<Sale | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [refundQty, setRefundQty] = useState(1);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Ticket (impresión / guardado)
  const [printing, setPrinting] = useState(false);
  const [printerName, setPrinterName] = useState('');
  const [ticketWidth, setTicketWidth] = useState(32);

  // Cargar impresora de tickets configurada (Electron)
  useEffect(() => {
    const win = window as unknown as { electronAPI?: { getConfig?: () => Promise<{ ticketPrinter?: string; ticketWidth?: number }> } };
    if (win.electronAPI?.getConfig) {
      win.electronAPI.getConfig()
        .then((cfg) => {
          if (cfg.ticketPrinter) setPrinterName(cfg.ticketPrinter);
          if (cfg.ticketWidth) setTicketWidth(cfg.ticketWidth);
        })
        .catch(() => {});
    }
  }, []);

  const currency = (n: number) => `$${n.toFixed(2)}`;

  // Genera el ticket de una venta pasada como texto plano (para impresora de tickets)
  const buildTicketText = (sale: Sale): string => {
    const W = Math.max(24, Math.min(48, ticketWidth));
    const line = (ch: string) => ch.repeat(W);
    const center = (s: string) => {
      const t = s.slice(0, W);
      const pad = Math.max(0, Math.floor((W - t.length) / 2));
      return ' '.repeat(pad) + t;
    };
    const lr = (l: string, r: string) => {
      const rtrunc = r.slice(0, Math.max(8, Math.floor(W * 0.4)));
      const ltrunc = l.slice(0, Math.max(8, W - rtrunc.length - 2));
      return ltrunc + ' '.repeat(Math.max(1, W - ltrunc.length - rtrunc.length)) + rtrunc;
    };

    const date = new Date(sale.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

    const out: string[] = [];
    out.push(center('TICKET DE VENTA'));
    out.push(center('Venta #' + sale.id));
    out.push(center(date));
    out.push(line('='));
    out.push(lr('Artículo', 'Importe'));
    out.push(line('-'));

    for (const item of sale.items) {
      out.push(item.product.name.slice(0, W));
      out.push(lr(`  ${item.quantity} x ${currency(item.price)}`, currency(item.price * item.quantity)));
    }

    out.push(line('='));
    if ((sale.discountTotal || 0) > 0) out.push(lr('Descuento', '-' + currency(sale.discountTotal || 0)));
    if (sale.cashReceived != null && sale.change != null) {
      out.push(lr('Efectivo recibido', currency(sale.cashReceived)));
      out.push(lr('Cambio', currency(sale.change)));
    }
    out.push(lr('TOTAL', currency(sale.total)));
    out.push(line('-'));
    out.push(lr('Método de pago', sale.paymentMethod?.name || '—'));
    if (sale.user?.name) out.push(lr('Cajero', sale.user.name));
    out.push('');
    out.push(center('¡Gracias por su compra!'));
    out.push('');
    return out.join('\n');
  };

  // HTML imprimible del ticket (para navegador)
  const buildTicketHtml = (sale: Sale): string => {
    const text = buildTicketText(sale);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = text.split('\n').map((l) => `<div>${esc(l)}</div>`).join('');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket #${sale.id}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; width: 72mm; margin: 0 auto; white-space: pre-wrap; word-break: break-all; }
</style>
</head>
<body>${lines}</body>
</html>`;
  };

  // Imprime el ticket: servidor → Electron → navegador
  const handlePrintTicket = async (sale: Sale) => {
    setPrinting(true);
    try {
      const text = buildTicketText(sale);

      // 1) Servidor (impresora pegada al host)
      try {
        const res = await fetch('/api/print/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          toast.success('Ticket impreso');
          return;
        }
      } catch {
        // seguir con los otros métodos
      }

      // 2) Electron (impresora instalada en la misma máquina)
      const win = window as unknown as {
        electronAPI?: { printPlainText?: (text: string, printer: string) => Promise<{ ok: boolean; error?: string }> };
      };
      if (printerName && win.electronAPI?.printPlainText) {
        const res = await win.electronAPI.printPlainText(text, printerName);
        if (res?.ok) toast.success('Ticket impreso');
        else toast.error(res?.error || 'No se pudo imprimir el ticket');
        return;
      }

      // 3) Navegador: iframe oculto + window.print
      const html = buildTicketHtml(sale);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      if (!doc) {
        window.print();
        setTimeout(() => iframe.remove(), 2000);
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.print();
        }
        setTimeout(() => iframe.remove(), 2000);
      }, 150);
    } finally {
      setPrinting(false);
    }
  };

  // Guarda el ticket como archivo .txt
  const handleSaveTicket = (sale: Sale) => {
    const text = buildTicketText(sale);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${sale.id}-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Ticket guardado como archivo');
  };

  useEffect(() => {
    const controller = new AbortController();

    const fetchSales = async () => {
      setLoading(true);
      setLoadError('');
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      });
      if (appliedStartDate) params.set('startDate', appliedStartDate);
      if (appliedEndDate) params.set('endDate', appliedEndDate);

      try {
        const res = await fetch(`/api/sales?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Error al cargar ventas');
        const data: { sales: Sale[]; pagination: Pagination } = await res.json();
        setSales(data.sales);
        setPagination(data.pagination);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSales([]);
        setLoadError('No se pudieron cargar las ventas');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchSales();
    return () => controller.abort();
  }, [page, appliedStartDate, appliedEndDate, refreshKey]);

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
      refundSale.refunds
        ?.filter((refund) => refund.productId === pid)
        .reduce((sum, refund) => sum + refund.quantity, 0) || 0;
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
      setRefreshKey((key) => key + 1);
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
        <Button
          onClick={() => {
            setPage(1);
            setAppliedStartDate(startDate);
            setAppliedEndDate(endDate);
          }}
          size="sm"
        >
          <Search className="mr-2 h-4 w-4" />
          Filter
        </Button>
        {(startDate || endDate || appliedStartDate || appliedEndDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setAppliedStartDate('');
              setAppliedEndDate('');
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {loadError && (
        <div className="rounded-md border border-red-600/50 bg-red-600/10 px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      )}

      <Card className="border-slate-700 bg-slate-800">
        <CardContent className="p-0 overflow-x-auto">
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
                            onClick={() => handlePrintTicket(sale)}
                            disabled={printing}
                            title="Imprimir ticket de esta venta"
                          >
                            <Printer className="h-4 w-4 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSaveTicket(sale)}
                            title="Guardar ticket como archivo"
                          >
                            <FileDown className="h-4 w-4 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRefundDialog(sale)}
                            title="Reembolsar producto de esta venta"
                            className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1"
                          >
                            <RotateCcw className="h-4 w-4" />
                            <span className="text-xs hidden sm:inline">Reemb.</span>
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {pagination.total > 0
            ? `Página ${pagination.page} de ${pagination.totalPages} · ${pagination.total} ventas`
            : '0 ventas'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !pagination.hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>

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
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="secondary">Close</Button>
            </DialogClose>
            <Button
              variant="outline"
              onClick={() => selectedSale && handleSaveTicket(selectedSale)}
              className="border-slate-600 text-slate-300"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Guardar .txt
            </Button>
            <Button
              onClick={() => selectedSale && handlePrintTicket(selectedSale)}
              disabled={printing}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              <Printer className="mr-2 h-4 w-4" />
              {printing ? 'Imprimiendo...' : 'Imprimir ticket'}
            </Button>
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
