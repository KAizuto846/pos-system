const { app, BrowserWindow, Tray, Menu, dialog, shell, Notification } = require('electron');
const path = require('path');
const { fork, spawn } = require('child_process');
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
async function startServer() {
  if (serverProcess) return;
  if (!fs.existsSync(SERVER_SCRIPT)) {
    dialog.showErrorBox('Error', 'No se encontro el servidor.\nReinstale la aplicacion.');
    app.quit();
    return;
  }

  // ── Run prisma db push on first launch ──────────────────
  const dbFile = path.join(SERVER_DIR, 'prisma', 'dev.db');
  if (!fs.existsSync(dbFile)) {
    console.log('[setup] Creando base de datos...');
    try {
      await new Promise((resolve, reject) => {
        const prismaProc = spawn('npx', ['prisma', 'db', 'push', '--skip-generate'], {
          cwd: SERVER_DIR,
          env: { ...process.env, DATABASE_URL: 'file:./prisma/dev.db' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        prismaProc.stdout.on('data', (d) => { out += d.toString(); });
        prismaProc.stderr.on('data', (d) => { out += d.toString(); });
        prismaProc.on('close', (code) => {
          console.log('[prisma]', out.trim());
          code === 0 ? resolve() : reject(new Error('Prisma exit ' + code + ': ' + out));
        });
        setTimeout(() => reject(new Error('Prisma timeout')), 30000);
      });
      console.log('[setup] Base de datos lista');
    } catch (e) {
      console.error('[setup] Error BD:', e.message);
      dialog.showErrorBox('Error de Base de Datos',
        'No se pudo crear la base de datos.\n\n' + e.message + '\n\nVerifique que el directorio tenga permisos de escritura.');
      // Continue anyway — maybe it's a transient error
    }
  }

  // ── Start server ────────────────────────────────────────
  const port = config.serverPort || 3000;
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '0.0.0.0' };

  serverProcess = fork(SERVER_SCRIPT, [], { cwd: SERVER_DIR, env, silent: true });
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

async function waitForServer(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url + '/api/sync', (res) => {
          res.resume();
          res.statusCode < 500 ? resolve() : reject(new Error('Status ' + res.statusCode));
        });
        req.on('error', (e) => reject(e));
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return; // Success
    } catch (e) {
      if (i === 0) console.log('[wait] Esperando servidor en', url, '...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error('[wait] Timeout esperando servidor');
}

// ─── App lifecycle ───────────────────────────────────────────
app.whenReady().then(async () => {
  createTray();
  const url = await getTargetURL();
  createWindow(url);
  new Notification({ title: 'POS System', body: 'Servidor iniciado en ' + url }).show();
});

app.on('before-quit', () => { isQuitting = true; stopServer(); stopDiscovery(); });

// ─── IPC ─────────────────────────────────────────────────────
const { ipcMain } = require('electron');
ipcMain.handle('get-config', () => config);
ipcMain.handle('set-config', (e, key, value) => { config[key] = value; saveConfig(); return true; });
ipcMain.handle('get-discovered-servers', () => discoveredServers);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('restart-server', () => { stopServer(); setTimeout(startServer, 1000); return true; });
