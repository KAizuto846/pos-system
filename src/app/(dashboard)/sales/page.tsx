'use client';

import { useState, useEffect } from 'react';
import { Eye, Search } from 'lucide-react';
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

interface Sale {
  id: number;
  total: number;
  createdAt: string;
  items: SaleItem[];
  paymentMethod: PaymentMethod;
  user: { name: string };
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                    No sales found
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelectedSale(sale); setDetailOpen(true); }}
                      >
                        <Eye className="h-4 w-4 text-slate-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
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

              <div className="flex justify-between border-t border-slate-700 pt-4 text-base font-bold">
                <span className="text-slate-300">Total</span>
                <span className="text-emerald-400">${selectedSale.total.toFixed(2)}</span>
              </div>
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
