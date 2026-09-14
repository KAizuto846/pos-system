'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo actualizar la contraseña');
      } else {
        setSuccess(data.message || 'Contraseña actualizada. Ya puedes iniciar sesión.');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/[0.07] blur-[120px]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-strong text-lg font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]">
            P
          </div>
          <h1 className="text-[22px] font-medium tracking-tight text-fg">Nueva contraseña</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">Pega tu token y elige una contraseña nueva</p>
        </div>

        <div className="rounded-2xl border border-line/70 bg-surface-2/40 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-brand/25 bg-brand/10 px-3 py-2.5 text-[12px] text-emerald-300">
                <p>{success}</p>
                <Link href="/login" className="mt-2 inline-block font-medium text-brand hover:underline">
                  Ir a iniciar sesión →
                </Link>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="token">Token</Label>
              <Input
                id="token"
                type="text"
                placeholder="Token del enlace de recuperación"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                disabled={loading}
              />
              <p className="text-[11px] text-fg-subtle">
                Si llegaste desde el enlace, ya está rellenado. Expira en 60 minutos y es de un solo uso.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Repite la contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Actualizando…' : 'Actualizar contraseña'}
            </Button>

            <div className="flex justify-between text-[12px]">
              <Link href="/forgot-password" className="text-fg-muted hover:text-fg hover:underline">
                ← Solicitar nuevo enlace
              </Link>
              <Link href="/login" className="text-fg-subtle hover:text-fg-muted">
                Iniciar sesión
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
