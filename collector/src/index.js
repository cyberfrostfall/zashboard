import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Collector } from './collector.js'
import { Db } from './db.js'
import { createHttpServer } from './server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// --- Load config ---
const configPath = process.env.COLLECTOR_CONFIG || resolve(root, 'config.json')
const config = JSON.parse(readFileSync(configPath, 'utf-8'))

const {
  backend,
  retentionMs = 2 * 60 * 60 * 1000,
  logRetentionMs = retentionMs,
  port = 8788,
  bindHost = '127.0.0.1',
  dbPath = './data/metrics.db',
  maxLogsPerSecond = 50,
} = config

// Resolve dbPath relative to the collector root if it isn't absolute.
const resolvedDbPath = resolve(root, dbPath)

// --- Wire up storage, collector, server ---
const db = new Db(resolvedDbPath)
const collector = new Collector(backend, db, { maxLogsPerSecond })
collector.start()

// Prune old data once a minute.
const pruneTimer = setInterval(() => {
  const now = Date.now()
  const { metrics, logs } = db.prune(now - retentionMs, now - logRetentionMs)
  if (metrics || logs) {
    console.log(`[prune] removed ${metrics} metrics, ${logs} logs`)
  }
}, 60 * 1000)

const server = createHttpServer(db)
server.listen(port, bindHost, () => {
  console.log(`[server] history API on http://${bindHost}:${port}`)
  console.log(
    `[collector] target ${backend.protocol}://${backend.host}:${backend.port}${backend.secondaryPath || ''}, retention ${Math.round(retentionMs / 60000)} min`,
  )
})

// --- Graceful shutdown ---
function shutdown(signal) {
  console.log(`\n[main] ${signal} received, shutting down...`)
  clearInterval(pruneTimer)
  collector.stop()
  server.close()
  db.close()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
