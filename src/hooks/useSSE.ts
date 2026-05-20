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

export interface SourceState {
  events: EmbedEvent[]
  eventCount: number
  lastEventTs: number  // epoch ms — para trigger do pulse
}

export interface SSEState {
  connected: boolean
  error: string | null
  sources: Record<string, SourceState>
  totalEvents: number
}

// Formato real do TelemetryEvent do embedder-d
interface RawEvent {
  ts_ms: number
  daemon_id: string
  source: string
  tokens: number
  latency_ms: number
  chunk_preview: string
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function useSSE(baseUrl: string) {
  const [state, setState] = createStore<SSEState>({
    connected: false,
    error: null,
    sources: {},
    totalEvents: 0,
  })
  const [, setReconnectAt] = createSignal(0)

  let es: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = 1000

  function connect() {
    if (es) {
      es.close()
      es = null
    }

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

        setState(
          produce((s) => {
            if (!s.sources[event.source]) {
              s.sources[event.source] = {
                events: [],
                eventCount: 0,
                lastEventTs: 0,
              }
            }
            const src = s.sources[event.source]
            src.events.unshift(event)
            if (src.events.length > SOURCE_MAX) src.events.length = SOURCE_MAX
            src.eventCount++
            src.lastEventTs = raw.ts_ms
            s.totalEvents++
          }),
        )
      } catch {
        // evento malformado — ignorar
      }
    }

    es.onerror = () => {
      setState('connected', false)
      es?.close()
      es = null
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

  // Conectar imediatamente
  connect()

  onCleanup(() => {
    es?.close()
    if (retryTimer) clearTimeout(retryTimer)
  })

  return state
}
