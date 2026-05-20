import { createSignal, onCleanup } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { SOURCE_MAX } from '../config/daemons'

export interface EmbedEvent {
  uid: string
  ts: Date
  source: string
  tokens: number
  latency_ms: number
  preview: string
}

/** Compact form kept in the rolling buffer for client-side metric computation. */
export interface LiveSample {
  ts: number        // epoch ms
  latency_ms: number
  tokens: number
}

export interface SourceState {
  events: EmbedEvent[]
  eventCount: number
  lastEventTs: number
}

export interface SSEState {
  connected: boolean
  error: string | null
  sources: Record<string, SourceState>
  totalEvents: number
  /** Rolling time-window of recent samples across all sources.
   *  Used by useLiveMetrics to compute throughput/percentiles in real time
   *  without waiting on the 2s /api/stats poll. */
  liveBuffer: LiveSample[]
}

interface RawEvent {
  ts_ms: number
  daemon_id: string
  source: string
  tokens: number
  latency_ms: number
  chunk_preview: string
}

/** How far back the live buffer keeps samples (ms). 60s is plenty for
 *  computing stable p95/p99 at typical embedder load (≥10 evts/min). */
export const LIVE_BUFFER_WINDOW_MS = 60_000

/** How often we sweep the buffer for expired samples even when no event
 *  arrives. Keeps "tokens/s in last 30s" from going stale when traffic dies. */
const PRUNE_INTERVAL_MS = 1000

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function useSSE(baseUrl: string) {
  const [state, setState] = createStore<SSEState>({
    connected: false,
    error: null,
    sources: {},
    totalEvents: 0,
    liveBuffer: [],
  })
  const [, setReconnectAt] = createSignal(0)

  let es: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = 1000

  function pruneLiveBuffer() {
    const cutoff = Date.now() - LIVE_BUFFER_WINDOW_MS
    setState(
      produce((s) => {
        // find first index that's still in-window; slice everything before it.
        // buffer is push-on-arrival, so it's roughly ordered by ts.
        let i = 0
        while (i < s.liveBuffer.length && s.liveBuffer[i].ts < cutoff) i++
        if (i > 0) s.liveBuffer.splice(0, i)
      }),
    )
  }

  function connect() {
    if (es) { es.close(); es = null }

    try {
      es = new EventSource(`${baseUrl}/api/events`)
    } catch {
      setState('error', 'Failed to create EventSource')
      scheduleRetry()
      return
    }

    es.onopen = () => {
      setState('connected', true)
      setState('error', null)
      retryDelay = 1000
    }

    es.onmessage = (ev) => {
      try {
        const raw: RawEvent = JSON.parse(ev.data)
        const event: EmbedEvent = {
          uid: uid(),
          ts: new Date(raw.ts_ms),
          source: raw.source,
          tokens: raw.tokens,
          latency_ms: raw.latency_ms,
          preview: raw.chunk_preview,
        }
        const cutoff = Date.now() - LIVE_BUFFER_WINDOW_MS

        setState(
          produce((s) => {
            // 1. per-source state (unchanged)
            if (!s.sources[event.source]) {
              s.sources[event.source] = { events: [], eventCount: 0, lastEventTs: 0 }
            }
            const src = s.sources[event.source]
            src.events.unshift(event)
            if (src.events.length > SOURCE_MAX) src.events.length = SOURCE_MAX
            src.eventCount++
            src.lastEventTs = raw.ts_ms
            s.totalEvents++

            // 2. live buffer (new) — push + prune in one pass
            s.liveBuffer.push({ ts: raw.ts_ms, latency_ms: raw.latency_ms, tokens: raw.tokens })
            // prune expired from the head (cheap, since buffer is roughly sorted)
            let cut = 0
            while (cut < s.liveBuffer.length && s.liveBuffer[cut].ts < cutoff) cut++
            if (cut > 0) s.liveBuffer.splice(0, cut)
          }),
        )
      } catch {
        /* malformed event — ignore */
      }
    }

    es.onerror = () => {
      setState('connected', false)
      es?.close(); es = null
      scheduleRetry()
    }
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    setState('error', `Reconnecting in ${Math.round(retryDelay / 1000)}s…`)
    retryTimer = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, 30_000)
      setReconnectAt(Date.now())
      connect()
    }, retryDelay)
  }

  // tick the prune even when no events arrive — keeps the buffer from
  // holding stale 60s-old samples and reporting inflated rates.
  const pruneTimer = setInterval(pruneLiveBuffer, PRUNE_INTERVAL_MS)

  connect()

  onCleanup(() => {
    es?.close()
    if (retryTimer) clearTimeout(retryTimer)
    clearInterval(pruneTimer)
  })

  return state
}
