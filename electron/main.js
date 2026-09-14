const { app, BrowserWindow, Tray, Menu, dialog, shell, Notification, ipcMain, safeStorage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const http = require('http');

// ─── Simple JSON config ─────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
let config = { mode: 'server', serverPort: 3000, serverIP: '', businessName: 'Mi Negocio', deviceName: os.hostname() };

function loadConfig() {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch (e) {}
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) {}
}
loadConfig();

function isFirstRun() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return !data || !data.mode || !data.businessName;
  } catch (e) {
    return true;
  }
}

// ─── First Run Setup Window ──────────────────────────────────
function showFirstRunSetup(callback) {
  const setupWindow = new BrowserWindow({
    width: 500,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'POS System - Configuracion Inicial',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  const setupHtml = path.join(__dirname, 'setup.html');
  if (fs.existsSync(setupHtml)) {
    setupWindow.loadFile(setupHtml);
  } else {
    // Fallback: inline HTML
    setupWindow.loadURL('data:text/html,' + encodeURIComponent('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0a0a0a;color:#e5e5e5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}</style></head><body><div><h1>POS System</h1><p>Error cargando configuracion</p></div></body></html>'));
  }

  setupWindow.once('ready-to-show', () => setupWindow.show());

  ipcMain.once('first-run-config', async (event, mode, relayUrl, relaySecret, tailscaleOpts) => {
    config.mode = 'server';
    config.businessName = 'Mi Negocio';
    config.deviceName = os.hostname();
    saveConfig();
    // Guardar relay config en la DB del servidor (via API local)
    try {
      if (relayUrl && relayUrl.trim()) {
        await fetch(`http://localhost:${config.serverPort || 3000}/api/sync/relay/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relayUrl, syncSecret: relaySecret || '' }),
        });
      }
    } catch (e) {}
    // Tailscale (acceso remoto): correr en el wizard si el usuario lo pidio
    if (tailscaleOpts && tailscaleOpts.authkey && tailscaleOpts.authkey.trim()) {
      const result = await runTailscaleSetup({
        authkey: tailscaleOpts.authkey,
        funnel: Boolean(tailscaleOpts.funnel),
        port: config.serverPort || 3000,
        onProgress: (msg) => { try { setupWindow.webContents.send('tailscale-progress', msg); } catch (e) {} },
      });
      config.tailscale = { ...(config.tailscale || {}), connected: result.ok, at: new Date().toISOString() };
      if (result.ok) config.tailscale.dnsName = result.dnsName || '';
      if (result.funnelUrl) config.tailscale.funnelUrl = result.funnelUrl;
      if (!result.ok && result.error) config.tailscale.error = result.error;
      saveConfig();
      try { setupWindow.webContents.send('tailscale-progress', result.ok ? 'Conexion remota lista.' : `Error: ${result.error || 'desconocido'}`); } catch (e) {}
    }
    setupWindow.close();
    callback(mode);
  });
}

// ─── Globals ─────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverRestartCount = 0;
let isQuitting = false;
const isPackaged = app.isPackaged;

const SERVER_DIR = isPackaged
  ? path.join(process.resourcesPath, 'standalone')
  : path.join(__dirname, '..', '.next', 'standalone');

const SERVER_SCRIPT = path.join(SERVER_DIR, 'server.js');

// ─── Updater ────────────────────────────────────────────────
const { setupAutoUpdater, checkForUpdates, installUpdate } = require('./updater');

// ─── Tailscale (acceso remoto) ─────────────────────────────
const tailscale = require('./tailscale');

// La authkey se guarda CIFRADA con DPAPI (safeStorage/Windows) para poder
// re-autenticar automaticamente al reparar, sin volver a pedirla. Nunca se
// escribe en claro en el config.
function saveEncryptedAuthkey(authkey) {
  try {
    if (!authkey || !safeStorage.isEncryptionAvailable()) return false;
    config.tailscale = { ...(config.tailscale || {}) };
    config.tailscale.authkeyEnc = safeStorage.encryptString(authkey).toString('base64');
    saveConfig();
    return true;
  } catch (e) {
    return false;
  }
}
function loadEncryptedAuthkey() {
  try {
    const enc = config.tailscale && config.tailscale.authkeyEnc;
    if (!enc || !safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch (e) {
    return '';
  }
}
tailscale.setAuthkeyStore({ save: saveEncryptedAuthkey, load: loadEncryptedAuthkey });

function sendTsProgress(msg) {
  try { if (mainWindow) mainWindow.webContents.send('tailscale-progress', msg); } catch (e) {}
}

async function runTailscaleSetup(opts) {
  try {
    const result = await tailscale.runTailscaleFlow(opts);
    if (result.ok && opts.authkey && opts.authkey.trim()) saveEncryptedAuthkey(opts.authkey.trim());
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error interno Tailscale' };
  }
}

async function runTailscaleRepair(opts) {
  const funnel = opts && opts.funnel !== undefined ? opts.funnel : Boolean((config.tailscale || {}).funnelUrl);
  try {
    return await tailscale.repair({
      ...(opts || {}),
      funnel,
      port: config.serverPort || 3000,
      onLoginRequired: (url) => { shell.openExternal(url).catch(() => {}); },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error interno Tailscale' };
  }
}

ipcMain.handle('tailscale-status', async () => {
  const [status, fs] = await Promise.all([tailscale.getStatus(), tailscale.getFunnelStatus()]);
  let funnelReachable = null;
  if (fs.enabled && fs.url) {
    const v = await tailscale.verifyUrl(fs.url, 5000);
    funnelReachable = v.ok;
  }
  return {
    ...status,
    funnelUrl: fs.url || null,
    funnelEnabled: fs.enabled,
    serveEnabled: fs.serveEnabled,
    capUrl: fs.capUrl || '',
    funnelError: fs.error || null,
    funnelReachable,
  };
});

ipcMain.handle('tailscale-setup', async (event, opts) => {
  const result = await runTailscaleSetup({ ...(opts || {}), onProgress: sendTsProgress });
  if (result.ok) {
    config.tailscale = { ...(config.tailscale || {}), connected: true, at: new Date().toISOString(), dnsName: result.dnsName || '', funnelUrl: result.funnelUrl || '' };
    saveConfig();
  }
  return result;
});

ipcMain.handle('tailscale-repair', async (event, opts) => {
  const result = await runTailscaleRepair({ ...(opts || {}), onProgress: sendTsProgress });
  if (result.ok) {
    config.tailscale = { ...(config.tailscale || {}), connected: true, online: true, at: new Date().toISOString(), dnsName: result.dnsName || '', funnelUrl: result.funnelUrl || '' };
    delete config.tailscale.error;
    saveConfig();
  }
  return result;
});

ipcMain.handle('tailscale-funnel', async (event, enabled) => {
  let result = await tailscale.setFunnel(Boolean(enabled), config.serverPort || 3000);
  if (enabled && result.code === 'daemon-broken') {
    sendTsProgress('Servicio Tailscale dañado. Reparando automáticamente...');
    const rep = await runTailscaleRepair({ funnel: true });
    if (rep.ok) {
      result = await tailscale.setFunnel(true, config.serverPort || 3000);
    } else {
      result = { ok: false, error: `Fallo de Tailscale: ${rep.error}` };
    }
  }
  config.tailscale = { ...(config.tailscale || {}), funnelUrl: result.url || '', at: new Date().toISOString() };
  delete config.tailscale.error;
  saveConfig();
  return result;
});

// Desconectar de Tailscale y apagar el Funnel (revertir la configuracion)
ipcMain.handle('tailscale-off', async () => {
  const funnel = await tailscale.setFunnel(false, config.serverPort || 3000);
  const down = await tailscale.disconnect();
  config.tailscale = {
    ...(config.tailscale || {}),
    connected: false,
    online: false,
    at: new Date().toISOString(),
  };
  delete config.tailscale.dnsName;
  delete config.tailscale.funnelUrl;
  delete config.tailscale.error;
  saveConfig();
  return { ok: down.ok, error: down.ok ? null : down.error, funnelOff: funnel.ok };
});

// ─── UDP Discovery ───────────────────────────────────────────
const DISCOVERY_PORT = 9876;
const DISCOVERY_MULTICAST = '230.185.192.108';
let discoverySocket = null;
let discoveredServers = [];

function startDiscovery() {
  if (discoverySocket) return;
  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  discoverySocket.on('listening', () => {
    discoverySocket.setBroadcast(true);
    discoverySocket.setMulticastTTL(128);
    try { discoverySocket.addMembership(DISCOVERY_MULTICAST); } catch (e) {}
  });
  discoverySocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'pos-server-announce' && data.port) {
        const server = { ip: rinfo.address, port: data.port, name: data.name || 'POS Server', deviceId: data.deviceId || '' };
        if (!discoveredServers.find(s => s.ip === server.ip && s.port === server.port)) {
          discoveredServers.push(server);
        }
      }
    } catch (e) {}
  });
  discoverySocket.bind(DISCOVERY_PORT, '0.0.0.0');
}

function stopDiscovery() {
  if (discoverySocket) { try { discoverySocket.close(); } catch (e) {} discoverySocket = null; }
}

function announceServer(port) {
  const sock = dgram.createSocket('udp4');
  const msg = JSON.stringify({ type: 'pos-server-announce', port, name: config.businessName || 'POS Server', deviceId: config.deviceName || os.hostname() });
  setInterval(() => { sock.send(msg, DISCOVERY_PORT, DISCOVERY_MULTICAST); }, 5000);
  setInterval(() => { sock.send(msg, DISCOVERY_PORT, '255.255.255.255'); }, 5000);
}

// ─── Server management ───────────────────────────────────────
const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'pos.db');
const LOG_PATH = path.join(USER_DATA, 'server.log');

// IPs IPv4 reales de la red local (excluye loopback, APIPA y virtuales)
function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('127.')) continue;
      if (net.address.startsWith('169.254.')) continue;
      ips.push({ name, address: net.address, mac: net.mac });
    }
  }
  return ips;
}

function getPreferredLanIP() {
  const ips = getLanIPs();
  if (ips.length === 0) return '';
  // Preferir rangos privados típicos de LAN
  const preferred = ips.find(i =>
    i.address.startsWith('192.168.') || i.address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(i.address));
  return (preferred || ips[0]).address;
}

// Best-effort: abre el puerto TCP del servidor en el Firewall de Windows.
// En el instalador NSIS ya se crea la regla con permisos de admin; aquí se
// reintenta por si el usuario omitió ese paso o cambió el puerto.
function tryOpenFirewall() {
  if (process.platform !== 'win32') return;
  const port = config.serverPort || 3000;
  try {
    const ruleName = 'POS System (TCP ' + port + ')';
    const del = spawn('netsh', ['advfirewall', 'firewall', 'delete', 'rule', 'name=' + ruleName], {
      shell: false, windowsHide: true, stdio: 'ignore',
    });
    del.on('close', () => {
      const add = spawn('netsh', [
        'advfirewall', 'firewall', 'add', 'rule',
        'name=' + ruleName,
        'dir=in', 'action=allow', 'protocol=TCP', 'localport=' + port,
      ], { shell: false, windowsHide: true, stdio: 'ignore' });
      add.on('close', (code) => {
        console.log('[fw] Firewall rule ' + ruleName + ' => exit ' + code +
          (code === 0 ? '' : ' (requiere permisos de administrador; usar el instalador)'));
      });
    });
  } catch (e) {
    console.error('[fw] Error abriendo firewall:', e.message);
  }
}

function ensureEnv() {
  const userEnv = path.join(USER_DATA, '.env');
  if (!fs.existsSync(userEnv)) {
    const dbUrl = `file:${DB_PATH}`;
    // IMPORTANTE: NO definir AUTH_URL. Con trustHost:true NextAuth deriva la
    // URL base del Host de cada request; si AUTH_URL existe, el login redirige
    // siempre a esa URL y desde el telefono apunta al localhost del telefono
    // (la pagina nunca termina de cargar).
    const envContent = [
      `DATABASE_URL="${dbUrl}"`,
      `AUTH_SECRET="pos-system-secret"`,
      `NEXT_PUBLIC_APP_URL="http://localhost:${config.serverPort || 3000}"`,
    ].join('\n');
    fs.writeFileSync(userEnv, envContent, 'utf8');
    console.log('[env] Created default .env in userData');
  }
  return userEnv;
}

function getServerEnv() {
  const port = config.serverPort || 3000;
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '0.0.0.0',
    DATABASE_URL: `file:${DB_PATH}`,
    AUTH_SECRET: 'pos-system-secret',
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    ELECTRON_RUN_AS_NODE: '1',
    DEVICE_ID: config.deviceName || os.hostname(),
  };

  try {
    const userEnv = path.join(USER_DATA, '.env');
    const envContent = fs.readFileSync(userEnv, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.+)/);
      if (match) {
        env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  } catch (e) {}

  // El login (NextAuth trustHost) construye las URLs base con el Host de cada
  // request. AUTH_URL/NEXTAUTH_URL fuerzan SIEMPRE esa URL y rompen el acceso
  // desde el telefono (redirige al localhost DEL TELEFONO). Se eliminan aun si
  // quedaron en instalaciones anteriores con install.ps1 o configuracion vieja.
  delete env.AUTH_URL;
  delete env.NEXTAUTH_URL;

  // Always force absolute DB path so SQLite works in packaged app
  // Use forward slashes for cross-platform SQLite compatibility
  const dbUrlPath = DB_PATH.replace(/\\/g, '/');
  env.DATABASE_URL = `file:${dbUrlPath}`;
  return env;
}

function findInitDbPath() {
  const candidates = [
    path.join(__dirname, 'init-db.js'),
    path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'electron', 'init-db.js'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'init-db.js'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function runPrismaMigrate() {
  return new Promise((resolve) => {
    const initDbPath = findInitDbPath();
    const dbUrl = `file:${DB_PATH.replace(/\\/g, '/')}`;
    const env = getServerEnv();
    const child = spawn(process.execPath, [initDbPath, dbUrl, SERVER_DIR], {
      cwd: SERVER_DIR,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString(); fs.appendFileSync(LOG_PATH, '[db:out] ' + d.toString()); });
    child.stderr.on('data', d => { err += d.toString(); fs.appendFileSync(LOG_PATH, '[db:err] ' + d.toString()); });
    child.on('close', (code) => {
      console.log('[db] init-db exit:', code, 'path:', initDbPath);
      if (err) console.error('[db]', err.trim());
      if (out) console.log('[db]', out.trim());
      resolve(code === 0);
    });
    child.on('error', (e) => {
      console.error('[db] init-db error:', e.message);
      resolve(false);
    });
  });
}

async function startServer() {
  if (serverProcess) return;
  if (!fs.existsSync(SERVER_SCRIPT)) {
    dialog.showErrorBox('Error', 'No se encontro el servidor.\nReinstale la aplicacion.');
    app.quit();
    return;
  }

  ensureEnv();

  // Reset restart counter on explicit start
  serverRestartCount = 0;

  // Ensure DB exists and schema is up to date
  console.log('[db] Running prisma migrate deploy...');
  await runPrismaMigrate();

  const env = getServerEnv();
  const port = config.serverPort || 3000;

  console.log('[srv] Starting server on port', port, '- DB:', env.DATABASE_URL);

  serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: SERVER_DIR,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => {
    const s = d.toString();
    console.log('[srv]', s.trim());
    fs.appendFileSync(LOG_PATH, s);
    try { if (mainWindow) mainWindow.webContents.send('server-log', s); } catch (e) {}
  });
  serverProcess.stderr.on('data', (d) => {
    const s = d.toString();
    console.error('[srv:err]', s.trim());
    fs.appendFileSync(LOG_PATH, '[err] ' + s);
    try { if (mainWindow) mainWindow.webContents.send('server-log', '[ERROR] ' + s); } catch (e) {}
  });
  serverProcess.on('close', (code) => {
    const msg = `Servidor cerrado (codigo ${code})`;
    console.log(msg);
    fs.appendFileSync(LOG_PATH, msg + '\n');
    serverProcess = null;
    serverRestartCount++;
    if (!isQuitting && serverRestartCount <= 3) {
      try { if (mainWindow) mainWindow.webContents.send('server-log', `Reiniciando servidor (${serverRestartCount}/3)...`); } catch (e) {}
      setTimeout(() => startServer(), 2000);
    } else if (!isQuitting) {
      try { if (mainWindow) mainWindow.webContents.send('server-error', 'El servidor fallo repetidamente. Reinicia la aplicacion.'); } catch (e) {}
    }
  });
  serverProcess.on('error', (err) => {
    console.error('Server spawn error:', err.message);
    dialog.showErrorBox('Error del Servidor', 'No se pudo iniciar el servidor:\n' + err.message);
  });

  announceServer(port);
}

// ─── P2P Sync ────────────────────────────────────────────────
let syncInterval = null;
let syncInProgress = false;
let lastSyncResult = null;
// Per-peer cursors: { pullSince: last syncVersion received from peer, pushSince: last sent }
const peerCursors = new Map();

function getPeerCursor(peerUrl, key) {
  const cur = peerCursors.get(peerUrl);
  return cur && cur[key] ? cur[key] : 0;
}
function setPeerCursor(peerUrl, key, value) {
  const cur = peerCursors.get(peerUrl) || {};
  cur[key] = value;
  peerCursors.set(peerUrl, cur);
}

async function syncWithPeer(peerUrl) {
  const myDeviceId = config.deviceName || os.hostname();
  let pulled = 0;
  let pushed = 0;
  let pullData = null;
  let pushData = null;
  try {
    // Pull changes from peer (only new ones since our last cursor)
    const pullSince = getPeerCursor(peerUrl, 'pullSince');
    const pullRes = await fetch(`http://${peerUrl}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: myDeviceId, since: pullSince }),
    });
    if (pullRes.ok) {
      pullData = await pullRes.json();
      if (pullData.changes && pullData.changes.length > 0) {
        // Push received changes to our local server
        await fetch(`http://localhost:${config.serverPort}/api/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: pullData.deviceId, changes: pullData.changes }),
        });
        pulled = pullData.changes.length;
        console.log(`[p2p] Synced ${pulled} changes from ${peerUrl}`);
      }
      if (pullData.changes && pullData.changes.length > 0) {
        const maxVersion = Math.max(...pullData.changes.map((c) => c.syncVersion));
        setPeerCursor(peerUrl, 'pullSince', maxVersion);
      }
    }

    // Push our changes to peer (only new ones since last cursor)
    const pushSince = getPeerCursor(peerUrl, 'pushSince');
    const pushRes = await fetch(`http://localhost:${config.serverPort}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: myDeviceId, since: pushSince }),
    });
    if (pushRes.ok) {
      pushData = await pushRes.json();
      if (pushData.changes && pushData.changes.length > 0) {
        const pushPeerRes = await fetch(`http://${peerUrl}/api/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: myDeviceId, changes: pushData.changes }),
        });
        if (pushPeerRes.ok) {
          pushed = pushData.changes.length;
          console.log(`[p2p] Pushed ${pushed} changes to ${peerUrl}`);
          // Acknowledge our local log so we don't resend
          const ids = pushData.changes.map((c) => c.id);
          await fetch(`http://localhost:${config.serverPort}/api/sync/ack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: myDeviceId, ids }),
          }).catch(() => {});
          const maxVersion = Math.max(...pushData.changes.map((c) => c.syncVersion));
          setPeerCursor(peerUrl, 'pushSince', maxVersion);
        }
      }
    }
    return { ok: true, pulled, pushed, error: null };
  } catch (e) {
    return { ok: false, pulled: 0, pushed: 0, error: e.message || 'Peer offline' };
  }
}

async function runSyncNow() {
  if (syncInProgress) return { ok: false, error: 'Sync already in progress' };
  syncInProgress = true;
  try {
    const myDeviceId = config.deviceName || os.hostname();
    const peers = discoveredServers.filter((server) => {
      const url = `${server.ip}:${server.port}`;
      const isSelfUrl = url === `localhost:${config.serverPort}`;
      const isSelfId = server.deviceId && server.deviceId === myDeviceId;
      return !isLocalAddress(server.ip) && !isSelfUrl && !isSelfId;
    });
    const results = [];
    for (const server of peers) {
      const peerUrl = `${server.ip}:${server.port}`;
      const res = await syncWithPeer(peerUrl);
      results.push({ peer: peerUrl, name: server.name, ...res });
    }
    lastSyncResult = { at: new Date().toISOString(), peers: results.length, results };
    console.log(`[p2p] Manual sync done: ${results.length} peers`);
    return lastSyncResult;
  } finally {
    syncInProgress = false;
  }
}

function isLocalAddress(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '255.255.255.255' || ip === 'localhost';
}

function startP2PSync() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    try {
      await runSyncNow();
    } catch (e) {
      console.error('[p2p] Sync cycle error:', e.message);
    }
  }, 5000); // Every 5 seconds (near real-time)
  console.log('[p2p] Sync started (5s interval)');
}

