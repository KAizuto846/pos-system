const { app, BrowserWindow, Tray, Menu, dialog, shell, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');

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
function startServer() {
  if (serverProcess) return;
  if (!fs.existsSync(SERVER_SCRIPT)) {
    dialog.showErrorBox('Error', 'No se encontro el servidor.\nReinstale la aplicacion.');
    app.quit();
    return;
  }
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(config.serverPort || 3000), HOSTNAME: '0.0.0.0' };
  serverProcess = spawn('node', [SERVER_SCRIPT], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  serverProcess.stdout.on('data', (d) => console.log('[srv]', d.toString().trim()));
  serverProcess.stderr.on('data', (d) => console.error('[srv:err]', d.toString().trim()));
  serverProcess.on('close', (code) => {
    console.log('Server exit:', code);
    serverProcess = null;
    if (!isQuitting) setTimeout(startServer, 2000);
  });
  announceServer(config.serverPort || 3000);
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
    return `http://${config.serverIP}:${config.serverPort || 3000}`;
  }
  if (config.mode === 'auto') {
    startDiscovery();
    await new Promise(r => setTimeout(r, 2000));
    stopDiscovery();
    if (discoveredServers.length > 0) {
      config.serverIP = discoveredServers[0].ip;
      return `http://${discoveredServers[0].ip}:${discoveredServers[0].port}`;
    }
  }
  startServer();
  await new Promise(r => setTimeout(r, 3000));
  return `http://localhost:${config.serverPort || 3000}`;
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
