'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface StockAlertItem {
  id: number;
  saleId: number;
  productName: string;
  quantitySold: number;
  stockBefore: number;
  stockAfter: number;
  shortage: number;
  createdAt: string;
}

interface StockAlertResponse {
  alerts: StockAlertItem[];
  count: number;
}

export default function StockAlertBanner() {
  const [alerts, setAlerts] = useState<StockAlertItem[]>([]);
  const [acking, setAcking] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stock-alerts');
      if (!res.ok) return;
      const data: StockAlertResponse = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // Sin conexión o servidor arrancando: silencioso
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [load]);

  const ack = async (id: number) => {
    setAcking(id);
    try {
      const res = await fetch(`/api/stock-alerts/${id}/ack`, { method: 'POST' });
      if (!res.ok) {
        toast.error('No se pudo reconocer el aviso');
        return;
      }
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error('Error de conexión');
    } finally {
      setAcking(null);
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="w-full border-b border-red-800/60 bg-red-950/80 px-4 py-3">
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-200">
                  Se cobró <span className="text-white">{alert.productName}</span> sin existencia
                </p>
                <p className="mt-0.5 text-xs text-red-300/80 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Venta #{alert.saleId} · {alert.quantitySold} unidad(es) cobradas, stock {alert.stockBefore} → {alert.stockAfter}
                  {alert.shortage > 0 && <> · faltaban {alert.shortage}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="border-red-700/60 text-red-300 text-[10px]">
                pendiente
              </Badge>
              <Button
                size="sm"
                className="h-8 bg-red-800 hover:bg-red-700 text-white text-xs"
                disabled={acking === alert.id}
                onClick={() => ack(alert.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                {acking === alert.id ? 'Reconociendo...' : 'Reconocer'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
