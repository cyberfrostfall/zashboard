import WebSocket from 'ws'

/**
 * Connects to the Mihomo/Clash kernel WebSocket endpoints and feeds data
 * into the database.
 *
 * Mirrors the frontend's connection logic (src/api/index.ts:269-314):
 *   - URL = ws(s)://host:port<secondaryPath>/<endpoint>?token=<password>
 *   - endpoints: traffic {down,up}, memory {inuse}, connections {...,connections:[]}, logs {type,payload}
 *
 * Metrics (traffic/memory/connections) arrive at different cadences, so we
 * keep the latest value of each in `current` and flush one aggregated row
 * per second. Logs are written as they arrive (rate-limited).
 */
export class Collector {
  constructor(backend, db, { maxLogsPerSecond = 50 } = {}) {
    this.backend = backend
    this.db = db
    this.maxLogsPerSecond = maxLogsPerSecond

    this.sockets = []
    this.stopped = false

    // Latest seen values; flushed once per second into a metrics row.
    this.current = { down: null, up: null, conns: null, memory: null }
    this.dirty = false

    // Per-second log counter for rate limiting.
    this._logSecond = 0
    this._logCount = 0
  }

  start() {
    this._connect('traffic', (msg) => {
      // { up, down } in bytes/sec
      if (typeof msg.down === 'number') this.current.down = msg.down
      if (typeof msg.up === 'number') this.current.up = msg.up
      this.dirty = true
    })

    this._connect('memory', (msg) => {
      // { inuse, oslimit }
      if (typeof msg.inuse === 'number' && msg.inuse > 0) {
        this.current.memory = msg.inuse
        this.dirty = true
      }
    })

    this._connect('connections', (msg) => {
      // { connections: [...], downloadTotal, uploadTotal, memory }
      const list = Array.isArray(msg.connections) ? msg.connections : []
      this.current.conns = list.length
      this.dirty = true
    })

    this._connect('logs', (msg) => {
      // { type, payload }
      if (!this._allowLog()) return
      this.db.insertLog({
        ts: Date.now(),
        type: msg.type ?? null,
        payload: msg.payload ?? null,
      })
    })

    // Flush an aggregated metrics row every second.
    this._flushTimer = setInterval(() => this._flush(), 1000)
  }

  _flush() {
    if (this.stopped || !this.dirty) return
    this.db.insertMetric({
      ts: Date.now(),
      down: this.current.down,
      up: this.current.up,
      conns: this.current.conns,
      memory: this.current.memory,
    })
    this.dirty = false
  }

  _allowLog() {
    const sec = Math.floor(Date.now() / 1000)
    if (sec !== this._logSecond) {
      this._logSecond = sec
      this._logCount = 0
    }
    if (this._logCount >= this.maxLogsPerSecond) return false
    this._logCount++
    return true
  }

  _buildUrl(endpoint) {
    const { protocol, host, port, secondaryPath, password } = this.backend
    const wsProtocol = protocol === 'https' ? 'wss' : 'ws'
    const base = `${wsProtocol}://${host}:${port}${secondaryPath || ''}`
    const url = new URL(`${base}/${endpoint}`)
    url.searchParams.append('token', password || '')
    return url.toString()
  }

  _connect(endpoint, onMessage) {
    if (this.stopped) return

    const url = this._buildUrl(endpoint)
    const ws = new WebSocket(url)
    this.sockets.push(ws)

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      try {
        onMessage(msg)
      } catch (e) {
        console.error(`[collector] handler error on ${endpoint}:`, e.message)
      }
    })

    ws.on('open', () => {
      console.log(`[collector] connected: ${endpoint}`)
    })

    const reconnect = () => {
      // Remove the dead socket and schedule a retry.
      this.sockets = this.sockets.filter((s) => s !== ws)
      if (this.stopped) return
      setTimeout(() => this._connect(endpoint, onMessage), 3000)
    }

    ws.on('close', () => {
      console.warn(`[collector] disconnected: ${endpoint}, retrying in 3s`)
      reconnect()
    })

    ws.on('error', (err) => {
      console.warn(`[collector] error on ${endpoint}: ${err.message}`)
      // 'close' will fire after 'error'; avoid double reconnect by only
      // closing here if it's still open.
      try {
        ws.close()
      } catch {
        /* noop */
      }
    })
  }

  stop() {
    this.stopped = true
    clearInterval(this._flushTimer)
    for (const ws of this.sockets) {
      try {
        ws.close()
      } catch {
        /* noop */
      }
    }
    this.sockets = []
  }
}
