'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  Building2,
  Wallet,
  Receipt,
  DollarSign,
  ClipboardList,
  BarChart3,
  Upload,
  LogOut,
  X,
  ClipboardCheck,
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navLinks = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'POS (Punto de Venta)', icon: ShoppingCart },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/suppliers', label: 'Proveedores', icon: Truck },
  { href: '/departments', label: 'Departamentos', icon: Building2 },
  { href: '/payment-methods', label: 'Métodos de Pago', icon: Wallet },
  { href: '/sales', label: 'Ventas', icon: Receipt },
];

const adminLinks = [
  { href: '/finance', label: 'Finanzas', icon: DollarSign },
  { href: '/users', label: 'Usuarios', icon: Users },
];

const extraLinks = [
  { href: '/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/reports', label: 'Reportes', icon: BarChart3 },
  { href: '/importar', label: 'Importar Datos', icon: Upload },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const canCloseShift = session?.user?.role === 'CASHIER' || isAdmin;
  const [closingShift, setClosingShift] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const renderLink = (link: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const Icon = link.icon;
    const active = isActive(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onClose}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          active
            ? 'bg-emerald-600/20 text-emerald-400'
            : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
        )}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span>{link.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-800 text-slate-300 transition-transform duration-300 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo & Title */}
        <div className="flex h-16 items-center justify-between border-b border-slate-700 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              P
            </div>
            <span className="text-lg font-semibold text-slate-100">POS System</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navLinks.map(renderLink)}
          {isAdmin && (
            <>
              <div className="my-2 border-t border-slate-700 pt-2">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Administración</p>
              </div>
              {adminLinks.map(renderLink)}
            </>
          )}
          {extraLinks
            .filter((link) => link.href !== '/importar' || isAdmin)
            .map(renderLink)}
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-slate-700 p-3 space-y-2">
          {canCloseShift && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-slate-300 hover:bg-slate-700/50 hover:text-emerald-400"
                >
                  <ClipboardCheck className="h-5 w-5" />
                  <span>Cerrar Turno</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Cerrar Turno</DialogTitle>
                  <DialogDescription>
                    Se generará un reporte con las ventas de tu turno (desde las 00:00 hrs hasta ahora).
                    ¿Estás seguro de que deseas cerrar tu turno?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button
                    onClick={async () => {
                      setClosingShift(true);
                      try {
                        const now = new Date();
                        const startOfDay = new Date(now);
                        startOfDay.setHours(0, 0, 0, 0);

                        const res = await fetch('/api/shift-reports', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            startDate: startOfDay.toISOString(),
                            endDate: now.toISOString(),
                          }),
                        });

                        if (!res.ok) {
                          const err = await res.json();
                          console.error('Error closing shift:', err);
                          return;
                        }

                        setDialogOpen(false);
                        router.push('/reports');
                      } catch (error) {
                        console.error('Error closing shift:', error);
                      } finally {
                        setClosingShift(false);
                      }
                    }}
                    disabled={closingShift}
                  >
                    {closingShift ? 'Generando...' : 'Confirmar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-slate-300 hover:bg-slate-700/50 hover:text-red-400"
            onClick={() => signOut({ redirectTo: '/login' })}
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