function stopP2PSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

function stopServer() {
  if (serverProcess) { serverProcess.kill('SIGTERM'); serverProcess = null; }
}

// ─── Window ──────────────────────────────────────────────────
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'POS System',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    show: false,
  });
  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); mainWindow.hide(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  return mainWindow;
}

// ─── Tray ────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icons', 'icon-192.png');
  tray = new Tray(iconPath);
  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar POS', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Sincronizar ahora', click: () => { runSyncNow(); } },
    { type: 'separator' },
    { label: 'Reiniciar Servidor', click: () => { stopServer(); setTimeout(startServer, 1000); } },
    {
      label: 'Buscar actualizaciones',
      click: () => {
        checkForUpdates().catch((error) => {
          console.error('[Updater] Tray check failed:', error.stack || error);
        });
      },
    },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; stopServer(); stopDiscovery(); app.quit(); } },
  ]);
  tray.setToolTip('POS System');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ─── URL resolution ──────────────────────────────────────────
async function waitForServer(url, maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', (e) => reject(e));
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      // Server is ready
      try { if (mainWindow) mainWindow.webContents.send('server-ready'); } catch (e) {}
      return;
    } catch (e) {
      if (i === 0) console.log('[wait] Esperando servidor en', url, '...');
      if (i % 5 === 0) {
        try { if (mainWindow) mainWindow.webContents.send('server-log', `Intento ${i + 1}/${maxRetries}...`); } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error('[wait] Timeout esperando servidor');
  try { if (mainWindow) mainWindow.webContents.send('server-error', 'No se pudo iniciar el servidor. Revisa el firewall o el puerto.'); } catch (e) {}
}

// ─── App lifecycle ───────────────────────────────────────────
app.whenReady().then(() => {
  // Check if first run - show setup before starting server
  if (isFirstRun()) {
    showFirstRunSetup((mode) => {
      initializeApp(mode);
    });
    return;
  }

  initializeApp(config.mode);
});

function initializeApp(mode) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'POS System',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setupAutoUpdater(mainWindow);

  try { createTray(); } catch (e) {}

  // Show loading screen
  const port = config.serverPort || 3000;
  const lanIp = getPreferredLanIP();
  if (lanIp) {
    config.serverIP = lanIp;
    try { saveConfig(); } catch (e) {}
  }
  const loadingHtml = path.join(__dirname, 'loading.html');
  if (fs.existsSync(loadingHtml)) {
    mainWindow.loadFile(loadingHtml, { query: { port: String(port), ip: lanIp } });
  } else {
    mainWindow.loadURL(`data:text/html,<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5;font-family:Arial,sans-serif"><div style="text-align:center"><h2 style="font-size:24px">POS System</h2><p style="color:#a3a3a3">Iniciando servidor en puerto ${port}...</p></div></body></html>`);
  }

  if (process.platform === 'win32') tryOpenFirewall();

  // Start local server (every device is a peer) and P2P sync
  (async () => {
    await startServer();
    startDiscovery();
    setTimeout(() => {
      startP2PSync();
    }, 5000);

    const url = `http://localhost:${port}`;
    await waitForServer(url);
    mainWindow.loadURL(url);
  })();

  mainWindow.webContents.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      console.log('[load] Failed:', desc, '— retrying in 2s');
      setTimeout(() => {
        const port = config.serverPort || 3000;
        mainWindow.loadURL(`http://localhost:${port}`);
      }, 2000);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle('POS System');
  });
}

