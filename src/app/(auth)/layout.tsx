export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      {/* Halo de acento muy tenue — da profundidad sin cajas */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/[0.07] blur-[120px]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-strong text-lg font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]">
            P
          </div>
          <h1 className="text-[22px] font-medium tracking-tight text-fg">
            POS System
          </h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Punto de Venta — Gestión de inventario
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
