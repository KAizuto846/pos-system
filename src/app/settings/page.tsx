'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Server, Monitor, Wifi, Database, Smartphone, Copy, ArrowLeft, Building2, Palette, Save, Upload, Trash2, Check, Globe, Plug, Printer, FileText } from 'lucide-react';
import { PALETTES, APP_FONTS, applyTheme, getSavedTheme } from '@/lib/themes';
import { notifyBusinessUpdated } from '@/hooks/useBusiness';
import { cn } from '@/lib/utils';

const SAMPLE_TEXT = 'Áéíóú Ü Ññ ¿Cómo está? La piñata de muñecos rojos.';

interface RelayState {
  relayUrl?: string;
  connected?: boolean;
  relayStoredChanges?: number | null;
  lastTestError?: string | null;
  lastSyncResult?: { at?: string; pulled?: number; pushed?: number } | null;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';

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
  const [lanUrl, setLanUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Negocio y apariencia
  const [businessName, setBusinessName] = useState('');
  const [palette, setPalette] = useState('emerald');
  const [font, setFont] = useState('sistema');
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Relay por internet
  const [relayState, setRelayState] = useState<RelayState>({});
  const [relayUrl, setRelayUrl] = useState('');
  const [relaySecret, setRelaySecret] = useState('');
  const [relayTesting, setRelayTesting] = useState(false);
  const [relaySaving, setRelaySaving] = useState(false);

  // Impresora de tickets
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean; displayName: string }[]>([]);
  const [printerName, setPrinterName] = useState('');
  const [ticketWidth, setTicketWidth] = useState(32);
  const [printingTest, setPrintingTest] = useState(false);
  const [diagnostic, setDiagnostic] = useState<null | string>(null);
  const [runningDiag, setRunningDiag] = useState(false);

