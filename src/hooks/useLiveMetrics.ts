import { createSignal, createEffect, onCleanup } from 'solid-js'
import type { LiveSample } from './useSSE'

/* ============================================================
   useLiveMetrics
   ----------------------------------------------------------------
   Computes real-time metrics from the SSE live buffer + the polled
   /api/stats values, preferring client-side computation when there
   are enough samples to be meaningful.

   Why client-side?
   - /api/stats is polled every 2s → "throughput_now" can lag by
     up to 2s and is smoothed by the daemon's own averaging window.
   - Percentile bucketing on the daemon may use a different window
     than what's actually visible in the stream — leading to numbers
     that don't match what you see scrolling.
   - Computing p50/p95/p99 directly from per-event latencies, over
     the same window the user is looking at, makes the displayed
     percentile match the visible event rows exactly.

   How:
   - For each metric, expose two getters:
     - .live   → computed from buffer (null when buffer is sparse)
     - .api    → from /api/stats (always defined when stats arrived)
     - .value  → live if available, else api (fallback)
   - Throughput / tokens-per-sec computed over LIVE_WINDOW_MS rolling
     window (defaults to 30s — long enough to smooth, short enough
     to react). p50/p95/p99 use the full buffer (60s default).
   - RSS comes from stats only (not in SSE). Delta is computed from
     a small client-side history of polled RSS values.

   The hook does NOT own the buffer — it reads useSSE.liveBuffer
   reactively and uses a 250ms tick to recompute. (Recomputing on
   every push would be too expensive at high event rates.)
   ============================================================ */

export interface LiveMetricCell {
  /** Computed client-side from the SSE buffer. `null` when buffer
   *  has fewer than MIN_SAMPLES entries (avoids spurious values). */
  live: number | null
  /** Server-reported value from /api/stats. `null` before first poll. */
  api: number | null
  /** Convenience: live ?? api. Use this for display. */
  value: number | null
}

export interface LiveMetrics {
  throughput_chps: LiveMetricCell  // chunks per second
  tokens_per_sec:  LiveMetricCell
  p50_ms: LiveMetricCell
  p95_ms: LiveMetricCell
  p99_ms: LiveMetricCell
  rss_mb: LiveMetricCell           // .live always null — server-only signal
  rss_delta_5m_mb: number | null   // signed delta from 5min ago
}

interface StatsLike {
  throughput_now: number
  throughput_avg: number
  latency_p50_ms: number
  latency_p95_ms: number
  latency_p99_ms: number
  rss_mb: number
}

interface UseLiveMetricsOpts {
  /** Window in ms used for throughput rate computation. Default 30_000. */
  throughputWindowMs?: number
  /** Minimum samples for live percentiles. Below this we fall back to api. */
  minSamples?: number
  /** Tick interval for recomputation (ms). Default 250ms. */
  tickMs?: number
}

const DEFAULT_THROUGHPUT_WINDOW = 30_000
const DEFAULT_MIN_SAMPLES = 5
const DEFAULT_TICK = 250
const RSS_HISTORY_MS = 5 * 60_000  // 5 min window for RSS delta

/** Nearest-rank percentile on a sorted ascending array.
 *  Standard observability convention — matches what most metric
 *  libraries (Prometheus quantile, Histogram quantile) emit. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, idx))]
}

export function useLiveMetrics(
  buffer: () => readonly LiveSample[],
  stats: () => StatsLike | null,
  opts: UseLiveMetricsOpts = {},
) {
  const throughputWindow = opts.throughputWindowMs ?? DEFAULT_THROUGHPUT_WINDOW
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES
  const tickMs = opts.tickMs ?? DEFAULT_TICK

  const [metrics, setMetrics] = createSignal<LiveMetrics>({
    throughput_chps: { live: null, api: null, value: null },
    tokens_per_sec:  { live: null, api: null, value: null },
    p50_ms: { live: null, api: null, value: null },
    p95_ms: { live: null, api: null, value: null },
    p99_ms: { live: null, api: null, value: null },
    rss_mb: { live: null, api: null, value: null },
    rss_delta_5m_mb: null,
  })

  // Small history of (ts, rss_mb) for delta computation. Pruned to RSS_HISTORY_MS.
  const rssHistory: Array<{ ts: number; mb: number }> = []

  function recompute() {
    const now = Date.now()
    const buf = buffer()
    const s = stats()

    // Append the latest stats reading to RSS history (when stats changes)
    if (s != null) {
      const last = rssHistory[rssHistory.length - 1]
      if (!last || last.mb !== s.rss_mb || now - last.ts > 2000) {
        rssHistory.push({ ts: now, mb: s.rss_mb })
        const cutoff = now - RSS_HISTORY_MS
        while (rssHistory.length > 1 && rssHistory[0].ts < cutoff) rssHistory.shift()
      }
    }

    // === Throughput & tokens/s — rate over throughputWindow ===
    const winCutoff = now - throughputWindow
    let inWindow = 0
    let tokensSum = 0
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].ts < winCutoff) break
      inWindow++
      tokensSum += buf[i].tokens
    }
    const windowSec = throughputWindow / 1000

    const throughputLive = inWindow >= minSamples ? inWindow / windowSec : null
    const tokensPerSecLive = inWindow >= minSamples ? tokensSum / windowSec : null

    // === Percentiles — use full buffer (60s default) ===
    let p50Live: number | null = null
    let p95Live: number | null = null
    let p99Live: number | null = null
    if (buf.length >= minSamples) {
      const sorted = buf.map((x) => x.latency_ms).sort((a, b) => a - b)
      p50Live = percentile(sorted, 50)
      p95Live = percentile(sorted, 95)
      p99Live = percentile(sorted, 99)
    }

    // === RSS delta over 5 minutes (server-only signal, polled) ===
    let rssDelta: number | null = null
    if (s != null && rssHistory.length >= 2) {
      const oldest = rssHistory[0]
      rssDelta = s.rss_mb - oldest.mb
    }

    setMetrics({
      throughput_chps: {
        live: throughputLive,
        api: s?.throughput_now ?? null,
        value: throughputLive ?? s?.throughput_now ?? null,
      },
      tokens_per_sec: {
        live: tokensPerSecLive,
        api: null,  // /api/stats doesn't expose this
        value: tokensPerSecLive,
      },
      p50_ms: { live: p50Live, api: s?.latency_p50_ms ?? null, value: p50Live ?? s?.latency_p50_ms ?? null },
      p95_ms: { live: p95Live, api: s?.latency_p95_ms ?? null, value: p95Live ?? s?.latency_p95_ms ?? null },
      p99_ms: { live: p99Live, api: s?.latency_p99_ms ?? null, value: p99Live ?? s?.latency_p99_ms ?? null },
      rss_mb: { live: null, api: s?.rss_mb ?? null, value: s?.rss_mb ?? null },
      rss_delta_5m_mb: rssDelta,
    })
  }

  // Initial compute + ticker
  recompute()
  const timer = setInterval(recompute, tickMs)
  onCleanup(() => clearInterval(timer))

  // Also recompute whenever stats() changes (the 2s poll). This makes
  // RSS update on the poll cadence even between ticker ticks.
  createEffect(() => {
    void stats()
    recompute()
  })

  return metrics
}
