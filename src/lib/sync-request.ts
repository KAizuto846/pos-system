export class SyncRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function isSyncAuthorized(request: Request) {
  const secret = process.env.SYNC_SECRET;
  return !secret || request.headers.get("x-sync-secret") === secret;
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new SyncRequestError("Payload too large", 413);
  }

  if (!request.body) throw new SyncRequestError("Request body required", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new SyncRequestError("Payload too large", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SyncRequestError("Invalid JSON payload", 400);
  }
}
