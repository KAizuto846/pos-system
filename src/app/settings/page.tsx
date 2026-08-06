'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Monitor, Wifi, Database } from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [version, setVersion] = useState('');
  const [syncStats, setSyncStats] = useState<{
    totalChanges: number;
    pendingSync: number;
    lastChangeAt: string | null;
  } | null>(null);
  const [config, setConfig] = useState({
    mode: 'server',
    serverPort: '3000',
    serverIP: '',
    deviceName: '',
  });

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(d => setVersion(d.version))
      .catch(() => setVersion('0.3.6'));

    fetch('/api/sync/stats')
      .then(r => r.json())
      .then(setSyncStats)
      .catch(() => {});

    const win = window as unknown as {
      electronAPI?: {
        getConfig: () => Promise<{
          mode?: string;
          serverPort?: number;
          serverIP?: string;
          deviceName?: string;
        }>;
      };
    };

    if (win.electronAPI?.getConfig) {
      win.electronAPI.getConfig().then((cfg) => {
        setConfig({
          mode: cfg.mode || 'server',
          serverPort: String(cfg.serverPort || 3000),
          serverIP: cfg.serverIP || '',
          deviceName: cfg.deviceName || '',
        });
      });
    } else {
      setConfig({
        mode: 'server',
        serverPort: localStorage.getItem('pos-server-port') || '3000',
        serverIP: localStorage.getItem('pos-server-ip') || '',
        deviceName: localStorage.getItem('pos-device-name') || navigator.userAgent.includes('Windows')
          ? window.location.hostname || 'PC-Caja'
          : 'Server',
      });
    }
  }, []);

  const modeLabel = 'P2P (Sincronizacion entre equipos)';

  const modeColor = 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50';

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Configuración</h1>
        <p className="text-slate-400 mt-1">Estado del sistema y conexión de red</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-500" />
              Modo de Conexión
            </CardTitle>
            <CardDescription>Este dispositivo está funcionando como</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="outline" className={`px-4 py-2 text-base font-medium ${modeColor}`}>
              {modeLabel}
            </Badge>
            {config.mode === 'server' && (
              <p className="text-sm text-slate-400">
                Puerto: <span className="text-slate-200 font-mono">{config.serverPort}</span>
              </p>
            )}
            <p className="text-xs text-slate-500">
              Todos los dispositivos son pares iguales: cada uno ejecuta su propia base de datos y se sincroniza automaticamente cada 30 segundos con los demas equipos de la red.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Wifi className="h-5 w-5 text-emerald-500" />
              Sincronización
            </CardTitle>
            <CardDescription>Estado de la sincronización entre dispositivos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncStats ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Cambios totales registrados:</span>
                  <span className="text-slate-200 font-mono">{syncStats.totalChanges}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pendientes de sincronizar:</span>
                  <span className={`font-mono ${syncStats.pendingSync > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {syncStats.pendingSync}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Último cambio:</span>
                  <span className="text-slate-200">
                    {syncStats.lastChangeAt
                      ? new Date(syncStats.lastChangeAt).toLocaleString()
                      : '—'}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Cargando estadísticas...</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Monitor className="h-5 w-5 text-emerald-500" />
              Dispositivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Nombre:</span>
              <span className="text-slate-200 font-mono">{config.deviceName || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Versión:</span>
              <span className="text-slate-200 font-mono">{version || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Usuario:</span>
              <span className="text-slate-200">{session?.user?.name || '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-500" />
              Sincronización Multi-Dispositivo
            </CardTitle>
            <CardDescription>Cómo funciona la sincronización entre dispositivos</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-2">
            <p>
              <span className="text-slate-200 font-medium">Sincronizacion P2P:</span> Cada
              dispositivo ejecuta su propia base de datos local. Los cambios se sincronizan
              de igual a igual entre todos los equipos de la red, sin necesidad de un
              servidor central.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Deteccion:</span> Los dispositivos se
              descubren automaticamente mediante UDP multicast/broadcast en el puerto 9876.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Frecuencia:</span> La sincronizacion
              se ejecuta automaticamente cada 30 segundos, y tambien se puede disparar manualmente
              desde el menu de la bandeja o la seccion &quot;Sincronizacion&quot; de la barra lateral.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
