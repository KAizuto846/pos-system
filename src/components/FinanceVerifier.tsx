'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogTitle, DialogClose,
} from '@/components/ui/dialog';
import { ListChecks, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, ShoppingCart, RotateCcw, ArrowUpFromLine, ArrowDownToLine, Percent, Boxes, CircleDollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

interface VerifySummary {
  period?: { from: string; to: string } | null;
  sales: {
    count: number;
    revenue: number;
    totalCost: number;
    grossProfit: number;
    profitMargin: string;
    refunded: { count: number; amount: number; cost: number };
    withdrawn: { profitOnly: number; costFromCombined: number; total: number };
    availableProfit: number;
    combinedAvailable: number;
  };
  cash: {
    balance: number;
    incomeByCategory: Record<string, number>;
    expenseByCategory: Record<string, number>;
    incomeTotal: number;
    expenseTotal: number;
  };
}

interface LastVerified {
  at: string;
  userName: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  sales: 'Ventas',
  manual_deposit: 'Depósito manual',
  profit_withdrawal: 'Retiro de ganancias',
  profit_cost_withdrawal: 'Retiro (ganancias + costos)',
  operating_expense: 'Gasto operativo',
  purchase: 'Compra mercancía',
  extra_purchase: 'Extras de pedido',
  transfer: 'Transferencia',
  refund: 'Reembolso',
  other: 'Otro',
};

function AmountRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div>
        <p className="text-slate-300">{label}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      <p className="font-mono text-slate-100">{value}</p>
    </div>
  );
}

function CategoryChips({ map, tone }: { map: Record<string, number>; tone: 'up' | 'down' }) {
  const entries = Object.entries(map).filter(([, v]) => v !== 0);
  if (entries.length === 0) return <p className="text-xs text-slate-500">Sin movimientos en este período.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([cat, v]) => (
        <Badge
          key={cat}
          variant="outline"
          className={tone === 'down' ? 'border-red-700/50 text-red-300' : 'border-emerald-700/50 text-emerald-300'}
        >
          {CATEGORY_LABELS[cat] || cat}: {formatCurrency(v)}
        </Badge>
      ))}
    </div>
  );
}

interface FinanceVerifierProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: VerifySummary | null;
  userName: string;
  onVerified: (info: LastVerified) => void;
}

