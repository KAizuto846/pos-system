import { NextResponse } from "next/server";
import { execFile } from "child_process";

function execTailscale(args: string[], timeout = 10000) {
  return new Promise<{ ok: boolean; data?: unknown; error?: string }>((resolve) => {
    execFile(
      "tailscale",
      args,
      { timeout },
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

async function verifyUrl(url: string, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    return res.ok || res.status > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const result = await execTailscale(["status", "--json"]);
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

    // Estado de serve/funnel: si Funnel esta habilitado la URL es publica;
    // si solo quedo serve, la URL solo funciona dentro del tailnet.
    const fRes = await execTailscale(["funnel", "status", "--json"]);
    let funnelEnabled = false;
    let serveEnabled = false;
    let capUrl = "";
    let funnelUrl: string | null = null;
    let funnelReachable: boolean | null = null;
    if (fRes.ok) {
      const fd = fRes.data as {
        Funnel?: { Enabled?: boolean; CapURL?: string; Hostname?: string };
        Serve?: { Enabled?: boolean; Hostname?: string };
      };
      funnelEnabled = Boolean(fd.Funnel && fd.Funnel.Enabled);
      serveEnabled = Boolean(fd.Serve && fd.Serve.Enabled);
      capUrl = (fd.Funnel && fd.Funnel.CapURL) || "";
      const host =
        (fd.Serve && fd.Serve.Hostname) ||
        (fd.Funnel && fd.Funnel.Hostname) ||
        "";
      funnelUrl = host ? `https://${host}` : null;
      if (funnelEnabled && funnelUrl) {
        funnelReachable = await verifyUrl(funnelUrl);
      }
    }

    return NextResponse.json({
      available: true,
      online: data.BackendState === "Running",
      ip,
      hostName: self.HostName || null,
      dnsName: (self.DNSName || "").replace(/\.$/, "") || null,
      error: null,
      funnelUrl,
      funnelEnabled,
      serveEnabled,
      capUrl,
      funnelReachable,
    });
  } catch (e) {
    return NextResponse.json(
      { available: false, online: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