  useEffect(() => {
    if (!lanUrl) return;
    QRCode.toDataURL(lanUrl, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [lanUrl]);

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(d => setVersion(d.version))
      .catch(() => setVersion('0.4.3'));

    fetch('/api/sync/stats')
      .then(r => r.json())
      .then(setSyncStats)
      .catch(() => {});

    fetch('/api/settings')
      .then(r => r.json())
      .then((data) => {
        if (data && typeof data === 'object') {
          setBusinessName(data.businessName || '');
          setPalette(data.palette || 'emerald');
          setFont(data.font || 'sistema');
          setLogo(data.logo || '');
        }
      })
      .catch(() => {});

    fetch('/api/sync/relay/config')
      .then(r => r.json())
      .then((data) => {
        if (data && typeof data === 'object') {
          setRelayState(data);
          setRelayUrl(data.relayUrl || '');
        }
      })
      .catch(() => {});

    const win = window as unknown as {
      electronAPI?: {
        getConfig: () => Promise<{
          mode?: string;
          serverPort?: number;
          serverIP?: string;
          deviceName?: string;
          ticketPrinter?: string;
          ticketWidth?: number;
        }>;
        getPrinters?: () => Promise<{ ok: boolean; printers?: { name: string; isDefault: boolean; displayName: string }[]; error?: string }>;
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
        if (cfg.serverIP) setLanUrl(`http://${cfg.serverIP}:${cfg.serverPort || 3000}`);
        if (cfg.ticketPrinter) setPrinterName(cfg.ticketPrinter);
        if (cfg.ticketWidth) setTicketWidth(cfg.ticketWidth);
      });

      if (win.electronAPI?.getPrinters) {
        const getPrinters = win.electronAPI.getPrinters;
        queueMicrotask(() => {
          getPrinters()
            .then((res) => {
              const list = res?.printers;
              if (res?.ok && list) {
                setPrinters(list);
                const def = list.find((p) => p.isDefault);
                if (def) setPrinterName((prev) => prev || def.name);
                else if (list.length > 0) setPrinterName((prev) => prev || list[0].name);
              }
            })
            .catch(() => {});
        });
      }
    } else {
      // Modo web: leer config persistida en la DB (setup web)
      fetch('/api/setup/config')
        .then(r => r.json())
        .then((data) => {
          if (data && typeof data === 'object') {
            setConfig({
              mode: 'server',
              serverPort: String(data.serverPort || localStorage.getItem('pos-server-port') || '3000'),
              serverIP: localStorage.getItem('pos-server-ip') || '',
              deviceName: data.deviceName || localStorage.getItem('pos-device-name') || 'Equipo-1',
            });
          }
        })
        .catch(() => {
          setConfig({
            mode: 'server',
            serverPort: localStorage.getItem('pos-server-port') || '3000',
            serverIP: localStorage.getItem('pos-server-ip') || '',
            deviceName: localStorage.getItem('pos-device-name') || 'Equipo-1',
          });
        });
      // IP LAN real del servidor (modo web / Linux)
      fetch('/api/server-info')
        .then(r => r.json())
        .then((info) => {
          if (info?.url) setLanUrl(info.url);
        })
        .catch(() => {});
    }
  }, []);

  const handleSaveBusiness = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          palette,
          font,
          logo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar la configuración');
        return;
      }
      applyTheme(palette, font);
      notifyBusinessUpdated();
      toast.success('Configuración del negocio guardada');
    } catch {
      toast.error('Error de conexión al guardar');
    } finally {
      setSaving(false);
    }
  }, [businessName, palette, font, logo]);

  const handleLogoFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen');
      return;
    }
    if (file.size > 1_000_000) {
      toast.error('La imagen es demasiado grande (máximo 1 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(String(reader.result || ''));
      toast.success('Logo seleccionado. Recuerda guardar los cambios.');
    };
    reader.onerror = () => toast.error('No se pudo leer la imagen');
    reader.readAsDataURL(file);
  }, []);

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
        setRelayState((prev) => ({ ...prev, relayUrl, lastTestError: null }));
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar la configuración');
    } finally {
      setRelaySaving(false);
    }
  };

  const handleSavePrinter = useCallback(async () => {
    const win = window as unknown as { electronAPI?: { setConfig?: (k: string, v: string | number) => Promise<boolean> } };
    if (!win.electronAPI?.setConfig) {
      toast.error('Solo disponible en la aplicación de escritorio (Electron)');
      return;
    }
    if (!printerName) {
      toast.error('Selecciona una impresora');
      return;
    }
    try {
      await win.electronAPI.setConfig('ticketPrinter', printerName);
      await win.electronAPI.setConfig('ticketWidth', ticketWidth);
      toast.success('Impresora de tickets guardada');
    } catch {
      toast.error('No se pudo guardar la impresora');
    }
  }, [printerName, ticketWidth]);

  const handlePrintTest = useCallback(async () => {
    const win = window as unknown as { electronAPI?: { printPlainText?: (text: string, printer: string) => Promise<{ ok: boolean; error?: string }> } };
    if (!win.electronAPI?.printPlainText) {
      toast.error('Solo disponible en la aplicación de escritorio (Electron)');
      return;
    }
    if (!printerName) {
      toast.error('Selecciona una impresora');
      return;
    }
    setPrintingTest(true);
    const now = new Date();
    const W = ticketWidth;
    const line = '='.repeat(W);
    const text = [
      (businessName || 'MI NEGOCIO').toUpperCase().padStart(Math.floor((W + (businessName || 'MI NEGOCIO').length) / 2)).slice(0, W),
      line,
      'PRUEBA DE IMPRESORA DE TICKETS'.slice(0, W),
      line,
      `Fecha: ${now.toLocaleString('es-MX')}`.slice(0, W),
      'Producto 1'.padEnd(Math.max(8, W - 10)) + '$10.00',
      'Producto 2'.padEnd(Math.max(8, W - 10)) + '$25.50',
      line,
      'TOTAL'.padEnd(Math.max(8, W - 8)) + '$35.50',
      '',
      'Gracias por su compra!'.padStart(Math.floor(W / 2) + 10).slice(0, W),
      '',
    ].join('\n');
    try {
      const res = await win.electronAPI.printPlainText(text, printerName);
      if (res?.ok) toast.success('Texto enviado a la impresora');
      else toast.error(res?.error || 'No se pudo imprimir');
    } catch {
      toast.error('Error al imprimir');
    } finally {
      setPrintingTest(false);
    }
  }, [printerName, businessName, ticketWidth]);

  const handleDiagnostic = useCallback(async () => {
    const win = window as unknown as { electronAPI?: { printDiagnostic?: () => Promise<unknown> } };
    if (!win.electronAPI?.printDiagnostic) {
      toast.error('Solo disponible en la aplicación de escritorio (Electron)');
      return;
    }
    setRunningDiag(true);
    setDiagnostic(null);
    try {
      const res = await win.electronAPI.printDiagnostic();
      setDiagnostic(JSON.stringify(res, null, 2));
    } catch (err) {
      setDiagnostic('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRunningDiag(false);
    }
  }, []);

  // Tema aplicado actualmente (leído tras montar, para no romper la hidratación)
  const [appliedTheme, setAppliedTheme] = useState({ paletteId: 'emerald', fontId: 'sistema' });
  useLayoutEffect(() => {
    const saved = getSavedTheme();
    if (saved) {
      const t = saved;
      queueMicrotask(() => setAppliedTheme({ paletteId: t.paletteId, fontId: t.fontId }));
    }
  }, []);
  const currentPalette = appliedTheme.paletteId;
  const currentFont = appliedTheme.fontId;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.back()}
          title="Regresar"
          className="h-9 w-9 flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Configuración</h1>
          <p className="text-slate-400 mt-1">Estado del sistema, negocio y conexión de red</p>
        </div>
      </div>

      {isAdmin && (
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Negocio y Apariencia
            </CardTitle>
            <CardDescription>
              Nombre del negocio, paleta de colores, tipo de letra y logo. Se aplican en este equipo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business-name">Nombre del negocio</Label>
                <Input
                  id="business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ej. Farmacia Los Ángeles"
                  maxLength={100}
                />
                <p className="text-xs text-slate-500">
                  Se muestra en la barra lateral y en el encabezado.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Logo del negocio</Label>
                <div className="flex items-center gap-3">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo}
                      alt="Logo del negocio"
                      className="h-16 w-16 rounded-lg border border-slate-600 bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-slate-500">
                      <Building2 className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleLogoFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5 mr-2" />
                      {logo ? 'Cambiar logo' : 'Subir logo'}
                    </Button>
                    {logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => setLogo('')}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Quitar logo
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500">JPG o PNG de hasta 1 MB.</p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Paleta de colores</Label>
                <div className="flex flex-wrap gap-3">
                  {PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.name}
                      onClick={() => setPalette(p.id)}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110',
                        palette === p.id && 'ring-2 ring-slate-100 ring-offset-2 ring-offset-slate-800'
                      )}
                      style={{ backgroundColor: p.swatch }}
                    >
                      {palette === p.id && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  También cambia botones, insignias y resaltados en todo el sistema.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-font">Tipo de letra</Label>
                <Select value={font} onValueChange={setFont}>
                  <SelectTrigger id="business-font" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_FONTS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div
                  className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
                  style={{ fontFamily: APP_FONTS.find((f) => f.id === font)?.stack }}
                >
                  <Palette className="mr-2 inline h-3.5 w-3.5 text-slate-400" />
                  {SAMPLE_TEXT}
                </div>
                <p className="text-xs text-slate-500">
                  Vista previa con acentos y la ñ. Las fuentes son del sistema: funcionan sin internet.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" onClick={handleSaveBusiness} disabled={saving || !isAdmin}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              {(currentPalette !== palette || currentFont !== font) && (
                <p className="text-xs text-amber-400">
                  Tienes cambios sin guardar en el tema.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Modo de Conexión
            </CardTitle>
            <CardDescription>Este dispositivo está funcionando como</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="outline" className="px-4 py-2 text-base font-medium border-primary/50 text-primary bg-primary/10">
              P2P (Sincronización entre equipos)
            </Badge>
            <p className="text-sm text-slate-400">
              Puerto: <span className="text-slate-200 font-mono">{config.serverPort}</span>
            </p>
            <p className="text-xs text-slate-500">
              Todos los dispositivos son pares iguales: cada uno ejecuta su propia base de datos y se sincroniza automáticamente cada 30 segundos con los demás equipos de la red.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
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
                  <span className={`font-mono ${syncStats.pendingSync > 0 ? 'text-amber-400' : 'text-primary'}`}>
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
              <Monitor className="h-5 w-5 text-primary" />
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
              <Printer className="h-5 w-5 text-emerald-400" />
              Impresora de Tickets
            </CardTitle>
            <CardDescription>
              Las impresoras de tickets (58mm/80mm) suelen imprimir solo texto plano. El ticket se envía como texto puro, sin imágenes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="printer-select" className="text-xs text-slate-400">Impresora del sistema</Label>
              {printers.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No se detectaron impresoras. Este ajuste está disponible en la app de escritorio (Electron).
                </p>
              ) : (
                <Select value={printerName} onValueChange={setPrinterName}>
                  <SelectTrigger id="printer-select" className="w-full border-slate-600 bg-slate-900 text-slate-100">
                    <SelectValue placeholder="Seleccionar impresora" />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.displayName || p.name}{p.isDefault ? ' (predeterminada)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-width" className="text-xs text-slate-400">Ancho del ticket (caracteres)</Label>
                <Select value={String(ticketWidth)} onValueChange={(v) => setTicketWidth(parseInt(v, 10))}>
                  <SelectTrigger id="ticket-width" className="w-full border-slate-600 bg-slate-900 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="32">32 — 58mm (mini térmica)</SelectItem>
                    <SelectItem value="42">42 — 58mm ancho / 80mm</SelectItem>
                    <SelectItem value="48">48 — 80mm estándar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Envío</Label>
                <p className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                  Se envía como <span className="text-slate-300">texto plano</span> vía PowerShell
                  (<span className="font-mono">Out-Printer</span>) y, si falla, por
                  <span className="font-mono"> copy /b \\localhost\impresora</span>.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Si el ancho no cuadra con tu impresora, el texto se cortará o hará saltos de línea. Prueba el botón &quot;Imprimir prueba&quot; para calibrar.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handlePrintTest} disabled={printingTest || !printerName}>
                <FileText className="mr-2 h-3.5 w-3.5" />
                {printingTest ? 'Imprimiendo...' : 'Imprimir prueba'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleSavePrinter} disabled={!printerName}>
                <Save className="mr-2 h-3.5 w-3.5" />
                Guardar impresora
              </Button>
              <Button size="sm" variant="outline" onClick={handleDiagnostic} disabled={runningDiag}>
                <Plug className="mr-2 h-3.5 w-3.5" />
                {runningDiag ? 'Ejecutando...' : 'Diagnóstico'}
              </Button>
            </div>
            {diagnostic && (
              <pre className="max-h-64 overflow-auto rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all">
                {diagnostic}
              </pre>
            )}
            <p className="text-xs text-slate-500">
              Guarda la impresora para que el POS la use al emitir el ticket de venta. El botón Diagnóstico muestra el estado del spooler, impresoras compartidas y el resultado real de cada método de envío.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-sky-400" />
              Acceso desde el Teléfono
            </CardTitle>
            <CardDescription>Escanea el QR o copia la dirección para entrar desde tu celular (misma red WiFi)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lanUrl ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="QR de acceso" className="h-44 w-44 rounded-lg border border-slate-600 bg-white p-2" />
                )}
                <div className="flex-1 space-y-3">
                  <div className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 font-mono text-sm text-sky-300 break-all">
                    {lanUrl}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    navigator.clipboard.writeText(lanUrl)
                      .then(() => toast.success('URL copiada'))
                      .catch(() => toast.error('No se pudo copiar'));
                  }}>
                    <Copy className="h-3.5 w-3.5 mr-2" />Copiar URL
                  </Button>
                  <p className="text-xs text-slate-500">
                    El teléfono debe estar en la misma red. Si no entra, revisa el Firewall de Windows (puerto TCP {config.serverPort}).
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No se pudo detectar la IP de red. Revisa la conexión del equipo y vuelve a abrir la aplicación.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Globe className="h-5 w-5 text-sky-400" />
              Internet (Relay) — Otras redes WiFi
            </CardTitle>
            <CardDescription>
              Sincroniza equipos que NO están en la misma red (sucursales, casa, celular por datos). Necesitas el relay instalado en un servidor con internet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="relayUrl" className="text-xs text-slate-400">URL del relay</Label>
                <Input
                  id="relayUrl"
                  value={relayUrl}
                  onChange={(e) => setRelayUrl(e.target.value)}
                  placeholder="https://relay.midominio.com"
                  className="border-slate-600 bg-slate-800 text-slate-200 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relaySecret" className="text-xs text-slate-400">Secreto compartido</Label>
                <Input
                  id="relaySecret"
                  type="password"
                  value={relaySecret}
                  onChange={(e) => setRelaySecret(e.target.value)}
                  placeholder="SYNC_SECRET del relay"
                  className="border-slate-600 bg-slate-800 text-slate-200 font-mono text-xs"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleTestRelay} disabled={relayTesting || !relayUrl.trim()}>
                <Plug className="mr-2 h-3.5 w-3.5" />
                {relayTesting ? 'Probando...' : 'Probar conexión'}
              </Button>
              <Button size="sm" onClick={handleSaveRelay} disabled={relaySaving || !relayUrl.trim()}>
                <Save className="mr-2 h-3.5 w-3.5" />
                {relaySaving ? 'Guardando...' : 'Guardar relay'}
              </Button>
            </div>
            {relayState.relayUrl && (
              <div className="space-y-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-xs">
                <p className="flex items-center gap-2">
                  Configurado:
                  <span className="font-mono text-sky-300 break-all">{relayState.relayUrl}</span>
                </p>
                <div className="flex items-center gap-2">
                  Estado:
                  {relayState.connected ? (
                    <Badge variant="outline" className="border-emerald-700/50 text-emerald-300">Conectado</Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-700/50 text-amber-300">Sin conexión probada</Badge>
                  )}
                  {typeof relayState.relayStoredChanges === 'number' && (
                    <span className="text-slate-500">· {relayState.relayStoredChanges} cambios esperando</span>
                  )}
                </div>
                {relayState.lastTestError && (
                  <p className="text-red-400 break-all">{relayState.lastTestError}</p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Configura también la URL y el secreto en el <span className="text-slate-300">relay</span> (carpeta
              <span className="font-mono text-slate-300"> relay/</span> del proyecto, con su propio servidor).
              Más detalles en la sección &quot;Sincronización&quot; de la barra lateral y en
              <span className="text-slate-300"> docs/INTERNET-ACCESS.md</span>.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Sincronización Multi-Dispositivo
            </CardTitle>
            <CardDescription>Cómo funciona la sincronización entre dispositivos</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-2">
            <p>
              <span className="text-slate-200 font-medium">Sincronización P2P:</span> Cada
              dispositivo ejecuta su propia base de datos local. Los cambios se sincronizan
              de igual a igual entre todos los equipos de la red, sin necesidad de un
              servidor central.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Detección:</span> Los dispositivos se
              descubren automáticamente mediante UDP multicast/broadcast en el puerto 9876.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Frecuencia:</span> La sincronización
              se ejecuta automáticamente cada 30 segundos, y también se puede disparar manualmente
              desde el menú de la bandeja o la sección &quot;Sincronización&quot; de la barra lateral.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}