app.on('before-quit', () => { isQuitting = true; stopServer(); stopDiscovery(); stopP2PSync(); });

// ─── Diagnostics (Windows) ───────────────────────────────────
// Abre una ventana cmd con un chequeo visual de los requisitos de sincronizacion
function openDiagnostics() {
  if (process.platform !== 'win32') return { ok: false, error: 'Solo disponible en Windows' };
  const port = config.serverPort || 3000;
  const script = [
    '@echo off',
    'title POS System - Diagnostico de red y sincronizacion',
    'color 0A',
    'echo =============================================================',
    'echo   POS SYSTEM - VERIFICACION DE REQUISITOS DE SINCRONIZACION',
    'echo =============================================================',
    'echo.',
    'echo [1] IPs de ESTE equipo en la red local:',
    'ipconfig ^| findstr /i "IPv4"',
    'echo.',
    `echo [2] Servidor web escuchando en el puerto ${port} (debe listar):`,
    `netstat -an ^| findstr ":${port}" ^| findstr LISTENING`,
    'echo.',
    'echo [3] Puerto UDP 9876 (deteccion de equipos):',
    'netstat -an ^| findstr ":9876"',
    'echo.',
    'echo [4] Reglas de firewall de entrada que permiten Node/Electron:',
    'netsh advfirewall firewall show rule name=all dir=in ^| findstr /i "node electron pos-system"',
    'echo   (Si aparece una linea "Regla:" con Node.js o Electron, esta permitido)',
    'echo.',
    'echo [5] Alcance multicast (otros equipos deben responder):',
    'ping -n 2 230.185.192.108',
    'echo.',
    'echo =============================================================',
    'echo   SI UN EQUIPO NO APARECE EN LA PESTANA DE SINCRONIZACION:',
    'echo    1. Asegurate de que todos esten en la MISMA red WiFi/cable.',
    'echo    2. Abre el Firewall de Windows y permite Node.js/Electron',
    'echo       (boton "Abrir Firewall" en la app).',
    'echo    3. Evita el "aislamiento de clientes" del router.',
    'echo =============================================================',
    'pause'
  ].join('\r\n');
  try {
    const scriptPath = path.join(app.getPath('temp'), 'pos-diagnostics.bat');
    fs.writeFileSync(scriptPath, script, 'utf8');
    spawn('cmd.exe', ['/c', scriptPath], { shell: false, detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function openFirewallSettings() {
  if (process.platform !== 'win32') return { ok: false, error: 'Solo disponible en Windows' };
  try {
    shell.openExternal('windowsdefender://firewall').catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Ticket printer (texto plano) ───────────────────────────
// La mayoria de impresoras de tickets (58mm/80mm) usan driver "Generic / Text
// Only": solo aceptan texto plano, sin imagenes. Electron no puede enviarles
// HTML. Estrategias en Windows, en orden:
//   1. PowerShell Get-Content | Out-Printer -Name "<impresora>": envia el
//      texto a traves del spooler de Windows usando el driver instalado.
//      Funciona con impresoras compartidas y NO compartidas.
//   2. copy /b archivo \\localhost\<impresora>: envia bytes crudos al recurso
//      compartido (solo si la impresora esta compartida como Generic/Text Only).
function execPrint(args, shellCmd) {
  return new Promise((resolve) => {
    const child = shellCmd
      ? spawn('cmd.exe', ['/c', shellCmd], { windowsHide: true, shell: false })
      : spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', args], { windowsHide: true, shell: false });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, 20000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: e.message, stdout: '' });
    });
  });
}

function printPlainText(text, printerName) {
  return new Promise(async (resolve) => {
    if (!text) return resolve({ ok: false, error: 'Texto vacio' });
    const tmpFile = path.join(app.getPath('temp'), `pos-ticket-${Date.now()}.txt`);
    try {
      // UTF-8 con BOM: el driver de Windows lo interpreta mejor y conserva acentos
      fs.writeFileSync(tmpFile, '\ufeff' + text, 'utf8');
    } catch (e) {
      return resolve({ ok: false, error: 'No se pudo escribir el archivo temporal: ' + e.message });
    }

    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (e) {} };

    try {
      if (process.platform === 'win32') {
        // Estrategia 1: PowerShell Out-Printer (usa el spooler, sirve para
        // cualquier impresora instalada, compartida o no).
        const psCmd = `Get-Content -LiteralPath '${tmpFile.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`;
        const ps = await execPrint(psCmd, null);
        if (ps.code === 0) {
          cleanup();
          return resolve({ ok: true, method: 'out-printer' });
        }

        // Estrategia 2: copy /b al recurso compartido \\localhost\<impresora>
        const share = `\\\\localhost\\${printerName}`;
        const cmd = `copy /b "${tmpFile}" "${share}"`;
        const cp = await execPrint(null, cmd);
        if (cp.code === 0) {
          cleanup();
          return resolve({ ok: true, method: 'copy-share' });
        }

        cleanup();
        return resolve({
          ok: false,
          error: `No se pudo imprimir en "${printerName}".\n` +
            `PowerShell: codigo ${ps.code}${ps.stderr ? ' - ' + ps.stderr.trim().split('\n')[0] : ''}\n` +
            `copy /b: codigo ${cp.code}${cp.stderr ? ' - ' + cp.stderr.trim().split('\n')[0] : ''}\n\n` +
            'En Windows activa el checkbox "Compartir esta impresora" en ' +
            'Configuracion > Bluetooth y dispositivos > Impresoras y escaneres > ' +
            `tu impresora > Propiedades de la impresora > Compartir.`
        });
      }

      // Linux / macOS: lp -d <nombre>
      const child = spawn('lp', ['-d', printerName, tmpFile], { stdio: 'ignore' });
      const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, 20000);
      child.on('close', (code) => {
        clearTimeout(timer);
        cleanup();
        if (code === 0) resolve({ ok: true, method: 'lp' });
        else resolve({ ok: false, error: `lp salio con codigo ${code}.` });
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        cleanup();
        resolve({ ok: false, error: e.message });
      });
    } catch (e) {
      cleanup();
      resolve({ ok: false, error: e.message || 'Error interno al imprimir' });
    }
  });
}

// Lista las impresoras del sistema (nombre, si es predeterminada, estado)
ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) return { ok: true, printers: [] };
    const printers = await mainWindow.webContents.getPrinters();
    return {
      ok: true,
      printers: printers.map((p) => ({
        name: p.name || p.displayName || 'Impresora',
        isDefault: Boolean(p.isDefault),
        status: p.status || 0,
        displayName: p.displayName || p.name || '',
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message || 'No se pudieron listar las impresoras', printers: [] };
  }
});

ipcMain.handle('print-plain-text', async (e, { text, printerName }) => {
  if (!printerName) return { ok: false, error: 'No se selecciono una impresora' };
  return await printPlainText(text, printerName);
});

// Diagnostico completo de impresion: estado del spooler, impresoras instaladas
// y compartidas, y prueba real de ambos metodos con un texto corto.
ipcMain.handle('print-diagnostic', async () => {
  const out = {
    platform: process.platform,
    printers: [],
    shared: [],
    spooler: null,
    test: null,
    raw: {},
  };
  try {
    if (!mainWindow) return { ...out, error: 'Ventana no disponible' };
    const printers = await mainWindow.webContents.getPrinters();
    out.printers = printers.map((p) => ({
      name: p.name || p.displayName || '',
      isDefault: Boolean(p.isDefault),
      status: p.status,
    }));
  } catch (e) {
    out.printers = [];
    out.error = (out.error ? out.error + '; ' : '') + 'getPrinters: ' + (e.message || e);
  }

  if (process.platform === 'win32') {
    // Estado del spooler
    const sp = await execPrint(`(Get-Service -Name Spooler).Status`, null);
    out.spooler = sp.code === 0 ? sp.stdout.trim() : ('error ' + sp.code + ' ' + sp.stderr.trim());

    // Impresoras compartidas (con nombre de recurso)
    const sh = await execPrint(`Get-Printer | Where-Object { $_.Shared } | Select-Object -Property Name, ShareName, PortName | Format-List`, null);
    out.shared = sh.code === 0 ? sh.stdout.trim() : '';

    // Probar impresion real con ambos metodos a la impresora seleccionada
    if (out.printers.length > 0) {
      const testFile = path.join(app.getPath('temp'), 'pos-print-test.txt');
      fs.writeFileSync(testFile, '\ufeffPRUEBA POS SYSTEM\nLinea de texto\n1234567890\n', 'utf8');
      const target = out.printers[0].name;
      const ps = await execPrint(`Get-Content -LiteralPath '${testFile.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer -Name '${target.replace(/'/g, "''")}'`, null);
      const share = `\\\\localhost\\${target}`;
      const cp = await execPrint(null, `copy /b "${testFile}" "${share}"`);
      out.test = {
        printer: target,
        powershell: { code: ps.code, stderr: ps.stderr.trim().split('\n').slice(0, 3).join(' | ') },
        copyShare: { code: cp.code, stderr: cp.stderr.trim().split('\n').slice(0, 3).join(' | ') },
      };
      try { fs.unlinkSync(testFile); } catch (e) {}
    }
  }
  return out;
});

ipcMain.handle('get-config', () => ({ ...config, platform: process.platform }));
ipcMain.handle('set-config', (e, key, value) => { config[key] = value; saveConfig(); return true; });
ipcMain.handle('get-discovered-servers', () => discoveredServers);
ipcMain.handle('get-last-sync-result', () => lastSyncResult);
ipcMain.handle('trigger-sync', async () => await runSyncNow());
// Copia la base de datos completa del equipo indicado (estilo rclone):
// descarga su dump y lo restaura en el servidor local de este equipo.
ipcMain.handle('copy-full-db', async (e, peerUrl) => {
  try {
    const res = await fetch(`http://${peerUrl}/api/sync/full-db`);
    if (!res.ok) return { ok: false, error: `El equipo respondió con estado ${res.status}` };
    const dump = await res.json();
    if (!dump?.data) return { ok: false, error: 'El equipo no devolvió datos válidos' };
    const restoreRes = await fetch(`http://localhost:${config.serverPort}/api/sync/restore-db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    });
    const data = await restoreRes.json();
    if (!restoreRes.ok) return { ok: false, error: data.error || 'Error al restaurar la base de datos' };
    return { ok: true, counts: data.counts };
  } catch (err) {
    return { ok: false, error: err.message || 'No se pudo copiar la base de datos' };
  }
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('restart-server', () => { stopServer(); setTimeout(startServer, 1000); return true; });
ipcMain.handle('check-for-updates', async () => await checkForUpdates());
ipcMain.handle('install-update', async () => await installUpdate());
ipcMain.handle('open-diagnostics', () => openDiagnostics());
ipcMain.handle('open-firewall', () => openFirewallSettings());
