'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/register')
      .then((res) => res.json())
      .then((data) => {
        setHasAdmin(data.hasAdmin ?? true);
      })
      .catch(() => setHasAdmin(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      console.log('[Login] signIn result:', result);

      if (result?.error) {
        setError('Usuario o contraseña incorrectos');
        setLoading(false);
        return;
      }

      if (result?.ok) {
        // Hard redirect para forzar recarga y detectar sesión
        window.location.href = '/';
      } else {
        setError('Error al iniciar sesión');
        setLoading(false);
      }
    } catch (err) {
      console.error('[Login] Error:', err);
      setError('Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/[0.07] blur-[120px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-strong text-lg font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]">
            P
          </div>
          <h1 className="text-[22px] font-medium tracking-tight text-fg">POS System</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Punto de Venta — Gestión de inventario
          </p>
        </div>

        <div className="rounded-2xl border border-line/70 bg-surface-2/40 p-6">
          <div className="mb-6">
            <h2 className="text-[15px] font-medium tracking-tight text-fg">Iniciar sesión</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                type="text"
                placeholder="tu.usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <Link href="/forgot-password" className="text-[11px] text-fg-subtle hover:text-brand hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>

            {hasAdmin === false && (
              <p className="text-center text-[12px] text-fg-subtle">
                No hay cuenta de administrador.{' '}
                <Link href="/register" className="text-brand hover:underline">
                  Crear la primera
                </Link>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}