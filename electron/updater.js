const { dialog, Notification } = require('electron');
const https = require('https');
const { app } = require('electron');

// Simple GitHub release checker — no external deps needed
const REPO = 'KAizuto846/pos-system';
let mainWindow = null;

function setupAutoUpdater(win) {
  mainWindow = win;

  // Check every 4 hours
  checkForUpdates();
  setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
}

function checkForUpdates() {
  const currentVersion = app.getVersion();
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;

  https.get(url, { headers: { 'User-Agent': 'POS-System-Updater', 'Accept': 'application/vnd.github.v3+json' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const release = JSON.parse(data);
        if (!release.tag_name) return;

        const latestVersion = release.tag_name.replace('v', '');
        const current = currentVersion.replace('v', '');

        if (latestVersion !== current) {
          if (mainWindow) mainWindow.webContents.send('update-available', release);

          dialog.showMessageBox({
            type: 'info',
            buttons: ['Descargar', 'Despues'],
            title: 'Actualizacion Disponible',
            message: `Version ${release.tag_name} disponible`,
            detail: `Tu version: v${current}\nNueva version: ${release.tag_name}\n\nDescargala de:\nhttps://github.com/${REPO}/releases/latest`,
          }).then(({ response }) => {
            if (response === 0) {
              require('electron').shell.openExternal(`https://github.com/${REPO}/releases/latest`);
            }
          });
        }
      } catch (e) { /* ignore parse errors */ }
    });
  }).on('error', () => { /* ignore network errors */ });
}

module.exports = { setupAutoUpdater, checkForUpdates };
