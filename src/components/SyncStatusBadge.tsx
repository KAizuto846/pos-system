"use client";

import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="flex items-center gap-2">
      {overall === "realtime" && (
        <Badge variant="outline" className="gap-1 border-green-500/50 text-green-600">
          <Wifi className="h-3 w-3" />
          <span className="hidden sm:inline">Tiempo real</span>
        </Badge>
      )}
      {overall === "online" && (
        <Badge variant="outline" className="gap-1 border-blue-500/50 text-blue-600">
          <Wifi className="h-3 w-3" />
          <span className="hidden sm:inline">Conectado</span>
        </Badge>
      )}
      {overall === "reconnecting" && (
        <Badge variant="outline" className="gap-1 border-yellow-500/50 text-yellow-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Reconectando...</span>
        </Badge>
      )}
      {overall === "offline" && (
        <Badge variant="outline" className="gap-1 border-red-500/50 text-red-600">
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">Sin conexion</span>
        </Badge>
      )}
      {syncStatus.status === "checking" && (
        <Badge variant="outline" className="gap-1 border-yellow-500/50 text-yellow-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Verificando...</span>
        </Badge>
      )}
    </div>
  );
}
