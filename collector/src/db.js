import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * SQLite storage layer for the collector.
 *
 * Two tables:
 *   metrics(ts, down, up, conns, memory) — one row per second (aggregated)
 *   logs(ts, type, payload)              — one row per kernel log line
 *
 * `ts` is a millisecond epoch timestamp, matching the frontend chart data
 * point shape `{ name: <ts>, value: <number> }` (see src/store/overview.ts).
 */
export class Db {
  constructor(dbPath) {
    // Ensure the parent directory exists before opening the database file.
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = new DatabaseSync(dbPath)
    // WAL improves concurrent read (HTTP queries) while writing.
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        ts     INTEGER NOT NULL,
        down   INTEGER,
        up     INTEGER,
        conns  INTEGER,
        memory INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts);

      CREATE TABLE IF NOT EXISTS logs (
        ts      INTEGER NOT NULL,
        type    TEXT,
        payload TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
    `)

    this._insertMetric = this.db.prepare(
      'INSERT INTO metrics (ts, down, up, conns, memory) VALUES (?, ?, ?, ?, ?)',
    )
    this._insertLog = this.db.prepare('INSERT INTO logs (ts, type, payload) VALUES (?, ?, ?)')
    this._deleteMetricsBefore = this.db.prepare('DELETE FROM metrics WHERE ts < ?')
    this._deleteLogsBefore = this.db.prepare('DELETE FROM logs WHERE ts < ?')
    this._metricsRange = this.db.prepare(
      'SELECT MIN(ts) AS min, MAX(ts) AS max, COUNT(*) AS count FROM metrics',
    )
  }

  /**
   * Insert one aggregated metrics row. Any field may be null if that
   * data stream hasn't reported within the aggregation window.
   */
  insertMetric({ ts, down, up, conns, memory }) {
    this._insertMetric.run(ts, nullable(down), nullable(up), nullable(conns), nullable(memory))
  }

  insertLog({ ts, type, payload }) {
    this._insertLog.run(ts, type ?? null, payload ?? null)
  }

  /**
   * Return metrics rows within [from, to] ordered by time, already shaped
   * into the per-series arrays the frontend charts consume directly.
   */
  queryMetrics(from, to) {
    const rows = this.db
      .prepare(
        'SELECT ts, down, up, conns, memory FROM metrics WHERE ts >= ? AND ts <= ? ORDER BY ts ASC',
      )
      .all(from, to)

    const down = []
    const up = []
    const conns = []
    const memory = []
    for (const r of rows) {
      if (r.down != null) down.push({ name: r.ts, value: r.down })
      if (r.up != null) up.push({ name: r.ts, value: r.up })
      if (r.conns != null) conns.push({ name: r.ts, value: r.conns })
      if (r.memory != null) memory.push({ name: r.ts, value: r.memory })
    }
    return { down, up, conns, memory }
  }

  queryLogs(from, to, limit = 1000) {
    return this.db
      .prepare(
        'SELECT ts, type, payload FROM logs WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?',
      )
      .all(from, to, limit)
  }

  range() {
    const r = this._metricsRange.get()
    return { min: r.min ?? null, max: r.max ?? null, count: r.count ?? 0 }
  }

  /** Delete metrics/logs older than the given retention thresholds. */
  prune(metricsBefore, logsBefore) {
    const m = this._deleteMetricsBefore.run(metricsBefore)
    const l = this._deleteLogsBefore.run(logsBefore)
    return { metrics: m.changes, logs: l.changes }
  }

  close() {
    this.db.close()
  }
}

function nullable(v) {
  return v === undefined || v === null ? null : v
}
