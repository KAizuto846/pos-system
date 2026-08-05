const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),

  // Discovery
  getDiscoveredServers: () => ipcRenderer.invoke('get-discovered-servers'),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Server
  restartServer: () => ipcRenderer.invoke('restart-server'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, status) => callback(status));
  },

  // Server status (loading screen)
  onServerLog: (callback) => {
    ipcRenderer.on('server-log', (event, msg) => callback(msg));
  },
  onServerReady: (callback) => {
    ipcRenderer.on('server-ready', () => callback());
  },
  onServerError: (callback) => {
    ipcRenderer.on('server-error', (event, msg) => callback(msg));
  },

  // Events from main process
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (event, url) => callback(url));
  },

  // First run setup
  saveFirstRunConfig: (mode) => ipcRenderer.send('first-run-config', mode),
});
