'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogIn, Search, RefreshCw } from 'lucide-react';
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
  create: { label: 'Crear', className: 'border-emerald-700/50 text-emerald-300 bg-emerald-950/30' },
  update: { label: 'Editar', className: 'border-amber-700/50 text-amber-300 bg-amber-950/30' },
  delete: { label: 'Eliminar', className: 'border-red-700/50 text-red-300 bg-red-950/30' },
  stock: { label: 'Stock', className: 'border-violet-700/50 text-violet-300 bg-violet-950/30' },
  receive: { label: 'Recibir', className: 'border-teal-700/50 text-teal-300 bg-teal-950/30' },
  auth: { label: 'Auth', className: 'border-orange-700/50 text-orange-300 bg-orange-950/30' },
};

function actionStyle(action: string) {
  return ACTION_STYLES[action] || { label: action, className: 'border-slate-600 text-slate-300 bg-slate-800' };
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
};

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

  const parseDetails = (raw: string): string => {
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return raw;
      const parts = Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 0 && v !== false)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
      return parts.join(', ');
    } catch {
      return raw;
    }
  };

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-slate-700" />
        <Skeleton className="h-10 w-full bg-slate-700" />
        <Skeleton className="h-64 w-full bg-slate-700" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-100">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            Registro de Auditoría
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Quién entró al sistema y qué modificaciones hizo. Solo visible para administradores.
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuario o descripción..."
            className="h-9 border-slate-600 bg-slate-800 pl-9 text-slate-100"
          />
        </form>
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); }}>
          <SelectTrigger className="h-9 w-36 border-slate-600 bg-slate-800 text-slate-100">
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
          <SelectTrigger className="h-9 w-44 border-slate-600 bg-slate-800 text-slate-100">
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
      <div className="overflow-hidden rounded-lg border border-slate-700">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800/80 hover:bg-slate-800/80">
              <TableHead className="w-24 text-xs uppercase text-slate-400">Fecha</TableHead>
              <TableHead className="w-32 text-xs uppercase text-slate-400">Usuario</TableHead>
              <TableHead className="w-24 text-xs uppercase text-slate-400">Acción</TableHead>
              <TableHead className="w-32 text-xs uppercase text-slate-400">Entidad</TableHead>
              <TableHead className="text-xs uppercase text-slate-400">Descripción</TableHead>
              <TableHead className="w-32 text-xs uppercase text-slate-400">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-slate-700/60">
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full bg-slate-700/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow className="border-slate-700/60">
                <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                  No hay registros de auditoría
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const style = actionStyle(log.action);
                const entLabel = ENTITY_LABELS[log.entity] || log.entity;
                return (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer border-slate-700/60 align-top hover:bg-slate-800/40"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-slate-400">
                      {new Date(log.createdAt).toLocaleString('es-MX', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-200">{log.userName || `#${log.userId}`}</p>
                      <p className="text-[11px] text-slate-500">{log.userRole}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', style.className)}>
                        {style.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">
                      {entLabel}
                      {log.entityId != null && (
                        <span className="ml-1 text-xs text-slate-500">#{log.entityId}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-slate-300">
                      <p className="truncate">{log.description}</p>
                      {expanded === log.id && (
                        <p className="mt-1 break-words border-t border-slate-700 pt-1 text-xs text-slate-400">
                          {parseDetails(log.details)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-slate-500">
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
          <p className="text-xs text-slate-500">
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

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <LogIn className="h-3 w-3" />
        Los inicios de sesión y las modificaciones se registran automáticamente. Haz clic en una fila para ver el detalle.
      </div>
    </div>
  );
}
