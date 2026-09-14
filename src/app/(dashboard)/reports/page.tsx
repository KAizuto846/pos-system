'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart3, DollarSign, ShoppingCart, TrendingUp, Calendar,
  RefreshCw, Play, User, Clock, ArrowUpDown, Eye, X,
  Receipt, Package,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';

interface ShiftReport {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalAmount: number;
  totalRefunds: number;
  refundAmount: number;
  netAmount: number;
  byPaymentMethod: string;
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

export default function ReportsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);

  // Filters
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Users list for admin filter
  const [users, setUsers] = useState<UserOption[]>([]);

  // Sales breakdown state
  const [activeTab, setActiveTab] = useState('shifts');
  const [allSales, setAllSales] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesDateFrom, setSalesDateFrom] = useState(today);
  const [salesDateTo, setSalesDateTo] = useState(today);
  const [salesUserFilter, setSalesUserFilter] = useState('');

  // Fetch sales for breakdown

  // Fetch sales for breakdown
  const fetchSalesBreakdown = useCallback(async () => {
    setSalesLoading(true);
    try {
      const params = new URLSearchParams();
      if (salesDateFrom) params.set('startDate', salesDateFrom);
      if (salesDateTo) params.set('endDate', salesDateTo);
      const res = await fetch(`/api/sales?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) setAllSales(data);
    } catch {
      toast.error('Error al cargar ventas');
    }
    setSalesLoading(false);
  }, [salesDateFrom, salesDateTo]);

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
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-400" />
            Reportes
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Turnos, ventas y estadísticas
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="shifts" className="text-slate-300 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Clock className="h-4 w-4 mr-1" /> Turnos
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="breakdown" className="text-slate-300 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Receipt className="h-4 w-4 mr-1" /> Desglose de Ventas
            </TabsTrigger>
          )}
        </TabsList>

        {/* ══════ TAB: TURNOS ══════ */}
        <TabsContent value="shifts" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                const now = new Date();
                const startStr = now.toISOString().split('T')[0];
                const endStr = now.toISOString().split('T')[0];
                fetch('/api/shift-reports', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ startDate: startStr, endDate: endStr }),
                })
                  .then(async (res) => {
                    if (res.ok) { toast.success('Turno iniciado exitosamente'); fetchReports(); }
                    else { const err = await res.json(); toast.error(err.error || 'Error al iniciar turno'); }
                  })
                  .catch(() => toast.error('Error al iniciar turno'));
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <Play className="h-4 w-4" /> Nuevo Turno
            </Button>
          </div>

          {/* Filters */}
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" /> Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Desde</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-44" />
                </div>
                <div className="space-y-2">
                  <Label>Hasta</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-44" />
                </div>
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Cajero</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>)}
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

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">{isAdmin ? 'Total Turnos' : 'Mis Turnos'}</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-16 bg-slate-700" /> : <div className="text-2xl font-bold text-slate-100">{totalShifts}</div>}
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Ventas Totales</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-16 bg-slate-700" /> : <div className="text-2xl font-bold text-slate-100">{totalSalesCount}</div>}
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Monto Total</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-16 bg-slate-700" /> : <div className="text-2xl font-bold text-slate-100">{formatCurrency(totalAmountSum)}</div>}
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Neto Total</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-16 bg-slate-700" /> : <div className="text-2xl font-bold text-slate-100">{formatCurrency(totalNetSum)}</div>}
              </CardContent>
            </Card>
          </div>

          {/* Reports table */}
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">
                {isAdmin ? 'Todos los Turnos' : 'Mis Turnos'}
                {!loading && <span className="text-sm font-normal text-slate-400 ml-2">({totalCount} registros)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-12 w-full bg-slate-700"/>)}</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-12"><BarChart3 className="mx-auto h-12 w-12 text-slate-600 mb-4"/><p className="text-slate-400">No hay reportes de turno en este período</p></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && <TableHead>Cajero</TableHead>}
                      <TableHead>Fecha Inicio</TableHead>
                      <TableHead>Fecha Fin</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Devoluciones</TableHead>
                      <TableHead className="text-right">Neto</TableHead>
                      <TableHead>Formas de Pago</TableHead>
                      {isAdmin && <TableHead className="text-right">Detalle</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map(report => {
                      const pms = parsePaymentMethods(report.byPaymentMethod);
                      const pmEntries = Object.entries(pms);
                      return (
                        <TableRow key={report.id} className={isAdmin ? 'cursor-pointer hover:bg-slate-700/50' : ''} onClick={() => isAdmin && setSelectedReport(report)}>
                          {isAdmin && (
                            <TableCell><div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400"/><span className="text-slate-100 font-medium">{report.user?.name || report.user?.username || 'N/A'}</span></div></TableCell>
                          )}
                          <TableCell className="text-slate-300">{formatShortDate(report.startDate)}</TableCell>
                          <TableCell className="text-slate-300">{formatShortDate(report.endDate)}</TableCell>
                          <TableCell className="text-right text-slate-200 font-medium">{report.totalSales}</TableCell>
                          <TableCell className="text-right text-slate-200">{formatCurrency(report.totalAmount)}</TableCell>
                          <TableCell className="text-right">
                            {report.totalRefunds > 0 ? <span className="text-red-400">{report.totalRefunds} ({formatCurrency(report.refundAmount)})</span> : <span className="text-slate-500">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-emerald-400 font-medium">{formatCurrency(report.netAmount)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pmEntries.length === 0 ? <span className="text-slate-500 text-xs">—</span> : (
                                pmEntries.slice(0,2).map(([name,data]) => <Badge key={name} variant="outline" className="text-xs border-slate-600 text-slate-300">{name}: {formatCurrency(data.total)}</Badge>)
                              )}
                              {pmEntries.length > 2 && <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">+{pmEntries.length - 2}</Badge>}
                            </div>
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white" onClick={(e)=>{e.stopPropagation();setSelectedReport(report);}}><Eye className="h-4 w-4"/></Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Detail Dialog */}
          {isAdmin && (
            <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
              <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-slate-100 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-400" /> Detalle del Turno</DialogTitle>
                </DialogHeader>
                {selectedReport && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300 border-b border-slate-700 pb-3">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-100">{selectedReport.user?.name || selectedReport.user?.username}</span>
                      <span className="text-slate-500">|</span>
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <span>{formatDate(selectedReport.startDate)} — {formatDate(selectedReport.endDate)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Ventas</p>
                        <p className="text-xl font-bold text-slate-100 mt-1">{selectedReport.totalSales}</p>
                      </div>
                      <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Monto Total</p>
                        <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(selectedReport.totalAmount)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Devoluciones</p>
                        <p className="text-xl font-bold text-red-400 mt-1">{selectedReport.totalRefunds} ({formatCurrency(selectedReport.refundAmount)})</p>
                      </div>
                      <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Neto</p>
                        <p className="text-xl font-bold text-purple-400 mt-1">{formatCurrency(selectedReport.netAmount)}</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700">
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Desglose por Forma de Pago</p>
                      {Object.entries(parsePaymentMethods(selectedReport.byPaymentMethod)).length === 0 ? (
                        <p className="text-sm text-slate-500">Sin datos de pago</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(parsePaymentMethods(selectedReport.byPaymentMethod)).map(([name, data]) => (
                            <div key={name} className="flex items-center justify-between">
                              <span className="text-sm text-slate-200">{name}</span>
                              <div className="text-right"><span className="text-sm text-slate-300">{data.count} ventas</span><span className="text-sm text-emerald-400 ml-3">{formatCurrency(data.total)}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedReport.notes && (
                      <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Notas</p>
                        <p className="text-sm text-slate-200">{selectedReport.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        {/* ══════ TAB: DESGLOSE DE VENTAS ══════ */}
        {isAdmin && (
          <TabsContent value="breakdown" className="space-y-6 mt-4">
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader><CardTitle className="text-slate-100 flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" /> Filtrar Ventas</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-2"><Label>Desde</Label><Input type="date" value={salesDateFrom} onChange={e=>setSalesDateFrom(e.target.value)} className="w-44"/></div>
                  <div className="space-y-2"><Label>Hasta</Label><Input type="date" value={salesDateTo} onChange={e=>setSalesDateTo(e.target.value)} className="w-44"/></div>
                  <Button onClick={fetchSalesBreakdown} disabled={salesLoading} variant="outline" className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${salesLoading ? 'animate-spin' : ''}`} />
                    {salesLoading ? 'Cargando...' : 'Cargar Ventas'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {(() => {
              const totalSales = allSales.length;
              const totalAmount = allSales.reduce((s, sa) => s + sa.total, 0);
              const totalItems = allSales.reduce((s, sa) => s + (sa.items || []).reduce((si: number, it: any) => si + it.quantity, 0), 0);
              const totalRefunds = allSales.reduce((s, sa) => s + ((sa.refunds || []).reduce((sr: number, r: any) => sr + r.amount, 0)), 0);
              return (
                <div className="grid gap-4 sm:grid-cols-4">
                  <Card className="border-slate-700 bg-slate-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Ventas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-slate-100">{totalSales}</p></CardContent></Card>
                  <Card className="border-slate-700 bg-slate-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Productos Vendidos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-slate-100">{totalItems}</p></CardContent></Card>
                  <Card className="border-slate-700 bg-slate-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Ingreso Total</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalAmount)}</p></CardContent></Card>
                  <Card className="border-slate-700 bg-slate-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Devoluciones</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-400">{formatCurrency(totalRefunds)}</p></CardContent></Card>
                </div>
              );
            })()}

            <Card className="border-slate-700 bg-slate-800">
              <CardHeader><CardTitle className="text-slate-100">Ventas del Período <span className="text-sm font-normal text-slate-400 ml-2">({allSales.length} registros)</span></CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto max-h-[500px] overflow-y-auto">
                {salesLoading ? (
                  <div className="p-6 space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-10 w-full bg-slate-700"/>)}</div>
                ) : allSales.length === 0 ? (
                  <div className="text-center py-12"><Receipt className="mx-auto h-12 w-12 text-slate-600 mb-4"/><p className="text-slate-400">Selecciona un rango de fechas y presiona Cargar Ventas</p></div>
                ) : (
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-800">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cajero</TableHead>
                        <TableHead>Productos</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allSales.map((sale: any) => {
                        const refunded = (sale.refunds || []).reduce((s: number, r: any) => s + r.amount, 0);
                        return (
                          <TableRow key={sale.id} className="group">
                            <TableCell className="font-mono text-xs text-slate-400">#{sale.id}</TableCell>
                            <TableCell className="text-xs text-slate-300 whitespace-nowrap">
                              {new Date(sale.createdAt).toLocaleDateString('es-MX', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                            </TableCell>
                            <TableCell className="text-sm text-slate-300">{sale.user?.name || '—'}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-[280px]">
                                {(sale.items || []).map((item: any) => (
                                  <Badge key={item.id} variant="outline" className="text-[10px] border-slate-600 text-slate-300">
                                    {item.product?.name?.substring(0,18) || `#${item.productId}`}
                                    <span className="text-slate-500 ml-1">x{item.quantity}</span>
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="text-xs">{sale.paymentMethod?.name || '—'}</Badge></TableCell>
                            <TableCell className="text-right font-medium text-slate-100">
                              {formatCurrency(sale.total)}
                              {refunded > 0 && <span className="text-red-400 text-xs block">-{formatCurrency(refunded)}</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
