const { app, BrowserWindow, Tray, Menu, dialog, shell, Notification, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const http = require('http');

// ─── Simple JSON config ─────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
let config = { mode: 'auto', serverPort: 3000, serverIP: '', businessName: 'Mi Negocio', deviceName: os.hostname() };

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

  ipcMain.once('first-run-config', (event, mode) => {
    config.mode = mode;
    config.businessName = 'Mi Negocio';
    config.deviceName = os.hostname();
    saveConfig();
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
        const server = { ip: rinfo.address, port: data.port, name: data.name || 'POS Server' };
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
  const msg = JSON.stringify({ type: 'pos-server-announce', port, name: config.businessName || 'POS Server' });
  setInterval(() => { sock.send(msg, DISCOVERY_PORT, DISCOVERY_MULTICAST); }, 5000);
  setInterval(() => { sock.send(msg, DISCOVERY_PORT, '255.255.255.255'); }, 5000);
}

// ─── Server management ───────────────────────────────────────
const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'pos.db');
const LOG_PATH = path.join(USER_DATA, 'server.log');

function ensureEnv() {
  const userEnv = path.join(USER_DATA, '.env');
  if (!fs.existsSync(userEnv)) {
    const dbUrl = `file:${DB_PATH}`;
    const envContent = [
      `DATABASE_URL="${dbUrl}"`,
      `AUTH_SECRET="pos-system-secret"`,
      `AUTH_URL="http://localhost:${config.serverPort || 3000}"`,
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
    AUTH_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    ELECTRON_RUN_AS_NODE: '1',
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

async function syncWithPeer(peerUrl) {
  const myDeviceId = config.deviceName || os.hostname();
  try {
    // Pull changes from peer
    const pullRes = await fetch(`http://${peerUrl}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: myDeviceId }),
    });
    if (pullRes.ok) {
      const pullData = await pullRes.json();
      if (pullData.changes && pullData.changes.length > 0) {
        // Push received changes to our local server
        await fetch(`http://localhost:${config.serverPort}/api/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: pullData.deviceId, changes: pullData.changes }),
        });
        console.log(`[p2p] Synced ${pullData.changes.length} changes from ${peerUrl}`);
      }
    }

    // Push our changes to peer
    const pushRes = await fetch(`http://localhost:${config.serverPort}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: myDeviceId }),
    });
    if (pushRes.ok) {
      const pushData = await pushRes.json();
      if (pushData.changes && pushData.changes.length > 0) {
        await fetch(`http://${peerUrl}/api/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: myDeviceId, changes: pushData.changes }),
        });
        console.log(`[p2p] Pushed ${pushData.changes.length} changes to ${peerUrl}`);
      }
    }
  } catch (e) {
    // Silently ignore sync errors (peer might be offline)
  }
}

function startP2PSync() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    // Sync with discovered servers
    for (const server of discoveredServers) {
      const peerUrl = `${server.ip}:${server.port}`;
      if (peerUrl !== `localhost:${config.serverPort}`) {
        await syncWithPeer(peerUrl);
      }
    }
  }, 30000); // Every 30 seconds
  console.log('[p2p] Sync started (30s interval)');
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
    { label: 'Modo Servidor', type: 'radio', checked: config.mode === 'server', click: () => setMode('server') },
    { label: 'Modo Cliente', type: 'radio', checked: config.mode === 'client', click: () => setMode('client') },
    { label: 'Automatico', type: 'radio', checked: config.mode === 'auto', click: () => setMode('auto') },
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

function setMode(mode) { config.mode = mode; saveConfig(); }

// ─── URL resolution ──────────────────────────────────────────
async function getTargetURL() {
  if (config.mode === 'client' && config.serverIP) {
    const url = `http://${config.serverIP}:${config.serverPort || 3000}`;
    await waitForServer(url);
    return url;
  }
  if (config.mode === 'auto') {
    startDiscovery();
    await new Promise(r => setTimeout(r, 2000));
    stopDiscovery();
    if (discoveredServers.length > 0) {
      const s = discoveredServers[0];
      config.serverIP = s.ip;
      const url = `http://${s.ip}:${s.port}`;
      await waitForServer(url);
      return url;
    }
  }
  await startServer();
  const url = `http://localhost:${config.serverPort || 3000}`;
  await waitForServer(url);
  return url;
}

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
  const loadingHtml = path.join(__dirname, 'loading.html');
  if (fs.existsSync(loadingHtml)) {
    mainWindow.loadFile(loadingHtml, { query: { port: String(port) } });
  } else {
    mainWindow.loadURL(`data:text/html,<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5;font-family:Arial,sans-serif"><div style="text-align:center"><h2 style="font-size:24px">POS System</h2><p style="color:#a3a3a3">Iniciando servidor en puerto ${port}...</p></div></body></html>`);
  }

  // Start server based on mode
  (async () => {
    if (mode === 'client') {
      startDiscovery();
      await new Promise(r => setTimeout(r, 3000));
      stopDiscovery();
      if (discoveredServers.length > 0) {
        const s = discoveredServers[0];
        config.serverIP = s.ip;
        config.mode = 'client';
        saveConfig();
      } else {
        dialog.showMessageBoxSync(mainWindow, {
          type: 'info',
          title: 'Servidor no encontrado',
          message: 'No se encontro ningun servidor en la red.\nIniciando en modo servidor local...',
          buttons: ['OK']
        });
        config.mode = 'server';
        saveConfig();
      }
    }

    if (config.mode === 'server' || config.mode === 'auto') {
      await startServer();
    }

    // Start P2P sync after server is ready
    startDiscovery();
    setTimeout(() => {
      startP2PSync();
    }, 5000);

    let url;
    if (config.mode === 'client' && config.serverIP) {
      url = `http://${config.serverIP}:${config.serverPort || 3000}`;
    } else {
      url = `http://localhost:${port}`;
    }
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

// ─── IPC handlers ──────────────────────────────────────────
ipcMain.handle('get-config', () => config);
ipcMain.handle('set-config', (e, key, value) => { config[key] = value; saveConfig(); return true; });
ipcMain.handle('get-discovered-servers', () => discoveredServers);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('restart-server', () => { stopServer(); setTimeout(startServer, 1000); return true; });
ipcMain.handle('check-for-updates', async () => await checkForUpdates());
ipcMain.handle('install-update', async () => await installUpdate());
