// POS System - Integracion con Tailscale (acceso remoto)
//
// Automatiza en cada dispositivo:
//   1. ensureInstalled()  - instala Tailscale via winget (Windows) si falta
//   2. join()             - se une a la red del dueno con una authkey
//   3. funnelOn()         - publica la app en una URL publica (Funnel)
//   4. getStatus()        - estado actual (online, IP 100.x, URL publica)
//
// La authkey se pasa desde el wizard de primer arranque o la variable de
// entorno POS_TAILSCALE_AUTHKEY. Nunca se escribe en el config de la app.

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_TIMEOUT = 30000;

function pickTailscaleBinary() {
  if (process.platform !== 'win32') return 'tailscale';
  const candidates = [
    process.env.LocalAppData ? path.join(process.env.LocalAppData, 'Programs', 'Tailscale', 'tailscale.exe') : '',
    'C:\\Program Files\\Tailscale\\tailscale.exe',
    'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
    'tailscale',
  ];
  return candidates.find((c) => {
    if (c === 'tailscale') {
      try { execFileSyncSafe('tailscale', ['version']); return true; } catch (e) { return false; }
    }
    try { fs.accessSync(c); return true; } catch (e) { return false; }
  }) || null;
}

function execFileSyncSafe(cmd, args) {
  return require('child_process').execFileSync(cmd, args, { stdio: 'pipe', timeout: 10000 });
}

function run(cmd, args, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, code: err.code, signal: err.signal, error: (stderr || err.message || '').trim() });
        return;
      }
      resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function tailscale(args, timeoutMs) {
  const bin = pickTailscaleBinary();
  if (!bin) return Promise.resolve({ ok: false, error: 'Tailscale no esta instalado' });
  return run(bin, args, timeoutMs);
}

// ─── Instalacion (Windows) ───────────────────────────────────
async function ensureInstalled() {
  if (pickTailscaleBinary()) return { ok: true, already: true };

  if (process.platform !== 'win32') {
    return { ok: false, error: 'Instala Tailscale manualmente: curl -fsSL https://tailscale.com/install.sh | sh' };
  }

  const probe = await run('winget', ['--version']);
  if (!probe.ok) {
    return { ok: false, error: 'No se encontro winget. Instala Tailscale manualmente desde https://tailscale.com/download' };
  }

  const out = await run('winget', ['install', 'Tailscale.Tailscale', '--silent', '--accept-package-agreements', '--accept-source-agreements'], 240000);
  if (!out.ok && !out.error.includes('installed')) {
    return { ok: false, error: `winget fallo: ${out.error || out.code}` };
  }
  if (!pickTailscaleBinary()) {
    return { ok: false, error: 'Tailscale se instalo pero el comando no esta disponible. Reinicia la app.' };
  }
  return { ok: true, installed: true };
}

// ─── Estado ──────────────────────────────────────────────────
async function getStatus() {
  const res = await tailscale(['status', '--json'], 15000);
  if (!res.ok) {
    return { available: false, online: false, error: res.error || 'No conectado' };
  }
  try {
    const data = JSON.parse(res.stdout);
    let ip = (data.Self?.IPs || []).filter((i) => i.startsWith('100.')).join(', ');
    if (!ip) {
      const ipRes = await tailscale(['ip', '-4'], 10000);
      if (ipRes.ok) ip = (ipRes.stdout || '').trim();
    }
    return {
      available: true,
      online: data.BackendState === 'Running',
      ip,
      hostName: data.Self?.HostName || '',
      dnsName: (data.Self?.DNSName || '').replace(/\.$/, ''),
      error: null,
    };
  } catch (e) {
    return { available: true, online: false, error: 'Respuesta invalida de tailscale' };
  }
}

async function getFunnelUrl() {
  const res = await tailscale(['funnel', 'status'], 15000);
  if (!res.ok) return null;
  const m = (res.stdout + res.stderr).match(/https:\/\/[a-zA-Z0-9.-]+\.ts\.net/);
  return m ? m[0] : null;
}

// ─── Unirse a la red ─────────────────────────────────────────
async function join(authkey, hostname) {
  if (!authkey || !authkey.trim()) {
    return { ok: false, error: 'Falta la authkey de Tailscale' };
  }
  const args = ['up', '--authkey', authkey.trim(), '--hostname', hostname || 'POS-Equipo'];
  const res = await tailscale(args, 120000);
  if (!res.ok) {
    return { ok: false, error: `No se pudo unir a la red: ${res.error || res.code}` };
  }
  return { ok: true };
}

// ─── Funnel (URL publica) ────────────────────────────────────
async function setFunnel(enabled, port) {
  if (!enabled) {
    await tailscale(['funnel', 'off'], 30000);
    await tailscale(['serve', 'off'], 30000);
    return { ok: true, enabled: false };
  }
  const target = `http://127.0.0.1:${port || 3000}`;
  const serve = await tailscale(['serve', '--bg', target], 30000);
  if (!serve.ok && !serve.error.includes('already')) {
    return { ok: false, error: `serve fallo: ${serve.error}` };
  }
  const funnel = await tailscale(['funnel', '--bg', target], 30000);
  if (!funnel.ok && !funnel.error.includes('already')) {
    return { ok: false, error: `funnel fallo: ${funnel.error}` };
  }
  return { ok: true, enabled: true, url: await getFunnelUrl() };
}

// ─── Desconectar / revertir ─────────────────────────────────
async function disconnect() {
  const res = await tailscale(['down'], 30000);
  if (!res.ok) {
    return { ok: false, error: res.error || res.code };
  }
  return { ok: true };
}

// ─── Flujo completo (primer arranque) ────────────────────────
async function runTailscaleFlow(opts) {
  const { authkey, hostname, funnel, port, onProgress } = opts || {};
  const progress = (m) => { if (typeof onProgress === 'function') onProgress(m); };

  progress('Verificando instalacion de Tailscale...');
  const inst = await ensureInstalled();
  if (!inst.ok) return { ok: false, error: inst.error };

  progress('Conectando a la red remota...');
  const joined = await join(authkey, hostname);
  if (!joined.ok) return { ok: false, error: joined.error };

  const status = await getStatus();
  if (!status.online) return { ok: false, error: 'Tailscale no quedo en linea despues de conectarse' };

  let funnelResult = null;
  if (funnel) {
    progress('Publicando en internet (Funnel)...');
    funnelResult = await setFunnel(true, port);
    if (!funnelResult.ok) return { ok: false, error: funnelResult.error };
  }

  progress('Listo.');
  return {
    ok: true,
    online: true,
    ip: status.ip,
    dnsName: status.dnsName,
    funnelUrl: funnelResult && funnelResult.enabled ? funnelResult.url : (await getFunnelUrl()),
  };
}

module.exports = { ensureInstalled, getStatus, getFunnelUrl, join, setFunnel, disconnect, runTailscaleFlow };