'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart3, DollarSign, ShoppingCart, TrendingUp, Calendar,
  RefreshCw, Play, User, Clock, ArrowUpDown, Eye, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardHeader, CardTitle, CardContent,
} from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

interface ShiftReport {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalAmount: number;
  totalCost: number;
  totalRefunds: number;
  refundAmount: number;
  netAmount: number;
  byPaymentMethod: string;
  details: string;
  notes: string;
  createdAt: string;
  user: {
    id: number;
    name: string;
    username: string;
  };
}

interface UserOption {
  id: number;
  name: string;
  username: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function parsePaymentMethods(json: string): Record<string, { count: number; total: number }> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

interface ReportDetails {
  products: Array<{
    productId: number;
    name: string;
    barcode: string;
    quantity: number;
    price: number;
    cost: number;
  }>;
  entries: Array<{
    type: string;
    category: string;
    amount: number;
    description: string;
    paymentMethod: string | null;
    recordedAt: string;
  }>;
  refunds: Array<{
    amount: number;
    quantity: number;
    reason: string;
    productName: string | null;
    saleId: number;
    createdAt: string;
  }>;
}

function parseDetails(json: string): ReportDetails {
  try {
    return JSON.parse(json);
  } catch {
    return { products: [], entries: [], refunds: [] };
  }
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0];
    setDateFrom(t);
    setDateTo(t);
  }, []);

  // Users list for admin filter
  const [users, setUsers] = useState<UserOption[]>([]);

  // Fetch users (for admin filter)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUsers(data.filter((u: UserOption) => u.id));
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (isAdmin && selectedUserId) params.set('userId', selectedUserId);

      const res = await fetch(`/api/shift-reports?${params.toString()}`);
      const data = await res.json();

      if (data && Array.isArray(data.reports)) {
        setReports(data.reports);
        setTotalCount(data.totalCount ?? data.reports.length);
      }
    } catch {
      toast.error('Error al cargar reportes');
    }
    setLoading(false);
  }, [dateFrom, dateTo, selectedUserId, isAdmin]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Compute stats
  const totalShifts = reports.length;
  const totalSalesCount = reports.reduce((sum, r) => sum + r.totalSales, 0);
  const totalAmountSum = reports.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalRefundsSum = reports.reduce((sum, r) => sum + r.refundAmount, 0);
  const totalNetSum = reports.reduce((sum, r) => sum + r.netAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-fg">
            {isAdmin ? 'Reportes de Turno' : 'Mis Turnos'}
          </h2>
          <p className="text-sm text-fg-muted mt-1">
            {isAdmin
              ? 'Resumen de turnos de todos los cajeros'
              : 'Consulta y gestiona tus turnos de trabajo'}
          </p>
        </div>
        <Button
          onClick={() => {
            // Start a new shift by creating a shift report for today
            const now = new Date();
            const startStr = now.toISOString().split('T')[0];
            const endStr = now.toISOString().split('T')[0];

            fetch('/api/shift-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                startDate: startStr,
                endDate: endStr,
              }),
            })
              .then(async (res) => {
                if (res.ok) {
                  toast.success('Turno guardado/actualizado correctamente');
                  fetchReports();
                } else {
                  const err = await res.json();
                  toast.error(err.error || 'Error al iniciar turno');
                }
              })
              .catch(() => toast.error('Error al iniciar turno'));
          }}
          className="bg-brand-strong hover:bg-brand-strong text-white gap-2"
        >
          <Play className="h-4 w-4" />
          Nuevo Turno
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-line bg-surface-2">
        <CardHeader>
          <CardTitle className="text-fg flex items-center gap-2">
            <Calendar className="h-4 w-4 text-fg-muted" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="date-from">Desde</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-to">Hasta</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-44"
              />
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="user-filter">Cajero</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger id="user-filter" className="w-44">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={fetchReports} disabled={loading} variant="outline" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando...' : 'Actualizar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-line bg-surface-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-fg-muted">
              {isAdmin ? 'Total Turnos' : 'Mis Turnos'}
            </CardTitle>
            <div className="rounded-lg bg-blue-600/10 p-2">
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16 bg-line" />
            ) : (
              <div className="text-2xl font-bold text-fg">{totalShifts}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-line bg-surface-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-fg-muted">Ventas Totales</CardTitle>
            <div className="rounded-lg bg-amber-600/10 p-2">
              <ShoppingCart className="h-4 w-4 text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16 bg-line" />
            ) : (
              <div className="text-2xl font-bold text-fg">{totalSalesCount}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-line bg-surface-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-fg-muted">Monto Total</CardTitle>
            <div className="rounded-lg bg-brand-strong/10 p-2">
              <DollarSign className="h-4 w-4 text-brand" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16 bg-line" />
            ) : (
              <div className="text-2xl font-bold text-fg">
                {formatCurrency(totalAmountSum)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-line bg-surface-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-fg-muted">Neto Total</CardTitle>
            <div className="rounded-lg bg-purple-600/10 p-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16 bg-line" />
            ) : (
              <div className="text-2xl font-bold text-fg">
                {formatCurrency(totalNetSum)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reports Table */}
      <Card className="border-line bg-surface-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-fg">
            {isAdmin ? 'Todos los Turnos' : 'Mis Turnos'}
            {!loading && (
              <span className="text-sm font-normal text-fg-muted ml-2">
                ({totalCount} registros)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-line" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="mx-auto h-12 w-12 text-line-strong mb-4" />
              <p className="text-fg-muted">No hay reportes de turno en este período</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>Cajero</TableHead>}
                  <TableHead>Fecha Inicio</TableHead>
                  <TableHead>Fecha Fin</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Devoluciones</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead>Formas de Pago</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => {
                  const pms = parsePaymentMethods(report.byPaymentMethod);
                  const pmEntries = Object.entries(pms);
                  return (
                    <TableRow
                      key={report.id}
                      className="cursor-pointer hover:bg-line/50"
                      onClick={() => setSelectedReport(report)}
                    >
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-fg-muted" />
                            <span className="text-fg font-medium">
                              {report.user?.name || report.user?.username || 'N/A'}
                            </span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-fg-muted">
                        {formatShortDate(report.startDate)}
                      </TableCell>
                      <TableCell className="text-fg-muted">
                        {formatShortDate(report.endDate)}
                      </TableCell>
                      <TableCell className="text-right text-fg font-medium">
                        {report.totalSales}
                      </TableCell>
                      <TableCell className="text-right text-fg">
                        {formatCurrency(report.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right text-red-400/80">
                        {formatCurrency(report.totalCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {report.totalRefunds > 0 ? (
                          <span className="text-red-400">
                            {report.totalRefunds} ({formatCurrency(report.refundAmount)})
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-brand font-medium">
                        {formatCurrency(report.netAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {pmEntries.length === 0 ? (
                            <span className="text-fg-subtle text-xs">—</span>
                          ) : (
                            pmEntries.slice(0, 2).map(([name, data]) => (
                              <Badge key={name} variant="outline" className="text-xs border-line-strong text-fg-muted">
                                {name}: {formatCurrency(data.total)}
                              </Badge>
                            ))
                          )}
                          {pmEntries.length > 2 && (
                            <Badge variant="outline" className="text-xs border-line-strong text-fg-muted">
                              +{pmEntries.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-fg-muted hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReport(report);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="bg-surface-2 border-line text-fg max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-fg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              Detalle del Turno
            </DialogTitle>
          </DialogHeader>

          {selectedReport && (() => {
            const details = parseDetails(selectedReport.details);
            const entriesIncome = details.entries.filter(e => e.type === 'INCOME');
            const entriesExpense = details.entries.filter(e => e.type === 'EXPENSE');
            return (
              <div className="space-y-4">
                {/* User info */}
                <div className="flex items-center gap-2 text-sm text-fg-muted border-b border-line pb-3 flex-wrap">
                  <User className="h-4 w-4 text-fg-muted" />
                  <span className="font-medium text-fg">
                    {selectedReport.user?.name || selectedReport.user?.username}
                  </span>
                  <span className="text-fg-subtle">|</span>
                  <Calendar className="h-4 w-4 text-fg-muted" />
                  <span>{formatDate(selectedReport.startDate)} — {formatDate(selectedReport.endDate)}</span>
                </div>

                {/* Summary grid */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide">Ventas</p>
                    <p className="text-xl font-bold text-fg mt-1">{selectedReport.totalSales}</p>
                  </div>
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide">Monto Total</p>
                    <p className="text-xl font-bold text-brand mt-1">
                      {formatCurrency(selectedReport.totalAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide">Costo Total</p>
                    <p className="text-xl font-bold text-red-400/80 mt-1">
                      {formatCurrency(selectedReport.totalCost)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide">Devoluciones</p>
                    <p className="text-xl font-bold text-red-400 mt-1">
                      {selectedReport.totalRefunds} ({formatCurrency(selectedReport.refundAmount)})
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide">Neto</p>
                    <p className="text-xl font-bold text-purple-400 mt-1">
                      {formatCurrency(selectedReport.netAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide">Ganancia Bruta</p>
                    <p className="text-xl font-bold text-brand mt-1">
                      {formatCurrency(selectedReport.totalAmount - selectedReport.totalCost)}
                    </p>
                  </div>
                </div>

                {/* Payment breakdown */}
                <div className="rounded-lg bg-surface/50 p-3 border border-line">
                  <p className="text-xs text-fg-muted uppercase tracking-wide mb-3">Desglose por Forma de Pago</p>
                  {Object.entries(parsePaymentMethods(selectedReport.byPaymentMethod)).length === 0 ? (
                    <p className="text-sm text-fg-subtle">Sin datos de pago</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(parsePaymentMethods(selectedReport.byPaymentMethod)).map(([name, data]) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-sm text-fg">{name}</span>
                          <div className="text-right">
                            <span className="text-sm text-fg-muted">{data.count} ventas</span>
                            <span className="text-sm text-brand ml-3">
                              {formatCurrency(data.total)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Products sold breakdown */}
                {details.products.length > 0 && (
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide mb-3">
                      Desglose de Productos Vendidos ({details.products.length})
                    </p>
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-surface-2/80">
                            <TableHead>Código</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-center">Cant.</TableHead>
                            <TableHead className="text-right">Precio</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.products.map(p => (
                            <TableRow key={p.productId}>
                              <TableCell className="font-mono text-xs text-fg-muted">{p.barcode || '—'}</TableCell>
                              <TableCell className="text-sm text-fg">{p.name}</TableCell>
                              <TableCell className="text-center text-fg-muted">{p.quantity}</TableCell>
                              <TableCell className="text-right text-fg-muted">{formatCurrency(p.price)}</TableCell>
                              <TableCell className="text-right text-brand">{formatCurrency(p.price * p.quantity)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Refunds breakdown */}
                {details.refunds.length > 0 && (
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide mb-3">
                      Desglose de Devoluciones ({details.refunds.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {details.refunds.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-fg">{r.productName || 'Producto eliminado'} <span className="text-fg-subtle">x{r.quantity}</span></span>
                          <div className="text-right">
                            {r.reason && <span className="text-xs text-fg-subtle block">{r.reason}</span>}
                            <span className="text-red-400">-{formatCurrency(r.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Income/Expense entries breakdown */}
                {(entriesIncome.length > 0 || entriesExpense.length > 0) && (
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide mb-3">
                      Movimientos de Caja ({entriesIncome.length} ingresos · {entriesExpense.length} egresos)
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {details.entries.map((e, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-fg">
                            {e.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                            <span className="text-fg-subtle"> · {e.category}</span>
                            {e.paymentMethod && <span className="text-fg-subtle"> · {e.paymentMethod}</span>}
                            {e.description && <span className="text-fg-subtle"> · {e.description}</span>}
                          </span>
                          <span className={e.type === 'INCOME' ? 'text-brand' : 'text-red-400'}>
                            {e.type === 'INCOME' ? '+' : '-'}{formatCurrency(e.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedReport.notes && (
                  <div className="rounded-lg bg-surface/50 p-3 border border-line">
                    <p className="text-xs text-fg-muted uppercase tracking-wide mb-1">Notas</p>
                    <p className="text-sm text-fg">{selectedReport.notes}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
