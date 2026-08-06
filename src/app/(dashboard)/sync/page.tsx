'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  RefreshCw,
  Wifi,
  CheckCircle2,
  XCircle,
  Server,
  MonitorDot,
  Loader2,
  Radio,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SyncStats {
  totalChanges: number;
  pendingSync: number;
  lastChangeAt: string | null;
}

export default function SyncPage() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [peers, setPeers] = useState<DiscoveredServer[]>([]);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ mode?: string; serverPort?: number; deviceName?: string; businessName?: string }>({});
  const [syncing, setSyncing] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  const loadPeers = useCallback(async () => {
    const win = window as unknown as { electronAPI?: Window['electronAPI'] };
    if (win.electronAPI?.getDiscoveredServers) {
      const found = await win.electronAPI.getDiscoveredServers();
      setIsElectron(true);
      setPeers(Array.isArray(found) ? found : []);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Ignore, non-critical
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStats(), loadPeers()]);
    const win = window as unknown as { electronAPI?: Window['electronAPI'] };
    if (win.electronAPI?.getConfig) {
      win.electronAPI.getConfig().then((cfg) => {
        setDeviceInfo(cfg || {});
      }).catch(() => {});
    }
    if (win.electronAPI?.getLastSyncResult) {
      win.electronAPI.getLastSyncResult().then(setLastResult).catch(() => {});
    }
  }, [loadStats, loadPeers]);

  useEffect(() => {
    (async () => {
      await loadAll();
      await loadPeers();
    })();
    const interval = setInterval(() => {
      loadAll();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAll, loadPeers]);

  const handleSyncNow = async () => {
    const win = window as unknown as { electronAPI?: Window['electronAPI'] };
    if (!win.electronAPI?.triggerSync) {
      toast.error('La sincronizacion manual solo esta disponible en la aplicacion de escritorio');
      return;
    }
    setSyncing(true);
    try {
      const result = await win.electronAPI.triggerSync();
      if (result && 'at' in result) {
        setLastResult(result);
        toast.success(`Sincronizacion completada (${result.peers} dispositivo${result.peers === 1 ? '' : 's'})`);
      } else {
        toast.error(result?.error || 'No se pudo sincronizar');
      }
      await loadAll();
    } catch (error) {
      toast.error('Error al sincronizar');
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const selfUrl = `http://localhost:${deviceInfo.serverPort || 3000}`;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Sincronizacion P2P</h1>
        <p className="text-slate-400 mt-1">
          Todos los dispositivos son pares iguales: cada uno ejecuta su propia base de datos y se sincroniza automaticamente cada 30 segundos.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-700 bg-slate-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <MonitorDot className="h-5 w-5 text-emerald-500" />
              Dispositivos detectados en la red
            </CardTitle>
            <CardDescription>
              Equipos descubiertos mediante UDP (multicast/broadcast en el puerto 9876).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {peers.length > 0 ? (
              <ul className="divide-y divide-slate-700">
                {peers.map((peer) => (
                  <li key={`${peer.ip}:${peer.port}`} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-slate-300 flex-shrink-0">
                        <Server className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{peer.name || 'Equipo'}</p>
                        <p className="text-xs text-slate-400 font-mono">{peer.ip}:{peer.port}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/50 flex-shrink-0">
                      <Radio className="h-3 w-3 mr-1" />
                      En linea
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Wifi className="h-10 w-10 text-slate-600 mb-3" />
                {isElectron ? (
                  <p className="text-sm text-slate-400">
                    No se encontraron otros dispositivos.
                    <br />
                    Asegurate de que otro equipo corra este POS en la misma red.
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">
                    Ejecuta la aplicacion de escritorio para descubrir otros equipos en la red.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Acciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full gap-2"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </Button>
            <div className="rounded-md bg-slate-700/50 px-4 py-3 text-sm text-slate-400">
              Mi dispositivo: <span className="text-slate-200 font-mono">{selfUrl}</span>
            </div>
            <div className="rounded-md bg-slate-700/50 px-4 py-3 text-sm text-slate-400">
              Nombre: <span className="text-slate-200 font-mono">{deviceInfo.deviceName || '—'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Ultima sincronizacion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastResult ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Momento:</span>
                  <span className="text-slate-200">{new Date(lastResult.at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pares:</span>
                  <span className="text-slate-200">{lastResult.peers}</span>
                </div>
                {lastResult.results.map((r) => (
                  <div key={r.peer} className="rounded-md bg-slate-700/40 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 font-mono truncate">{r.peer}</span>
                    {r.ok ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {r.pulled + r.pushed} cambios
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="h-3.5 w-3.5" />
                        Offline
                      </span>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Aun no se ha ejecutado una sincronizacion. Se sincronizara automaticamente cada 30 segundos o pulse &quot;Sincronizar ahora&quot;.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-500" />
              Registro de cambios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Cambios totales registrados:</span>
              <span className="text-slate-200 font-mono">{stats?.totalChanges ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Pendientes de sincronizar:</span>
              <span className={cn('font-mono', (stats?.pendingSync ?? 0) > 0 ? 'text-slate-200' : 'text-emerald-400')}>
                {stats?.pendingSync ?? '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Ultimo cambio:</span>
              <span className="text-slate-200">
                {stats?.lastChangeAt ? new Date(stats.lastChangeAt).toLocaleString() : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Wifi className="h-5 w-5 text-emerald-500" />
              Ayuda
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-2">
            <p>
              <span className="text-slate-200 font-medium">P2P:</span> No hay un servidor central.
              Cada equipo tiene su copia de la base de datos y comparte sus cambios con los demas.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Resolucion de conflictos:</span> Cuando dos
              equipos modifican el mismo registro, gana el cambio mas reciente (Last-Write-Wins).
            </p>
            <p>
              <span className="text-slate-200 font-medium">Descubrimiento:</span> Los equipos se encuentran
              automaticamente al estar en la misma red. Se sincronizan cada 30 segundos.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}