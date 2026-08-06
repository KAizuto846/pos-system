// Instrumentation - se ejecuta una vez al iniciar el servidor (produccion y dev)
// Inicia el loop automatico de sincronizacion por relay si esta configurado.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const { startRelayLoop } = await import('@/lib/relay-loop');
  startRelayLoop();
}
