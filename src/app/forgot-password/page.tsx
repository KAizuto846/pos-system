'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [devUrl, setDevUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDevUrl('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo procesar la solicitud');
      } else {
        setMessage(data.message || 'Si el usuario existe, se generó un enlace válido por 60 minutos.');
        if (data._dev_resetUrl) setDevUrl(data._dev_resetUrl);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
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
          <h1 className="text-[22px] font-medium tracking-tight text-fg">Recuperar acceso</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Ingresa tu usuario o correo de recuperación
          </p>
        </div>

        <div className="rounded-2xl border border-line/70 bg-surface-2/40 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-brand/25 bg-brand/10 px-3 py-2.5 text-[12px] text-emerald-300">
                <p>{message}</p>
                {devUrl && (
                  <div className="mt-3 rounded-lg bg-canvas p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                      Enlace (solo desarrollo)
                    </p>
                    <Link
                      href={devUrl}
                      className="mt-1 block break-all text-[12px] font-medium text-brand hover:underline"
                    >
                      {devUrl}
                    </Link>
                    <p className="mt-1 text-[11px] text-fg-subtle">
                      Cópialo y ábrelo para poner una nueva contraseña. En producción esto llegaría a tu correo.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="identifier">Usuario o correo de recuperación</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="Victor E  o  tu@correo.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
              <p className="text-[11px] text-fg-subtle">
                Si configuraste un correo de recuperación en Usuarios, también puedes usarlo aquí.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Generando enlace…' : 'Generar enlace de recuperación'}
            </Button>

            <div className="flex items-center justify-between text-[12px]">
              <Link href="/login" className="text-fg-muted hover:text-fg hover:underline">
                ← Volver a iniciar sesión
              </Link>
              <Link href="/register" className="text-fg-subtle hover:text-fg-muted">
                Crear admin
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
