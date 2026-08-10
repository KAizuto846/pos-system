'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Calendar,
  Plus, ArrowUpFromLine, ArrowDownToLine, History, RefreshCw,
  Loader2, Search, Package, Filter, Clock, Landmark,
  ArrowRightLeft, Download, Upload, RotateCcw, ListChecks
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { FinanceVerifier } from '@/components/FinanceVerifier';

interface FinanceSummary {
  period: { from: string; to: string };
  sales: {
    count: number; revenue: number; totalCost: number;
    profit: number; profitMargin: string;
    availableProfit: number; combinedAvailable: number;
    grossProfit: number;
    refunded: {
      count: number;
      amount: number;
      cost: number;
    };
    withdrawn: {
      total: number;
      profitOnly: number;
      profitFromCombined: number;
      costFromCombined: number;
    };
  };
  cash: {
    balance: number;
    incomeByCategory: Record<string, number>;
    expenseByCategory: Record<string, number>;
    incomeTotal: number; expenseTotal: number;
  };
  byPaymentMethod: {
    id: number;
    name: string;
    affectsCash: boolean;
    sales: { count: number; revenue: number; totalCost: number; profit: number };
    available: number;
  }[];
}

interface CashEntry {
  id: number; type: string; category: string;
  amount: number; description: string; recordedAt: string;
  paymentMethod?: { name: string } | null;
  user?: { name: string } | null;
  sale?: { id: number; total: number } | null;
}

interface ProductBreakdown {
  id: number; name: string; barcode: string;
  publicPrice: number; costPrice: number;
  profit: number; margin: string;
  stock: number; minStock: number;
  department: string | null; supplier: string | null;
}

interface PaymentMethod { id: number; name: string; affectsCash?: boolean; }

const CATEGORY_LABELS: Record<string, string> = {
  sales: 'Ventas POS',
  manual_deposit: 'Depósito manual',
  profit_withdrawal: 'Retiro de ganancias',
  profit_cost_withdrawal: 'Retiro (ganancias + costos)',
  operating_expense: 'Gasto operativo',
  purchase: 'Compra mercancía',
  extra_purchase: 'Extras de pedido',
  transfer: 'Transferencia',
  refund: 'Reembolso',
  other: 'Otro',
};

const CATEGORY_ICONS: Record<string, string> = {
  sales: '🛒',
  manual_deposit: '💰',
  profit_withdrawal: '💵',
  profit_cost_withdrawal: '💳',
  operating_expense: '📋',
  purchase: '📦',
  extra_purchase: '➕',
  transfer: '🔄',
  refund: '↩️',
  other: '❓',
};

