"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SyncStatus {
  status: "online" | "offline" | "checking";
  serverTime?: string;
  stats?: {
    products: number;
    sales: number;
    users: number;
    lastSaleAt: string | null;
  };
  version?: string;
}

export function SyncStatusBadge() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: "checking",
  });

  const checkSync = async () => {
    setSyncStatus((prev) => ({ ...prev, status: "checking" }));
    try {
      const res = await fetch("/api/sync");
      if (res.ok) {
        const data = await res.json();
        setSyncStatus({ ...data, status: "online" });
      } else {
        setSyncStatus({ status: "offline" });
      }
    } catch {
      setSyncStatus({ status: "offline" });
    }
  };

  useEffect(() => {
    checkSync();
    const interval = setInterval(checkSync, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {syncStatus.status === "online" && (
        <Badge variant="outline" className="gap-1 border-green-500/50 text-green-600">
          <Wifi className="h-3 w-3" />
          <span>Conectado</span>
        </Badge>
      )}
      {syncStatus.status === "offline" && (
        <Badge variant="outline" className="gap-1 border-red-500/50 text-red-600">
          <WifiOff className="h-3 w-3" />
          <span>Sin conexión</span>
        </Badge>
      )}
      {syncStatus.status === "checking" && (
        <Badge variant="outline" className="gap-1 border-yellow-500/50 text-yellow-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Verificando...</span>
        </Badge>
      )}
    </div>
  );
}
