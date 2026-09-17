'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Calendar, XCircle, CheckCircle, Bell, RefreshCw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardHeader, CardTitle, CardContent,
} from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ProductInfo {
  id: number;
  name: string;
  barcode: string;
  stock: number;
}

interface ExpiryGroup {
  product: ProductInfo;
  totalQty: number;
  nearestExpiry: string | null;
  batchCount: number;
}

interface Summary {
  expiringToday: ExpiryGroup[];
  nearExpiry: ExpiryGroup[];
  expired: ExpiryGroup[];
  generatedAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function getDaysLeft(iso: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = new Date(iso);
  const expDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  return Math.ceil((expDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function VencimientosPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<{ id: number; title: string; message: string; severity: string; type: string; read: boolean; createdAt: string; product: { id: number; name: string } | null }[]>([]);
  const [activeTab, setActiveTab] = useState('expiry');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, notifRes] = await Promise.all([
        fetch('/api/stock-batches/expiry-summary'),
        fetch('/api/notifications'),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'PUT' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  function renderExpiryTable(items: ExpiryGroup[], label: string, danger: boolean) {
    if (items.length === 0) {
      return <p className="text-sm text-fg-muted py-4 text-center">No hay productos en esta categoría</p>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-line">
            <TableHead className="text-fg-muted">Producto</TableHead>
            <TableHead className="text-fg-muted">Código</TableHead>
            <TableHead className="text-fg-muted">Stock Total</TableHead>
            <TableHead className="text-fg-muted">Cantidad próx. vencer</TableHead>
            <TableHead className="text-fg-muted">Vence</TableHead>
            <TableHead className="text-fg-muted">Días restantes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, i) => (
            <TableRow key={i} className="border-line">
              <TableCell className="font-medium text-fg">{item.product.name}</TableCell>
              <TableCell className="text-fg-muted">{item.product.barcode || '—'}</TableCell>
              <TableCell className="text-fg-muted">{item.product.stock}</TableCell>
              <TableCell className={danger ? 'text-red-400 font-bold' : 'text-yellow-400'}>
                {item.totalQty}
              </TableCell>
              <TableCell className="text-fg-muted">
                {item.nearestExpiry ? formatDate(item.nearestExpiry) : '—'}
              </TableCell>
              <TableCell>
                {item.nearestExpiry ? (
                  <Badge variant={danger ? 'destructive' : getDaysLeft(item.nearestExpiry) <= 3 ? 'destructive' : 'secondary'}>
                    {getDaysLeft(item.nearestExpiry)} días
                  </Badge>
                ) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (loading && !summary) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64 bg-surface-2" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 bg-surface-2" />)}
        </div>
        <Skeleton className="h-64 bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Calendar className="h-6 w-6 text-brand" />
            Control de Vencimientos
          </h1>
          <p className="text-sm text-fg-muted mt-1">
            Productos próximos a vencer y notificaciones
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="border-line-strong text-fg-muted">
          <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-[13px] text-red-300">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-800 bg-red-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-400">
              {summary?.expired.reduce((s, g) => s + g.totalQty, 0) || 0}
            </p>
            <p className="text-xs text-red-500/70 mt-1">
              {summary?.expired.length || 0} producto(s)
            </p>
          </CardContent>
        </Card>

        <Card className="border-yellow-800 bg-yellow-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Vencen hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-400">
              {summary?.expiringToday.reduce((s, g) => s + g.totalQty, 0) || 0}
            </p>
            <p className="text-xs text-yellow-500/70 mt-1">
              {summary?.expiringToday.length || 0} producto(s)
            </p>
          </CardContent>
        </Card>

        <Card className="border-brand-strong bg-brand/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Próximos 7 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-brand">
              {summary?.nearExpiry.reduce((s, g) => s + g.totalQty, 0) || 0}
            </p>
            <p className="text-xs text-brand/70 mt-1">
              {summary?.nearExpiry.length || 0} producto(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-surface-2/50">
          <TabsTrigger value="expiry" className="text-fg-muted data-[state=active]:bg-brand-strong data-[state=active]:text-white">
            Vencimientos
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-fg-muted data-[state=active]:bg-brand-strong data-[state=active]:text-white">
            Notificaciones
            {notifications.filter(n => !n.read).length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-xs">
                {notifications.filter(n => !n.read).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expiry" className="space-y-6">
          {/* Expired */}
          <Card className="bg-surface-2/50/50">
            <CardHeader>
              <CardTitle className="text-lg text-red-400 flex items-center gap-2">
                <XCircle className="h-5 w-5" /> Vencidos ({summary?.expired.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderExpiryTable(summary?.expired || [], 'Vencidos', true)}
            </CardContent>
          </Card>

          {/* Expiring Today */}
          <Card className="bg-surface-2/50/50">
            <CardHeader>
              <CardTitle className="text-lg text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Vencen hoy ({summary?.expiringToday.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderExpiryTable(summary?.expiringToday || [], 'Hoy', true)}
            </CardContent>
          </Card>

          {/* Near Expiry */}
          <Card className="bg-surface-2/50/50">
            <CardHeader>
              <CardTitle className="text-lg text-brand flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Próximos 7 días ({summary?.nearExpiry.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderExpiryTable(summary?.nearExpiry || [], 'Próximos', false)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="bg-surface-2/50/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-fg flex items-center gap-2">
                <Bell className="h-5 w-5 text-brand" />
                Notificaciones
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-fg-muted hover:text-white">
                <CheckCircle className="h-4 w-4 mr-1" /> Marcar todas leídas
              </Button>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-8">
                  No hay notificaciones
                </p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                        n.read
                          ? 'bg-surface-2/50/30 opacity-60'
                          : n.severity === 'danger'
                          ? 'border-red-800 bg-red-950/20'
                          : 'border-yellow-800 bg-yellow-950/20'
                      }`}
                    >
                      <div className={`mt-0.5 ${n.severity === 'danger' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {n.severity === 'danger' ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${n.read ? 'text-fg-muted' : 'text-fg'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-fg-subtle mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-line-strong mt-1">
                          {new Date(n.createdAt).toLocaleDateString('es-MX', {
                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                          {n.product && ` • ${n.product.name}`}
                        </p>
                      </div>
                      {!n.read && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-fg-subtle" onClick={() => markRead(n.id)}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
