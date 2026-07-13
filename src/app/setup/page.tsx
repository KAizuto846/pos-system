'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Store, Server, Monitor, Settings, CheckCircle } from 'lucide-react';

type Step = 'welcome' | 'business' | 'admin' | 'network' | 'complete';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Business config
  const [businessName, setBusinessName] = useState('Mi Negocio');
  const [deviceName, setDeviceName] = useState('');

  // Admin config
  const [adminUsername, setAdminUsername] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  // Network config
  const [serverMode, setServerMode] = useState<'server' | 'client' | 'auto'>('server');
  const [serverPort, setServerPort] = useState('3000');
  const [serverIP, setServerIP] = useState('');

  // Check if setup is needed
  useEffect(() => {
    fetch('/api/auth/register')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasAdmin) {
          router.push('/login');
        }
      })
      .catch(() => {});

    // Get device hostname
    setDeviceName(window.navigator.userAgent.includes('Windows') ? 
      window.location.hostname || 'PC-Caja' : 'Server');
  }, [router]);

  const handleBusinessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Por favor ingrese el nombre del negocio');
      return;
    }
    setError('');
    setStep('admin');
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminName.trim()) {
      setError('Por favor complete todos los campos');
      return;
    }
    if (adminPassword.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (adminPassword !== adminConfirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }
    setError('');
    setStep('network');
  };

  const handleNetworkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('complete');
  };

  const handleFinish = async () => {
    setLoading(true);
    setError('');

    try {
      // Create admin account
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername,
          name: adminName,
          password: adminPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear usuario');
      }

      // Save network config (if we had an API for it)
      // For now, this is handled by the Electron config
      localStorage.setItem('pos-business-name', businessName);
      localStorage.setItem('pos-device-name', deviceName);
      localStorage.setItem('pos-server-mode', serverMode);
      localStorage.setItem('pos-server-port', serverPort);

      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al completar la configuracion');
      setLoading(false);
    }
  };

  const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: 'welcome', label: 'Bienvenido', icon: <Store className="h-4 w-4" /> },
    { key: 'business', label: 'Negocio', icon: <Store className="h-4 w-4" /> },
    { key: 'admin', label: 'Usuario', icon: <Settings className="h-4 w-4" /> },
    { key: 'network', label: 'Red', icon: <Server className="h-4 w-4" /> },
    { key: 'complete', label: 'Listo', icon: <CheckCircle className="h-4 w-4" /> },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  i <= currentStepIndex
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i < currentStepIndex ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  s.icon
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 ${
                    i < currentStepIndex ? 'bg-emerald-600' : 'bg-slate-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Welcome step */}
        {step === 'welcome' && (
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mb-4">
                <Store className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-slate-100">Bienvenido a POS System</CardTitle>
              <CardDescription className="text-slate-400">
                Configura tu sistema de punto de venta en unos simples pasos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <Monitor className="h-4 w-4 text-emerald-500" />
                  Multi-dispositivo
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Server className="h-4 w-4 text-emerald-500" />
                  Sincronizacion en tiempo real
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Settings className="h-4 w-4 text-emerald-500" />
                  Actualizaciones automaticas
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Facil de usar
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => setStep('business')}>
                Comenzar configuracion
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Business info step */}
        {step === 'business' && (
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-xl text-slate-100">Informacion del Negocio</CardTitle>
              <CardDescription className="text-slate-400">
                Configura los datos basicos de tu negocio
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleBusinessSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="businessName">Nombre del Negocio</Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder="Mi Negocio"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deviceName">Nombre del Dispositivo</Label>
                  <Input
                    id="deviceName"
                    type="text"
                    placeholder="PC-Caja"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    Identifica este dispositivo en la red (ej: PC-Caja, Terminal-1)
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep('welcome')}>
                  Atras
                </Button>
                <Button type="submit">Siguiente</Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* Admin account step */}
        {step === 'admin' && (
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-xl text-slate-100">Crear Usuario Administrador</CardTitle>
              <CardDescription className="text-slate-400">
                Este usuario tendra acceso total al sistema
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleAdminSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="adminUsername">Usuario</Label>
                  <Input
                    id="adminUsername"
                    type="text"
                    placeholder="admin"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                    minLength={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminName">Nombre Completo</Label>
                  <Input
                    id="adminName"
                    type="text"
                    placeholder="Tu nombre"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminPassword">Contrasena</Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminConfirmPassword">Confirmar Contrasena</Label>
                  <Input
                    id="adminConfirmPassword"
                    type="password"
                    placeholder="Repite la contrasena"
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep('business')}>
                  Atras
                </Button>
                <Button type="submit">Siguiente</Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* Network config step */}
        {step === 'network' && (
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-xl text-slate-100">Configuracion de Red</CardTitle>
              <CardDescription className="text-slate-400">
                Define como se conectara este dispositivo a la red
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleNetworkSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-md bg-red-600/20 border border-red-600/50 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
                <div className="space-y-3">
                  <Label>Modo de Operacion</Label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 bg-slate-700/50 cursor-pointer hover:bg-slate-700 transition-colors">
                      <input
                        type="radio"
                        name="mode"
                        value="server"
                        checked={serverMode === 'server'}
                        onChange={() => setServerMode('server')}
                        className="text-emerald-600"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-200">Servidor</div>
                        <div className="text-xs text-slate-400">
                          Ejecuta la base de datos local. Otros dispositivos se conectan a este.
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 bg-slate-700/50 cursor-pointer hover:bg-slate-700 transition-colors">
                      <input
                        type="radio"
                        name="mode"
                        value="client"
                        checked={serverMode === 'client'}
                        onChange={() => setServerMode('client')}
                        className="text-emerald-600"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-200">Cliente</div>
                        <div className="text-xs text-slate-400">
                          Se conecta a otro servidor existente en la red.
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 bg-slate-700/50 cursor-pointer hover:bg-slate-700 transition-colors">
                      <input
                        type="radio"
                        name="mode"
                        value="auto"
                        checked={serverMode === 'auto'}
                        onChange={() => setServerMode('auto')}
                        className="text-emerald-600"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-200">Automatico</div>
                        <div className="text-xs text-slate-400">
                          Detecta automaticamente si hay un servidor en la red.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serverPort">Puerto del Servidor</Label>
                  <Input
                    id="serverPort"
                    type="number"
                    placeholder="3000"
                    value={serverPort}
                    onChange={(e) => setServerPort(e.target.value)}
                    min="1"
                    max="65535"
                  />
                </div>

                {serverMode === 'client' && (
                  <div className="space-y-2">
                    <Label htmlFor="serverIP">IP del Servidor</Label>
                    <Input
                      id="serverIP"
                      type="text"
                      placeholder="192.168.1.100"
                      value={serverIP}
                      onChange={(e) => setServerIP(e.target.value)}
                    />
                  </div>
                )}

                <div className="rounded-md bg-blue-600/20 border border-blue-600/50 px-4 py-3 text-sm text-blue-400">
                  {serverMode === 'server' && (
                    <p>Este dispositivo ejecutara el servidor. Los demas se conectaran a el.</p>
                  )}
                  {serverMode === 'client' && (
                    <p>Ingrese la IP del dispositivo que ejecuta el servidor.</p>
                  )}
                  {serverMode === 'auto' && (
                    <p>El sistema detectara automaticamente los servidores disponibles en la red.</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep('admin')}>
                  Atras
                </Button>
                <Button type="submit">Siguiente</Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* Complete step */}
        {step === 'complete' && (
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-slate-100">Configuracion Completa</CardTitle>
              <CardDescription className="text-slate-400">
                Tu sistema POS esta listo para usar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-slate-700/50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Negocio:</span>
                  <span className="text-slate-200">{businessName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Dispositivo:</span>
                  <span className="text-slate-200">{deviceName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Modo:</span>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/50">
                    {serverMode === 'server' ? 'Servidor' : serverMode === 'client' ? 'Cliente' : 'Automatico'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Puerto:</span>
                  <span className="text-slate-200">{serverPort}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={handleFinish} disabled={loading}>
                {loading ? 'Configurando...' : 'Iniciar POS System'}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
