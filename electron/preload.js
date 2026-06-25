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

  // Events from main process
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, error) => callback(error));
  },
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (event, url) => callback(url));
  },
});
