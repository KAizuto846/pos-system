const { autoUpdater } = require('electron-updater');
const { dialog, Notification } = require('electron');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // Ask user first
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;

function setupAutoUpdater(win) {
  mainWindow = win;

  // Check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(e => {
      log.warn('Update check failed:', e.message);
    });
  }, 4 * 60 * 60 * 1000);

  // Check on startup
  autoUpdater.checkForUpdatesAndNotify().catch(e => {
    log.warn('Initial update check failed:', e.message);
  });

  // ── Events ──────────────────────────────────────────────

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);

    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }

    const dialogOpts = {
      type: 'info',
      buttons: ['Descargar Ahora', 'Después'],
      title: 'Actualización Disponible',
      message: `Versión ${info.version} disponible`,
      detail: 'Se ha encontrado una nueva versión del sistema POS. ¿Desea descargarla ahora?\n\nLos cambios se aplicarán al reiniciar la aplicación.',
    };

    dialog.showMessageBox(dialogOpts).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate().catch(e => {
          log.error('Download failed:', e.message);
          if (mainWindow) {
            mainWindow.webContents.send('update-error', e.message);
          }
        });
      }
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
    log.info(`Download progress: ${progressObj.percent}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);

    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }

    new Notification({
      title: 'Actualización Descargada',
      body: `POS System v${info.version} está lista. Se instalará al cerrar la app.`,
    }).show();

    const dialogOpts = {
      type: 'info',
      buttons: ['Reiniciar Ahora', 'Después'],
      title: 'Actualización Lista',
      message: 'La actualización se ha descargado.',
      detail: 'La nueva versión se instalará automáticamente al reiniciar la aplicación.',
    };

    dialog.showMessageBox(dialogOpts).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (error) => {
    log.error('Update error:', error.message);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', error.message);
    }
  });
}

// Export for manual check
function checkForUpdates() {
  autoUpdater.checkForUpdatesAndNotify().catch(e => {
    log.warn('Manual update check failed:', e.message);
  });
}

module.exports = { setupAutoUpdater, checkForUpdates };
