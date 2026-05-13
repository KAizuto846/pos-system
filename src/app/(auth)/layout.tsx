export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-600 text-2xl font-bold text-white shadow-lg">
            P
          </div>
          <h1 className="text-2xl font-bold text-slate-100">POS System</h1>
          <p className="mt-1 text-sm text-slate-400">
            Punto de Venta — Inventory Management
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
