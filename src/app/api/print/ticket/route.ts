import { auth } from "@/lib/auth";
import { spawn } from "node:child_process";
import * as fs from "node:fs";

// Impresora de tickets (térmica ESC/POS).
// PRINTER_DEVICE: dispositivo USB directo (usblp). PRINTER_QUEUE: cola CUPS raw.
const PRINTER_DEVICE = process.env.PRINTER_DEVICE || "/dev/usb/lp0";
const PRINTER_QUEUE = process.env.PRINTER_QUEUE || "mini";
const PRINT_TOKEN = process.env.PRINT_TOKEN || "";

const ESC = "\x1b";
const GS = "\x1d";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-print-token",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

// Auth: sesión válida (navegador mismo-origen) O token de impresión
// (app Electron remota / impresión cruzada vía Funnel).
function isAuthorized(request: Request, session: { user?: unknown } | null): boolean {
  if (session?.user) return true;
  if (!PRINT_TOKEN) return false;
  const token = request.headers.get("x-print-token") || "";
  return token === PRINT_TOKEN;
}

// Envuelve texto plano en comandos ESC/POS: init, texto, avance y corte.
// Se codifica a latin1: las impresoras térmicas usan CP437 por defecto y los
// acentos del español (á é í ó ú ñ ¿ ¡) comparten byte con latin1.
function wrapEscPos(text: string): Buffer {
  const sanitized = text
    .split("\n")
    .map((line) => line.replace(/[^\x20-\xff]/g, "?"))
    .join("\n");
  return Buffer.concat([
    Buffer.from(`${ESC}@`, "latin1"),
    Buffer.from(sanitized, "latin1"),
    Buffer.from("\n\n\n", "latin1"),
    Buffer.from(`${GS}V\x00`, "latin1"),
  ]);
}

function deviceAvailable(): boolean {
  try {
    fs.accessSync(PRINTER_DEVICE);
    return true;
  } catch {
    return false;
  }
}

function printViaLp(buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("lp", ["-d", PRINTER_QUEUE, "-o", "raw", "-"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* noop */
      }
      reject(new Error(`lp agotó el tiempo (20s)`));
    }, 20000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`lp salió con código ${code}`));
    });
    child.stdin.end(buf);
  });
}

// Preflight CORS (la app Electron remota hace fetch cross-origin).
export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

// Estado de la impresora para diagnóstico (GET).
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!isAuthorized(request, session)) {
      return withCors(Response.json({ error: "No autorizado" }, { status: 401 }));
    }
    return withCors(
      Response.json({
        ok: true,
        device: PRINTER_DEVICE,
        deviceAvailable: deviceAvailable(),
        queue: PRINTER_QUEUE,
      })
    );
  } catch (e) {
    return withCors(
      Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Error interno" },
        { status: 500 }
      )
    );
  }
}

// Imprime un ticket: recibe { text } (ticket en texto plano) y lo escribe
// como ESC/POS. Primero intenta escritura directa al dispositivo USB;
// si no hay dispositivo, cae a la cola CUPS raw.
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!isAuthorized(request, session)) {
      return withCors(Response.json({ error: "No autorizado" }, { status: 401 }));
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) {
      return withCors(Response.json({ error: "text vacío" }, { status: 400 }));
    }

    const buf = wrapEscPos(text);

    if (deviceAvailable()) {
      try {
        fs.writeFileSync(PRINTER_DEVICE, buf);
        return withCors(Response.json({ ok: true, method: "device" }));
      } catch {
        // Sin permiso o dispositivo ocupado: probar por CUPS.
      }
    }

    try {
      await printViaLp(buf);
      return withCors(Response.json({ ok: true, method: "lp" }));
    } catch (e) {
      return withCors(
        Response.json(
          { ok: false, error: e instanceof Error ? e.message : "Error al imprimir" },
          { status: 500 }
        )
      );
    }
  } catch (e) {
    return withCors(
      Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Error interno" },
        { status: 500 }
      )
    );
  }
}
