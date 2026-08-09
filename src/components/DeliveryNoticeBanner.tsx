'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NoticeItem {
  name: string;
  quantity: number;
}

interface Notice {
  id: number;
  orderId: number;
  supplierName: string;
  userName: string;
  items: NoticeItem[];
  createdAt: string;
}

interface NoticeResponse {
  notices: Notice[];
  count: number;
}

export default function DeliveryNoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/delivery-notices');
      if (!res.ok) return;
      const data: NoticeResponse = await res.json();
      setNotices(data.notices || []);
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

  const confirmNotice = async (id: number) => {
    setConfirming(id);
    try {
      const res = await fetch(`/api/delivery-notices/${id}/confirm`, { method: 'POST' });
      if (!res.ok) {
        toast.error('No se pudo confirmar el aviso');
        return;
      }
      toast.success('Llegada confirmada');
      setNotices((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error('Error de conexión');
    } finally {
      setConfirming(null);
    }
  };

  if (notices.length === 0) return null;

  return (
    <div className="w-full border-b border-amber-700/60 bg-amber-950/80 px-4 py-3">
      <div className="space-y-3">
        {notices.map((notice) => (
          <div key={notice.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-200">
                  El pedido de <span className="text-white">{notice.userName}</span> ya llegó
                </p>
                <p className="mt-0.5 text-xs text-amber-300/80 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Pedido #{notice.orderId} · {notice.supplierName} ·{' '}
                  {notice.items.length} producto(s): {notice.items.map((i) => `${i.name}${i.quantity ? ` ×${i.quantity}` : ''}`).join(', ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="border-amber-600/50 text-amber-300 text-[10px]">
                pendiente
              </Badge>
              <Button
                size="sm"
                className="h-8 bg-emerald-700 hover:bg-emerald-600 text-white text-xs"
                disabled={confirming === notice.id}
                onClick={() => confirmNotice(notice.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                {confirming === notice.id ? 'Confirmando...' : 'Confirmar llegada'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}