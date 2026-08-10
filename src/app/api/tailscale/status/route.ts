import { NextResponse } from "next/server";
import { execFile } from "child_process";

function getStatusJson() {
  return new Promise<{ ok: boolean; data?: unknown; error?: string }>((resolve) => {
    execFile(
      "tailscale",
      ["status", "--json"],
      { timeout: 10000 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: String(err.message || err) });
        try {
          resolve({ ok: true, data: JSON.parse(String(stdout)) });
        } catch (e) {
          resolve({ ok: false, error: "Respuesta invalida de tailscale" });
        }
      }
    );
  });
}

function getIp4() {
  return new Promise<string>((resolve) => {
    execFile("tailscale", ["ip", "-4"], { timeout: 10000 }, (err, stdout) => {
      resolve(err ? "" : String(stdout || "").trim());
    });
  });
}

export async function GET() {
  try {
    const result = await getStatusJson();
    if (!result.ok) {
      return NextResponse.json({
        available: false,
        online: false,
        error: result.error || "Tailscale no disponible en este equipo",
      });
    }

    const data = result.data as {
      Self?: { IPs?: string[]; HostName?: string; DNSName?: string };
      BackendState?: string;
    };
    const self = data.Self || {};
    const ip =
      (self.IPs || []).filter((i) => i.startsWith("100.")).join(", ") ||
      (await getIp4()) ||
      null;

    return NextResponse.json({
      available: true,
      online: data.BackendState === "Running",
      ip,
      hostName: self.HostName || null,
      dnsName: (self.DNSName || "").replace(/\.$/, "") || null,
      error: null,
    });
  } catch (e) {
    return NextResponse.json(
      { available: false, online: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}