"use client";

import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncStatus = {
  status: "online" | "offline" | "checking";
  sseStatus: "connected" | "disconnected" | "reconnecting";
  serverTime?: string;
  stats?: {
    products: number;
    sales: number;
    users: number;
    lastSaleAt: string | null;
  };
};

export function SyncStatusBadge() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: "checking",
    sseStatus: "disconnected",
  });

  const checkSync = async () => {
    setSyncStatus((prev) => ({ ...prev, status: "checking" }));
    try {
      const res = await fetch("/api/sync");
      if (res.ok) {
        const data = await res.json();
        setSyncStatus((prev) => ({
          ...data,
          status: "online",
          sseStatus: prev.sseStatus,
        }));
      } else {
        setSyncStatus((prev) => ({ ...prev, status: "offline" }));
      }
    } catch {
      setSyncStatus((prev) => ({ ...prev, status: "offline" }));
    }
  };

  const updateSSEStatus = useCallback((connected: boolean) => {
    setSyncStatus((prev) => ({
      ...prev,
      sseStatus: connected ? "connected" : "disconnected",
    }));
  }, []);

  useEffect(() => {
    checkSync();
    const interval = setInterval(checkSync, 30000);

    // SSE connection status listener
    const handleSSEConnect = () => updateSSEStatus(true);
    const handleSSEDisconnect = () => updateSSEStatus(false);

    window.addEventListener("sse:connected", handleSSEConnect);
    window.addEventListener("sse:disconnected", handleSSEDisconnect);

    return () => {
      clearInterval(interval);
      window.removeEventListener("sse:connected", handleSSEConnect);
      window.removeEventListener("sse:disconnected", handleSSEDisconnect);
    };
  }, [updateSSEStatus]);

  const getOverallStatus = () => {
    if (syncStatus.status === "offline") return "offline";
    if (syncStatus.sseStatus === "connected") return "realtime";
    if (syncStatus.sseStatus === "reconnecting") return "reconnecting";
    return "online";
  };

  const overall = getOverallStatus();

  const badge = (dotClass: string, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      {overall === "realtime" &&
        badge("bg-brand shadow-[0_0_8px_rgba(16,185,129,0.8)]", "Tiempo real", Wifi)}
      {overall === "online" &&
        badge("bg-sky-400", "Conectado", Wifi)}
      {overall === "reconnecting" &&
        badge("bg-amber-400 animate-pulse", "Reconectando…", Loader2)}
      {overall === "offline" &&
        badge("bg-red-500", "Sin conexión", WifiOff)}
      {syncStatus.status === "checking" &&
        badge("bg-amber-400 animate-pulse", "Verificando…", RefreshCw)}
    </div>
  );
}
