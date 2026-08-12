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
const os = require('os');

const DEFAULT_TIMEOUT = 30000;

// Errores del daemon corrupto (control server noise key en cero / HTTP 500 al
// habilitar una feature de serve). Cuando aparecen, reiniciar el servicio o
// re-autenticar suele arreglarlo.
const DAEMON_BROKEN_RE = /Internal Server Error|zero serverNoiseKey|Error 500|\b500\b/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Guarda/lee la authkey cifrada (DPAPI via safeStorage en main.js). Se usa
// para re-autenticar automaticamente al reparar, sin pedir la authkey de nuevo.
let authkeyStore = null;
function setAuthkeyStore(store) {
  authkeyStore = store;
}
function loadStoredAuthkey() {
  if (!authkeyStore || typeof authkeyStore.load !== 'function') return '';
  try {
    return authkeyStore.load() || '';
  } catch (e) {
    return '';
  }
}

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

// Estado real de serve/funnel (JSON): si Funnel esta habilitado (URL publica),
// si solo esta serve (privado al tailnet) y el enlace para habilitar Funnel.
async function getFunnelStatus() {
  const res = await tailscale(['funnel', 'status', '--json'], 15000);
  const fallback = { enabled: false, serveEnabled: false, capUrl: '', url: null, error: (res.ok ? null : (res.error || 'No conectado')) };
  if (!res.ok) return fallback;
  try {
    const data = JSON.parse(res.stdout);
    const enabled = Boolean(data && data.Funnel && data.Funnel.Enabled);
    const serveEnabled = Boolean(data && data.Serve && data.Serve.Enabled);
    let host = '';
    if (data && typeof data.Serve === 'object' && data.Serve && typeof data.Serve.Hostname === 'string' && data.Serve.Hostname) host = data.Serve.Hostname;
    if (!host && data && typeof data.Funnel === 'object' && data.Funnel && typeof data.Funnel.Hostname === 'string' && data.Funnel.Hostname) host = data.Funnel.Hostname;
    let capUrl = '';
    if (data && typeof data.Funnel === 'object' && data.Funnel && typeof data.Funnel.CapURL === 'string' && data.Funnel.CapURL) capUrl = data.Funnel.CapURL;
    return { enabled, serveEnabled, capUrl, url: host ? `https://${host}` : null, error: null };
  } catch (e) {
    // Fallback por texto
    const m = String(res.stdout + res.stderr).match(/https:\/\/[a-zA-Z0-9.-]+\.ts\.net/);
    return { ...fallback, url: m ? m[0] : null, error: 'Respuesta inválida de tailscale' };
  }
}

async function getFunnelUrl() {
  const fs = await getFunnelStatus();
  if (fs.url) return fs.url;
  const res = await tailscale(['funnel', 'status'], 15000);
  if (!res.ok) return null;
  const m = (res.stdout + res.stderr).match(/https:\/\/[a-zA-Z0-9.-]+\.ts\.net/);
  return m ? m[0] : null;
}

// Comprueba que una URL responde (aunque sea con redireccion o 401 del login).
async function verifyUrl(url, timeoutMs = 10000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Sin respuesta' };
  }
}

