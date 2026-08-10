import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToasterProvider } from "@/components/ui/toast";
import SessionProvider from "@/components/SessionProvider";
import QueryProvider from "@/components/QueryProvider";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { UpdateNotification } from "@/components/UpdateNotification";
import { ThemeApplier } from "@/components/ThemeApplier";

export const metadata: Metadata = {
  title: "POS System - Punto de Venta",
  description: "Sistema de Punto de Venta moderno, rápido y robusto",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "POS System" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <SessionProvider>
          <QueryProvider>
            <RealtimeProvider>
              <UpdateNotification />
              {children}
              <ToasterProvider />
            </RealtimeProvider>
          </QueryProvider>
        </SessionProvider>
        <ThemeApplier />
      </body>
    </html>
  );
}