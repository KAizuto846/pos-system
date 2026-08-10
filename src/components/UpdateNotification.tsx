"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type ViewStatus = ElectronUpdateStatus | { type: "idle" };

const emptySubscribe = () => () => {};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo actualizar la aplicación.";
}

export function UpdateNotification() {
  const isElectron = useSyncExternalStore(
    emptySubscribe,
    () => Boolean(window.electronAPI),
    () => false,
  );
  const [status, setStatus] = useState<ViewStatus>({ type: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    return window.electronAPI.onUpdateStatus((nextStatus) => {
      setStatus(nextStatus);
      setDismissed(false);
    });
  }, [isElectron]);

  if (!isElectron || !window.electronAPI) return null;

  const checkForUpdates = async () => {
    setDismissed(false);
    setStatus({ type: "checking" });
    try {
      const result = await window.electronAPI!.checkForUpdates();
      if (!result.enabled) {
        setStatus({
          type: "error",
          message: result.reason || "Las actualizaciones no están disponibles.",
        });
      } else if (result.status) {
        setStatus({ type: result.status, version: result.version });
      }
    } catch (error) {
      setStatus({ type: "error", message: getErrorMessage(error) });
    }
  };

  const installUpdate = async () => {
    setIsInstalling(true);
    try {
      await window.electronAPI!.installUpdate();
    } catch (error) {
      setStatus({ type: "error", message: getErrorMessage(error) });
      setIsInstalling(false);
    }
  };

  if (status.type === "idle") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-3 top-3 z-[100] bg-slate-950/90 shadow-lg backdrop-blur"
        onClick={checkForUpdates}
      >
        <RefreshCw />
        <span className="hidden sm:inline">Buscar actualización</span>
      </Button>
    );
  }

  if (dismissed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-3 top-3 z-[100] bg-slate-950/90 shadow-lg backdrop-blur"
        onClick={() => setDismissed(false)}
      >
        {status.type === "ready" ? <CheckCircle2 /> : <RefreshCw />}
        {status.type === "ready" ? "Actualización lista" : "Actualizaciones"}
      </Button>
    );
  }

  const isChecking = status.type === "checking";
  const canDismiss = status.type === "ready" || status.type === "not-available";

  return (
    <aside
      className="fixed left-1/2 top-2 z-[100] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur sm:px-4"
      role={status.type === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 text-primary">
          {status.type === "checking" && <RefreshCw className="animate-spin" />}
          {status.type === "available" && <Download />}
          {status.type === "downloading" && <Download />}
          {status.type === "ready" && <CheckCircle2 />}
          {status.type === "not-available" && <CheckCircle2 />}
          {status.type === "error" && <AlertTriangle className="text-red-400" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">
            {status.type === "checking" && "Buscando actualizaciones..."}
            {status.type === "available" &&
              `Version ${status.version || "nueva"} disponible`}
            {status.type === "downloading" &&
              `Descargando actualización: ${status.percent ?? 0}%`}
            {status.type === "ready" &&
              `Version ${status.version || "nueva"} lista para instalar`}
            {status.type === "not-available" && "La aplicación está actualizada"}
            {status.type === "error" && "Error al buscar actualizaciones"}
          </p>
          {status.type === "error" && (
            <p className="truncate text-xs text-red-300">{status.message}</p>
          )}
          {status.type === "downloading" && (
            <Progress className="mt-1.5 h-1.5" value={status.percent ?? 0} />
          )}
        </div>

        {status.type === "ready" && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              disabled={isInstalling}
              onClick={installUpdate}
            >
              <RotateCw className={isInstalling ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Reiniciar ahora</span>
              <span className="sm:hidden">Reiniciar</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
            >
              Más tarde
            </Button>
          </div>
        )}

        {status.type === "error" && (
          <Button type="button" variant="outline" size="sm" onClick={checkForUpdates}>
            Reintentar
          </Button>
        )}

        {canDismiss && status.type !== "ready" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Ocultar aviso"
            onClick={() => setDismissed(true)}
          >
            <X />
          </Button>
        )}
      </div>

      {isChecking && <span className="sr-only">Comprobación en curso</span>}
    </aside>
  );
}
