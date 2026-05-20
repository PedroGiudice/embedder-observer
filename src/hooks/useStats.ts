import { createSignal, onCleanup } from 'solid-js'

export interface DaemonStats {
  daemon_id: string
  model: string
  dim: number
  uptime_secs: number
  total_requests: number
  total_tokens: number
  throughput_now: number
  throughput_avg: number
  latency_p50_ms: number
  latency_p95_ms: number
  latency_p99_ms: number
  rss_mb: number
}

export function useStats(baseUrl: string, intervalMs = 2000) {
  const [stats, setStats] = createSignal<DaemonStats | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  async function poll() {
    try {
      const res = await fetch(`${baseUrl}/api/stats`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: DaemonStats = await res.json()
      setStats(data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'fetch error')
    }
  }

  poll()
  const timer = setInterval(poll, intervalMs)
  onCleanup(() => clearInterval(timer))

  return { stats, error }
}
