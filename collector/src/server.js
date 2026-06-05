import { createServer } from 'node:http'

/**
 * Minimal HTTP API (no framework) exposing archived history to the frontend.
 *
 *   GET /history/range                       -> { min, max, count }
 *   GET /history/metrics?from=<ts>&to=<ts>   -> { down:[], up:[], conns:[], memory:[] }
 *   GET /history/logs?from=<ts>&to=<ts>&limit=<n> -> [{ ts, type, payload }, ...]
 *
 * Each metrics series is an array of { name: <ts>, value: <number> }, the
 * exact shape the frontend charts consume (see src/store/overview.ts).
 */
export function createHttpServer(db) {
  return createServer((req, res) => {
    // CORS: the frontend and collector are different origins.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' })
      return
    }

    const url = new URL(req.url, 'http://localhost')
    const now = Date.now()

    try {
      if (url.pathname === '/history/range') {
        sendJson(res, 200, db.range())
        return
      }

      if (url.pathname === '/history/metrics') {
        const from = intParam(url, 'from', 0)
        const to = intParam(url, 'to', now)
        sendJson(res, 200, db.queryMetrics(from, to))
        return
      }

      if (url.pathname === '/history/logs') {
        const from = intParam(url, 'from', 0)
        const to = intParam(url, 'to', now)
        const limit = Math.min(intParam(url, 'limit', 1000), 5000)
        sendJson(res, 200, db.queryLogs(from, to, limit))
        return
      }

      if (url.pathname === '/health') {
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'not found' })
    } catch (e) {
      console.error('[server] error:', e)
      sendJson(res, 500, { error: e.message })
    }
  })
}

function intParam(url, key, fallback) {
  const raw = url.searchParams.get(key)
  if (raw == null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(json)
}
