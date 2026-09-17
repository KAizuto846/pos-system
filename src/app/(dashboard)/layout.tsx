'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import DeliveryNoticeBanner from '@/components/DeliveryNoticeBanner';
import StockAlertBanner from '@/components/StockAlertBanner';
import { Skeleton } from '@/components/ui/skeleton';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    // Route protection:
    // - CASHIER no accede a /users, /importar, /taxes, /sync o /reports
    // - HELPER (ayudante) tiene los mismos permisos que el cajero y además
    //   NO puede acceder por nada al inventario (/products) ni a los pedidos (/orders)
    if (status === 'authenticated') {
      const role = session?.user?.role;
      const isHelper = role === 'HELPER';
      const isCashier = role === 'CASHIER' || isHelper;
      if (
        isCashier &&
        (pathname.startsWith('/users') || pathname.startsWith('/importar') || pathname.startsWith('/taxes') || pathname.startsWith('/sync') || pathname.startsWith('/reports'))
      ) {
        router.push('/');
        return;
      }
      if (isHelper && (pathname.startsWith('/products') || pathname.startsWith('/orders'))) {
        router.push('/');
      }
    }
  }, [status, router, session, pathname]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-full bg-slate-800" />
          <Skeleton className="mx-auto h-4 w-48 bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col">
        <Header
          title="POS System"
          onMenuClick={() => setSidebarOpen(true)}
        />
        <DeliveryNoticeBanner />
        <StockAlertBanner />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}