// La URL publica tarda unos segundos en provisionar el certificado HTTPS.
async function verifyUrlWithRetry(url, attempts = 5, gapMs = 2000, timeoutMs = 8000) {
  let v = null;
  for (let i = 0; i < attempts; i++) {
    v = await verifyUrl(url, timeoutMs);
    if (v.ok) return v;
    if (i < attempts - 1) await sleep(gapMs);
  }
  return v || verifyUrl(url, timeoutMs);
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
function isDaemonBroken(res) {
  return !!(res && !res.ok && DAEMON_BROKEN_RE.test(res.error || ''));
}

async function setFunnel(enabled, port) {
  if (!enabled) {
    await tailscale(['funnel', 'off'], 30000);
    await tailscale(['serve', 'off'], 30000);
    return { ok: true, enabled: false };
  }
  const target = `http://127.0.0.1:${port || 3000}`;
  const serve = await tailscale(['serve', '--bg', target], 30000);
  if (!serve.ok && !serve.error.includes('already')) {
    return { ok: false, code: isDaemonBroken(serve) ? 'daemon-broken' : undefined, error: `serve fallo: ${serve.error}` };
  }
  const funnel = await tailscale(['funnel', '--bg', target], 30000);
  if (!funnel.ok && !funnel.error.includes('already')) {
    return { ok: false, code: isDaemonBroken(funnel) ? 'daemon-broken' : undefined, error: `funnel fallo: ${funnel.error}` };
  }

  // Funnel debe quedar habilitado de verdad para que la URL sea publica
  // (accesible desde cualquier WiFi). Si solo quedo serve, es privada al
  // tailnet y desde el celular sin Tailscale no se abre.
  const fs = await getFunnelStatus();
  if (!fs.enabled) {
    return {
      ok: false,
      code: 'funnel-not-enabled',
      capUrl: fs.capUrl || '',
      url: fs.url || '',
      error: 'Funnel no está habilitado para este equipo. Debes habilitarlo en la consola de Tailscale para que la URL sea pública.',
    };
  }
  if (!fs.url) {
    return { ok: false, code: 'funnel-not-enabled', capUrl: fs.capUrl || '', error: 'No se pudo obtener la URL pública de Funnel' };
  }

  // Verifica que la URL publica responde realmente (el certificado HTTPS tarda
  // unos segundos en provisionarse, por eso se reintenta).
  const v = await verifyUrlWithRetry(fs.url);
  if (!v.ok) {
    return {
      ok: false,
      code: 'url-not-reachable',
      url: fs.url,
      error: `La URL pública ${fs.url} no responde todavía: ${v.error}`,
    };
  }

  return { ok: true, enabled: true, url: fs.url, reachable: true };
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
    if (funnelResult.code === 'daemon-broken') {
      progress('El servicio de Tailscale está dañado (HTTP 500). Reparándolo automáticamente...');
      const rep = await repair({ authkey, funnel: true, port, onProgress });
      if (!rep.ok) {
        return { ok: false, code: 'daemon-broken', error: `No se pudo publicar: ${rep.error}` };
      }
      funnelResult = { ok: true, enabled: true, url: rep.funnelUrl || (await getFunnelUrl()) };
    }
    if (!funnelResult.ok) return { ok: false, code: funnelResult.code, capUrl: funnelResult.capUrl, url: funnelResult.url, error: funnelResult.error };
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

// ─── Reparacion automatica ───────────────────────────────────
// Arregla el daemon de Tailscale (error "HTTP 500: zero serverNoiseKey" al
// habilitar serve/serve-funnel). Pasos, en orden:
//   1. Reiniciar el servicio de Tailscale  (requiere admin en Windows)
//   2. Re-autenticar con la authkey guardada / variable de entorno
//   3. Restablecer el estado interno corrupto (ultimo recurso)
// Devuelve { ok:true, repaired } o { ok:false, error } (con needsLogin/loginUrl
// si hace falta autenticacion manual en el navegador).

async function repair(opts = {}) {
  const { funnel, port, onProgress } = opts || {};
  const progress = (m) => { if (typeof onProgress === 'function') onProgress(m); };

  progress('Verificando instalacion de Tailscale...');
  const inst = await ensureInstalled();
  if (!inst.ok) return { ok: false, error: inst.error };

  progress('Diagnosticando el estado de Tailscale...');
  if (!(await detectBroken())) {
    progress('Tailscale se ve sano.');
    if (funnel) {
      const f = await setFunnel(true, port);
      if (!f.ok) return { ok: false, code: f.code, capUrl: f.capUrl, url: f.url, error: f.error };
      return { ok: true, repaired: 'none', funnelUrl: f.url, reachable: f.reachable };
    }
    return { ok: true, repaired: 'none' };
  }

  progress('El servicio de Tailscale está dañado. Reiniciándolo... (acepta el permiso de administrador si aparece)');
  const rs = await restartService();
  if (!rs.ok) return { ok: false, error: rs.error };
  await sleep(4000);

  let repaired = 'restart';
  if (!(await detectBroken())) {
    progress('El reinicio del servicio arregló Tailscale.');
  } else {
    repaired = 'reauth';
    const prefix = await getStatus();
    const host = prefix.hostName || opts.hostname || 'POS-Equipo';
    const key = String(opts.authkey || '').trim() || loadStoredAuthkey() || String(process.env.POS_TAILSCALE_AUTHKEY || '').trim();

    if (key) {
      progress('Re-autenticando este equipo en la red remota...');
      await tailscale(['logout'], 30000);
      const up = await tailscale(['up', '--authkey', key, '--hostname', host], 120000);
      if (!up.ok) return { ok: false, error: `No se pudo re-autenticar: ${up.error}` };
    } else {
      progress('Se necesita autenticación manual...');
      const lr = await tailscale(['up'], 30000);
      const m = String(lr.stdout + lr.stderr).match(/https:\/\/login\.tailscale\.com\/a\/[A-Za-z0-9_-]+/);
      if (!m) {
        return {
          ok: false,
          needsLogin: true,
          error: 'Se necesita autenticación manual. Ejecuta "tailscale up" y sigue el enlace, o guarda la authkey en la app.',
        };
      }
      if (typeof opts.onLoginRequired === 'function') {
        try { opts.onLoginRequired(m[0]); } catch (e) {}
      }
      progress(`Autentícate en el navegador: ${m[0]}. Esperando...`);
      const st = await waitOnline(progress, 180000);
      if (!st.online) {
        return {
          ok: false,
          needsLogin: true,
          loginUrl: m[0],
          error: `No se completó la autenticación. Abre de nuevo el enlace: ${m[0]}`,
        };
      }
    }

    if (await detectBroken()) {
      if (!key) {
        return {
          ok: false,
          error: 'El estado de Tailscale sigue dañado y no hay authkey guardada para restablecerlo. Pega la authkey en la app y vuelve a intentar.',
        };
      }
      repaired = 'reset';
      progress('El estado interno está corrupto. Restableciéndolo... (acepta el permiso de administrador si aparece)');
      const rst = await resetState();
      if (!rst.ok) return { ok: false, error: rst.error };
      await sleep(4000);
      progress('Re-autenticando después del restablecimiento...');
      const up = await tailscale(['up', '--authkey', key, '--hostname', host], 120000);
      if (!up.ok) return { ok: false, error: `No se pudo re-autenticar: ${up.error}` };
      if (await detectBroken()) {
        return { ok: false, error: 'Tailscale sigue sin funcionar después de la reparación. Reinicia el equipo.' };
      }
    }
  }

  const status = await getStatus();
  let funnelUrl = null;
  if (funnel) {
    progress('Verificando la URL pública...');
    const f = await setFunnel(true, port);
    if (!f.ok) return { ok: false, code: f.code, capUrl: f.capUrl, url: f.url, error: f.error };
    funnelUrl = f.url;
  }

  progress('Reparación completada.');
  return { ok: true, repaired, online: status.online, ip: status.ip, dnsName: status.dnsName, funnelUrl };
}

// Detecta un daemon roto: sin conexion, o "serve status" fallando con HTTP 500.
async function detectBroken() {
  const st = await getStatus();
  if (!st.available) return true;
  if (!st.online) return true;
  const ss = await tailscale(['serve', 'status'], 15000);
  return isDaemonBroken(ss);
}

// Espera (con progreso) hasta que Tailscale quede en linea.
async function waitOnline(onProgress, timeoutMs = 180000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await getStatus();
    if (last.online) return last;
    if (onProgress) {
      try { onProgress(`Esperando conexión... (${Math.round((Date.now() - start) / 1000)}s)`); } catch (e) {}
    }
    await sleep(3000);
  }
  return last || await getStatus();
}

// Reinicia el servicio del daemon (requiere admin). En Windows se eleva con
// UAC via PowerShell; se usa un .bat temporal, no requiere permisos previos.
async function restartService() {
  if (process.platform === 'win32') {
    const bat = path.join(os.tmpdir(), 'pos-tailscale-restart.bat');
    fs.writeFileSync(bat, '@echo off\r\nnet stop Tailscale >nul 2>&1\r\nnet start Tailscale >nul 2>&1\r\n', 'utf8');
    const res = await elevatedRun(bat);
    if (!res.ok && /cancel/i.test(res.error)) {
      return { ok: false, error: 'No se aceptó el permiso de administrador necesario para reiniciar Tailscale.' };
    }
    if (!res.ok) return { ok: false, error: `No se pudo reiniciar el servicio de Tailscale: ${res.error}` };
    return { ok: true };
  }
  if (process.platform === 'linux') {
    const r1 = await run('systemctl', ['restart', 'tailscaled'], 30000);
    if (r1.ok) return { ok: true };
    const r2 = await run('pkexec', ['systemctl', 'restart', 'tailscaled'], 60000);
    if (r2.ok) return { ok: true };
    return { ok: false, error: 'No se pudo reiniciar tailscaled (necesita permisos de root): sudo systemctl restart tailscaled' };
  }
  return { ok: false, error: 'Reinicio de Tailscale no soportado en esta plataforma' };
}

// Ultimo recurso: renombra el estado corrupto del daemon para que se regenere.
// Al perder el estado, el equipo sale de la red: hay que volver a autenticar y
// re-crear la configuracion de serve/funnel.
async function resetState() {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'El restablecimiento de estado solo está disponible en Windows' };
  }
  const bat = path.join(os.tmpdir(), 'pos-tailscale-reset.bat');
  const content = [
    '@echo off',
    'net stop Tailscale >nul 2>&1',
    'ren "C:\\ProgramData\\Tailscale\\tailscaled.state" "tailscaled.state.bak" 2>nul',
    'net start Tailscale >nul 2>&1',
    '',
  ].join('\r\n');
  fs.writeFileSync(bat, content, 'utf8');
  const res = await elevatedRun(bat);
  if (!res.ok && /cancel/i.test(res.error)) {
    return { ok: false, error: 'No se aceptó el permiso de administrador necesario para restablecer Tailscale.' };
  }
  if (!res.ok) return { ok: false, error: `No se pudo restablecer el estado de Tailscale: ${res.error}` };
  return { ok: true };
}

// Ejecuta un .bat como administrador (ventana UAC). Devuelve el codigo de
// salida del proceso elevado.
function elevatedRun(batPath) {
  const ps = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','"${batPath}"' -Verb RunAs -Wait -PassThru; exit $p.ExitCode`,
  ];
  return run('powershell.exe', ps, 120000);
}

module.exports = { ensureInstalled, getStatus, getFunnelUrl, getFunnelStatus, verifyUrl, join, setFunnel, disconnect, runTailscaleFlow, repair, setAuthkeyStore };