const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),

  // Discovery
  getDiscoveredServers: () => ipcRenderer.invoke('get-discovered-servers'),
  getLastSyncResult: () => ipcRenderer.invoke('get-last-sync-result'),
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  copyFullDb: (peerUrl) => ipcRenderer.invoke('copy-full-db', peerUrl),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Network diagnostics (Windows)
  openDiagnostics: () => ipcRenderer.invoke('open-diagnostics'),
  openFirewall: () => ipcRenderer.invoke('open-firewall'),

  // Server
  restartServer: () => ipcRenderer.invoke('restart-server'),

  // Ticket printer (texto plano)
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printPlainText: (text, printerName) => ipcRenderer.invoke('print-plain-text', { text, printerName }),
  printDiagnostic: () => ipcRenderer.invoke('print-diagnostic'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
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
  saveFirstRunConfig: (mode, relayUrl, relaySecret, tailscaleOpts) =>
    ipcRenderer.send('first-run-config', mode, relayUrl, relaySecret, tailscaleOpts),
  onTailscaleProgress: (callback) => {
    const listener = (event, msg) => callback(msg);
    ipcRenderer.on('tailscale-progress', listener);
    return () => ipcRenderer.removeListener('tailscale-progress', listener);
  },

  // Tailscale (acceso remoto)
  getTailscaleStatus: () => ipcRenderer.invoke('tailscale-status'),
  setupTailscale: (opts) => ipcRenderer.invoke('tailscale-setup', opts),
  repairTailscale: (opts) => ipcRenderer.invoke('tailscale-repair', opts),
  setTailscaleFunnel: (enabled) => ipcRenderer.invoke('tailscale-funnel', enabled),
  disconnectTailscale: () => ipcRenderer.invoke('tailscale-off'),
});
