// Relay loop - sincronizacion automatica por relay cada 30 segundos.
// Corre dentro del servidor Next.js (funciona tanto en Electron como en web).

import { getRelayConfig, runRelaySync } from "@/lib/relay-sync";

let loopStarted = false;

export function startRelayLoop() {
  if (loopStarted) return;
  loopStarted = true;

  setInterval(async () => {
    try {
      const { relayUrl } = await getRelayConfig();
      if (!relayUrl) return; // Relay no configurado: no hacer nada

      const result = await runRelaySync();
      if (result.pulled > 0 || result.pushed > 0) {
        console.log(`[relay] Sync: +${result.pulled} recibidos, +${result.pushed} enviados`);
      } else if (!result.ok) {
        console.warn(`[relay] Sync fallo: ${result.error}`);
      }
    } catch (e) {
      console.error('[relay] Loop error:', e instanceof Error ? e.message : e);
    }
  }, 30000);
}
