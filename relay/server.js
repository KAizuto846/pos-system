// POS System - Relay de sincronizacion central
// Buzon de cambios: los dispositivos hacen push/pull de su sync_log
// a traves de este servidor cuando no estan en la misma red local.
//
// Endpoints:
//   GET  /health                 -> { ok, time } (para el boton "Probar conexion")
//   POST /api/sync/pull          -> { deviceId, since } => cambios de OTROS devices
//   POST /api/sync/push          -> { deviceId, changes } => almacena cambios
//
// Seguridad: header "x-sync-secret" obligatorio (mismo valor en todos los
// dispositivos y en el relay). Ejecutar detras de Caddy/nginx con TLS.

const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = parseInt(process.env.PORT || '8080', 10);
const SYNC_SECRET = process.env.SYNC_SECRET || '';
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'relay.db');
const LOG_PATH = process.env.LOG_PATH || path.join(__dirname, 'relay.log');

if (!SYNC_SECRET) {
  console.error('[relay] ERROR: variable de entorno SYNC_SECRET requerida (misma que en los dispositivos).');
  process.exit(1);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch (e) {}
}

// ─── DB ──────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL,
    operation   TEXT NOT NULL,
    entity      TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    data        TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    sync_version INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS device_cursors (
    device_id   TEXT PRIMARY KEY,
    last_version INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_log_device_version
    ON sync_log (device_id, sync_version);
`);

// Limpieza: borra cambios que TODOS los dispositivos ya recibieron
// (sync_version <= minimo de los cursors conocidos).
function cleanupOldChanges() {
  try {
    const row = db.prepare('SELECT MIN(last_version) AS minVersion FROM device_cursors').get();
    if (row && row.minVersion > 0) {
      const res = db.prepare('DELETE FROM sync_log WHERE sync_version <= ?').run(row.minVersion);
      if (res.changes > 0) log(`[cleanup] Eliminados ${res.changes} cambios ya entregados a todos`);
    }
  } catch (e) {
    log('[cleanup] Error: ' + e.message);
  }
}

setInterval(cleanupOldChanges, 60 * 60 * 1000); // Cada hora

// ─── Auth ────────────────────────────────────────────────────
function checkSecret(req, res, next) {
  const secret = req.headers['x-sync-secret'];
  if (!secret || secret !== SYNC_SECRET) {
    return res.status(401).json({ error: 'No autorizado: x-sync-secret invalido' });
  }
  next();
}

// ─── App ─────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  const stats = db.prepare('SELECT COUNT(*) AS total FROM sync_log').get();
  res.json({ ok: true, time: new Date().toISOString(), storedChanges: stats.total });
});

app.post('/api/sync/pull', checkSecret, (req, res) => {
  try {
    const { deviceId, since = 0 } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'deviceId requerido' });

    const changes = db.prepare(
      `SELECT id, device_id AS deviceId, operation, entity, entity_id AS entityId,
              data, timestamp, sync_version AS syncVersion
       FROM sync_log
       WHERE device_id != ? AND sync_version > ?
       ORDER BY timestamp ASC
       LIMIT 500`
    ).all(String(deviceId), Number(since) || 0);

    // Track cursor del dispositivo (para limpieza)
    const maxVersion = changes.length > 0
      ? Math.max(...changes.map((c) => c.syncVersion))
      : Number(since) || 0;
    db.prepare(
      `INSERT INTO device_cursors (device_id, last_version) VALUES (?, ?)
       ON CONFLICT(device_id) DO UPDATE SET last_version = MAX(last_version, excluded.last_version)`
    ).run(String(deviceId), maxVersion);

    res.json({ deviceId: 'relay', changes });
  } catch (e) {
    log('[pull] Error: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sync/push', checkSecret, (req, res) => {
  try {
    const { deviceId, changes } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'deviceId requerido' });
    if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes debe ser un arreglo' });
    if (changes.length > 500) return res.status(400).json({ error: 'Maximo 500 cambios por push' });

    const insert = db.prepare(
      `INSERT OR IGNORE INTO sync_log (device_id, operation, entity, entity_id, data, timestamp, sync_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    let inserted = 0;
    const tx = db.transaction((list) => {
      for (const c of list) {
        const ts = c.timestamp instanceof Date ? c.timestamp.toISOString() : (c.timestamp || new Date().toISOString());
        const res2 = insert.run(
          String(deviceId),
          String(c.operation || 'UPDATE'),
          String(c.entity),
          Number(c.entityId),
          String(c.data || '{}'),
          String(ts),
          Number(c.syncVersion || Date.now())
        );
        if (res2.changes > 0) inserted++;
      }
    });
    tx(changes);

    log(`[push] ${deviceId} -> ${inserted} nuevos (${changes.length} recibidos)`);
    res.json({ ok: true, inserted });
  } catch (e) {
    log('[push] Error: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  log(`[relay] Escuchando en :${PORT} (DB: ${DB_PATH})`);
});