export function FinanceVerifier({ open, onOpenChange, summary, userName, onVerified }: FinanceVerifierProps) {
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setChecked([]);
      setSaving(false);
    }
  }, [open]);

  const steps = useMemo(() => {
    if (!summary) return [];
    const s = summary.sales;
    const c = summary.cash;
    const purchaseTotal = c.expenseByCategory.purchase ?? 0;
    const extraTotal = c.expenseByCategory.extra_purchase ?? 0;
    const periodLabel = summary.period?.from || summary.period?.to
      ? `${summary.period?.from || '—'} → ${summary.period?.to || '—'}`
      : 'Todo el período';

const verifySteps = [
      {
        title: 'Ingresos por ventas',
        icon: ShoppingCart,
        body: (
          <div className="space-y-3">
            <AmountRow label="Ventas registradas" value={String(s.count)} sub={periodLabel} />
            <AmountRow label="Ingresos brutos" value={formatCurrency(s.revenue)} sub="Suma de todas las ventas del período" />
          </div>
        ),
        hint: 'Esta cifra debe coincidir con el total que cobraste a los clientes.',
      },
      {
        title: 'Reembolsos',
        icon: RotateCcw,
        body: (
          <div className="space-y-3">
            <AmountRow label="Reembolsos realizados" value={String(s.refunded.count)} />
            <AmountRow label="Importe devuelto" value={formatCurrency(s.refunded.amount)} sub="Se resta de los ingresos" />
            <AmountRow label="Costo recuperado" value={formatCurrency(s.refunded.cost)} sub="Los productos devueltos regresan al inventario" />
          </div>
        ),
        hint: 'Revisa que la cantidad de reembolsos coincida con las devoluciones que realmente hiciste.',
      },
      {
        title: 'Ganancia bruta',
        icon: Percent,
        body: (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3 font-mono text-xs text-slate-300">
              {formatCurrency(s.revenue)} (ventas) − {formatCurrency(s.refunded.amount)} (reembolsos) − {formatCurrency(s.totalCost)} (costo de mercancía) ={' '}
              <span className="text-primary">{formatCurrency(s.grossProfit)}</span>
            </div>
            <AmountRow label="Ganancia bruta" value={formatCurrency(s.grossProfit)} />
            <AmountRow label="Margen" value={`${s.profitMargin || '0'}%`} sub="Sobre los ingresos" />
          </div>
        ),
        hint: 'Es la ganancia antes de gastos, compras y retiros.',
      },
      {
        title: 'Compras y extras',
        icon: Boxes,
        body: (
          <div className="space-y-3">
            <AmountRow label="Compras de mercancía" value={formatCurrency(purchaseTotal)} sub="Descuentan primero del costo total; el excedente sale de la ganancia" />
            <AmountRow label="Extras de pedidos" value={formatCurrency(extraTotal)} sub="Descuentan solo de la ganancia" />
          </div>
        ),
        hint: 'Cada pedido recibido debe reflejar su compra y sus extras aquí.',
      },
      {
        title: 'Retiros de la caja',
        icon: ArrowUpFromLine,
        body: (
          <div className="space-y-3">
            <AmountRow label="Retiros solo de ganancias" value={formatCurrency(s.withdrawn.profitOnly)} />
            <AmountRow label="Costos retirados (retiros combinados)" value={formatCurrency(s.withdrawn.costFromCombined)} />
            <AmountRow label="Total retirado" value={formatCurrency(s.withdrawn.total)} />
          </div>
        ),
        hint: 'Cada retiro que hiciste para el negocio o para ti debe estar aquí.',
      },
      {
        title: 'Resultado disponible',
        icon: CircleDollarSign,
        body: (
          <div className="space-y-3">
            <AmountRow label="Ganancia neta disponible" value={formatCurrency(s.availableProfit)} sub="Ganancia bruta menos compras, extras y retiros" />
            <AmountRow label="Disponible (ganancia + costos)" value={formatCurrency(s.combinedAvailable)} sub="Todo lo que queda por encima del costo de tu inventario" />
          </div>
        ),
        hint: 'Es lo que realmente te queda de las ventas del período.',
      },
      {
        title: 'Caja final',
        icon: ArrowDownToLine,
        body: (
          <div className="space-y-3">
            <AmountRow label="Ingresos en caja" value={formatCurrency(c.incomeTotal)} />
            <AmountRow label="Egresos en caja" value={formatCurrency(c.expenseTotal)} />
            <AmountRow label="Balance de caja" value={formatCurrency(c.balance)} sub="Ingresos − egresos" />
            <Separator />
            <p className="text-xs font-medium text-slate-400">Desglose de ingresos</p>
            <CategoryChips map={c.incomeByCategory} tone="up" />
            <p className="text-xs font-medium text-slate-400 mt-2">Desglose de egresos</p>
            <CategoryChips map={c.expenseByCategory} tone="down" />
          </div>
        ),
        hint: 'El balance de caja debe coincidir con el efectivo y movimientos que registraste.',
      },
    ];

    return [
      ...verifySteps,
      {
        title: 'Registrar verificación',
        icon: ShieldCheck,
        body: (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Revisaste los <strong>{verifySteps.length} pasos</strong> uno por uno y los marcaste como correctos.
            </p>
            <p className="text-sm text-slate-400">
              Al registrar esta verificación se guardará la fecha, la hora y quién la realizó ({userName || '—'}).
            </p>
          </div>
        ),
        hint: 'Esto deja constancia de que los cálculos fueron revisados.',
      },
    ];
  }, [summary, userName]);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isChecked = Boolean(checked[step]);

  const toggleChecked = (value: boolean) => {
    setChecked((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
  };

  const register = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/finance/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: steps.length }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al registrar la verificación');
        return;
      }
      onVerified({ at: data.at, userName: data.userName || userName });
      toast.success('Verificación de finanzas registrada');
      onOpenChange(false);
    } catch {
      toast.error('Error de conexión al registrar');
    } finally {
      setSaving(false);
    }
  };

  const CurrentIcon = current?.icon || ListChecks;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Verificar finanzas
        </DialogTitle>
        <DialogDescription>
          Revisa cada cálculo uno por uno y confírmalo contra lo que realmente hiciste. {steps.length} pasos en total.
        </DialogDescription>

        {!summary ? (
          <p className="py-6 text-center text-sm text-slate-500">Cargando resumen financiero...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-xs">
                Paso {step + 1} de {steps.length}
              </Badge>
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-6 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-slate-700'}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <CurrentIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-3">
                <h3 className="text-base font-semibold text-slate-100">{current.title}</h3>
                {current.body}
                <p className="rounded-md bg-slate-900/60 px-3 py-2 text-xs text-slate-400 border border-slate-700/60">
                  ¿Cómo revisarlo? {current.hint}
                </p>
              </div>
            </div>

            {!isLast && (
              <Label className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2.5 text-sm text-slate-200 cursor-pointer">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(v) => toggleChecked(Boolean(v))}
                  className="mt-0.5"
                />
                <span className="leading-snug">Confirmo que este cálculo coincide con lo que hice.</span>
              </Label>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="secondary" disabled={saving}>Cancelar</Button>
          </DialogClose>
          {!isLast ? (
            <>
              <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button
                disabled={!isChecked || !current}
                onClick={() => setStep((s) => s + 1)}
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button onClick={register} disabled={saving}>
              {saving ? 'Registrando...' : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Registrar verificación
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}