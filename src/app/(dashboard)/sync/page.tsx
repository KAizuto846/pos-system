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
  Cloud,
  Plug,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SyncStats {
  totalChanges: number;
  pendingSync: number;
  lastChangeAt: string | null;
}

interface RelayState {
  relayUrl?: string;
  hasSecret?: boolean;
  connected?: boolean;
  lastTestError?: string | null;
  relayStoredChanges?: number | null;
}

interface RelaySyncResult {
  ok: boolean;
  pulled: number;
  pushed: number;
  error: string | null;
  at?: string;
}

export default function SyncPage() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [peers, setPeers] = useState<DiscoveredServer[]>([]);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ mode?: string; serverPort?: number; deviceName?: string; businessName?: string }>({});
  const [syncing, setSyncing] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  // Relay state
  const [relayState, setRelayState] = useState<RelayState>({});
  const [relayUrl, setRelayUrl] = useState('');
  const [relaySecret, setRelaySecret] = useState('');
  const [relayTesting, setRelayTesting] = useState(false);
  const [relaySaving, setRelaySaving] = useState(false);
  const [relayLastSync, setRelayLastSync] = useState<RelaySyncResult | null>(null);

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

  const loadRelayConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/relay/config');
      if (res.ok) {
        const data = await res.json();
        setRelayState(data);
        setRelayUrl(data.relayUrl || '');
      }
    } catch {
      // Ignore, non-critical
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStats(), loadPeers(), loadRelayConfig()]);
    const win = window as unknown as { electronAPI?: Window['electronAPI'] };
    if (win.electronAPI?.getConfig) {
      win.electronAPI.getConfig().then((cfg) => {
        setDeviceInfo(cfg || {});
      }).catch(() => {});
    }
    if (win.electronAPI?.getLastSyncResult) {
      win.electronAPI.getLastSyncResult().then(setLastResult).catch(() => {});
    }
  }, [loadStats, loadPeers, loadRelayConfig]);

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
    setSyncing(true);
    let electronDone = false;
    try {
      // 1) Relay sync (funciona en web y escritorio)
      const relayRes = await fetch('/api/sync/relay/trigger', { method: 'POST' });
      if (relayRes.ok) {
        const relayResult: RelaySyncResult = await relayRes.json();
        setRelayLastSync(relayResult);
        if (relayResult.ok) {
          toast.success(`Relay: +${relayResult.pulled} recibidos, +${relayResult.pushed} enviados`);
        } else if (relayResult.error) {
          toast.error(`Relay: ${relayResult.error}`);
        }
      } else {
        toast.error('No se pudo contactar el relay local');
      }

      // 2) Sync LAN (solo escritorio)
      if (win.electronAPI?.triggerSync) {
        const result = await win.electronAPI.triggerSync();
        electronDone = true;
        if (result && 'at' in result) {
          setLastResult(result);
          if (result.peers > 0) {
            toast.success(`LAN: ${result.peers} dispositivo${result.peers === 1 ? '' : 's'} sincronizado${result.peers === 1 ? '' : 's'}`);
          }
        } else if (result?.error) {
          toast.error(`LAN: ${result.error}`);
        }
      }
      if (!electronDone && !win.electronAPI) {
        toast.success('Sincronizacion completada');
      }
      await loadAll();
    } catch (error) {
      toast.error('Error al sincronizar');
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleTestRelay = async () => {
    setRelayTesting(true);
    try {
      const res = await fetch('/api/sync/relay/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relayUrl, syncSecret: relaySecret }),
      });
      const data = await res.json();
      if (data.ok) {
        setRelayState((prev) => ({ ...prev, connected: true, lastTestError: null, relayStoredChanges: data.storedChanges }));
        toast.success(`Conexion exitosa (${data.storedChanges ?? 0} cambios en el relay)`);
      } else {
        setRelayState((prev) => ({ ...prev, connected: false, lastTestError: data.error }));
        toast.error(`Sin conexion: ${data.error || 'error desconocido'}`);
      }
    } catch {
      toast.error('Error al probar la conexion');
    } finally {
      setRelayTesting(false);
    }
  };

  const handleSaveRelay = async () => {
    setRelaySaving(true);
    try {
      const res = await fetch('/api/sync/relay/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relayUrl, syncSecret: relaySecret }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Relay configurado correctamente');
        await loadRelayConfig();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar la configuracion');
    } finally {
      setRelaySaving(false);
    }
  };

  const selfUrl = `http://localhost:${deviceInfo.serverPort || 3000}`;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Sincronizacion</h1>
        <p className="text-slate-400 mt-1">
          Sincronizacion P2P en la red local + sincronizacion por internet via relay.
        </p>
      </div>

      {/* Relay (internet) */}
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-sky-500" />
            Sincronizacion por internet (Relay)
          </CardTitle>
          <CardDescription>
            Conecta este equipo a un relay en la nube para sincronizar con dispositivos fuera de tu red local. Todos los equipos deben usar el mismo relay y el mismo secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="relayUrl">URL del relay</Label>
              <Input
                id="relayUrl"
                type="text"
                placeholder="https://sync.tudominio.com"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relaySecret">Secret compartido (SYNC_SECRET)</Label>
              <Input
                id="relaySecret"
                type="password"
                placeholder="El mismo en todos los equipos"
                value={relaySecret}
                onChange={(e) => setRelaySecret(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={handleTestRelay} disabled={relayTesting || !relayUrl.trim()} className="gap-2">
              {relayTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Probar conexion
            </Button>
            <Button onClick={handleSaveRelay} disabled={relaySaving || !relayUrl.trim()} className="gap-2">
              {relaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
            {relayState.relayUrl && (
              <Badge variant="outline" className={cn(relayState.connected ? 'text-emerald-400 border-emerald-500/50' : 'text-red-400 border-red-500/50')}>
                {relayState.connected ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Conectado{relayState.relayStoredChanges != null ? ` (${relayState.relayStoredChanges} cambios)` : ''}
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Sin conexion{relayState.lastTestError ? `: ${relayState.lastTestError}` : ''}
                  </>
                )}
              </Badge>
            )}
          </div>

          {relayLastSync && (
            <div className="rounded-md bg-slate-700/50 px-4 py-3 text-sm text-slate-400">
              Ultima sincronizacion por relay: {relayLastSync.at ? new Date(relayLastSync.at).toLocaleString() : '—'}
              {relayLastSync.ok
                ? ` — recibidos: ${relayLastSync.pulled}, enviados: ${relayLastSync.pushed}`
                : relayLastSync.error ? ` — ${relayLastSync.error}` : ''}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-700 bg-slate-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <MonitorDot className="h-5 w-5 text-emerald-500" />
              Dispositivos detectados en la red
            </CardTitle>
            <CardDescription>
              Equipos descubiertos mediante UDP (multicast/broadcast en el puerto 9876). Solo disponible en la aplicacion de escritorio.
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
                    No se encontraron otros dispositivos en la red local.
                    <br />
                    Si los equipos estan en redes distintas, configura el relay de arriba.
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">
                    El descubrimiento LAN solo esta disponible en la aplicacion de escritorio.
                    <br />
                    Para sincronizar desde el navegador, configura el relay de arriba.
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
            <p className="text-xs text-slate-500">
              Sincroniza con el relay (internet) y, si usas la version de escritorio, tambien con los equipos de la red local.
            </p>
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
              Ultima sincronizacion LAN
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
                La sincronizacion LAN se ejecuta automaticamente cada 30 segundos en la version de escritorio.
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
              <span className="text-slate-200 font-medium">P2P (red local):</span> Cada equipo
              comparte sus cambios con los demas de la misma red, automaticamente cada 30 segundos.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Relay (internet):</span> Un servidor en
              la nube guarda los cambios de todos los equipos y los retransmite, para sincronizar
              sin importar la red en la que este cada uno.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Resolucion de conflictos:</span> Cuando dos
              equipos modifican el mismo registro, gana el cambio mas reciente (Last-Write-Wins).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
