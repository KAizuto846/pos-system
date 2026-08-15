'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Percent,
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
  UserRound,
  Settings,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import VersionBadge from '@/components/VersionBadge';
import { useBusiness } from '@/hooks/useBusiness';
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

interface ShiftResult {
  id: number;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalAmount: number;
  totalCost: number;
  totalRefunds: number;
  refundAmount: number;
  netAmount: number;
  byPaymentMethod: string;
}

interface PmBreakdown {
  count: number;
  total: number;
  cashReceived: number;
  change: number;
}

function parsePm(json: string): Record<string, PmBreakdown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

const navLinks = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'POS (Punto de Venta)', icon: ShoppingCart },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/customers', label: 'Clientes', icon: UserRound },
  { href: '/suppliers', label: 'Proveedores', icon: Truck },
  { href: '/departments', label: 'Departamentos', icon: Building2 },
  { href: '/payment-methods', label: 'Métodos de Pago', icon: Wallet },
  { href: '/sales', label: 'Ventas', icon: Receipt },
];

const adminLinks = [
  { href: '/finance', label: 'Finanzas', icon: DollarSign },
  { href: '/users', label: 'Usuarios', icon: Users },
  { href: '/taxes', label: 'Impuestos', icon: Percent },
];

const extraLinks = [
  { href: '/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/reports', label: 'Reportes', icon: BarChart3 },
  { href: '/importar', label: 'Importar Datos', icon: Upload },
];

const syncLinks = [
  { href: '/sync', label: 'Sincronización', icon: RefreshCw },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const business = useBusiness();
  const isAdmin = session?.user?.role === 'ADMIN';
  const canCloseShift = session?.user?.role === 'CASHIER' || isAdmin;
  const [closingShift, setClosingShift] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shiftResult, setShiftResult] = useState<ShiftResult | null>(null);
  const [shiftPreview, setShiftPreview] = useState<ShiftResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const buildShiftPayload = () => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return {
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
    };
  };

  const loadShiftPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/shift-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildShiftPayload(), preview: true }),
      });
      if (!res.ok) throw new Error('Error al cargar resumen');
      setShiftPreview(await res.json());
    } catch {
      setShiftPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const businessName = business.businessName || 'POS System';
  const businessInitial = businessName.trim().charAt(0).toUpperCase() || 'P';

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
            ? 'bg-primary/20 text-primary'
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
            {business.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logo}
                alt="Logo del negocio"
                className="h-9 w-9 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {businessInitial}
              </div>
            )}
            <span className="text-lg font-semibold text-slate-100">{businessName}</span>
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
          {syncLinks.map(renderLink)}
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-slate-700 p-3 space-y-2">
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive('/settings')
                ? 'bg-primary/20 text-primary'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
            )}
          >
            <Settings className="h-5 w-5" />
            <span>Configuración</span>
          </Link>
          {canCloseShift && (
            <Dialog
              open={dialogOpen}
              onOpenChange={(o) => {
                setDialogOpen(o);
                if (o) {
                  setShiftResult(null);
                  setShiftPreview(null);
                  loadShiftPreview();
                } else {
                  setShiftResult(null);
                  setShiftPreview(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-slate-300 hover:bg-slate-700/50 hover:text-primary"
                >
                  <ClipboardCheck className="h-5 w-5" />
                  <span>Cerrar Turno</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
                <DialogHeader className="shrink-0">
                  <DialogTitle className="flex items-center gap-2">
                    {shiftResult ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        Turno cerrado
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="h-5 w-5" />
                        Cerrar Turno
                      </>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {shiftResult
                      ? 'Resumen de las ventas de tu turno.'
                      : shiftPreview
                        ? 'Revisa los datos de tu turno antes de confirmar el corte.'
                        : 'Se generará un reporte con las ventas de tu turno (desde las 00:00 hrs hasta ahora).'}
                  </DialogDescription>
                </DialogHeader>

                {shiftResult || shiftPreview ? (
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5">
                      <span className="text-sm text-slate-400">Ventas totales</span>
                      <span className="text-lg font-bold text-slate-100">{(shiftResult ?? shiftPreview)!.totalSales}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5">
                      <span className="text-sm text-slate-400">Monto total</span>
                      <span className="text-lg font-bold text-emerald-400">{formatCurrency((shiftResult ?? shiftPreview)!.totalAmount)}</span>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Por método de pago
                      </p>
                      <div className="space-y-1.5">
                        {Object.entries(parsePm((shiftResult ?? shiftPreview)!.byPaymentMethod)).map(([name, pm]) => (
                          <div
                            key={name}
                            className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-200">{name}</span>
                              <Badge variant="outline" className="text-xs">
                                {pm.count} {pm.count === 1 ? 'venta' : 'ventas'}
                              </Badge>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-sm">
                              <span className="text-slate-400">Total</span>
                              <span className="font-semibold text-slate-100">{formatCurrency(pm.total)}</span>
                            </div>
                            {pm.cashReceived > 0 && (
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span>Efectivo recibido</span>
                                <span>{formatCurrency(pm.cashReceived)}</span>
                              </div>
                            )}
                            {pm.change > 0 && (
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span>Cambio entregado</span>
                                <span>{formatCurrency(pm.change)}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {(shiftResult ?? shiftPreview)!.totalRefunds > 0 && (
                      <div className="flex items-center justify-between rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-2.5">
                        <span className="text-sm text-slate-400">
                          Reembolsos ({(shiftResult ?? shiftPreview)!.totalRefunds})
                        </span>
                        <span className="text-sm font-semibold text-red-400">
                          -{formatCurrency((shiftResult ?? shiftPreview)!.refundAmount)}
                        </span>
                      </div>
                    )}

                    <Separator className="my-1" />

                    <div className="flex items-center justify-between rounded-lg bg-slate-950/60 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-200">Neto del turno</span>
                      <span className="text-xl font-extrabold text-emerald-400">
                        {formatCurrency((shiftResult ?? shiftPreview)!.netAmount)}
                      </span>
                    </div>
                  </div>
                ) : loadingPreview ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
                    Cargando resumen del turno...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
                      <Loader2 className="h-4 w-4 shrink-0 text-slate-500" />
                      El reporte incluye el total de ventas y el desglose por método de pago de hoy.
                    </div>
                  </div>
                )}

                <DialogFooter className="shrink-0 gap-2 sm:gap-0">
                  {shiftResult ? (
                    <>
                      <DialogClose asChild>
                        <Button variant="outline">Cerrar</Button>
                      </DialogClose>
                      <Button onClick={() => router.push('/reports')} className="bg-emerald-600 hover:bg-emerald-500">
                        Ver reportes
                      </Button>
                    </>
                  ) : (
                    <>
                      <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                      </DialogClose>
                      <Button
                        onClick={async () => {
                          setClosingShift(true);
                          try {
                            const res = await fetch('/api/shift-reports', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(buildShiftPayload()),
                            });

                            if (!res.ok) {
                              const err = await res.json();
                              alert('Error al cerrar turno: ' + (err.error || 'Error desconocido'));
                              return;
                            }

                            const report: ShiftResult = await res.json();
                            setShiftResult(report);
                          } catch (error) {
                            alert('Error de conexión al cerrar turno');
                            console.error('Error closing shift:', error);
                          } finally {
                            setClosingShift(false);
                          }
                        }}
                        disabled={closingShift}
                      >
                        {closingShift ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          'Confirmar corte'
                        )}
                      </Button>
                    </>
                  )}
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
          <div className="flex justify-center pt-1">
            <VersionBadge />
          </div>
        </div>
      </aside>
    </>
  );
}
