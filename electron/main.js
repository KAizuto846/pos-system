const { app, BrowserWindow, Tray, Menu, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const Store = require('electron-store');
const { setupAutoUpdater } = require('./updater');

// ─── Config store ───────────────────────────────────────────
const store = new Store({
  defaults: {
    mode: 'auto',        // 'auto' | 'server' | 'client'
    serverPort: 3000,
    serverIP: '',        // If client, the server IP
    businessName: 'Mi Negocio',
    deviceName: os.hostname(),
    autoStart: true,
    minimized: false,
  }
});

// ─── Globals ─────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
const isPackaged = app.isPackaged;

// Paths
const SERVER_DIR = isPackaged
  ? path.join(process.resourcesPath, 'standalone')
  : path.join(__dirname, '..', '.next', 'standalone');

const SERVER_SCRIPT = path.join(SERVER_DIR, 'server.js');

// ─── UDP Discovery (LAN sync) ────────────────────────────────
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
    try {
      discoverySocket.addMembership(DISCOVERY_MULTICAST);
    } catch (e) { /* may already be joined */ }
  });

  discoverySocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'pos-server-announce' && data.port) {
        const server = { ip: rinfo.address, port: data.port, name: data.name || 'POS Server' };
        // Avoid duplicates
        if (!discoveredServers.find(s => s.ip === server.ip && s.port === server.port)) {
          discoveredServers.push(server);
        }
      }
    } catch (e) { /* ignore malformed */ }
  });

  discoverySocket.bind(DISCOVERY_PORT, '0.0.0.0');
}

function stopDiscovery() {
  if (discoverySocket) {
    try {
      discoverySocket.close();
    } catch (e) { /* ignore */ }
    discoverySocket = null;
  }
}

function announceServer(port) {
  const sock = dgram.createSocket('udp4');
  const msg = JSON.stringify({
    type: 'pos-server-announce',
    port: port,
    name: store.get('businessName') || 'POS Server',
  });

  // Send every 5 seconds
  setInterval(() => {
    sock.send(msg, DISCOVERY_PORT, DISCOVERY_MULTICAST, (err) => {
      // silently ignore
    });
  }, 5000);

  // Also broadcast
  setInterval(() => {
    sock.send(msg, DISCOVERY_PORT, '255.255.255.255', (err) => {
      // silently ignore
    });
  }, 5000);
}

// ─── Server process management ───────────────────────────────
function startServer() {
  if (serverProcess) return;

  const port = store.get('serverPort') || 3000;

  // Check if standalone server exists
  if (!fs.existsSync(SERVER_SCRIPT)) {
    console.error('Server script not found:', SERVER_SCRIPT);
    dialog.showErrorBox('Error', 'No se encontró el servidor. Reinstale la aplicación.');
    app.quit();
    return;
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '0.0.0.0',
  };

  serverProcess = spawn('node', [SERVER_SCRIPT], {
    cwd: SERVER_DIR,
    env: env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[server:err] ${data.toString().trim()}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    serverProcess = null;
    // Auto-restart if not quitting
    if (!isQuitting) {
      setTimeout(startServer, 2000);
    }
  });

  // Announce this server on LAN
  announceServer(port);
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ─── Window creation ─────────────────────────────────────────
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'POS System',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (store.get('maximized')) {
      mainWindow.maximize();
    }
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

// ─── System Tray ─────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icons', 'icon-192.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar POS',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Modo Servidor',
      type: 'radio',
      checked: store.get('mode') === 'server',
      click: () => setMode('server'),
    },
    {
      label: 'Modo Cliente',
      type: 'radio',
      checked: store.get('mode') === 'client',
      click: () => setMode('client'),
    },
    {
      label: 'Automático',
      type: 'radio',
      checked: store.get('mode') === 'auto',
      click: () => setMode('auto'),
    },
    { type: 'separator' },
    {
      label: 'Estado de Sync',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Reiniciar Servidor',
      click: () => {
        stopServer();
        setTimeout(startServer, 1000);
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        isQuitting = true;
        stopServer();
        stopDiscovery();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('POS System');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setMode(mode) {
  store.set('mode', mode);
  // Reconfigure based on new mode
  app.emit('mode-changed', mode);
}

// ─── Determine target URL ────────────────────────────────────
async function getTargetURL() {
  const mode = store.get('mode');
  const port = store.get('serverPort') || 3000;

  if (mode === 'client') {
    const serverIP = store.get('serverIP');
    if (serverIP) {
      return `http://${serverIP}:${port}`;
    }
  }

  if (mode === 'auto') {
    // Try to discover a server first
    startDiscovery();
    // Wait 2 seconds for discovery
    await new Promise(resolve => setTimeout(resolve, 2000));
    stopDiscovery();

    if (discoveredServers.length > 0) {
      const server = discoveredServers[0];
      store.set('serverIP', server.ip);
      return `http://${server.ip}:${server.port}`;
    }
  }

  // Start as server
  startServer();
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  return `http://localhost:${port}`;
}

// ─── App lifecycle ───────────────────────────────────────────
app.whenReady().then(async () => {
  // Setup auto updater (only in packaged app)
  if (isPackaged) {
    setupAutoUpdater(mainWindow);
  }

  createTray();

  const url = await getTargetURL();
  createWindow(url);

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow(url);
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close — keep running in tray
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServer();
  stopDiscovery();
});

// ─── IPC handlers ────────────────────────────────────────────
const { ipcMain } = require('electron');

ipcMain.handle('get-config', () => {
  return store.store;
});

ipcMain.handle('set-config', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('get-discovered-servers', () => {
  return discoveredServers;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('restart-server', () => {
  stopServer();
  setTimeout(startServer, 1000);
  return true;
});
