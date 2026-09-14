'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Percent, Clock, Save, Play, RotateCcw, CalendarClock, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';

interface RuleData {
  id: number;
  name: string;
  percentage: number;
  applyTime: string;
  endTime: string;
  scope: string;
  scopeValue: number | null;
  active: boolean;
  status: string;
}

interface HistoryEntry {
  id: number;
  action: string;
  userName: string;
  note: string;
  at: string;
}

interface Supplier { id: number; name: string; }
interface Department { id: number; name: string; }

const SCOPE_LABELS: Record<string, string> = {
  ALL: 'Todos los productos',
  SUPPLIER: 'Productos del proveedor',
  DEPARTMENT: 'Productos del departamento',
  MIN_PRICE: 'Productos con precio mayor o igual a',
};

const ACTION_LABELS: Record<string, string> = {
  apply: 'Activado manualmente',
  revert: 'Revertido manualmente',
  schedule: 'Volvió a horario',
  config: 'Configuración guardada',
};

export default function TaxesPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === 'authenticated' && session?.user?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<null | string>(null);

  const [percentage, setPercentage] = useState('10');
  const [applyTime, setApplyTime] = useState('20:00');
  const [endTime, setEndTime] = useState('');
  const [scope, setScope] = useState('ALL');
  const [scopeValue, setScopeValue] = useState('');
  const [active, setActive] = useState(true);

  const [stateActive, setStateActive] = useState(false);
  const [stateStatus, setStateStatus] = useState('schedule');
  const [affectedCount, setAffectedCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tax/config');
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      if (data.rule) {
        setPercentage(String(data.rule.percentage ?? ''));
        setApplyTime(data.rule.applyTime || '20:00');
        setEndTime(data.rule.endTime || '');
        setScope(data.rule.scope || 'ALL');
        setScopeValue(data.rule.scopeValue != null ? String(data.rule.scopeValue) : '');
        setActive(Boolean(data.rule.active));
      }
      setStateActive(Boolean(data.state?.active));
      setStateStatus(data.state?.status || 'schedule');
      setAffectedCount(Number(data.affectedCount) || 0);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      // si no hay regla configurada el error es normal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    fetch('/api/suppliers').then((r) => (r.ok ? r.json() : [])).then((d) => setSuppliers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/departments').then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
  }, [isAdmin, load]);

  const example = (() => {
    const pct = Number(percentage) || 0;
    const base = 100;
    return { base, taxed: Math.ceil(base * (1 + pct / 100)) };
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        percentage: Number(percentage) || 0,
        applyTime,
        endTime,
        scope,
        scopeValue: scope === 'MIN_PRICE' ? Number(scopeValue) || 0 : scopeValue ? Number(scopeValue) : null,
        active,
      };
      const res = await fetch('/api/tax/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      toast.success('Configuración guardada');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action: string) => {
    setActing(action);
    try {
      const res = await fetch('/api/tax/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(action === 'apply' ? 'Impuesto activado' : action === 'revert' ? 'Impuesto revertido' : 'Volvió al horario automático');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setActing(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-surface-2" />
          <div className="mx-auto h-4 w-48 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="max-w-sm rounded-lg border border-line bg-surface-2 p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-red-400" />
          <h2 className="mt-3 text-lg font-semibold text-fg">Solo administradores</h2>
          <p className="mt-1 text-sm text-fg-muted">Esta página es exclusiva del rol administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <Percent className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-fg">Impuestos</h1>
          <p className="text-sm text-fg-muted">Recargo porcentual por horario sobre el precio público</p>
        </div>
        <div className="ml-auto">
          {loading ? (
            <Badge variant="outline" className="border-line-strong text-fg-muted"><Loader2 className="h-3 w-3 animate-spin mr-1" />Cargando</Badge>
          ) : stateActive ? (
            <Badge className="bg-amber-600 text-amber-50">Activo ahora</Badge>
          ) : (
            <Badge variant="outline" className="border-line-strong text-fg-muted">Inactivo</Badge>
          )}
        </div>
      </div>

      {/* Configuración */}
      <Card className="border-line bg-surface-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-fg flex items-center gap-2">
            <Percent className="h-5 w-5 text-amber-500" />
            Regla del impuesto
          </CardTitle>
          <CardDescription>
            El aumento no modifica el precio base del producto: solo se cobra cuando el horario está activo y se redondea al entero superior (ej. $34.50 → $35).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="tax-pct">Aumento (%)</Label>
              <Input id="tax-pct" type="number" min="0" max="1000" step="0.5" value={percentage} onChange={(e) => setPercentage(e.target.value)} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-time">Aplicar después de las</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-fg-subtle" />
                <Input id="tax-time" type="time" value={applyTime} onChange={(e) => setApplyTime(e.target.value)} className="w-full" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-end-time">Dejar de aplicar a las (opcional)</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-fg-subtle" />
                <Input id="tax-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full" />
              </div>
              {!endTime && (
                <p className="text-[11px] text-fg-subtle">Vacío = aplica sin hora de fin</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer pt-2">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-strong" />
                Regla activa (se puede forzar con los botones)
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Se aplica a</Label>
            <div className="flex flex-wrap gap-2">
              {(['ALL', 'SUPPLIER', 'DEPARTMENT', 'MIN_PRICE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={s === scope
                    ? 'rounded-md border border-primary bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary'
                    : 'rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-fg-muted hover:border-fg-subtle'}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
            {scope === 'SUPPLIER' && (
              <Select value={scopeValue || undefined} onValueChange={setScopeValue}>
                <SelectTrigger className="w-full md:w-72">
                  <SelectValue placeholder="Selecciona el proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 && <SelectItem value="none" disabled>No hay proveedores</SelectItem>}
                  {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {scope === 'DEPARTMENT' && (
              <Select value={scopeValue || undefined} onValueChange={setScopeValue}>
                <SelectTrigger className="w-full md:w-72">
                  <SelectValue placeholder="Selecciona el departamento" />
                </SelectTrigger>
                <SelectContent>
                  {departments.length === 0 && <SelectItem value="none" disabled>No hay departamentos</SelectItem>}
                  {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {scope === 'MIN_PRICE' && (
              <Input type="number" min="0" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder="Precio mínimo" className="w-full md:w-72" />
            )}
          </div>

          <div className="rounded-md border border-line bg-surface/60 px-4 py-3 text-sm text-fg-muted">
            {affectedCount > 0 ? (
              <>
                <span className="font-medium text-fg">{affectedCount} productos</span> afectados · ejemplo: {formatCurrency(example.base)} → <span className="font-bold text-amber-300">{formatCurrency(example.taxed)}</span> con el impuesto activo
              </>
            ) : (
              'Aún no hay regla configurada o no hay productos en el alcance.'
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar configuración
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Acciones manuales */}
      <Card className="border-line bg-surface-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-fg flex items-center gap-2">
            <Play className="h-5 w-5 text-brand" />
            Acciones manuales
          </CardTitle>
          <CardDescription>
            Fuerza el estado del impuesto sin esperar al horario. Queda registrado quién lo hizo y cuándo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="default" onClick={() => handleAction('apply')} disabled={acting !== null || stateStatus === 'forced_on'}>
            {acting === 'apply' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Aplicar ahora
          </Button>
          <Button type="button" variant="destructive" onClick={() => handleAction('revert')} disabled={acting !== null || stateStatus === 'forced_off'}>
            {acting === 'revert' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Revertir (precios base)
          </Button>
          <Button type="button" variant="outline" onClick={() => handleAction('schedule')} disabled={acting !== null || stateStatus === 'schedule'}>
            {acting === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarClock className="h-4 w-4 mr-2" />}
            Volver a horario automático
          </Button>
          {stateStatus === 'forced_on' && <Badge className="bg-amber-600 text-amber-50 self-center">Activado manualmente</Badge>}
          {stateStatus === 'forced_off' && <Badge variant="outline" className="border-amber-600 text-amber-300 self-center">Revertido manualmente</Badge>}
        </CardContent>
      </Card>

      {/* Historial */}
      <Card className="border-line bg-surface-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-fg flex items-center gap-2">
            <Clock className="h-5 w-5 text-fg-muted" />
            Historial
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-fg-subtle">Sin registros todavía.</p>
          ) : (
            <div className="divide-y divide-line/60">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{ACTION_LABELS[h.action] || h.action}</p>
                    <p className="text-xs text-fg-subtle truncate">{h.note}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-fg-muted">{new Date(h.at).toLocaleString('es-MX')}</p>
                    <p className="text-xs text-fg-subtle">{h.userName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}