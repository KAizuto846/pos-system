// SSE Broadcaster - Manages Server-Sent Events connections
// For <10 devices, in-memory storage is sufficient

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  connectedAt: Date;
  lastHeartbeat: Date;
};

const clients = new Map<string, SSEClient>();
const encoder = new TextEncoder();

// Heartbeat interval (30 seconds)
let heartbeatInterval: NodeJS.Timeout | null = null;

function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    const now = new Date();
    const clientArray = Array.from(clients.entries());
    for (const [, client] of clientArray) {
      try {
        // Send SSE comment as heartbeat
        client.controller.enqueue(encoder.encode(":ping\n\n"));
        client.lastHeartbeat = now;
      } catch {
        clients.delete(client.id);
      }
    }
    // Cleanup stale clients (no heartbeat response in 60s)
    for (const [, client] of clientArray) {
      if (now.getTime() - client.lastHeartbeat.getTime() > 60000) {
        clients.delete(client.id);
      }
    }
    // Stop heartbeat if no clients
    if (clients.size === 0 && heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }, 30000);
}

export function addClient(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  clients.set(id, {
    id,
    controller,
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
  });
  startHeartbeat();
  console.log(`[SSE] Client connected: ${id} (total: ${clients.size})`);
}

export function removeClient(id: string) {
  clients.delete(id);
  console.log(`[SSE] Client disconnected: ${id} (total: ${clients.size})`);
}

export function broadcast(event: string, data: unknown) {
  if (clients.size === 0) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = encoder.encode(message);

  let sent = 0;
  let failed = 0;

  const clientArray = Array.from(clients.entries());
  for (const [, client] of clientArray) {
    try {
      client.controller.enqueue(encoded);
      sent++;
    } catch {
      clients.delete(client.id);
      failed++;
    }
  }

  if (failed > 0) {
    console.log(`[SSE] Broadcast "${event}": ${sent} sent, ${failed} failed`);
  }
}

export function getClientCount(): number {
  return clients.size;
}

export function broadcastSystem(event: string, data: unknown) {
  broadcast(event, data);
}
