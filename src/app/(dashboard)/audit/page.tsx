'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogIn, Search, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: number;
  userId: number;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: number | null;
  description: string;
  details: string;
  before: string;
  after: string;
  ip: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

const ACTION_STYLES: Record<string, { label: string; className: string }> = {
  login: { label: 'Login', className: 'border-sky-700/50 text-sky-300 bg-sky-950/30' },
  create: { label: 'Crear', className: 'border-brand-strong/50 text-brand bg-brand/30' },
  update: { label: 'Editar', className: 'border-amber-700/50 text-amber-300 bg-amber-950/30' },
  delete: { label: 'Eliminar', className: 'border-red-700/50 text-red-300 bg-red-950/30' },
  stock: { label: 'Stock', className: 'border-violet-700/50 text-violet-300 bg-violet-950/30' },
  receive: { label: 'Recibir', className: 'border-teal-700/50 text-teal-300 bg-teal-950/30' },
  auth: { label: 'Auth', className: 'border-orange-700/50 text-orange-300 bg-orange-950/30' },
};

function actionStyle(action: string) {
  return ACTION_STYLES[action] || { label: action, className: 'border-line-strong text-fg-muted bg-surface-2' };
}

const ENTITY_LABELS: Record<string, string> = {
  product: 'Producto',
  sale: 'Venta',
  user: 'Usuario',
  supplier: 'Proveedor',
  department: 'Departamento',
  'payment-method': 'Método de pago',
  customer: 'Cliente',
  order: 'Pedido',
  refund: 'Reembolso',
  tax: 'Impuesto',
  finance: 'Finanzas',
  pieces: 'Piezas',
  settings: 'Configuración',
  import: 'Importación',
  backup: 'Respaldo',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  username: 'Usuario',
  barcode: 'Código',
  price: 'Precio',
  cost: 'Costo',
  stock: 'Stock',
  minStock: 'Stock mín.',
  active: 'Activo',
  departmentId: 'Departamento',
  supplierId: 'Proveedor',
  supplierPrice: 'Precio proveedor',
  isPrimary: 'Principal',
  role: 'Rol',
  recoveryEmail: 'Correo de recuperación',
  phone: 'Teléfono',
  email: 'Correo',
  description: 'Descripción',
  affectsCash: 'Afecta caja',
  unitsPerBox: 'Piezas por caja',
  soldByBox: 'Se maneja en cajas',
  piecesPerUnit: 'Piezas por caja (CT)',
  piecesTracked: 'Gestiona piezas',
  total: 'Total',
  discountTotal: 'Descuento',
  quantity: 'Cantidad',
  amount: 'Monto',
  reason: 'Motivo',
  status: 'Estado',
  notes: 'Notas',
};

const FIELD_TRUE_LABELS: Record<string, string> = {
  active: 'Sí',
  affectsCash: 'Sí',
  isPrimary: 'Sí',
  soldByBox: 'Sí',
  piecesTracked: 'Sí',
};

const FIELD_FALSE_LABELS: Record<string, string> = {
  active: 'No',
  affectsCash: 'No',
  isPrimary: 'No',
  soldByBox: 'No',
  piecesTracked: 'No',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

function fieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') {
    return value ? (FIELD_TRUE_LABELS[key] || 'Sí') : (FIELD_FALSE_LABELS[key] || 'No');
  }
  if (typeof value === 'number') {
    // Precio/costo/montos con 2 decimales
    if (['price', 'cost', 'amount', 'total', 'discountTotal', 'supplierPrice'].includes(key)) {
      return value.toFixed(2);
    }
    return String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface Change {
  campo: string;
  antes: string;
  despues: string;
}

// Extrae los cambios campo por campo del registro de auditoría.
// Prioridad: `cambios` (diff calculado en el servidor) → `before`/`after`.
function extractChanges(log: AuditEntry): Change[] {
  try {
    const details = JSON.parse(log.details || '{}');
    if (details && typeof details === 'object' && details.cambios && typeof details.cambios === 'object') {
      return Object.entries(details.cambios as Record<string, { antes: unknown; despues: unknown }>).map(
        ([campo, v]) => ({
          campo,
          antes: fieldValue(campo, v?.antes),
          despues: fieldValue(campo, v?.despues),
        })
      );
    }
    const before = JSON.parse(log.before || '{}');
    const after = JSON.parse(log.after || '{}');
    if (log.action === 'delete') {
      return Object.entries(before as Record<string, unknown>).map(([campo, v]) => ({
        campo,
        antes: fieldValue(campo, v),
        despues: '—',
      }));
    }
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
      (k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)
    );
    return keys.map((campo) => ({
      campo,
      antes: fieldValue(campo, before[campo]),
      despues: fieldValue(campo, after[campo]),
    }));
  } catch {
    return [];
  }
}

// Resumen legible del detalle (para acciones sin diff: login, create, receive…)
function parseDetails(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return raw;
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 0 && v !== false);
    if (entries.length === 0) return '';
    return entries
      .map(([k, v]) => `${fieldLabel(k)}: ${typeof v === 'object' ? JSON.stringify(v) : fieldValue(k, v)}`)
      .join(' · ');
  } catch {
    return raw;
  }
}

