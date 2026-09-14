'use client';

import { useState, useEffect } from 'react';
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
  AlertTriangle,
  Bell,
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
  { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
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
  { href: '/vencimientos', label: 'Vencimientos', icon: AlertTriangle },
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
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setUnreadNotifs(data.unreadCount || 0);
        }
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

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
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors',
          active
            ? 'bg-white/[0.07] text-fg font-medium'
            : 'text-fg-muted hover:bg-white/[0.04] hover:text-fg'
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-brand" />
        )}
        <Icon
          className={cn(
            'h-4 w-4 flex-shrink-0 transition-colors',
            active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg-muted'
          )}
        />
        <span className="truncate">{link.label}</span>
      </Link>
    );
  };

  const sectionLabel = (text: string) => (
    <p className="px-3 pb-1.5 pt-4 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
      {text}
    </p>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0c0d0e] transition-transform duration-300 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-strong text-[11px] font-semibold text-white">
              P
            </div>
            <span className="text-[13px] font-medium tracking-tight text-fg">
              POS System
            </span>
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-white/[0.06] hover:text-fg lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-0.5">
            {navLinks.map(renderLink)}
          </div>

          {isAdmin && (
            <>
              {sectionLabel('Administración')}
              <div className="space-y-0.5">{adminLinks.map(renderLink)}</div>
            </>
          )}

          {sectionLabel('Operación')}
          <div className="space-y-0.5">
            {extraLinks
              .filter((link) => link.href !== '/importar' || isAdmin)
              .map(renderLink)}
          </div>
        </nav>

        {/* Bottom actions */}
        <div className="space-y-0.5 border-t border-line/60 p-2">
          {unreadNotifs > 0 && (
            <Link
              href="/vencimientos"
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-amber-300/90 transition-colors hover:bg-white/[0.04] hover:text-amber-200"
            >
              <Bell className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 truncate">Notificaciones</span>
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500/90 px-1.5 text-[10px] font-semibold text-white">
                {unreadNotifs}
              </span>
            </Link>
          )}

          {canCloseShift && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 px-3 text-fg-muted hover:text-fg"
                >
                  <ClipboardCheck className="h-4 w-4" />
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
                <DialogFooter>
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
                          alert('Error al cerrar turno: ' + (err.error || 'Error desconocido'));
                          return;
                        }

                        setDialogOpen(false);
                        router.push('/reports');
                      } catch (error) {
                        alert('Error de conexión al cerrar turno');
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
            className="w-full justify-start gap-3 px-3 text-fg-muted hover:bg-red-500/10 hover:text-red-400"
            onClick={() => signOut({ redirectTo: '/login' })}
          >
            <LogOut className="h-4 w-4" />
            <span>Salir</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
