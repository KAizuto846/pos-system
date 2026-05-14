'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Calendar,
  Plus, ArrowUpFromLine, ArrowDownToLine, History, RefreshCw, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';

interface FinanceSummary {
  period: { from: string; to: string };
  sales: {
    count: number;
    revenue: number;
    totalCost: number;
    profit: number;
    profitMargin: string;
  };
  cash: {
    income: number;
    expenses: number;
    balance: number;
  };
}

interface CashEntry {
  id: number;
  type: string;
  amount: number;
  description: string;
  recordedAt: string;
  paymentMethod?: { name: string } | null;
  user?: { name: string } | null;
  sale?: { id: number; total: number } | null;
}

interface PaymentMethod {
  id: number;
  name: string;
}

export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tab, setTab] = useState<'summary' | 'history'>('summary');
  const [entryPage, setEntryPage] = useState(1);
  const [entryHasMore, setEntryHasMore] = useState(false);
  const [entryTotal, setEntryTotal] = useState(0);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashType, setCashType] = useState('INCOME');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [cashPaymentMethod, setCashPaymentMethod] = useState('');
  const [cashLoading, setCashLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const fetchSummary = useCallback(async (from?: string, to?: string) => {
    const params = new URLSearchParams({ action: 'summary' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const res = await fetch(`/api/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data);
    }
  }, []);

  const fetchEntries = useCallback(async (from?: string, to?: string, page = 1) => {
    const params = new URLSearchParams({ action: 'cash-entries', page: String(page), limit: '20' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const res = await fetch(`/api/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(prev => page === 1 ? data.entries : [...prev, ...data.entries]);
      setEntryHasMore(data.pagination.hasMore);
      setEntryTotal(data.pagination.total);
      setEntryPage(page);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/payment-methods').then(r => r.json()).then((data: PaymentMethod[]) => {
        if (Array.isArray(data)) setPaymentMethods(data.filter(pm => pm.active));
      }),
    ]);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSummary(dateFrom || undefined, dateTo || undefined),
      fetchEntries(dateFrom || undefined, dateTo || undefined, 1),
    ]).finally(() => setLoading(false));
  }, [dateFrom, dateTo, fetchSummary, fetchEntries]);

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([
      fetchSummary(dateFrom || undefined, dateTo || undefined),
      fetchEntries(dateFrom || undefined, dateTo || undefined, 1),
    ]).finally(() => setLoading(false));
  };

  const handleCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashLoading(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: cashType,
          amount: parseFloat(cashAmount),
          description: cashDesc,
          paymentMethodId: cashPaymentMethod || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al registrar');
      }

      toast.success(cashType === 'INCOME' ? '💰 Ingreso registrado' : '💸 Egreso registrado');
      setCashDialogOpen(false);
      setCashAmount('');
      setCashDesc('');
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setCashLoading(false);
    }
  };

  const handleLoadMore = () => {
    fetchEntries(dateFrom || undefined, dateTo || undefined, entryPage + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">💰 Finanzas</h2>
          <p className="text-sm text-slate-400 mt-1">Control de caja, ventas y ganancias</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setCashDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            Registrar movimiento
          </Button>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Desde</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-44 border-slate-600 bg-slate-800 text-slate-200"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Hasta</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-44 border-slate-600 bg-slate-800 text-slate-200"
          />
        </div>
        <Calendar className="h-4 w-4 text-slate-500 mb-2" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Ventas</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {summary ? formatCurrency(summary.sales.revenue) : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {summary ? `${summary.sales.count} transacciones` : 'Cargando...'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Ganancia</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {summary ? formatCurrency(summary.sales.profit) : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Margen: {summary ? `${summary.sales.profitMargin}%` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Costo</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {summary ? formatCurrency(summary.sales.totalCost) : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Costo total de productos vendidos</p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Caja Fuerte</CardTitle>
            <Wallet className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(summary?.cash.balance ?? 0) >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
              {summary ? formatCurrency(summary.cash.balance) : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Saldo disponible en caja</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Summary / History */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setTab('summary')}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            tab === 'summary' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Resumen
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            tab === 'history' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="inline h-4 w-4 mr-1" />
          Historial de caja
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'summary' && summary && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-200">Ingresos vs Egresos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-sm text-emerald-400">
                  <ArrowUpFromLine className="h-4 w-4" /> Ingresos
                </span>
                <span className="font-semibold text-slate-100">{formatCurrency(summary.cash.income)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-sm text-red-400">
                  <ArrowDownToLine className="h-4 w-4" /> Egresos
                </span>
                <span className="font-semibold text-slate-100">{formatCurrency(summary.cash.expenses)}</span>
              </div>
              <Separator className="bg-slate-700" />
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-sm text-amber-400">
                  <Wallet className="h-4 w-4" /> Balance
                </span>
                <span className={`font-bold text-lg ${summary.cash.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(summary.cash.balance)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Usa "Registrar movimiento" para agregar o retirar dinero de la caja fuerte.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-200">Rentabilidad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Ingreso por ventas</span>
                <span className="font-semibold text-slate-100">{formatCurrency(summary.sales.revenue)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Costo de productos</span>
                <span className="font-semibold text-red-400">{formatCurrency(summary.sales.totalCost)}</span>
              </div>
              <Separator className="bg-slate-700" />
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-200">Ganancia neta</span>
                <span className="font-bold text-lg text-emerald-400">{formatCurrency(summary.sales.profit)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Margen de ganancia</span>
                <Badge variant="default" className="bg-emerald-900/40 text-emerald-400">
                  {summary.sales.profitMargin}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <Card className="border-slate-700 bg-slate-800/50">
          <CardContent className="p-0">
            {loading && entries.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Wallet className="mx-auto h-8 w-8 mb-2" />
                <p className="text-sm">No hay movimientos registrados</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/30">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        entry.type === 'INCOME' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'
                      }`}>
                        {entry.type === 'INCOME' ? <ArrowUpFromLine className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">
                          {entry.description || (entry.type === 'INCOME' ? 'Ingreso' : 'Egreso')}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{new Date(entry.recordedAt).toLocaleDateString('es-MX')}</span>
                          {entry.paymentMethod && <span>· {entry.paymentMethod.name}</span>}
                          {entry.user && <span>· {entry.user.name}</span>}
                          {entry.sale && <span>· Venta #{entry.sale.id}</span>}
                        </div>
                      </div>
                    </div>
                    <span className={`shrink-0 text-sm font-bold ${
                      entry.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {entry.type === 'INCOME' ? '+' : '-'}{formatCurrency(entry.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {entryHasMore && (
              <div className="border-t border-slate-700 px-4 py-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  className="border-slate-600 text-slate-300"
                >
                  Cargar más ({entryTotal - entries.length} restantes)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cash Entry Dialog */}
      <Dialog open={cashDialogOpen} onOpenChange={(o) => { setCashDialogOpen(o); if (!o) { setCashAmount(''); setCashDesc(''); }}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {cashType === 'INCOME' ? '💰 Registrar Ingreso' : '💸 Registrar Egreso'}
            </DialogTitle>
            <DialogDescription>
              Agrega o retira dinero de la caja fuerte
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCashSubmit}>
            <div className="space-y-4 py-4">
              {/* Type selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={cashType === 'INCOME' ? 'default' : 'outline'}
                  onClick={() => setCashType('INCOME')}
                  className={cashType === 'INCOME' ? 'bg-emerald-600 flex-1' : 'border-slate-600 text-slate-300 flex-1'}
                >
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  Ingreso
                </Button>
                <Button
                  type="button"
                  variant={cashType === 'EXPENSE' ? 'default' : 'outline'}
                  onClick={() => setCashType('EXPENSE')}
                  className={cashType === 'EXPENSE' ? 'bg-red-600 flex-1' : 'border-slate-600 text-slate-300 flex-1'}
                >
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Egreso
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cash-amount">Monto</Label>
                <Input
                  id="cash-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="border-slate-600 bg-slate-800 text-slate-200 text-lg font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cash-desc">Descripción</Label>
                <Input
                  id="cash-desc"
                  value={cashDesc}
                  onChange={(e) => setCashDesc(e.target.value)}
                  placeholder={cashType === 'INCOME' ? 'Ej: Venta de mostrador' : 'Ej: Compra de mercancía'}
                  className="border-slate-600 bg-slate-800 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select value={cashPaymentMethod} onValueChange={setCashPaymentMethod}>
                  <SelectTrigger className="border-slate-600 bg-slate-800 text-slate-200">
                    <SelectValue placeholder="Seleccionar (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ninguno</SelectItem>
                    {paymentMethods.map((pm) => (
                      <SelectItem key={pm.id} value={String(pm.id)}>{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" type="button" disabled={cashLoading}>Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={cashLoading || !cashAmount}>
                {cashLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Registrando...
                  </span>
                ) : (
                  cashType === 'INCOME' ? '✅ Registrar ingreso' : '✅ Registrar egreso'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