export default function AuditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchLogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '50' });
      if (filterAction !== 'all') params.set('action', filterAction);
      if (filterEntity !== 'all') params.set('entity', filterEntity);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error('Error al cargar auditoría');
      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterEntity, search]);

  // Primera carga
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated' && !isAdmin) {
      router.push('/');
      return;
    }
    if (status === 'authenticated' && isAdmin) {
      const t = setTimeout(() => fetchLogs(1), 0);
      return () => clearTimeout(t);
    }
  }, [status, isAdmin, router, fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-line" />
        <Skeleton className="h-10 w-full bg-line" />
        <Skeleton className="h-64 w-full bg-line" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <ShieldCheck className="h-6 w-6 text-brand" />
            Registro de Auditoría
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Quién entró al sistema y qué modificó, con el valor exacto antes y después de cada cambio. Solo visible para administradores.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLogs(1)}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuario o descripción..."
            className="h-9 border-line-strong bg-surface-2 pl-9 text-fg"
          />
        </form>
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); }}>
          <SelectTrigger className="h-9 w-36 border-line-strong bg-surface-2 text-fg">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="login">Login</SelectItem>
            <SelectItem value="create">Crear</SelectItem>
            <SelectItem value="update">Editar</SelectItem>
            <SelectItem value="delete">Eliminar</SelectItem>
            <SelectItem value="stock">Stock</SelectItem>
            <SelectItem value="receive">Recibir</SelectItem>
            <SelectItem value="auth">Auth</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEntity} onValueChange={(v) => { setFilterEntity(v); }}>
          <SelectTrigger className="h-9 w-44 border-line-strong bg-surface-2 text-fg">
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="product">Producto</SelectItem>
            <SelectItem value="sale">Venta</SelectItem>
            <SelectItem value="user">Usuario</SelectItem>
            <SelectItem value="supplier">Proveedor</SelectItem>
            <SelectItem value="department">Departamento</SelectItem>
            <SelectItem value="customer">Cliente</SelectItem>
            <SelectItem value="order">Pedido</SelectItem>
            <SelectItem value="refund">Reembolso</SelectItem>
            <SelectItem value="tax">Impuesto</SelectItem>
            <SelectItem value="finance">Finanzas</SelectItem>
            <SelectItem value="pieces">Piezas</SelectItem>
            <SelectItem value="settings">Configuración</SelectItem>
            <SelectItem value="import">Importación</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-lg border border-line">
        <Table>
          <TableHeader>
            <TableRow className="border-line bg-surface-2/80 hover:bg-surface-2/80">
              <TableHead className="w-24 text-xs uppercase text-fg-muted">Fecha</TableHead>
              <TableHead className="w-32 text-xs uppercase text-fg-muted">Usuario</TableHead>
              <TableHead className="w-24 text-xs uppercase text-fg-muted">Acción</TableHead>
              <TableHead className="w-32 text-xs uppercase text-fg-muted">Entidad</TableHead>
              <TableHead className="text-xs uppercase text-fg-muted">Descripción</TableHead>
              <TableHead className="w-32 text-xs uppercase text-fg-muted">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-line/60">
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full bg-line/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow className="border-line/60">
                <TableCell colSpan={6} className="py-12 text-center text-fg-subtle">
                  No hay registros de auditoría
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const style = actionStyle(log.action);
                const entLabel = ENTITY_LABELS[log.entity] || log.entity;
                const changes = extractChanges(log);
                const hasDetails = changes.length > 0 || parseDetails(log.details);
                return (
                  <TableRow
                    key={log.id}
                    className={cn(
                      'border-line/60 align-top',
                      hasDetails && 'cursor-pointer hover:bg-surface-2/40'
                    )}
                    onClick={() => hasDetails && setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-fg-muted">
                      {new Date(log.createdAt).toLocaleString('es-MX', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-fg">{log.userName || `#${log.userId}`}</p>
                      <p className="text-[11px] text-fg-subtle">{log.userRole}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', style.className)}>
                        {style.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-fg-muted">
                      {entLabel}
                      {log.entityId != null && (
                        <span className="ml-1 text-xs text-fg-subtle">#{log.entityId}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-fg-muted">
                      <p className="truncate">{log.description}</p>
                      {expanded === log.id && (
                        <div className="mt-2 space-y-2 border-t border-line pt-2">
                          {changes.length > 0 && (
                            <div className="rounded-md border border-line bg-surface-2/60 p-2">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                                Cambios (antes → después)
                              </p>
                              <div className="space-y-1">
                                {changes.map((c) => (
                                  <div key={c.campo} className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <span className="font-medium text-fg">{fieldLabel(c.campo)}:</span>
                                    <span className="rounded bg-red-950/40 px-1.5 py-0.5 font-mono text-red-300 line-through decoration-red-400/50">
                                      {c.antes}
                                    </span>
                                    <ArrowRight className="h-3 w-3 text-fg-subtle" />
                                    <span className="rounded bg-brand/20 px-1.5 py-0.5 font-mono text-brand">
                                      {c.despues}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {parseDetails(log.details) && (
                            <p className="break-words text-xs text-fg-muted">
                              <span className="font-semibold uppercase tracking-wide text-fg-subtle text-[10px]">Detalle: </span>
                              {parseDetails(log.details)}
                            </p>
                          )}
                          {!changes.length && !parseDetails(log.details) && (
                            <p className="text-xs text-fg-subtle italic">Sin detalle adicional</p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-fg-subtle">
                      {log.ip || '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-fg-subtle">
            {pagination.total} registros · página {pagination.page}/{pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchLogs(pagination.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => fetchLogs(pagination.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <LogIn className="h-3 w-3" />
        Los inicios de sesión, creaciones, ediciones (con valores previos), ajustes de stock y recepciones se registran automáticamente. Haz clic en una fila para ver el detalle.
      </div>
    </div>
  );
}
