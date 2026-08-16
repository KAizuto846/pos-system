// Loop automático de respaldos. Corre dentro del servidor (funciona en Electron
// y en web). Revisa cada 60 segundos si toca ejecutar un respaldo según la
// configuración (intervalo en horas). El lock evita solapamientos.

import { getBackupConfig, shouldRunBackup, runBackup } from "@/lib/backup";

let loopStarted = false;
let backupInFlight = false;

export function startBackupLoop() {
  if (loopStarted) return;
  loopStarted = true;

  setInterval(async () => {
    if (backupInFlight) return;
    backupInFlight = true;
    try {
      const config = await getBackupConfig();
      if (!shouldRunBackup(config)) return;

      const result = await runBackup(config);
      if (result.ok) {
        console.log(`[backup] ${config.lastResult || "Respaldo completado"}`);
      } else {
        console.warn(`[backup] Fallo: ${result.error}`);
      }
    } catch (e) {
      console.error("[backup] Loop error:", e instanceof Error ? e.message : e);
    } finally {
      backupInFlight = false;
    }
  }, 60000);
}
