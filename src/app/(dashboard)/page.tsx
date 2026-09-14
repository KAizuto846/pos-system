'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Users, Package, DollarSign, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Stats {
  totalUsers: number;
  totalProducts: number;
  todaySales: number;
  todayRevenue: number;
  lowStockProducts: { id: number; name: string; stock: number; minStock: number }[];
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.totalUsers === 'number') {
          setStats(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: 'Usuarios',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      accent: 'text-sky-400',
    },
    {
      title: 'Productos',
      value: stats?.totalProducts ?? 0,
      icon: Package,
      accent: 'text-brand',
    },
    {
      title: 'Ventas de hoy',
      value: stats?.todaySales ?? 0,
      icon: ShoppingCart,
      accent: 'text-amber-400',
    },
    {
      title: 'Ingresos de hoy',
      value: stats ? `$${(stats.todayRevenue || 0).toFixed(2)}` : '$0.00',
      icon: DollarSign,
      accent: 'text-violet-400',
    },
  ];

  const lowStock = stats?.lowStockProducts ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[20px] font-medium tracking-tight text-fg">
          {session?.user?.name ? `Hola, ${session.user.name}` : 'Bienvenido'}
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Resumen operativo del punto de venta
        </p>
      </div>

      {/* Métricas — separadas por líneas, no por cajas */}
      <div className="grid divide-y divide-line/60 border-y border-line/60 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-0 py-5 sm:px-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
              </div>
            ))
          : statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="flex items-start justify-between gap-4 px-0 py-5 sm:px-6"
                >
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
                      {card.title}
                    </p>
                    <p className="mt-2 text-[24px] font-medium leading-none tracking-tight text-fg">
                      {card.value}
                    </p>
                  </div>
                  <Icon className={cn('mt-0.5 h-4 w-4', card.accent)} />
                </div>
              );
            })}
      </div>

      {/* Alertas de stock bajo */}
      {lowStock.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <h3 className="text-[13px] font-medium text-fg">Stock bajo</h3>
            <span className="text-[11px] text-fg-subtle">
              {lowStock.length} producto{lowStock.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="divide-y divide-line/50 overflow-hidden rounded-xl bg-surface-2/50">
            {lowStock.slice(0, 10).map((product) => {
              const ratio = product.minStock > 0
                ? Math.min(100, Math.round((product.stock / product.minStock) * 100))
                : 100;
              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="truncate text-[13px] text-fg-muted">{product.name}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden h-1 w-24 overflow-hidden rounded-full bg-white/[0.07] sm:block">
                      <div
                        className="h-full rounded-full bg-amber-500/80"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-[12px] text-amber-300/90">
                      {product.stock} / {product.minStock}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
