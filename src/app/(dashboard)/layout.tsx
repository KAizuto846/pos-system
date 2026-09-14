'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SessionProvider from '@/components/SessionProvider';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/pos': 'Punto de Venta',
  '/products': 'Productos',
  '/suppliers': 'Proveedores',
  '/departments': 'Departamentos',
  '/payment-methods': 'Métodos de Pago',
  '/sales': 'Ventas',
  '/orders': 'Pedidos',
  '/reports': 'Reportes',
  '/finance': 'Finanzas',
  '/users': 'Usuarios',
  '/vencimientos': 'Vencimientos',
  '/importar': 'Importar Datos',
};

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

    // Route protection: CASHIER cannot access /users or /importar
    if (
      status === 'authenticated' &&
      session?.user?.role === 'CASHIER' &&
      (pathname.startsWith('/users') || pathname.startsWith('/importar'))
    ) {
      router.push('/');
    }
  }, [status, router, session, pathname]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-10 w-10 rounded-xl" />
          <Skeleton className="mx-auto h-3 w-40" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const title =
    TITLES[pathname] ??
    Object.entries(TITLES).find(([href]) => href !== '/' && pathname.startsWith(href))?.[1] ??
    'POS System';

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-5 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
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
  return (
    <SessionProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SessionProvider>
  );
}
