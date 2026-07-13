const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { dialog } = require("electron");

let mainWindow = null;
let isCheckingForUpdates = false;

function setupAutoUpdater(win) {
  mainWindow = win;

  // Configure electron-updater
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.forceDevUpdateConfig = false;

  // Disable signature verification for now (not signing builds)
  autoUpdater.disableWebInstaller = true;

  log.info("[Updater] Initializing auto-updater...");

  // Check for updates on startup, then every 4 hours
  setTimeout(() => {
    checkForUpdates();
  }, 10000); // Wait 10 seconds after startup

  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000); // Every 4 hours

  // Event handlers
  autoUpdater.on("checking-for-update", () => {
    isCheckingForUpdates = true;
    log.info("[Updater] Checking for updates...");
    sendToRenderer("update-status", { type: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    isCheckingForUpdates = false;
    log.info("[Updater] Update available:", info.version);
    sendToRenderer("update-status", {
      type: "available",
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    isCheckingForUpdates = false;
    log.info("[Updater] No updates available. Current version:", info.version);
    sendToRenderer("update-status", {
      type: "not-available",
      version: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    log.info(`[Updater] Download progress: ${percent}%`);
    sendToRenderer("update-status", {
      type: "downloading",
      percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    isCheckingForUpdates = false;
    log.info("[Updater] Update downloaded:", info.version);
    sendToRenderer("update-status", {
      type: "ready",
      version: info.version,
    });

    // Notify user and ask to restart
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Reiniciar ahora", "Mas tarde"],
        title: "Actualizacion lista",
        message: `Version ${info.version} descargada`,
        detail:
          "La actualizacion se instalara al reiniciar. Desea reiniciar ahora?",
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          // User chose to restart now
          log.info("[Updater] User chose to restart now");
          autoUpdater.quitAndInstall();
        } else {
          log.info("[Updater] User chose to restart later");
        }
      });
  });

  autoUpdater.on("error", (err) => {
    isCheckingForUpdates = false;
    log.error("[Updater] Error:", err.message);
    sendToRenderer("update-status", {
      type: "error",
      message: err.message,
    });
  });
}

function checkForUpdates() {
  if (isCheckingForUpdates) {
    log.info("[Updater] Already checking for updates, skipping...");
    return;
  }

  try {
    autoUpdater.checkForUpdates();
  } catch (err) {
    log.error("[Updater] Failed to check for updates:", err.message);
  }
}

function installUpdate() {
  log.info("[Updater] Installing update...");
  autoUpdater.quitAndInstall();
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

module.exports = {
  setupAutoUpdater,
  checkForUpdates,
  installUpdate,
};