export default function FinancePage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [products, setProducts] = useState<ProductBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [tab, setTab] = useState('resumen');
  const [entryPage, setEntryPage] = useState(1);
  const [entryHasMore, setEntryHasMore] = useState(false);
  const [entryTotal, setEntryTotal] = useState(0);
  const [entryFilter, setEntryFilter] = useState('all');

  // Product breakdown
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productHasMore, setProductHasMore] = useState(false);
  const [productTotal, setProductTotal] = useState(0);
  const [productLoading, setProductLoading] = useState(false);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [productDeptFilter, setProductDeptFilter] = useState('all');
  const [productSupplierFilter, setProductSupplierFilter] = useState('all');
  const [productActiveFilter, setProductActiveFilter] = useState('all');
  const [productPriceMin, setProductPriceMin] = useState('');
  const [productPriceMax, setProductPriceMax] = useState('');
  const [productCostMin, setProductCostMin] = useState('');
  const [productCostMax, setProductCostMax] = useState('');
  const [productStockMin, setProductStockMin] = useState('');
  const [productStockMax, setProductStockMax] = useState('');
  const [productMinStockMin, setProductMinStockMin] = useState('');
  const [productMinStockMax, setProductMinStockMax] = useState('');

  // Cash dialog
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashType, setCashType] = useState('INCOME');
  const [cashCategory, setCashCategory] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [cashPaymentMethod, setCashPaymentMethod] = useState('');
  const [cashRecordedAt, setCashRecordedAt] = useState('');
  const [cashRecordedTime, setCashRecordedTime] = useState('');
  const [cashLoading, setCashLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // CSV export/import + reset
  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Verificador paso a paso
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [lastVerified, setLastVerified] = useState<{ at: string; userName: string } | null>(null);

  const buildDateFilter = useCallback(() => {
    let from = dateFrom;
    let to = dateTo;
    if (from && timeFrom) from = `${from}T${timeFrom}:00`;
    if (to && timeTo) to = `${to}T${timeTo}:00`;
    return { from: from || undefined, to: to || undefined };
  }, [dateFrom, dateTo, timeFrom, timeTo]);

  const fetchSummary = useCallback(async () => {
    const { from, to } = buildDateFilter();
    const params = new URLSearchParams({ action: 'summary' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const res = await fetch(`/api/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data);
    }
  }, [buildDateFilter]);

  const fetchEntries = useCallback(async (page = 1, append = false) => {
    await Promise.resolve();
    const { from, to } = buildDateFilter();
    const params = new URLSearchParams({
      action: 'cash-entries', page: String(page), limit: '30'
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (entryFilter && entryFilter !== 'all') params.set('type', entryFilter);

    const res = await fetch(`/api/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(prev => append ? [...prev, ...data.entries] : data.entries);
      setEntryHasMore(data.pagination.hasMore);
      setEntryTotal(data.pagination.total);
      setEntryPage(page);
    }
  }, [buildDateFilter, entryFilter]);

  const fetchProducts = useCallback(async (page = 1, append = false, signal?: AbortSignal) => {
    setProductLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'product-breakdown', page: String(page), limit: '50'
      });
      if (productSearch) params.set('q', productSearch);
      if (productDeptFilter && productDeptFilter !== 'all') params.set('departmentId', productDeptFilter);
      if (productSupplierFilter && productSupplierFilter !== 'all') params.set('supplierId', productSupplierFilter);
      if (productActiveFilter && productActiveFilter !== 'all') params.set('active', productActiveFilter);
      if (productPriceMin) params.set('priceMin', productPriceMin);
      if (productPriceMax) params.set('priceMax', productPriceMax);
      if (productCostMin) params.set('costMin', productCostMin);
      if (productCostMax) params.set('costMax', productCostMax);
      if (productStockMin) params.set('stockMin', productStockMin);
      if (productStockMax) params.set('stockMax', productStockMax);
      if (productMinStockMin) params.set('minStockMin', productMinStockMin);
      if (productMinStockMax) params.set('minStockMax', productMinStockMax);

      const res = await fetch(`/api/finance?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar productos');
      const data = await res.json();
      setProducts(prev => append ? [...prev, ...data.products] : data.products);
      setProductHasMore(data.pagination.hasMore);
      setProductTotal(data.pagination.total);
      setProductPage(page);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Error al cargar productos');
      }
    } finally {
      if (!signal?.aborted) setProductLoading(false);
    }
  }, [productSearch, productDeptFilter, productSupplierFilter, productActiveFilter,
      productPriceMin, productPriceMax, productCostMin, productCostMax,
      productStockMin, productStockMax, productMinStockMin, productMinStockMax]);

  useEffect(() => {
    Promise.all([
      fetch('/api/payment-methods').then(r => r.json()).then((data: PaymentMethod[]) => {
        if (Array.isArray(data)) setPaymentMethods(data);
      }),
      fetch('/api/departments').then(r => r.json()).then((data: { id: number; name: string }[]) => {
        if (Array.isArray(data)) setDepartments(data.filter(d => d));
      }),
      fetch('/api/suppliers').then(r => r.json()).then((data: { id: number; name: string }[]) => {
        if (Array.isArray(data)) setSuppliers(data.filter(d => d));
      }),
      fetch('/api/finance/verify').then(r => r.json()).then((data: { verified: { at: string; userName: string } | null }) => {
        if (data?.verified && typeof data.verified.at === 'string') setLastVerified(data.verified);
      }).catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      const requests: Promise<void>[] = [fetchSummary()];
      if (tab === 'historial') requests.push(fetchEntries(1, false));
      await Promise.all(requests).catch(() => {});
      if (active) setLoading(false);
    };
    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, timeFrom, timeTo, tab]);

  useEffect(() => {
    if (tab !== 'historial') return;
    const timer = setTimeout(() => fetchEntries(1, false), 0);
    return () => clearTimeout(timer);
    // The date and tab changes are loaded by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryFilter]);

  useEffect(() => {
    if (tab !== 'productos') return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setProducts([]);
      setProductPage(1);
      fetchProducts(1, false, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch, productDeptFilter, productSupplierFilter, productActiveFilter,
      productPriceMin, productPriceMax, productCostMin, productCostMax,
      productStockMin, productStockMax, productMinStockMin, productMinStockMax, tab]);

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([
      fetchSummary(),
      tab === 'historial' ? fetchEntries(1, false) : Promise.resolve(),
      tab === 'productos' ? fetchProducts(productPage, false) : Promise.resolve(),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  const handleCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashLoading(true);
    try {
      let recordedAt: string | undefined;
      if (cashRecordedAt) {
        recordedAt = cashRecordedAt;
        if (cashRecordedTime) recordedAt += `T${cashRecordedTime}:00`;
        else recordedAt += 'T12:00:00';
      }

      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: cashType,
          category: cashCategory,
          amount: parseFloat(cashAmount),
          description: cashDesc,
          paymentMethodId: cashPaymentMethod === '__none__' || !cashPaymentMethod ? undefined : cashPaymentMethod,
          recordedAt,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al registrar');
      }

      toast.success(
        cashType === 'INCOME' ? '💰 Ingreso registrado' :
        cashType === 'EXPENSE' ? '💸 Egreso registrado' : '🔄 Transferencia registrada'
      );
      setCashDialogOpen(false);
      setCashAmount('');
      setCashDesc('');
      setCashCategory('');
      setCashRecordedAt('');
      setCashRecordedTime('');
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setCashLoading(false);
    }
  };

  const openCashDialog = (type: string) => {
    setCashType(type);
    setCashCategory(type === 'EXPENSE' ? 'profit_withdrawal' : 'manual_deposit');
    setCashDialogOpen(true);
  };

  const refreshAll = () => {
    setLoading(true);
    Promise.all([
      fetchSummary(),
      tab === 'historial' ? fetchEntries(1, false) : Promise.resolve(),
      tab === 'productos' ? fetchProducts(productPage, false) : Promise.resolve(),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch('/api/finance/csv');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al exportar CSV');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'finanzas.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado');
    } catch {
      toast.error('Error al exportar CSV');
    }
  };

  const handleImportCsv = async () => {
    if (!importCsv.trim()) {
      toast.error('Pega o carga un archivo CSV primero');
      return;
    }
    setImportLoading(true);
    try {
      const res = await fetch('/api/finance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsv }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al importar CSV');
        return;
      }
      toast.success(data.message);
      if (data.errors && data.errors.length > 0) {
        const preview = data.errors.slice(0, 3).map((e: { row: number; reason: string }) => `#${e.row}: ${e.reason}`).join(' · ');
        toast.error(`Filas con error: ${preview}${data.errors.length > 3 ? ' …' : ''}`);
      }
      setImportOpen(false);
      setImportCsv('');
      refreshAll();
    } catch {
      toast.error('Error al importar CSV');
    } finally {
      setImportLoading(false);
    }
  };

  const handleResetFinance = async () => {
    if (!resetPassword) {
      toast.error('Ingresa la contraseña de administrador');
      return;
    }
    if (!window.confirm(
      '¿Reiniciar las finanzas? Se eliminarán TODAS las ventas, reembolsos y registros de caja (ingresos, egresos y transferencias). Los productos, lotes y stock no se tocan. Esta acción no se puede deshacer.'
    )) return;
    setResetLoading(true);
    try {
      const res = await fetch('/api/finance/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al reiniciar finanzas');
        return;
      }
      toast.success(data.message);
      setResetOpen(false);
      setResetPassword('');
      refreshAll();
    } catch {
      toast.error('Error al reiniciar finanzas');
    } finally {
      setResetLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Landmark className="h-16 w-16 mb-4 text-slate-600" />
        <h2 className="text-xl font-semibold text-slate-400 mb-2">Acceso Restringido</h2>
        <p className="text-sm">Solo los administradores pueden acceder a Finanzas.</p>
      </div>
    );
  }

  const CATEGORY_OPTIONS = {
    INCOME: [
      { value: 'manual_deposit', label: '💰 Depósito manual' },
      { value: 'other', label: '❓ Otro ingreso' },
    ],
    EXPENSE: [
      { value: 'profit_withdrawal', label: '💵 Retiro de ganancias' },
      { value: 'profit_cost_withdrawal', label: '💳 Retiro (ganancias + costos)' },
      { value: 'operating_expense', label: '📋 Gasto operativo' },
      { value: 'purchase', label: '📦 Compra mercancía' },
      { value: 'other', label: '❓ Otro' },
    ],
    TRANSFER: [
      { value: 'transfer', label: '🔄 Transferencia' },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">💰 Finanzas</h2>
          <p className="text-sm text-slate-400 mt-1">Control de caja, ventas, ganancias y desglose de productos</p>
        </div>
        <div className="flex-col flex gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setVerifyOpen(true)}
                disabled={!summary || loading}
                title="Revisar los cálculos de finanzas paso a paso"
              >
                <ListChecks className="mr-2 h-4 w-4" />
                Verificar
              </Button>
            )}
            <Button variant="outline" onClick={handleExportCsv} title="Exportar finanzas a CSV">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} title="Importar registros desde CSV">
              <Upload className="mr-2 h-4 w-4" />
              Importar
            </Button>
            <Button variant="outline" className="border-red-700/50 text-red-400 hover:bg-red-500/10" onClick={() => setResetOpen(true)} title="Reiniciar finanzas (requiere contraseña admin)">
              <RotateCcw className="mr-2 h-4 w-4" />
              Reiniciar
            </Button>
            <Button onClick={() => openCashDialog('INCOME')} className="bg-emerald-600 hover:bg-emerald-500">
              <ArrowUpFromLine className="mr-2 h-4 w-4" />
              Ingreso
            </Button>
            <Button onClick={() => openCashDialog('EXPENSE')} className="bg-red-600 hover:bg-red-500">
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Egreso
            </Button>
            <Button variant="outline" size="icon" onClick={refreshAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {lastVerified && (
            <p className="text-xs text-slate-500">
              Última verificación registrada: {new Date(lastVerified.at).toLocaleString()} · por {lastVerified.userName}
            </p>
          )}
        </div>
      </div>

      {/* Date + Time filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Desde</Label>
          <div className="flex gap-1">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-36 border-slate-600 bg-slate-800 text-slate-200" />
            <Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
              className="w-28 border-slate-600 bg-slate-800 text-slate-200" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Hasta</Label>
          <div className="flex gap-1">
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-36 border-slate-600 bg-slate-800 text-slate-200" />
            <Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)}
              className="w-28 border-slate-600 bg-slate-800 text-slate-200" />
          </div>
        </div>
        <Clock className="h-4 w-4 text-slate-500 mb-2" />
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
              {summary ? `${summary.sales.count} transacciones` : ''}
              {summary && summary.sales.refunded?.amount > 0 && (
                <span className="ml-2 text-red-400">
                  (Reembolsado: {formatCurrency(summary.sales.refunded.amount)})
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Ganancia Neta</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {summary ? formatCurrency(summary.sales.profit) : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Margen: {summary ? `${summary.sales.profitMargin}%` : '—'}
              {summary && summary.sales.withdrawn?.total > 0 && (
                <span className="ml-2 text-amber-400">
                  (Retirado: {formatCurrency(summary.sales.withdrawn.total)})
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Costo Total</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {summary ? formatCurrency(summary.sales.totalCost) : '—'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Costo de productos vendidos</p>
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
            <div className="flex gap-3 text-xs text-slate-500 mt-1">
              <span className="text-emerald-400">+{formatCurrency(summary?.cash.incomeTotal || 0)}</span>
              <span className="text-red-400">-{formatCurrency(summary?.cash.expenseTotal || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment method breakdown */}
      {summary && summary.byPaymentMethod && summary.byPaymentMethod.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-400" />
            Apartados por método de pago
            <span className="text-xs font-normal text-slate-500">
              (cada método con sus ventas, costo, ganancia y disponible)
            </span>
          </h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summary.byPaymentMethod.map((pm) => (
              <Card key={pm.id} className="border-slate-700 bg-slate-800/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-200">
                    <span>{pm.name}</span>
                    {pm.affectsCash ? (
                      <Badge variant="outline" className="text-[10px] border-amber-600 text-amber-400">Afecta caja</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">No afecta caja</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Ventas</span>
                    <span className="font-semibold text-slate-100">{formatCurrency(pm.sales.revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Costo total</span>
                    <span className="font-semibold text-red-400">{formatCurrency(pm.sales.totalCost)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Ganancia neta</span>
                    <span className="font-semibold text-emerald-400">{formatCurrency(pm.sales.profit)}</span>
                  </div>
                  <Separator className="bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Disponible</span>
                    <span className={`font-bold ${pm.available >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {formatCurrency(pm.available)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {pm.sales.count} ventas · disponible = ingresos − egresos de este método
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="resumen" className="data-[state=active]:bg-slate-700">📊 Resumen</TabsTrigger>
          <TabsTrigger value="historial" className="data-[state=active]:bg-slate-700">📜 Historial</TabsTrigger>
          <TabsTrigger value="productos" className="data-[state=active]:bg-slate-700">📦 Desgloce Productos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          {summary && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Cash Flow */}
              <Card className="border-slate-700 bg-slate-800/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-slate-200">Flujo de Caja</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ingresos</p>
                  {Object.entries(summary.cash.incomeByCategory).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm">
                        <span>{CATEGORY_ICONS[cat] || '💰'}</span>
                        <span className="text-slate-300">{CATEGORY_LABELS[cat] || cat}</span>
                      </span>
                      <span className="font-semibold text-emerald-400">+{formatCurrency(amt)}</span>
                    </div>
                  ))}
                  <Separator className="bg-slate-700" />
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Egresos</p>
                  {Object.entries(summary.cash.expenseByCategory).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm">
                        <span>{CATEGORY_ICONS[cat] || '💸'}</span>
                        <span className="text-slate-300">{CATEGORY_LABELS[cat] || cat}</span>
                      </span>
                      <span className="font-semibold text-red-400">-{formatCurrency(amt)}</span>
                    </div>
                  ))}
                  <Separator className="bg-slate-700" />
                  <div className="flex justify-between items-center pt-1">
                    <span className="flex items-center gap-2 text-sm text-amber-400">
                      <Wallet className="h-4 w-4" /> Balance
                    </span>
                    <span className={`font-bold text-lg ${summary.cash.balance >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {formatCurrency(summary.cash.balance)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Profitability */}
              <Card className="border-slate-700 bg-slate-800/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-slate-200">Rentabilidad</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Ingreso bruto por ventas</span>
                    <span className="font-semibold text-slate-100">{formatCurrency(summary.sales.revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Costo de productos</span>
                    <span className="font-semibold text-red-400">{formatCurrency(summary.sales.totalCost)}</span>
                  </div>
                  <Separator className="bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-200 font-medium">Ganancia bruta</span>
                    <span className="font-semibold text-emerald-400">{formatCurrency(summary.sales.grossProfit)}</span>
                  </div>
                  
                  {/* Withdrawals breakdown */}
                  {summary.sales.withdrawn?.total > 0 && (
                    <>
                      <Separator className="bg-slate-700" />
                      <p className="text-xs font-medium text-amber-400 uppercase tracking-wide">Retirado de caja</p>
                      {summary.sales.withdrawn.profitOnly > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1 text-sm text-slate-400">
                            💵 Solo ganancias
                          </span>
                          <span className="font-semibold text-amber-400">-{formatCurrency(summary.sales.withdrawn.profitOnly)}</span>
                        </div>
                      )}
                      {summary.sales.withdrawn.profitFromCombined > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1 text-sm text-slate-400">
                            💳 De ganancias (retiro mixto)
                          </span>
                          <span className="font-semibold text-amber-400">-{formatCurrency(summary.sales.withdrawn.profitFromCombined)}</span>
                        </div>
                      )}
                      {summary.sales.withdrawn.costFromCombined > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1 text-sm text-slate-400">
                            📦 De costos (retiro mixto)
                          </span>
                          <span className="font-semibold text-orange-400">-{formatCurrency(summary.sales.withdrawn.costFromCombined)}</span>
                        </div>
                      )}
                    </>
                  )}
                  
                  <Separator className="bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-200 font-medium">Ganancia neta (disponible)</span>
                    <span className="font-bold text-lg text-emerald-400">{formatCurrency(summary.sales.profit)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Margen sobre efectivo</span>
                    <Badge variant="default" className="bg-emerald-900/40 text-emerald-400">{summary.sales.profitMargin}%</Badge>
                  </div>
                  <Separator className="bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">💰 Ganancias disponibles para retiro</span>
                    <span className="font-semibold text-emerald-400">{formatCurrency(summary.sales.availableProfit)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">💳 Ganancias + Costos disponibles</span>
                    <span className="font-semibold text-amber-400">{formatCurrency(summary.sales.combinedAvailable)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Al retirar dinero, elige si lo sacas de <strong>ganancias</strong> o de <strong>ganancias + costos</strong>.
                    La ganancia neta se reduce automáticamente.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial">
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-slate-200">Movimientos de Caja</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={entryFilter} onValueChange={setEntryFilter}>
                    <SelectTrigger className="w-36 border-slate-600 bg-slate-800 text-slate-200 h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="INCOME">Ingresos</SelectItem>
                      <SelectItem value="EXPENSE">Egresos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {entries.length === 0 && !loading ? (
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
                          <p className="text-sm font-medium text-slate-200 truncate flex items-center gap-1">
                            {CATEGORY_ICONS[entry.category] || ''}
                            {entry.description || CATEGORY_LABELS[entry.category] || (entry.type === 'INCOME' ? 'Ingreso' : 'Egreso')}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{new Date(entry.recordedAt).toLocaleString('es-MX')}</span>
                            {entry.paymentMethod && <span>· {entry.paymentMethod.name}</span>}
                            {entry.user && <span>· {entry.user.name}</span>}
                            {entry.sale && <span>· Venta #{entry.sale.id}</span>}
                            <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                              {CATEGORY_LABELS[entry.category] || entry.category}
                            </Badge>
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
              {entryHasMore && (
                <div className="border-t border-slate-700 px-4 py-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => fetchEntries(entryPage + 1, true)}
                    className="border-slate-600 text-slate-300">
                    Cargar más ({entryTotal - entries.length} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productos">
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-slate-200">
                  Desgloce de Productos
                  <span className="ml-2 text-xs font-normal text-slate-500">({productTotal} productos)</span>
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <Input placeholder="Buscar..." value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-44 pl-8 h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                </div>
              </div>
              {/* Filters: depto, proveedor, estado, precio, costo, stock, stock minimo */}
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                <Select value={productDeptFilter} onValueChange={setProductDeptFilter}>
                  <SelectTrigger className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200">
                    <SelectValue placeholder="Depto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los deptos.</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={productSupplierFilter} onValueChange={setProductSupplierFilter}>
                  <SelectTrigger className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200">
                    <SelectValue placeholder="Proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los prov.</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={productActiveFilter} onValueChange={setProductActiveFilter}>
                  <SelectTrigger className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Activos e inactivos</SelectItem>
                    <SelectItem value="true">Solo activos</SelectItem>
                    <SelectItem value="false">Solo inactivos</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Input type="number" placeholder="Precio mín" value={productPriceMin}
                    onChange={e => setProductPriceMin(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                  <Input type="number" placeholder="máx" value={productPriceMax}
                    onChange={e => setProductPriceMax(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                </div>
                <div className="flex items-center gap-1">
                  <Input type="number" placeholder="Costo mín" value={productCostMin}
                    onChange={e => setProductCostMin(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                  <Input type="number" placeholder="máx" value={productCostMax}
                    onChange={e => setProductCostMax(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                </div>
                <div className="flex items-center gap-1">
                  <Input type="number" placeholder="Stock mín" value={productStockMin}
                    onChange={e => setProductStockMin(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                  <Input type="number" placeholder="máx" value={productStockMax}
                    onChange={e => setProductStockMax(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                </div>
                <div className="flex items-center gap-1">
                  <Input type="number" placeholder="MinStock mín" value={productMinStockMin}
                    onChange={e => setProductMinStockMin(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                  <Input type="number" placeholder="máx" value={productMinStockMax}
                    onChange={e => setProductMinStockMax(e.target.value)} className="h-8 text-xs border-slate-600 bg-slate-800 text-slate-200" />
                </div>
                <Button variant="outline" size="sm"
                  onClick={() => {
                    setProductDeptFilter('all'); setProductSupplierFilter('all'); setProductActiveFilter('all');
                    setProductPriceMin(''); setProductPriceMax(''); setProductCostMin(''); setProductCostMax('');
                    setProductStockMin(''); setProductStockMax(''); setProductMinStockMin(''); setProductMinStockMax('');
                    setProductSearch('');
                  }}
                  className="h-8 border-slate-600 text-slate-300 text-xs">
                  Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {productLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                </div>
              ) : products.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <Package className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">No hay productos</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800/80">
                        <th className="px-4 py-2.5 text-xs font-medium text-slate-400">Producto</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Precio Público</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Costo Prov.</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Ganancia</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Margen</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Stock</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Stock mín.</th>
                        <th className="px-3 py-2.5 text-xs font-medium text-slate-400">Depto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {products.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-700/30">
                          <td className="px-4 py-2.5">
                            <p className="text-slate-200 font-medium truncate max-w-[250px]">{p.name}</p>
                            {p.barcode && <p className="text-[10px] text-slate-500 font-mono">{p.barcode}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-200 font-mono">{formatCurrency(p.publicPrice)}</td>
                          <td className="px-3 py-2.5 text-red-400 font-mono">{formatCurrency(p.costPrice)}</td>
                          <td className={`px-3 py-2.5 font-mono font-semibold ${p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(p.profit)}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={parseFloat(p.margin) >= 20 ? 'default' : 'secondary'}
                              className={parseFloat(p.margin) >= 20 ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}>
                              {p.margin}%
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={p.stock <= 0 ? 'destructive' : 'outline'}
                              className={p.stock > 0 ? 'border-slate-600 text-slate-300' : ''}>
                              {p.stock}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={p.stock <= p.minStock ? 'destructive' : 'outline'}
                              className={p.stock > p.minStock ? 'border-slate-600 text-slate-300' : ''}>
                              {p.minStock}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-400">{p.department || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {productHasMore && (
                <div className="border-t border-slate-700 px-4 py-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => fetchProducts(productPage + 1, true)}
                    className="border-slate-600 text-slate-300">
                    Cargar más ({productTotal - products.length} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cash Entry Dialog */}
      <Dialog open={cashDialogOpen} onOpenChange={(o) => {
        setCashDialogOpen(o);
        if (!o) { setCashAmount(''); setCashDesc(''); setCashCategory(''); setCashRecordedAt(''); setCashRecordedTime(''); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {cashType === 'INCOME' ? '💰 Registrar Ingreso' :
               cashType === 'EXPENSE' ? '💸 Registrar Egreso' : '🔄 Registrar Transferencia'}
            </DialogTitle>
            <DialogDescription>
              {cashType === 'EXPENSE'
                ? 'Selecciona de dónde retirar el dinero'
                : 'Registra un movimiento en la caja fuerte'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCashSubmit}>
            <div className="space-y-4 py-4">
              {/* Type selector */}
              <div className="flex gap-2">
                <Button type="button" variant={cashType === 'INCOME' ? 'default' : 'outline'}
                  onClick={() => { setCashType('INCOME'); setCashCategory('manual_deposit'); }}
                  className={cashType === 'INCOME' ? 'bg-emerald-600 flex-1' : 'border-slate-600 text-slate-300 flex-1'}>
                  <ArrowUpFromLine className="mr-2 h-4 w-4" /> Ingreso
                </Button>
                <Button type="button" variant={cashType === 'EXPENSE' ? 'default' : 'outline'}
                  onClick={() => { setCashType('EXPENSE'); setCashCategory('profit_withdrawal'); }}
                  className={cashType === 'EXPENSE' ? 'bg-red-600 flex-1' : 'border-slate-600 text-slate-300 flex-1'}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" /> Egreso
                </Button>
              </div>

              {/* Category (for expenses) */}
              {(cashType === 'EXPENSE' || cashType === 'INCOME') && (
                <div className="space-y-2">
                  <Label>Categoría / Fuente</Label>
                  <Select value={cashCategory} onValueChange={setCashCategory}>
                    <SelectTrigger className="border-slate-600 bg-slate-800 text-slate-200">
                      <SelectValue placeholder="Selecciona categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {(CATEGORY_OPTIONS[cashType as keyof typeof CATEGORY_OPTIONS] || []).map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cashType === 'EXPENSE' && cashCategory === 'profit_withdrawal' && (
                    <p className="text-xs text-emerald-400">
                      💡 Retirarás SOLO de las ganancias acumuladas (precio - costo).
                      Disponible: {summary ? formatCurrency(summary.sales.availableProfit) : '—'}
                    </p>
                  )}
                  {cashType === 'EXPENSE' && cashCategory === 'profit_cost_withdrawal' && (
                    <p className="text-xs text-amber-400">
                      💡 Retirarás de ganancias + costos (el total de ventas).
                      Disponible: {summary ? formatCurrency(summary.sales.combinedAvailable) : '—'}
                    </p>
                  )}
                </div>
              )}

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="cash-amount">Monto</Label>
                <Input id="cash-amount" type="number" step="0.01" min="0.01"
                  value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                  placeholder="0.00" required
                  className="border-slate-600 bg-slate-800 text-slate-200 text-lg font-bold" />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="cash-desc">Descripción</Label>
                <Input id="cash-desc" value={cashDesc} onChange={e => setCashDesc(e.target.value)}
                  placeholder={cashType === 'INCOME' ? 'Ej: Depósito semanal' : 'Ej: Retiro para proveedor'}
                  className="border-slate-600 bg-slate-800 text-slate-200" />
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Método de pago
                  {cashType === 'EXPENSE' && <span className="text-red-400">*</span>}
                </Label>
                <Select
                  value={cashPaymentMethod}
                  onValueChange={(v) => {
                    setCashPaymentMethod(v);
                    // Si se retira de un metodo que NO afecta caja, la categoria
                    // solo puede ser un retiro mixto (ganancias + costos) del apartado.
                    if (cashType === 'EXPENSE' && v !== '__none__' && v) {
                      const pm = paymentMethods.find(p => String(p.id) === v);
                      if (pm && pm.affectsCash === false && cashCategory === 'profit_withdrawal') {
                        setCashCategory('profit_cost_withdrawal');
                      }
                    }
                  }}
                >
                  <SelectTrigger className="border-slate-600 bg-slate-800 text-slate-200">
                    <SelectValue placeholder={cashType === 'EXPENSE' ? 'Selecciona de dónde sale el dinero' : 'Seleccionar (opcional)'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Caja general (sin método)</SelectItem>
                    {paymentMethods.map(pm => (
                      <SelectItem key={pm.id} value={String(pm.id)}>
                        {pm.name}{pm.affectsCash === false ? ' (no afecta caja)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cashType === 'EXPENSE' && !cashPaymentMethod && (
                  <p className="text-xs text-amber-400">Selecciona de qué método de pago sale el egreso.</p>
                )}
              </div>

              {/* Date/Time */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Fecha y hora (opcional)
                </Label>
                <div className="flex gap-2">
                  <Input type="date" value={cashRecordedAt} onChange={e => setCashRecordedAt(e.target.value)}
                    className="flex-1 border-slate-600 bg-slate-800 text-slate-200" />
                  <Input type="time" value={cashRecordedTime} onChange={e => setCashRecordedTime(e.target.value)}
                    className="w-28 border-slate-600 bg-slate-800 text-slate-200" />
                </div>
                <p className="text-xs text-slate-500">Si no seleccionas, se usará la fecha/hora actual</p>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" type="button" disabled={cashLoading}>Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={cashLoading || !cashAmount || !cashCategory}>
                {cashLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Registrando...
                  </span>
                ) : (
                  cashType === 'INCOME' ? '✅ Registrar ingreso' :
                  cashType === 'EXPENSE' ? '✅ Registrar egreso' : '✅ Registrar'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={importOpen} onOpenChange={o => { setImportOpen(o); if (!o) setImportCsv(''); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              Columnas: tipo, categoria, monto, descripcion, metodo_pago, usuario, fecha.
              El CSV puede traer o no la fila de encabezado (tipo, categoria, monto...).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportCsv(await file.text());
                e.target.value = '';
              }}
              className="border-slate-600 bg-slate-800 text-slate-200"
            />
            <Label className="text-xs text-slate-500">O pega el contenido del CSV:</Label>
            <textarea
              value={importCsv}
              onChange={e => setImportCsv(e.target.value)}
              placeholder={'tipo,categoria,monto,descripcion,metodo_pago,usuario,fecha\nEXPENSE,purchase,150,Compra mercancía,Caja,,\nINCOME,manual_deposit,50,Depósito,,\n'}
              rows={8}
              className="w-full rounded-md border border-slate-600 bg-slate-800 p-3 text-xs text-slate-200 font-mono outline-none focus:border-slate-400"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={importLoading}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handleImportCsv} disabled={importLoading || !importCsv.trim()}>
              {importLoading ? 'Importando...' : 'Importar CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Finance Dialog */}
      <Dialog open={resetOpen} onOpenChange={o => { setResetOpen(o); if (!o) setResetPassword(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reiniciar Finanzas</DialogTitle>
            <DialogDescription>
              Se eliminarán TODAS las ventas, reembolsos y registros de caja (ingresos, egresos y transferencias).
              Esta acción requiere la contraseña de un administrador y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">Contraseña de administrador</Label>
            <Input
              id="reset-password"
              type="password"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              placeholder="••••••••"
              className="border-slate-600 bg-slate-800 text-slate-200"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={resetLoading}>Cancelar</Button>
            </DialogClose>
            <Button className="bg-red-600 hover:bg-red-500" onClick={handleResetFinance} disabled={resetLoading || !resetPassword}>
              {resetLoading ? 'Reiniciando...' : 'Reiniciar finanzas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finance Verifier Dialog */}
      <FinanceVerifier
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        summary={summary}
        userName={session?.user?.name || ''}
        onVerified={(info) => setLastVerified(info)}
      />
    </div>
  );
}
