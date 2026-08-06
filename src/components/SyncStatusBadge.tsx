"use client";

import { useEffect, useRef, useState } from "react";
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: "checking",
    sseStatus: "disconnected",
  });

  const checkSync = async () => {
    if (document.hidden) return;

    await Promise.resolve();

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSyncStatus((prev) => ({ ...prev, status: "checking" }));
    try {
      const res = await fetch("/api/sync", { signal: controller.signal });
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
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSyncStatus((prev) => ({ ...prev, status: "offline" }));
    }
  };

  useEffect(() => {
    const initialCheck = setTimeout(checkSync, 0);
    const interval = setInterval(checkSync, 60000);

    const updateSSEStatus = (sseStatus: SyncStatus["sseStatus"]) => {
      setSyncStatus((prev) => ({ ...prev, sseStatus }));
    };
    const handleSSEConnect = () => updateSSEStatus("connected");
    const handleSSEDisconnect = () => updateSSEStatus("disconnected");
    const handleSSEReconnect = () => updateSSEStatus("reconnecting");
    const handleVisibilityChange = () => {
      if (document.hidden) abortControllerRef.current?.abort();
      else checkSync();
    };

    window.addEventListener("sse:connected", handleSSEConnect);
    window.addEventListener("sse:disconnected", handleSSEDisconnect);
    window.addEventListener("sse:reconnecting", handleSSEReconnect);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      abortControllerRef.current?.abort();
      window.removeEventListener("sse:connected", handleSSEConnect);
      window.removeEventListener("sse:disconnected", handleSSEDisconnect);
      window.removeEventListener("sse:reconnecting", handleSSEReconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const getOverallStatus = () => {
    if (syncStatus.status === "offline") return "offline";
    if (syncStatus.status === "checking") return "checking";
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
      {overall === "checking" && (
        <Badge variant="outline" className="gap-1 border-yellow-500/50 text-yellow-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Verificando...</span>
        </Badge>
      )}
    </div>
  );
}
