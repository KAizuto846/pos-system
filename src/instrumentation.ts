// Instrumentation - se ejecuta una vez al iniciar el servidor (produccion y dev)
// Inicia el loop automatico de sincronizacion por relay y el discovery LAN.
// En Electron (ELECTRON_RUN_AS_NODE) el discovery y sync LAN ya los hace el
// proceso principal (electron/main.js), asi que se omiten para no duplicar.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const { startRelayLoop } = await import('@/lib/relay-loop');
  startRelayLoop();

  const { startBackupLoop } = await import('@/lib/backup-loop');
  startBackupLoop();

  if (!process.env.ELECTRON_RUN_AS_NODE) {
    const { startLanDiscovery, announceLanServer } = await import('@/lib/lan-discovery');
    const { startLanSyncLoop } = await import('@/lib/lan-sync');
    const port = Number(process.env.PORT) || 3000;
    try {
      startLanDiscovery();
      announceLanServer(port);
      startLanSyncLoop();
      console.log(`[lan] Discovery + sync LAN iniciados en :${port}`);
    } catch (e) {
      console.error('[lan] Error iniciando discovery:', e instanceof Error ? e.message : e);
    }
  }
}
