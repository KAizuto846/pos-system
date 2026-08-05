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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; flex-direction: column; }
    .container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; }
    .logo { width: 64px; height: 64px; background: #10b981; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .logo svg { width: 32px; height: 32px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; text-align: center; }
    .subtitle { color: #a3a3a3; font-size: 14px; text-align: center; margin-bottom: 32px; }
    .options { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 360px; }
    .option { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s; display: flex; align-items: flex-start; gap: 16px; }
    .option:hover { border-color: #10b981; background: #141414; }
    .option.selected { border-color: #10b981; background: #064e3b; }
    .option-icon { width: 48px; height: 48px; background: #1f2937; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .option-icon svg { width: 24px; height: 24px; color: #10b981; }
    .option-content { flex: 1; }
    .option-title { font-size: 16px; font-weight: 500; margin-bottom: 4px; }
    .option-desc { font-size: 13px; color: #a3a3a3; line-height: 1.4; }
    .btn { width: 100%; max-width: 360px; margin-top: 24px; padding: 14px; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; opacity: 0.5; transition: opacity 0.2s; }
    .btn.enabled { opacity: 1; }
    .btn:hover.enabled { background: #059669; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg fill="white" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    </div>
    <h1>Bienvenido a POS System</h1>
    <p class="subtitle">¿Como quieres empezar?</p>
    <div class="options">
      <div class="option" data-mode="server" onclick="selectOption(this)">
        <div class="option-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
        <div class="option-content">
          <div class="option-title">Empezar en local</div>
          <div class="option-desc">Este dispositivo sera el servidor principal. Ejecuta la base de datos y otros dispositivos se conectaran a el.</div>
        </div>
      </div>
      <div class="option" data-mode="client" onclick="selectOption(this)">
        <div class="option-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        </div>
        <div class="option-content">
          <div class="option-title">Punto de venta compartido</div>
          <div class="option-desc">Conectarse a un servidor existente en la red. Buscara automaticamente servidores disponibles.</div>
        </div>
      </div>
    </div>
    <button class="btn" id="continueBtn" onclick="continueSetup()" disabled>Continuar</button>
  </div>
  <div class="footer">Podras cambiar esta configuracion luego desde el menu del sistema</div>
  <script>
    let selectedMode = null;
    function selectOption(el) {
      document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedMode = el.dataset.mode;
      document.getElementById('continueBtn').classList.add('enabled');
      document.getElementById('continueBtn').disabled = false;
    }
    function continueSetup() {
      if (selectedMode) {
        window.electronAPI.saveFirstRunConfig(selectedMode);
      }
    }
  </script>
</body>
</html>
  `;

  setupWindow.loadURL(`data:text/html,${encodeURIComponent(html)}`);
  setupWindow.once('ready-to-show', () => setupWindow.show());
  setupWindow.on('closed', () => {});

  // IPC handler for first run config
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
    const child = spawn('node', [initDbPath, dbUrl, SERVER_DIR], {
      cwd: SERVER_DIR,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
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

  // Ensure DB exists and schema is up to date
  console.log('[db] Running prisma migrate deploy...');
  await runPrismaMigrate();

  const env = getServerEnv();
  const port = config.serverPort || 3000;

  console.log('[srv] Starting server on port', port, '- DB:', env.DATABASE_URL);

  serverProcess = spawn('node', [SERVER_SCRIPT], {
    cwd: SERVER_DIR,
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => console.log('[srv]', d.toString().trim()));
  serverProcess.stderr.on('data', (d) => console.error('[srv:err]', d.toString().trim()));
  serverProcess.on('close', (code) => {
    console.log('Server exit:', code);
    serverProcess = null;
    if (!isQuitting) setTimeout(() => startServer(), 2000);
  });
  serverProcess.on('error', (err) => {
    console.error('Server spawn error:', err.message);
    dialog.showErrorBox('Error del Servidor', 'No se pudo iniciar el servidor:\n' + err.message);
  });

  announceServer(port);
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
    { label: 'Buscar actualizaciones', click: () => { checkForUpdates(); } },
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
          // Any response (even redirects) means server is up
          resolve();
        });
        req.on('error', (e) => reject(e));
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch (e) {
      if (i === 0) console.log('[wait] Esperando servidor en', url, '...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error('[wait] Timeout esperando servidor');
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

  // Show loading screen immediately
  mainWindow.loadURL('data:text/html,<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5;font-family:Arial,sans-serif"><div style="text-align:center"><h2 style="font-size:24px">POS System</h2><p style="color:#a3a3a3">Iniciando servidor...</p></div></body></html>');

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

    const port = config.serverPort || 3000;
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

app.on('before-quit', () => { isQuitting = true; stopServer(); stopDiscovery(); });

// ─── IPC handlers ──────────────────────────────────────────
ipcMain.handle('get-config', () => config);
ipcMain.handle('set-config', (e, key, value) => { config[key] = value; saveConfig(); return true; });
ipcMain.handle('get-discovered-servers', () => discoveredServers);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('restart-server', () => { stopServer(); setTimeout(startServer, 1000); return true; });
ipcMain.handle('check-for-updates', () => { checkForUpdates(); return true; });
ipcMain.handle('install-update', () => { installUpdate(); return true; });
