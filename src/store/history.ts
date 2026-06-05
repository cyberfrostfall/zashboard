import { useStorage } from '@vueuse/core'
import { ref } from 'vue'

/**
 * State and data access for the History (archived monitoring) page.
 *
 * Data is served by the standalone collector service (see /collector),
 * which archives traffic/memory/connections/logs into SQLite even when no
 * browser tab is open. We fetch it over plain HTTP.
 */

export type MetricPoint = { name: number; value: number }
export type HistoryMetrics = {
  down: MetricPoint[]
  up: MetricPoint[]
  conns: MetricPoint[]
  memory: MetricPoint[]
}
export type HistoryLog = { ts: number; type: string | null; payload: string | null }
export type HistoryRange = { min: number | null; max: number | null; count: number }

// Collector base URL. In dev, '/collector' is proxied by vite (see vite.config.ts).
// In production, point this at the collector's HTTP address.
export const collectorBaseUrl = useStorage<string>(
  'history/collector-base-url',
  import.meta.env.DEV ? '/collector' : 'http://127.0.0.1:8788',
)

// Selected look-back window in milliseconds (default: last 1 hour).
export const rangeMs = useStorage<number>('history/range-ms', 60 * 60 * 1000)

export const loading = ref(false)
export const reachable = ref(true)

export const metrics = ref<HistoryMetrics>({ down: [], up: [], conns: [], memory: [] })
export const logs = ref<HistoryLog[]>([])
export const dataRange = ref<HistoryRange>({ min: null, max: null, count: 0 })

const trimBase = (url: string) => url.replace(/\/+$/, '')

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${trimBase(collectorBaseUrl.value)}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Fetch metrics, logs and range for the currently selected window. */
export async function loadHistory() {
  loading.value = true
  try {
    const to = Date.now()
    const from = to - rangeMs.value

    const [m, l, r] = await Promise.all([
      getJson<HistoryMetrics>(`/history/metrics?from=${from}&to=${to}`),
      getJson<HistoryLog[]>(`/history/logs?from=${from}&to=${to}&limit=1000`),
      getJson<HistoryRange>(`/history/range`),
    ])

    metrics.value = m
    logs.value = l
    dataRange.value = r
    reachable.value = true
  } catch {
    reachable.value = false
    metrics.value = { down: [], up: [], conns: [], memory: [] }
    logs.value = []
  } finally {
    loading.value = false
  }
}
