// Mock Mihomo kernel: serves traffic/memory/connections/logs WS endpoints.
// Used only for local self-testing of the collector. Not part of the service.
import { WebSocketServer } from 'ws'
import { createServer } from 'node:http'

const port = Number(process.env.MOCK_PORT || 9090)
const server = createServer()
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.endpoint = pathname.replace(/^\//, '')
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  const ep = ws.endpoint
  console.log(`[mock] client connected: ${ep}`)
  let n = 0
  const timer = setInterval(() => {
    n++
    let payload
    if (ep === 'traffic') payload = { down: 1000 + n * 10, up: 500 + n * 5 }
    else if (ep === 'memory') payload = { inuse: 50_000_000 + n * 1000, oslimit: 0 }
    else if (ep === 'connections')
      payload = { connections: Array.from({ length: n % 7 }, (_, i) => ({ id: i })), downloadTotal: n * 100, uploadTotal: n * 50 }
    else if (ep === 'logs') payload = { type: 'info', payload: `mock log line ${n}` }
    else return
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      /* noop */
    }
  }, 250)
  ws.on('close', () => {
    clearInterval(timer)
    console.log(`[mock] client closed: ${ep}`)
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock] kernel listening on ws://127.0.0.1:${port}`)
})
