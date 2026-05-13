'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Users, Package, DollarSign, ShoppingCart } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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

      {/* Low Stock Alerts */}
      {stats && stats.lowStockProducts && stats.lowStockProducts.length > 0 && (
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Low Stock Alerts</CardTitle>
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
