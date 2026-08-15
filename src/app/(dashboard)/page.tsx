'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Users, Package, DollarSign, ShoppingCart, CalendarClock, FileText, Download } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Descarga el contenido como archivo de texto plano
function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Stats {
  totalUsers: number;
  totalProducts: number;
  todaySales: number;
  todayRevenue: number;
  lowStockProducts: { id: number; name: string; stock: number; minStock: number }[];
  expiringProducts: { productId: number; name: string; stock: number; quantity: number; expiresAt: string }[];
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.totalUsers === 'number') {
          setStats(data);
          setNow(Date.now());
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-600/10',
    },
    {
      title: 'Total Products',
      value: stats?.totalProducts ?? 0,
      icon: Package,
      color: 'text-emerald-400',
      bg: 'bg-emerald-600/10',
    },
    {
      title: "Today's Sales",
      value: stats?.todaySales ?? 0,
      icon: ShoppingCart,
      color: 'text-amber-400',
      bg: 'bg-amber-600/10',
    },
    {
      title: "Today's Revenue",
      value: stats ? `$${(stats.todayRevenue || 0).toFixed(2)}` : '$0.00',
      icon: DollarSign,
      color: 'text-purple-400',
      bg: 'bg-purple-600/10',
    },
  ];

  const exportLowStock = () => {
    if (!stats) return;
    const now = new Date().toLocaleString('es-MX');
    const lines: string[] = [
      `LISTA DE PRODUCTOS BAJOS / SIN STOCK`,
      `Generado: ${now}`,
      '=======================================',
      '',
      `${'Producto'.padEnd(38)}Stock`,
      '---------------------------------------',
      ...(stats.lowStockProducts.length > 0
        ? stats.lowStockProducts.map((p) => `${p.name.slice(0, 38).padEnd(38)}${p.stock}`)
        : ['No hay productos bajos de stock.']),
      '',
      `Total de productos: ${stats.lowStockProducts.length}`,
    ];
    downloadTextFile(`stock-bajo-${new Date().toISOString().slice(0, 10)}.txt`, lines.join('\n'));
    toast('Archivo de stock bajo exportado');
  };

  const exportExpiring = () => {
    if (!stats) return;
    const now = new Date().toLocaleString('es-MX');
    const lines: string[] = [
      `LISTA DE PRODUCTOS POR CADUCAR (60 dias)`,
      `Generado: ${now}`,
      '=======================================',
      '',
      `${'Producto'.padEnd(28)}${'Piezas'.padEnd(8)}Vence`,
      '---------------------------------------',
      ...(stats.expiringProducts.length > 0
        ? stats.expiringProducts.map((b) => {
            const d = new Date(b.expiresAt).toLocaleDateString('es-MX', { month: '2-digit', year: 'numeric' });
            return `${b.name.slice(0, 28).padEnd(28)}${String(b.quantity).padEnd(8)}${d}`;
          })
        : ['No hay productos próximos a caducar.']),
      '',
      `Total de lotes: ${stats.expiringProducts.length}`,
    ];
    downloadTextFile(`por-caducar-${new Date().toISOString().slice(0, 10)}.txt`, lines.join('\n'));
    toast('Archivo de productos por caducar exportado');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ''}!
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Here is an overview of your POS system
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-slate-700 bg-slate-800">
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24 bg-slate-700" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 bg-slate-700" />
                </CardContent>
              </Card>
            ))
          : statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.title} className="border-slate-700 bg-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">
                      {card.title}
                    </CardTitle>
                    <div className={`rounded-lg p-2 ${card.bg}`}>
                      <Icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-100">
                      {card.value}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Expiring Products Alerts */}
      {stats && stats.expiringProducts && stats.expiringProducts.length > 0 && (
        <Card className="border-red-900/60 bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <CalendarClock className="h-4 w-4 text-amber-400" />
              Próximos a Caducar (60 días)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={exportExpiring} className="border-amber-700/50 text-amber-300 hover:bg-amber-900/20">
              <FileText className="mr-2 h-3.5 w-3.5" />
              Exportar .txt
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.expiringProducts.slice(0, 15).map((b) => {
                const daysLeft = Math.ceil((new Date(b.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000));
                const critical = daysLeft <= 30;
                return (
                  <div
                    key={`${b.productId}-${b.expiresAt}`}
                    className={`flex items-center justify-between rounded-lg border px-4 py-2 ${
                      critical
                        ? 'border-red-800 bg-red-950/40'
                        : 'border-amber-800/60 bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-200">{b.name}</span>
                      <span className="text-xs text-slate-400">Vence: {new Date(b.expiresAt).toLocaleDateString('es-MX', { month: '2-digit', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-300">{b.quantity} piezas</span>
                      <span className={`text-sm font-medium ${critical ? 'text-red-400' : 'text-amber-400'}`}>
                        {daysLeft <= 0 ? 'VENCIDO' : `${daysLeft} días`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Alerts */}
      {stats && stats.lowStockProducts && stats.lowStockProducts.length > 0 && (
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-slate-100">Low Stock Alerts</CardTitle>
            <Button variant="outline" size="sm" onClick={exportLowStock} className="border-slate-600 text-slate-300 hover:bg-slate-700">
              <Download className="mr-2 h-3.5 w-3.5" />
              Exportar .txt
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.lowStockProducts.slice(0, 10).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2"
                >
                  <span className="text-sm text-slate-200">{product.name}</span>
                  <span className="text-sm text-red-400 font-medium">
                    {product.stock} / {product.minStock} min
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
