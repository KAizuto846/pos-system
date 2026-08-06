const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const INITIAL_CHECK_DELAY_MS = 10 * 1000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;
let activeOperation = null;
let checkTimeout = null;
let checkInterval = null;
let isInitialized = false;
let isUpdateDownloaded = false;
let lastReportedError = null;

function getDisabledReason() {
  if (!app.isPackaged) {
    return 'Las actualizaciones estan deshabilitadas fuera de la aplicacion empaquetada.';
  }
  if (process.platform !== 'win32') {
    return 'Las actualizaciones automaticas solo estan disponibles en Windows.';
  }
  return null;
}

function sendStatus(status) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send('update-status', status);
  }
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function reportError(error) {
  const normalizedError = normalizeError(error);
  const details = normalizedError.stack || normalizedError.message;

  if (details !== lastReportedError) {
    lastReportedError = details;
    log.error(`[Updater] ${details}`);
    sendStatus({
      type: 'error',
      message: normalizedError.message,
      stack: normalizedError.stack,
    });
  }

  return normalizedError;
}

function clearUpdaterTimers() {
  if (checkTimeout) {
    clearTimeout(checkTimeout);
    checkTimeout = null;
  }
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

function runScheduledCheck() {
  checkForUpdates().catch(reportError);
}

function setupAutoUpdater(win) {
  mainWindow = win;

  const disabledReason = getDisabledReason();
  if (disabledReason) {
    clearUpdaterTimers();
    log.info(`[Updater] ${disabledReason}`);
    return { enabled: false, reason: disabledReason };
  }

  if (isInitialized) {
    return { enabled: true };
  }
  isInitialized = true;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.forceDevUpdateConfig = false;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => {
    lastReportedError = null;
    log.info('[Updater] Checking for updates...');
    sendStatus({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`[Updater] Update available: ${info.version}`);
    sendStatus({
      type: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info(`[Updater] No update available. Current version: ${info.version}`);
    sendStatus({ type: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      type: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    isUpdateDownloaded = true;
    log.info(`[Updater] Update downloaded: ${info.version}`);
    sendStatus({ type: 'ready', version: info.version });
  });

  autoUpdater.on('error', (error) => {
    reportError(error);
  });

  clearUpdaterTimers();
  checkTimeout = setTimeout(() => {
    checkTimeout = null;
    runScheduledCheck();
  }, INITIAL_CHECK_DELAY_MS);
  checkInterval = setInterval(runScheduledCheck, CHECK_INTERVAL_MS);
  app.once('before-quit', clearUpdaterTimers);

  log.info('[Updater] Auto-updater initialized.');
  return { enabled: true };
}

async function performUpdateCheck() {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.downloadPromise) {
      await result.downloadPromise;
    }

    return {
      enabled: true,
      updateAvailable: Boolean(result?.isUpdateAvailable),
      status: isUpdateDownloaded
        ? 'ready'
        : result?.isUpdateAvailable
          ? 'available'
          : 'not-available',
      version: result?.updateInfo?.version,
    };
  } catch (error) {
    throw reportError(error);
  }
}

async function checkForUpdates() {
  const disabledReason = getDisabledReason();
  if (disabledReason) {
    return { enabled: false, reason: disabledReason };
  }
  if (!isInitialized) {
    throw reportError(new Error('El actualizador no ha sido inicializado.'));
  }

  if (activeOperation) {
    log.info('[Updater] An update operation is already active; reusing it.');
    return await activeOperation;
  }

  const operation = performUpdateCheck();
  activeOperation = operation;
  try {
    return await operation;
  } finally {
    if (activeOperation === operation) {
      activeOperation = null;
    }
  }
}

async function installUpdate() {
  try {
    const disabledReason = getDisabledReason();
    if (disabledReason) {
      throw new Error(disabledReason);
    }
    if (activeOperation) {
      await activeOperation;
    }
    if (!isUpdateDownloaded) {
      throw new Error('No hay una actualizacion descargada lista para instalar.');
    }

    log.info('[Updater] Restarting to install the downloaded update.');
    autoUpdater.quitAndInstall(false, true);
    return { installed: true };
  } catch (error) {
    throw reportError(error);
  }
}

module.exports = {
  setupAutoUpdater,
  checkForUpdates,
  installUpdate,
};
