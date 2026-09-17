import os from "os";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips: { name: string; address: string }[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (net.address.startsWith("127.") || net.address.startsWith("169.254.")) continue;
      ips.push({ name, address: net.address });
    }
  }
  return ips;
}

function getPreferredLanIP() {
  const ips = getLanIPs();
  if (ips.length === 0) return "";
  const preferred = ips.find(
    (i) =>
      i.address.startsWith("192.168.") ||
      i.address.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(i.address)
  );
  return (preferred || ips[0]).address;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const port = Number(process.env.PORT) || 3000;
  const ip = getPreferredLanIP();
  return Response.json({
    lanIP: ip,
    port,
    url: ip ? `http://${ip}:${port}` : "",
    ips: getLanIPs(),
  });
}