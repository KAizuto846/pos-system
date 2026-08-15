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
  ChevronDown,
  ShieldCheck,
  Terminal,
  Copy,
  Search,
  Network,
  Globe,
  Users,
  KeyRound,
  Unplug,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  const [deviceInfo, setDeviceInfo] = useState<{ mode?: string; serverPort?: number; deviceName?: string; businessName?: string; platform?: string; serverIP?: string }>({});
  const [syncing, setSyncing] = useState(false);
  const [peersSearching, setPeersSearching] = useState(false);
  const [peersUpdatedAt, setPeersUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [diagRunning, setDiagRunning] = useState(false);

  // Relay state
  const [relayState, setRelayState] = useState<RelayState>({});
  const [relayUrl, setRelayUrl] = useState('');
  const [relaySecret, setRelaySecret] = useState('');
  const [relayTesting, setRelayTesting] = useState(false);
  const [relaySaving, setRelaySaving] = useState(false);
  const [relayLastSync, setRelayLastSync] = useState<RelaySyncResult | null>(null);

  // Tailscale (acceso remoto)
  const [tsState, setTsState] = useState<{
    available?: boolean;
    online?: boolean;
    ip?: string | null;
    dnsName?: string | null;
    error?: string | null;
    funnelUrl?: string | null;
    funnelEnabled?: boolean;
    serveEnabled?: boolean;
    capUrl?: string;
    funnelReachable?: boolean | null;
  }>({});
  const [tsDialogOpen, setTsDialogOpen] = useState(false);
  const [tsAuthkey, setTsAuthkey] = useState('');
  const [tsFunnelOn, setTsFunnelOn] = useState(true);
  const [tsBusy, setTsBusy] = useState<'connect' | 'disconnect' | 'repair' | null>(null);
  const [tsProgress, setTsProgress] = useState<string[]>([]);
  const [tsDone, setTsDone] = useState<string | null>(null);

  const loadTailscaleStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tailscale/status');
      if (res.ok) {
        setTsState(await res.json());
      }
    } catch {
      // Ignorar, no critico
    }
  }, []);

  useEffect(() => {
    loadTailscaleStatus();
    const t = setInterval(loadTailscaleStatus, 30000);
    return () => clearInterval(t);
  }, [loadTailscaleStatus]);

  // Progreso del asistente de conexion remota (electron)
  useEffect(() => {
    if (!tsDialogOpen || !win.electronAPI?.onTailscaleProgress) return;
    const off = win.electronAPI.onTailscaleProgress((msg: string) => {
      setTsProgress((prev) => [...prev, msg]);
    });
    return off;
  }, [tsDialogOpen]);

  const openTsSetup = () => {
    setTsAuthkey('');
    setTsFunnelOn(true);
    setTsProgress([]);
    setTsDone(null);
    setTsDialogOpen(true);
  };

  const runTsSetup = async () => {
    if (tsBusy) return;
    setTsBusy('connect');
    setTsProgress([]);
    setTsDone(null);
    try {
      const res = await win.electronAPI?.setupTailscale?.({
        authkey: tsAuthkey.trim(),
        funnel: tsFunnelOn,
        port: deviceInfo.serverPort || 3000,
      });
      if (!res) throw new Error('No disponible en esta version de la app');
      if (res.ok) {
        setTsDone('Conexion remota lista. Ya puedes abrir el POS desde el celular.');
        loadTailscaleStatus();
      } else if (res.code === 'funnel-not-enabled') {
        setTsDone(`La URL no es pública todavía. ${res.error || ''}${res.capUrl ? ' Se abrió el enlace para habilitarlo.' : ''}`);
        if (res.capUrl) window.open(res.capUrl, '_blank');
      } else if (res.code === 'url-not-reachable') {
        setTsDone(`La URL pública ${res.url || ''} no responde todavía: ${res.error || 'verifica el certificado HTTPS en unos minutos.'}`);
      } else {
        setTsDone(`Error: ${res.error || 'desconocido'}`);
      }
    } catch (e) {
      setTsDone(e instanceof Error ? e.message : 'Error al conectar');
    } finally {
      setTsBusy(null);
    }
  };

  const runTsDisconnect = async () => {
    if (tsBusy) return;
    if (!window.confirm('¿Desconectar este equipo de Tailscale y apagar la URL publica?')) return;
    setTsBusy('disconnect');
    setTsProgress([]);
    setTsDone(null);
    try {
      const res = await win.electronAPI?.disconnectTailscale?.();
      setTsDone(res?.ok ? 'Desconectado. La URL publica ya no funciona.' : `Error: ${res?.error || 'desconocido'}`);
      if (res?.ok) {
        loadTailscaleStatus();
        setTimeout(loadTailscaleStatus, 2500);
      }
    } catch (e) {
      setTsDone(e instanceof Error ? e.message : 'Error al desconectar');
    } finally {
      setTsBusy(null);
    }
  };

  const runTsRepair = async () => {
    if (tsBusy) return;
    setTsBusy('repair');
    setTsProgress([]);
    setTsDone(null);
    try {
      const res = await win.electronAPI?.repairTailscale?.();
      if (!res) throw new Error('No disponible en esta version de la app');
      if (res.needsLogin) {
        setTsDone(`Se necesita autenticacion manual. ${res.loginUrl ? `Abre este enlace en el navegador: ${res.loginUrl}` : 'Ejecuta "tailscale up" y sigue el enlace, o guarda la authkey.'}`);
      } else if (res.ok) {
        setTsDone(`Reparado correctamente (${res.repaired || 'ok'}).`);
        loadTailscaleStatus();
        setTimeout(loadTailscaleStatus, 2500);
      } else if (res.code === 'funnel-not-enabled') {
        setTsDone(`La URL no es pública todavía. ${res.error || ''}${res.capUrl ? ' Se abrió el enlace para habilitarlo.' : ''}`);
        if (res.capUrl) window.open(res.capUrl, '_blank');
      } else if (res.code === 'url-not-reachable') {
        setTsDone(`La URL pública ${res.url || ''} no responde todavía: ${res.error || 'espera unos minutos a que se genere el certificado HTTPS.'}`);
      } else {
        setTsDone(`Error: ${res.error || 'desconocido'}`);
      }
    } catch (e) {
      setTsDone(e instanceof Error ? e.message : 'Error al reparar');
    } finally {
      setTsBusy(null);
    }
  };

  const openTsRepair = () => {
    setTsAuthkey('');
    setTsProgress([]);
    setTsDone(null);
    setTsDialogOpen(true);
    void runTsRepair();
  };

  const win = window as unknown as { electronAPI?: Window['electronAPI'] };
  const isDesktop = !!win.electronAPI;
  const isWindows = deviceInfo.platform === 'win32';

  const loadPeers = useCallback(async () => {
    if (win.electronAPI?.getDiscoveredServers) {
      const found = await win.electronAPI.getDiscoveredServers();
      setPeers(Array.isArray(found) ? found : []);
      setPeersUpdatedAt(new Date());
      return;
    }
    // Web: el discovery lo hace el servidor (ver /api/sync/lan/peers)
    try {
      const res = await fetch('/api/sync/lan/peers');
      if (res.ok) {
        const data = await res.json();
        setPeers(Array.isArray(data.peers) ? data.peers : []);
        setPeersUpdatedAt(new Date());
      }
    } catch {
      // Ignorar, no critico
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
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAll, loadPeers]);

  const handleSearchPeers = async () => {
    setPeersSearching(true);
    try {
      await loadPeers();
    } finally {
      setTimeout(() => setPeersSearching(false), 400);
    }
  };

  const handleCopyUrl = async () => {
    const url = selfUrl;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copiada al portapapeles');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const [copyingPeer, setCopyingPeer] = useState<string | null>(null);

  const handleCopyFullDb = async (peer: DiscoveredServer) => {
    const peerUrl = `${peer.ip}:${peer.port}`;
    const confirmed = window.confirm(
      `¿Copiar TODA la base de datos de "${peer.name || peerUrl}" a este equipo?\n\n` +
      'Se REEMPLAZARÁ toda la información local (productos, ventas, finanzas, usuarios) ' +
      'con la base de datos del otro equipo.\n\nEsta acción no se puede deshacer. ¿Continuar?'
    );
    if (!confirmed) return;
    setCopyingPeer(peerUrl);
    try {
      if (win.electronAPI?.copyFullDb) {
        const res = await win.electronAPI.copyFullDb(peerUrl);
        if (res.ok) {
          toast.success('Base de datos copiada correctamente');
        } else {
          toast.error(`Error: ${res.error || 'No se pudo copiar'}`);
        }
      } else {
        const res = await fetch('/api/sync/full-db-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerUrl }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          toast.success('Base de datos copiada correctamente');
        } else {
          toast.error(data.error || 'Error al copiar');
        }
      }
    } catch {
      toast.error('Error al copiar la base de datos');
    } finally {
      setCopyingPeer(null);
    }
  };

  const handleOpenFirewall = async () => {
    if (!isWindows) {
      toast.error('Solo disponible en la versión de escritorio para Windows');
      return;
    }
    const res = await win.electronAPI!.openFirewall();
    if (res.ok) {
      toast.success('Abriendo Firewall de Windows...');
    } else {
      toast.error(res.error || 'No se pudo abrir el firewall');
    }
  };

  const handleOpenDiagnostics = async () => {
    if (!isWindows) {
      toast.error('Solo disponible en la versión de escritorio para Windows');
      return;
    }
    setDiagRunning(true);
    const res = await win.electronAPI!.openDiagnostics();
    setDiagRunning(false);
    if (res.ok) {
      toast.success('Ventana de verificación abierta');
    } else {
      toast.error(res.error || 'No se pudo abrir el diagnostico');
    }
  };

  const handleSyncNow = async () => {
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

      // 2) Sync LAN
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
      } else {
        // Web: el sync LAN lo ejecuta el servidor
        const lanRes = await fetch('/api/sync/lan/trigger', { method: 'POST' });
        if (lanRes.ok) {
          const lanResult = await lanRes.json();
          setLastResult(lanResult.ok ? { at: lanResult.at, peers: lanResult.peers, results: lanResult.results } : null);
          if (lanResult.peers > 0) {
            toast.success(`LAN: ${lanResult.peers} dispositivo${lanResult.peers === 1 ? '' : 's'} sincronizado${lanResult.peers === 1 ? '' : 's'}`);
          }
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
        toast.success(`Conexión exitosa (${data.storedChanges ?? 0} cambios en el relay)`);
      } else {
        setRelayState((prev) => ({ ...prev, connected: false, lastTestError: data.error }));
        toast.error(`Sin conexión: ${data.error || 'error desconocido'}`);
      }
    } catch {
      toast.error('Error al probar la conexión');
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
      toast.error('Error al guardar la configuración');
    } finally {
      setRelaySaving(false);
    }
  };

  // URL accesible desde otros equipos/teléfonos: usa la IP LAN real si está disponible
  const lanIp = (deviceInfo as { serverIP?: string })?.serverIP || '';
  const selfUrl = lanIp
    ? `http://${lanIp}:${deviceInfo.serverPort || 3000}`
    : `http://localhost:${deviceInfo.serverPort || 3000}`;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Sincronizacion</h1>
          <p className="text-slate-400 mt-1">
            Conecta tus equipos para que compartan inventario, ventas y productos en tiempo real.
          </p>
        </div>
        <Badge variant="outline" className={cn('self-start sm:self-auto', isDesktop ? 'text-emerald-400 border-emerald-500/50' : 'text-sky-400 border-sky-500/50')}>
          {isDesktop ? 'Version de escritorio' : 'Version web'}
        </Badge>
      </div>

      {/* Mi equipo */}
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <MonitorDot className="h-5 w-5 text-emerald-500" />
            Mi equipo
          </CardTitle>
          <CardDescription>
            {isDesktop
              ? 'Este equipo inicia un servidor local y se detecta con los demas automaticamente.'
              : 'Estas viendo la version web: el servidor donde esta alojada se encarga de la sincronizacion.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md bg-slate-900/60 border border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500">Nombre del equipo</p>
            <p className="text-sm text-slate-200 font-medium mt-1">{deviceInfo.deviceName || '—'}</p>
          </div>
          <div className="rounded-md bg-slate-900/60 border border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500">Tu direccion local (compartela con tus equipos)</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-slate-200 font-mono truncate">{selfUrl}</p>
              <button type="button" onClick={handleCopyUrl} className="text-slate-400 hover:text-slate-200 transition-colors shrink-0" title="Copiar URL">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="rounded-md bg-slate-900/60 border border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500">Servidor local</p>
            <p className="text-sm text-slate-200 font-medium mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
              En linea (puerto {deviceInfo.serverPort || 3000})
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Acceso remoto (Tailscale) */}
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <Globe className="h-5 w-5 text-sky-500" />
            Acceso desde cualquier WiFi (Tailscale)
          </CardTitle>
          <CardDescription>
            Publica este equipo en internet para abrir el POS desde celulares y laptops aunque no esten en tu red local.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tsState.available === undefined ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Verificando...</div>
          ) : !tsState.available ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <XCircle className="h-4 w-4 text-slate-500 shrink-0" />
              Tailscale no esta instalado en este equipo. En Windows: instala la app POS con el paso de conexion remota, o desde docs/INTERNET-ACCESS.md.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {tsState.online ? (
                  <Badge className="bg-emerald-600 text-emerald-50"><CheckCircle2 className="h-3 w-3 mr-1" />Conectado a la red remota</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-600 text-amber-300"><XCircle className="h-3 w-3 mr-1" />Instalado pero sin conexion</Badge>
                )}
              </div>
              {tsState.ip && (
                <div className="rounded-md bg-slate-900/60 border border-slate-700 px-4 py-3">
                  <p className="text-xs text-slate-500">IP privada (acceso solo entre tus equipos)</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-slate-200 font-mono truncate">http://{tsState.ip}:{deviceInfo.serverPort || 3000}</p>
                    <button type="button" onClick={() => { if (tsState.ip) void navigator.clipboard?.writeText(`http://${tsState.ip}:${deviceInfo.serverPort || 3000}`); }} className="text-slate-400 hover:text-slate-200 transition-colors shrink-0" title="Copiar URL privada">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {tsState.dnsName && (
                <div className="rounded-md bg-slate-900/60 border border-slate-700 px-4 py-3">
                  <p className="text-xs text-slate-500">
                    {tsState.funnelEnabled ? 'URL publica (desde cualquier WiFi)' : 'URL privada (solo funciona con Tailscale instalado)'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-sky-300 font-mono truncate">https://{tsState.dnsName}/</p>
                    <button type="button" onClick={() => { if (tsState.dnsName) void navigator.clipboard?.writeText(`https://${tsState.dnsName}/`); }} className="text-slate-400 hover:text-slate-200 transition-colors shrink-0" title="Copiar URL">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {tsState.funnelEnabled && tsState.funnelReachable === false && (
                    <p className="text-[11px] text-red-400 mt-1.5">
                      La URL publica NO responde todavía (el certificado HTTPS puede tardar unos minutos en generarse). Reintenta en un momento o pulsa &quot;Reparar automaticamente&quot;.
                    </p>
                  )}
                  {tsState.funnelEnabled && tsState.funnelReachable !== false && (
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Abrela desde el celular con datos moviles. La URL esta protegida por el login del POS; usa una contrasena fuerte.
                    </p>
                  )}
                  {!tsState.funnelEnabled && (
                    <>
                      <p className="text-[11px] text-amber-400 mt-1.5">
                        La URL solo funciona entre equipos con Tailscale. Para abrirla desde cualquier WiFi hay que habilitar Funnel en la consola de Tailscale.
                      </p>
                      {tsState.capUrl && (
                        <Button variant="outline" size="sm" type="button" onClick={() => window.open(tsState.capUrl!, '_blank')} className="text-xs mt-2 text-sky-400 hover:text-sky-300 border-sky-800/60 hover:border-sky-700">
                          <Globe className="h-3.5 w-3.5 mr-1.5" />
                          Habilitar Funnel (abrir consola)
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
              {tsState.error && <p className="text-xs text-red-400">{tsState.error}</p>}
            </>
          )}
          {isDesktop && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" type="button" onClick={openTsSetup} className="text-xs">
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                Configurar conexion
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={openTsRepair} disabled={tsBusy !== null} className="text-xs text-amber-400 hover:text-amber-300 border-amber-800/60 hover:border-amber-700">
                <Wrench className="h-3.5 w-3.5 mr-1.5" />
                Reparar automaticamente
              </Button>
              {tsState.available && (
                <Button variant="outline" size="sm" type="button" onClick={runTsDisconnect} disabled={tsBusy !== null} className="text-xs text-red-400 hover:text-red-300 border-red-800/60 hover:border-red-700">
                  {tsBusy === 'disconnect' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5 mr-1.5" />}
                  Desconectar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <Network className="h-5 w-5 text-emerald-500" />
            Conectar mis equipos (red local)
          </CardTitle>          <CardDescription>
            Tres pasos simples. Los equipos conectados se sincronizan solos en tiempo real (cada 5 segundos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Paso 1 */}
          <div className="flex items-start gap-3 rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-400 text-sm font-bold shrink-0 mt-0.5">1</div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">Conecta todos los equipos a la misma red</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Mismo router/WiFi. Si usas WiFi, desactiva el <span className="text-amber-400">aislamiento de clientes</span> del router (lo bloquea la sincronizacion).
              </p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-1 ml-auto" />
          </div>

          {/* Paso 2 */}
          <div className="flex items-start gap-3 rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-400 text-sm font-bold shrink-0 mt-0.5">2</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200">Permite la app en el Firewall de Windows</p>
              <p className="text-xs text-slate-400 mt-0.5">
                La primera vez que instalas POS System, Windows pregunta si quieres permitir la red. Aceptalo para redes privadas.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={handleOpenFirewall} disabled={!isWindows} className="text-xs" title={isWindows ? 'Abrir Firewall de Windows' : 'Solo en la app de escritorio para Windows'}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  Abrir Firewall
                </Button>
                <Button variant="outline" size="sm" onClick={handleOpenDiagnostics} disabled={!isWindows || diagRunning} className="text-xs" title={isWindows ? 'Abrir ventana de verificacion' : 'Solo en la app de escritorio para Windows'}>
                  {diagRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5 mr-1.5" />}
                  Verificar requisitos
                </Button>
                {!isWindows && (
                  <span className="text-[11px] text-slate-500 self-center">(los botones se activan en la app de Windows)</span>
                )}
              </div>
            </div>
            {isWindows && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-1 ml-auto" />}
          </div>

          {/* Paso 3 */}
          <div className="flex items-start gap-3 rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-400 text-sm font-bold shrink-0 mt-0.5">3</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-slate-200">Busca los equipos detectados</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {peers.length > 0
                      ? `Se encontraron ${peers.length} equipo${peers.length === 1 ? '' : 's'} en la red${peersUpdatedAt ? ` — detectados hace ${Math.max(1, Math.round((now - peersUpdatedAt.getTime()) / 1000))}s` : ''}.`
                      : 'Todavia no se detectan otros equipos. Pulsa "Buscar ahora".'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Con el botón <span className="text-slate-300">Copiar BD</span> reemplazas TODA la información local por la del equipo seleccionado (como una copia de seguridad en vivo). Despues sigue sincronizando solo en tiempo real.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleSearchPeers} disabled={peersSearching} className="text-xs">
                  {peersSearching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
                  {peersSearching ? 'Buscando...' : 'Buscar ahora'}
                </Button>
              </div>

              {peers.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {peers.map((peer) => (
                    <li key={`${peer.ip}:${peer.port}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-800/80 border border-slate-700 px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-slate-300 flex-shrink-0">
                          <Server className="h-4 w-4" />
                        </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{peer.name || 'Equipo'}</p>
                        <p className="text-xs text-slate-400 font-mono">{peer.ip}:{peer.port}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleCopyFullDb(peer)}
                        disabled={copyingPeer === `${peer.ip}:${peer.port}`}
                        title="Copiar toda la base de datos de este equipo (reemplaza la local)"
                      >
                        {copyingPeer === `${peer.ip}:${peer.port}` ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        {copyingPeer === `${peer.ip}:${peer.port}` ? 'Copiando...' : 'Copiar BD'}
                      </Button>
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/50 flex-shrink-0">
                        <Radio className="h-3 w-3 mr-1" />
                        En linea
                      </Badge>
                    </div>
                    </li>
                  ))}
                </ul>
              )}

              {peers.length === 0 && (
                <div className="mt-3 rounded-md bg-slate-950/50 border border-slate-800 px-4 py-3 flex items-center gap-3">
                  <Wifi className="h-4 w-4 text-slate-500 shrink-0" />
                  <p className="text-xs text-slate-500">
                    El otro equipo debe tener POS System abierto (la bandeja del sistema debe estar activa).
                    Si aún no aparece, usa el botón &quot;Verificar requisitos&quot; del paso 2 o el Relay por internet (abajo).
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Acciones + Relay */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-700 bg-slate-800 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Sincronizar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSyncNow} disabled={syncing} className="w-full gap-2">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </Button>
            <p className="text-xs text-slate-500">
              Envia y recibe los cambios pendientes con el relay (internet) y con los equipos de la red local. Tambien se sincroniza solo en tiempo real (cada 5 segundos).
            </p>

            {lastResult && (
              <div className="rounded-md bg-slate-700/40 px-3 py-2 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Ultima sincronizacion LAN:</span>
                  <span className="text-slate-200">{new Date(lastResult.at).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Equipos contactados:</span>
                  <span className={cn('font-medium', lastResult.peers > 0 ? 'text-emerald-400' : 'text-slate-300')}>
                    {lastResult.peers > 0 ? `${lastResult.peers}${lastResult.peers === 1 ? '' : 's'}` : '0'}
                  </span>
                </div>
                {lastResult.results.slice(0, 4).map((r) => (
                  <div key={r.peer} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 font-mono truncate">{r.peer}</span>
                    {r.ok ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> {r.pulled + r.pushed} cambios
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="h-3 w-3" /> Sin conexion
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-md bg-slate-900/60 border border-slate-700 px-3 py-2 space-y-1">
              <p className="text-xs text-slate-500">Registro de cambios</p>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Cambios totales:</span>
                <span className="text-slate-200 font-mono">{stats?.totalChanges ?? '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Pendientes:</span>
                <span className={cn('font-mono', (stats?.pendingSync ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                  {stats?.pendingSync ?? '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Cloud className="h-5 w-5 text-sky-500" />
              Equipos en redes distintas (Relay por internet)
            </CardTitle>
            <CardDescription>
              Si tus equipos NO estan en la misma red (por ejemplo, una sucursal en otra ciudad), configuralos con el mismo relay y el mismo secret.
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
                <Label htmlFor="relaySecret">Secret compartido</Label>
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

            <div className="rounded-md bg-sky-950/30 border border-sky-800/50 px-4 py-3 text-xs text-slate-400">
              <p className="flex items-center gap-1.5 text-sky-300 font-medium mb-1"><Users className="h-3.5 w-3.5" /> Como funciona</p>
              Cada equipo envia sus cambios al relay y recibe los de los demas (un buzon central). Se usa cuando la red local no alcanza: solo necesitas internet, la URL y el secret.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guia */}
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <Wifi className="h-5 w-5 text-emerald-500" />
            Guia: como sincronizar
          </CardTitle>
          <CardDescription>
            Instrucciones paso a paso para conectar tus equipos, esten en la misma red o no.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-400">
          <GuideSection title="1. En la misma red (LAN) - automatico">
            <ol className="list-decimal list-inside space-y-1">
              <li>Conecta todos los equipos a la misma red local (mismo router/WiFi).</li>
              <li>Inicia POS System en cada equipo (aplicacion de escritorio o servidor web).</li>
              <li>Acepta la red cuando Windows pregunte por el firewall (o usa el botón &quot;Abrir Firewall&quot;).</li>
              <li>Espera unos segundos: se detectan solos y sincronizan en tiempo real (cada 5 segundos).</li>
              <li>Verificalo aqui: tus equipos deben aparecer en el paso 3 de &quot;Conectar mis equipos&quot;.</li>
            </ol>
            <p className="mt-2">
              <span className="text-slate-200 font-medium">Si no aparecen:</span> usa el botón <span className="text-slate-200">Verificar requisitos</span> (abre una ventana con el diagnostico), permite el puerto <span className="font-mono">UDP 9876</span> en el firewall de cada equipo, y confirma que esten en la misma subred. Algunos routers con &quot;aislamiento de clientes WiFi&quot; bloquean esta comunicacion.
            </p>
          </GuideSection>

          <GuideSection title="2. Equipos en redes distintas (Relay por internet)">
            <ol className="list-decimal list-inside space-y-1">
              <li>Ten un relay desplegado (servidor en la nube con el proyecto <span className="font-mono">relay/</span>). Sin relay propio, usa uno compartido del que alguien te de la URL y el secret.</li>
              <li>En cada equipo abre Sincronizacion → &quot;Relay por internet&quot;.</li>
              <li>Escribe la <span className="text-slate-200">URL del relay</span> (ej. <span className="font-mono">https://sync.tudominio.com</span>).</li>
              <li>Escribe el <span className="text-slate-200">secret</span>: debe ser <span className="font-medium">exactamente el mismo</span> en todos los equipos y en el relay.</li>
              <li>Pulsa <span className="text-slate-200">Probar conexion</span>: debe decir &quot;Conexión exitosa&quot;.</li>
              <li>Pulsa <span className="text-slate-200">Guardar</span>.</li>
              <li>Listo: sincroniza solo en tiempo real (cada 5 segundos), o pulsa &quot;Sincronizar ahora&quot;.</li>
            </ol>
          </GuideSection>

          <GuideSection title="3. Desplegar tu propio relay (opcional, para avanzados)">
            <p>En un servidor Debian/Ubuntu con Node.js 18+:</p>
            <pre className="mt-2 rounded-md bg-slate-950 p-3 text-xs text-slate-300 overflow-x-auto">
{`mkdir -p /opt/pos-relay && cd /opt/pos-relay
# Copia la carpeta relay/ del proyecto
npm install
SYNC_SECRET="tu-secreto" PORT=8099 node server.js`}
            </pre>
            <p className="mt-2">Usa systemd para que corra siempre y Caddy/nginx con HTTPS. Instrucciones completas en <span className="font-mono">GUIA-SINCRONIZACION.md</span>.</p>
          </GuideSection>
        </CardContent>
      </Card>

      {/* Asistente de conexion remota (solo app de escritorio) */}
      <Dialog open={tsDialogOpen} onOpenChange={(o) => { if (!tsBusy) setTsDialogOpen(o); }}>
        <DialogContent className="flex max-h-[85vh] flex-col border-slate-700 bg-slate-800 sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Globe className="h-5 w-5 text-sky-500" />
              Conexion remota (Tailscale)
            </DialogTitle>
            <DialogDescription>
              Configura o repara la conexion remota. Si ya configuraste antes, usa &quot;Reparar automaticamente&quot;: reinicia el servicio de Tailscale y restaura la conexion sin pedir la authkey (acepta el permiso de administrador si aparece).
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="ts-authkey">Authkey de Tailscale (opcional)</Label>
              <Input
                id="ts-authkey"
                value={tsAuthkey}
                onChange={(e) => setTsAuthkey(e.target.value)}
                placeholder="tskey-auth-..."
                className="w-full font-mono text-sm"
                disabled={tsBusy !== null}
              />
              <p className="text-[11px] text-slate-500">
                Se genera en la consola de Tailscale (Settings &rarr; Keys). Marca la casilla &ldquo;Reusable&rdquo; si la vas a reutilizar. Desde la primera conexion la app la guarda cifrada: solo se pide de nuevo si reparas sin heredar la anterior.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={tsFunnelOn}
                onChange={(e) => setTsFunnelOn(e.target.checked)}
                disabled={tsBusy !== null}
                className="h-4 w-4 accent-emerald-600"
              />
              Publicar en internet (Funnel) &mdash; para abrir desde cualquier WiFi
            </label>
            {tsProgress.length > 0 && (
              <div className="rounded-md border border-slate-700 bg-slate-950 p-3">
                {tsProgress.map((m, i) => (
                  <p key={i} className="text-xs text-slate-400 font-mono">{m}</p>
                ))}
              </div>
            )}
            {tsDone && (
              <p className={cn('text-sm', tsDone.startsWith('Error') ? 'text-red-400' : 'text-emerald-400')}>{tsDone}</p>
            )}
          </div>
          <DialogFooter className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setTsDialogOpen(false)} disabled={tsBusy !== null}>
              Cerrar
            </Button>
            <Button type="button" variant="outline" onClick={runTsRepair} disabled={tsBusy !== null} className="text-amber-400 hover:text-amber-300 border-amber-800/60 hover:border-amber-700">
              {tsBusy === 'repair' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
              Reparar automaticamente
            </Button>
            <Button type="button" onClick={runTsSetup} disabled={tsBusy !== null || !tsAuthkey.trim()}>
              {tsBusy === 'connect' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
              Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/50 transition-colors"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
